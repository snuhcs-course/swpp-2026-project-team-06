"""AC-33-2 / M-04: recorded context is not a permanent permission."""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.errors import ApiError
from app.messaging.models import OrderInquiry, Thread, ThreadMessage, ThreadOrderContext
from app.messaging.order_context import eligible_order_ids, has_order_context, require_paid_order
from app.messaging.service import ensure_thread
from app.orders.models import Order


def key():
    return {"Idempotency-Key": str(uuid.uuid4())}


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
