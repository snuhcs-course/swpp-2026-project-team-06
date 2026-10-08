"""FEAT-32 농가 AI 응답 설정, FEAT-33 주문 문제 문의·비공개 사진 (contracts-1.2 5·6장)."""

import struct
import uuid
import zlib

from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.farms.models import FarmAiSettingsHistory
from app.orders.models import Order


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def png(with_text: bool = True) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    raw = zlib.compress(b"\x00\xff\x00\x00")
    parts = [chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))]
    if with_text:
        parts.append(chunk(b"tEXt", b"GPS\x0037.5,127.0"))
    parts += [chunk(b"IDAT", raw), chunk(b"IEND", b"")]
    return b"\x89PNG\r\n\x1a\n" + b"".join(parts)


def jpeg_with_exif() -> bytes:
    exif = b"Exif\x00\x00GPS-secret"
    app1 = b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif
    dqt = b"\xff\xdb" + struct.pack(">H", 3) + b"\x00"
    return b"\xff\xd8" + app1 + dqt + b"\xff\xda\x00\x02image-data\xff\xd9"


def upload(client, headers, data, name="a.png", mime="image/png", **resource):
    return client.post(
        "/api/messaging/attachments",
        headers=headers,
        files={"file": (name, data, mime)},
        data=resource,
    )


def settings_body(**overrides):
    body = {
        "enabled": True,
        "version": 1,
        "smallOrderPolicy": "1박스부터 주문할 수 있어요.",
        "reservationShippingPolicy": "",
        "faqs": [{"question": "선물 포장 되나요?", "answer": "선물용 상자에 담아 보내드려요."}],
        "handoffTopics": ["택배사 변경"],
    }
    return body | overrides


# ---------------- AI 응답 설정 (FEAT-32) ----------------


def test_AC_32_1_save_and_reload_settings(client, login):
    headers = login("u-kang")
    before = client.get("/api/farms/me/ai-settings", headers=headers).json()
    saved = client.put("/api/farms/me/ai-settings", headers=headers | key(), json=settings_body())
    reloaded = client.get("/api/farms/me/ai-settings", headers=headers).json()

    assert before["version"] == 1 and before["enabled"] is True
    assert saved.status_code == 200, saved.text
    assert reloaded["version"] == 2
    assert reloaded["faqs"][0]["question"] == "선물 포장 되나요?"
    assert reloaded["faqs"][0]["id"]
    with get_sessionmaker()() as session:
        history = session.scalars(select(FarmAiSettingsHistory)).all()
    assert [h.version for h in history] == [2]


def test_AC_32_4_stale_version_rejected(client, login):
    headers = login("u-kang")
    client.put("/api/farms/me/ai-settings", headers=headers | key(), json=settings_body())

    stale = client.put("/api/farms/me/ai-settings", headers=headers | key(), json=settings_body())

    assert stale.status_code == 409
    assert stale.json()["details"]["reason"] == "STALE_VERSION"


def test_AC_32_4_only_approved_producer(client, login):
    assert client.get("/api/farms/me/ai-settings", headers=login("u-minji")).status_code == 403
    assert client.get("/api/farms/me/ai-settings", headers=login("u-misook")).status_code == 403


def test_settings_limits(client, login):
    body = settings_body(faqs=[{"question": "q", "answer": "a"}] * 21)

    response = client.put("/api/farms/me/ai-settings", headers=login("u-kang") | key(), json=body)

    assert response.status_code == 400


def test_AC_32_3_preview_answers_without_writing(client, login):
    headers = login("u-kang")
    temp = client.post(
        "/api/farms/me/ai-settings/preview",
        headers=headers,
        json={"question": "선물 포장 되나요?", "settings": settings_body()},
    ).json()
    saved_preview = client.post(
        "/api/farms/me/ai-settings/preview", headers=headers, json={"question": "선물 포장 되나요?"}
    ).json()

    assert temp["action"] == "ANSWER"
    assert temp["settingsVersion"] is None
    assert saved_preview["action"] == "HANDOFF"
    assert saved_preview["settingsVersion"] == 1
    assert client.get("/api/farms/me/ai-settings", headers=headers).json()["version"] == 1


def test_AC_32_2_unsafe_faq_is_not_used(client, login):
    body = settings_body(
        faqs=[{"question": "환불 되나요?", "answer": "무조건 전액 환불해 드려요."}],
    )

    preview = client.post(
        "/api/farms/me/ai-settings/preview",
        headers=login("u-kang"),
        json={"question": "환불 되나요?", "settings": body},
    ).json()

    assert preview["action"] == "HANDOFF"
    assert preview["answer"] is None


