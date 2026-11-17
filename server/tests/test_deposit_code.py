"""DEV-342: 짧은 입금자명(FEAT-09 AC-09-11~13, R-28), 운영자 입금자명 찾기,
생산자가 자기 농가 주문으로 대화 시작(FEAT-12 AC-12-17),
팔로우하지 않은 구매자도 그 대화를 봄(AC-12-18)."""

import importlib.util
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select, update

from app.accounts.models import User
from app.catalog.models import StageAllocation
from app.core.db import get_sessionmaker
from app.messaging.models import Thread
from app.orders import deposit_code
from app.orders.models import Order
from tests.test_orders import deposit, key, order_body


def _set_user(user_id: str, **values) -> None:
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(User).where(User.id == user_id).values(**values))


@pytest.fixture(autouse=True)
def _nicknames(seeded):
    """입금자명 이름은 닉네임 앞 3글자(PM 11/17). 시드 테스트 계정에는 닉네임이 없어 넣어 둔다."""
    _set_user("u-minji", nickname="김민지")
    _set_user("u-seojun", nickname="이서준")


def _awaiting(client, headers, **overrides) -> dict:
    """입금 대기 주문. 입금자명 이름은 주문자 닉네임 앞 3글자라 받는 사람은 상관없다."""
    body = order_body(**({"recipientName": "김민지"} | overrides))
    created = client.post("/api/orders", headers=headers | key(), json=body)
    assert created.status_code == 200, created.text
    response = deposit(client, headers, created.json()["orderId"])
    assert response.status_code == 200, response.text
    return response.json()


def _first_free(monkeypatch):
    """무작위 대신 남은 값 중 첫 번째를 고르게 한다(겹침 검사가 없으면 같은 값이 나온다)."""
    monkeypatch.setattr(deposit_code.secrets, "choice", lambda values: values[0])


# ---------- 형식·이름 (AC-09-11) ----------


def test_AC_09_11_awaiting_order_gets_nickname_first_three_plus_two_digits(client, login):
    # 농가에 이미 보이는 닉네임 앞 3글자(PM 11/17). 계정 실명·받는 사람 이름(이서준)은 쓰지 않는다
    _set_user("u-minji", name="김실명", nickname="귤사랑해요")
    headers = login("u-minji")
    created = client.post("/api/orders", headers=headers | key(), json=order_body())
    # 입금 안내 전에는 입금자명이 없다
    assert created.json()["depositCode"] is None
    order = deposit(client, headers, created.json()["orderId"]).json()

    code = order["depositCode"]
    assert re.fullmatch(r"귤사랑\d{2}", code)
    assert "실명" not in code and "이서준" not in code
    assert len(code) == 5
    # 주문 번호는 그대로
    assert re.fullmatch(r"FC-1007-\d{4}", order["orderNo"])
    # 같은 키로 다시 받아도, 다시 조회해도 같은 입금자명
    detail = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
    assert detail["depositCode"] == code
    again = deposit(client, headers, order["orderId"]).json()
    assert again["depositCode"] == code
    # 생산자 입금 대기 줄에도 같은 값
    rows = client.get(
        "/api/orders/producer", headers=login("u-kang"), params={"status": "AWAITING_DEPOSIT"}
    ).json()["items"]
    assert next(r for r in rows if r["orderId"] == order["orderId"])["depositCode"] == code


def test_AC_09_11_code_stays_after_confirm_and_is_kept_for_history(client, login):
    headers = login("u-minji")
    order = _awaiting(client, headers)
    confirmed = client.post(
        f"/api/orders/{order['orderId']}/confirm-deposit", headers=login("u-kang")
    ).json()
    assert confirmed["status"] == "RESERVED"
    assert confirmed["depositCode"] == order["depositCode"]


