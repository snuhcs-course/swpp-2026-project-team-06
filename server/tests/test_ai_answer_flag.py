"""DEV-296 AI 답변 확인 요청 깃발: 요청·답이 맞아요·바로잡기·건수 (FEAT-13 AC-13-5·11~13)."""

import uuid

from sqlalchemy import func, select, update

from app.core.db import get_sessionmaker
from app.farms.models import Farm
from app.messaging.models import Escalation, Thread, ThreadMessage

CHATS = "/api/messaging/producer/chats"


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def _ai_answer(client, consumer, producer) -> dict:
    """API 키 없이도 전달되지 않는 AI 답변(소량 주문 원칙 규칙 답변)을 만든다."""
    settings = client.get("/api/farms/me/ai-settings", headers=producer).json()
    saved = client.put(
        "/api/farms/me/ai-settings",
        headers=producer | key(),
        json={**settings, "smallOrderPolicy": "1kg부터 주문할 수 있어요."},
    )
    assert saved.status_code == 200, saved.text
    sent = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=consumer | key(),
        json={"text": "소량 주문 되나요?"},
    ).json()
    assert sent["reply"]["senderType"] == "AI"
    assert sent["reply"]["handoffStatus"] is None
    return sent


def _close_seed_forward():
    # 시드의 이서준 전달 질문(e-2)을 닫아 확인 요청만 열린 대화를 만든다
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Escalation).where(Escalation.id == "e-2").values(status="ANSWERED"))


def _requested(client, login) -> tuple[dict, dict, str, dict]:
    consumer, producer = login("u-seojun"), login("u-kang")
    _close_seed_forward()
    sent = _ai_answer(client, consumer, producer)
    answer_id = sent["reply"]["messageId"]
    report = client.post(
        f"/api/messaging/chats/f-kang/messages/{answer_id}/report", headers=consumer | key()
    )
    assert report.status_code == 200, report.text
    return consumer, producer, answer_id, report.json()


def _state(page: dict, message_id: str):
    return next(m for m in page["items"] if m["messageId"] == message_id)["checkState"]


def _consumer_page(client, consumer):
    return client.get("/api/messaging/chats/f-kang/messages", headers=consumer).json()


def _producer_page(client, producer):
    return client.get(f"{CHATS}/u-seojun/messages", headers=producer).json()


def _summary(client, producer) -> dict:
    rows = client.get(CHATS, headers=producer).json()["items"]
    return next(r for r in rows if r["consumerId"] == "u-seojun")


def _todo(client, producer) -> dict:
    return client.get("/api/orders/producer/dashboard", headers=producer).json()["todo"]


def _confirm(client, producer, answer_id, consumer_id="u-seojun"):
    return client.post(
        f"{CHATS}/{consumer_id}/messages/{answer_id}/confirm", headers=producer | key()
    )


def test_AC_13_11_requested_flag_in_both_views_and_counts_apart_from_open_questions(client, login):
    producer = login("u-kang")
    _close_seed_forward()
    before = _todo(client, producer)
    consumer, producer, answer_id, report = _requested(client, login)

    assert report["resolution"] is None
    for page in (_consumer_page(client, consumer), _producer_page(client, producer)):
        assert _state(page, answer_id) == "REQUESTED"
        # 다른 메시지는 깃발이 없다
        assert all(m["checkState"] is None for m in page["items"] if m["messageId"] != answer_id)
    row = _summary(client, producer)
    assert row["aiCheckRequests"] == 1
    # 1:1 목록 필터(needsReply)는 확인 요청도 포함한다(AC-13-5 그대로)
    assert row["needsReply"] is True
    todo = _todo(client, producer)
    assert todo["aiCheckRequests"] == before["aiCheckRequests"] + 1 == 1
    # '답하지 않은 문의'는 확인 요청만 열린 대화를 세지 않는다
    assert todo["openQuestions"] == before["openQuestions"]


def test_AC_13_12_confirm_closes_request_without_reply_and_is_idempotent(client, login):
    consumer, producer, answer_id, report = _requested(client, login)
    with get_sessionmaker()() as session:
        thread = session.scalar(
            select(Thread).where(Thread.farm_id == "f-kang", Thread.consumer_id == "u-seojun")
        )
        version, mode = thread.version, thread.ai_mode
        count = session.scalar(select(func.count()).where(ThreadMessage.thread_id == thread.id))

    first = _confirm(client, producer, answer_id)
    with get_sessionmaker()() as session:
        confirmed_at = session.get(Escalation, report["escalationId"]).answered_at
    second = _confirm(client, producer, answer_id)

    assert first.status_code == second.status_code == 200, first.text
    assert first.json()["messageId"] == answer_id
    assert first.json()["checkState"] == second.json()["checkState"] == "CONFIRMED"
    with get_sessionmaker()() as session:
        e = session.get(Escalation, report["escalationId"])
        assert (e.status, e.resolution, e.resolved_by) == ("ANSWERED", "CONFIRMED", "u-kang")
        assert e.answered_at is not None and e.answer is None
        # 다시 눌러도 확인 시각이 바뀌지 않는다
        assert e.answered_at == confirmed_at
        thread = session.get(Thread, thread.id)
        # 답장이 아니므로 새 메시지·AI 모드·대화 버전이 그대로다
        assert (thread.version, thread.ai_mode) == (version, mode)
        assert (
            session.scalar(select(func.count()).where(ThreadMessage.thread_id == thread.id))
            == count
        )
    assert _state(_consumer_page(client, consumer), answer_id) == "CONFIRMED"
    assert _state(_producer_page(client, producer), answer_id) == "CONFIRMED"
    assert _summary(client, producer)["aiCheckRequests"] == 0
    assert _todo(client, producer)["aiCheckRequests"] == 0
    answered = client.get(
        "/api/messaging/questions", headers=producer, params={"status": "ANSWERED"}
    ).json()["items"]
    view = next(q for q in answered if q["escalationId"] == report["escalationId"])
    assert view["resolution"] == "CONFIRMED"


