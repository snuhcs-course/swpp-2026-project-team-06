"""Own-message text edits through public HTTP contracts, independent of implementation."""

from datetime import datetime
from uuid import uuid4

import pytest


def _key():
    return {"Idempotency-Key": str(uuid4())}


def _metadata_times(value, field=None):
    """Compare timestamp instants independently of their serialized offsets."""
    if isinstance(value, dict):
        return {key: _metadata_times(item, key) for key, item in value.items()}
    if isinstance(value, list):
        return [_metadata_times(item) for item in value]
    if isinstance(value, str) and field in {
        "createdAt",
        "editedAt",
        "serverNow",
        "humanReplyUntil",
        "updatedAt",
        "answeredAt",
        "resolvedAt",
        "lastReadAt",
    }:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def _ok(response):
    assert response.status_code == 200, response.text
    return _metadata_times(response.json())


def _thread_edit_invariants(before, after):
    # An edit may advance the revision to invalidate an in-flight AI answer.
    # Identity, read state, response policy and pause remain unchanged.
    assert after["version"] >= before["version"]
    assert {key: value for key, value in after.items() if key != "version"} == {
        key: value for key, value in before.items() if key != "version"
    }
    assert after["aiMode"] == before["aiMode"]
    assert after["humanReplyUntil"] == before["humanReplyUntil"]


def _send(client, headers, text, producer=False, **extra):
    path = (
        "/api/messaging/producer/chats/u-seojun/messages"
        if producer
        else "/api/messaging/chats/f-kang/messages"
    )
    return _ok(client.post(path, headers=headers | _key(), json={"text": text, **extra}))


def _page(client, headers, producer=False):
    path = (
        "/api/messaging/producer/chats/u-seojun/messages"
        if producer
        else "/api/messaging/chats/f-kang/messages"
    )
    return _ok(client.get(path, headers=headers))


def _room(client, headers=None, farm="f-kang"):
    return _ok(client.get(f"/api/messaging/rooms/{farm}/messages", headers=headers))


def _edit(client, headers, message, text, *, room=False, version=None, key=None):
    path = (
        f"/api/messaging/rooms/f-kang/messages/{message['messageId']}"
        if room
        else f"/api/messaging/messages/{message['messageId']}"
    )
    return client.patch(
        path,
        headers=headers | (key or _key()),
        json={"text": text, "version": message["editVersion"] if version is None else version},
    )


def _room_send(client, headers, text):
    return _ok(
        client.post(
            "/api/messaging/rooms/f-kang/messages", headers=headers | _key(), json={"text": text}
        )
    )


def _unchanged_except_edit(original, edited):
    assert {k: v for k, v in edited.items() if k not in {"body", "editedAt", "editVersion"}} == {
        k: v for k, v in original.items() if k not in {"body", "editedAt", "editVersion"}
    }


@pytest.mark.parametrize("producer_send", [False, True])
def test_own_private_text_edit_persists_without_new_message_or_other_side_effects(
    client, login, producer_send
):
    consumer, producer = login("u-seojun"), login("u-kang")
    # Establish a human pause before either actor edits; editing cannot extend it.
    _send(client, producer, "직접 확인하고 있습니다", producer=True)
    actor = producer if producer_send else consumer
    original = _send(client, actor, "수정 전 안내", producer=producer_send)["message"]
    assert original["editedAt"] is None
    assert original["editVersion"] == 0
    before_consumer = _page(client, consumer)
    before_producer = _page(client, producer, True)
    edited = _ok(_edit(client, actor, original, "수정한 안내"))
    assert edited["body"] == "수정한 안내"
    assert edited["editedAt"] is not None
    assert edited["editVersion"] == 1
    _unchanged_except_edit(original, edited)
    for headers, is_producer, before in (
        (consumer, False, before_consumer),
        (producer, True, before_producer),
    ):
        after = _page(client, headers, is_producer)
        _thread_edit_invariants(before["thread"], after["thread"])
        assert [m["messageId"] for m in after["items"]] == [m["messageId"] for m in before["items"]]
        assert next(m for m in after["items"] if m["messageId"] == original["messageId"]) == edited


