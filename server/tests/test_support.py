"""farmclub 문의 대화방(DEV-111, FEAT-34, M-22)."""

import uuid

from sqlalchemy import delete, func, select, text

from app.core.db import get_sessionmaker
from app.messaging.models import Thread, ThreadMessage
from app.messaging.support import SUPPORT_USER_ID, WELCOME, support_thread_id

CHATS = "/api/messaging/producer/chats"
ROOM = f"/api/messaging/producer/chats/{SUPPORT_USER_ID}"


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def support_messages(farm_id: str) -> list[ThreadMessage]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(ThreadMessage)
                .where(ThreadMessage.thread_id == support_thread_id(farm_id))
                .order_by(ThreadMessage.seq)
            )
        )


def test_AC_34_1_approval_opens_one_support_room_with_welcome(client, admin_headers):
    assert support_messages("f-wimi") == []
    response = client.post("/admin/producers/f-wimi/approve", headers=admin_headers | key())
    assert response.status_code == 200, response.text
    messages = support_messages("f-wimi")
    assert [(m.sender_type, m.body) for m in messages] == [("OPERATOR", WELCOME)]
    with get_sessionmaker()() as session:
        thread = session.get(Thread, support_thread_id("f-wimi"))
        assert (thread.consumer_id, thread.ai_mode) == (SUPPORT_USER_ID, "HUMAN")

    from app.messaging.support import ensure_support_thread

    with get_sessionmaker()() as session:
        ensure_support_thread(session, "f-wimi")
        session.commit()
    assert len(support_messages("f-wimi")) == 1


def test_AC_34_1_rejection_does_not_open_support_room(client, admin_headers):
    response = client.post(
        "/admin/producers/f-wimi/reject",
        headers=admin_headers | key(),
        json={"reason": "정보 확인이 필요해요"},
    )
    assert response.status_code == 200, response.text
    assert support_messages("f-wimi") == []


