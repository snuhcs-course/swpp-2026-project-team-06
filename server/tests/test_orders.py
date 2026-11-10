"""FEAT-08 예약 주문, FEAT-09 무통장 입금(입금 안내·확인, DEV-68),
FEAT-10 주문 상세, FEAT-14 생산자 현황."""

import re
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import select, update

from app.admin.models import ManagerEvent
from app.catalog.models import StageAllocation
from app.core.db import get_sessionmaker

CONSENTS = {
    "deliveryWindow": True,
    "delayRefund": True,
    "shortage": True,
    "cancelPolicy": True,
    "thirdParty": True,
}


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


def test_AC_09_8_confirm_deposit_is_idempotent_and_farm_scoped(client, login, other_farm_headers):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    assert deposit(client, headers, order["orderId"]).status_code == 200

    other_farm = confirm(client, order["orderId"], other_farm_headers)
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


def test_AC_09_9_reject_deposit_keeps_waiting_with_reason(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])
    client.post(f"/api/orders/{order['orderId']}/deposit-reported", headers=headers)
    url = f"/api/orders/{order['orderId']}/reject-deposit"

    blank = client.post(url, headers=login("u-kang"), json={"reason": "  "})
    assert blank.status_code == 400
    missing = client.post(url, headers=login("u-kang"), json={})
    assert missing.status_code == 400

    kept = client.post(url, headers=login("u-kang"), json={"reason": "금액이 달라요"})
    assert kept.status_code == 200, kept.text
    assert kept.json()["status"] == "AWAITING_DEPOSIT"
    assert kept.json()["depositIssue"] == "금액이 달라요"
    detail = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
    assert detail["depositIssue"] == "금액이 달라요"
    assert detail["depositReportedAt"] is None
    assert "reportDeposit" in detail["actions"]
    assert allocation().reserved_count == 39

    confirmed = confirm(client, order["orderId"], login("u-kang"))
    assert confirmed.json()["status"] == "RESERVED"
    after = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
    assert after["depositIssue"] is None


def test_AC_09_9_reject_deposit_can_cancel_and_release_quantity(client, login, other_farm_headers):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])
    url = f"/api/orders/{order['orderId']}/reject-deposit"

    other = other_farm_headers
    assert client.post(url, headers=other, json={"reason": "x", "cancel": True}).status_code == 404

    body = {"reason": "입금이 들어오지 않았어요", "cancel": True}
    canceled = client.post(url, headers=login("u-kang"), json=body)
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["status"] == "CANCELED"
    detail = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
    assert detail["cancelReason"] == "입금 미승인 · 입금이 들어오지 않았어요"
    assert detail["depositIssue"] is None
    assert allocation().reserved_count == 38
    again = client.post(url, headers=login("u-kang"), json=body)
    assert again.status_code == 409


def test_R_15_unpaid_orders_hide_shipping_info_from_producer(client, login):
    headers = login("u-seojun")
    producer = login("u-kang")
    waiting = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, waiting["orderId"])
    canceled = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, canceled["orderId"])
    client.post(f"/api/orders/{canceled['orderId']}/cancel", headers=headers)

    rows = {
        o["orderId"]: o
        for o in client.get("/api/orders/producer?limit=50", headers=producer).json()["items"]
    }
    # 입금 전 취소(돈을 낸 적 없음)는 생산자 목록에 없다
    assert canceled["orderId"] not in rows
    row = rows[waiting["orderId"]]
    assert (row["recipientPhone"], row["postalCode"], row["address"], row["addressDetail"]) == (
        "",
        "",
        "",
        "",
    )
    assert row["deliveryNote"] is None


