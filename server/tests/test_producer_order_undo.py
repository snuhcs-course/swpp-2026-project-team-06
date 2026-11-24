"""DEV-455: public producer undo contract, written from acceptance requirements.

Fixtures use the isolated database in conftest; no undo implementation is imported.
"""

import uuid

import pytest
from sqlalchemy import select

from app.catalog.models import Product, StageAllocation
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.orders.models import Order, Payment, Refund
from tests.test_orders import allocation, deposit, key, order_body


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def action(client, producer, oid, name, body=None):
    return ok(client.post(f"/api/orders/{oid}/{name}", headers=producer | key(), json=body or {}))


def waiting(client, login, **overrides):
    consumer, producer = login("u-seojun"), login("u-kang")
    created = ok(client.post("/api/orders", headers=consumer | key(), json=order_body(**overrides)))
    row = ok(deposit(client, consumer, created["orderId"]))
    return row["orderId"], consumer, producer


def detail(client, consumer, oid):
    return ok(client.get(f"/api/orders/{oid}", headers=consumer))


def rows(client, producer):
    return {
        r["orderId"]: r
        for r in ok(client.get("/api/orders/producer?limit=50", headers=producer))["items"]
    }


def token(row, previous):
    undo = row.get("undoAction")
    assert undo and undo["actionId"] and undo["label"] and undo["createdAt"], row
    assert undo["previousStatus"] == previous
    return undo["actionId"]


def undo(client, producer, oid, action_id, request_key=None):
    return client.post(
        f"/api/orders/{oid}/undo",
        headers=producer | {"Idempotency-Key": request_key or str(uuid.uuid4())},
        json={"actionId": action_id},
    )


def conflict(response):
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "UNDO_CONFLICT", response.text


def financial(oid):
    with get_sessionmaker()() as db:
        payments = sorted(
            (p.id, p.amount, p.status, p.approved_at)
            for p in db.scalars(select(Payment).where(Payment.order_id == oid))
        )
        refunds = sorted(
            (r.id, r.amount, r.reason, r.actor, r.created_at, r.settled_at)
            for r in db.scalars(select(Refund).where(Refund.order_id == oid))
        )
    return payments, refunds


def persisted(oid):
    """Rejected undo must not modify order, money records, or shared inventory."""
    with get_sessionmaker()() as db:
        order = db.get(Order, oid)
        state = {column.name: getattr(order, column.name) for column in Order.__table__.columns}
        stock = sorted(
            (a.stage_id, a.option_id, a.quantity, a.reserved_count)
            for a in db.scalars(select(StageAllocation))
        )
    return state, financial(oid), stock


def test_confirm_undo_restores_report_issue_and_reuses_preserved_payment(
    client, login, admin_headers
):
    oid, consumer, producer = waiting(client, login)
    action(client, producer, oid, "reject-deposit", {"reason": "기존 확인 사유"})
    ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))
    before = persisted(oid)[0]
    confirmed = action(client, producer, oid, "confirm-deposit")
    aid = token(confirmed, "AWAITING_DEPOSIT")
    assert rows(client, producer)[oid]["undoAction"]["actionId"] == aid
    payments, _ = financial(oid)
    assert len(payments) == 1
    reserved = allocation().reserved_count
    restored = ok(undo(client, producer, oid, aid))
    assert restored["status"] == "AWAITING_DEPOSIT"
    after = persisted(oid)[0]
    for field in (
        "paid_at",
        "deposit_confirmed_by",
        "deposit_reported_at",
        "deposit_issue",
        "deposit_issue_at",
        "deposit_due_at",
    ):
        assert after[field] == before[field], field
    reversed_payments, _ = financial(oid)
    assert [(p[0], p[1], p[2]) for p in reversed_payments] == [
        (payments[0][0], payments[0][1], "REVERSED")
    ]
    assert allocation().reserved_count == reserved
    admin_detail = ok(client.get("/admin/users/u-seojun", headers=admin_headers))
    admin_order = next(row for row in admin_detail["orders"] if row["orderId"] == oid)
    assert admin_order["refundableAmount"] == 0
    assert "refund" not in admin_order["actions"]
    before_refund_attempt = persisted(oid)
    refund = client.post(
        f"/admin/orders/{oid}/refund",
        headers=admin_headers | key(),
        json={"reason": "입금 확인 취소 후 환불 시도"},
    )
    assert refund.status_code == 409, refund.text
    assert persisted(oid) == before_refund_attempt
    reconfirmed = action(client, producer, oid, "confirm-deposit")
    assert reconfirmed["status"] == "PREPARING"
    assert len(financial(oid)[0]) == 1 and financial(oid)[0][0][0] == payments[0][0]
    assert financial(oid)[0][0][2] != "REVERSED"
    assert detail(client, consumer, oid)["paidAt"]


