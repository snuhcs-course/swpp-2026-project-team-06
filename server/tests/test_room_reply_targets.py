"""소식 카드 답장 대상과 소비자 비공개 사진 답장 (DEV-467, AC-15-12·13, M-19) HTTP 계약."""

import struct
import zlib
from uuid import uuid4

ROOM = "/api/messaging/rooms/f-kang"


def _key():
    return {"Idempotency-Key": str(uuid4())}


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def _items(client, headers):
    return {
        m["messageId"]: m
        for m in _ok(client.get(f"{ROOM}/messages", headers=headers, params={"limit": 50}))["items"]
    }


def _post(client, headers, **body):
    return client.post(f"{ROOM}/messages", headers=headers | _key(), json=body)


def _png() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    parts = [
        chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)),
        chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")),
        chunk(b"IEND", b""),
    ]
    return b"\x89PNG\r\n\x1a\n" + b"".join(parts)


def _upload(client, headers, **resource):
    return client.post(
        "/api/messaging/attachments",
        headers=headers,
        files={"file": ("a.png", _png(), "image/png")},
        data=resource,
    )


def _photo(client, headers, farm="f-kang"):
    return _ok(_upload(client, headers, roomFarmId=farm))["attachmentId"]


# ---------------- AC-15-12 고른 소식에 답장 ----------------


