"""FEAT-13 AC-13-2/5: automatic handoff reply requests identify the original question."""

import uuid

from sqlalchemy import update

from app.core.db import get_sessionmaker
from app.farms.models import Farm

CONSUMER = "/api/messaging/chats/f-kang/messages"
PRODUCER = "/api/messaging/producer/chats/u-seojun/messages"


def key():
    return {"Idempotency-Key": str(uuid.uuid4())}


def checked(response):
    assert response.status_code == 200, response.text
    return response.json()


def setup_chat(client, login):
    consumer, producer = login("u-seojun"), login("u-kang")
    settings = checked(client.get("/api/farms/me/ai-settings", headers=producer))
    checked(
        client.put(
            "/api/farms/me/ai-settings",
            headers=producer | key(),
            json={
                **settings,
                "enabled": True,
                "smallOrderPolicy": "1kg부터 주문할 수 있어요.",
            },
        )
    )
    thread = checked(client.get(PRODUCER, headers=producer))["thread"]
    if thread["aiMode"] != "AUTO":
        checked(
            client.put(
                "/api/messaging/producer/chats/u-seojun/ai-mode",
                headers=producer | key(),
                json={"mode": "AUTO", "version": thread["version"]},
            )
        )
    return consumer, producer


def handoff(client, consumer, text, headers=None):
    result = checked(
        client.post(CONSUMER, headers=headers or (consumer | key()), json={"text": text})
    )
    assert result["reply"]["handoffStatus"] == "FORWARDED"
    return result


def messages(client, headers, path=PRODUCER, limit=50):
    items, cursor = [], None
    for _ in range(100):
        params = {"limit": limit, **({"cursor": cursor} if cursor else {})}
        page = checked(client.get(path, headers=headers, params=params))
        items.extend(page["items"])
        cursor = page["nextCursor"]
        if not cursor:
            return {m["messageId"]: m for m in items}
    raise AssertionError("message pagination did not terminate within 100 pages")


def questions(client, producer, status="OPEN"):
    return checked(
        client.get("/api/messaging/questions", headers=producer, params={"status": status})
    )["items"]


def explicit_check(client, consumer):
    sent = checked(
        client.post(CONSUMER, headers=consumer | key(), json={"text": "소량 주문 되나요?"})
    )
    assert sent["reply"]["handoffStatus"] is None
    answer_id = sent["reply"]["messageId"]
    report = checked(client.post(f"{CONSUMER}/{answer_id}/report", headers=consumer | key()))
    return sent, report


def test_AC_13_2_request_tracks_original_question_on_older_pages_without_duplicate_requests(
    client, login
):
    consumer, producer = setup_chat(client, login)
    same_key = consumer | key()
    first = handoff(client, consumer, "농약은 얼마나 치세요? 첫 질문", same_key)
    repeated = handoff(client, consumer, "농약은 얼마나 치세요? 첫 질문", same_key)
    assert repeated["message"]["messageId"] == first["message"]["messageId"]
    second = handoff(client, consumer, "농약은 언제 치세요? 두 번째 질문")
    ordinary = checked(
        client.post(CONSUMER, headers=consumer | key(), json={"text": "소량 주문 되나요?"})
    )
    assert ordinary["reply"]["handoffStatus"] is None
    open_before = {q["escalationId"] for q in questions(client, producer)}

    for path, headers in [(PRODUCER, producer), (CONSUMER, consumer)]:
        newest = checked(client.get(path, headers=headers, params={"limit": 1}))
        assert first["message"]["messageId"] not in {m["messageId"] for m in newest["items"]}
        items = messages(client, headers, path, limit=1)
        for sent in [first, second]:
            assert items[sent["message"]["messageId"]]["replyRequested"] is True
            assert items[sent["reply"]["messageId"]]["replyRequested"] is False
        for message in [ordinary["message"], ordinary["reply"]]:
            assert items[message["messageId"]]["replyRequested"] is False
        assert all(isinstance(item["replyRequested"], bool) for item in items.values())
    open_after = questions(client, producer)
    assert {q["escalationId"] for q in open_after} == open_before
    assert sum(q["question"] == first["message"]["body"] for q in open_after) == 1


def test_AC_13_5_quoted_success_closes_only_that_handoff_and_keeps_explicit_check_separate(
    client, login
):
    consumer, producer = setup_chat(client, login)
    first = handoff(client, consumer, "농약은 얼마나 치세요? 첫 전달")
    second = handoff(client, consumer, "농약은 언제 치세요? 다른 전달")
    checked_answer, report = explicit_check(client, consumer)
    requested_id = checked_answer["reply"]["messageId"]
    before_todo = checked(client.get("/api/orders/producer/dashboard", headers=producer))["todo"]
    headers = producer | key()
    body = {
        "text": "첫 질문은 직접 확인해서 답드려요.",
        "replyToMessageId": first["message"]["messageId"],
    }
    sent = checked(client.post(PRODUCER, headers=headers, json=body))
    repeated = checked(client.post(PRODUCER, headers=headers, json=body))
    assert repeated["message"]["messageId"] == sent["message"]["messageId"]
    assert sent["message"]["replyToMessageId"] == first["message"]["messageId"]
    assert sent["message"]["replyTo"]["senderType"] == "CONSUMER"
    items = messages(client, producer)
    assert items[first["message"]["messageId"]]["replyRequested"] is False
    assert items[second["message"]["messageId"]]["replyRequested"] is True
    assert items[requested_id]["checkState"] == "REQUESTED"
    assert items[requested_id]["replyRequested"] is False
    assert items[checked_answer["message"]["messageId"]]["replyRequested"] is False
    opened = questions(client, producer)
    assert not any(q["question"] == first["message"]["body"] for q in opened)
    assert any(q["question"] == second["message"]["body"] for q in opened)
    assert any(q["escalationId"] == report["escalationId"] for q in opened)
    rows = checked(client.get("/api/messaging/producer/chats", headers=producer))["items"]
    assert next(row for row in rows if row["consumerId"] == "u-seojun")["needsReply"] is True
    after_todo = checked(client.get("/api/orders/producer/dashboard", headers=producer))["todo"]
    assert after_todo["openQuestions"] == before_todo["openQuestions"]
    assert after_todo["aiCheckRequests"] == before_todo["aiCheckRequests"]


def test_AC_13_5_wrong_actor_or_chat_cannot_resolve_a_handoff_and_support_has_no_request(
    client, login
):
    consumer, producer = setup_chat(client, login)
    sent = handoff(client, consumer, "농약은 얼마나 치세요? 권한 확인")
    question_id = sent["message"]["messageId"]
    body = {"text": "권한 없는 답장", "replyToMessageId": question_id}
    assert client.post(PRODUCER, headers=consumer | key(), json=body).status_code == 403
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Farm).where(Farm.id == "f-wimi").values(approval_status="APPROVED"))
    assert client.post(PRODUCER, headers=login("u-misook") | key(), json=body).status_code == 404
    wrong_chat = client.post(
        "/api/messaging/producer/chats/u-minji/messages", headers=producer | key(), json=body
    )
    assert wrong_chat.status_code in (400, 404)
    assert messages(client, producer)[question_id]["replyRequested"] is True
    assert any(q["question"] == sent["message"]["body"] for q in questions(client, producer))
    rows = checked(client.get("/api/messaging/producer/chats", headers=producer))["items"]
    support = next(row for row in rows if row["isSupport"])
    support_items = messages(
        client, producer, f"/api/messaging/producer/chats/{support['consumerId']}/messages"
    )
    assert all(item["replyRequested"] is False for item in support_items.values())
