"""소비자 farmclub 문의 대화방(DEV-150, FEAT-34 AC-34-6~8, M-22)."""

import uuid

from sqlalchemy import delete, func, select, text

from app.accounts.models import User
from app.core.db import get_sessionmaker
from app.messaging.models import SupportMessage, SupportThread
from app.messaging.support import CONSUMER_WELCOME, SUPPORT_USER_ID, WELCOME
from tests.test_accounts import _finish_onboarding, _kakao_consumer, _kakao_on

CHATS = "/api/messaging/chats"
ROOM = "/api/messaging/support"


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def room_messages(user_id: str) -> list[SupportMessage]:
    with get_sessionmaker()() as session:
        thread = session.scalar(select(SupportThread).where(SupportThread.user_id == user_id))
        if thread is None:
            return []
        return list(
            session.scalars(
                select(SupportMessage)
                .where(SupportMessage.thread_id == thread.id)
                .order_by(SupportMessage.seq)
            )
        )


def test_AC_34_6_signup_opens_one_room_with_welcome(client, monkeypatch):
    _kakao_on(monkeypatch)
    user, headers = _kakao_consumer(client)
    messages = room_messages(user["userId"])
    assert [(m.sender_type, m.body) for m in messages] == [("OPERATOR", CONSUMER_WELCOME)]

    from app.messaging.support import ensure_consumer_support

    with get_sessionmaker()() as session:
        ensure_consumer_support(session, user["userId"])
        session.commit()
    assert len(room_messages(user["userId"])) == 1

    row = next(c for c in client.get(CHATS, headers=headers).json()["items"] if c["isSupport"])
    assert (row["farmId"], row["farmName"], row["unreadCount"]) == (SUPPORT_USER_ID, "farmclub", 1)


def test_AC_34_6_producer_signup_does_not_open_consumer_room(client, monkeypatch):
    from tests.test_accounts import _kakao

    _kakao_on(monkeypatch, fetch=("kakao-2002", "farmer@example.com"))
    user, _ = _kakao(client, "producer")
    assert room_messages(user["userId"]) == []