def test_rejection_keep_undo_restores_previous_report_and_issue(client, login):
    oid, consumer, producer = waiting(client, login)
    action(client, producer, oid, "reject-deposit", {"reason": "첫 사유"})
    ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))
    before = persisted(oid)[0]
    kept = action(
        client, producer, oid, "reject-deposit", {"reason": "두 번째 사유", "cancel": False}
    )
    ok(undo(client, producer, oid, token(kept, "AWAITING_DEPOSIT")))
    after = persisted(oid)[0]
    for field in (
        "status",
        "deposit_reported_at",
        "deposit_issue",
        "deposit_issue_at",
        "deposit_due_at",
    ):
        assert after[field] == before[field], field


def test_rejection_cancel_stays_discoverable_and_reclaims_quantity_once(client, login):
    oid, consumer, producer = waiting(client, login, quantity=2)
    before = persisted(oid)[0]
    reserved = allocation().reserved_count
    canceled = action(
        client, producer, oid, "reject-deposit", {"reason": "입금 미확인", "cancel": True}
    )
    aid = token(canceled, "AWAITING_DEPOSIT")
    assert rows(client, producer)[oid]["undoAction"]["actionId"] == aid
    assert allocation().reserved_count == reserved - 2
    replay_key = str(uuid.uuid4())
    ok(undo(client, producer, oid, aid, replay_key))
    assert allocation().reserved_count == reserved
    after = persisted(oid)[0]
    for field in (
        "status",
        "released_quantity",
        "cancel_reason",
        "deposit_due_at",
        "deposit_reported_at",
    ):
        assert after[field] == before[field]
    ok(undo(client, producer, oid, aid, replay_key))
    ok(undo(client, producer, oid, aid))
    assert allocation().reserved_count == reserved
    ordinary, buyer, _ = waiting(client, login)
    ok(client.post(f"/api/orders/{ordinary}/cancel", headers=buyer))
    assert ordinary not in rows(client, producer)
    assert detail(client, consumer, oid)["status"] == "AWAITING_DEPOSIT"


@pytest.mark.parametrize("constraint", ["stage", "product_grams"])
def test_cancel_undo_refuses_atomically_when_other_order_consumed_capacity(
    client, login, constraint
):
    if constraint == "stage":
        with get_sessionmaker()() as db, db.begin():
            alloc = db.get(StageAllocation, ("st-house-1", "opt-5"))
            alloc.quantity = alloc.reserved_count + 1
    else:
        producer = login("u-kang")
        product = ok(client.get("/api/products/mine/p-house", headers=producer))
        committed = product["reservedGrams"] + product["shippedGrams"]
        with get_sessionmaker()() as db, db.begin():
            db.get(Product, "p-house").sales_limit_grams = committed + 5000
    oid, _, producer = waiting(client, login)
    canceled = action(client, producer, oid, "reject-deposit", {"reason": "취소", "cancel": True})
    aid = token(canceled, "AWAITING_DEPOSIT")
    other, _, _ = waiting(client, login)
    before, other_before = persisted(oid), persisted(other)
    conflict(undo(client, producer, oid, aid))
    assert persisted(oid) == before
    assert persisted(other) == other_before


@pytest.mark.parametrize("reported", [False, True])
def test_undo_uses_original_deadline_and_original_report_protection(
    client, login, monkeypatch, reported
):
    oid, consumer, producer = waiting(client, login)
    if reported:
        ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))
    before = persisted(oid)[0]
    confirmed = action(client, producer, oid, "confirm-deposit")
    monkeypatch.setattr(get_settings(), "fixed_now", "2026-10-08T10:00:01+09:00")
    if reported:
        restored = ok(undo(client, producer, oid, token(confirmed, "AWAITING_DEPOSIT")))
        assert restored["status"] == "AWAITING_DEPOSIT"
        assert persisted(oid)[0]["deposit_due_at"] == before["deposit_due_at"]
        assert persisted(oid)[0]["deposit_reported_at"] == before["deposit_reported_at"]
    else:
        snapshot = persisted(oid)
        conflict(undo(client, producer, oid, token(confirmed, "AWAITING_DEPOSIT")))
        assert persisted(oid) == snapshot


