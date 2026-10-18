"""FEAT-08 예약 주문, FEAT-09 무통장 입금(입금 안내·확인, DEV-68), FEAT-10 주문 상세, FEAT-14 생산자 현황."""

import re
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


def deposit(client, headers, order_id: str):
    """입금 안내(물량 선점, AWAITING_DEPOSIT)."""
    return client.post(f"/api/orders/{order_id}/deposit", headers=headers | key(), json={})


def confirm(client, order_id: str, producer_headers):
    """생산자 입금 확인(RESERVED)."""
    return client.post(f"/api/orders/{order_id}/confirm-deposit", headers=producer_headers)


def reserve(client, headers, order_id: str, producer="u-kang", login=None):
    """입금 안내 + 생산자 확인 = 예전 Mock 결제 성공과 같은 상태."""
    response = deposit(client, headers, order_id)
    assert response.status_code == 200, response.text
    confirmed = confirm(client, order_id, login(producer))
    assert confirmed.status_code == 200, confirmed.text
    return confirmed.json()


def allocation(stage_id: str = "st-house-1", option_id: str = "opt-5") -> StageAllocation:
    with get_sessionmaker()() as session:
        return session.scalar(
            select(StageAllocation).where(
                StageAllocation.stage_id == stage_id, StageAllocation.option_id == option_id
            )
        )


def test_create_deposit_and_confirm_order(client, login):
    headers = login("u-seojun")
    created = client.post("/api/orders", headers=headers | key(), json=order_body(quantity=2))
    assert created.status_code == 200, created.text
    order = created.json()
    assert order["status"] == "PENDING_PAYMENT"
    assert order["unitPrice"] == 29000
    assert order["totalAmount"] == 58000
    assert order["productName"] == "하우스 감귤"
    assert re.fullmatch(r"FC-1007-\d{4}", order["orderNo"])
    # 입금 안내 전에는 계좌·판매자 정보가 없고 물량도 잡지 않는다
    assert order["depositAccount"] is None and order["sellerInfo"] is None
    assert allocation().reserved_count == 38

    awaiting = deposit(client, headers, order["orderId"])
    assert awaiting.status_code == 200, awaiting.text
    body = awaiting.json()
    assert body["status"] == "AWAITING_DEPOSIT"
    assert body["paidAt"] is None
    assert body["depositDueAt"].startswith("2026-10-08T")
    assert body["depositAccount"] == {
        "bankName": "제주은행",
        "accountNumber": "101-23-456789",
        "accountHolder": "강영수",
    }
    assert body["sellerInfo"]["farmName"] == "강씨네 귤밭"
    assert body["sellerInfo"]["ownerName"] == "강영수"
    assert body["actions"] == ["cancel", "reportDeposit"]
    assert allocation().reserved_count == 40

    reported = client.post(f"/api/orders/{order['orderId']}/deposit-reported", headers=headers)
    assert reported.status_code == 200
    assert reported.json()["depositReportedAt"]
    assert reported.json()["actions"] == ["cancel"]

    confirmed = confirm(client, order["orderId"], login("u-kang"))
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "RESERVED"
    assert confirmed.json()["totalAmount"] == 58000
    detail = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
    assert detail["status"] == "RESERVED"
    assert detail["paidAt"]
    assert detail["actions"] == ["cancel"]
    assert detail["deliveryNote"] == "경비실에 맡겨 주세요"
    assert allocation().reserved_count == 40


def test_AC_09_8_confirm_deposit_is_idempotent_and_farm_scoped(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    assert deposit(client, headers, order["orderId"]).status_code == 200

    from app.core.security import issue_token

    other_farm = confirm(
        client, order["orderId"], {"Authorization": f"Bearer {issue_token('u-halla', 'PRODUCER')}"}
    )
    assert other_farm.status_code == 404

    first = confirm(client, order["orderId"], login("u-kang"))
    second = confirm(client, order["orderId"], login("u-kang"))
    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "RESERVED"
    assert allocation().reserved_count == 39

    not_awaiting = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    rejected = confirm(client, not_awaiting["orderId"], login("u-kang"))
    assert rejected.status_code == 409
    assert rejected.json()["details"]["reason"] == "INVALID_TRANSITION"


def test_AC_09_8_admin_confirms_deposit(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])
    admin = _admin(client)

    confirmed = client.post(
        f"/admin/orders/{order['orderId']}/confirm-deposit", headers=admin | key()
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "RESERVED"


def _admin(client):
    from app.core.security import issue_token

    return {"Authorization": f"Bearer {issue_token('u-admin', 'ADMIN')}"}


def test_AC_09_7_overdue_deposit_is_canceled_and_quantity_released(client, login):
    from app.core import config

    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])
    assert allocation().reserved_count == 39

    config.get_settings().fixed_now = "2026-10-08T10:00:01+09:00"
    try:
        detail = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
        assert detail["status"] == "CANCELED"
        assert detail["cancelReason"] == "입금 기한 초과"
        assert allocation().reserved_count == 38
        late = confirm(client, order["orderId"], login("u-kang"))
        assert late.status_code == 409
    finally:
        config.get_settings().fixed_now = "2026-10-07T10:00:00+09:00"