@pytest.mark.parametrize(
    ("nickname", "expected"),
    [
        ("귤 사랑", r"귤사랑\d{2}"),  # 공백은 뺀다
        ("귤사랑해요", r"귤사랑\d{2}"),  # 앞 3글자만
        ("Kim Minji", r"Kim\d{2}"),  # 로마자도 3글자
        ("귤🍊러버", r"귤러버\d{2}"),  # 이모지·특수문자는 뺀다
        ("user123", r"use\d{2}"),  # 숫자는 뒤 숫자와 헷갈려 뺀다
        ("귤", r"귤\d{2}"),  # 짧으면 그대로
        (None, r"김\d{2}"),  # 닉네임이 없으면 농가에 보이는 가림 이름(이름 앞 글자, public_name)
        ("☆☆", r"주문\d{2}"),  # 남는 글자가 없으면 '주문'
        ("2024", r"주문\d{2}"),
    ],
)
def test_AC_09_12_name_cleanup_truncation_and_fallbacks(client, login, nickname, expected):
    _set_user("u-minji", name="김실명", nickname=nickname)
    headers = login("u-minji")
    # 받는 사람 이름은 쓰지 않는다
    order = _awaiting(client, headers, recipientName="받는분")
    assert re.fullmatch(expected, order["depositCode"]), order["depositCode"]
    # 계정 실명(김실명)은 어떤 경우에도 그대로 들어가지 않는다
    assert "실명" not in order["depositCode"] and "받는분" not in order["depositCode"]
    assert len(order["depositCode"]) <= 5


def test_AC_09_12_pick_code_tiers_and_exhaustion():
    two = {f"김민지{n:02d}" for n in range(100)}
    # 2자리가 남아 있으면 2자리
    assert deposit_code.pick_code("김민지", two - {"김민지42"}) == "김민지42"
    # 100개 다 쓰였으면 숫자 3자리(이름 3글자 + 3자리 = 6자)
    third = deposit_code.pick_code("김민지", two)
    assert re.fullmatch(r"김민지\d{3}", third) and len(third) == 6
    assert deposit_code.code_name("남궁민수지") == "남궁민"
    # 1,100개 모두 쓰였으면 None(서버는 409로 다시 시도를 안내한다)
    every = two | {f"김민지{n:03d}" for n in range(1000)}
    assert deposit_code.pick_code("김민지", every) is None


# ---------- 같은 농가 입금 대기끼리 겹치지 않음 (AC-09-13) ----------


def test_AC_09_13_codes_do_not_repeat_among_one_farms_awaiting_orders(
    client, login, monkeypatch
):
    _first_free(monkeypatch)
    headers = login("u-minji")
    first = _awaiting(client, headers)
    second = _awaiting(client, headers)
    assert first["depositCode"] == "김민지00"
    assert second["depositCode"] == "김민지01"

    # 입금 대기를 벗어난(확인된) 주문의 입금자명은 다시 쓸 수 있다
    client.post(f"/api/orders/{first['orderId']}/confirm-deposit", headers=login("u-kang"))
    third = _awaiting(client, headers)
    assert third["depositCode"] == "김민지00"
    # 돈 없이 취소된 주문은 입금 기한이 끝난 지 3일이 지나야 다시 쓴다(늦은 입금과 헷갈리지 않게)
    client.post(f"/api/orders/{second['orderId']}/cancel", headers=headers | key())
    fourth = _awaiting(client, headers)
    assert fourth["depositCode"] == "김민지02"
    with get_sessionmaker()() as session, session.begin():
        row = session.get(Order, second["orderId"])
        row.deposit_due_at = row.deposit_due_at - timedelta(days=4)
    fifth = _awaiting(client, headers)
    assert fifth["depositCode"] == "김민지01"


def test_AC_09_13_other_farms_may_share_a_code(client, login, monkeypatch):
    _first_free(monkeypatch)
    headers = login("u-minji")
    kang = _awaiting(client, headers)
    halla = _awaiting(client, headers, productId="p-noji", optionId="opt-10")
    assert kang["depositCode"] == halla["depositCode"] == "김민지00"