@pytest.mark.parametrize("recently_canceled", [False, True])
def test_undo_cannot_restore_code_reserved_by_another_order_case_insensitively(
    client, login, recently_canceled
):
    oid, _, producer = waiting(client, login)
    with get_sessionmaker()() as db, db.begin():
        db.get(Order, oid).deposit_code = "Kim00"
    confirmed = action(client, producer, oid, "confirm-deposit")
    other, consumer, _ = waiting(client, login)
    with get_sessionmaker()() as db, db.begin():
        db.get(Order, other).deposit_code = "kIM00"
    if recently_canceled:
        ok(client.post(f"/api/orders/{other}/cancel", headers=consumer))
    before = persisted(oid)
    conflict(undo(client, producer, oid, token(confirmed, "AWAITING_DEPOSIT")))
    assert persisted(oid) == before


def test_shipment_undo_restores_prior_values_and_never_revives_old_tracking_version(client, login):
    oid, consumer, producer = waiting(client, login)
    action(client, producer, oid, "confirm-deposit")
    with get_sessionmaker()() as db, db.begin():
        order = db.get(Order, oid)
        order.carrier, order.tracking_number = "EPOST", "prior-invoice"
    before = persisted(oid)[0]
    shipped = action(
        client, producer, oid, "ship", {"carrier": "CJ", "trackingNumber": "outbound-invoice"}
    )
    restored = ok(undo(client, producer, oid, token(shipped, "PREPARING")))
    assert restored["status"] == "PREPARING"
    after = persisted(oid)[0]
    for field in ("status", "carrier", "tracking_number", "shipped_at"):
        assert after[field] == before[field]
    assert restored["trackingVersion"] > shipped["trackingVersion"]
    reshipped = action(
        client, producer, oid, "ship", {"carrier": "HANJIN", "trackingNumber": "new-outbound"}
    )
    snapshot = persisted(oid)
    stale = client.patch(
        f"/api/orders/{oid}/tracking",
        headers=producer | key(),
        json={
            "version": shipped["trackingVersion"],
            "carrier": "CJ",
            "trackingNumber": "stale-correction",
        },
    )
    assert stale.status_code == 409, stale.text
    assert persisted(oid) == snapshot
    assert detail(client, consumer, oid)["trackingNumber"] == reshipped["trackingNumber"]


def test_tracking_edit_invalidates_shipment_undo_atomically(client, login):
    oid, _, producer = waiting(client, login)
    action(client, producer, oid, "confirm-deposit")
    shipped = action(client, producer, oid, "ship", {"carrier": "CJ", "trackingNumber": "original"})
    ok(
        client.patch(
            f"/api/orders/{oid}/tracking",
            headers=producer | key(),
            json={
                "version": shipped["trackingVersion"],
                "carrier": "EPOST",
                "trackingNumber": "corrected",
            },
        )
    )
    snapshot = persisted(oid)
    conflict(undo(client, producer, oid, token(shipped, "PREPARING")))
    assert persisted(oid) == snapshot


def test_subsequent_action_and_consumer_cancellation_invalidate_old_tokens(client, login):
    oid, consumer, producer = waiting(client, login)
    confirmed = action(client, producer, oid, "confirm-deposit")
    action(client, producer, oid, "ship", {"carrier": "CJ", "trackingNumber": "latest"})
    snapshot = persisted(oid)
    conflict(undo(client, producer, oid, token(confirmed, "AWAITING_DEPOSIT")))
    assert persisted(oid) == snapshot
    other, buyer, _ = waiting(client, login)
    confirmed = action(client, producer, other, "confirm-deposit")
    ok(client.post(f"/api/orders/{other}/cancel", headers=buyer))
    snapshot = persisted(other)
    conflict(undo(client, producer, other, token(confirmed, "AWAITING_DEPOSIT")))
    assert persisted(other) == snapshot


def test_refund_issue_and_settlement_undo_retain_refunds_and_restore_prior_markers(client, login):
    consumer, producer = login("u-minji"), login("u-kang")
    oid = "o-42"
    ok(client.post(f"/api/orders/{oid}/cancel", headers=consumer))
    first = action(client, producer, oid, "refund-issue", {"reason": "이전 계좌 문제"})
    second = action(client, producer, oid, "refund-issue", {"reason": "수정한 사유"})
    restored = ok(undo(client, producer, oid, token(second, "REFUNDED")))
    assert restored["refundIssue"] == first["refundIssue"]
    before = financial(oid)
    assert before[1], "fixture must have actual refund records"
    settled = action(client, producer, oid, "refund-settled")
    assert settled["refundSettledAt"]
    assert all(r[-1] for r in financial(oid)[1])
    restored = ok(undo(client, producer, oid, token(settled, "REFUNDED")))
    assert restored["status"] == "REFUNDED"
    assert restored["refundSettledAt"] is None
    assert restored["refundIssue"] == "이전 계좌 문제"
    assert financial(oid) == before