def test_AC_09_7_admin_expires_overdue_deposits_in_bulk(client, login):
    from app.core import config

    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])
    admin = _admin(client)
    assert client.post("/admin/orders/expire-deposits", headers=admin).json() == {"changed": 0}

    config.get_settings().fixed_now = "2026-10-08T12:00:00+09:00"
    try:
        assert client.post("/admin/orders/expire-deposits", headers=admin).json() == {
            "changed": 1
        }
        assert allocation().reserved_count == 38
    finally:
        config.get_settings().fixed_now = "2026-10-07T10:00:00+09:00"


def test_deposit_requires_farm_account(client, login):
    from app.farms.models import Farm

    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Farm).where(Farm.id == "f-kang").values(account_number=None))
    response = deposit(client, headers, order["orderId"])
    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "NO_FARM_ACCOUNT"
    assert allocation().reserved_count == 38


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


def test_AC_09_2_cancel_before_deposit_releases_quantity(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])
    assert allocation().reserved_count == 39

    canceled = client.post(f"/api/orders/{order['orderId']}/cancel", headers=headers)
    again = client.post(f"/api/orders/{order['orderId']}/cancel", headers=headers)

    assert canceled.status_code == again.status_code == 200
    assert canceled.json()["status"] == "CANCELED"
    assert canceled.json()["refundedAt"] is None
    assert "입금 전" in canceled.json()["cancelReason"]
    assert allocation().reserved_count == 38
    listed = client.get("/api/orders", headers=headers).json()["items"]
    assert any(o["orderId"] == order["orderId"] for o in listed)


def test_AC_09_3_same_key_reserves_once(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    same = headers | key()

    first = client.post(f"/api/orders/{order['orderId']}/deposit", headers=same, json={})
    second = client.post(f"/api/orders/{order['orderId']}/deposit", headers=same, json={})

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
        return deposit(client, buyers[i], orders[i])

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
        response = deposit(client, headers, order["orderId"])
    finally:
        config.get_settings().fixed_now = "2026-10-07T10:00:00+09:00"

    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "STAGE_CHANGED"


def test_AC_05_6_price_change_preserves_paid_and_reconfirms_unpaid(client, login):
    consumer = login("u-seojun")
    producer = login("u-kang")
    paid = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    reserve(client, consumer, paid["orderId"], login=login)
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
    reconfirm = deposit(client, consumer, unpaid["orderId"])
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
    reserve(client, consumer, five["orderId"], login=login)
    ten = client.post(
        "/api/orders", headers=consumer | key(), json=order_body(optionId="opt-10")
    ).json()
    reserve(client, consumer, ten["orderId"], login=login)

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
        return deposit(client, consumers[index], orders[index])

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

    assert body["todo"] == {
        "openQuestions": 3,
        "toShip": 7,
        "pendingProducts": 1,
        "awaitingDeposit": 0,
        "refundsToSettle": 1,
        "hasAccount": True,
    }
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


def test_AC_14_1_dashboard_updates_after_deposit_and_confirm(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])

    awaiting = client.get("/api/orders/producer/dashboard", headers=login("u-kang")).json()
    assert awaiting["stages"][0]["options"][0]["reserved"] == 39
    assert awaiting["todo"]["awaitingDeposit"] == 1
    assert awaiting["product"]["orderCount"] == 40
    listed = client.get(
        "/api/orders/producer?status=AWAITING_DEPOSIT", headers=login("u-kang")
    ).json()["items"]
    assert [o["orderId"] for o in listed] == [order["orderId"]]
    assert listed[0]["address"] == "" and listed[0]["totalAmount"] == 29000

    confirm(client, order["orderId"], login("u-kang"))
    body = client.get("/api/orders/producer/dashboard", headers=login("u-kang")).json()
    assert body["stages"][0]["options"][0]["reserved"] == 39
    assert body["product"]["orderCount"] == 41
    assert body["todo"]["awaitingDeposit"] == 0


def test_AC_17_7_refund_settled_by_producer(client, login):
    consumer = login("u-minji")
    producer = login("u-kang")
    before = client.get("/api/orders/o-42", headers=consumer).json()
    assert before["refundSettledAt"] is None
    canceled = client.post("/api/orders/o-42/cancel", headers=consumer).json()
    assert canceled["status"] == "REFUNDED" and canceled["refundSettledAt"] is None
    dash = client.get("/api/orders/producer/dashboard", headers=producer).json()
    assert dash["todo"]["refundsToSettle"] == 2

    not_refunded = client.post("/api/orders/o-g1/refund-settled", headers=producer)
    assert not_refunded.status_code == 409
    settled = client.post("/api/orders/o-42/refund-settled", headers=producer)
    assert settled.status_code == 200, settled.text
    assert settled.json()["refundSettledAt"]
    assert client.get("/api/orders/o-42", headers=consumer).json()["refundSettledAt"]
    assert (
        client.get("/api/orders/producer/dashboard", headers=producer).json()["todo"][
            "refundsToSettle"
        ]
        == 1
    )


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
