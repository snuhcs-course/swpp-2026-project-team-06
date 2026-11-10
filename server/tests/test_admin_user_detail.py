"""DEV-106 관리자 페이지 사용자 상세(주문·입금·환불)."""

import uuid

from sqlalchemy import delete

from app.catalog.models import ProductDraft
from app.core.clock import now
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


def test_DEV_303_producer_sees_every_product_status_with_options(client, admin_headers, login):
    detail = client.get("/admin/users/u-kang", headers=admin_headers).json()
    products = {p["productId"]: p for p in detail["products"]}
    # 강씨네 귤밭 상품만, 저장 상태 다섯 가지 모두(공개 API는 판매 중만 보여 준다)
    assert set(products) == {
        "p-house",
        "p-redhyang",
        "p-cheonhye",
        "p-cheonggyeon",
        "p-hallabong",
        "p-josaeng",
    }
    assert {p["status"] for p in products.values()} == {
        "DRAFT",
        "PENDING_APPROVAL",
        "REJECTED",
        "PUBLISHED",
        "CLOSED",
    }
    # 생산자 앱 목록과 같은 순서: 반려 → 승인 대기 → 판매 → 작성 중 → 종료
    order = [p["status"] for p in detail["products"]]
    assert order == sorted(
        order,
        key=["REJECTED", "PENDING_APPROVAL", "PUBLISHED", "DRAFT", "CLOSED"].index,
    )
    assert products["p-cheonhye"]["rejectReason"] == "받는 시기가 비어 있어요"
    assert products["p-hallabong"]["options"][0]["price"] is None
    assert products["p-josaeng"]["availability"] == "ENDED"
    assert products["p-redhyang"]["availability"] == "PERIOD_SOLD_OUT"  # 시드: 물량 0

    house = products["p-house"]
    assert house["approvedSupplyGrams"] == 2_400_000 and house["salesLimitGrams"] > 0
    assert house["availability"] == "AVAILABLE" and house["updatedAt"]
    # 옵션 줄은 DEV-300 카드와 같다: 지금 기간 가격, 모든 기간 예약·물량 박스 합
    opt5 = next(o for o in house["options"] if o["optionId"] == "opt-5")
    assert (opt5["weightKg"], opt5["price"], opt5["reserved"], opt5["quantity"]) == (
        5,
        29000,
        38,
        180,
    )
    mine = client.get("/api/products/mine", headers=login("u-kang")).json()["items"]
    card = next(c for c in mine if c["productId"] == "p-house")
    assert card["options"] == house["options"]


def test_DEV_303_drafts_listed_separately_without_other_farms(client, admin_headers):
    with get_sessionmaker()() as session, session.begin():
        session.add_all(
            [
                ProductDraft(
                    id="d-kang-1",
                    farm_id="f-kang",
                    input_text="한라봉 5kg 팔아요 010-0000-0000",
                    output={"name": "한라봉", "variety": "한라봉", "options": ["5kg"]},
                    missing_fields=["expectedBrix", "deliveryWindow"],
                    failed=False,
                    created_at=now(),
                ),
                ProductDraft(
                    id="d-kang-failed",
                    farm_id="f-kang",
                    input_text="?",
                    output={},
                    missing_fields=[
                        "name",
                        "variety",
                        "options",
                        "expectedBrix",
                        "grade",
                        "deliveryWindow",
                        "description",
                    ],
                    failed=True,
                    created_at=now(),
                ),
                ProductDraft(
                    id="d-halla-1",
                    farm_id="f-halla",
                    input_text="노지 감귤",
                    output={"name": "노지 감귤"},
                    missing_fields=[],
                    failed=False,
                    created_at=now(),
                ),
            ]
        )
    response = client.get("/admin/users/u-kang", headers=admin_headers)
    detail = response.json()
    drafts = {d["draftId"]: d for d in detail["drafts"]}
    assert set(drafts) == {"d-kang-1", "d-kang-failed"}
    assert drafts["d-kang-1"] | {"createdAt": None} == {
        "draftId": "d-kang-1",
        "name": "한라봉",
        "variety": "한라봉",
        "options": ["5kg"],
        "missingFields": ["expectedBrix", "deliveryWindow"],
        "failed": False,
        "createdAt": None,
    }
    assert drafts["d-kang-failed"]["failed"] is True and drafts["d-kang-failed"]["name"] is None
    # 농가가 붙여넣은 원문은 내려 주지 않는다
    assert "inputText" not in response.text and "010-0000-0000" not in response.text
    # 다른 농가 상품·초안은 섞이지 않는다
    assert "p-noji" not in {p["productId"] for p in detail["products"]}
    halla = client.get("/admin/users/u-halla", headers=admin_headers).json()
    assert [d["draftId"] for d in halla["drafts"]] == ["d-halla-1"]
    assert {p["productId"] for p in halla["products"]} == {"p-noji"}


def test_DEV_303_consumer_has_no_products(client, admin_headers):
    detail = client.get("/admin/users/u-g4", headers=admin_headers).json()
    assert detail["products"] == [] and detail["drafts"] == []
