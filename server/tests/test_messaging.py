"""FEAT-12 소식방·1:1 채팅, FEAT-13 AI 응답·전달·직접 응대, FEAT-15 좋아요 (contracts-1.2 4장)."""

import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from types import SimpleNamespace

from sqlalchemy import update

from app.core.db import get_sessionmaker
from app.farms.models import FarmAiSettings
from app.messaging.models import Escalation, Thread
from app.messaging.schemas import SendInput


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def send(client, headers, farm_id, text, **extra):
    return client.post(
        f"/api/messaging/chats/{farm_id}/messages",
        headers=headers | key(),
        json={"text": text, **extra},
    )


def ai_off(farm_id="f-kang"):
    with get_sessionmaker()() as session, session.begin():
        session.merge(
            FarmAiSettings(
                farm_id=farm_id,
                enabled=False,
                version=2,
                small_order_policy="",
                reservation_shipping_policy="",
                faqs=[],
                handoff_topics=[],
                updated_at=datetime.now(UTC),
            )
        )


def ai_answer(client, consumer, producer):
    """API 키 없이도 전달되지 않는 AI 답변을 만든다(소량 주문 원칙 규칙 답변)."""
    settings = client.get("/api/farms/me/ai-settings", headers=producer).json()
    saved = client.put(
        "/api/farms/me/ai-settings",
        headers=producer | key(),
        json={**settings, "smallOrderPolicy": "1kg부터 주문할 수 있어요."},
    )
    assert saved.status_code == 200, saved.text
    sent = send(client, consumer, "f-kang", "소량 주문 되나요?").json()
    assert sent["reply"]["senderType"] == "AI"
    assert sent["reply"]["handoffStatus"] is None
    return sent


# ---------------- 소식방 (M-19) ----------------


def test_room_list_for_consumer_and_producer(client, login):
    consumer = client.get("/api/messaging/rooms", headers=login("u-minji")).json()
    producer = client.get("/api/messaging/rooms", headers=login("u-kang")).json()

    assert {r["farmId"] for r in consumer["items"]} == {"f-kang", "f-halla", "f-hyodon"}
    assert [r["farmId"] for r in producer["items"]] == ["f-kang"]
    assert all(room["canReply"] is True for room in consumer["items"])


def test_AC_12_6_consumer_sees_only_own_replies(client, login):
    minji = client.get("/api/messaging/rooms/f-kang/messages", headers=login("u-minji")).json()
    seojun = client.get("/api/messaging/rooms/f-kang/messages", headers=login("u-seojun")).json()
    producer = client.get("/api/messaging/rooms/f-kang/messages", headers=login("u-kang")).json()

    def replies(page):
        return [m["messageId"] for m in page["items"] if m["senderRole"] == "CONSUMER"]

    assert replies(minji) == ["reply-1"]
    assert replies(seojun) == ["reply-2"]
    assert replies(producer) == ["reply-1", "reply-2"]
    assert {m["senderName"] for m in producer["items"] if m["senderRole"] == "CONSUMER"} == {
        "김○○",
        "이○○",
    }
    # 요약에도 다른 소비자 답장이 나오지 않는다
    assert minji["room"]["lastMessage"] != "신맛 빠지면 소식 또 올려 주세요."


def test_AC_12_6_room_cursor_does_not_leak(client, login):
    headers = login("u-minji")
    first = client.get(
        "/api/messaging/rooms/f-kang/messages", headers=headers, params={"limit": 1}
    ).json()
    seen = [m["messageId"] for m in first["items"]]
    cursor = first["nextCursor"]
    while cursor:
        page = client.get(
            "/api/messaging/rooms/f-kang/messages",
            headers=headers,
            params={"limit": 1, "cursor": cursor},
        ).json()
        seen += [m["messageId"] for m in page["items"]]
        cursor = page["nextCursor"]

    assert "reply-2" not in seen
    assert {"n-1", "n-2", "reply-1"} <= set(seen)
    other = client.get(
        "/api/messaging/rooms/f-kang/messages",
        headers=login("u-seojun"),
        params={"cursor": first["nextCursor"]},
    )
    assert other.status_code == 400


