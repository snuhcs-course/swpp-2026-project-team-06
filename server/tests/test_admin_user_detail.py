"""DEV-106 관리자 페이지 사용자 상세(주문·입금·환불)."""

import uuid

from sqlalchemy import delete

from app.core.db import get_sessionmaker
from app.orders.models import Order, Payment


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def order_of(detail: dict, order_id: str) -> dict:
    return next(o for o in detail["orders"] if o["orderId"] == order_id)


def test_DEV_106_admin_only(client, login):
    for path in ["/admin/users/u-g4", "/admin/users/by-order/o-g4"]:
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers=login("u-seojun")).status_code == 403, path


def test_DEV_106_detail_shows_orders_without_contact(client, admin_headers):
    response = client.get("/admin/users/u-g4", headers=admin_headers)
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail["role"] == "CONSUMER" and detail["isTestAccount"] is False
    assert detail["farm"] is None and detail["ordersTruncated"] is False
    order = order_of(detail, "o-g4")
    assert order["status"] == "SHIPPED"
    assert order["farmId"] == "f-kang" and order["productName"]
    assert order["recipient"] == "임○○"
    assert order["paymentStatus"] == "APPROVED"
    assert order["refundableAmount"] == order["totalAmount"]
    assert set(order["actions"]) == {"delivered", "refund"}
    # 받는 사람 전화·주소, 계정 전화·이메일은 내려 주지 않는다
    text = response.text
    for field in ["recipientPhone", "address", "postalCode", "phone", "email"]:
        assert f'"{field}"' not in text, field


def test_DEV_106_find_by_order_id_or_number(client, admin_headers):
    with get_sessionmaker()() as session:
        order_no = session.get(Order, "o-g4").order_no
    for ref in ["o-g4", order_no, order_no.lower()]:
        found = client.get(f"/admin/users/by-order/{ref}", headers=admin_headers).json()
        assert found == {"userId": "u-g4", "orderId": "o-g4"}, ref
    assert (
        client.get("/admin/users/by-order/FC-0000-0000", headers=admin_headers).status_code == 404
    )
    assert client.get("/admin/users/u-nobody", headers=admin_headers).status_code == 404


def test_DEV_106_awaiting_deposit_offers_confirm_and_reflects_it(client, admin_headers):
    with get_sessionmaker()() as session, session.begin():
        session.execute(delete(Payment).where(Payment.order_id == "o-g4"))
        order = session.get(Order, "o-g4")
        order.status = "AWAITING_DEPOSIT"
        order.paid_at = None
        order.shipped_at = None
        order.deposit_confirmed_by = None
    before = order_of(client.get("/admin/users/u-g4", headers=admin_headers).json(), "o-g4")
    assert before["actions"] == ["confirm_deposit"]
    assert before["paymentStatus"] is None and before["refundableAmount"] == 0

    done = client.post("/admin/orders/o-g4/confirm-deposit", headers=admin_headers | key())
    assert done.status_code == 200, done.text
    after = order_of(client.get("/admin/users/u-g4", headers=admin_headers).json(), "o-g4")
    assert after["status"] == "RESERVED" and after["depositConfirmedBy"] == "ADMIN"
    assert after["actions"] == ["refund"]


def test_DEV_106_refunds_show_up_with_remaining_amount(client, admin_headers):
    total = order_of(client.get("/admin/users/u-g4", headers=admin_headers).json(), "o-g4")[
        "totalAmount"
    ]
    part = client.post(
        "/admin/orders/o-g4/refund",
        headers=admin_headers | key(),
        json={"amount": 1000, "reason": "일부 상함"},
    )
    assert part.status_code == 200, part.text
    order = order_of(client.get("/admin/users/u-g4", headers=admin_headers).json(), "o-g4")
    assert order["paymentStatus"] == "PARTIALLY_REFUNDED"
    assert order["refundedAmount"] == 1000 and order["refundableAmount"] == total - 1000
    assert [(r["amount"], r["reason"], r["actor"]) for r in order["refunds"]] == [
        (1000, "일부 상함", "MANAGER")
    ]

    client.post("/admin/orders/o-g4/refund", headers=admin_headers | key(), json={"reason": "전액"})
    order = order_of(client.get("/admin/users/u-g4", headers=admin_headers).json(), "o-g4")
    assert order["status"] == "REFUNDED" and order["refundableAmount"] == 0
    assert "refund" not in order["actions"]


def test_DEV_106_producer_shows_farm_not_orders(client, admin_headers):
    detail = client.get("/admin/users/u-kang", headers=admin_headers).json()
    assert detail["role"] == "PRODUCER"
    assert detail["farm"] == {
        "farmId": "f-kang",
        "name": "강씨네 귤밭",
        "approvalStatus": "APPROVED",
    }
    assert detail["orders"] == []
