"""AC-33-2 / M-04: recorded context is not a permanent permission."""

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.errors import ApiError
from app.farms.models import Farm, FarmAiSettings, Follow
from app.messaging.models import Escalation, OrderInquiry, Thread, ThreadMessage, ThreadOrderContext
from app.messaging.order_context import eligible_order_ids, has_order_context, require_paid_order
from app.messaging.service import ensure_thread
from app.orders.models import Order
from tests.test_settings_inquiries import png, upload


def key():
    return {"Idempotency-Key": str(uuid.uuid4())}


@pytest.fixture
def first_order():
    with get_sessionmaker()() as db, db.begin():
        order = db.get(Order, "o-11")
        assert order.paid_at is not None
        order.consumer_id = "u-seojun"
        follow = db.get(Follow, ("u-seojun", "f-halla"))
        assert follow is None
        assert (
            db.scalar(
                select(Thread).where(Thread.farm_id == "f-halla", Thread.consumer_id == "u-seojun")
            )
            is None
        )
        db.merge(FarmAiSettings(farm_id="f-halla", enabled=False, version=1, updated_at=now()))
    return {"farmId": "f-halla", "orderId": "o-11"}


def start(client, headers, body, request_key=None):
    return client.post("/api/messaging/chats", headers=headers | (request_key or key()), json=body)


def count_state():
    with get_sessionmaker()() as db:
        return {
            model.__tablename__: db.scalar(select(func.count()).select_from(model))
            for model in (
                Thread,
                ThreadOrderContext,
                ThreadMessage,
                OrderInquiry,
                Escalation,
                Follow,
            )
        }


