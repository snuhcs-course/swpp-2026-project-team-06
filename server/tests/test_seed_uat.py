"""DEV-305: UAT 데이터 명령(app.core.seed_uat)과 UAT 테스트 계정 로그인.

테스트 DB는 매번 데모 시드 위에서 시작하고 시계는 2026-10-07(KST)로 고정된다(conftest).
"""

from datetime import date

import pytest
from sqlalchemy import func, select

from app.accounts.models import ShippingAddress, User
from app.admin import retire_test_farm
from app.admin.models import ManagerEvent
from app.admin.retire_test_farm import RETIRE_REASON, is_retired
from app.catalog.models import Product, ProductOption, Stage, StageAllocation, StagePrice
from app.core import config, seed_uat
from app.core.db import Base, get_sessionmaker
from app.farms.models import Farm
from app.messaging.models import SupportThread, Thread, ThreadMessage
from app.messaging.support import consumer_thread_id, support_thread_id
from app.orders.models import Order

CONSUMERS = ["u-uat-c1", "u-uat-c2", "u-uat-c3"]
PRODUCERS = ["u-uat-p1", "u-uat-p2", "u-uat-p3"]
UAT_PRODUCTS = ["p-uat-1a", "p-uat-1b", "p-uat-2a"]
BASE = date(2026, 10, 7)


def table_counts() -> dict[str, int]:
    with get_sessionmaker()() as db:
        return {
            t.name: db.scalar(select(func.count()).select_from(t))
            for t in Base.metadata.sorted_tables
        }


def accounts(client, app: str):
    return client.get("/api/auth/test-accounts", params={"app": app})


def test_DEV_305_dry_run_inserts_nothing(capsys):
    before = table_counts()

    seed_uat.main([])

    assert table_counts() == before
    out = capsys.readouterr().out
    assert "미리보기라 넣지 않았어요" in out
    assert "u-uat-c1 UAT 소비자 1" in out
    assert "p-uat-1a" in out and "f-uat-3 UAT 농가 3 제주 남원 PENDING" in out
    assert "f-uat-1 UAT 농가 1 제주 서귀포 APPROVED → 테스트 농가 숨김(SUSPENDED)" in out
    assert "--restore --commit" in out
    # 시드에 운영팀 계정(u-farmclub)이 이미 있으니 새로 만든다는 줄이 없다
    assert "u-farmclub" not in out