def test_AC_09_7_reported_deposit_is_not_canceled_after_deadline(client, login):
    from app.core import config

    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    deposit(client, headers, order["orderId"])
    client.post(f"/api/orders/{order['orderId']}/deposit-reported", headers=headers)
    admin = _admin(client)

    config.get_settings().fixed_now = "2026-10-08T10:00:01+09:00"
    try:
        detail = client.get(f"/api/orders/{order['orderId']}", headers=headers).json()
        assert detail["status"] == "AWAITING_DEPOSIT"
        assert client.post("/admin/orders/expire-deposits", headers=admin | key()).json() == {
            "changed": 0
        }
        overdue = client.get("/admin/orders/deposit-overdue", headers=admin).json()
        assert [o["orderId"] for o in overdue] == [order["orderId"]]
        assert allocation().reserved_count == 39
        late = confirm(client, order["orderId"], login("u-kang"))
        assert late.json()["status"] == "RESERVED"
        assert client.get("/admin/orders/deposit-overdue", headers=admin).json() == []
    finally:
        config.get_settings().fixed_now = "2026-10-07T10:00:00+09:00"


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
    # 다른 운영자 변경 API처럼 멱등 키가 필요하고 감사 기록이 남는다
    assert client.post("/admin/orders/expire-deposits", headers=admin).status_code == 400
    first = admin | key()
    assert client.post("/admin/orders/expire-deposits", headers=first).json() == {"changed": 0}
    # 같은 키로 다시 보내면 처음 결과 그대로
    assert client.post("/admin/orders/expire-deposits", headers=first).json() == {"changed": 0}

    config.get_settings().fixed_now = "2026-10-08T12:00:00+09:00"
    try:
        expired = client.post("/admin/orders/expire-deposits", headers=admin | key())
        assert expired.json() == {"changed": 1}
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


def test_AC_08_1_all_five_consents_required(client, login):
    body = order_body(consents=CONSENTS | {"shortage": False})

    response = client.post("/api/orders", headers=login("u-seojun") | key(), json=body)

    assert response.status_code == 400
    assert "consents" in response.json()["details"]["fields"]