def test_AC_09_13_concurrent_deposits_on_one_farm_get_different_codes(
    client, login, monkeypatch
):
    """다른 상품이면 상품 잠금으로 줄 서지 않는다. 농가 단위 잠금이 없으면 둘 다 김민지00이 된다."""
    _first_free(monkeypatch)
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(StageAllocation)
            .where(StageAllocation.stage_id == "st-redhyang-1")
            .values(quantity=StageAllocation.reserved_count + 10)
        )
    headers = login("u-minji")
    ids = [
        client.post("/api/orders", headers=headers | key(), json=order_body(**body)).json()[
            "orderId"
        ]
        for body in ({}, {"productId": "p-redhyang", "optionId": "opt-3"})
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda order_id: deposit(client, headers, order_id), ids))

    assert [r.status_code for r in results] == [200, 200], [r.text for r in results]
    assert sorted(r.json()["depositCode"] for r in results) == ["김민지00", "김민지01"]


def test_DEV_342_migration_backfill_uses_the_same_rule():
    """0033 백필은 앱 코드를 import하지 않고 같은 규칙을 복사해 둔다. 둘이 어긋나지 않게 본다."""
    path = Path(__file__).parents[1] / "migrations" / "versions" / "0033_order_deposit_code.py"
    spec = importlib.util.spec_from_file_location("m0033", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name in ["김 민지", "귤사랑해요", "☆", "Christopher", "귤🍊러버", "김○○", "", None]:
        assert module._name(name) == deposit_code.code_name(name)
    # 이름의 출처는 accounts.public_name과 같다(계정 실명은 쓰지 않음)
    from app.accounts import service as accounts

    for nickname, name, deleted in [("귤사랑", "김실명", False), (None, "김실명", False),
                                    (None, "", False), ("귤사랑", "김실명", True)]:
        user = User(nickname=nickname, name=name, deleted_at=datetime.now() if deleted else None)
        assert module._public_name(nickname, name, deleted) == accounts.public_name(user)

    class First:
        @staticmethod
        def choice(values):
            return values[0]

    taken = {f"김민지{n:02d}" for n in range(100)}
    assert module._pick("김민지", set(), First) == "김민지00"
    assert module._pick("김민지", taken, First) == "김민지000"


# ---------- 운영자 입금자명으로 찾기 ----------


def test_DEV_342_admin_finds_order_by_deposit_code(client, login, admin_headers):
    headers = login("u-minji")
    order = _awaiting(client, headers)
    code = order["depositCode"]

    found = client.get(f"/admin/users/by-order/{code}", headers=admin_headers)
    assert found.status_code == 200, found.text
    assert found.json() == {"userId": "u-minji", "orderId": order["orderId"]}
    # 통장에 띄어 쓴 값을 붙여 넣어도 찾는다
    spaced = client.get(f"/admin/users/by-order/{code[:2]} {code[2:]}", headers=admin_headers)
    assert spaced.json()["orderId"] == order["orderId"]
    # 사용자 상세 주문 줄에도 입금자명
    detail = client.get("/admin/users/u-minji", headers=admin_headers).json()
    assert next(o for o in detail["orders"] if o["orderId"] == order["orderId"])[
        "depositCode"
    ] == code
    assert client.get("/admin/users/by-order/없는사람00", headers=admin_headers).status_code == 404


def test_DEV_342_admin_lookup_ignores_letter_case(client, login, admin_headers, monkeypatch):
    _first_free(monkeypatch)
    _set_user("u-minji", nickname="Kim Minji")
    order = _awaiting(client, login("u-minji"))
    assert order["depositCode"] == "Kim00"
    found = client.get("/admin/users/by-order/kim00", headers=admin_headers)
    assert found.status_code == 200, found.text
    assert found.json()["orderId"] == order["orderId"]


def test_DEV_342_admin_lookup_prefers_awaiting_and_refuses_to_guess(
    client, login, admin_headers, monkeypatch
):
    _first_free(monkeypatch)
    minji = login("u-minji")
    old = _awaiting(client, minji)
    client.post(f"/api/orders/{old['orderId']}/confirm-deposit", headers=login("u-kang"))
    current = _awaiting(client, minji)
    assert old["depositCode"] == current["depositCode"] == "김민지00"
    # 같은 입금자명이면 입금 대기 주문을 먼저 찾는다
    found = client.get("/admin/users/by-order/김민지00", headers=admin_headers).json()
    assert found["orderId"] == current["orderId"]

    # 다른 농가에서 닉네임 앞 3글자가 같은 다른 소비자가 같은 입금자명을 받으면 고르지 않는다
    _set_user("u-seojun", nickname="김민지짱")
    _awaiting(client, login("u-seojun"), productId="p-noji", optionId="opt-10")
    ambiguous = client.get("/admin/users/by-order/김민지00", headers=admin_headers)
    assert ambiguous.status_code == 409
    assert ambiguous.json()["details"]["reason"] == "AMBIGUOUS_DEPOSIT_CODE"
    # 주문 번호로는 그대로 찾는다
    by_no = client.get(f"/admin/users/by-order/{current['orderNo']}", headers=admin_headers)
    assert by_no.json()["orderId"] == current["orderId"]


# ---------- 생산자가 자기 농가 주문으로 대화 시작 (FEAT-12 AC-12-17) ----------


def _buyer(client) -> dict[str, str]:
    """f-kang과 대화가 없는 실제 소비자(u-buyer-choi). 가입·약관 동의를 마친 상태로 둔다."""
    from app.accounts.schemas import CONSENT_VERSION, REQUIRED_CONSENTS
    from app.core.security import issue_token

    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(User)
            .where(User.id == "u-buyer-choi")
            .values(nickname="유진", phone="010-1111-2222")
        )
    headers = {"Authorization": f"Bearer {issue_token('u-buyer-choi', 'CONSUMER')}"}
    consents = [{"kind": kind, "version": CONSENT_VERSION} for kind in REQUIRED_CONSENTS]
    saved = client.post("/api/auth/me/consents", json={"consents": consents}, headers=headers)
    assert saved.status_code == 200, saved.text
    return headers


