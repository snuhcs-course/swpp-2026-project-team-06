"""Specification-only API checks for stable chat ordering and forwarded-message privacy."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.core.db import get_sessionmaker
from app.messaging.models import Thread, ThreadMessage


def key():
    return {"Idempotency-Key": str(uuid.uuid4())}


def get_page(client, path, headers, **params):
    response = client.get(path, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_AC_12_1_equal_time_storage_order_and_sequences_match_across_views_and_pages(client, login):
    consumer, producer = login("u-minji"), login("u-kang")
    expected = ["z-question", "a-reply", "m-9-display", "m-10-display", "m-2-display"]
    at = datetime(2030, 1, 1, tzinfo=UTC)
    with get_sessionmaker()() as session, session.begin():
        thread = session.scalar(
            select(Thread).where(Thread.farm_id == "f-kang", Thread.consumer_id == "u-minji")
        )
        assert thread is not None
        for i, mid in enumerate(expected):
            session.add(
                ThreadMessage(
                    id=mid,
                    thread_id=thread.id,
                    sender_type="PRODUCER" if i % 2 else "CONSUMER",
                    body=mid,
                    photos=[],
                    attachment_ids=[],
                    source_refs=[],
                    needs_human=False,
                    created_at=at,
                )
            )
            session.flush()
    views = []
    for path, headers in [
        ("/api/messaging/chats/f-kang/messages", consumer),
        ("/api/messaging/producer/chats/u-minji/messages", producer),
    ]:
        full = get_page(client, path, headers, limit=50)
        selected = [m for m in full["items"] if m["messageId"] in expected]
        assert [m["messageId"] for m in selected] == expected
        sequences = [m["sequence"] for m in selected]
        assert all(isinstance(n, int) for n in sequences)
        assert sequences == sorted(set(sequences))
        views.append({m["messageId"]: m["sequence"] for m in selected})
        cursor, visited, collected = None, set(), []
        while True:
            page = get_page(
                client, path, headers, limit=2, **({"cursor": cursor} if cursor else {})
            )
            collected = page["items"] + collected
            cursor = page["nextCursor"]
            if not cursor:
                break
            assert cursor not in visited, "pagination must advance"
            visited.add(cursor)
        assert len(collected) == len({m["messageId"] for m in collected})
        assert [m["messageId"] for m in collected if m["messageId"] in expected] == expected
        assert {
            m["messageId"]: m["sequence"] for m in collected if m["messageId"] in expected
        } == views[-1]
    assert views[0] == views[1]


def test_AC_12_1_post_and_both_read_views_expose_the_same_saved_sequence(client, login):
    consumer, producer = login("u-minji"), login("u-kang")
    sent = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=consumer | key(),
        json={"text": "순서 확인용 질문"},
    )
    assert sent.status_code == 200, sent.text
    question = sent.json()["message"]
    replied = client.post(
        "/api/messaging/producer/chats/u-minji/messages",
        headers=producer | key(),
        json={"text": "순서 확인용 답", "answerToEscalationIds": []},
    )
    assert replied.status_code == 200, replied.text
    answer = replied.json()["message"]
    assert question["sequence"] < answer["sequence"]
    for path, headers in [
        ("/api/messaging/chats/f-kang/messages", consumer),
        ("/api/messaging/producer/chats/u-minji/messages", producer),
    ]:
        rows = get_page(client, path, headers, limit=50)["items"]
        for message in (question, answer):
            got = next(m for m in rows if m["messageId"] == message["messageId"])
            assert got["sequence"] == message["sequence"]


def test_AC_13_2_forwarded_summary_is_null_in_post_and_historical_views(client, login):
    consumer, producer = login("u-seojun"), login("u-kang")
    response = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=consumer | key(),
        json={"text": "농약은 얼마나 치세요?"},
    )
    assert response.status_code == 200, response.text
    forwarded = response.json()["reply"]
    assert forwarded["handoffStatus"] == "FORWARDED"
    assert forwarded["sourceSummary"] is None
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(ThreadMessage)
            .where(ThreadMessage.id == forwarded["messageId"])
            .values(source_summary="HANDOFF 내부 분류 근거 — 소비자에게 노출되면 안 됨")
        )
    for path, headers in [
        ("/api/messaging/chats/f-kang/messages", consumer),
        ("/api/messaging/producer/chats/u-seojun/messages", producer),
    ]:
        rows = get_page(client, path, headers, limit=50)["items"]
        got = next(m for m in rows if m["messageId"] == forwarded["messageId"])
        assert got["sourceSummary"] is None
        assert got["sequence"] == forwarded["sequence"]


def test_AC_13_4_answer_evidence_summary_is_not_removed(client, login):
    consumer = login("u-minji")
    response = client.post(
        "/api/messaging/chats/f-halla/messages",
        headers=consumer | key(),
        json={"text": "배송비는 얼마예요?"},
    )
    assert response.status_code == 200, response.text
    answer = response.json()["reply"]
    assert answer["handoffStatus"] is None
    assert answer["sourceSummary"]
    rows = get_page(client, "/api/messaging/chats/f-halla/messages", consumer, limit=50)["items"]
    got = next(m for m in rows if m["messageId"] == answer["messageId"])
    assert got["sourceSummary"] == answer["sourceSummary"]
