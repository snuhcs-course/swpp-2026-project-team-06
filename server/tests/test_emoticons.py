"""DEV-468: standalone emoticons, public HTTP contract (implementation blind)."""

from uuid import uuid4

import pytest

EMOTICONS = [
    ("farmclub-reserved", "예약했어요"),
    ("farmclub-paid", "입금했어요"),
    ("farmclub-packing", "포장 중이에요"),
    ("farmclub-shipping", "오늘 출하해요"),
    ("farmclub-arrived", "잘 도착했어요"),
    ("farmclub-delicious", "맛있어요"),
    ("farmclub-wait", "잠시만요"),
    ("farmclub-check", "확인 부탁해요"),
    ("farmclub-thanks", "고마워요"),
    ("farmclub-sorry", "미안해요"),
]
CHAT = "/api/messaging/chats/f-kang/messages"
PRODUCER_CHAT = "/api/messaging/producer/chats/u-minji/messages"
ROOM = "/api/messaging/rooms/f-kang/messages"
NEWS = "/api/messaging/news"
SURFACES = [
    (CHAT, "u-minji", "text", CHAT),
    (PRODUCER_CHAT, "u-kang", "text", CHAT),
    (ROOM, "u-minji", "text", ROOM),
    (ROOM, "u-kang", "text", ROOM),
    (NEWS, "u-kang", "body", "/api/messaging/farms/f-kang/news"),
]


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def _post(client, path, headers, body, request_key=None):
    return client.post(
        path, headers=headers | {"Idempotency-Key": request_key or str(uuid4())}, json=body
    )


def _items(client, path, headers):
    return _ok(client.get(path, headers=headers, params={"limit": 50}))["items"]


def _message(body):
    return body.get("message", body)


def _assert_emoticon(message, emoticon_id, caption):
    assert message["emoticonId"] == emoticon_id
    assert message["body"] == caption
    assert not message.get("attachmentIds")
    assert not message.get("photos")
    assert not message.get("videos")


@pytest.mark.parametrize("emoticon_id,caption", EMOTICONS)
@pytest.mark.parametrize("path,user,text_field,reload", SURFACES)
def test_AC_12_21_AC_15_14_every_emoticon_survives_send_and_reload(
    client, login, path, user, text_field, reload, emoticon_id, caption
):
    headers = login(user)
    body = {text_field: "", "emoticonId": emoticon_id}
    if path == NEWS:
        body.update(farmId="f-kang", visibility="PUBLIC", photos=[], videos=[])
    sent = _message(_ok(_post(client, path, headers, body)))
    if path != NEWS:
        _assert_emoticon(sent, emoticon_id, caption)
    identifier = "broadcastId" if path == NEWS else "messageId"
    reader = login("u-minji")
    stored = next(m for m in _items(client, reload, reader) if m[identifier] == sent[identifier])
    _assert_emoticon(stored, emoticon_id, caption)


INVALID = [
    {"emoticonId": "farmclub-unknown"},
    {"emoticonId": "farmclub-thanks", "mixed_text": True},
    {"emoticonId": "farmclub-thanks", "attachmentIds": ["not-an-attachment"]},
    {"emoticonId": "farmclub-thanks", "photos": ["/photos/basket.jpg"]},
    {"emoticonId": "farmclub-thanks", "videos": ["/videos/harvest.mp4"]},
    {},
]


@pytest.mark.parametrize(
    "path,user,text_field,reload,invalid",
    [
        (*surface, invalid)
        for surface in SURFACES
        for invalid in INVALID
        if not (surface[0] != NEWS and ("photos" in invalid or "videos" in invalid))
        and not (surface[0] == NEWS and "attachmentIds" in invalid)
    ],
)
def test_AC_12_21_AC_15_14_invalid_send_never_persists(
    client, login, path, user, text_field, reload, invalid
):
    reader = login("u-minji")
    before = _items(client, reload, reader)
    body = {text_field: "", **invalid}
    if body.pop("mixed_text", False):
        body[text_field] = "같이 보낸 글"
    if path == NEWS:
        body.update(farmId="f-kang", visibility="PUBLIC")
    response = _post(client, path, login(user), body)
    assert 400 <= response.status_code < 500, response.text
    assert _items(client, reload, reader) == before


@pytest.mark.parametrize("user", ["u-minji", "u-seojun"])
def test_AC_12_21_consumer_emoticon_never_calls_ai_or_creates_human_request(
    client, login, monkeypatch, user
):
    from app.ai import service as ai

    def unexpected_ai(*args, **kwargs):
        pytest.fail("An emoticon must never invoke AI")

    monkeypatch.setattr(ai, "answer_question", unexpected_ai)
    producer = login("u-kang")
    questions = "/api/messaging/questions?status=OPEN"

    def question_states():
        return [
            (q["escalationId"], q.get("status"))
            for q in _ok(client.get(questions, headers=producer))["items"]
        ]

    before = question_states()
    consumer = login(user)
    prior = _items(client, CHAT, consumer)
    sent = _ok(_post(client, CHAT, consumer, {"text": "", "emoticonId": "farmclub-thanks"}))
    assert sent["reply"] is None
    assert sent["message"]["needsHuman"] is False
    assert question_states() == before
    page = _items(client, CHAT, consumer)
    assert len(page) == len(prior) + 1
    assert page[-1]["messageId"] == sent["message"]["messageId"]