def test_AC_13_12_confirm_requires_owner_farm_and_an_open_request(client, login):
    consumer, producer, answer_id, _ = _requested(client, login)

    # 다른 승인 농가 주인은 그 대화를 찾을 수 없다
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Farm).where(Farm.id == "f-wimi").values(approval_status="APPROVED"))
    assert _confirm(client, login("u-misook"), answer_id).status_code == 404
    # 소비자는 생산자 엔드포인트를 쓸 수 없다
    denied = client.post(f"{CHATS}/u-seojun/messages/{answer_id}/confirm", headers=consumer)
    assert denied.status_code == 403
    # 다른 소비자 대화 경로로는 이 메시지를 찾지 못한다
    assert _confirm(client, producer, answer_id, consumer_id="u-minji").status_code == 404
    # 확인 요청이 없는 AI 답변
    other = _ai_answer(client, consumer, producer)["reply"]["messageId"]
    assert _confirm(client, producer, other).status_code == 404
    assert _confirm(client, producer, "m-does-not-exist").status_code == 404
    assert _state(_producer_page(client, producer), answer_id) == "REQUESTED"


def test_AC_13_13_correction_reply_links_ai_answer_and_blocks_later_confirm(client, login):
    consumer, producer, answer_id, report = _requested(client, login)

    replied = client.post(
        f"{CHATS}/u-seojun/messages",
        headers=producer | key(),
        json={"text": "5kg부터만 받아요.", "replyToMessageId": answer_id},
    )

    assert replied.status_code == 200, replied.text
    reply = replied.json()["message"]
    assert reply["replyToMessageId"] == answer_id
    assert reply["replyTo"]["senderType"] == "AI"
    with get_sessionmaker()() as session:
        e = session.get(Escalation, report["escalationId"])
        assert (e.status, e.resolution, e.resolved_by) == ("ANSWERED", "CORRECTED", "u-kang")
    page = _consumer_page(client, consumer)
    assert _state(page, answer_id) == "CORRECTED"
    shown = next(m for m in page["items"] if m["messageId"] == reply["messageId"])
    assert shown["replyTo"]["messageId"] == answer_id
    assert _summary(client, producer)["aiCheckRequests"] == 0
    # 이미 바로잡은 답변은 '답이 맞아요'로 덮어쓰지 않는다
    late = _confirm(client, producer, answer_id)
    assert late.status_code == 409
    assert late.json()["details"]["reason"] == "ALREADY_CORRECTED"


def test_AC_13_13_answer_without_quote_still_quotes_the_corrected_ai_answer(client, login):
    consumer, producer, answer_id, report = _requested(client, login)

    answered = client.post(
        f"/api/messaging/questions/{report['escalationId']}/answer",
        headers=producer,
        json={"text": "1kg은 안 되고 5kg부터예요."},
    )

    assert answered.status_code == 200, answered.text
    assert answered.json()["resolution"] == "CORRECTED"
    page = _consumer_page(client, consumer)
    assert _state(page, answer_id) == "CORRECTED"
    reply = page["items"][-1]
    assert reply["senderType"] == "PRODUCER"
    assert reply["replyToMessageId"] == answer_id


def test_AC_13_5_plain_reply_keeps_request_open(client, login):
    consumer, producer, answer_id, _ = _requested(client, login)

    replied = client.post(
        f"{CHATS}/u-seojun/messages",
        headers=producer | key(),
        json={"text": "확인해 볼게요."},
    )

    assert replied.status_code == 200, replied.text
    assert replied.json()["message"]["replyToMessageId"] is None
    assert _state(_consumer_page(client, consumer), answer_id) == "REQUESTED"
    assert _summary(client, producer)["aiCheckRequests"] == 1


def test_AC_13_13_quoting_the_question_does_not_close_the_check_request(client, login):
    consumer, producer, answer_id, report = _requested(client, login)
    with get_sessionmaker()() as session:
        question_id = session.get(Escalation, report["escalationId"]).thread_message_id

    replied = client.post(
        f"{CHATS}/u-seojun/messages",
        headers=producer | key(),
        json={"text": "질문 확인했어요.", "replyToMessageId": question_id},
    )

    assert replied.status_code == 200, replied.text
    # 바로잡기는 AI 답변을 인용한 답장만이다. 질문 인용은 확인 요청을 닫지 않는다
    assert _state(_consumer_page(client, consumer), answer_id) == "REQUESTED"
    assert _summary(client, producer)["aiCheckRequests"] == 1


def test_AC_13_11_request_closed_before_0031_shows_no_flag(client, login):
    consumer, producer, answer_id, report = _requested(client, login)
    # 0031 전에 농가 답장으로 닫힌 옛 행: resolution 없음
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Escalation)
            .where(Escalation.id == report["escalationId"])
            .values(status="ANSWERED", answer="예전 답", resolution=None)
        )

    item = next(m for m in _consumer_page(client, consumer)["items"] if m["messageId"] == answer_id)
    assert item["reported"] is True
    assert item["checkState"] is None
    assert _summary(client, producer)["aiCheckRequests"] == 0
    late = _confirm(client, producer, answer_id)
    assert late.status_code == 409
    assert late.json()["details"]["reason"] == "ALREADY_CORRECTED"