def test_DEV_305_commit_inserts_uat_accounts_farms_and_products(capsys):
    before = table_counts()

    seed_uat.main(["--commit"])

    assert "넣었어요" in capsys.readouterr().out
    after = table_counts()
    assert after["users"] - before["users"] == 6
    assert after["farms"] - before["farms"] == 3
    assert after["products"] - before["products"] == 3
    assert after["shipping_addresses"] - before["shipping_addresses"] == 3
    assert after["orders"] == before["orders"]
    with get_sessionmaker()() as db:
        users = {u.id: u for u in db.scalars(select(User).where(User.id.like("u-uat-%")))}
        assert set(users) == set(CONSUMERS + PRODUCERS)
        assert all(u.is_test_account and not u.ops_tester for u in users.values())
        assert all(u.name.startswith("UAT ") for u in users.values())
        assert [users[c].role for c in CONSUMERS] == ["CONSUMER"] * 3
        assert [users[p].role for p in PRODUCERS] == ["PRODUCER"] * 3
        assert all(users[c].nickname and users[c].phone for c in CONSUMERS)

        farms = {f.id: f for f in db.scalars(select(Farm).where(Farm.id.like("f-uat-%")))}
        # 승인 농가는 '테스트 농가 숨김'(DEV-93)으로 넣는다(PM 결정 11/10)
        assert {f: farms[f].approval_status for f in farms} == {
            "f-uat-1": "SUSPENDED",
            "f-uat-2": "SUSPENDED",
            "f-uat-3": "PENDING",
        }
        assert all(is_retired(farms[f]) for f in ("f-uat-1", "f-uat-2"))
        assert farms["f-uat-3"].suspend_reason is None
        events = list(
            db.scalars(
                select(ManagerEvent).where(ManagerEvent.target_id.in_(["f-uat-1", "f-uat-2"]))
            )
        )
        assert sorted((e.target_id, e.event_type) for e in events) == [
            ("f-uat-1", "test_farm_retired"),
            ("f-uat-2", "test_farm_retired"),
        ]
        assert [farms[f].producer_id for f in sorted(farms)] == PRODUCERS
        assert all(farms[f].name.startswith("UAT 농가") for f in farms)
        # 승인 농가는 입금 계좌가 있어야 주문 안내가 된다
        assert all(farms[f].account_number for f in ("f-uat-1", "f-uat-2"))
        assert farms["f-uat-3"].decided_at is None

        products = {p.id: p for p in db.scalars(select(Product).where(Product.id.like("p-uat-%")))}
        assert set(products) == set(UAT_PRODUCTS)
        assert {p.farm_id for p in products.values()} == {"f-uat-1", "f-uat-2"}
        for p in products.values():
            assert p.status == "PUBLISHED" and not p.sales_paused
            assert p.approved_supply_grams == p.sales_limit_grams > 0
            assert "강씨네" not in str(p.info)  # 시드 상품 정보(KANG_INFO)를 물려받지 않는다
            options = {
                o.id: o
                for o in db.scalars(select(ProductOption).where(ProductOption.product_id == p.id))
            }
            stages = list(
                db.scalars(select(Stage).where(Stage.product_id == p.id).order_by(Stage.seq))
            )
            assert len(stages) == 2
            # 기간은 실행한 날(고정 시계 10/7)부터 빈틈없이 이어지고 받는 시기 전에 끝난다
            assert stages[0].starts_at == BASE
            assert (stages[1].starts_at - stages[0].ends_at).days == 1
            assert stages[-1].ends_at < p.delivery_start <= p.delivery_end <= p.max_delay_until
            total_grams = 0
            for stage in stages:
                allocations = list(
                    db.scalars(select(StageAllocation).where(StageAllocation.stage_id == stage.id))
                )
                prices = list(db.scalars(select(StagePrice).where(StagePrice.stage_id == stage.id)))
                assert {a.option_id for a in allocations} == set(options)
                assert {pr.option_id for pr in prices} == set(options)
                assert all(a.reserved_count == 0 and a.quantity > 0 for a in allocations)
                total_grams += sum(
                    a.quantity * round(options[a.option_id].weight_kg * 1000) for a in allocations
                )
            assert total_grams <= p.approved_supply_grams
        assert {
            o.label
            for o in db.scalars(select(ProductOption).where(ProductOption.product_id == "p-uat-1a"))
        } == {"5kg", "10kg"}

        assert (
            db.scalar(
                select(func.count()).select_from(Order).where(Order.product_id.like("p-uat-%"))
            )
            == 0
        )
        addresses = list(
            db.scalars(select(ShippingAddress).where(ShippingAddress.user_id.like("u-uat-%")))
        )
        assert sorted(a.user_id for a in addresses) == CONSUMERS
        assert all(a.is_default for a in addresses)
        # 문의방: 승인 농가 2곳(환영 메시지 1개씩)과 소비자 3명. 확인 중 농가는 열지 않는다
        for farm_id in ("f-uat-1", "f-uat-2"):
            thread = db.get(Thread, support_thread_id(farm_id))
            assert thread is not None
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(ThreadMessage)
                    .where(ThreadMessage.thread_id == thread.id)
                )
                == 1
            )
        assert db.get(Thread, support_thread_id("f-uat-3")) is None
        uat_threads = select(func.count()).select_from(Thread).where(Thread.farm_id.like("f-uat-%"))
        assert db.scalar(uat_threads) == 2
        for consumer in CONSUMERS:
            support = db.get(SupportThread, consumer_thread_id(consumer))
            assert support is not None and support.user_id == consumer


def test_DEV_305_second_run_is_refused():
    seed_uat.main(["--commit"])
    before = table_counts()

    for argv in ([], ["--commit"]):
        with pytest.raises(SystemExit) as refused:
            seed_uat.main(argv)
        assert "이미 있어요 (표지 계정)" in str(refused.value.code)

    assert table_counts() == before


def test_DEV_305_partial_leftover_is_refused():
    """표지 계정이 없어도 UAT ID가 하나라도 남아 있으면 넣지 않는다."""
    with get_sessionmaker()() as db, db.begin():
        db.add(User(id="u-uat-p2", name="UAT 생산자 2", role="PRODUCER", created_at=BASE))
    before = table_counts()

    with pytest.raises(SystemExit) as refused:
        seed_uat.main(["--commit"])

    assert "u-uat-p2" in str(refused.value.code)
    assert "표지 계정" not in str(refused.value.code)
    assert table_counts() == before


def test_DEV_305_unknown_option_is_refused():
    before = table_counts()

    with pytest.raises(SystemExit) as refused:
        seed_uat.main(["--comit"])

    assert "사용법" in str(refused.value.code)
    assert table_counts() == before