def test_AC_12_10_public_room_is_readable_without_login_or_follow(client, login):
    anonymous = client.get("/api/messaging/rooms/f-kang/messages").json()
    unfollowed = client.get(
        "/api/messaging/rooms/f-halla/messages", headers=login("u-seojun")
    ).json()

    assert anonymous["room"]["canReply"] is False
    assert anonymous["room"]["lastMessage"].startswith("하우스 안 온도")
    assert [message["messageId"] for message in anonymous["items"]] == ["n-2"]
    assert unfollowed["room"]["canReply"] is False
    assert [message["messageId"] for message in unfollowed["items"]] == ["n-3"]


def test_AC_12_10_unfollow_hides_private_messages_and_blocks_reply(client, login):
    headers = login("u-seojun")
    before = client.get("/api/messaging/rooms/f-kang/messages", headers=headers).json()
    assert before["room"]["canReply"] is True
    assert {message["messageId"] for message in before["items"]} >= {"n-1", "n-2", "reply-2"}

    client.delete("/api/farms/f-kang/follow", headers=headers)
    after = client.get("/api/messaging/rooms/f-kang/messages", headers=headers).json()
    reply = client.post(
        "/api/messaging/rooms/f-kang/messages",
        headers=headers | key(),
        json={"text": "답장"},
    )

    assert after["room"]["canReply"] is False
    assert [message["messageId"] for message in after["items"]] == ["n-2"]
    assert reply.status_code == 403


def test_AC_15_6_public_room_read_does_not_follow(client, login):
    headers = login("u-seojun")
    assert client.get("/api/farms/f-halla", headers=headers).json()["isFollowing"] is False
    assert client.get("/api/messaging/rooms/f-halla/messages", headers=headers).status_code == 200
    assert client.get("/api/farms/f-halla", headers=headers).json()["isFollowing"] is False


def test_producer_cannot_open_other_farm_room(client, login):
    response = client.get("/api/messaging/rooms/f-halla/messages", headers=login("u-kang"))

    assert response.status_code == 404


def test_AC_12_10_unapproved_producer_and_suspended_farm_are_hidden(client, login):
    unapproved = client.get(
        "/api/messaging/rooms/f-kang/messages", headers=login("u-misook")
    )
    suspended = client.get("/api/messaging/rooms/f-stop/messages")

    assert unapproved.status_code == 403
    assert suspended.status_code == 404


def test_room_send_reply_and_broadcast(client, login):
    reply = client.post(
        "/api/messaging/rooms/f-kang/messages",
        headers=login("u-seojun") | key(),
        json={"text": "010-1234-5678로 연락 주세요"},
    ).json()
    broadcast = client.post(
        "/api/messaging/rooms/f-kang/messages",
        headers=login("u-kang") | key(),
        json={"text": "오늘 수확 시작했어요"},
    ).json()

    assert reply["senderRole"] == "CONSUMER"
    assert "010-1234-5678" not in reply["body"]
    assert broadcast["senderRole"] == "PRODUCER"
    assert broadcast["broadcastId"] == broadcast["messageId"]
    minji = client.get("/api/messaging/rooms/f-kang/messages", headers=login("u-minji")).json()
    ids = [m["messageId"] for m in minji["items"]]
    assert broadcast["messageId"] in ids
    assert reply["messageId"] not in ids


# ---------------- 소식·좋아요 (FEAT-12·15) ----------------


def test_followed_news_includes_followers_only(client, login):
    body = client.get("/api/messaging/news", headers=login("u-minji")).json()

    assert [n["broadcastId"] for n in body["items"]] == ["n-1", "n-2", "n-3", "n-4"]


def test_AC_12_3_public_post_shows_in_room_and_farm_news(client, login):
    posted = client.post(
        "/api/messaging/news",
        headers=login("u-kang") | key(),
        json={"body": "수확 시작!", "photos": ["/photos/basket.jpg"], "visibility": "PUBLIC"},
    ).json()

    farm_news = client.get("/api/messaging/farms/f-kang/news").json()
    room = client.get("/api/messaging/rooms/f-kang/messages", headers=login("u-minji")).json()
    assert farm_news["items"][0]["broadcastId"] == posted["broadcastId"]
    assert posted["broadcastId"] in [m["messageId"] for m in room["items"]]