def test_AC_34_1_migration_backfills_approved_farms_once():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).parents[1] / "migrations/versions/0019_farmclub_support.py"
    spec = importlib.util.spec_from_file_location("migration_0019", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.WELCOME == WELCOME

    with get_sessionmaker()() as session:
        support = select(Thread.id).where(Thread.consumer_id == SUPPORT_USER_ID)
        session.execute(delete(ThreadMessage).where(ThreadMessage.thread_id.in_(support)))
        session.execute(delete(Thread).where(Thread.consumer_id == SUPPORT_USER_ID))
        session.flush()
        for _ in range(2):
            session.execute(text(migration.SUPPORT_USER_SQL))
            session.execute(text(migration.SUPPORT_THREADS_SQL))
            session.execute(text(migration.WELCOME_SQL), {"welcome": migration.WELCOME})
        rows = session.execute(
            select(Thread.farm_id, func.count(ThreadMessage.id))
            .join(ThreadMessage, ThreadMessage.thread_id == Thread.id)
            .where(Thread.consumer_id == SUPPORT_USER_ID, ThreadMessage.sender_type == "OPERATOR")
            .group_by(Thread.farm_id)
        ).all()
        assert dict(rows) == {"f-kang": 1, "f-halla": 1, "f-hyodon": 1, "f-namwon": 1}
        session.rollback()


def test_AC_34_2_producer_sees_farmclub_room_without_ai(client, login):
    producer = login("u-kang")
    rows = client.get(CHATS, headers=producer).json()["items"]
    supports = [r for r in rows if r["isSupport"]]
    assert len(supports) == 1
    first = supports[0]
    assert (first["consumerId"], first["consumerName"]) == (SUPPORT_USER_ID, "farmclub")
    assert first["unreadCount"] == 1 and first["needsReply"] is False
    # 고정하지 않고 최근 순으로 섞인다(사용자 결정)
    times = [r["lastAt"] for r in rows if r["lastAt"]]
    assert times == sorted(times, reverse=True)

    page = client.get(f"{ROOM}/messages", headers=producer).json()
    assert [m["senderType"] for m in page["items"]] == ["OPERATOR"]
    assert page["orders"] == [] and page["inquiries"] == [] and page["escalations"] == []

    mode = client.put(
        f"{ROOM}/ai-mode",
        headers=producer | key(),
        json={"mode": "AUTO", "version": page["thread"]["version"]},
    )
    assert mode.status_code == 400, mode.text


def test_AC_34_3_producer_question_reaches_inbox_and_operator_reply_returns(
    client, login, admin_headers
):
    producer = login("u-kang")
    sent = client.post(
        f"{ROOM}/messages",
        headers=producer | key(),
        json={"text": "정산은 언제 들어오나요?"},
    )
    assert sent.status_code == 200, sent.text
    assert support_messages("f-kang")[-1].sender_type == "PRODUCER"
    # AI는 이 방에 답하지 않는다
    assert all(m.sender_type != "AI" for m in support_messages("f-kang"))

    inbox = client.get("/admin/support", headers=admin_headers).json()
    assert inbox[0]["targetId"] == "f-kang" and inbox[0]["kind"] == "PRODUCER"
    assert (inbox[0]["waiting"], inbox[0]["unreadCount"]) == (True, 1)
    assert inbox[0]["lastMessage"] == "정산은 언제 들어오나요?"

    page = client.get("/admin/support/f-kang/messages", headers=admin_headers).json()
    question = page["items"][-1]
    read = client.post(
        "/admin/support/f-kang/read",
        headers=admin_headers,
        json={"messageId": question["messageId"]},
    )
    assert read.json() == {"unreadCount": 0}

    reply_key = key()
    reply = client.post(
        "/admin/support/f-kang/messages",
        headers=admin_headers | reply_key,
        json={"text": "매주 월요일에 지난주 정산이 들어가요."},
    )
    again = client.post(
        "/admin/support/f-kang/messages",
        headers=admin_headers | reply_key,
        json={"text": "매주 월요일에 지난주 정산이 들어가요."},
    )
    assert reply.status_code == again.status_code == 200, reply.text
    assert reply.json()["messageId"] == again.json()["messageId"]
    assert reply.json()["senderType"] == "OPERATOR"

    row = next(r for r in client.get(CHATS, headers=producer).json()["items"] if r["isSupport"])
    assert row["lastMessage"] == "매주 월요일에 지난주 정산이 들어가요."
    assert row["unreadCount"] == 2  # 환영 메시지 + 답장
    inbox = client.get("/admin/support", headers=admin_headers).json()
    kang = next(r for r in inbox if r["targetId"] == "f-kang")
    assert kang["waiting"] is False


def test_AC_34_3_reply_does_not_mark_unseen_inquiries_read(client, login, admin_headers):
    producer = login("u-kang")
    client.post(f"{ROOM}/messages", headers=producer | key(), json={"text": "첫 문의"})
    page = client.get("/admin/support/f-kang/messages", headers=admin_headers).json()
    client.post(
        "/admin/support/f-kang/read",
        headers=admin_headers,
        json={"messageId": page["items"][-1]["messageId"]},
    )
    # 운영자가 대화를 연 뒤 생산자가 또 보냈고, 운영자는 그걸 보기 전에 답장했다
    client.post(f"{ROOM}/messages", headers=producer | key(), json={"text": "하나 더요"})
    client.post(
        "/admin/support/f-kang/messages", headers=admin_headers | key(), json={"text": "답장"}
    )
    kang = next(
        r for r in client.get("/admin/support", headers=admin_headers).json()
        if r["targetId"] == "f-kang"
    )
    assert kang["unreadCount"] == 1


def test_AC_34_3_operator_reply_validates_text(client, admin_headers):
    response = client.post(
        "/admin/support/f-kang/messages", headers=admin_headers | key(), json={"text": "  "}
    )
    assert response.status_code == 400
    missing = client.get("/admin/support/f-wimi/messages", headers=admin_headers)
    assert missing.status_code == 404


def test_AC_34_4_support_room_is_hidden_from_consumers_and_admin_users(
    client, login, admin_headers
):
    consumer = login("u-minji")
    chats = client.get("/api/messaging/chats", headers=consumer).json()["items"]
    # 소비자에게는 자기 farmclub 문의 대화방(DEV-150)만 있고, 생산자 방은 보이지 않는다
    support_rows = [c for c in chats if c["farmName"] == "farmclub"]
    assert len(support_rows) == 1 and support_rows[0]["isSupport"] is True
    assert all(WELCOME not in c["lastMessage"] for c in chats)
    users = client.get("/admin/users", headers=admin_headers).json()["items"]
    assert SUPPORT_USER_ID not in {u["userId"] for u in users}


def test_AC_34_4_support_routes_require_admin(client, login):
    for user_id in ("u-minji", "u-kang"):
        response = client.get("/admin/support", headers=login(user_id))
        assert response.status_code == 403


def test_AC_34_1_restoring_a_hidden_test_farm_opens_its_support_room():
    from app.admin.retire_test_farm import RETIRE_REASON, restore_in
    from app.farms.models import Farm

    with get_sessionmaker()() as session:
        farm = session.get(Farm, "f-namwon")
        session.execute(
            delete(ThreadMessage).where(ThreadMessage.thread_id == support_thread_id("f-namwon"))
        )
        session.execute(delete(Thread).where(Thread.id == support_thread_id("f-namwon")))
        farm.approval_status, farm.suspend_reason = "SUSPENDED", RETIRE_REASON
        session.commit()
        restore_in(session, "f-namwon", commit=True, audit=False)
        session.commit()
    assert [m.sender_type for m in support_messages("f-namwon")] == ["OPERATOR"]