def test_AC_34_6_migration_backfills_existing_consumers_once():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).parents[1] / "migrations/versions/0022_consumer_support.py"
    spec = importlib.util.spec_from_file_location("migration_0022", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.CONSUMER_WELCOME == CONSUMER_WELCOME

    with get_sessionmaker()() as session:
        session.execute(delete(SupportMessage))
        session.execute(delete(SupportThread))
        session.flush()
        for _ in range(2):
            session.execute(text(migration.THREADS_SQL))
            session.execute(text(migration.WELCOME_SQL), {"welcome": migration.CONSUMER_WELCOME})
        rows = dict(
            session.execute(
                select(SupportThread.user_id, func.count(SupportMessage.id))
                .join(SupportMessage, SupportMessage.thread_id == SupportThread.id)
                .group_by(SupportThread.user_id)
            ).all()
        )
        consumers = set(
            session.scalars(
                select(User.id).where(User.role == "CONSUMER", User.deleted_at.is_(None))
            )
        )
        assert set(rows) == consumers and set(rows.values()) == {1}
        assert {"u-minji", "u-seojun"} <= consumers
        session.rollback()


def test_AC_34_7_consumer_inquiry_reaches_inbox_and_reply_returns(client, login, admin_headers):
    consumer = login("u-minji")
    page = client.get(f"{ROOM}/messages", headers=consumer).json()
    assert [m["senderType"] for m in page["items"]] == ["OPERATOR"]

    sent = client.post(
        f"{ROOM}/messages", headers=consumer | key(), json={"text": "입금했는데 확인이 안 돼요"}
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["reply"] is None  # AI는 답하지 않는다
    assert [m.sender_type for m in room_messages("u-minji")] == ["OPERATOR", "CONSUMER"]

    inbox = client.get("/admin/support", headers=admin_headers).json()
    row = inbox[0]
    assert (row["kind"], row["targetId"], row["waiting"], row["unreadCount"]) == (
        "CONSUMER",
        "u-minji",
        True,
        1,
    )
    assert row["lastMessage"] == "입금했는데 확인이 안 돼요"
    # 생산자 방도 함께 보인다
    assert any(r["kind"] == "PRODUCER" for r in inbox)

    detail = client.get("/admin/support/consumers/u-minji/messages", headers=admin_headers).json()
    read = client.post(
        "/admin/support/consumers/u-minji/read",
        headers=admin_headers,
        json={"messageId": detail["items"][-1]["messageId"]},
    )
    assert read.json() == {"unreadCount": 0}

    reply_key = key()
    replies = [
        client.post(
            "/admin/support/consumers/u-minji/messages",
            headers=admin_headers | reply_key,
            json={"text": "확인해 보니 농가가 곧 확인할 예정이에요."},
        )
        for _ in range(2)
    ]
    assert replies[0].status_code == replies[1].status_code == 200, replies[0].text
    assert replies[0].json()["messageId"] == replies[1].json()["messageId"]
    assert replies[0].json()["senderType"] == "OPERATOR"

    row = next(c for c in client.get(CHATS, headers=consumer).json()["items"] if c["isSupport"])
    assert row["lastMessage"] == "확인해 보니 농가가 곧 확인할 예정이에요."
    assert row["unreadCount"] == 2  # 환영 메시지 + 답장
    last = client.get(f"{ROOM}/messages", headers=consumer).json()["items"][-1]
    read = client.put(
        f"{ROOM}/read", headers=consumer, json={"lastReadMessageId": last["messageId"]}
    )
    assert read.json() == {"unreadCount": 0}
    minji = next(
        r
        for r in client.get("/admin/support", headers=admin_headers).json()
        if r["targetId"] == "u-minji"
    )
    assert minji["waiting"] is False


def test_AC_34_7_contacts_are_masked_and_text_is_validated(client, login):
    consumer = login("u-minji")
    empty = client.post(f"{ROOM}/messages", headers=consumer | key(), json={"text": "  "})
    assert empty.status_code == 400
    sent = client.post(
        f"{ROOM}/messages", headers=consumer | key(), json={"text": "010-1234-5678로 연락 주세요"}
    ).json()["message"]
    assert sent["masked"] is True and "1234-5678" not in sent["body"]


def test_AC_34_8_rooms_are_private_to_each_consumer_and_admin(client, login):
    minji, seojun = login("u-minji"), login("u-seojun")
    client.post(f"{ROOM}/messages", headers=minji | key(), json={"text": "민지 문의"})
    bodies = [m["body"] for m in client.get(f"{ROOM}/messages", headers=seojun).json()["items"]]
    assert "민지 문의" not in bodies
    other = client.get(f"{ROOM}/messages", headers=seojun).json()["items"]
    read = client.put(
        f"{ROOM}/read",
        headers=seojun,
        json={"lastReadMessageId": room_messages("u-minji")[-1].id},
    )
    assert read.status_code == 404 and len(other) == 1
    # 생산자는 소비자 문의 경로를 쓸 수 없고, 소비자 목록에 생산자 방 환영 문구가 섞이지 않는다
    assert client.get(f"{ROOM}/messages", headers=login("u-kang")).status_code == 403
    chats = client.get(CHATS, headers=minji).json()["items"]
    assert all(WELCOME not in c["lastMessage"] for c in chats)
    for user_id in ("u-minji", "u-kang"):
        assert client.get("/admin/support", headers=login(user_id)).status_code == 403


def test_AC_34_8_withdrawal_erases_consumer_inquiries(client, monkeypatch):
    from app.accounts.service import WITHDRAWN_MESSAGE

    _kakao_on(monkeypatch)
    user, headers = _kakao_consumer(client)
    _finish_onboarding(client, headers)
    client.post(f"{ROOM}/messages", headers=headers | key(), json={"text": "제 주소는 서울이에요"})
    assert client.post("/api/auth/me/withdraw", headers=headers).status_code == 204
    bodies = [(m.sender_type, m.body) for m in room_messages(user["userId"])]
    assert bodies == [("OPERATOR", CONSUMER_WELCOME), ("CONSUMER", WITHDRAWN_MESSAGE)]


def test_AC_34_7_inbox_lists_only_consumers_who_asked(client, login, admin_headers):
    inbox = client.get("/admin/support", headers=admin_headers).json()
    # 가입 때 모두 방을 받지만, 문의하기 전에는 문의함에 나오지 않는다
    assert not any(r["kind"] == "CONSUMER" for r in inbox)
    client.post(f"{ROOM}/messages", headers=login("u-seojun") | key(), json={"text": "배송 문의"})
    consumers = [
        r["targetId"]
        for r in client.get("/admin/support", headers=admin_headers).json()
        if r["kind"] == "CONSUMER"
    ]
    assert consumers == ["u-seojun"]


def test_AC_34_7_sending_requires_current_consent(client, monkeypatch):
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)
    # 온보딩(지금 버전 동의 포함)을 마치기 전에는 읽을 수만 있고 보낼 수 없다
    assert client.get(f"{ROOM}/messages", headers=headers).status_code == 200
    blocked = client.post(f"{ROOM}/messages", headers=headers | key(), json={"text": "문의"})
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "ONBOARDING_REQUIRED"
    _finish_onboarding(client, headers)
    sent = client.post(f"{ROOM}/messages", headers=headers | key(), json={"text": "문의"})
    assert sent.status_code == 200, sent.text
