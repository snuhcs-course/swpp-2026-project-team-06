"""DEV-289 public contracts: message quotes and ten-minute producer reply pause.

Written from the behavior specification and existing HTTP test conventions only.
"""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest

BASE = datetime.fromisoformat("2026-10-07T10:00:00+09:00")


def _key():
    return {"Idempotency-Key": str(uuid4())}


@pytest.fixture
def at(monkeypatch):
    # FIXED_NOW is the test suite's clock control, also used by conftest.
    from app.core.config import get_settings

    def move(minutes=0, seconds=0):
        value = BASE + timedelta(minutes=minutes, seconds=seconds)
        monkeypatch.setenv("FIXED_NOW", value.isoformat())
        get_settings.cache_clear()
        return value

    move()
    yield move
    monkeypatch.setenv("FIXED_NOW", BASE.isoformat())
    get_settings.cache_clear()


def _page(client, headers, producer=False, consumer="u-seojun", **params):
    path = (
        f"/api/messaging/producer/chats/{consumer}/messages"
        if producer
        else "/api/messaging/chats/f-kang/messages"
    )
    response = client.get(path, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _send(client, headers, text, producer=False, consumer="u-seojun", key=None, **extra):
    path = (
        f"/api/messaging/producer/chats/{consumer}/messages"
        if producer
        else "/api/messaging/chats/f-kang/messages"
    )
    return client.post(path, headers=headers | (key or _key()), json={"text": text, **extra})


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def _settings(client, producer, **updates):
    settings = _ok(client.get("/api/farms/me/ai-settings", headers=producer))
    return _ok(
        client.put(
            "/api/farms/me/ai-settings", headers=producer | _key(), json={**settings, **updates}
        )
    )


def _time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _all_messages(client, headers, producer=False):
    items, cursor, seen = [], None, set()
    while True:
        params = {"limit": 1}
        if cursor:
            params["cursor"] = cursor
        page = _page(client, headers, producer, **params)
        items.extend(page["items"])
        cursor = page["nextCursor"]
        if not cursor:
            return {item["messageId"]: item for item in items}
        assert cursor not in seen, "Pagination must make progress"
        seen.add(cursor)


def test_both_sides_quote_and_keep_snapshot_after_reload_and_pagination(client, login, at):
    consumer, producer = login("u-seojun"), login("u-kang")
    original = _ok(_send(client, consumer, "포장 상태가 궁금해요"))["message"]
    answer = _ok(
        _send(
            client,
            producer,
            "완충재로 포장해요",
            producer=True,
            replyToMessageId=original["messageId"],
        )
    )["message"]
    followup = _ok(
        _send(
            client,
            consumer,
            "그 포장으로 부탁드려요",
            replyToMessageId=answer["messageId"],
        )
    )["message"]

    for result, target in ((answer, original), (followup, answer)):
        assert result["replyToMessageId"] == target["messageId"]
        assert result["replyTo"] == {
            "messageId": target["messageId"],
            "senderType": target["senderType"],
            "body": target["body"],
            "attachmentCount": 0,
        }
        for headers, is_producer in ((consumer, False), (producer, True)):
            reloaded = _page(client, headers, is_producer)
            assert (
                next(m for m in reloaded["items"] if m["messageId"] == result["messageId"])[
                    "replyTo"
                ]
                == result["replyTo"]
            )
            assert (
                _all_messages(client, headers, is_producer)[result["messageId"]]["replyTo"]
                == result["replyTo"]
            )


@pytest.mark.parametrize("producer_send", [False, True])
def test_foreign_thread_quote_is_rejected_without_message_or_pause_write(
    client, login, at, producer_send
):
    consumer, producer = login("u-seojun"), login("u-kang")
    foreign = _ok(_send(client, login("u-minji"), "다른 소비자 질문"))["message"]
    before = _page(client, producer, True)
    response = _send(
        client,
        producer if producer_send else consumer,
        "잘못된 인용",
        producer=producer_send,
        replyToMessageId=foreign["messageId"],
    )
    assert response.status_code in (400, 404), response.text
    after = _page(client, producer, True)
    assert after["items"] == before["items"]
    assert after["thread"] == before["thread"]


def test_each_successful_producer_send_extends_pause_and_exact_expiry_allows_next_ai(
    client, login, at
):
    consumer, producer = login("u-seojun"), login("u-kang")
    _settings(client, producer, enabled=True, smallOrderPolicy="1kg부터 주문할 수 있어요.")
    first = _ok(_send(client, producer, "제가 확인할게요", producer=True))
    assert _time(first["thread"]["humanReplyUntil"]) == BASE + timedelta(minutes=10)
    assert _time(first["thread"]["serverNow"]) == BASE
    at(minutes=9)
    second = _ok(_send(client, producer, "추가로 확인하고 있어요", producer=True))
    assert _time(second["thread"]["humanReplyUntil"]) == BASE + timedelta(minutes=19)

    at(minutes=18, seconds=59)
    paused = _ok(_send(client, consumer, "소량 주문 되나요?"))
    assert paused["reply"] is None
    paused_id = paused["message"]["messageId"]
    at(minutes=19)
    expired = _page(client, consumer)
    assert expired["farmReply"]["mode"] == "AI"
    # Reading after expiry cannot generate a delayed answer to the paused message.
    assert [m["messageId"] for m in expired["items"]][-1] == paused_id
    next_send = _ok(_send(client, consumer, "소량 주문 되나요?"))
    assert next_send["reply"]["senderType"] == "AI"
    assert "1kg" in next_send["reply"]["body"]


def test_global_ai_off_wins_after_pause_expiry(client, login, at):
    consumer, producer = login("u-seojun"), login("u-kang")
    _settings(client, producer, enabled=False, smallOrderPolicy="1kg부터 주문할 수 있어요.")
    _ok(_send(client, producer, "직접 답변드려요", producer=True))
    at(minutes=10)
    sent = _ok(_send(client, consumer, "소량 주문 되나요?"))
    assert sent["reply"] is None
    assert _page(client, consumer)["farmReply"]["mode"] == "FARM"


def test_idempotent_retry_does_not_restart_pause(client, login, at):
    consumer, producer = login("u-seojun"), login("u-kang")
    _settings(client, producer, enabled=True, smallOrderPolicy="1kg부터 주문할 수 있어요.")
    same = _key()
    first = _ok(_send(client, producer, "확인했어요", producer=True, key=same))
    at(minutes=9)
    retry = _ok(_send(client, producer, "확인했어요", producer=True, key=same))
    assert retry == first
    page = _page(client, producer, True)
    assert _time(page["thread"]["humanReplyUntil"]) == BASE + timedelta(minutes=10)
    assert sum(m["messageId"] == first["message"]["messageId"] for m in page["items"]) == 1
    at(minutes=10)
    assert _ok(_send(client, consumer, "소량 주문 되나요?"))["reply"]["senderType"] == "AI"


def test_quoting_open_question_answers_only_that_question(client, login, at):
    consumer, producer = login("u-seojun"), login("u-kang")

    def questions(status):
        return _ok(
            client.get("/api/messaging/questions", headers=producer, params={"status": status})
        )["items"]

    before = {q["escalationId"] for q in questions("OPEN")}
    first = _ok(_send(client, consumer, "농약은 언제 살포했나요?"))["message"]
    first_ids = {q["escalationId"] for q in questions("OPEN")} - before
    assert len(first_ids) == 1
    _ok(_send(client, consumer, "농약 종류는 무엇인가요?"))
    all_open = {q["escalationId"] for q in questions("OPEN")}
    assert len(all_open - before) == 2

    _ok(
        _send(
            client,
            producer,
            "첫 질문의 답변입니다",
            producer=True,
            replyToMessageId=first["messageId"],
        )
    )
    assert {q["escalationId"] for q in questions("OPEN")} == all_open - first_ids
    assert first_ids <= {q["escalationId"] for q in questions("ANSWERED")}
    # A second quote of the already answered question cannot clear another OPEN question.
    _ok(
        _send(
            client,
            producer,
            "첫 답변을 보충합니다",
            producer=True,
            replyToMessageId=first["messageId"],
        )
    )
    assert {q["escalationId"] for q in questions("OPEN")} == all_open - first_ids


def test_order_inquiry_keeps_direct_response_after_ordinary_pause_expired(client, login, at):
    consumer, producer = login("u-seojun"), login("u-kang")
    _settings(client, producer, enabled=True, smallOrderPolicy="1kg부터 주문할 수 있어요.")
    _ok(_send(client, producer, "일반 질문 답변입니다", producer=True))
    at(minutes=10)
    assert _page(client, consumer)["farmReply"]["mode"] == "AI"
    created = _ok(
        client.post(
            "/api/orders/o-38/inquiries",
            headers=consumer | _key(),
            json={"type": "DAMAGE", "text": "받은 상자가 찌그러졌어요"},
        )
    )
    assert created["inquiry"]["status"] == "OPEN"
    # A sensitive order inquiry is a separate direct-response state: it must
    # survive both the old deadline and another ordinary ten-minute interval.
    at(minutes=21)
    sent = _ok(_send(client, consumer, "소량 주문 되나요?", orderId="o-38"))
    assert sent["reply"] is None
    assert _page(client, consumer)["farmReply"]["mode"] == "FARM"


@pytest.mark.parametrize("selection", ["quote", "escalation_ids"])
def test_already_answered_question_preserves_first_answer_and_timestamp(
    client, login, at, selection
):
    consumer, producer = login("u-seojun"), login("u-kang")

    def questions(status):
        return _ok(
            client.get("/api/messaging/questions", headers=producer, params={"status": status})
        )["items"]

    previous_ids = {q["escalationId"] for q in questions("OPEN")}
    question = _ok(_send(client, consumer, "농약은 언제 살포했나요?"))["message"]
    created_ids = {q["escalationId"] for q in questions("OPEN")} - previous_ids
    assert len(created_ids) == 1
    escalation_id = created_ids.pop()
    first = _ok(
        _send(
            client,
            producer,
            "첫 답변: 지난주에 살포했습니다",
            producer=True,
            replyToMessageId=question["messageId"],
        )
    )
    assert first["message"]["senderType"] == "PRODUCER"
    saved = next(q for q in questions("ANSWERED") if q["escalationId"] == escalation_id)
    at(minutes=2)
    selected = (
        {"replyToMessageId": question["messageId"]}
        if selection == "quote"
        else {"answerToEscalationIds": [escalation_id]}
    )
    later = _ok(
        _send(
            client, producer, "새 메시지로 첫 답변을 덮어쓰면 안 됩니다", producer=True, **selected
        )
    )
    reloaded = next(q for q in questions("ANSWERED") if q["escalationId"] == escalation_id)
    assert saved["status"] == reloaded["status"] == "ANSWERED"
    # Escalation metadata (including its answer and any exposed timestamps)
    # stays fixed; the accompanying live conversation gains the new message.
    assert {k: v for k, v in reloaded.items() if k != "thread"} == {
        k: v for k, v in saved.items() if k != "thread"
    }
    saved_messages = {m["messageId"]: m for m in saved["thread"]}
    reloaded_messages = {m["messageId"]: m for m in reloaded["thread"]}
    first_answer_id = first["message"]["messageId"]
    assert saved_messages[first_answer_id]["body"] == "첫 답변: 지난주에 살포했습니다"
    assert reloaded_messages[first_answer_id] == saved_messages[first_answer_id]
    assert set(reloaded_messages) == set(saved_messages) | {later["message"]["messageId"]}
    assert reloaded_messages[later["message"]["messageId"]]["body"] == later["message"]["body"]
