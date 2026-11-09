"""Room quote behavior through HTTP, authored from the behavioral contract only."""

from datetime import datetime
from uuid import uuid4

import pytest


def _key():
    return {"Idempotency-Key": str(uuid4())}


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def _send(client, headers, text, *, farm="f-kang", target=None, key=None):
    body = {"text": text}
    if target is not None:
        body["replyToMessageId"] = target
    return client.post(
        f"/api/messaging/rooms/{farm}/messages",
        headers=headers | (key or _key()),
        json=body,
    )


def _page(client, headers=None, **params):
    return _ok(client.get("/api/messaging/rooms/f-kang/messages", headers=headers, params=params))


def _all_items(client, headers=None):
    """Exercise cursor filtering as well as the first page."""
    items, cursors = [], set()
    page = _page(client, headers, limit=1)
    while True:
        items.extend(page["items"])
        cursor = page["nextCursor"]
        if not cursor:
            return items
        assert cursor not in cursors, "Room cursor must make progress"
        cursors.add(cursor)
        page = _page(client, headers, limit=1, cursor=cursor)


def _get_message(client, headers, message_id):
    return next(m for m in _all_items(client, headers) if m["messageId"] == message_id)


def _edit(client, headers, message, text):
    return _ok(
        client.patch(
            f"/api/messaging/rooms/f-kang/messages/{message['messageId']}",
            headers=headers | _key(),
            json={"text": text, "version": message["editVersion"]},
        )
    )