def test_AC_08_7_third_party_consent_required_and_recorded(client, login):
    """판매자 농가에 배송 정보를 주려면 주문할 때 제3자 제공 동의가 필요하다(DEV-120, 제17조)."""
    headers = login("u-seojun")
    missing = {k: v for k, v in CONSENTS.items() if k != "thirdParty"}
    for consents in (missing, CONSENTS | {"thirdParty": False}):
        body = order_body(consents=consents)
        response = client.post("/api/orders", headers=headers | key(), json=body)
        assert response.status_code == 400
        assert "consents" in response.json()["details"]["fields"]

    order = client.post(
        "/api/orders",
        headers=headers | key(),
        json=order_body(consentVersion="policy-2026-10-23"),
    )
    assert order.status_code == 200, order.text
    from app.core.db import get_sessionmaker
    from app.orders.models import Order

    with get_sessionmaker()() as db:
        row = db.get(Order, order.json()["orderId"])
        assert row.consent_version == "policy-2026-10-23"
        assert row.consent_at is not None


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

    five = client.post("/api/orders", headers=consumer | key(), json=order_body(quantity=2)).json()
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
        headers=producer | key(),
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
        # DEV-296: 시드에는 AI 답변 확인 요청이 없다
        "aiCheckRequests": 0,
        "toShip": 7,
        "pendingProducts": 1,
        "awaitingDeposit": 0,
        "refundsToSettle": 1,
        "hasAccount": True,
        # DEV-231: 1단계(10-12까지)는 아직 열려 있어 할 일 수에는 안 들어간다
        "toHarvest": 0,
        "harvestTargets": [
            {
                "productId": "p-house",
                "productName": "하우스 감귤 5kg / 10kg",
                "stageId": "st-house-1",
                "stageName": "1단계",
                "endsAt": "2026-10-12",
                "count": 30,
                "closed": False,
            }
        ],
    }
    assert {
        key: body["product"][key]
        for key in ("productId", "productName", "reservedCount", "orderCount")
    } == {
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


def test_AC_17_8_refund_issue_records_reason_until_settled(client, login):
    consumer = login("u-minji")
    producer = login("u-kang")
    client.post("/api/orders/o-42/cancel", headers=consumer)

    assert (
        client.post("/api/orders/o-g1/refund-issue", headers=producer, json={"reason": "x"})
    ).status_code == 409
    blank = client.post("/api/orders/o-42/refund-issue", headers=producer, json={"reason": " "})
    assert blank.status_code == 400

    body = {"reason": "계좌 정보가 맞지 않아요. 채팅으로 계좌를 알려 주세요"}
    issued = client.post("/api/orders/o-42/refund-issue", headers=producer, json=body)
    assert issued.status_code == 200, issued.text
    assert issued.json()["refundIssue"] == body["reason"]
    assert issued.json()["refundSettledAt"] is None
    detail = client.get("/api/orders/o-42", headers=consumer).json()
    assert detail["status"] == "REFUNDED" and detail["refundIssue"] == body["reason"]

    client.post("/api/orders/o-42/refund-settled", headers=producer)
    settled = client.get("/api/orders/o-42", headers=consumer).json()
    assert settled["refundSettledAt"] and settled["refundIssue"] is None
    late = client.post("/api/orders/o-42/refund-issue", headers=producer, json={"reason": "x"})
    assert late.status_code == 409


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


def test_AC_14_1_producer_order_rows_retain_total_option_and_quantity(client, login):
    consumer, producer = login("u-seojun"), login("u-kang")
    created = client.post("/api/orders", headers=consumer | key(), json=order_body(quantity=2))
    assert created.status_code == 200, created.text
    order = created.json()
    assert deposit(client, consumer, order["orderId"]).status_code == 200
    waiting = client.get("/api/orders/producer?status=AWAITING_DEPOSIT", headers=producer)
    assert waiting.status_code == 200, waiting.text
    row = next(o for o in waiting.json()["items"] if o["orderId"] == order["orderId"])
    assert (row["totalAmount"], row["optionLabel"], row["quantity"]) == (58000, "5kg", 2)
    assert confirm(client, order["orderId"], producer).status_code == 200
    reserved = client.get("/api/orders/producer?status=RESERVED&limit=50", headers=producer)
    assert reserved.status_code == 200, reserved.text
    row = next(o for o in reserved.json()["items"] if o["orderId"] == order["orderId"])
    assert (row["totalAmount"], row["optionLabel"], row["quantity"]) == (58000, "5kg", 2)


def test_AC_17_9_shipped_order_cannot_be_shipped_again_to_change_tracking(client, login):
    consumer, producer = login("u-seojun"), login("u-kang")
    created = client.post("/api/orders", headers=consumer | key(), json=order_body())
    assert created.status_code == 200, created.text
    order_id = created.json()["orderId"]
    reserve(client, consumer, order_id, login=login)
    harvest = client.post(
        "/api/orders/producer/harvest-start",
        headers=producer | key(),
        json={"productId": "p-house"},
    )
    assert harvest.status_code == 200, harvest.text
    shipped = client.post(
        f"/api/orders/{order_id}/ship",
        headers=producer,
        json={"carrier": "CJ", "trackingNumber": "12345678"},
    )
    assert shipped.status_code == 200, shipped.text
    before = client.get(f"/api/orders/{order_id}", headers=consumer).json()
    rejected = client.post(
        f"/api/orders/{order_id}/ship",
        headers=producer,
        json={"carrier": "CJ", "trackingNumber": "87654321"},
    )
    assert rejected.status_code == 409, rejected.text
    assert client.get(f"/api/orders/{order_id}", headers=consumer).json() == before


def test_AC_09_7_8_producer_deposit_approval_keeps_one_payment_and_rejects_nonowners(
    client, login, other_farm_headers, monkeypatch
):
    from app.core.config import get_settings
    from app.orders.models import Payment

    consumer, producer = login("u-seojun"), login("u-kang")
    created = client.post("/api/orders", headers=consumer | key(), json=order_body())
    assert created.status_code == 200, created.text
    order_id = created.json()["orderId"]
    # PENDING_PAYMENT cannot be approved, even by the owning producer.
    assert confirm(client, order_id, producer).status_code == 409
    assert deposit(client, consumer, order_id).status_code == 200
    assert confirm(client, order_id, consumer).status_code == 403
    assert confirm(client, order_id, other_farm_headers).status_code == 404
    with get_sessionmaker()() as db:
        before = {p.id for p in db.scalars(select(Payment).where(Payment.order_id == order_id))}
    first = confirm(client, order_id, producer)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "RESERVED"
    with get_sessionmaker()() as db:
        approved = {p.id for p in db.scalars(select(Payment).where(Payment.order_id == order_id))}
        assert len(approved) == 1
    again = confirm(client, order_id, producer)
    assert again.status_code == 200, again.text
    assert again.json() == first.json()
    with get_sessionmaker()() as db:
        assert {
            p.id for p in db.scalars(select(Payment).where(Payment.order_id == order_id))
        } == approved
    assert before <= approved

    another = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    assert deposit(client, consumer, another["orderId"]).status_code == 200
    monkeypatch.setattr(get_settings(), "fixed_now", "2026-10-08T10:00:01+09:00")
    expired = client.get(f"/api/orders/{another['orderId']}", headers=consumer)
    assert expired.status_code == 200 and expired.json()["status"] == "CANCELED"
    assert confirm(client, another["orderId"], producer).status_code == 409


def _order(client, login, *, ship=True):
    consumer, producer = login("u-seojun"), login("u-kang")
    response = client.post("/api/orders", headers=consumer | key(), json=order_body())
    assert response.status_code == 200, response.text
    order_id = response.json()["orderId"]
    if ship:
        reserve(client, consumer, order_id, login=login)
        harvest = client.post(
            "/api/orders/producer/harvest-start",
            headers=producer | key(),
            json={"productId": "p-house"},
        )
        assert harvest.status_code == 200, harvest.text
        shipped = client.post(
            f"/api/orders/{order_id}/ship",
            headers=producer,
            json={"carrier": "CJ", "trackingNumber": "DEV25-1234"},
        )
        assert shipped.status_code == 200, shipped.text
    return order_id, consumer, producer


def _correct(client, producer, order_id, **body):
    return client.patch(
        f"/api/orders/{order_id}/tracking",
        headers=producer | key(),
        json={"version": 1, "carrier": "EPOST", "trackingNumber": "new-123"} | body,
    )


def _tracking_events(order_id):
    with get_sessionmaker()() as db:
        return [
            {
                "actor": event.actor_id,
                "created": event.created_at,
                "request": event.request_summary,
                "result": event.result,
            }
            for event in db.scalars(
                select(ManagerEvent).where(
                    ManagerEvent.target_id == order_id,
                    ManagerEvent.event_type == "order.tracking_updated",
                )
            )
        ]


def test_AC_17_9_tracking_corrections_preserve_shipping_and_record_private_history(client, login):
    order_id, consumer, producer = _order(client, login)
    before = client.get(f"/api/orders/{order_id}", headers=consumer).json()
    original_row = next(
        o
        for o in client.get("/api/orders/producer?limit=50", headers=producer).json()["items"]
        if o["orderId"] == order_id
    )
    assert original_row["trackingVersion"] == 1
    first = _correct(client, producer, order_id, trackingNumber="  NEW-456  ")
    assert first.status_code == 200, first.text
    assert (
        first.json()["carrier"],
        first.json()["trackingNumber"],
        first.json()["trackingVersion"],
    ) == ("EPOST", "NEW-456", 2)
    second = _correct(client, producer, order_id, version=2, carrier="HANJIN", trackingNumber=None)
    assert second.status_code == 200, second.text
    assert second.json()["trackingVersion"] == 3
    events = sorted(
        _tracking_events(order_id), key=lambda event: event["result"]["trackingVersion"]
    )
    assert len(events) == 2
    assert all(e["actor"] == "u-kang" and e["created"] is not None for e in events)
    assert events[0]["request"] == {"previous": {"carrier": "CJ", "trackingNumber": "DEV25-1234"}}
    assert events[0]["result"] == {
        "carrier": "EPOST",
        "trackingNumber": "NEW-456",
        "trackingVersion": 2,
    }
    assert events[1]["request"] == {"previous": {"carrier": "EPOST", "trackingNumber": "NEW-456"}}
    assert events[1]["result"] == {
        "carrier": "HANJIN",
        "trackingNumber": None,
        "trackingVersion": 3,
    }
    detail = client.get(f"/api/orders/{order_id}", headers=consumer).json()
    assert (detail["carrier"], detail["trackingNumber"]) == ("HANJIN", None)
    assert detail["status"] == before["status"] == "SHIPPED"
    assert detail["shippedAt"] == before["shippedAt"]
    row = next(
        o
        for o in client.get("/api/orders/producer?limit=50", headers=producer).json()["items"]
        if o["orderId"] == order_id
    )
    assert (row["carrier"], row["trackingNumber"], row["trackingVersion"]) == ("HANJIN", None, 3)
    for public in (first.json(), second.json(), detail, row):
        assert (
            not {"trackingHistory", "events", "request_summary", "requestSummary", "previous"}
            & public.keys()
        )


def test_AC_17_9_tracking_idempotency_version_and_noop(client, login):
    order_id, consumer, producer = _order(client, login)
    noop = _correct(client, producer, order_id, carrier="CJ", trackingNumber=" DEV25-1234 ")
    assert noop.status_code == 200, noop.text
    assert noop.json()["trackingVersion"] == 1
    assert _tracking_events(order_id) == []
    endpoint = f"/api/orders/{order_id}/tracking"
    headers = producer | key()
    body = {"version": 1, "carrier": "LOTTE", "trackingNumber": "replacement-456"}
    first = client.patch(endpoint, headers=headers, json=body)
    replay = client.patch(endpoint, headers=headers, json=body)
    assert first.status_code == replay.status_code == 200
    assert replay.json() == first.json()
    assert len(_tracking_events(order_id)) == 1
    reused = client.patch(endpoint, headers=headers, json=body | {"trackingNumber": "different"})
    assert reused.status_code == 409
    stale = _correct(client, producer, order_id, version=1)
    assert stale.status_code == 409
    assert stale.json()["details"]["reason"] == "VERSION_MISMATCH"
    assert len(_tracking_events(order_id)) == 1
    detail = client.get(f"/api/orders/{order_id}", headers=consumer).json()
    assert (detail["carrier"], detail["trackingNumber"]) == ("LOTTE", "replacement-456")


def test_AC_17_9_tracking_owner_and_status_guards(client, login, other_farm_headers):
    order_id, consumer, producer = _order(client, login, ship=False)
    assert _correct(client, consumer, order_id).status_code == 403
    assert _correct(client, other_farm_headers, order_id).status_code == 404
    assert _correct(client, producer, "missing-order").status_code == 404
    for phase in ("PENDING_PAYMENT", "RESERVED", "PREPARING"):
        if phase == "RESERVED":
            reserve(client, consumer, order_id, login=login)
        elif phase == "PREPARING":
            assert (
                client.post(
                    "/api/orders/producer/harvest-start",
                    headers=producer | key(),
                    json={"productId": "p-house"},
                ).status_code
                == 200
            )
        rejected = _correct(client, producer, order_id)
        assert rejected.status_code == 409, (phase, rejected.text)
        assert rejected.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert _tracking_events(order_id) == []


@pytest.mark.parametrize(
    "body",
    [
        {"carrier": "CJ"},
        {"version": 1},
        {"version": 0, "carrier": "CJ"},
        {"version": 1.5, "carrier": "CJ"},
        {"version": 1, "carrier": "INVALID"},
        {"version": 1, "carrier": None},
        {"version": 1, "carrier": "CJ", "trackingNumber": "x" * 51},
    ],
)
def test_AC_17_9_tracking_rejects_invalid_input_without_history(client, login, body):
    order_id, _, producer = _order(client, login)
    rejected = client.patch(f"/api/orders/{order_id}/tracking", headers=producer | key(), json=body)
    assert rejected.status_code == 400, rejected.text
    assert _tracking_events(order_id) == []


@pytest.mark.parametrize("carrier", ["CJ", "EPOST", "HANJIN", "LOTTE", "LOGEN", "ETC"])
def test_AC_17_9_tracking_accepts_supported_carriers_and_optional_number(client, login, carrier):
    order_id, _, producer = _order(client, login)
    response = client.patch(
        f"/api/orders/{order_id}/tracking",
        headers=producer | key(),
        json={"version": 1, "carrier": carrier},
    )
    assert response.status_code == 200, response.text
    assert response.json()["carrier"] == carrier
    assert response.json()["trackingNumber"] is None


def test_AC_17_9_tracking_requires_idempotency_key(client, login):
    order_id, _, producer = _order(client, login)
    response = client.patch(
        f"/api/orders/{order_id}/tracking",
        headers=producer,
        json={"version": 1, "carrier": "CJ", "trackingNumber": "DEV25-5678"},
    )
    assert response.status_code == 400, response.text
    assert _tracking_events(order_id) == []


# --- AC-08-8·AC-08-9: 주문서가 본 값과 다르면 재확인(DEV-216, DEV-218) ---

SEEN = {
    "expectedStageId": "st-house-1",
    "expectedUnitPrice": 29000,
    "expectedUnitWeightGrams": 5000,
}
SNAPSHOT = {"stageId": "st-house-1", "unitPrice": 29000, "unitWeightGrams": 5000}


def _db_update(model, values, **where):
    with get_sessionmaker()() as session, session.begin():
        conditions = [getattr(model, k) == v for k, v in where.items()]
        session.execute(update(model).where(*conditions).values(**values))


def _set_price(stage_id: str, option_id: str, price: int):
    from app.catalog.models import StagePrice

    _db_update(StagePrice, {"price": price}, stage_id=stage_id, option_id=option_id)


def _order_count() -> int:
    from app.orders.models import Order

    with get_sessionmaker()() as session:
        return len(session.scalars(select(Order.id)).all())


def test_AC_08_8_stale_price_rejects_with_stage_changed(client, login):
    headers = login("u-seojun")
    before = _order_count()
    _set_price("st-house-1", "opt-5", 30000)

    response = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN))

    assert response.status_code == 409, response.text
    details = response.json()["details"]
    assert details["reason"] == "STAGE_CHANGED"
    assert details["optionId"] == "opt-5"
    assert details["previous"] == SNAPSHOT
    assert details["current"] == {
        "stageId": "st-house-1",
        "unitPrice": 30000,
        "unitWeightGrams": 5000,
        "startsAt": "2026-10-01",
        "endsAt": "2026-10-12",
    }
    assert details["nextStageStartsAt"] is None
    assert _order_count() == before