def test_DEV_305_test_accounts_list_uat_only_when_seeded_and_mock_login_on(client, monkeypatch):
    # UAT 데이터가 없으면 목록은 시드 계정 그대로(로컬·CI 영향 없음)
    assert [a["userId"] for a in accounts(client, "consumer").json()] == ["u-minji", "u-seojun"]

    seed_uat.main(["--commit"])

    consumer = accounts(client, "consumer").json()
    producer = accounts(client, "producer").json()
    assert [a["userId"] for a in consumer] == ["u-minji", "u-seojun", *CONSUMERS]
    assert {a["role"] for a in consumer} == {"CONSUMER"}
    uat = [a for a in producer if a["userId"].startswith("u-uat-")]
    assert [(a["userId"], a["farmName"], a["farmStatus"]) for a in uat] == [
        ("u-uat-p1", "UAT 농가 1", "SUSPENDED"),
        ("u-uat-p2", "UAT 농가 2", "SUSPENDED"),
        ("u-uat-p3", "UAT 농가 3", "PENDING"),
    ]
    assert {a["role"] for a in producer} == {"PRODUCER"}

    monkeypatch.setattr(config.get_settings(), "mock_login_enabled", False)
    assert accounts(client, "consumer").status_code == 404
    assert accounts(client, "producer").status_code == 404
    login = client.post("/api/auth/test-login", json={"userId": "u-uat-c1", "app": "consumer"})
    assert login.status_code == 404


def test_DEV_305_uat_login_keeps_apps_apart_and_skips_onboarding(client, login):
    seed_uat.main(["--commit"])

    for consumer in CONSUMERS:
        wrong = client.post("/api/auth/test-login", json={"userId": consumer, "app": "producer"})
        assert wrong.status_code == 403
        assert wrong.json()["details"] == {"reason": "WRONG_APP"}
    wrong = client.post("/api/auth/test-login", json={"userId": "u-uat-p1", "app": "consumer"})
    assert wrong.status_code == 403

    headers = login("u-uat-c1", "consumer")
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["needsOnboarding"] is False and me["consentRequired"] is False
    assert me["nickname"] == "UAT소비자1"
    addresses = client.get("/api/auth/me/addresses", headers=headers).json()
    assert [a["isDefault"] for a in addresses] == [True]

    # 숨김 상태로 넣었으니 공개 목록·상세에 없다
    farm_ids = {f["farmId"] for f in client.get("/api/farms").json()["items"]}
    assert not farm_ids & {"f-uat-1", "f-uat-2", "f-uat-3"}
    assert client.get("/api/products/p-uat-1a", headers=headers).status_code == 404
    # 숨김 상태의 UAT 생산자는 정지 안내(숨김 사유)를 본다
    hidden = client.get("/api/auth/me", headers=login("u-uat-p1", "producer")).json()
    assert (hidden["farmId"], hidden["farmStatus"]) == ("f-uat-1", "SUSPENDED")
    assert hidden["suspendReason"] == RETIRE_REASON
    assert hidden["consentRequired"] is False

    # UAT 시작: 다시 공개(관리자 웹 '다시 공개'와 같은 restore_in)
    for farm_id in ("f-uat-1", "f-uat-2"):
        retire_test_farm.restore(farm_id, commit=True)
    farm_ids = {f["farmId"] for f in client.get("/api/farms").json()["items"]}
    assert {"f-uat-1", "f-uat-2"} <= farm_ids and "f-uat-3" not in farm_ids
    # 온보딩·동의 관문이 있는 쓰기도 바로 된다
    assert client.put("/api/farms/f-uat-1/follow", headers=headers).status_code == 200
    product = client.get("/api/products/p-uat-1a", headers=headers)
    assert product.status_code == 200, product.text
    assert product.json()["currentStageId"] == "st-uat-1a-1"

    producer = client.get("/api/auth/me", headers=login("u-uat-p1", "producer")).json()
    assert (producer["farmId"], producer["farmStatus"]) == ("f-uat-1", "APPROVED")
    mine = client.get("/api/products/mine", headers=login("u-uat-p1", "producer"))
    assert mine.status_code == 200, mine.text
    assert {p["productId"] for p in mine.json()["items"]} == {"p-uat-1a", "p-uat-1b"}
    pending = client.get("/api/auth/me", headers=login("u-uat-p3", "producer")).json()
    assert pending["farmStatus"] == "PENDING"