def _thread(farm_id: str, consumer_id: str):
    with get_sessionmaker()() as session:
        return session.scalar(
            select(Thread).where(Thread.farm_id == farm_id, Thread.consumer_id == consumer_id)
        )


def test_AC_12_17_producer_starts_chat_from_own_farm_order(client, login):
    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    assert _thread("f-kang", "u-buyer-choi") is None
    producer = login("u-kang")

    started = client.post(
        "/api/messaging/producer/chats",
        headers=producer | key(),
        json={"orderId": order["orderId"]},
    )
    assert started.status_code == 200, started.text
    assert started.json()["consumerId"] == "u-buyer-choi"
    assert started.json()["farmId"] == "f-kang"
    assert _thread("f-kang", "u-buyer-choi") is not None
    # 대화가 열리고 생산자가 보낼 수 있다(자동 발송은 없다: 메시지 0건)
    page = client.get(
        "/api/messaging/producer/chats/u-buyer-choi/messages", headers=producer
    ).json()
    assert page["items"] == []
    # consumerId를 함께 보내면 그 주문의 소비자와 같아야 한다
    same = client.post(
        "/api/messaging/producer/chats",
        headers=producer | key(),
        json={"orderId": order["orderId"], "consumerId": "u-buyer-choi"},
    )
    assert same.status_code == 200
    mismatch = client.post(
        "/api/messaging/producer/chats",
        headers=producer | key(),
        json={"orderId": order["orderId"], "consumerId": "u-minji"},
    )
    assert mismatch.status_code == 404


def test_AC_12_17_producer_cannot_start_chat_from_other_farm_or_hidden_order(
    client, login, other_farm_headers
):
    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    other = client.post(
        "/api/messaging/producer/chats",
        headers=other_farm_headers | key(),
        json={"orderId": order["orderId"]},
    )
    assert other.status_code == 404
    assert _thread("f-halla", "u-buyer-choi") is None

    # 결제 전(입금 안내 전) 주문은 생산자 목록에 없으므로 대화를 열 수 없다
    unpaid = client.post("/api/orders", headers=buyer | key(), json=order_body()).json()
    hidden = client.post(
        "/api/messaging/producer/chats",
        headers=login("u-kang") | key(),
        json={"orderId": unpaid["orderId"]},
    )
    assert hidden.status_code == 404
    missing = client.post(
        "/api/messaging/producer/chats",
        headers=login("u-kang") | key(),
        json={"orderId": "o-nope"},
    )
    assert missing.status_code == 404