def test_producer_broadcast_edit_is_visible_to_followers_and_public(client, login):
    producer, consumer = login("u-kang"), login("u-minji")
    # Public news creation supports photos; editing must retain the media.
    posted = _ok(
        client.post(
            "/api/messaging/news",
            headers=producer | _key(),
            json={
                "body": "오늘 수확 소식",
                "photos": ["/photos/basket.jpg"],
                "visibility": "PUBLIC",
            },
        )
    )
    original = next(
        m for m in _room(client, producer)["items"] if m["messageId"] == posted["broadcastId"]
    )
    assert original["editVersion"] == 0
    edited = _ok(_edit(client, producer, original, "내일 수확 소식", room=True))
    assert edited["editedAt"] is not None
    assert edited["editVersion"] == 1
    _unchanged_except_edit(original, edited)
    for headers in (consumer, None):
        reloaded = next(
            m for m in _room(client, headers)["items"] if m["messageId"] == original["messageId"]
        )
        assert reloaded["body"] == "내일 수확 소식"
        assert reloaded["editedAt"] == edited["editedAt"]
        assert reloaded["editVersion"] == 1


def test_consumer_news_reply_edit_stays_private_to_author_and_farmer(client, login):
    author, other, producer = login("u-seojun"), login("u-minji"), login("u-kang")
    original = _room_send(client, author, "소식에 남기는 답장")
    edited = _ok(_edit(client, author, original, "고친 소식 답장", room=True))
    assert edited["body"] == "고친 소식 답장"
    assert edited["editedAt"] is not None
    _unchanged_except_edit(original, edited)
    for headers in (author, producer):
        visible = next(
            m for m in _room(client, headers)["items"] if m["messageId"] == original["messageId"]
        )
        assert {k: v for k, v in visible.items() if k != "senderName"} == {
            k: v for k, v in edited.items() if k != "senderName"
        }
        assert visible["senderName"] == (original["senderName"] if headers == author else "이○○")
    for headers in (other, None):
        assert original["messageId"] not in {
            m["messageId"] for m in _room(client, headers)["items"]
        }
    rejected = _edit(client, producer, edited, "농가가 소비자 답장을 고칠 수 없음", room=True)
    assert rejected.status_code in (403, 404), rejected.text


@pytest.mark.parametrize("room", [False, True])
def test_other_person_cannot_edit_text(client, login, room):
    author, other = login("u-seojun"), login("u-minji")
    original = (
        _room_send(client, author, "작성자 원문")
        if room
        else _send(client, author, "작성자 원문")["message"]
    )
    response = _edit(client, other, original, "타인의 수정", room=room)
    assert response.status_code in (403, 404), response.text
    items = _room(client, author)["items"] if room else _page(client, author)["items"]
    assert next(m for m in items if m["messageId"] == original["messageId"]) == original


@pytest.mark.parametrize("room", [False, True])
def test_other_farm_cannot_edit_producer_text(client, login, other_farm_headers, room):
    producer = login("u-kang")
    original = (
        _room_send(client, producer, "농가 원문")
        if room
        else _send(client, producer, "농가 원문", producer=True)["message"]
    )
    rejected = _edit(client, other_farm_headers, original, "다른 농가 수정", room=room)
    assert rejected.status_code in (403, 404), rejected.text
    items = _room(client, producer)["items"] if room else _page(client, producer, True)["items"]
    assert next(m for m in items if m["messageId"] == original["messageId"]) == original


def test_ai_message_cannot_be_edited_and_consumer_edit_does_not_run_ai_again(client, login):
    consumer, producer = login("u-seojun"), login("u-kang")
    settings_response = client.get("/api/farms/me/ai-settings", headers=producer)
    assert settings_response.status_code == 200, settings_response.text
    settings = settings_response.json()
    _ok(
        client.put(
            "/api/farms/me/ai-settings",
            headers=producer | _key(),
            json={**settings, "enabled": True, "smallOrderPolicy": "1kg부터 주문할 수 있어요."},
        )
    )
    sent = _send(client, consumer, "소량 주문 되나요?")
    assert sent["reply"]["senderType"] == "AI"
    before = _page(client, consumer)
    for actor in (consumer, producer):
        rejected = _edit(client, actor, sent["reply"], "AI 답을 직접 고칠 수 없음")
        assert rejected.status_code in (403, 404), rejected.text
    edited = _ok(_edit(client, consumer, sent["message"], "배송은 언제 오나요?"))
    after = _page(client, consumer)
    _thread_edit_invariants(before["thread"], after["thread"])
    assert [m["messageId"] for m in after["items"]] == [m["messageId"] for m in before["items"]]
    assert (
        next(m for m in after["items"] if m["messageId"] == sent["reply"]["messageId"])
        == sent["reply"]
    )
    assert (
        next(m for m in after["items"] if m["messageId"] == edited["messageId"])["body"]
        == edited["body"]
    )


