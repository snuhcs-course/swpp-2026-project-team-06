"""소식별 읽음 수와 팬 답장 모아보기 (DEV-297, FEAT-15 AC-15-9·10·11) HTTP 계약."""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import update

ROOM = "/api/messaging/rooms/f-kang"


def _key():
    return {"Idempotency-Key": str(uuid4())}


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def _items(client, headers=None):
    return {
        m["messageId"]: m
        for m in _ok(client.get(f"{ROOM}/messages", headers=headers, params={"limit": 50}))["items"]
    }


def _read(client, headers, message_id, farm="f-kang"):
    return client.put(
        f"/api/messaging/rooms/{farm}/read",
        headers=headers,
        json={"lastReadMessageId": message_id},
    )


def _send(client, headers, text, target=None):
    body = {"text": text}
    if target is not None:
        body["replyToMessageId"] = target
    return _ok(client.post(f"{ROOM}/messages", headers=headers | _key(), json=body))


def _replies(client, headers, broadcast_id, **params):
    return client.get(f"{ROOM}/broadcasts/{broadcast_id}/replies", headers=headers, params=params)


@pytest.fixture
def clock(monkeypatch):
    """FIXED_NOW(conftest 시계)를 분 단위로 옮긴다. 같은 시각이면 순서가 id로 갈린다."""
    from app.core.config import get_settings

    base = datetime.fromisoformat("2026-10-07T10:00:00+09:00")

    def move(minutes):
        monkeypatch.setenv("FIXED_NOW", (base + timedelta(minutes=minutes)).isoformat())
        get_settings.cache_clear()

    yield move
    monkeypatch.setenv("FIXED_NOW", base.isoformat())
    get_settings.cache_clear()


def _db():
    from app.core.db import get_sessionmaker

    return get_sessionmaker()()


# ---------------- AC-15-9 소식별 읽음 수 ----------------


def test_AC_15_9_read_position_counts_each_follower_once_per_broadcast(client, login):
    minji, seojun, producer = login("u-minji"), login("u-seojun"), login("u-kang")
    before = _items(client, producer)
    assert before["n-1"]["readCount"] == 0 and before["n-2"]["readCount"] == 0

    # 김민지가 최신 소식(n-1)까지 읽었다 → 그보다 오래된 n-2도 지나갔다
    assert _read(client, minji, "n-1").status_code == 204
    # 같은 소식을 다시 읽거나 더 오래된 소식을 다시 보내도 1회, 위치는 뒤로 가지 않는다
    assert _read(client, minji, "n-1").status_code == 204
    assert _read(client, minji, "n-2").status_code == 204
    # 이서준은 n-2까지만
    assert _read(client, seojun, "n-2").status_code == 204

    counts = _items(client, producer)
    assert counts["n-1"]["readCount"] == 1
    assert counts["n-2"]["readCount"] == 2

    # 새 소식은 아직 아무도 읽지 않았다.
    # 읽으면 그 소식만 1 늘고 이전 소식 수는 사람 수를 넘지 않는다
    fresh = _send(client, producer, "새 소식이에요")
    assert _items(client, producer)[fresh["messageId"]]["readCount"] == 0
    assert _read(client, seojun, fresh["messageId"]).status_code == 204
    counts = _items(client, producer)
    assert counts[fresh["messageId"]]["readCount"] == 1
    assert counts["n-1"]["readCount"] == 2
    assert counts["n-2"]["readCount"] == 2


def test_AC_15_9_counts_are_producer_only(client, login):
    minji = login("u-minji")
    assert _read(client, minji, "n-1").status_code == 204
    for headers in (minji, None):
        for message in _items(client, headers).values():
            assert message["readCount"] is None
            assert message["replyCount"] is None
    replies = [m for m in _items(client, login("u-kang")).values() if m["senderRole"] == "CONSUMER"]
    assert replies and all(m["readCount"] is None and m["replyCount"] is None for m in replies)