def test_AC_12_17_no_arbitrary_customer_without_order_or_reply(client, login):
    producer = login("u-kang")
    # 주문·대화·소식방 답장이 없는 소비자는 여전히 못 연다(임의 고객 검색 없음)
    stranger = client.post(
        "/api/messaging/producer/chats",
        headers=producer | key(),
        json={"consumerId": "u-buyer-choi"},
    )
    assert stranger.status_code == 404
    assert _thread("f-kang", "u-buyer-choi") is None
    empty = client.post("/api/messaging/producer/chats", headers=producer | key(), json={})
    assert empty.status_code == 400


# ---------- 팔로우하지 않은 구매자도 생산자가 주문으로 연 대화를 본다 (AC-12-18, M-04) ----------


def _producer_opens_and_sends(client, login, order_id: str) -> dict:
    producer = login("u-kang")
    started = client.post(
        "/api/messaging/producer/chats", headers=producer | key(), json={"orderId": order_id}
    )
    assert started.status_code == 200, started.text
    sent = client.post(
        "/api/messaging/producer/chats/u-buyer-choi/messages",
        headers=producer | key(),
        json={"text": "입금 확인이 안되네요. 입금자명과 입금 시각을 알려주세요."},
    )
    assert sent.status_code == 200, sent.text
    return producer


def test_AC_12_18_unfollowed_buyer_sees_and_answers_producer_chat_from_order(client, login):
    from app.farms import service as farms

    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    with get_sessionmaker()() as session:
        assert not farms.is_following(session, "u-buyer-choi", "f-kang")
    # 생산자가 열기 전에는 그 농가 대화가 없다
    listed = client.get("/api/messaging/chats", headers=buyer).json()["items"]
    assert all(c.get("farmId") != "f-kang" for c in listed)

    producer = _producer_opens_and_sends(client, login, order["orderId"])

    listed = client.get("/api/messaging/chats", headers=buyer).json()["items"]
    assert any(c.get("farmId") == "f-kang" for c in listed)
    page = client.get("/api/messaging/chats/f-kang/messages", headers=buyer)
    assert page.status_code == 200, page.text
    body = page.json()
    assert any("입금 시각" in m["body"] for m in body["items"] if m["senderType"] == "PRODUCER")
    # 생산자 쪽 문맥은 연결 주문(주문 문의 모드)이 아니다: 보통 메시지로 답한다
    assert body["orders"] == []
    reply = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=buyer | key(),
        json={"text": "오늘 오후 3시에 김민지로 보냈어요"},
    )
    assert reply.status_code == 200, reply.text
    seen = client.get("/api/messaging/producer/chats/u-buyer-choi/messages", headers=producer)
    assert any("오후 3시" in m["body"] for m in seen.json()["items"])
    # 보통 답장 뒤에도 연결 주문은 없다
    assert _orders(client, buyer) == []
    # 메시지에 붙이는 주문은 결제한 주문만이다: 입금 대기 주문을 붙이면 거절(연결 주문이 되지 않게)
    with_order = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=buyer | key(),
        json={"text": "주문 번호도 같이 볼게요", "orderId": order["orderId"]},
    )
    assert with_order.status_code == 404
    assert _orders(client, buyer) == []


def test_AC_12_18_access_follows_the_order_not_the_stored_link(client, login):
    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    _producer_opens_and_sends(client, login, order["orderId"])
    # 소비자가 스스로 입금 대기 주문으로 주문 대화를 시작하는 길은 그대로 없다(DEV-248: 결제 후만)
    start = client.post(
        "/api/messaging/chats",
        headers=buyer | key(),
        json={"farmId": "f-kang", "orderId": order["orderId"]},
    )
    assert start.status_code == 404
    # 입금 확인되면(결제 이력) 계속 보인다
    client.post(f"/api/orders/{order['orderId']}/confirm-deposit", headers=login("u-kang"))
    assert client.get("/api/messaging/chats/f-kang/messages", headers=buyer).status_code == 200