def test_AC_08_8_stage_boundary_rejects(client, login, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "fixed_now", "2026-10-13T10:00:00+09:00")
    headers = login("u-seojun")

    response = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN))

    assert response.status_code == 409
    details = response.json()["details"]
    assert details["reason"] == "STAGE_CHANGED"
    assert details["current"]["stageId"] == "st-house-2"
    assert details["current"]["unitPrice"] == 33000
    assert details["previous"]["stageId"] == "st-house-1"


def test_AC_08_8_no_current_stage_returns_null_current(client, login):
    from datetime import date

    from app.catalog.models import Stage

    headers = login("u-seojun")
    # 1단계 시작을 내일로 미뤄 오늘은 예약 기간이 아니게(공백) 만든다
    _db_update(Stage, {"starts_at": date(2026, 10, 8)}, id="st-house-1")

    response = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN))

    assert response.status_code == 409
    details = response.json()["details"]
    assert details["reason"] == "STAGE_CHANGED"
    assert details["current"] is None
    assert details["nextStageStartsAt"] == "2026-10-08"
    assert details["previous"]["unitPrice"] == 29000


def test_AC_08_8_weight_change_rejects(client, login):
    from app.catalog.models import ProductOption

    headers = login("u-seojun")
    _db_update(ProductOption, {"weight_kg": 4.5}, product_id="p-house", id="opt-5")

    response = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN))

    assert response.status_code == 409
    details = response.json()["details"]
    assert details["reason"] == "STAGE_CHANGED"
    assert details["current"]["unitWeightGrams"] == 4500
    assert details["current"]["unitPrice"] == 29000