def test_preview_with_product_and_handoff_topic(client, login):
    headers = login("u-kang")
    product = client.post(
        "/api/farms/me/ai-settings/preview",
        headers=headers,
        json={"question": "배송비 얼마예요?", "productId": "p-house"},
    ).json()
    topic = client.post(
        "/api/farms/me/ai-settings/preview",
        headers=headers,
        json={"question": "택배사 변경 가능해요?", "settings": settings_body()},
    ).json()
    other = client.post(
        "/api/farms/me/ai-settings/preview",
        headers=headers,
        json={"question": "배송비?", "productId": "p-noji"},
    )

    assert product["action"] == "ANSWER"
    assert product["sourceRefs"] == ["product:p-house"]
    assert topic["action"] == "HANDOFF"
    assert other.status_code == 404


def test_saved_disabled_settings_stop_ai_replies(client, login):
    client.put(
        "/api/farms/me/ai-settings",
        headers=login("u-kang") | key(),
        json=settings_body(enabled=False),
    )
    preview = client.post(
        "/api/farms/me/ai-settings/preview", headers=login("u-kang"), json={"question": "배송비?"}
    ).json()
    sent = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=login("u-seojun") | key(),
        json={"text": "배송은 언제예요?", "orderId": "o-38"},
    ).json()

    assert preview["action"] == "DISABLED"
    assert sent["reply"] is None


# ---------------- 비공개 사진 (AC-33-4) ----------------


def test_AC_33_4_upload_strips_metadata(client, login):
    headers = login("u-minji")
    uploaded = upload(client, headers, jpeg_with_exif(), "a.jpg", "image/jpeg", orderId="o-42")
    assert uploaded.status_code == 200, uploaded.text
    body = uploaded.json()

    image = client.get(f"/api/messaging/attachments/{body['attachmentId']}", headers=headers)

    assert body["mimeType"] == "image/jpeg"
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert b"GPS-secret" not in image.content
    assert image.content.startswith(b"\xff\xd8")

    png_upload = upload(client, headers, png(), orderId="o-42").json()
    png_bytes = client.get(
        f"/api/messaging/attachments/{png_upload['attachmentId']}", headers=headers
    )
    assert b"GPS" not in png_bytes.content


def test_AC_33_4_rejects_wrong_type_and_size(client, login):
    headers = login("u-minji")
    fake = upload(client, headers, b"not an image", "a.png", "image/png", orderId="o-42")
    mismatch = upload(client, headers, png(), "a.jpg", "image/jpeg", orderId="o-42")
    big = upload(client, headers, png() + b"\x00" * (10 * 1024 * 1024), orderId="o-42")
    neither = upload(client, headers, png())
    truncated = upload(client, headers, b"\xff\xd8\xff", "a.jpg", "image/jpeg", orderId="o-42")
    broken_png = upload(client, headers, png()[:20], orderId="o-42")
    header_only = upload(client, headers, png()[:8], orderId="o-42")

    assert fake.status_code == 400
    assert mismatch.status_code == 400
    assert big.status_code == 400
    assert neither.status_code == 400
    assert truncated.status_code == 400
    assert broken_png.status_code == 400
    assert header_only.status_code == 400


def test_AC_33_2_other_consumers_cannot_use_or_read(client, login):
    minji = login("u-minji")
    seojun = login("u-seojun")
    att = upload(client, minji, png(), orderId="o-42").json()["attachmentId"]

    upload_other = upload(client, seojun, png(), orderId="o-42")
    read_unbound = client.get(f"/api/messaging/attachments/{att}", headers=seojun)
    use = client.post(
        "/api/orders/o-38/inquiries",
        headers=seojun | key(),
        json={"type": "DAMAGE", "text": "상자가 찌그러졌어요", "attachmentIds": [att]},
    )

    assert upload_other.status_code == 404
    assert read_unbound.status_code == 404
    assert use.status_code == 404


# ---------------- 주문 문제 문의 (FEAT-33) ----------------


def test_AC_33_1_inquiry_received_once_with_order_context(client, login):
    headers = login("u-minji")
    att = upload(client, headers, png(), orderId="o-42").json()["attachmentId"]
    same = headers | key()
    body = {"type": "DAMAGE", "text": "상자가 젖어서 왔어요", "attachmentIds": [att]}

    first = client.post("/api/orders/o-42/inquiries", headers=same, json=body)
    second = client.post("/api/orders/o-42/inquiries", headers=same, json=body)

    assert first.status_code == 200, first.text
    created = first.json()
    assert first.json() == second.json()
    assert created["inquiry"]["status"] == "OPEN"
    assert created["inquiry"]["attachments"][0]["attachmentId"] == att
    assert created["message"]["orderId"] == "o-42"
    assert created["message"]["inquiryId"] == created["inquiry"]["inquiryId"]

    page = client.get("/api/messaging/chats/f-kang/messages", headers=headers).json()
    assert [i["inquiryId"] for i in page["inquiries"]] == [created["inquiry"]["inquiryId"]]
    assert page["thread"]["aiMode"] == "HUMAN"
    assert "o-42" in [o["orderId"] for o in page["orders"]]
    listed = client.get("/api/orders/o-42/inquiries", headers=headers).json()
    assert len(listed["items"]) == 1
    producer = client.get("/api/orders/o-42/inquiries", headers=login("u-kang"))
    assert producer.status_code == 200
    image = client.get(f"/api/messaging/attachments/{att}", headers=login("u-kang"))
    assert image.status_code == 200