def test_AC_33_2_first_order_start_is_empty_private_and_does_not_follow(
    client, login, first_order, monkeypatch
):
    from app.ai import service as ai

    monkeypatch.setattr(ai, "answer_question", lambda *a, **k: pytest.fail("unexpected AI call"))
    consumer = login("u-seojun")
    before = count_state()
    missing = client.get("/api/messaging/chats/f-halla/messages", headers=consumer)
    assert missing.status_code == 404
    assert count_state() == before, "GET must not bootstrap"
    same_key = key()
    response = start(client, consumer, first_order, same_key)
    assert response.status_code == 200, response.text
    assert response.json() == {"farmId": "f-halla", "autoFollowed": False}
    assert start(client, consumer, first_order, same_key).json() == response.json()
    after = count_state()
    assert after == before | {
        "threads": before["threads"] + 1,
        "thread_order_contexts": before["thread_order_contexts"] + 1,
    }
    page = client.get("/api/messaging/chats/f-halla/messages", headers=consumer).json()
    assert page["items"] == [] and page["inquiries"] == []
    assert [o["orderId"] for o in page["orders"]] == ["o-11"]
    assert page["thread"]["aiMode"] == "AUTO" and page["thread"]["version"] == 1
    listed = client.get("/api/messaging/chats", headers=consumer).json()["items"]
    assert sum(row["farmId"] == "f-halla" for row in listed) == 1
    assert count_state() == after, "read-only list and page"
    blocked = client.post(
        "/api/messaging/chats/f-halla/messages",
        headers=consumer | key(),
        json={"text": "missing order"},
    )
    assert blocked.status_code == 403
    sent = client.post(
        "/api/messaging/chats/f-halla/messages",
        headers=consumer | key(),
        json={"text": "order question", "orderId": "o-11"},
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["message"]["orderId"] == "o-11"
    assert sent.json()["reply"] is None
    read = client.put(
        "/api/messaging/chats/f-halla/read",
        headers=consumer,
        json={"lastReadMessageId": sent.json()["message"]["messageId"]},
    )
    assert read.status_code == 200
    assert (
        client.get("/api/messaging/chats/f-halla/messages", headers=login("u-minji")).json()[
            "thread"
        ]["threadId"]
        != page["thread"]["threadId"]
    )


@pytest.mark.parametrize("invalid_order", ["missing", "", "o-38"])
def test_AC_33_2_start_rejects_wrong_farm_or_missing_order_without_writes(
    client, login, first_order, invalid_order
):
    consumer = login("u-seojun")
    before = count_state()
    response = start(client, consumer, first_order | {"orderId": invalid_order})
    assert response.status_code == 404
    assert count_state() == before


@pytest.mark.parametrize("change", ["owner", "unpaid", "unapproved"])
def test_AC_33_2_start_replay_reauthorizes_before_cached_result(client, login, first_order, change):
    consumer = login("u-seojun")
    same_key = key()
    assert start(client, consumer, first_order, same_key).status_code == 200
    with get_sessionmaker()() as db, db.begin():
        if change == "unapproved":
            db.get(Farm, "f-halla").approval_status = "SUSPENDED"
        else:
            order = db.get(Order, "o-11")
            if change == "owner":
                order.consumer_id = "u-minji"
            else:
                order.paid_at = None
    before = count_state()
    assert start(client, consumer, first_order, same_key).status_code == 404
    assert client.get("/api/messaging/chats/f-halla/messages", headers=consumer).status_code in (
        403,
        404,
    )
    assert count_state() == before
    listed = client.get("/api/messaging/chats", headers=consumer).json()["items"]
    assert all(row["farmId"] != "f-halla" for row in listed)


def test_AC_33_2_private_photos_work_and_other_participants_are_denied(
    client, login, first_order, other_farm_headers
):
    consumer = login("u-seojun")
    stranger = login("u-minji")
    assert start(client, consumer, first_order).status_code == 200
    page = client.get("/api/messaging/chats/f-halla/messages", headers=consumer).json()
    thread_id = page["thread"]["threadId"]
    photo = upload(client, consumer, png(), threadId=thread_id)
    assert photo.status_code == 200, photo.text
    aid = photo.json()["attachmentId"]
    assert upload(client, stranger, png(), threadId=thread_id).status_code == 404
    assert client.get(f"/api/messaging/attachments/{aid}", headers=stranger).status_code == 404
    sent = client.post(
        "/api/messaging/chats/f-halla/messages",
        headers=consumer | key(),
        json={"text": "", "attachmentIds": [aid], "orderId": "o-11"},
    )
    assert sent.status_code == 200, sent.text
    assert client.get(f"/api/messaging/attachments/{aid}", headers=consumer).status_code == 200
    # Only the Halla owner and this consumer participate.
    assert (
        client.get(f"/api/messaging/attachments/{aid}", headers=other_farm_headers).status_code
        == 200
    )
    assert (
        client.get(f"/api/messaging/attachments/{aid}", headers=login("u-kang")).status_code == 404
    )
    assert client.get(f"/api/messaging/attachments/{aid}", headers=stranger).status_code == 404
    invalid = upload(client, consumer, png(), orderId="o-11", threadId=thread_id)
    assert invalid.status_code == 400


def test_AC_33_2_existing_mode_and_multiple_order_contexts_are_preserved(client, login):
    consumer = login("u-minji")
    with get_sessionmaker()() as db, db.begin():
        thread = db.scalar(
            select(Thread).where(Thread.farm_id == "f-kang", Thread.consumer_id == "u-minji")
        )
        thread.ai_mode, thread.version = "HUMAN", 8
        db.get(Order, "o-38").consumer_id = "u-minji"
    same = key()
    assert start(client, consumer, {"farmId": "f-kang", "orderId": "o-42"}, same).status_code == 200
    mismatch = start(client, consumer, {"farmId": "f-kang", "orderId": "o-38"}, same)
    assert mismatch.status_code == 409
    assert mismatch.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    assert start(client, consumer, {"farmId": "f-kang", "orderId": "o-38"}).status_code == 200
    page = client.get("/api/messaging/chats/f-kang/messages", headers=consumer).json()
    assert page["thread"]["aiMode"] == "HUMAN" and page["thread"]["version"] == 8
    assert {o["orderId"] for o in page["orders"]} >= {"o-38", "o-42"}


def test_AC_33_2_start_authentication_role_and_onboarding_gates(client, login, first_order):
    assert start(client, {}, first_order).status_code == 401
    assert start(client, login("u-kang"), first_order).status_code == 403
    consumer = login("u-seojun")
    from app.accounts.models import User

    with get_sessionmaker()() as db, db.begin():
        db.get(User, "u-seojun").nickname = None
        db.get(User, "u-seojun").is_test_account = False
    response = start(client, consumer, first_order)
    assert response.status_code == 403
    assert response.json()["details"]["reason"] == "ONBOARDING_REQUIRED"


def test_AC_33_2_context_model_is_unique_and_has_no_business_side_effect():
    with get_sessionmaker()() as db, db.begin():
        thread = ensure_thread(db, "f-kang", "u-seojun")
        counts = [
            db.scalar(select(func.count()).select_from(model))
            for model in (ThreadMessage, OrderInquiry)
        ]
        db.add(ThreadOrderContext(thread_id=thread.id, order_id="o-38", created_at=now()))
        db.flush()
        assert eligible_order_ids(db, thread) == ["o-38"]
        assert [
            db.scalar(select(func.count()).select_from(model))
            for model in (ThreadMessage, OrderInquiry)
        ] == counts
        with pytest.raises(IntegrityError), db.begin_nested():
            db.add(ThreadOrderContext(thread_id=thread.id, order_id="o-38", created_at=now()))
            db.flush()
        assert has_order_context(db, thread)


@pytest.mark.parametrize("change", ["unpaid", "owner", "farm"])
def test_AC_33_2_recorded_context_revalidates_order(change):
    with get_sessionmaker()() as db, db.begin():
        thread = ensure_thread(db, "f-kang", "u-seojun")
        db.add(ThreadOrderContext(thread_id=thread.id, order_id="o-38", created_at=now()))
        db.flush()
        order = db.get(Order, "o-38")
        if change == "unpaid":
            order.paid_at = None
        elif change == "owner":
            order.consumer_id = "u-minji"
        else:
            thread.farm_id = "f-halla"
        db.flush()
        assert not has_order_context(db, thread)


def test_AC_33_2_multiple_orders_and_payment_history():
    with get_sessionmaker()() as db, db.begin():
        thread = ensure_thread(db, "f-kang", "u-minji")
        for order_id in ["o-42", "o-38"]:
            order = db.get(Order, order_id)
            order.consumer_id = "u-minji"
            order.status = "CANCELED"
            db.add(ThreadOrderContext(thread_id=thread.id, order_id=order_id, created_at=now()))
        db.flush()
        assert eligible_order_ids(db, thread) == ["o-38", "o-42"]
        assert require_paid_order(db, "u-minji", "f-kang", "o-42").id == "o-42"


@pytest.mark.parametrize(
    "consumer,farm,order_id",
    [
        ("u-minji", "f-kang", "o-38"),
        ("u-seojun", "f-halla", "o-38"),
        ("u-seojun", "f-kang", "missing"),
    ],
)
def test_AC_33_2_invalid_context_is_non_enumerating(consumer, farm, order_id):
    with get_sessionmaker()() as db:
        with pytest.raises(ApiError) as caught:
            require_paid_order(db, consumer, farm, order_id)
        assert caught.value.status == 404


def test_AC_33_2_legacy_inquiry_remains_eligible(client, login):
    headers = login("u-seojun")
    response = client.post(
        "/api/orders/o-38/inquiries",
        headers=headers | key(),
        json={"type": "OTHER", "text": "배송 문의"},
    )
    assert response.status_code == 200, response.text
    with get_sessionmaker()() as db:
        thread = db.get(Thread, response.json()["threadId"])
        assert eligible_order_ids(db, thread) == ["o-38"]
        assert db.scalar(select(func.count()).select_from(ThreadOrderContext)) == 0


@pytest.mark.parametrize("mode", ["same-key", "different-key", "general-order"])
def test_AC_33_2_concurrent_starts_keep_one_thread_and_context(client, login, first_order, mode):
    consumer = login("u-seojun")
    before = count_state()
    with get_sessionmaker()() as db:
        followers = db.get(Farm, "f-halla").follower_count
    barrier = threading.Barrier(2)
    shared_key = key()

    def request(index):
        barrier.wait(timeout=5)
        body = {"farmId": "f-halla"} if mode == "general-order" and index == 0 else first_order
        request_key = shared_key if mode == "same-key" else key()
        return start(client, consumer, body, request_key)

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(request, range(2)))
    assert [r.status_code for r in responses] == [200, 200], [r.text for r in responses]
    after = count_state()
    assert after["threads"] == before["threads"] + 1
    assert after["thread_order_contexts"] == before["thread_order_contexts"] + 1
    assert after["thread_messages"] == before["thread_messages"]
    expected_follow = int(mode == "general-order")
    assert after["follows"] == before["follows"] + expected_follow
    with get_sessionmaker()() as db:
        assert db.get(Farm, "f-halla").follower_count == followers + expected_follow
    if mode != "general-order":
        assert all(r.json()["autoFollowed"] is False for r in responses)


