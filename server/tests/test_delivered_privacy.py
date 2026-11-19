"""DEV-254: producer disclosure depends on delivery, without changing the owner's data."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.core.db import get_sessionmaker
from app.orders.models import Order

PII = {
    "recipientName": "DEV254 수령인",
    "recipientPhone": "010-0000-0254",
    "postalCode": "12345",
    "address": "DEV254 테스트로 254",
    "addressDetail": "테스트동 254호",
    "deliveryNote": "DEV254 테스트 보관함에 놓아 주세요",
}
MODEL_FIELDS = {
    "recipientName": "recipient_name",
    "recipientPhone": "recipient_phone",
    "postalCode": "postal_code",
    "address": "address",
    "addressDetail": "address_detail",
    "deliveryNote": "delivery_note",
}
MASKED = dict.fromkeys(("recipientPhone", "postalCode", "address", "addressDetail"), "")
MASKED.update(recipientName="○○○", deliveryNote=None)
AT = datetime(2026, 10, 4, 1, tzinfo=UTC)


def prepare_order(status, *, delivered=False, paid=True, name=PII["recipientName"]):
    original = PII | {"recipientName": name}
    with get_sessionmaker()() as session, session.begin():
        order = session.get(Order, "o-07")
        order.status = status
        order.paid_at = AT if paid else None
        order.delivered_at = AT if delivered else None
        order.completed_at = AT if status == "COMPLETED" else None
        for key, field in MODEL_FIELDS.items():
            setattr(order, field, original[key])
    return original


def pii(value):
    return {key: value[key] for key in MODEL_FIELDS}


def producer_row(client, headers, query):
    response = client.get(f"/api/orders/producer?limit=50{query}", headers=headers)
    assert response.status_code == 200, response.text
    matches = [row for row in response.json()["items"] if row["orderId"] == "o-07"]
    assert len(matches) == 1, (
        "fixture order must be present, so privacy checks cannot pass vacuously"
    )
    return matches[0]


def assert_owner_and_storage_unchanged(client, owner, original):
    response = client.get("/api/orders/o-07", headers=owner)
    assert response.status_code == 200, response.text
    assert pii(response.json()) == original
    with get_sessionmaker()() as session:
        stored = session.get(Order, "o-07")
        assert {key: getattr(stored, field) for key, field in MODEL_FIELDS.items()} == original


@pytest.mark.parametrize("status", ["DELIVERED", "COMPLETED"])
@pytest.mark.parametrize(
    "name", ["가", "가나", "테스트수령인", "Alias Long Name", "A\u0301", "🍊🚚"]
)
def test_AC_17_13_delivery_status_masks_all_recipient_fields_even_without_timestamp(
    client, login, status, name
):
    original = prepare_order(status, name=name)
    producer = login("u-kang")
    for query in ("", f"&status={status}"):
        assert pii(producer_row(client, producer, query)) == MASKED
    assert_owner_and_storage_unchanged(client, login("u-minji"), original)


@pytest.mark.parametrize(
    "status,paid",
    [
        ("RESERVED", True),
        ("PREPARING", True),
        ("SHIPPED", True),
        ("REFUNDED", True),
        ("PARTIALLY_REFUNDED", True),
        ("AWAITING_DEPOSIT", False),
    ],
)
def test_AC_17_13_delivery_timestamp_masks_regardless_of_current_status_or_payment(
    client, login, status, paid
):
    original = prepare_order(status, delivered=True, paid=paid)
    producer = login("u-kang")
    for query in ("", f"&status={status}"):
        assert pii(producer_row(client, producer, query)) == MASKED
    assert_owner_and_storage_unchanged(client, login("u-minji"), original)


@pytest.mark.parametrize("status", ["RESERVED", "PREPARING", "SHIPPED"])
def test_AC_17_13_paid_orders_before_delivery_keep_full_shipping_details(client, login, status):
    original = prepare_order(status)
    producer = login("u-kang")
    for query in ("", f"&status={status}"):
        assert pii(producer_row(client, producer, query)) == original
    assert_owner_and_storage_unchanged(client, login("u-minji"), original)


def test_AC_17_13_unpaid_awaiting_order_keeps_payment_matching_name_only(client, login):
    original = prepare_order("AWAITING_DEPOSIT", paid=False)
    producer = login("u-kang")
    for query in ("", "&status=AWAITING_DEPOSIT"):
        assert pii(producer_row(client, producer, query)) == MASKED | {
            "recipientName": original["recipientName"]
        }
    assert_owner_and_storage_unchanged(client, login("u-minji"), original)


def test_AC_17_13_delivery_privacy_does_not_allow_other_farms_or_consumers_to_read_order(
    client, login, other_farm_headers
):
    prepare_order("DELIVERED", delivered=True)
    for query in ("", "&status=DELIVERED"):
        response = client.get(f"/api/orders/producer?limit=50{query}", headers=other_farm_headers)
        assert response.status_code == 200, response.text
        assert "o-07" not in {row["orderId"] for row in response.json()["items"]}
    # Order detail is a consumer endpoint; a producer gets a role rejection.
    assert client.get("/api/orders/o-07", headers=other_farm_headers).status_code == 403
    other_consumer = login("u-seojun")
    assert client.get("/api/orders/o-07", headers=other_consumer).status_code == 404
    assert client.get("/api/orders/producer?limit=50", headers=other_consumer).status_code == 403


@pytest.mark.parametrize("later_status", ["DELIVERED", "COMPLETED", "REFUNDED"])
def test_AC_17_13_tracking_replay_applies_current_privacy_and_keeps_original_non_pii(
    client, login, later_status
):
    original = prepare_order("SHIPPED")
    with get_sessionmaker()() as session, session.begin():
        session.get(Order, "o-07").tracking_version = 1
    producer = login("u-kang")
    headers = producer | {"Idempotency-Key": f"dev254-tracking-{uuid4()}"}
    body = {"carrier": "CJ", "trackingNumber": "test-dev254-first", "version": 1}
    endpoint = "/api/orders/o-07/tracking"
    first = client.patch(endpoint, headers=headers, json=body)
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert pii(first_body) == original
    assert first_body["trackingNumber"] == body["trackingNumber"]
    assert first_body["trackingVersion"] == 2

    # Delivery and a subsequent correction must not turn an old successful retry
    # into either a PII leak or a response containing the newer tracking operation.
    with get_sessionmaker()() as session, session.begin():
        order = session.get(Order, "o-07")
        order.status = later_status
        order.delivered_at = AT
        order.completed_at = AT if later_status == "COMPLETED" else None
        order.refunded_at = AT if later_status == "REFUNDED" else None
        order.carrier = "EPOST"
        order.tracking_number = "test-dev254-newer"
        order.tracking_version = 3
    replay = client.patch(endpoint, headers=headers, json=body)
    assert replay.status_code == 200, replay.text
    replay_body = replay.json()
    assert pii(replay_body) == MASKED
    assert {key: value for key, value in replay_body.items() if key not in MODEL_FIELDS} == {
        key: value for key, value in first_body.items() if key not in MODEL_FIELDS
    }
    assert_owner_and_storage_unchanged(client, login("u-minji"), original)
    with get_sessionmaker()() as session:
        order = session.get(Order, "o-07")
        assert (order.carrier, order.tracking_number, order.tracking_version) == (
            "EPOST",
            "test-dev254-newer",
            3,
        )