def _normalize_times(value, field=None):
    if isinstance(value, dict):
        return {k: _normalize_times(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_times(v) for v in value]
    if isinstance(value, str) and field and field.endswith("At"):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(value, str) and field in {"serverNow", "humanReplyUntil"}:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def test_quote_shares_masked_snapshot_without_revealing_private_source(client, login):
    author, follower, producer = login("u-seojun"), login("u-minji"), login("u-kang")
    source = _ok(_send(client, author, "연락은 010-1234-5678, person@example.com로 부탁드려요"))
    quote = _ok(
        _send(
            client,
            producer,
            "010-9876-5432, farmer@example.com로 답변드릴게요",
            target=source["messageId"],
        )
    )
    expected = {
        "senderType": "CONSUMER",
        "body": "연락은 ●●●-●●●●-●●●●, [이메일 가림]로 부탁드려요",
    }
    assert quote["replyTo"] == expected
    assert quote["body"] == "●●●-●●●●-●●●●, [이메일 가림]로 답변드릴게요"
    assert quote["senderRole"] == "PRODUCER"
    assert quote["broadcastId"] == quote["messageId"]
    for headers in (author, follower, producer):
        visible = _get_message(client, headers, quote["messageId"])
        # Exact equality excludes author identity, source IDs and media in the quote.
        assert visible["replyTo"] == expected
        assert visible["body"] == quote["body"]
    for headers in (author, producer):
        assert _get_message(client, headers, source["messageId"])["body"] == source["body"]
    for headers in (follower, None):
        assert source["messageId"] not in {m["messageId"] for m in _all_items(client, headers)}
    assert quote["messageId"] not in {m["messageId"] for m in _all_items(client)}
    _ok(client.delete("/api/farms/f-kang/follow", headers=follower))
    assert quote["messageId"] not in {m["messageId"] for m in _all_items(client, follower)}
    _ok(client.put("/api/farms/f-kang/follow", headers=follower))
    assert _get_message(client, follower, quote["messageId"])["replyTo"] == expected


def test_source_edit_and_broadcast_edit_preserve_quote_snapshot(client, login):
    author, follower, producer = login("u-seojun"), login("u-minji"), login("u-kang")
    source = _ok(_send(client, author, "인용 시점의 질문"))
    quote = _ok(_send(client, producer, "첫 답변", target=source["messageId"]))
    expected = {"senderType": "CONSUMER", "body": "인용 시점의 질문"}
    assert quote["replyTo"] == expected
    _edit(client, author, source, "나중에 고친 질문")
    assert _get_message(client, follower, quote["messageId"])["replyTo"] == expected
    edited = _edit(client, producer, quote, "고친 답변 farmer@example.com")
    assert edited["body"] == "고친 답변 [이메일 가림]"
    assert edited["replyTo"] == expected
    for headers in (author, follower, producer):
        visible = _get_message(client, headers, quote["messageId"])
        assert visible["body"] == "고친 답변 [이메일 가림]"
        assert visible["replyTo"] == expected


def test_quote_idempotent_retry_creates_one_broadcast(client, login):
    author, follower, producer = login("u-seojun"), login("u-minji"), login("u-kang")
    source = _ok(_send(client, author, "반복 발송 질문"))
    before = {m["messageId"] for m in _all_items(client, producer)}
    key = _key()
    first = _ok(_send(client, producer, "반복 발송 답변", target=source["messageId"], key=key))
    retry = _ok(_send(client, producer, "반복 발송 답변", target=source["messageId"], key=key))
    assert retry == first
    after = _all_items(client, producer)
    assert {m["messageId"] for m in after} - before == {first["messageId"]}
    assert sum(m["messageId"] == first["messageId"] for m in _all_items(client, follower)) == 1


@pytest.mark.parametrize("own_target", [True, False])
def test_consumer_cannot_quote_room_reply(client, login, own_target):
    author, other = login("u-seojun"), login("u-minji")
    source = _ok(_send(client, author, "공유되지 않는 질문"))
    actor = author if own_target else other
    before = _all_items(client, actor)
    rejected = _send(client, actor, "소비자 인용 시도", target=source["messageId"])
    assert rejected.status_code == 403, rejected.text
    assert _all_items(client, actor) == before


@pytest.mark.parametrize("target_kind", ["missing", "cross_farm", "broadcast"])
def test_producer_quote_target_must_be_same_farm_consumer_reply(client, login, target_kind):
    author, producer = login("u-seojun"), login("u-kang")
    if target_kind == "missing":
        target = str(uuid4())
    elif target_kind == "cross_farm":
        _ok(client.put("/api/farms/f-halla/follow", headers=author))
        target = _ok(_send(client, author, "다른 농가의 질문", farm="f-halla"))["messageId"]
    else:
        target = _ok(_send(client, producer, "농가의 기존 방송"))["messageId"]
    before = _all_items(client, producer)
    rejected = _send(client, producer, "잘못된 대상 인용", target=target)
    assert rejected.status_code == 404, rejected.text
    assert _all_items(client, producer) == before


def test_quote_does_not_change_private_chat_or_ai_pause(client, login):
    author, producer = login("u-seojun"), login("u-kang")
    source = _ok(_send(client, author, "소식방에서만 한 질문"))
    paths = [
        ("/api/messaging/chats", author),
        ("/api/messaging/producer/chats", producer),
        ("/api/messaging/chats/f-kang/messages", author),
        ("/api/messaging/producer/chats/u-seojun/messages", producer),
    ]
    before = [_normalize_times(_ok(client.get(path, headers=headers))) for path, headers in paths]
    _ok(_send(client, producer, "팔로워에게 공개하는 답변", target=source["messageId"]))
    after = [_normalize_times(_ok(client.get(path, headers=headers))) for path, headers in paths]
    assert after == before


def test_selected_quote_version_rejects_changed_source_without_broadcast(client, login):
    author, producer = login("u-seojun"), login("u-kang")
    source = _ok(_send(client, author, "생산자가 선택했던 질문"))
    current = _edit(client, author, source, "선택 이후 수정된 질문")
    before = _all_items(client, producer)
    stale = client.post(
        "/api/messaging/rooms/f-kang/messages",
        headers=producer | _key(),
        json={
            "text": "오래된 질문을 보고 작성한 답변",
            "replyToMessageId": source["messageId"],
            "replyToVersion": source["editVersion"],
        },
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["details"]["reason"] == "STALE_VERSION"
    assert _all_items(client, producer) == before
    accepted = _ok(
        client.post(
            "/api/messaging/rooms/f-kang/messages",
            headers=producer | _key(),
            json={
                "text": "수정된 질문을 확인하고 작성한 답변",
                "replyToMessageId": current["messageId"],
                "replyToVersion": current["editVersion"],
            },
        )
    )
    assert accepted["replyTo"] == {"senderType": "CONSUMER", "body": "선택 이후 수정된 질문"}
    assert {m["messageId"] for m in _all_items(client, producer)} - {
        m["messageId"] for m in before
    } == {accepted["messageId"]}


def test_negative_selected_quote_version_is_rejected_without_broadcast(client, login):
    author, producer = login("u-seojun"), login("u-kang")
    source = _ok(_send(client, author, "버전 입력 검증 질문"))
    before = _all_items(client, producer)
    rejected = client.post(
        "/api/messaging/rooms/f-kang/messages",
        headers=producer | _key(),
        json={"text": "답변", "replyToMessageId": source["messageId"], "replyToVersion": -1},
    )
    assert rejected.status_code == 400, rejected.text
    assert rejected.json()["code"] == "VALIDATION_ERROR"
    assert "replyToVersion" in rejected.json()["details"]["fields"]
    assert _all_items(client, producer) == before