def test_AC_12_18_unpaid_cancel_ends_access_and_others_cannot_use_the_order(client, login):
    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    _producer_opens_and_sends(client, login, order["orderId"])
    # 다른 소비자는 그 주문으로 보낼 수 없다
    other = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=login("u-seojun") | key(),
        json={"text": "제 주문인가요", "orderId": order["orderId"]},
    )
    assert other.status_code == 404
    # 돈을 낸 적 없이 취소되면 남은 연결만으로는 볼 수 없다(팔로우하지 않았으므로)
    client.post(f"/api/orders/{order['orderId']}/cancel", headers=buyer | key())
    gone = client.get("/api/messaging/chats/f-kang/messages", headers=buyer)
    assert gone.status_code in (403, 404)
    listed = client.get("/api/messaging/chats", headers=buyer).json()["items"]
    assert all(c.get("farmId") != "f-kang" for c in listed)


def test_AC_12_17_only_awaiting_deposit_orders_open_a_producer_chat(client, login):
    """버튼은 입금 대기 줄에만 있고, 지난 구매자에게 연락하는 길로 쓰이지 않는다."""
    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    client.post(f"/api/orders/{order['orderId']}/confirm-deposit", headers=login("u-kang"))
    reserved = client.post(
        "/api/messaging/producer/chats",
        headers=login("u-kang") | key(),
        json={"orderId": order["orderId"]},
    )
    assert reserved.status_code == 404
    assert _thread("f-kang", "u-buyer-choi") is None


def test_AC_12_18_follower_chat_stays_a_normal_chat_after_producer_opens_by_order(client, login):
    """생산자 쪽 문맥(source PRODUCER)은 연결 주문이 아니다.

    팔로워 대화가 주문 문의 모드로 바뀌지 않는다."""
    from app.messaging.models import ThreadOrderContext

    minji = login("u-minji")  # 시드에서 강씨네 귤밭을 팔로우한다
    before = client.get("/api/messaging/chats/f-kang/messages", headers=minji).json()["orders"]
    order = _awaiting(client, minji)
    started = client.post(
        "/api/messaging/producer/chats",
        headers=login("u-kang") | key(),
        json={"orderId": order["orderId"]},
    )
    assert started.status_code == 200, started.text
    with get_sessionmaker()() as session:
        row = session.scalar(
            select(ThreadOrderContext).where(ThreadOrderContext.order_id == order["orderId"])
        )
        assert row is not None and row.source == "PRODUCER"
    after = client.get("/api/messaging/chats/f-kang/messages", headers=minji).json()["orders"]
    assert after == before
    general = client.post(
        "/api/messaging/chats/f-kang/messages", headers=minji | key(), json={"text": "고마워요"}
    )
    assert general.status_code == 200, general.text


def _orders(client, headers) -> list:
    page = client.get("/api/messaging/chats/f-kang/messages", headers=headers)
    assert page.status_code == 200, page.text
    return page.json()["orders"]


def test_AC_12_18_open_then_follow_then_paid_keeps_a_normal_chat(client, login):
    """열고 나서 팔로우하고 입금이 확인돼도 생산자 쪽 문맥은 주문 문의 모드를 켜지 않는다."""
    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    _producer_opens_and_sends(client, login, order["orderId"])
    assert client.put("/api/farms/f-kang/follow", headers=buyer).status_code == 200
    client.post(f"/api/orders/{order['orderId']}/confirm-deposit", headers=login("u-kang"))
    assert _orders(client, buyer) == []
    general = client.post(
        "/api/messaging/chats/f-kang/messages", headers=buyer | key(), json={"text": "받았어요"}
    )
    assert general.status_code == 200, general.text