def test_post_news_limits(client, login):
    headers = login("u-kang")
    empty = client.post("/api/messaging/news", headers=headers | key(), json={"body": ""})
    many = client.post(
        "/api/messaging/news",
        headers=headers | key(),
        json={"body": "x", "photos": ["/photos/p.jpg"] * 6},
    )

    assert empty.status_code == 400
    assert many.status_code == 413
    assert many.json()["code"] == "PAYLOAD_TOO_LARGE"


def test_AC_15_3_like_toggle(client, login):
    headers = login("u-seojun")
    on = client.put("/api/messaging/news/n-2/reaction", headers=headers).json()
    off = client.delete("/api/messaging/news/n-2/reaction", headers=headers).json()

    assert on == {"reactionCount": 129, "myReaction": True}
    assert off == {"reactionCount": 128, "myReaction": False}


def test_AC_15_5_cannot_like_followers_only_news_of_unfollowed_farm(client, login):
    response = client.put("/api/messaging/news/n-1/reaction", headers=login("u-seojun") | {})
    # u-seojun은 f-kang을 팔로우하므로 가능, 팔로우하지 않은 소비자는 404
    assert response.status_code == 200
    client.delete("/api/farms/f-kang/follow", headers=login("u-seojun"))
    blocked = client.put("/api/messaging/news/n-1/reaction", headers=login("u-seojun"))
    assert blocked.status_code == 404


# ---------------- 1:1 채팅 ----------------


def test_AC_12_4_start_chat_auto_follows(client, login):
    headers = login("u-seojun")
    started = client.post(
        "/api/messaging/chats", headers=headers | key(), json={"farmId": "f-halla"}
    ).json()

    assert started == {"farmId": "f-halla", "autoFollowed": True}
    assert client.get("/api/farms/f-halla", headers=headers).json()["isFollowing"] is True


def test_AC_12_1_other_consumers_chat_is_private(client, login):
    minji = client.get("/api/messaging/chats/f-kang/messages", headers=login("u-minji")).json()
    seojun = client.get("/api/messaging/chats/f-kang/messages", headers=login("u-seojun")).json()

    assert [m["messageId"] for m in minji["items"]] == ["m-1", "m-2", "m-3", "m-4", "m-5"]
    assert [m["messageId"] for m in seojun["items"]] == ["m-9", "m-10"]
    assert "escalations" not in minji or minji["escalations"] is None


def test_AC_12_5_news_not_in_one_to_one(client, login):
    chats = client.get("/api/messaging/chats", headers=login("u-minji")).json()["items"]
    page = client.get("/api/messaging/chats/f-kang/messages", headers=login("u-minji")).json()

    farms = {c["farmId"] for c in chats if not c["isSupport"]}
    assert farms == {"f-kang", "f-halla", "f-hyodon"}
    # 농가 대화 외에는 자기 farmclub 문의 대화방(DEV-150) 하나만 있다
    assert [c["farmName"] for c in chats if c["isSupport"]] == ["farmclub"]
    assert all(not m["messageId"].startswith("n-") for m in page["items"])


def test_AC_13_1_ai_answers_delivery_window(client, login):
    headers = login("u-seojun")
    client.put(
        "/api/messaging/producer/chats/u-seojun/ai-mode",
        headers=login("u-kang") | key(),
        json={"mode": "AUTO", "version": 1},
    )
    result = send(client, headers, "f-kang", "배송은 언제예요?", orderId="o-38").json()

    assert result["reply"]["senderType"] == "AI"
    assert "2026-11-10" in result["reply"]["body"]
    assert result["reply"]["handoffStatus"] is None
    assert result["reply"]["sourceRefs"] == ["order:o-38"]