def test_idempotent_replays_return_current_state_and_cannot_undo_a_later_action(client, login):
    oid, _, producer = waiting(client, login)
    confirmed = action(client, producer, oid, "confirm-deposit")
    aid = token(confirmed, "AWAITING_DEPOSIT")
    request_key = str(uuid.uuid4())
    ok(undo(client, producer, oid, aid, request_key))
    next_action = action(client, producer, oid, "confirm-deposit")
    assert token(next_action, "AWAITING_DEPOSIT") != aid
    snapshot = persisted(oid)
    for replay_key in (request_key, str(uuid.uuid4())):
        replay = ok(undo(client, producer, oid, aid, replay_key))
        assert replay["status"] == "PREPARING"
        assert replay["undoAction"]["actionId"] == next_action["undoAction"]["actionId"]
        assert persisted(oid) == snapshot
    mismatched = undo(client, producer, oid, next_action["undoAction"]["actionId"], request_key)
    assert mismatched.status_code == 409, mismatched.text
    assert mismatched.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    assert persisted(oid) == snapshot


def test_authorization_is_rechecked_before_successful_replay(client, login, other_farm_headers):
    oid, consumer, producer = waiting(client, login)
    confirmed = action(client, producer, oid, "confirm-deposit")
    aid = token(confirmed, "AWAITING_DEPOSIT")
    request_key = str(uuid.uuid4())
    snapshot = persisted(oid)
    for headers, status in ((consumer, 403), (other_farm_headers, 404)):
        denied = undo(client, headers, oid, aid, request_key)
        assert denied.status_code == status, denied.text
        assert "recipientPhone" not in denied.json()
        assert persisted(oid) == snapshot
    ok(undo(client, producer, oid, aid, request_key))
    with get_sessionmaker()() as db, db.begin():
        product = db.get(Product, "p-house")
        other_product = db.scalar(select(Product).where(Product.farm_id != product.farm_id))
        assert other_product is not None
        product.farm_id = other_product.farm_id
    snapshot = persisted(oid)
    denied = undo(client, producer, oid, aid, request_key)
    assert denied.status_code == 404, denied.text
    assert "recipientPhone" not in denied.json()
    assert persisted(oid) == snapshot


def test_delivery_blocks_undo_and_successful_replay_uses_current_privacy(
    client, login, admin_headers
):
    oid, _, producer = waiting(client, login)
    action(client, producer, oid, "confirm-deposit")
    shipped = action(client, producer, oid, "ship", {"carrier": "CJ", "trackingNumber": "first"})
    aid, request_key = token(shipped, "PREPARING"), str(uuid.uuid4())
    ok(undo(client, producer, oid, aid, request_key))
    latest = action(client, producer, oid, "ship", {"carrier": "EPOST", "trackingNumber": "second"})
    ok(client.post(f"/admin/orders/{oid}/delivered", headers=admin_headers | key()))
    snapshot = persisted(oid)
    conflict(undo(client, producer, oid, token(latest, "PREPARING")))
    replay = ok(undo(client, producer, oid, aid, request_key))
    assert replay["status"] == "DELIVERED"
    assert replay["recipientName"] == "○○○"
    assert all(
        replay[field] == ""
        for field in ("recipientPhone", "postalCode", "address", "addressDetail")
    )
    assert replay["deliveryNote"] is None
    assert persisted(oid) == snapshot


def test_ordinary_orders_have_no_undo_and_missing_key_does_not_mutate(client, login):
    producer = login("u-kang")
    assert not rows(client, producer)["o-40"].get("undoAction")
    oid, _, producer = waiting(client, login)
    confirmed = action(client, producer, oid, "confirm-deposit")
    snapshot = persisted(oid)
    missing = client.post(
        f"/api/orders/{oid}/undo",
        headers=producer,
        json={"actionId": token(confirmed, "AWAITING_DEPOSIT")},
    )
    assert missing.status_code == 400, missing.text
    assert persisted(oid) == snapshot
    ordinary_snapshot = persisted("o-40")
    unknown = undo(client, producer, "o-40", "not-a-recorded-action")
    assert unknown.status_code == 404, unknown.text
    assert persisted("o-40") == ordinary_snapshot