def test_AC_12_4_general_start_can_replay_a_pre_upgrade_body_hash(client, login, first_order):
    from app.accounts.models import User
    from app.core.idempotency import run_idempotent
    from app.messaging.service import start_chat

    consumer = login("u-seojun")
    request_key = str(uuid.uuid4())
    with get_sessionmaker()() as db:
        user = db.get(User, "u-seojun")
        original = run_idempotent(
            db,
            user.id,
            "start:f-halla",
            request_key,
            {"farmId": "f-halla"},
            lambda: start_chat(db, user, "f-halla"),
        )
    response = start(client, consumer, {"farmId": "f-halla"}, {"Idempotency-Key": request_key})
    assert response.status_code == 200, response.text
    assert response.json() == original


def test_AC_33_2_cached_send_cannot_bypass_revoked_order_access(client, login, first_order):
    consumer = login("u-seojun")
    assert start(client, consumer, first_order).status_code == 200
    same_key = key()
    body = {"text": "order message", "orderId": "o-11"}
    path = "/api/messaging/chats/f-halla/messages"
    assert client.post(path, headers=consumer | same_key, json=body).status_code == 200
    with get_sessionmaker()() as db, db.begin():
        db.get(Order, "o-11").paid_at = None
    before = count_state()
    assert client.post(path, headers=consumer | same_key, json=body).status_code == 403
    assert count_state() == before
