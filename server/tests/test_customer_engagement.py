"""AC-ENG-1~5: persisted evidence, abuse prevention, isolation and numeric boundaries."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier

import pytest
from sqlalchemy import delete, func, select, update

from app.accounts.models import User
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.engagement import service
from app.engagement.models import CustomerReview, FarmReport, FollowReceipt
from app.farms import service as farms
from app.farms.models import Follow
from app.messaging.models import Broadcast, Reaction, RoomReply, Thread, ThreadMessage
from app.orders.models import Order


def parts(client, farm="f-kang"):
    response = client.get(f"/api/farms/{farm}/temperature")
    assert response.status_code == 200, response.text
    return response.json()


def tasks(client, headers):
    response = client.get("/api/engagement/achievements", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == len(body["tasks"]) == 5
    assert body["completedCount"] == sum(t["completed"] for t in body["tasks"])
    assert all(t["progress"] == int(t["completed"]) and t["target"] == 1 for t in body["tasks"])
    return {t["id"]: t["completed"] for t in body["tasks"]}


def completed_order(order_id="o-42"):
    with get_sessionmaker()() as db, db.begin():
        order = db.get(Order, order_id)
        order.status = "COMPLETED"
        order.completed_at = now()
        order.refunded_at = None


def test_AC_ENG_1_first_follow_receipt_retries_unfollow_and_refollow(client, login):
    headers = login("u-minji")
    url = "/api/farms/f-namwon/follow"
    first = client.put(url, headers=headers).json()
    assert first["firstFollow"] is True and first["fanNumber"] == 1
    # Decorated seed follower_count=57 is deliberately not used as the ordinal.
    duplicate = client.put(url, headers=headers).json()
    assert duplicate["fanNumber"] == 1 and duplicate["firstFollow"] is False
    assert duplicate["followerCount"] == first["followerCount"]
    deleted = client.delete(url, headers=headers).json()
    assert deleted["firstFollow"] is False and deleted["fanNumber"] == 1
    refollow = client.put(url, headers=headers).json()
    assert refollow["fanNumber"] == 1 and refollow["firstFollow"] is False
    second = client.put(url, headers=login("u-seojun")).json()
    assert second["fanNumber"] == 2 and second["firstFollow"] is True
    with get_sessionmaker()() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(FollowReceipt)
                .where(FollowReceipt.farm_id == "f-namwon")
            )
            == 2
        )


def test_AC_ENG_1_seed_existing_follow_never_gets_new_welcome(client, login):
    response = client.put("/api/farms/f-kang/follow", headers=login("u-minji"))
    assert response.status_code == 200
    assert response.json()["firstFollow"] is False
    assert response.json()["fanNumber"] == 2  # real seed pairs, alphabetically backfilled


def test_AC_ENG_1_concurrent_distinct_and_duplicate_follow_are_serialized(client):
    def concurrent(consumers):
        gate = Barrier(len(consumers))

        def follow(consumer):
            gate.wait(timeout=10)
            with get_sessionmaker()() as db, db.begin():
                return farms.set_follow(db, consumer, "f-namwon", True)

        with ThreadPoolExecutor(max_workers=len(consumers)) as pool:
            return list(pool.map(follow, consumers))

    results = concurrent(["u-minji", "u-seojun"])
    assert {row.fan_number for row in results} == {1, 2}
    assert all(row.first_follow for row in results)
    repeated = concurrent(["u-minji", "u-minji"])
    assert all(not row.first_follow for row in repeated)
    assert repeated[0].follower_count == repeated[1].follower_count
    with get_sessionmaker()() as db:
        assert (
            db.scalar(select(func.count()).select_from(Follow).where(Follow.farm_id == "f-namwon"))
            == 2
        )


def test_AC_ENG_1_failed_follow_never_allocates_receipt(client, login):
    for farm in ["missing", "f-misook"]:
        assert client.put(f"/api/farms/{farm}/follow", headers=login("u-minji")).status_code == 404
    assert client.put("/api/farms/f-namwon/follow").status_code == 401
    assert client.put("/api/farms/f-namwon/follow", headers=login("u-kang")).status_code == 403
    with get_sessionmaker()() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(FollowReceipt)
                .where(FollowReceipt.farm_id == "f-namwon")
            )
            == 0
        )


def test_AC_ENG_2_baseline_public_visibility_and_follow_reversal(client, login):
    baseline = parts(client, "f-namwon")
    assert baseline["temperatureTenths"] == 365
    assert baseline["contributions"] == dict(F=0, P=0, L=0, H=0, R=0, M=0)
    assert baseline["policyVersion"] == 1 and baseline["calculatedAt"]
    headers = login("u-minji")
    client.put("/api/farms/f-namwon/follow", headers=headers)
    assert parts(client, "f-namwon")["temperatureTenths"] == 366
    client.delete("/api/farms/f-namwon/follow", headers=headers)
    assert parts(client, "f-namwon")["temperatureTenths"] == 365
    assert client.get("/api/farms/f-misook/temperature").status_code == 404
    assert client.get("/api/farms/missing/temperature").status_code == 404
    assert "consumerId" not in str(baseline) and "reason" not in str(baseline)


def test_AC_ENG_2_posts_kst_day_week_window_inclusive_and_future(monkeypatch, client):
    instant = datetime.fromisoformat("2026-10-12T00:00:00+09:00")
    monkeypatch.setattr(service, "now", lambda: instant)
    dates = [instant - timedelta(days=28), instant - timedelta(days=28, microseconds=1)]
    dates += [instant - timedelta(days=d, seconds=1) for d in range(7)]
    dates += [instant, instant, instant + timedelta(microseconds=1)]
    with get_sessionmaker()() as db, db.begin():
        for i, date in enumerate(dates):
            db.add(
                Broadcast(
                    id=f"edge-{i}",
                    farm_id="f-namwon",
                    body="소식",
                    photos=[],
                    visibility="PUBLIC",
                    created_at=date,
                )
            )
        db.add(
            Broadcast(
                id="edge-private",
                farm_id="f-namwon",
                body="비공개",
                photos=[],
                visibility="FOLLOWERS",
                created_at=instant - timedelta(days=14),
            )
        )
        db.add(
            Broadcast(
                id="edge-deleted",
                farm_id="f-namwon",
                body="삭제",
                photos=[],
                visibility="PUBLIC",
                created_at=instant - timedelta(days=21),
                deleted_at=instant,
            )
        )
    body = parts(client, "f-namwon")
    assert body["contributions"]["P"] == 5  # inclusive old Monday + capped week3 + new Monday1
    assert body["temperatureTenths"] == 370


def test_AC_ENG_2_reaction_distinct_valid_consumer_and_reversal(client):
    instant = now()
    with get_sessionmaker()() as db, db.begin():
        db.add_all(
            [
                Broadcast(
                    id="like-a",
                    farm_id="f-namwon",
                    body="a",
                    visibility="PUBLIC",
                    created_at=instant,
                ),
                Broadcast(
                    id="like-b",
                    farm_id="f-namwon",
                    body="b",
                    visibility="PUBLIC",
                    created_at=instant,
                ),
            ]
        )
        db.flush()
        for broadcast, user in [
            ("like-a", "u-minji"),
            ("like-b", "u-minji"),
            ("like-a", "u-seojun"),
            ("like-a", "u-kang"),
        ]:
            db.add(Reaction(broadcast_id=broadcast, user_id=user, created_at=instant))
    assert parts(client, "f-namwon")["contributions"]["L"] == 2
    with get_sessionmaker()() as db, db.begin():
        db.execute(update(User).where(User.id == "u-seojun").values(deleted_at=instant))
        db.execute(update(Broadcast).where(Broadcast.id == "like-a").values(deleted_at=instant))
    assert parts(client, "f-namwon")["contributions"]["L"] == 1
    with get_sessionmaker()() as db, db.begin():
        db.execute(delete(Reaction).where(Reaction.broadcast_id == "like-b"))
    assert parts(client, "f-namwon")["contributions"]["L"] == 0


def test_AC_ENG_2_positive_caps_and_human_reply_order_not_ai(client):
    instant = now()
    with get_sessionmaker()() as db, db.begin():
        for i in range(105):
            db.add(User(id=f"cap-{i}", name="테스트", role="CONSUMER", created_at=instant))
        db.flush()
        db.add(
            Broadcast(
                id="cap-news",
                farm_id="f-namwon",
                body="소식",
                visibility="PUBLIC",
                created_at=instant,
            )
        )
        for i in range(105):
            db.add(Follow(consumer_id=f"cap-{i}", farm_id="f-namwon", created_at=instant))
        db.flush()
        for i in range(32):
            db.add(Reaction(broadcast_id="cap-news", user_id=f"cap-{i}", created_at=instant))
            db.add(
                Thread(
                    id=f"cap-thread-{i}",
                    farm_id="f-namwon",
                    consumer_id=f"cap-{i}",
                    created_at=instant,
                )
            )
        db.flush()
        for i in range(32):
            db.add(
                ThreadMessage(
                    id=f"cap-q-{i}",
                    thread_id=f"cap-thread-{i}",
                    sender_type="CONSUMER",
                    body="질문",
                    created_at=instant,
                )
            )
        db.flush()
        for i in range(32):
            db.add(
                ThreadMessage(
                    id=f"cap-a-{i}",
                    thread_id=f"cap-thread-{i}",
                    sender_type="PRODUCER",
                    body="답변",
                    created_at=instant,
                )
            )
    assert parts(client, "f-namwon")["contributions"] == dict(F=100, P=1, L=30, H=30, R=0, M=0)
    with get_sessionmaker()() as db, db.begin():
        db.execute(
            update(ThreadMessage).where(ThreadMessage.id.like("cap-a-%")).values(sender_type="AI")
        )
    assert parts(client, "f-namwon")["contributions"]["H"] == 0


@pytest.mark.parametrize("stars,score", [(1, -1), (2, -1), (3, 0), (4, 1), (5, 1)])
def test_AC_ENG_3_review_stars_replace_not_accumulate(client, login, stars, score):
    completed_order()
    headers = login("u-minji")
    url = "/api/engagement/reviews/o-42"
    assert client.get(url, headers=headers).json() == {"orderId": "o-42", "stars": None}
    for _ in range(2):
        response = client.put(url, headers=headers, json={"stars": stars})
        assert response.status_code == 200, response.text
    assert parts(client)["contributions"]["R"] == score
    assert client.get(url, headers=headers).json()["stars"] == stars
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(CustomerReview)) == 1
    client.put(url, headers=headers, json={"stars": 5})
    assert parts(client)["contributions"]["R"] == 1
    with get_sessionmaker()() as db, db.begin():
        db.execute(update(Order).where(Order.id == "o-42").values(refunded_at=now()))
    assert parts(client)["contributions"]["R"] == 0
    assert client.get(url, headers=headers).json()["stars"] is None


@pytest.mark.parametrize("stars", [0, 6, -1, 1.1, 5.0, True, False, "5", None])
def test_AC_ENG_3_review_rejects_invalid_and_noninteger_stars(client, login, stars):
    completed_order()
    response = client.put(
        "/api/engagement/reviews/o-42", headers=login("u-minji"), json={"stars": stars}
    )
    assert response.status_code == 400
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(CustomerReview)) == 0


def test_AC_ENG_3_review_permissions_and_uncompleted_orders(client, login):
    url = "/api/engagement/reviews/o-42"
    assert client.put(url, json={"stars": 5}).status_code == 401
    assert client.put(url, headers=login("u-kang"), json={"stars": 5}).status_code == 403
    assert client.put(url, headers=login("u-seojun"), json={"stars": 5}).status_code == 404
    assert client.get(url, headers=login("u-seojun")).status_code == 404
    assert client.put(url, headers=login("u-minji"), json={"stars": 5}).status_code == 409
    completed_order()
    with get_sessionmaker()() as db, db.begin():
        db.get(Order, "o-42").refunded_at = now()
    assert client.put(url, headers=login("u-minji"), json={"stars": 5}).status_code == 409


def test_AC_ENG_3_report_pending_duplicate_moderation_incident_and_overturn(
    client, login, admin_headers
):
    def report(user):
        response = client.post(
            "/api/engagement/farms/f-namwon/reports",
            headers=login(user),
            json={"reason": "실제 경험한 문제를 신고합니다."},
        )
        assert response.status_code == 200, response.text
        return response.json()["reportId"]

    a, b = report("u-minji"), report("u-seojun")
    assert a == report("u-minji")
    assert parts(client, "f-namwon")["temperatureTenths"] == 365
    url = f"/api/engagement/reports/{a}"
    assert (
        client.patch(
            url, headers=login("u-minji"), json={"status": "CONFIRMED", "incidentKey": "case-1"}
        ).status_code
        == 403
    )
    assert client.patch(url, headers=admin_headers, json={"status": "CONFIRMED"}).status_code == 400
    for report_id in [a, b]:
        response = client.patch(
            f"/api/engagement/reports/{report_id}",
            headers=admin_headers,
            json={"status": "CONFIRMED", "incidentKey": "case-1"},
        )
        assert response.status_code == 200, response.text
    assert parts(client, "f-namwon")["temperatureTenths"] == 364
    client.patch(url, headers=admin_headers, json={"status": "OVERTURNED"})
    assert parts(client, "f-namwon")["contributions"]["M"] == 1
    client.patch(f"/api/engagement/reports/{b}", headers=admin_headers, json={"status": "REJECTED"})
    assert parts(client, "f-namwon")["temperatureTenths"] == 365
    assert (
        client.patch(
            "/api/engagement/reports/missing", headers=admin_headers, json={"status": "REJECTED"}
        ).status_code
        == 404
    )
    with get_sessionmaker()() as db:
        row = db.get(FarmReport, a)
        assert row.reviewed_by == "u-admin" and row.reviewed_at is not None


@pytest.mark.parametrize(
    "reason,expected",
    [("a" * 9, 400), ("a" * 10, 200), ("a" * 1000, 200), ("a" * 1001, 400), (" " * 20, 400)],
)
def test_AC_ENG_3_report_reason_boundaries(client, login, reason, expected):
    response = client.post(
        "/api/engagement/farms/f-namwon/reports", headers=login("u-minji"), json={"reason": reason}
    )
    assert response.status_code == expected
    assert parts(client, "f-namwon")["contributions"]["M"] == 0


@pytest.mark.parametrize(
    "scores,expected",
    [
        (dict(F=0, P=0, L=0, H=0, R=0, M=0), 365),
        (dict(F=0, P=0, L=0, H=0, R=0, M=365), 0),
        (dict(F=0, P=0, L=0, H=0, R=0, M=366), 0),
        (dict(F=0, P=0, L=0, H=0, R=625, M=0), 990),
        (dict(F=0, P=0, L=0, H=0, R=626, M=0), 990),
        (dict(F=0, P=0, L=0, H=0, R=626, M=2), 989),
        (dict(F=0, P=0, L=0, H=0, R=2, M=366), 1),
    ],
)
def test_AC_ENG_2_final_clamp_preserves_overflow_for_reversals(scores, expected):
    assert service.clamp_temperature(scores) == expected


def test_AC_ENG_4_achievements_need_evidence_and_revert_after_undo(client, login):
    headers = login("u-seojun")
    # Remove this customer's genuine seeded actions; leave everyone else's unchanged.
    with get_sessionmaker()() as db, db.begin():
        db.execute(delete(Follow).where(Follow.consumer_id == "u-seojun"))
        db.execute(delete(Reaction).where(Reaction.user_id == "u-seojun"))
        db.execute(delete(RoomReply).where(RoomReply.consumer_id == "u-seojun"))
        db.execute(
            update(ThreadMessage)
            .where(
                ThreadMessage.thread_id.in_(
                    select(Thread.id).where(Thread.consumer_id == "u-seojun")
                )
            )
            .values(sender_type="AI")
        )
        db.execute(
            update(Order)
            .where(Order.consumer_id == "u-seojun")
            .values(status="PENDING_PAYMENT", completed_at=None)
        )
    assert not any(tasks(client, headers).values())
    assert tasks(client, login("u-minji"))["first_follow"] is True
    assert not any(tasks(client, headers).values())  # no cross-account completion
    client.put("/api/farms/f-namwon/follow", headers=headers)
    assert tasks(client, headers)["first_follow"] is True
    client.delete("/api/farms/f-namwon/follow", headers=headers)
    assert tasks(client, headers)["first_follow"] is False
    with get_sessionmaker()() as db, db.begin():
        db.add(Reaction(broadcast_id="n-1", user_id="u-seojun", created_at=now()))
        db.add(
            RoomReply(
                id="eng-hello",
                farm_id="f-kang",
                consumer_id="u-seojun",
                body="안녕하세요",
                created_at=now(),
            )
        )
    current = tasks(client, headers)
    assert current["first_reaction"] is True and current["first_message"] is True
    with get_sessionmaker()() as db, db.begin():
        db.execute(delete(Reaction).where(Reaction.user_id == "u-seojun"))
    assert tasks(client, headers)["first_reaction"] is False
    assert (
        client.put(
            "/api/engagement/achievements", headers=headers, json={"completed": True}
        ).status_code
        == 405
    )


def test_AC_ENG_4_purchase_is_completed_not_created_paid_or_reported(client, login):
    headers = login("u-minji")
    with get_sessionmaker()() as db, db.begin():
        db.execute(
            update(Order)
            .where(Order.consumer_id == "u-minji")
            .values(
                status="PREPARING",
                completed_at=None,
                refunded_at=None,
                paid_at=now(),
                deposit_reported_at=now(),
            )
        )
    assert tasks(client, headers)["first_purchase"] is False
    assert tasks(client, headers)["first_review"] is False
    completed_order()
    assert tasks(client, headers)["first_purchase"] is True
    assert tasks(client, headers)["first_review"] is False
    client.put("/api/engagement/reviews/o-42", headers=headers, json={"stars": 5})
    assert tasks(client, headers)["first_review"] is True
    with get_sessionmaker()() as db, db.begin():
        db.get(Order, "o-42").refunded_at = now()
    assert tasks(client, headers)["first_purchase"] is False
    assert tasks(client, headers)["first_review"] is False
    assert client.get("/api/engagement/achievements").status_code == 401
    assert client.get("/api/engagement/achievements", headers=login("u-kang")).status_code == 403


def test_AC_ENG_3_admin_queue_private_paginated_and_validated(client, login, admin_headers):
    for consumer in ["u-minji", "u-seojun"]:
        client.post(
            "/api/engagement/farms/f-namwon/reports",
            headers=login(consumer),
            json={"reason": "실제 경험한 문제를 운영팀에 신고합니다."},
        )
    assert client.get("/api/engagement/reports").status_code == 401
    assert client.get("/api/engagement/reports", headers=login("u-minji")).status_code == 403
    first = client.get("/api/engagement/reports?limit=1", headers=admin_headers)
    assert first.status_code == 200, first.text
    body = first.json()
    assert len(body["items"]) == 1 and body["nextCursor"]
    assert body["items"][0]["reason"] == "실제 경험한 문제를 운영팀에 신고합니다."
    assert "consumerId" not in body["items"][0]
    second = client.get(
        "/api/engagement/reports",
        headers=admin_headers,
        params={"limit": 1, "cursor": body["nextCursor"]},
    ).json()
    assert second["items"][0]["reportId"] != body["items"][0]["reportId"]
    assert second["nextCursor"] is None
    for params in [
        {"limit": 0},
        {"limit": 51},
        {"status": "INVALID"},
        {"cursor": "Wy0xXQ=="},
        {"cursor": "WyJmb28iXQ=="},
        {"cursor": "W10="},
        {"cursor": "W3RydWVd"},
    ]:
        assert (
            client.get("/api/engagement/reports", headers=admin_headers, params=params).status_code
            == 400
        )


def test_AC_ENG_2_confirmed_incident_survives_deleted_reporter_future_reaction_excluded(
    client, login, admin_headers
):
    instant = now()
    response = client.post(
        "/api/engagement/farms/f-namwon/reports",
        headers=login("u-minji"),
        json={"reason": "실제 경험한 문제를 신고합니다."},
    )
    report_id = response.json()["reportId"]
    client.patch(
        f"/api/engagement/reports/{report_id}",
        headers=admin_headers,
        json={"status": "CONFIRMED", "incidentKey": "case-a"},
    )
    assert parts(client, "f-namwon")["contributions"]["M"] == 1
    with get_sessionmaker()() as db, db.begin():
        db.get(User, "u-minji").deleted_at = instant
        db.add(
            Broadcast(
                id="future-reaction",
                farm_id="f-namwon",
                body="소식",
                visibility="PUBLIC",
                created_at=instant,
            )
        )
        db.flush()
        db.add(
            Reaction(
                broadcast_id="future-reaction",
                user_id="u-seojun",
                created_at=instant + timedelta(microseconds=1),
            )
        )
    assert parts(client, "f-namwon")["contributions"]["M"] == 1
    assert parts(client, "f-namwon")["contributions"]["L"] == 0


def test_AC_ENG_1_migration_backfills_only_real_follows_in_stable_order():
    """Run actual upgrade/downgrade in an isolated transactional schema, with legacy rows."""
    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text

    from app.core.db import get_engine

    path = Path(__file__).parents[1] / "migrations/versions/0038_customer_engagement.py"
    spec = spec_from_file_location("engagement_migration", path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    with get_engine().begin() as connection:
        connection.execute(text("CREATE SCHEMA engagement_migration_test"))
        connection.execute(text("SET LOCAL search_path TO engagement_migration_test"))
        for statement in [
            "CREATE TABLE users (id varchar(64) PRIMARY KEY)",
            "CREATE TABLE farms (id varchar(64) PRIMARY KEY, follower_count integer)",
            "CREATE TABLE orders (id varchar(64) PRIMARY KEY)",
            "CREATE TABLE follows (consumer_id varchar(64), farm_id varchar(64), "
            "created_at timestamptz, PRIMARY KEY(consumer_id,farm_id))",
            "INSERT INTO users VALUES ('z'),('a'),('b')",
            "INSERT INTO farms VALUES ('farm',128),('empty',999)",
            "INSERT INTO follows VALUES ('z','farm','2026-10-01T00:00:00Z'),"
            "('b','farm','2026-10-02T00:00:00Z'),('a','farm','2026-10-02T00:00:00Z')",
        ]:
            connection.execute(text(statement))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            rows = connection.execute(
                text("SELECT consumer_id,fan_number FROM follow_receipts ORDER BY fan_number")
            ).all()
            assert rows == [("z", 1), ("a", 2), ("b", 3)]
            assert (
                connection.scalar(
                    text("SELECT count(*) FROM follow_receipts WHERE farm_id='empty'")
                )
                == 0
            )
            migration.downgrade()
        connection.execute(text("DROP SCHEMA engagement_migration_test CASCADE"))


def test_AC_ENG_2_reaction_and_human_window_edges_and_message_order(client):
    instant = now()
    since = instant - timedelta(days=28)
    with get_sessionmaker()() as db, db.begin():
        db.add(
            Broadcast(
                id="window-news",
                farm_id="f-namwon",
                body="소식",
                visibility="PUBLIC",
                created_at=instant,
            )
        )
        for consumer in ["u-minji", "u-seojun"]:
            db.add(
                Thread(
                    id=f"window-{consumer}",
                    farm_id="f-namwon",
                    consumer_id=consumer,
                    created_at=since - timedelta(days=1),
                )
            )
        db.flush()
        db.add_all(
            [
                Reaction(broadcast_id="window-news", user_id="u-minji", created_at=since),
                Reaction(broadcast_id="window-news", user_id="u-seojun", created_at=instant),
                ThreadMessage(
                    id="window-old-question",
                    thread_id="window-u-minji",
                    sender_type="CONSUMER",
                    body="질문",
                    created_at=since - timedelta(days=1),
                ),
                ThreadMessage(
                    id="window-welcome",
                    thread_id="window-u-seojun",
                    sender_type="PRODUCER",
                    body="먼저 인사",
                    created_at=since,
                ),
            ]
        )
        db.flush()
        db.add_all(
            [
                ThreadMessage(
                    id="window-old-answer",
                    thread_id="window-u-minji",
                    sender_type="PRODUCER",
                    body="답",
                    created_at=since,
                ),
                ThreadMessage(
                    id="window-new-question",
                    thread_id="window-u-seojun",
                    sender_type="CONSUMER",
                    body="질문",
                    created_at=instant,
                ),
            ]
        )
    assert parts(client, "f-namwon")["contributions"]["L"] == 2
    assert parts(client, "f-namwon")["contributions"]["H"] == 1  # welcome wasn't a response
    with get_sessionmaker()() as db, db.begin():
        db.add(
            ThreadMessage(
                id="window-new-answer",
                thread_id="window-u-seojun",
                sender_type="PRODUCER",
                body="답",
                created_at=instant,
            )
        )
    assert parts(client, "f-namwon")["contributions"]["H"] == 2
    with get_sessionmaker()() as db, db.begin():
        db.execute(
            update(Reaction)
            .where(Reaction.user_id == "u-minji", Reaction.broadcast_id == "window-news")
            .values(created_at=since - timedelta(microseconds=1))
        )
        db.execute(
            update(Reaction)
            .where(Reaction.user_id == "u-seojun", Reaction.broadcast_id == "window-news")
            .values(created_at=instant + timedelta(microseconds=1))
        )
        db.get(ThreadMessage, "window-old-answer").created_at = since - timedelta(microseconds=1)
        db.get(ThreadMessage, "window-new-answer").created_at = instant + timedelta(microseconds=1)
    assert parts(client, "f-namwon")["contributions"]["L"] == 0
    assert parts(client, "f-namwon")["contributions"]["H"] == 0


def test_AC_ENG_6_existing_purge_preview_and_commit_handle_engagement_rows(client, login):
    from app.admin.purge_except import purge

    completed_order()
    headers = login("u-minji")
    assert (
        client.put("/api/engagement/reviews/o-42", headers=headers, json={"stars": 5}).status_code
        == 200
    )
    assert (
        client.post(
            "/api/engagement/farms/f-kang/reports",
            headers=headers,
            json={"reason": "실제 경험한 문제를 신고합니다."},
        ).status_code
        == 200
    )
    preview = purge(["u-kang"], commit=False)
    assert preview.tables["customer_reviews"] == (1, 0)
    assert preview.tables["farm_reports"] == (1, 0)
    assert preview.tables["follow_receipts"] == (5, 0)
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(CustomerReview)) == 1
        assert db.scalar(select(func.count()).select_from(FarmReport)) == 1
        assert db.scalar(select(func.count()).select_from(FollowReceipt)) == 5
    committed = purge(["u-kang"], commit=True, expect_farms=["f-kang"], backup_done=True)
    assert committed.committed is True
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(CustomerReview)) == 0
        assert db.scalar(select(func.count()).select_from(FarmReport)) == 0
        assert db.scalar(select(func.count()).select_from(FollowReceipt)) == 0