def test_AC_13_5_report_maps_question_and_marks_consumer_and_producer_views(client, login):
    consumer = login("u-seojun")
    producer = login("u-kang")
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Escalation).where(Escalation.id == "e-2").values(status="ANSWERED")
        )
    sent = ai_answer(client, consumer, producer)
    answer_id = sent["reply"]["messageId"]
    newer = ai_answer(client, consumer, producer)
    assert newer["reply"]["messageId"] != answer_id
    path = f"/api/messaging/chats/f-kang/messages/{answer_id}/report"
    report = client.post(path, headers=consumer | key())
    assert report.status_code == 200, report.text
    data = report.json()
    assert data["reason"] == "WRONG_ANSWER"
    assert data["question"] == sent["message"]["body"]
    assert data["status"] == "OPEN"
    assert data["reportedMessageId"] == answer_id
    with get_sessionmaker()() as session:
        escalation = session.get(Escalation, data["escalationId"])
        assert escalation.thread_message_id == sent["message"]["messageId"]
        assert escalation.reported_message_id == answer_id
    consumer_page = client.get(
        "/api/messaging/chats/f-kang/messages", headers=consumer
    ).json()
    producer_page = client.get(
        "/api/messaging/producer/chats/u-seojun/messages", headers=producer
    ).json()
    for page in (consumer_page, producer_page):
        assert next(m for m in page["items"] if m["messageId"] == answer_id)["reported"] is True
    summaries = client.get(
        "/api/messaging/producer/chats",
        headers=producer,
        params={"needsReply": "true"},
    ).json()["items"]
    assert any(row["consumerId"] == "u-seojun" and row["needsReply"] for row in summaries)


def test_AC_13_5_duplicate_report_returns_existing_escalation(client, login):
    consumer = login("u-seojun")
    answer = ai_answer(client, consumer, login("u-kang"))["reply"]
    path = f"/api/messaging/chats/f-kang/messages/{answer['messageId']}/report"
    first = client.post(path, headers=consumer | key())
    second = client.post(path, headers=consumer | key())
    assert first.status_code == second.status_code == 200
    assert first.json()["escalationId"] == second.json()["escalationId"]


def test_AC_13_5_concurrent_duplicate_reports_return_existing_escalation(client, login):
    consumer = login("u-seojun")
    answer = ai_answer(client, consumer, login("u-kang"))["reply"]
    path = f"/api/messaging/chats/f-kang/messages/{answer['messageId']}/report"

    def report(_):
        return client.post(path, headers=consumer | key())

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(report, range(2)))
    assert [r.status_code for r in responses] == [200, 200]
    assert responses[0].json()["escalationId"] == responses[1].json()["escalationId"]


def test_AC_13_5_unselected_report_stays_open_after_producer_reply(client, login):
    consumer = login("u-seojun")
    producer = login("u-kang")
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Escalation).where(Escalation.id == "e-2").values(status="ANSWERED")
        )
    answer = ai_answer(client, consumer, producer)["reply"]
    report = client.post(
        f"/api/messaging/chats/f-kang/messages/{answer['messageId']}/report",
        headers=consumer | key(),
    ).json()
    replied = client.post(
        "/api/messaging/producer/chats/u-seojun/messages",
        headers=producer | key(),
        json={"text": "배송비는 주문 상세에서 확인해 주세요.", "answerToEscalationIds": []},
    )
    assert replied.status_code == 200, replied.text
    open_questions = client.get(
        "/api/messaging/questions", headers=producer, params={"status": "OPEN"}
    ).json()["items"]
    assert report["escalationId"] in [e["escalationId"] for e in open_questions]
    summaries = client.get(
        "/api/messaging/producer/chats", headers=producer, params={"needsReply": "true"}
    ).json()["items"]
    assert any(row["consumerId"] == "u-seojun" and row["needsReply"] for row in summaries)


def test_AC_13_5_rejects_non_ai_forwarded_and_other_consumer_messages(client, login):
    consumer = login("u-seojun")
    other = login("u-minji")
    sent = ai_answer(client, consumer, login("u-kang"))
    answer_id = sent["reply"]["messageId"]
    route = f"/api/messaging/chats/f-kang/messages/{answer_id}/report"
    assert client.post(route, headers=other | key()).status_code == 404
    assert client.post(
        f"/api/messaging/chats/f-kang/messages/{sent['message']['messageId']}/report",
        headers=consumer | key(),
    ).status_code == 400
    forwarded = send(client, consumer, "f-kang", "농약을 언제 살포했나요?").json()["reply"]
    assert forwarded["handoffStatus"] == "FORWARDED"
    assert client.post(
        f"/api/messaging/chats/f-kang/messages/{forwarded['messageId']}/report",
        headers=consumer | key(),
    ).status_code == 400


