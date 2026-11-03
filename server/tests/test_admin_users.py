"""DEV-107 관리자 페이지 사용자 목록·검색과 운영 검증 계정 표시."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.accounts.models import User
from app.admin.models import ManagerEvent
from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.orders.models import Order


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def add_kakao_consumer(uid: str = "u-kakao-hyun") -> str:
    with get_sessionmaker()() as session, session.begin():
        session.add(
            User(
                id=uid,
                kakao_id=f"k-{uid}",
                role="CONSUMER",
                name="박현",
                nickname="UT현",
                phone="010-1234-5678",
                created_at=datetime(2026, 10, 6, tzinfo=UTC),
            )
        )
    return uid


def user_flags(uid: str) -> tuple[bool, bool]:
    with get_sessionmaker()() as session:
        user = session.get(User, uid)
        return user.is_test_account, user.ops_tester


def user_events(uid: str) -> list[ManagerEvent]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(ManagerEvent)
                .where(ManagerEvent.target_type == "user", ManagerEvent.target_id == uid)
                .order_by(ManagerEvent.created_at)
            )
        )


def real_buyers_of(farm_id: str) -> list[str]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(Order.consumer_id)
                .join(Product, Product.id == Order.product_id)
                .join(User, User.id == Order.consumer_id)
                .where(Product.farm_id == farm_id, User.is_test_account.is_(False))
                .distinct()
            )
        )


def test_DEV_107_admin_only(client, login):
    for method, path in [
        ("get", "/admin/users"),
        ("post", "/admin/users/u-minji/mark-tester"),
        ("post", "/admin/users/u-minji/unmark-tester"),
    ]:
        assert getattr(client, method)(path, headers=key()).status_code == 401, path
        response = getattr(client, method)(path, headers=login("u-minji") | key())
        assert response.status_code == 403, path


def test_DEV_107_list_hides_admin_and_shows_signup_and_last4(client, admin_headers):
    add_kakao_consumer()
    page = client.get("/admin/users", headers=admin_headers).json()
    by_id = {u["userId"]: u for u in page["items"]}
    assert "u-admin" not in by_id
    assert page["total"] >= len(page["items"])
    hyun = by_id["u-kakao-hyun"]
    assert hyun["signup"] == "KAKAO" and hyun["phoneLast4"] == "5678"
    assert hyun["isTestAccount"] is False and hyun["opsTester"] is False
    assert "phone" not in hyun  # 전체 번호는 내보내지 않는다
    assert page["items"][0]["userId"] == "u-kakao-hyun"  # 가입 최신순
    kang = by_id["u-kang"]
    assert kang["signup"] == "SEED" and kang["farmId"] == "f-kang"
    assert kang["farmStatus"] == "APPROVED"


def test_DEV_107_search_and_filters(client, admin_headers):
    add_kakao_consumer()

    def ids(**params):
        page = client.get("/admin/users", headers=admin_headers, params=params).json()
        return {u["userId"] for u in page["items"]}

    assert ids(q="UT현") == {"u-kakao-hyun"}  # 닉네임
    assert ids(q="5678") == {"u-kakao-hyun"}  # 전화 끝자리
    assert "u-kang" in ids(q="강씨네")  # 농가 이름
    assert ids(q="%") == set()  # 와일드카드는 글자로 본다
    assert all(i.startswith("u-") for i in ids(role="PRODUCER"))
    assert "u-kakao-hyun" not in ids(role="PRODUCER")
    assert "u-kakao-hyun" in ids(kind="real") and "u-minji" not in ids(kind="real")
    assert "u-minji" in ids(kind="test")
    bad = client.get("/admin/users", headers=admin_headers, params={"role": "ADMIN"})
    assert bad.status_code == 400


def test_DEV_107_mark_and_unmark_with_audit(client, admin_headers):
    uid = add_kakao_consumer()
    done = client.post(f"/admin/users/{uid}/mark-tester", headers=admin_headers | key())
    assert done.status_code == 200, done.text
    assert done.json()["opsTester"] is True
    assert user_flags(uid) == (False, True)  # Mock 로그인 대상(is_test_account)은 그대로
    page = client.get("/admin/users", headers=admin_headers, params={"kind": "test"}).json()
    assert uid in {u["userId"] for u in page["items"]}

    back = client.post(f"/admin/users/{uid}/unmark-tester", headers=admin_headers | key())
    assert back.status_code == 200 and back.json()["opsTester"] is False
    assert user_flags(uid) == (False, False)
    # 시계가 고정이라 created_at이 같다 → 순서 대신 집합으로 본다
    assert sorted((e.event_type, e.actor_id, e.status) for e in user_events(uid)) == [
        ("ops_tester.mark", "u-admin", "SUCCEEDED"),
        ("ops_tester.unmark", "u-admin", "SUCCEEDED"),
    ]


def test_DEV_107_same_key_runs_once_and_key_required(client, admin_headers):
    uid = add_kakao_consumer()
    same = admin_headers | key()
    first = client.post(f"/admin/users/{uid}/mark-tester", headers=same)
    again = client.post(f"/admin/users/{uid}/mark-tester", headers=same)
    assert first.status_code == again.status_code == 200
    assert first.json() == again.json()
    assert len(user_events(uid)) == 1
    assert client.post(f"/admin/users/{uid}/mark-tester", headers=admin_headers).status_code == 400


def test_DEV_107_refuses_admin_seed_test_and_unknown(client, admin_headers):
    admin = client.post("/admin/users/u-admin/mark-tester", headers=admin_headers | key())
    assert admin.status_code == 409
    assert admin.json()["details"]["reason"] == "ADMIN_ACCOUNT"
    seed = client.post("/admin/users/u-minji/mark-tester", headers=admin_headers | key())
    assert seed.status_code == 409
    assert seed.json()["details"]["reason"] == "SEED_TEST_ACCOUNT"
    assert user_flags("u-minji") == (True, False)
    assert [(e.event_type, e.status) for e in user_events("u-minji")] == [
        ("ops_tester.mark", "REJECTED")
    ]
    missing = client.post("/admin/users/u-404/mark-tester", headers=admin_headers | key())
    assert missing.status_code == 404


def test_DEV_107_marked_buyers_let_test_farm_be_hidden(client, admin_headers):
    # 시드 f-kang에는 테스트 계정이 아닌 구매자 주문이 있어 숨기기가 거부된다(DEV-93·98)
    preview = client.get("/admin/farms/f-kang/preview", headers=admin_headers).json()
    assert "실사용자 주문" in preview["refusal"]

    for uid in real_buyers_of("f-kang"):
        marked = client.post(f"/admin/users/{uid}/mark-tester", headers=admin_headers | key())
        assert marked.status_code == 200, marked.text

    preview = client.get("/admin/farms/f-kang/preview", headers=admin_headers).json()
    assert preview["refusal"] is None
    done = client.post("/admin/farms/f-kang/retire", headers=admin_headers | key())
    assert done.status_code == 200 and done.json()["hidden"] is True


def test_DEV_107_ops_tester_does_not_open_mock_login(client, admin_headers):
    uid = add_kakao_consumer()
    client.post(f"/admin/users/{uid}/mark-tester", headers=admin_headers | key())
    response = client.post("/api/auth/test-login", json={"userId": uid, "app": "consumer"})
    assert response.status_code == 404