def test_AC_08_8_reconfirm_with_current_values_creates_order(client, login):
    headers = login("u-seojun")
    _set_price("st-house-1", "opt-5", 30000)
    first = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN))
    assert first.status_code == 409
    current = first.json()["details"]["current"]

    again = client.post(
        "/api/orders",
        headers=headers | key(),
        json=order_body(
            expectedStageId=current["stageId"],
            expectedUnitPrice=current["unitPrice"],
            expectedUnitWeightGrams=current["unitWeightGrams"],
        ),
    )

    assert again.status_code == 200, again.text
    assert again.json()["unitPrice"] == 30000
    assert again.json()["totalAmount"] == 30000
    assert deposit(client, headers, again.json()["orderId"]).status_code == 200


def test_AC_08_8_without_expected_keeps_legacy(client, login):
    headers = login("u-seojun")
    _set_price("st-house-1", "opt-5", 30000)

    response = client.post("/api/orders", headers=headers | key(), json=order_body())

    assert response.status_code == 200, response.text
    assert response.json()["unitPrice"] == 30000


def test_AC_08_8_idempotent_replay_and_mismatch(client, login):
    headers = login("u-seojun")
    _set_price("st-house-1", "opt-5", 30000)
    same = key()
    first = client.post("/api/orders", headers=headers | same, json=order_body(**SEEN))
    assert first.status_code == 409

    # 같은 키·같은 본문은 처음 409를 그대로(가격을 되돌려도)
    _set_price("st-house-1", "opt-5", 29000)
    replay = client.post("/api/orders", headers=headers | same, json=order_body(**SEEN))
    assert replay.status_code == 409
    assert replay.json() == first.json()

    # 같은 키·다른 기대값은 IDEMPOTENCY_MISMATCH
    changed = order_body(**(SEEN | {"expectedUnitPrice": 30000}))
    other = client.post("/api/orders", headers=headers | same, json=changed)
    assert other.status_code == 409
    assert other.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"