def test_AC_13_2_pesticide_question_is_forwarded(client, login):
    result = send(client, login("u-seojun"), "f-kang", "농약은 얼마나 치세요?").json()

    assert result["reply"]["handoffStatus"] == "FORWARDED"
    producer = login("u-kang")
    flagged = client.get(
        "/api/messaging/producer/chats", headers=producer, params={"needsReply": "true"}
    ).json()
    assert "u-seojun" in [c["consumerId"] for c in flagged["items"]]


def test_C06_FEAT_13_model_non_answer_is_forwarded_to_producer(client, login, monkeypatch):
    """DEV-47: Claude가 '근거에 없어 답할 수 없어요'를 ANSWER로 내도 needsReply로 전달한다."""
    from app.ai import service as ai

    with get_sessionmaker()() as session, session.begin():
        session.merge(
            FarmAiSettings(
                farm_id="f-kang",
                enabled=True,
                version=2,
                small_order_policy="",
                reservation_shipping_policy="",
                faqs=[{"question": "선물 포장 되나요?", "answer": "선물 포장 가능해요."}],
                handoff_topics=[],
                updated_at=datetime.now(UTC),
            )
        )
    calls = []

    class Messages:
        def create(self, *, messages, **kwargs):
            calls.append(1)
            content = messages[0]["content"]
            payload = json.loads(content[len("근거: ") : content.index("\n질문: ")])
            raw = json.dumps(
                {
                    "action": "ANSWER",
                    "answer": "죄송하지만, 제공된 정보에 원산지에 대한 내용이 없어 답변드릴 수 "
                    "없습니다. 판매자에게 직접 문의해주시기 바랍니다.",
                    "reason": "근거",
                    "sourceRefs": [payload["evidence"][0]["sourceRef"]],
                },
                ensure_ascii=False,
            )
            return SimpleNamespace(content=[SimpleNamespace(type="text", text=raw)])

    monkeypatch.setattr(ai.get_settings(), "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai, "_client", lambda timeout: SimpleNamespace(messages=Messages()))

    result = send(client, login("u-seojun"), "f-kang", "원산지가 어디예요?").json()

    assert calls, "Claude 경로를 타야 한다"

    assert result["reply"]["handoffStatus"] == "FORWARDED"
    flagged = client.get(
        "/api/messaging/producer/chats", headers=login("u-kang"), params={"needsReply": "true"}
    ).json()
    assert "u-seojun" in [c["consumerId"] for c in flagged["items"]]


def test_AC_13_3_expected_brix_is_labeled(client, login):
    headers = login("u-minji")
    client.post("/api/messaging/chats", headers=headers | key(), json={"farmId": "f-hyodon"})

    result = send(client, headers, "f-hyodon", "등록된 당도 수치는 얼마예요?").json()

    assert "예상 당도는 12" in result["reply"]["body"]


def auto_minji_kang(client, login):
    """시드 대화(f-kang·u-minji)는 농가 답이 있어 HUMAN이다. AI 답을 받으려면 AUTO로 돌린다."""
    switched = client.put(
        "/api/messaging/producer/chats/u-minji/ai-mode",
        headers=login("u-kang") | key(),
        json={"mode": "AUTO", "version": 2},
    )
    assert switched.status_code == 200, switched.text


def test_AC_13_3_two_product_farm_answers_brix_from_given_product(client, login):
    """판매 중 상품이 2개인 농가: 상품 페이지에서 연 채팅은 그 상품 당도로 답한다(DEV-97)."""
    headers = login("u-minji")
    auto_minji_kang(client, login)

    house = send(client, headers, "f-kang", "당도가 몇이에요?", productId="p-house").json()
    redhyang = send(client, headers, "f-kang", "당도가 몇이에요?", productId="p-redhyang").json()

    assert house["reply"]["handoffStatus"] is None
    assert "11.8" in house["reply"]["body"]
    assert house["reply"]["sourceRefs"] == ["product:p-house"]
    assert "예상 당도는 13" in redhyang["reply"]["body"]


def test_AC_13_3_two_product_farm_without_product_forwards(client, login):
    auto_minji_kang(client, login)
    result = send(client, login("u-minji"), "f-kang", "당도가 몇이에요?").json()

    assert result["reply"]["handoffStatus"] == "FORWARDED"


def test_AC_13_1_order_context_wins_over_product(client, login):
    """주문과 상품이 함께 오면 주문 상품을 근거로 쓴다(build_evidence 우선순위, DEV-97)."""
    client.put(
        "/api/messaging/producer/chats/u-seojun/ai-mode",
        headers=login("u-kang") | key(),
        json={"mode": "AUTO", "version": 1},
    )
    headers = login("u-seojun")
    extra = {"orderId": "o-38", "productId": "p-redhyang"}
    result = send(client, headers, "f-kang", "배송은 언제예요?", **extra).json()

    assert "2026-11-10" in result["reply"]["body"]
    assert result["reply"]["sourceRefs"] == ["order:o-38"]


def test_AC_13_3_product_of_other_farm_or_not_published_is_404(client, login):
    headers = login("u-minji")
    before = client.get("/api/messaging/chats/f-kang/messages", headers=headers).json()

    for product_id in ("p-hallabong", "p-cheonggyeon", "p-none"):
        response = send(client, headers, "f-kang", "당도가 몇이에요?", productId=product_id)
        assert response.status_code == 404, product_id
    other_farm = send(client, headers, "f-kang", "당도가 몇이에요?", productId="p-hyodon")
    assert other_farm.status_code == 404

    after = client.get("/api/messaging/chats/f-kang/messages", headers=headers).json()
    assert [m["messageId"] for m in after["items"]] == [m["messageId"] for m in before["items"]]


def test_AC_13_4_ai_reply_is_labeled(client, login):
    result = send(client, login("u-minji"), "f-halla", "배송비는 얼마예요?").json()

    assert result["reply"]["senderType"] == "AI"
    assert result["reply"]["sourceSummary"]


def test_human_mode_has_no_ai_reply(client, login):
    # f-kang:u-minji는 농가가 답한 대화라 HUMAN
    result = send(client, login("u-minji"), "f-kang", "배송비는 얼마예요?").json()

    assert result["reply"] is None
    assert result["message"]["needsHuman"] is True


def test_AC_13_7_farm_ai_off_overrides_auto(client, login):
    ai_off()

    result = send(client, login("u-seojun"), "f-kang", "배송비는 얼마예요?").json()

    assert result["reply"] is None
    assert result["message"]["needsHuman"] is True


def test_M_07_refund_alert_when_ai_off(client, login, caplog):
    ai_off()

    with caplog.at_level(logging.INFO, logger="farmclub.ai.safety"):
        result = send(client, login("u-seojun"), "f-kang", "환불 요청합니다").json()

    records = [record for record in caplog.records if record.message == "manager_refund_request"]
    assert result["reply"] is None
    assert len(records) == 1
    assert records[0].event == "manager_refund_request"
    assert records[0].farmId == "f-kang"
    assert records[0].messageId == result["message"]["messageId"]
    assert records[0].category == "refund_or_compensation"
    assert "환불 요청합니다" not in str(records[0].__dict__)
    assert "u-seojun" not in str(records[0].__dict__)


def test_M_07_sequential_idempotent_replay_logs_once(client, login, caplog):
    headers = login("u-seojun") | key()

    with caplog.at_level(logging.INFO, logger="farmclub.ai.safety"):
        first = client.post(
            "/api/messaging/chats/f-kang/messages",
            headers=headers,
            json={"text": "보상 요청합니다"},
        )
        second = client.post(
            "/api/messaging/chats/f-kang/messages",
            headers=headers,
            json={"text": "보상 요청합니다"},
        )

    records = [record for record in caplog.records if record.message == "manager_refund_request"]
    assert first.json() == second.json()
    assert len(records) == 1


def test_M_07_commit_failure_emits_no_alert(monkeypatch, caplog):
    from app.messaging import router, service

    alert = service.ManagerRefundAlert("f-kang", "thread-1", "loser-message")
    outcome = service.ConsumerSendOutcome(
        result={"message": {"messageId": "loser-message"}}, alert=alert
    )

    monkeypatch.setattr(service, "consumer_send", lambda *args: outcome)

    def commit_failure(*args):
        run = args[-1]
        run()
        raise RuntimeError("commit failed")

    monkeypatch.setattr(router, "run_idempotent", commit_failure)

    with caplog.at_level(logging.INFO, logger="farmclub.ai.safety"):
        try:
            router.send_chat(
                db=object(),
                user=SimpleNamespace(id="u-1"),
                farm_id="f-kang",
                body=SendInput(text="환불"),
                key="same-key",
            )
        except RuntimeError:
            pass

    assert not [record for record in caplog.records if record.message == "manager_refund_request"]


def test_M_07_idempotency_integrity_error_loser_emits_no_alert(monkeypatch, caplog):
    from app.messaging import router, service

    alert = service.ManagerRefundAlert("f-kang", "thread-1", "loser-message")
    outcome = service.ConsumerSendOutcome(
        result={"message": {"messageId": "loser-message"}}, alert=alert
    )

    monkeypatch.setattr(service, "consumer_send", lambda *args: outcome)

    def integrity_error_recovery(*args):
        run = args[-1]
        run()
        return {"message": {"messageId": "winner-message"}, "reply": None}

    monkeypatch.setattr(router, "run_idempotent", integrity_error_recovery)

    with caplog.at_level(logging.INFO, logger="farmclub.ai.safety"):
        result = router.send_chat(
            db=object(),
            user=SimpleNamespace(id="u-1"),
            farm_id="f-kang",
            body=SendInput(text="환불"),
            key="same-key",
        )

    assert result["message"]["messageId"] == "winner-message"
    assert not [record for record in caplog.records if record.message == "manager_refund_request"]


def test_AC_13_6_producer_answer_switches_to_human(client, login):
    producer = login("u-kang")
    before = client.get("/api/messaging/producer/chats/u-seojun/messages", headers=producer).json()
    answered = client.post(
        "/api/messaging/producer/chats/u-seojun/messages",
        headers=producer | key(),
        json={"text": "9월 말에 한 번 쳤어요.", "answerToEscalationIds": ["e-2"]},
    ).json()

    assert before["thread"]["aiMode"] == "AUTO"
    assert answered["thread"]["aiMode"] == "HUMAN"
    assert answered["thread"]["version"] == before["thread"]["version"] + 1
    questions = client.get(
        "/api/messaging/questions", headers=producer, params={"status": "ANSWERED"}
    ).json()
    assert [q["escalationId"] for q in questions["items"]] == ["e-2"]
    later = send(client, login("u-seojun"), "f-kang", "배송비는 얼마예요?").json()
    assert later["reply"] is None


def test_AC_13_6_stale_ai_mode_version_rejected(client, login):
    producer = login("u-kang")
    response = client.put(
        "/api/messaging/producer/chats/u-seojun/ai-mode",
        headers=producer | key(),
        json={"mode": "HUMAN", "version": 99},
    )

    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "STALE_VERSION"


def test_AC_13_6_settings_change_during_ai_discards_reply(client, login, monkeypatch):
    """AI 처리 중 농가 설정이 바뀌면(OFF→ON 왕복 포함) 이전 작업의 답을 저장하지 않는다."""
    from app.ai import service as ai

    original = ai.answer_question

    def answer_while_settings_change(question, evidence, enabled=True):
        result = original(question, evidence, enabled)
        with get_sessionmaker()() as other, other.begin():
            other.merge(
                FarmAiSettings(
                    farm_id="f-kang",
                    enabled=True,
                    version=3,
                    small_order_policy="",
                    reservation_shipping_policy="",
                    faqs=[],
                    handoff_topics=[],
                    updated_at=datetime.now(UTC),
                )
            )
        return result

    monkeypatch.setattr(ai, "answer_question", answer_while_settings_change)
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Thread).where(Thread.id == "thread-kang-seojun").values(ai_mode="AUTO")
        )

    result = send(client, login("u-seojun"), "f-kang", "배송비는 얼마예요?").json()

    assert result["reply"] is None
    assert result["message"]["needsHuman"] is True
    page = client.get("/api/messaging/chats/f-kang/messages", headers=login("u-seojun")).json()
    assert page["items"][-1]["senderType"] == "CONSUMER"