def test_AC_12_18_follow_then_open_then_unfollow_still_sees_and_answers(client, login):
    """팔로우한 채 열고 나서 팔로우를 끊어도, 입금 대기 동안 생산자 질문을 보고 답한다."""
    minji = login("u-minji")  # 시드에서 강씨네 귤밭을 팔로우한다
    before = _orders(client, minji)
    order = _awaiting(client, minji)
    started = client.post(
        "/api/messaging/producer/chats",
        headers=login("u-kang") | key(),
        json={"orderId": order["orderId"]},
    )
    assert started.status_code == 200, started.text
    assert client.delete("/api/farms/f-kang/follow", headers=minji).status_code == 200
    assert _orders(client, minji) == before
    listed = client.get("/api/messaging/chats", headers=minji).json()["items"]
    assert any(c.get("farmId") == "f-kang" for c in listed)
    reply = client.post(
        "/api/messaging/chats/f-kang/messages", headers=minji | key(), json={"text": "보냈어요"}
    )
    assert reply.status_code == 200, reply.text


def test_AC_09_13_uniqueness_ignores_letter_case():
    """은행이 대문자로 바꾸기도 하고 운영자 찾기도 대소문자를 무시한다: Kim00과 KIM00은 같다."""
    class First:
        @staticmethod
        def choice(values):
            return values[0]

    import app.orders.deposit_code as dc

    original = dc.secrets
    dc.secrets = First
    try:
        assert deposit_code.pick_code("Kim", {"KIM00"}) == "Kim01"
    finally:
        dc.secrets = original
    path = Path(__file__).parents[1] / "migrations" / "versions" / "0033_order_deposit_code.py"
    spec = importlib.util.spec_from_file_location("m0033_case", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module._pick("Kim", {"kim00"}, First) == "Kim01"


def test_DEV_342_backfill_skips_orders_that_already_reported_payment(client, login):
    """이미 ‘입금했어요’를 보낸 주문은 옛 안내(주문 번호)대로 보냈을 수 있어 백필하지 않는다."""
    path = Path(__file__).parents[1] / "migrations" / "versions" / "0033_order_deposit_code.py"
    spec = importlib.util.spec_from_file_location("m0033_backfill", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    headers = login("u-minji")
    waiting = _awaiting(client, headers)
    reported = _awaiting(client, headers)
    client.post(f"/api/orders/{reported['orderId']}/deposit-reported", headers=headers)
    with get_sessionmaker()() as session, session.begin():
        for oid in (waiting["orderId"], reported["orderId"]):
            session.get(Order, oid).deposit_code = None
    with get_sessionmaker()() as session, session.begin():
        module._backfill(session.connection())
    with get_sessionmaker()() as session:
        assert re.fullmatch(r"김민지\d{2}", session.get(Order, waiting["orderId"]).deposit_code)
        assert session.get(Order, reported["orderId"]).deposit_code is None


def test_AC_12_18_unfollowed_buyer_may_send_a_thread_photo_in_a_producer_opened_chat(client, login):
    """생산자 쪽 문맥 대화에서는 대화 단위 사진(예: 입금 확인증)도 보낼 수 있다.

    주문 단위 사진은 계속 결제한 주문만이다."""
    from tests.test_settings_inquiries import png, upload

    buyer = _buyer(client)
    order = _awaiting(client, buyer)
    producer = _producer_opens_and_sends(client, login, order["orderId"])
    thread_id = _thread("f-kang", "u-buyer-choi").id
    photo = upload(client, buyer, png(), threadId=thread_id)
    assert photo.status_code == 200, photo.text
    aid = photo.json()["attachmentId"]
    sent = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=buyer | key(),
        json={"text": "입금 확인증이에요", "attachmentIds": [aid]},
    )
    assert sent.status_code == 200, sent.text
    assert client.get(f"/api/messaging/attachments/{aid}", headers=producer).status_code == 200
    # 입금 대기 주문 단위 사진은 받지 않는다
    assert upload(client, buyer, png(), orderId=order["orderId"]).status_code == 404