@pytest.mark.parametrize("room", [False, True])
def test_stale_edit_version_rejected_and_idempotent_retry_changes_once(client, login, room):
    actor = login("u-seojun")
    original = (
        _room_send(client, actor, "첫 원문") if room else _send(client, actor, "첫 원문")["message"]
    )
    key = _key()
    first = _ok(_edit(client, actor, original, "첫 수정", room=room, key=key))
    retry = _ok(_edit(client, actor, original, "첫 수정", room=room, key=key))
    assert retry == first
    stale = _edit(client, actor, original, "오래된 화면에서 수정", room=room)
    assert stale.status_code == 409, stale.text
    items = _room(client, actor)["items"] if room else _page(client, actor)["items"]
    assert next(m for m in items if m["messageId"] == original["messageId"]) == first
    second = _ok(_edit(client, actor, first, "두 번째 수정", room=room))
    assert second["editVersion"] == 2


@pytest.mark.parametrize("room", [False, True])
def test_identical_text_is_noop_and_edits_trim_and_mask_contact_details(client, login, room):
    actor = login("u-seojun")
    original = (
        _room_send(client, actor, "원문 그대로")
        if room
        else _send(client, actor, "원문 그대로")["message"]
    )
    same = _ok(_edit(client, actor, original, "원문 그대로", room=room))
    assert same == original
    assert same["editedAt"] is None
    assert same["editVersion"] == 0
    edited = _ok(_edit(client, actor, original, "  010-1234-5678로 연락 주세요  ", room=room))
    assert edited["body"] == "●●●-●●●●-●●●●로 연락 주세요"
    if not room:
        assert edited["masked"] is True
    assert edited["editVersion"] == 1
    assert edited["editedAt"] is not None


@pytest.mark.parametrize(
    "kind,limit", [("private", 1000), ("consumer_room", 1000), ("broadcast", 2000)]
)
def test_empty_and_over_limit_edits_rejected_without_writes(client, login, kind, limit):
    room = kind != "private"
    actor = login("u-kang") if kind == "broadcast" else login("u-seojun")
    original = (
        _room_send(client, actor, "길이 제한 원문")
        if room
        else _send(client, actor, "길이 제한 원문")["message"]
    )
    for invalid in ("", "   ", "가" * (limit + 1)):
        rejected = _edit(client, actor, original, invalid, room=room)
        assert rejected.status_code in (400, 413, 422), rejected.text
        items = _room(client, actor)["items"] if room else _page(client, actor)["items"]
        assert next(m for m in items if m["messageId"] == original["messageId"]) == original
    at_limit = _ok(_edit(client, actor, original, "가" * limit, room=room))
    assert at_limit["body"] == "가" * limit


def test_quoted_message_edit_preserves_original_quote_snapshot(client, login):
    consumer, producer = login("u-seojun"), login("u-kang")
    original = _send(client, producer, "인용 당시 안내", producer=True)["message"]
    quote = _send(client, consumer, "그 안내에 대한 답장", replyToMessageId=original["messageId"])[
        "message"
    ]
    assert quote["replyTo"]["body"] == "인용 당시 안내"
    _ok(_edit(client, producer, original, "나중에 바뀐 안내"))
    for headers, producer_view in ((consumer, False), (producer, True)):
        reloaded = next(
            m
            for m in _page(client, headers, producer_view)["items"]
            if m["messageId"] == quote["messageId"]
        )
        assert reloaded["replyTo"] == quote["replyTo"]
        assert reloaded["replyToMessageId"] == original["messageId"]


def test_private_text_edit_keeps_bound_attachment_and_download_bytes(client, login):
    from tests.test_settings_inquiries import png, upload

    actor = login("u-seojun")
    thread_id = _page(client, actor)["thread"]["threadId"]
    attachment = _ok(upload(client, actor, png(), threadId=thread_id))
    attachment_id = attachment["attachmentId"]
    original = _send(client, actor, "사진 설명 원문", attachmentIds=[attachment_id])["message"]
    before = client.get(f"/api/messaging/attachments/{attachment_id}", headers=actor)
    assert before.status_code == 200
    edited = _ok(_edit(client, actor, original, "사진 설명 수정"))
    assert edited["attachmentIds"] == [attachment_id]
    _unchanged_except_edit(original, edited)
    after = client.get(f"/api/messaging/attachments/{attachment_id}", headers=actor)
    assert after.status_code == 200
    assert after.content == before.content
