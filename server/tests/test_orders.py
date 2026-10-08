"""FEAT-08 예약 주문, FEAT-09 Mock 결제, FEAT-10 주문 상세, FEAT-14 생산자 현황."""

import uuid
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import select, update

from app.catalog.models import StageAllocation
from app.core.db import get_sessionmaker

CONSENTS = {"deliveryWindow": True, "delayRefund": True, "shortage": True, "cancelPolicy": True}


def order_body(**overrides):
    body = {
        "productId": "p-house",
        "optionId": "opt-5",
        "quantity": 1,
        "recipientName": "이서준",
        "recipientPhone": "010-3456-7890",
        "postalCode": "48094",
        "address": "부산 해운대구 해운대로 570",
        "addressDetail": "1203호",
        "deliveryNote": "경비실에 맡겨 주세요",
        "consents": CONSENTS,
        "consentVersion": "2026-10-06",
    }
    return body | overrides


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def allocation(stage_id: str = "st-house-1", option_id: str = "opt-5") -> StageAllocation:
    with get_sessionmaker()() as session:
        return session.scalar(
            select(StageAllocation).where(
                StageAllocation.stage_id == stage_id, StageAllocation.option_id == option_id
            )
        )


def test_create_and_pay_order(client, login):
    headers = login("u-seojun")
    created = client.post("/api/orders", headers=headers | key(), json=order_body(quantity=2))
    assert created.status_code == 200, created.text
    order = created.json()
    assert order["status"] == "PENDING_PAYMENT"
    assert order["unitPrice"] == 29000
    assert order["totalAmount"] == 58000
    assert order["productName"] == "하우스 감귤"
    assert order["orderNo"].startswith("FC-1007-")
    assert allocation().reserved_count == 38

    paid = client.post(
        f"/api/orders/{order['orderId']}/pay",
        headers=headers | key(),
        json={"mockResult": "success"},
    ).json()

    assert paid["result"] == "success"
    assert paid["order"]["status"] == "RESERVED"
    assert paid["order"]["paidAt"]
    assert allocation().reserved_count == 40
    detail = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
    assert detail["actions"] == ["cancel"]
    assert detail["deliveryNote"] == "경비실에 맡겨 주세요"


def test_AC_08_1_all_four_consents_required(client, login):
    body = order_body(consents=CONSENTS | {"shortage": False})

    response = client.post("/api/orders", headers=login("u-seojun") | key(), json=body)

    assert response.status_code == 400
    assert "consents" in response.json()["details"]["fields"]


def test_AC_08_2_quantity_limit(client, login):
    response = client.post(
        "/api/orders", headers=login("u-seojun") | key(), json=order_body(quantity=4)
    )

    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "QUANTITY_LIMIT"
    assert response.json()["details"]["maxQuantity"] == 3


def test_AC_08_4_remote_area_fee_added(client, login):
    body = order_body(postalCode="63000", address="제주 제주시 연동 1")

    order = client.post("/api/orders", headers=login("u-seojun") | key(), json=body).json()

    assert order["remoteAreaFee"] == 3000
    assert order["totalAmount"] == 29000 + 3000


def test_AC_08_5_save_address_becomes_default(client, login):
    headers = login("u-seojun")
    client.post("/api/orders", headers=headers | key(), json=order_body(saveAddress=True))

    addresses = client.get("/api/auth/me/addresses", headers=headers).json()

    assert addresses[0]["address"] == "부산 해운대구 해운대로 570"
    assert addresses[0]["isDefault"] is True


def test_sold_out_stage_rejects_order(client, login):
    response = client.post(
        "/api/orders",
        headers=login("u-seojun") | key(),
        json=order_body(productId="p-redhyang", optionId="opt-3"),
    )

    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "SOLD_OUT"