def test_AC_13_6_saved_settings_change_during_ai_discards_reply(client, login, monkeypatch):
    """설정 행이 이미 있을 때도 캐시가 아닌 최신 버전으로 다시 확인한다."""
    from app.ai import service as ai

    with get_sessionmaker()() as session, session.begin():
        session.add(
            FarmAiSettings(
                farm_id="f-halla",
                enabled=True,
                version=1,
                small_order_policy="",
                reservation_shipping_policy="",
                faqs=[],
                handoff_topics=[],
                updated_at=datetime.now(UTC),
            )
        )
    original = ai.answer_question

    def answer_while_settings_change(question, evidence, enabled=True):
        result = original(question, evidence, enabled)
        with get_sessionmaker()() as other, other.begin():
            other.execute(
                update(FarmAiSettings)
                .where(FarmAiSettings.farm_id == "f-halla")
                .values(version=FarmAiSettings.version + 1)
            )
        return result

    monkeypatch.setattr(ai, "answer_question", answer_while_settings_change)

    result = send(client, login("u-minji"), "f-halla", "배송비는 얼마예요?").json()

    assert result["reply"] is None
    assert result["message"]["needsHuman"] is True


def test_masking_keeps_dates():
    from app.core.masking import mask

    assert mask("11월 10일(2026-11-10) 도착")[1] is False
    assert mask("010-1234-5678로 연락")[0] == "●●●-●●●●-●●●●로 연락"
    assert mask("계좌 110-123-456789")[1] is True