def test_AC_08_8_deposit_stage_changed_details(client, login):
    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN)).json()
    _set_price("st-house-1", "opt-5", 30000)

    response = deposit(client, headers, order["orderId"])

    assert response.status_code == 409
    details = response.json()["details"]
    assert details["reason"] == "STAGE_CHANGED"
    assert details["previous"] == SNAPSHOT
    assert details["current"]["unitPrice"] == 30000
    assert details["optionId"] == "opt-5"


def test_AC_08_9_sold_out_and_paused_win_over_price_change(client, login):
    from app.catalog.models import Product

    headers = login("u-seojun")
    sold_out = client.post(
        "/api/orders",
        headers=headers | key(),
        json=order_body(
            productId="p-redhyang",
            optionId="opt-3",
            expectedStageId="st-redhyang-1",
            expectedUnitPrice=1,
            expectedUnitWeightGrams=3000,
        ),
    )
    assert sold_out.status_code == 409
    assert sold_out.json()["details"]["reason"] == "SOLD_OUT"
    assert sold_out.json()["details"]["optionId"] == "opt-3"

    _set_price("st-house-1", "opt-5", 30000)
    _db_update(Product, {"sales_paused": True}, id="p-house")
    paused = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN))
    assert paused.status_code == 409
    assert paused.json()["details"]["reason"] == "SALES_PAUSED"
    assert "previous" not in paused.json()["details"]


def test_AC_08_8_deposit_on_closed_product_has_no_next_stage(client, login):
    from datetime import date

    from app.catalog.models import Product, Stage

    headers = login("u-seojun")
    order = client.post("/api/orders", headers=headers | key(), json=order_body(**SEEN)).json()
    # 다음 기간이 남아 있어도 내린 상품이면 '다음 예약은 …에 열려요'를 주지 않는다
    _db_update(Stage, {"starts_at": date(2026, 10, 8)}, id="st-house-1")
    _db_update(Product, {"status": "CLOSED"}, id="p-house")

    response = deposit(client, headers, order["orderId"])

    assert response.status_code == 409
    details = response.json()["details"]
    assert details["reason"] == "STAGE_CHANGED"
    assert details["current"] is None
    assert details["nextStageStartsAt"] is None
    assert details["previous"] == SNAPSHOT