@pytest.mark.parametrize("path,user,text_field,reload", SURFACES)
def test_AC_12_21_AC_15_14_same_key_creates_one_emoticon(
    client, login, path, user, text_field, reload
):
    headers, request_key = login(user), str(uuid4())
    reader = login("u-minji")
    before = len(_items(client, reload, reader))
    body = {text_field: "", "emoticonId": "farmclub-check"}
    if path == NEWS:
        body.update(farmId="f-kang", visibility="PUBLIC")
    first = _ok(_post(client, path, headers, body, request_key))
    assert _ok(_post(client, path, headers, body, request_key)) == first
    assert len(_items(client, reload, reader)) == before + 1


@pytest.mark.parametrize("path,edit_prefix", [(CHAT, "/api/messaging/messages"), (ROOM, ROOM)])
def test_AC_12_21_AC_15_14_emoticon_is_immutable_but_null_id_text_remains_editable(
    client, login, path, edit_prefix
):
    headers = login("u-minji")
    emoticon = _message(
        _ok(_post(client, path, headers, {"text": "", "emoticonId": "farmclub-paid"}))
    )
    edited = client.patch(
        f"{edit_prefix}/{emoticon['messageId']}",
        headers=headers | {"Idempotency-Key": str(uuid4())},
        json={"text": "새 글", "version": emoticon["editVersion"]},
    )
    assert 400 <= edited.status_code < 500, edited.text
    stored = next(
        m for m in _items(client, path, headers) if m["messageId"] == emoticon["messageId"]
    )
    _assert_emoticon(stored, "farmclub-paid", "입금했어요")
    text = _message(_ok(_post(client, path, headers, {"text": "처음 글", "emoticonId": None})))
    result = _ok(
        client.patch(
            f"{edit_prefix}/{text['messageId']}",
            headers=headers | {"Idempotency-Key": str(uuid4())},
            json={"text": "고친 글", "version": text["editVersion"]},
        )
    )
    assert _message(result)["body"] == "고친 글"
    assert not _message(result).get("emoticonId")
    assert 400 <= _post(client, path, headers, {"text": "", "emoticonId": None}).status_code < 500


def test_AC_15_14_private_reply_retains_target_and_is_only_visible_to_author_and_owner(
    client, login
):
    author, other, producer = login("u-minji"), login("u-seojun"), login("u-kang")
    sent = _ok(
        _post(
            client,
            ROOM,
            author,
            {"text": "", "broadcastId": "n-2", "emoticonId": "farmclub-delicious"},
        )
    )
    for headers in (author, producer):
        found = next(
            m for m in _items(client, ROOM, headers) if m["messageId"] == sent["messageId"]
        )
        _assert_emoticon(found, "farmclub-delicious", "맛있어요")
    for headers in (other, None):
        assert sent["messageId"] not in {m["messageId"] for m in _items(client, ROOM, headers)}
    replies = _items(client, "/api/messaging/rooms/f-kang/broadcasts/n-2/replies", producer)
    assert sent["messageId"] in {m["messageId"] for m in replies}
    assert sent["messageId"] not in {m["messageId"] for m in _items(client, CHAT, author)}


def test_AC_12_21_AC_15_14_emoticons_keep_follow_ownership_and_target_guards(client, login):
    consumer, producer = login("u-minji"), login("u-kang")
    payload = {"text": "", "emoticonId": "farmclub-thanks"}
    for target in ("n-3", "n-missing"):
        assert _post(client, ROOM, consumer, {**payload, "broadcastId": target}).status_code == 404
    assert (
        _post(client, "/api/messaging/rooms/f-halla/messages", producer, payload).status_code == 404
    )
    assert (
        _post(client, NEWS, consumer, {"body": "", "emoticonId": "farmclub-thanks"}).status_code
        == 403
    )
    assert _post(client, ROOM, producer, {**payload, "broadcastId": "n-2"}).status_code == 400
    assert client.delete("/api/farms/f-kang/follow", headers=consumer).status_code in (200, 204)
    before = _items(client, ROOM, producer)
    assert _post(client, ROOM, consumer, payload).status_code == 403
    assert _items(client, ROOM, producer) == before


def test_AC_12_21_emoticon_does_not_bypass_paid_chat_access(client, login):
    # Existing order-context tests establish that u-seojun has no f-halla order/thread.
    response = _post(
        client,
        "/api/messaging/chats/f-halla/messages",
        login("u-seojun"),
        {"text": "", "emoticonId": "farmclub-reserved"},
    )
    assert 400 <= response.status_code < 500, response.text


def test_AC_15_14_mixed_emoticon_does_not_consume_a_valid_private_photo(client, login):
    import base64

    headers = login("u-minji")
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
    )
    uploaded = _ok(
        client.post(
            "/api/messaging/attachments",
            headers=headers,
            data={"roomFarmId": "f-kang"},
            files={"file": ("a.png", png, "image/png")},
        )
    )
    attachment_id = uploaded["attachmentId"]
    before = _items(client, ROOM, headers)
    rejected = _post(
        client,
        ROOM,
        headers,
        {
            "text": "",
            "attachmentIds": [attachment_id],
            "emoticonId": "farmclub-arrived",
        },
    )
    assert 400 <= rejected.status_code < 500, rejected.text
    assert _items(client, ROOM, headers) == before
    photo = _ok(_post(client, ROOM, headers, {"text": "", "attachmentIds": [attachment_id]}))
    assert photo["attachmentIds"] == [attachment_id]
    assert not photo.get("emoticonId")
    stored = next(m for m in _items(client, ROOM, headers) if m["messageId"] == photo["messageId"])
    assert stored["attachmentIds"] == [attachment_id]