def test_AC_09_2_failed_payment_keeps_quantity(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()

    paid = client.post(
        f"/api/orders/{order['orderId']}/pay", headers=headers | key(), json={"mockResult": "fail"}
    ).json()

    assert paid["result"] == "fail"
    assert paid["failReason"]
    assert paid["order"]["status"] == "PENDING_PAYMENT"
    assert allocation().reserved_count == 38


def test_AC_09_3_same_key_pays_once(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    same = headers | key()

    first = client.post(f"/api/orders/{order['orderId']}/pay", headers=same, json={})
    second = client.post(f"/api/orders/{order['orderId']}/pay", headers=same, json={})

    assert first.json() == second.json()
    assert allocation().reserved_count == 39


def test_AC_09_3_same_key_creates_one_order(client, login):
    headers = login("u-seojun") | key()

    first = client.post("/api/orders", headers=headers, json=order_body()).json()
    second = client.post("/api/orders", headers=headers, json=order_body()).json()
    mismatch = client.post("/api/orders", headers=headers, json=order_body(quantity=2))

    assert first["orderId"] == second["orderId"]
    assert mismatch.status_code == 409
    assert mismatch.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"


def test_idempotency_key_required(client, login):
    response = client.post("/api/orders", headers=login("u-seojun"), json=order_body())

    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["details"]["fields"]


def test_AC_09_1_last_item_concurrent_payment(client, login):
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(StageAllocation)
            .where(StageAllocation.stage_id == "st-house-1", StageAllocation.option_id == "opt-5")
            .values(reserved_count=StageAllocation.quantity - 1)
        )
    buyers = [login("u-seojun"), login("u-minji")]
    orders = [
        client.post("/api/orders", headers=h | key(), json=order_body()).json()["orderId"]
        for h in buyers
    ]

    def pay(i: int):
        return client.post(f"/api/orders/{orders[i]}/pay", headers=buyers[i] | key(), json={})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(pay, [0, 1]))

    codes = sorted(r.status_code for r in results)
    assert codes == [200, 409]
    loser = next(r for r in results if r.status_code == 409)
    assert loser.json()["details"]["reason"] == "SOLD_OUT"
    assert allocation().reserved_count == allocation().quantity


def test_stage_changed_before_payment(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    from app.core import config

    config.get_settings().fixed_now = "2026-10-13T10:00:00+09:00"
    try:
        response = client.post(
            f"/api/orders/{order['orderId']}/pay", headers=headers | key(), json={}
        )
    finally:
        config.get_settings().fixed_now = "2026-10-07T10:00:00+09:00"

    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "STAGE_CHANGED"


def test_other_consumers_order_is_not_found(client, login):
    response = client.get("/api/orders/o-42", headers=login("u-seojun"))

    assert response.status_code == 404


def test_order_detail_for_owner(client, login):
    body = client.get("/api/orders/o-11", headers=login("u-minji")).json()

    assert body["orderNo"] == "FC-0921-0011"
    assert body["proposedDeliveryWindow"] == {"start": "2026-12-08", "end": "2026-12-22"}
    assert body["actions"] == ["cancel", "respondDeliveryWindow"]


def test_AC_14_1_dashboard_counts(client, login):
    body = client.get("/api/orders/producer/dashboard", headers=login("u-kang")).json()

    assert body["todo"] == {"openQuestions": 3, "toShip": 7, "pendingProducts": 1}
    assert body["product"] == {
        "productId": "p-house",
        "productName": "하우스 감귤 5kg / 10kg",
        "reservedCount": 37,
        "orderCount": 40,
    }
    first = body["stages"][0]
    assert first["current"] is True
    assert [(o["label"], o["reserved"], o["quantity"]) for o in first["options"]] == [
        ("5kg", 38, 80),
        ("10kg", 6, 20),
    ]
    assert len(body["recentOrders"]) == 3
    assert all(o["buyerName"].endswith("○○") for o in body["recentOrders"])
    assert "address" not in body["recentOrders"][0]


def test_AC_14_1_dashboard_updates_after_payment(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    client.post(f"/api/orders/{order['orderId']}/pay", headers=headers | key(), json={})

    body = client.get("/api/orders/producer/dashboard", headers=login("u-kang")).json()

    assert body["stages"][0]["options"][0]["reserved"] == 39
    assert body["product"]["orderCount"] == 41


def test_AC_08_3_separate_shipping_fee_in_total(client, login):
    from app.catalog.models import Product

    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Product)
            .where(Product.id == "p-house")
            .values(shipping_fee_type="SEPARATE", shipping_fee=4000)
        )

    order = client.post("/api/orders", headers=login("u-seojun") | key(), json=order_body()).json()

    assert (order["unitPrice"], order["shippingFee"], order["totalAmount"]) == (29000, 4000, 33000)
