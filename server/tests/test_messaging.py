"""FEAT-12 소식방·1:1 채팅, FEAT-13 AI 응답·전달·직접 응대, FEAT-15 좋아요 (contracts-1.2 4장)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import update

from app.core.db import get_sessionmaker
from app.farms.models import FarmAiSettings
from app.messaging.models import Thread


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
        "/api/messaging/news", headers=headers | key(), json={"body": "x", "photos": ["p"] * 6}
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

    assert {c["farmId"] for c in chats} == {"f-kang", "f-halla", "f-hyodon"}
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


def test_AC_13_2_pesticide_question_is_forwarded(client, login):
    result = send(client, login("u-seojun"), "f-kang", "농약은 얼마나 치세요?").json()

    assert result["reply"]["handoffStatus"] == "FORWARDED"
    producer = login("u-kang")
    flagged = client.get(
        "/api/messaging/producer/chats", headers=producer, params={"needsReply": "true"}
    ).json()
    assert "u-seojun" in [c["consumerId"] for c in flagged["items"]]


def test_AC_13_3_expected_brix_is_labeled(client, login):
    headers = login("u-minji")
    client.post("/api/messaging/chats", headers=headers | key(), json={"farmId": "f-hyodon"})

    result = send(client, headers, "f-hyodon", "등록된 당도 수치는 얼마예요?").json()

    assert "예상 당도는 12" in result["reply"]["body"]


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