def test_read_and_unread_counts(client, login):
    headers = login("u-minji")
    before = {
        c["farmId"]: c for c in client.get("/api/messaging/chats", headers=headers).json()["items"]
    }
    state = client.put(
        "/api/messaging/chats/f-kang/read", headers=headers, json={"lastReadMessageId": "m-5"}
    ).json()
    backwards = client.put(
        "/api/messaging/chats/f-kang/read", headers=headers, json={"lastReadMessageId": "m-1"}
    ).json()

    assert before["f-kang"]["unreadCount"] == 3
    assert state == {"unreadCount": 0}
    assert backwards == {"unreadCount": 0}


def test_producer_start_requires_room_reply(client, login):
    producer = login("u-kang")
    bad = client.post(
        "/api/messaging/producer/chats", headers=producer | key(), json={"consumerId": "u-minji"}
    )
    existing = client.post(
        "/api/messaging/producer/chats",
        headers=producer | key(),
        json={"consumerId": "u-seojun"},
    )

    assert bad.status_code == 200  # 이미 대화가 있는 소비자
    assert existing.json()["threadId"] == "thread-kang-seojun"
    stranger = client.post(
        "/api/messaging/producer/chats",
        headers=producer | key(),
        json={"consumerId": "u-g0", "roomReplyId": "reply-1"},
    )
    assert stranger.status_code == 404