def test_AC_33_1_unpaid_or_others_order_rejected(client, login):
    headers = login("u-seojun")
    others = client.post(
        "/api/orders/o-42/inquiries", headers=headers | key(), json={"type": "OTHER", "text": "x"}
    )
    with get_sessionmaker()() as session, session.begin():
        session.get(Order, "o-38").paid_at = None
    unpaid = client.post(
        "/api/orders/o-38/inquiries", headers=headers | key(), json={"type": "OTHER", "text": "x"}
    )

    assert others.status_code == 404
    assert unpaid.status_code == 404


def test_AC_33_2_inquiry_after_unfollow(client, login):
    headers = login("u-seojun")
    client.delete("/api/farms/f-kang/follow", headers=headers)

    blocked = client.post(
        "/api/messaging/chats/f-kang/messages", headers=headers | key(), json={"text": "안녕하세요"}
    )
    inquiry = client.post(
        "/api/orders/o-38/inquiries",
        headers=headers | key(),
        json={"type": "TASTE", "text": "너무 셔요"},
    )
    follow_up = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=headers | key(),
        json={"text": "사진 더 보낼게요", "orderId": "o-38"},
    )
    chats = client.get("/api/messaging/chats", headers=headers).json()

    assert blocked.status_code == 403
    assert inquiry.status_code == 200
    assert follow_up.status_code == 200
    assert follow_up.json()["reply"] is None  # 문의 뒤 대화는 HUMAN
    assert "f-kang" in [c["farmId"] for c in chats["items"]]


def test_AC_33_3_resolve_does_not_change_order(client, login):
    created = client.post(
        "/api/orders/o-42/inquiries",
        headers=login("u-minji") | key(),
        json={"type": "CONDITION", "text": "몇 개가 물러요"},
    ).json()["inquiry"]
    producer = login("u-kang")
    flagged = client.get(
        "/api/messaging/producer/chats", headers=producer, params={"needsReply": "true"}
    ).json()
    resolved = client.put(
        f"/api/messaging/producer/inquiries/{created['inquiryId']}/status",
        headers=producer | key(),
        json={"status": "RESOLVED", "version": 1},
    ).json()
    stale = client.put(
        f"/api/messaging/producer/inquiries/{created['inquiryId']}/status",
        headers=producer | key(),
        json={"status": "OPEN", "version": 1},
    )
    order = client.get("/api/orders/o-42", headers=login("u-minji")).json()

    assert "u-minji" in [c["consumerId"] for c in flagged["items"]]
    assert resolved["status"] == "RESOLVED"
    assert resolved["version"] == 2
    assert resolved["resolvedAt"]
    assert stale.status_code == 409
    assert order["status"] == "RESERVED"
    assert order["refundedAt"] is None


def test_other_farm_cannot_change_inquiry(client, login, admin_headers):
    created = client.post(
        "/api/orders/o-11/inquiries",
        headers=login("u-minji") | key(),
        json={"type": "OTHER", "text": "궁금해요"},
    ).json()["inquiry"]

    response = client.put(
        f"/api/messaging/producer/inquiries/{created['inquiryId']}/status",
        headers=login("u-kang") | key(),
        json={"status": "RESOLVED", "version": 1},
    )

    assert response.status_code == 404


def test_chat_send_with_photo_only(client, login):
    headers = login("u-seojun")
    page = client.get("/api/messaging/chats/f-kang/messages", headers=headers).json()
    att = upload(client, headers, png(), threadId=page["thread"]["threadId"]).json()["attachmentId"]

    sent = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=headers | key(),
        json={"text": "", "attachmentIds": [att]},
    )
    reuse = client.post(
        "/api/messaging/chats/f-kang/messages",
        headers=headers | key(),
        json={"text": "다시", "attachmentIds": [att]},
    )

    assert sent.status_code == 200, sent.text
    assert sent.json()["message"]["attachmentIds"] == [att]
    assert sent.json()["reply"] is None
    assert reuse.status_code == 404