def test_AC_15_12_reply_links_to_the_tapped_broadcast_not_the_latest(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    before = _items(client, producer)
    assert before["n-1"]["replyCount"] == 2 and before["n-2"]["replyCount"] == 0

    # 더 오래된 소식 n-2 카드에서 ‘농가에 답장’ → 그 소식의 답장으로 센다
    reply = _ok(_post(client, minji, text="하우스 사진 좋아요", broadcastId="n-2"))
    assert reply["broadcastId"] is None and reply["senderRole"] == "CONSUMER"
    after = _items(client, producer)
    assert after["n-2"]["replyCount"] == 1
    assert after["n-1"]["replyCount"] == 2

    # 팬 답장 시트도 n-2 아래에 묶인다
    sheet = _ok(client.get(f"{ROOM}/broadcasts/n-2/replies", headers=producer))
    assert [r["messageId"] for r in sheet["items"]] == [reply["messageId"]]
    assert sheet["unreadCount"] == 1
    latest = _ok(client.get(f"{ROOM}/broadcasts/n-1/replies", headers=producer))
    assert reply["messageId"] not in [r["messageId"] for r in latest["items"]]


def test_AC_15_12_omitted_target_keeps_latest_broadcast_default(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    _ok(_post(client, minji, text="옛 앱 답장"))
    counts = _items(client, producer)
    assert counts["n-1"]["replyCount"] == 3
    assert counts["n-2"]["replyCount"] == 0


def test_AC_15_12_target_must_be_a_live_broadcast_of_this_farm(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    # 남의 농가 소식·소비자 답장·없는 소식
    for target in ("n-3", "reply-1", "n-missing"):
        assert _post(client, minji, text="답장", broadcastId=target).status_code == 404
    # 지운 소식
    assert client.delete("/api/messaging/news/n-2", headers=producer).status_code == 204
    assert _post(client, minji, text="답장", broadcastId="n-2").status_code == 404
    # 생산자 방송에는 답할 소식을 고를 수 없다(방송 계약은 그대로)
    assert _post(client, producer, text="소식", broadcastId="n-1").status_code == 400
    # 팔로우를 끊은 소비자는 여전히 답장할 수 없다(AC-15-8)
    assert client.delete("/api/farms/f-kang/follow", headers=minji).status_code in (200, 204)
    assert _post(client, minji, text="답장", broadcastId="n-1").status_code == 403


def test_AC_15_12_other_consumers_never_see_the_targeted_reply(client, login):
    minji, seojun = login("u-minji"), login("u-seojun")
    reply = _ok(_post(client, minji, text="김민지만 쓴 답장", broadcastId="n-2"))
    assert reply["messageId"] not in _items(client, seojun)
    assert reply["messageId"] not in _items(client, None)


# ---------------- AC-15-13 소비자 비공개 사진 답장 ----------------


def test_AC_15_13_consumer_reply_with_photos_is_private_to_author_and_farm(
    client, login, other_farm_headers
):
    minji, seojun, producer = login("u-minji"), login("u-seojun"), login("u-kang")
    first, second = _photo(client, minji), _photo(client, minji)
    # 사진만 보내도 된다(1:1과 같음)
    reply = _ok(_post(client, minji, text="", broadcastId="n-1", attachmentIds=[first, second]))
    assert reply["attachmentIds"] == [first, second]
    assert reply["photos"] == [] and reply["body"] == ""

    # 본인과 그 농가 생산자만 목록·사진을 본다
    assert _items(client, minji)[reply["messageId"]]["attachmentIds"] == [first, second]
    assert _items(client, producer)[reply["messageId"]]["attachmentIds"] == [first, second]
    for viewer, status in ((minji, 200), (producer, 200)):
        assert client.get(f"/api/messaging/attachments/{first}", headers=viewer).status_code == (
            status
        )
    for stranger in (seojun, other_farm_headers):
        assert client.get(f"/api/messaging/attachments/{first}", headers=stranger).status_code == (
            404
        )
    assert reply["messageId"] not in _items(client, seojun)

    # 팬 답장 시트에도 사진 id가 나온다
    sheet = _ok(client.get(f"{ROOM}/broadcasts/n-1/replies", headers=producer))
    row = next(r for r in sheet["items"] if r["messageId"] == reply["messageId"])
    assert row["attachmentIds"] == [first, second]
    # 방 목록 미리보기는 ‘사진’
    rooms = _ok(client.get("/api/messaging/rooms", headers=minji))["items"]
    assert next(r for r in rooms if r["farmId"] == "f-kang")["lastMessage"] == "사진"


def test_AC_15_13_photo_upload_needs_a_follower_of_that_room(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    assert _upload(client, None, roomFarmId="f-kang").status_code == 401
    # 생산자 방송 사진은 공개 소식 미디어로 올린다
    assert _upload(client, producer, roomFarmId="f-kang").status_code == 403
    # 자원은 하나만
    assert _upload(client, minji, roomFarmId="f-kang", threadId="t-1").status_code == 400
    assert client.delete("/api/farms/f-kang/follow", headers=minji).status_code in (200, 204)
    assert _upload(client, minji, roomFarmId="f-kang").status_code == 403


def test_AC_15_13_photos_follow_the_same_limits_as_private_chat_photos(client, login):
    minji, seojun = login("u-minji"), login("u-seojun")
    ids = [_photo(client, minji) for _ in range(4)]
    # 서로 다른 3장까지
    assert _post(client, minji, text="사진", attachmentIds=ids).status_code == 400
    assert _post(client, minji, text="사진", attachmentIds=[ids[0], ids[0]]).status_code == 400
    # 남의 사진·없는 사진
    other = _photo(client, seojun)
    assert _post(client, minji, text="사진", attachmentIds=[other]).status_code == 404
    assert _post(client, minji, text="사진", attachmentIds=["att-missing"]).status_code == 404
    # 형식 검사는 1:1 업로드와 같다
    bad = client.post(
        "/api/messaging/attachments",
        headers=minji,
        files={"file": ("a.png", b"not an image", "image/png")},
        data={"roomFarmId": "f-kang"},
    )
    assert bad.status_code == 400
    # 한 번 묶인 사진은 다시 쓰지 못한다
    sent = _ok(_post(client, minji, text="한 장", attachmentIds=[ids[0]]))
    assert sent["attachmentIds"] == [ids[0]]
    assert _post(client, minji, text="또", attachmentIds=[ids[0]]).status_code == 404
    # 글도 사진도 없으면 거부
    assert _post(client, minji, text="  ").status_code == 400
    # 남은 소식방 사진은 그대로 쓸 수 있다
    assert _post(client, minji, text="사진", attachmentIds=[ids[1]]).status_code == 200


def test_AC_15_13_room_photos_cannot_be_reused_in_private_chat(client, login):
    minji = login("u-minji")
    room_photo = _photo(client, minji)
    response = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=minji | _key(),
        json={"text": "사진", "attachmentIds": [room_photo]},
    )
    assert response.status_code == 404


def test_AC_15_13_photo_reply_can_be_edited_to_empty_text_but_text_reply_cannot(client, login):
    minji = login("u-minji")
    photo = _photo(client, minji)
    with_photo = _ok(_post(client, minji, text="사진 설명", attachmentIds=[photo]))
    edited = client.patch(
        f"{ROOM}/messages/{with_photo['messageId']}",
        headers=minji | _key(),
        json={"text": "  ", "version": with_photo["editVersion"]},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["body"] == "" and edited.json()["attachmentIds"] == [photo]
    text_only = _ok(_post(client, minji, text="글만"))
    empty = client.patch(
        f"{ROOM}/messages/{text_only['messageId']}",
        headers=minji | _key(),
        json={"text": "", "version": text_only["editVersion"]},
    )
    assert empty.status_code == 400


def test_AC_15_12_AC_15_13_send_errors_carry_reasons_for_the_app(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    assert client.delete("/api/messaging/news/n-2", headers=producer).status_code == 204
    gone = _post(client, minji, text="답장", broadcastId="n-2")
    assert gone.status_code == 404
    assert gone.json()["details"]["reason"] == "REPLY_TARGET_GONE"
    unusable = _post(client, minji, text="사진", attachmentIds=["att-missing"])
    assert unusable.status_code == 404
    assert unusable.json()["details"]["reason"] == "ATTACHMENT_UNUSABLE"


def test_AC_15_12_AC_15_13_producer_field_errors_name_the_field_sent(client, login):
    """생산자가 답장 전용 칸을 보내면 그 칸 이름으로 400을 받는다(재스캔 지적)."""
    producer = login("u-kang")
    photos_only = _post(client, producer, text="방송", attachmentIds=["att-any"])
    assert photos_only.status_code == 400, photos_only.text
    fields = photos_only.json()["details"]["fields"]
    assert "attachmentIds" in fields and "broadcastId" not in fields
    target_only = _post(client, producer, text="방송", broadcastId="n-1")
    assert target_only.status_code == 400, target_only.text
    fields = target_only.json()["details"]["fields"]
    assert "broadcastId" in fields and "attachmentIds" not in fields


def test_AC_15_13_photo_upload_needs_finished_signup(client, login):
    """가입을 마치지 않은 소비자는 답장 사진도 올리지 못한다(보내기와 같은 관문, 재스캔 지적)."""
    from app.accounts.models import User
    from app.core.db import get_sessionmaker

    minji = login("u-minji")
    with get_sessionmaker()() as db, db.begin():
        db.get(User, "u-minji").nickname = None
        db.get(User, "u-minji").is_test_account = False
    response = _upload(client, minji, roomFarmId="f-kang")
    assert response.status_code == 403, response.text
    assert response.json()["details"]["reason"] == "ONBOARDING_REQUIRED"