def test_send_requires_idempotency_key_and_same_key_once(client, login):
    headers = login("u-seojun")
    no_key = client.post(
        "/api/messaging/chats/f-kang/messages", headers=headers, json={"text": "안녕"}
    )
    same = headers | key()
    first = client.post(
        "/api/messaging/chats/f-kang/messages", headers=same, json={"text": "안녕하세요"}
    )
    second = client.post(
        "/api/messaging/chats/f-kang/messages", headers=same, json={"text": "안녕하세요"}
    )

    assert no_key.status_code == 400
    assert first.json() == second.json()


def test_attachments_not_open_yet(client, login):
    response = send(client, login("u-seojun"), "f-kang", "사진 봐 주세요", attachmentIds=["att-1"])

    assert response.status_code == 404


def test_chat_cursor_pages_oldest_first(client, login):
    headers = login("u-minji")
    first = client.get(
        "/api/messaging/chats/f-kang/messages", headers=headers, params={"limit": 2}
    ).json()
    older = client.get(
        "/api/messaging/chats/f-kang/messages",
        headers=headers,
        params={"limit": 2, "cursor": first["nextCursor"]},
    ).json()

    assert [m["messageId"] for m in first["items"]] == ["m-4", "m-5"]
    assert [m["messageId"] for m in older["items"]] == ["m-2", "m-3"]


def test_dashboard_open_questions_follow_chat(client, login):
    producer = login("u-kang")
    client.post(
        "/api/messaging/questions/e-3/answer", headers=producer, json={"text": "10박스는 어려워요."}
    )

    body = client.get("/api/orders/producer/dashboard", headers=producer).json()
    assert body["todo"]["openQuestions"] == 2