def test_AC_15_9_read_rejects_non_followers_other_roles_and_foreign_messages(
    client, login, other_farm_headers
):
    minji, producer = login("u-minji"), login("u-kang")
    assert _read(client, None, "n-1").status_code == 401
    assert _read(client, producer, "n-1").status_code == 403
    # 남의 농가 소식·소비자 답장·없는 소식은 이 방의 소식이 아니다
    assert _read(client, minji, "n-3").status_code == 404
    assert _read(client, minji, "reply-1").status_code == 404
    assert _read(client, minji, "n-missing").status_code == 404
    # 지운 소식
    assert client.delete("/api/messaging/news/n-1", headers=producer).status_code == 204
    assert _read(client, minji, "n-1").status_code == 404
    # 팔로우를 끊으면 기록하지 않는다. 이미 남긴 읽음은 그대로 센다
    assert _read(client, minji, "n-2").status_code == 204
    assert client.delete("/api/farms/f-kang/follow", headers=minji).status_code in (200, 204)
    assert _read(client, minji, "n-2").status_code == 403
    assert _items(client, producer)["n-2"]["readCount"] == 1


# ---------------- AC-15-10 답장이 답한 소식 ----------------


def test_AC_15_10_reply_links_to_latest_live_broadcast_at_send_time(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    # 시드 답장 2개는 그 시각 이전 가장 최근 소식 n-1에 연결돼 있다
    assert _items(client, producer)["n-1"]["replyCount"] == 2
    assert _items(client, producer)["n-2"]["replyCount"] == 0

    news = _send(client, producer, "수확 날짜 정했어요")
    reply = _send(client, minji, "좋아요!")
    assert reply["readCount"] is None
    counts = _items(client, producer)
    assert counts[news["messageId"]]["replyCount"] == 1
    assert counts["n-1"]["replyCount"] == 2

    # 나중에 올린 소식이나 답장 수정은 연결을 바꾸지 않는다
    later = _send(client, producer, "다음 소식")
    edited = client.patch(
        f"{ROOM}/messages/{reply['messageId']}",
        headers=minji | _key(),
        json={"text": "정말 좋아요!", "version": reply["editVersion"]},
    )
    assert edited.status_code == 200, edited.text
    counts = _items(client, producer)
    assert counts[news["messageId"]]["replyCount"] == 1
    assert counts[later["messageId"]]["replyCount"] == 0

    # 가장 최근 소식을 지우면 그다음 지우지 않은 소식이 대상이다
    assert (
        client.delete(f"/api/messaging/news/{later['messageId']}", headers=producer).status_code
        == 204
    )
    _send(client, minji, "지운 소식 뒤 답장")
    assert _items(client, producer)[news["messageId"]]["replyCount"] == 2


# ---------------- AC-15-11 팬 답장 시트 ----------------


def test_AC_15_11_fan_replies_list_unread_filter_reserved_tag_and_quoted(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    from app.orders.models import Order

    # 이서준의 f-kang 주문을 환불로 바꾸면 예약 고객이 아니다(김민지는 결제된 예약이 있다)
    with _db() as session, session.begin():
        session.execute(
            update(Order).where(Order.consumer_id == "u-seojun").values(status="REFUNDED")
        )

    page = _ok(_replies(client, producer, "n-1"))
    assert page["broadcast"] == {
        "broadcastId": "n-1",
        "body": "첫 바구니 따봤어요. 아직 신맛이 조금 남아서 일주일 더 기다립니다.",
        "mediaCount": 1,
        "createdAt": page["broadcast"]["createdAt"],
    }
    assert page["total"] == 2 and page["unreadCount"] == 2
    assert page["lastReplyId"] == "reply-2"
    assert [r["messageId"] for r in page["items"]] == ["reply-1", "reply-2"]
    first, second = page["items"]
    assert first["consumerId"] == "u-minji" and first["reservedCustomer"] is True
    assert second["consumerId"] == "u-seojun" and second["reservedCustomer"] is False
    assert first["senderName"] and "민지" not in first["senderName"][1:]
    assert all(r["unread"] and not r["quoted"] for r in page["items"])

    # 모두에게 답장(익명 인용)하면 그 답장은 '모두에게 답장함'이고 읽음이다
    _send(client, producer, "일주일 뒤에 다시 알려 드릴게요", target="reply-1")
    page = _ok(_replies(client, producer, "n-1"))
    assert page["unreadCount"] == 1
    by_id = {r["messageId"]: r for r in page["items"]}
    assert by_id["reply-1"]["quoted"] is True and by_id["reply-1"]["unread"] is False
    assert by_id["reply-2"]["quoted"] is False and by_id["reply-2"]["unread"] is True

    unread = _ok(_replies(client, producer, "n-1", filter="unread"))
    assert [r["messageId"] for r in unread["items"]] == ["reply-2"]
    assert unread["total"] == 2 and unread["unreadCount"] == 1

    # 인용 소식도 소식이라 그 뒤 답장은 인용 소식에 연결된다(n-1 묶음은 늘지 않음)
    late = _send(client, minji, "하나 더 궁금해요")
    quote = next(m for m in _items(client, producer).values() if m.get("replyTo"))
    assert quote["replyCount"] == 1
    linked = _ok(_replies(client, producer, quote["messageId"]))["items"]
    assert [r["messageId"] for r in linked] == [late["messageId"]]
    assert _ok(_replies(client, producer, "n-1"))["total"] == 2

    # 인용 소식을 지우면 '모두에게 답장함'이 사라진다
    assert (
        client.delete(f"/api/messaging/news/{quote['messageId']}", headers=producer).status_code
        == 204
    )
    by_id = {r["messageId"]: r for r in _ok(_replies(client, producer, "n-1"))["items"]}
    assert by_id["reply-1"]["quoted"] is False


def test_AC_15_11_read_marks_replies_up_to_the_last_seen_one(client, login, clock):
    minji, seojun, producer = login("u-minji"), login("u-seojun"), login("u-kang")
    news = _send(client, producer, "새 소식")["messageId"]
    clock(1)
    first = _send(client, minji, "첫 답장")["messageId"]
    clock(2)
    second = _send(client, seojun, "두 번째 답장")["messageId"]
    clock(3)
    third = _send(client, minji, "세 번째 답장")["messageId"]
    page = _ok(_replies(client, producer, news))
    assert page["unreadCount"] == 3 and page["lastReplyId"] == third
    # 시트가 두 번째까지만 봤다면 세 번째는 안 읽음으로 남는다
    state = client.put(
        f"{ROOM}/broadcasts/{news}/replies/read",
        headers=producer,
        json={"lastReadMessageId": second},
    )
    assert _ok(state) == {"unreadCount": 1}
    unread = _ok(_replies(client, producer, news, filter="unread"))
    assert [r["messageId"] for r in unread["items"]] == [third]
    assert unread["total"] == 3 and unread["unreadCount"] == 1
    assert {
        r["messageId"]: r["unread"] for r in _ok(_replies(client, producer, news))["items"]
    } == {
        first: False,
        second: False,
        third: True,
    }
    # 다른 소식의 답장 id로는 처리하지 않는다
    other = client.put(
        f"{ROOM}/broadcasts/{news}/replies/read",
        headers=producer,
        json={"lastReadMessageId": "reply-1"},
    )
    assert other.status_code == 404


def test_AC_15_11_fan_reply_pages_follow_scoped_cursor(client, login):
    minji, producer = login("u-minji"), login("u-kang")
    for i in range(3):
        _send(client, minji, f"답장 {i}")
    seen, cursor = [], None
    while True:
        params = {"limit": 2} | ({"cursor": cursor} if cursor else {})
        page = _ok(_replies(client, producer, "n-1", **params))
        seen += [r["messageId"] for r in page["items"]]
        cursor = page["nextCursor"]
        if not cursor:
            break
    assert len(seen) == 5 and len(set(seen)) == 5 and seen[:2] == ["reply-1", "reply-2"]
    # 필터가 다른 cursor는 쓸 수 없다
    first = _ok(_replies(client, producer, "n-1", limit=1))
    assert (
        _replies(client, producer, "n-1", filter="unread", cursor=first["nextCursor"]).status_code
        == 400
    )


def test_AC_15_11_fan_replies_are_owner_producer_only(client, login, other_farm_headers):
    minji, producer = login("u-minji"), login("u-kang")
    assert _replies(client, None, "n-1").status_code == 401
    assert _replies(client, minji, "n-1").status_code == 403
    # 다른 농가 생산자는 이 방도 이 소식도 볼 수 없다
    assert _replies(client, other_farm_headers, "n-1").status_code == 404
    assert (
        client.get(
            "/api/messaging/rooms/f-halla/broadcasts/n-1/replies", headers=other_farm_headers
        ).status_code
        == 404
    )
    # 남의 농가 소식·답장 id·지운 소식
    assert _replies(client, producer, "n-3").status_code == 404
    assert _replies(client, producer, "reply-1").status_code == 404
    read = client.put(
        f"{ROOM}/broadcasts/n-2/replies/read",
        headers=producer,
        json={"lastReadMessageId": "reply-1"},
    )
    assert read.status_code == 404
    assert (
        client.put(
            f"{ROOM}/broadcasts/n-1/replies/read",
            headers=minji,
            json={"lastReadMessageId": "reply-1"},
        ).status_code
        == 403
    )
    assert client.delete("/api/messaging/news/n-1", headers=producer).status_code == 204
    assert _replies(client, producer, "n-1").status_code == 404


# ---------------- 0031 기존 답장 채우기 ----------------


def test_AC_15_10_migration_backfills_answered_broadcast_at_send_time_and_marks_read():
    """기존 답장은 그 답장을 보낸 순간 지우지 않은 가장 최근 소식에 붙고, 읽음으로 채운다."""
    import os
    import subprocess
    import sys
    from pathlib import Path

    import psycopg
    from psycopg import sql
    from sqlalchemy import create_engine, inspect, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.orm import Session

    from app.core import seed
    from app.core.clock import KST
    from app.messaging.models import Broadcast, RoomReply

    base = make_url(os.environ["DATABASE_URL"])
    assert base.host in {"localhost", "127.0.0.1"}, "Disposable local database only"
    name = f"{base.database}_rr_{uuid4().hex[:8]}"
    url = base.set(database=name)
    admin = base.set(drivername="postgresql", database="postgres")
    with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    engine = create_engine(url)
    env = os.environ | {"DATABASE_URL": url.render_as_string(hide_password=False)}
    server = Path(__file__).resolve().parents[1]

    def migrate(*args):
        subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=server,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

    def t(hm):
        return datetime.fromisoformat(f"2026-10-07T{hm}:00").replace(tzinfo=KST)

    try:
        migrate("upgrade", "head")
        with Session(engine) as db, db.begin():
            seed.seed(db)
            # n-x: reply-1(09:00) 뒤, reply-2(09:20) 앞에 올렸고 reply-2 뒤(09:30)에 지웠다
            # n-y: 09:40에 올려 09:45에 지웠다. reply-3(09:50)은 지운 소식에 붙지 않는다
            for bid, at_, gone in (("n-x", "09:10", "09:30"), ("n-y", "09:40", "09:45")):
                db.add(
                    Broadcast(
                        id=bid,
                        farm_id="f-kang",
                        body=bid,
                        photos=[],
                        visibility="FOLLOWERS",
                        reaction_count=0,
                        created_at=t(at_),
                        deleted_at=t(gone),
                    )
                )
            db.flush()
            db.add(
                RoomReply(
                    id="reply-3",
                    farm_id="f-kang",
                    consumer_id="u-minji",
                    body="세 번째",
                    created_at=t("09:50"),
                )
            )
        migrate("downgrade", "0030")
        assert "room_reads" not in inspect(engine).get_table_names()
        migrate("upgrade", "head")
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, broadcast_id, producer_read_at = created_at "
                    "FROM room_replies ORDER BY id"
                )
            ).all()
            quoted = conn.execute(
                text("SELECT count(*) FROM broadcasts WHERE quoted_reply_id IS NOT NULL")
            ).scalar_one()
            reads = conn.execute(text("SELECT count(*) FROM room_reads")).scalar_one()
        assert [tuple(r) for r in rows] == [
            ("reply-1", "n-1", True),
            ("reply-2", "n-x", True),
            ("reply-3", "n-1", True),
        ]
        assert quoted == 0 and reads == 0
        migrate("downgrade", "0030")
        migrate("upgrade", "head")
    finally:
        engine.dispose()
        with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
            conn.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))
