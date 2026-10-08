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


def test_AC_05_6_price_change_preserves_paid_and_reconfirms_unpaid(client, login):
    consumer = login("u-seojun")
    producer = login("u-kang")
    paid = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    client.post(f"/api/orders/{paid['orderId']}/pay", headers=consumer | key(), json={})
    unpaid = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()

    product = client.get("/api/products/mine/p-house", headers=producer).json()
    stages = []
    for stage in product["stages"]:
        stages.append(
            {
                **stage,
                "options": {
                    option_id: {"price": value["price"] + 100, "quantity": value["quantity"]}
                    for option_id, value in stage["options"].items()
                },
            }
        )
    changed = client.put(
        "/api/products/p-house/stages",
        headers=producer | key(),
        json={"version": product["version"], "stages": stages},
    )
    assert changed.status_code == 200, changed.text

    paid_detail = client.get(f"/api/orders/{paid['orderId']}", headers=consumer).json()
    assert paid_detail["unitPrice"] == 29000
    reconfirm = client.post(
        f"/api/orders/{unpaid['orderId']}/pay", headers=consumer | key(), json={}
    )
    assert reconfirm.status_code == 409
    assert reconfirm.json()["details"]["reason"] == "STAGE_CHANGED"
    newest = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    assert newest["unitPrice"] == 29100

    product = client.get("/api/products/mine/p-house", headers=producer).json()
    options = product["options"]
    options[0]["weightKg"] = 6
    locked = client.patch(
        "/api/products/p-house",
        headers=producer | key(),
        json={"version": product["version"], "options": options},
    )
    assert locked.status_code == 409
    assert locked.json()["details"]["reason"] == "PERIOD_LOCKED"


def test_AC_09_6_mixed_weight_release_and_shipping_accounting(client, login):
    consumer = login("u-seojun")
    producer = login("u-kang")
    before = client.get("/api/products/mine/p-house", headers=producer).json()
    committed = before["reservedGrams"] + before["shippedGrams"]

    five = client.post(
        "/api/orders", headers=consumer | key(), json=order_body(quantity=2)
    ).json()
    client.post(f"/api/orders/{five['orderId']}/pay", headers=consumer | key(), json={})
    ten = client.post(
        "/api/orders", headers=consumer | key(), json=order_body(optionId="opt-10")
    ).json()
    client.post(f"/api/orders/{ten['orderId']}/pay", headers=consumer | key(), json={})

    after_payment = client.get("/api/products/mine/p-house", headers=producer).json()
    assert after_payment["reservedGrams"] + after_payment["shippedGrams"] == committed + 20_000

    first_cancel = client.post(f"/api/orders/{ten['orderId']}/cancel", headers=consumer).json()
    second_cancel = client.post(f"/api/orders/{ten['orderId']}/cancel", headers=consumer).json()
    assert first_cancel["releasedQuantity"] == second_cancel["releasedQuantity"] == 1
    after_cancel = client.get("/api/products/mine/p-house", headers=producer).json()
    assert after_cancel["reservedGrams"] + after_cancel["shippedGrams"] == committed + 10_000

    client.post(
        "/api/orders/producer/harvest-start",
        headers=producer,
        json={"productId": "p-house"},
    )
    shipped = client.post(
        f"/api/orders/{five['orderId']}/ship",
        headers=producer,
        json={"carrier": "CJ", "trackingNumber": "12345678"},
    )
    assert shipped.status_code == 200, shipped.text
    after_ship = client.get("/api/products/mine/p-house", headers=producer).json()
    assert after_ship["reservedGrams"] + after_ship["shippedGrams"] == committed + 10_000


def test_AC_09_6_weight_limit_allows_only_one_concurrent_payment(client, login):
    producer = login("u-kang")
    consumers = [login("u-seojun"), login("u-minji")]
    product = client.get("/api/products/mine/p-house", headers=producer).json()
    committed = product["reservedGrams"] + product["shippedGrams"]
    settings = client.put(
        "/api/products/p-house/sales-settings",
        headers=producer | key(),
        json={
            "salesLimitGrams": committed + 5_000,
            "maxQuantityPerOrder": 3,
            "salesPaused": False,
            "version": product["version"],
        },
    )
    assert settings.status_code == 200, settings.text
    orders = [
        client.post("/api/orders", headers=headers | key(), json=order_body()).json()["orderId"]
        for headers in consumers
    ]

    def pay_weight(index: int):
        return client.post(
            f"/api/orders/{orders[index]}/pay", headers=consumers[index] | key(), json={}
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(pay_weight, [0, 1]))

    assert sorted(response.status_code for response in results) == [200, 409]
    loser = next(response for response in results if response.status_code == 409)
    assert loser.json()["details"]["reason"] == "TOTAL_LIMIT_REACHED"


def test_AC_10_6_lists_filters_and_order_actions(client, login):
    consumer = login("u-minji")
    producer = login("u-kang")
    consumer_orders = client.get("/api/orders", headers=consumer).json()["items"]
    assert all(order["status"] != "PENDING_PAYMENT" for order in consumer_orders)
    assert consumer_orders[0]["actions"]

    filtered = client.get(
        "/api/orders/producer", headers=producer, params={"status": "PREPARING"}
    ).json()["items"]
    assert filtered
    assert all(order["status"] == "PREPARING" for order in filtered)

    confirmed = client.post("/api/orders/o-07/confirm", headers=consumer)
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "COMPLETED"

    canceled = client.post("/api/orders/o-42/cancel", headers=consumer)
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "REFUNDED"


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
    assert {key: body["product"][key] for key in (
        "productId", "productName", "reservedCount", "orderCount"
    )} == {
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
