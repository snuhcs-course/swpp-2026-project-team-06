"""DEV-30 운영자 승인·배송·환불 API 회귀 테스트."""

import uuid

from sqlalchemy import select

from app.catalog.models import CapacityRequest, StageAllocation
from app.core.db import get_sessionmaker
from app.farms.models import Farm
from app.orders.models import Order


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def farm_state(farm_id: str) -> tuple[str, str | None, str | None, object | None]:
    with get_sessionmaker()() as session:
        farm = session.get(Farm, farm_id)
        return (
            farm.approval_status,
            farm.reject_reason,
            farm.suspend_reason,
            farm.decided_at,
        )


def order_state(order_id: str) -> tuple[str, int, object | None, str | None]:
    with get_sessionmaker()() as session:
        order = session.get(Order, order_id)
        return order.status, order.released_quantity, order.refunded_at, order.refund_reason


def reserved_count(stage_id: str = "st-house-1", option_id: str = "opt-5") -> int:
    with get_sessionmaker()() as session:
        allocation = session.scalar(
            select(StageAllocation).where(
                StageAllocation.stage_id == stage_id,
                StageAllocation.option_id == option_id,
            )
        )
        return allocation.reserved_count


def test_AC_01_3_admin_approves_pending_producer_and_clears_stale_state(
    client, admin_headers
):
    with get_sessionmaker()() as session, session.begin():
        farm = session.get(Farm, "f-wimi")
        farm.reject_reason = "이전 반려 사유"
        farm.suspend_reason = "이전 정지 사유"

    response = client.post("/admin/producers/f-wimi/approve", headers=admin_headers | key())

    assert response.status_code == 200, response.text
    assert response.json() == {
        "farmId": "f-wimi",
        "status": "APPROVED",
        "rejectReason": None,
        "decidedAt": "2026-10-07T10:00:00+09:00",
    }
    status, reject_reason, suspend_reason, decided_at = farm_state("f-wimi")
    assert status == "APPROVED"
    assert reject_reason is None
    assert suspend_reason is None
    assert decided_at is not None


def test_AC_01_3_admin_rejects_pending_producer_with_required_reason(client, admin_headers):
    blank = client.post(
        "/admin/producers/f-wimi/reject", headers=admin_headers | key(), json={"reason": "   "}
    )

    assert blank.status_code == 400
    assert "reason" in blank.json()["details"]["fields"]
    assert farm_state("f-wimi") == ("PENDING", None, None, None)

    rejected = client.post(
        "/admin/producers/f-wimi/reject",
        headers=admin_headers | key(),
        json={"reason": "  연락처 확인 필요  "},
    )

    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "REJECTED"
    assert rejected.json()["rejectReason"] == "연락처 확인 필요"
    assert farm_state("f-wimi")[0:3] == ("REJECTED", "연락처 확인 필요", None)


def test_AC_01_3_producer_decisions_require_admin_and_valid_pending_state(
    client, login, admin_headers
):
    for headers in (login("u-minji"), login("u-kang")):
        assert (
            client.post("/admin/producers/f-wimi/approve", headers=headers).status_code == 403
        )
    assert farm_state("f-wimi") == ("PENDING", None, None, None)

    missing = client.post(
        "/admin/producers/f-missing/approve", headers=admin_headers | key()
    )
    invalid = client.post("/admin/producers/f-kang/approve", headers=admin_headers | key())

    assert missing.status_code == 404
    assert invalid.status_code == 409
    assert invalid.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert farm_state("f-kang")[0] == "APPROVED"


def test_AC_04_8_capacity_decisions_remain_admin_only_and_version_safe(
    client, login, admin_headers
):
    path = "/admin/products/p-cheonggyeon/capacity-requests/capacity-p-cheonggyeon/approve"
    producer = client.post(
        path,
        headers=login("u-kang") | key(),
        json={"version": 1},
    )
    stale = client.post(
        path,
        headers=admin_headers | key(),
        json={"version": 999},
    )

    assert producer.status_code == 403
    assert stale.status_code == 409
    assert stale.json()["details"]["reason"] == "STALE_VERSION"
    with get_sessionmaker()() as session:
        request = session.get(CapacityRequest, "capacity-p-cheonggyeon")
        assert (request.status, request.version, request.decided_at) == ("PENDING", 1, None)


def test_AC_17_4_only_admin_marks_shipped_order_delivered(client, login, admin_headers):
    path = "/admin/orders/o-g4/delivered"
    for headers in (login("u-minji"), login("u-kang")):
        assert client.post(path, headers=headers).status_code == 403
    assert order_state("o-g4")[0] == "SHIPPED"

    delivered = client.post(path, headers=admin_headers | key())
    repeated = client.post(path, headers=admin_headers | key())

    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["status"] == "DELIVERED"
    assert delivered.json()["deliveredAt"] == "2026-10-07T10:00:00+09:00"
    assert repeated.status_code == 409
    assert repeated.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert order_state("o-g4")[0] == "DELIVERED"


def test_AC_11_3_pre_shipment_full_refund_releases_quantity_once(client, admin_headers):
    before = reserved_count()

    refunded = client.post(
        "/admin/orders/o-40/refund",
        headers=admin_headers | key(),
        json={"reason": "  수확량 부족  "},
    )
    after = reserved_count()
    repeated = client.post(
        "/admin/orders/o-40/refund",
        headers=admin_headers | key(),
        json={"reason": "다시 환불"},
    )

    assert refunded.status_code == 200, refunded.text
    assert refunded.json()["status"] == "REFUNDED"
    assert refunded.json()["releasedQuantity"] == 2
    assert refunded.json()["refundReason"] == "수확량 부족"
    assert after == before - 2
    assert repeated.status_code == 409
    assert repeated.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert reserved_count() == after
    assert order_state("o-40")[0:2] == ("REFUNDED", 2)


def test_AC_11_3_post_shipment_refund_preserves_committed_quantity(client, admin_headers):
    before = reserved_count()

    refunded = client.post(
        "/admin/orders/o-g4/refund",
        headers=admin_headers | key(),
        json={"reason": "배송 중 파손"},
    )

    assert refunded.status_code == 200, refunded.text
    assert refunded.json()["status"] == "REFUNDED"
    assert refunded.json()["releasedQuantity"] == 0
    assert reserved_count() == before


def test_admin_order_failures_leave_data_unchanged(client, login, admin_headers):
    original = order_state("o-42")
    before = reserved_count()

    forbidden = client.post(
        "/admin/orders/o-42/refund",
        headers=login("u-minji"),
        json={"reason": "권한 없음"},
    )
    blank = client.post(
        "/admin/orders/o-42/refund", headers=admin_headers | key(), json={"reason": "   "}
    )
    invalid = client.post(
        "/admin/orders/o-42/delivered", headers=admin_headers | key()
    )
    missing_delivery = client.post(
        "/admin/orders/o-missing/delivered", headers=admin_headers | key()
    )
    missing_refund = client.post(
        "/admin/orders/o-missing/refund",
        headers=admin_headers | key(),
        json={"reason": "찾을 수 없음"},
    )

    assert forbidden.status_code == 403
    assert blank.status_code == 400
    assert invalid.status_code == 409
    assert invalid.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert missing_delivery.status_code == 404
    assert missing_refund.status_code == 404
    assert order_state("o-42") == original
    assert reserved_count() == before
