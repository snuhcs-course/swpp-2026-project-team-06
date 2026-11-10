"""DEV-307 운영자 농가 정지·정지 풀기·반려 되돌리기·결정 이력(FEAT-23, R-22·R-24)."""

import threading
import time
import uuid

from sqlalchemy import select, update

from app.accounts.models import User
from app.accounts.service import FARM_WITHDRAWN_REASON
from app.admin.models import ManagerEvent
from app.admin.retire_test_farm import RETIRE_REASON
from app.catalog.models import Product
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.farms import service as farms
from app.farms.models import Farm, ProducerDecisionHistory
from app.orders.models import Order, Payment, Refund
from tests.test_orders import CONSENTS
from tests.test_retire_test_farm import make_order_consumers_test_accounts

REASON = {"reason": "허위 원산지 표시 신고가 확인됐어요"}


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def farm_row(farm_id: str) -> Farm:
    with get_sessionmaker()() as session:
        farm = session.get(Farm, farm_id)
        session.expunge(farm)
        return farm


def product_statuses(farm_id: str) -> dict[str, str]:
    with get_sessionmaker()() as session:
        rows = session.execute(select(Product.id, Product.status).where(Product.farm_id == farm_id))
        return dict(rows.all())


def decisions(farm_id: str) -> list[str]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(ProducerDecisionHistory.decision).where(
                    ProducerDecisionHistory.farm_id == farm_id
                )
            )
        )


def events(farm_id: str, event_type: str) -> list[ManagerEvent]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(ManagerEvent).where(
                    ManagerEvent.target_id == farm_id, ManagerEvent.event_type == event_type
                )
            )
        )


def refunds_and_payments() -> tuple[int, list[str]]:
    with get_sessionmaker()() as session:
        refunds = len(session.scalars(select(Refund.id)).all())
        payments = sorted(session.scalars(select(Payment.status)).all())
        return refunds, payments


def hyodon_order(client, login) -> str:
    """f-hyodon(실사용자 농가, 주문 없음)에 입금 안내 전(PENDING_PAYMENT) 주문을 만든다."""
    body = {
        "productId": "p-hyodon",
        "optionId": "opt-3",
        "quantity": 1,
        "recipientName": "이서준",
        "recipientPhone": "010-3456-7890",
        "postalCode": "48094",
        "address": "부산 해운대구 해운대로 570",
        "addressDetail": "1203호",
        "consents": CONSENTS,
        "consentVersion": "2026-10-06",
    }
    response = client.post("/api/orders", headers=login("u-seojun") | key(), json=body)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "PENDING_PAYMENT"
    return response.json()["orderId"]


def suspend(client, admin_headers, farm_id: str, body=None, headers=None):
    return client.post(
        f"/admin/farms/{farm_id}/suspend",
        headers=admin_headers | (headers or key()),
        json=REASON if body is None else body,
    )


def unsuspend(client, admin_headers, farm_id: str, body=None, headers=None):
    return client.post(
        f"/admin/farms/{farm_id}/unsuspend",
        headers=admin_headers | (headers or key()),
        json={"reason": "소명 자료를 확인했어요"} if body is None else body,
    )


def revert(client, admin_headers, farm_id: str, body=None, headers=None):
    return client.post(
        f"/admin/producers/{farm_id}/revert",
        headers=admin_headers | (headers or key()),
        json={"reason": "반려 사유를 잘못 골랐어요"} if body is None else body,
    )


# ---------------- 권한 ----------------


def test_AC_23_1_admin_only(client, login):
    for method, path in [
        ("get", "/admin/farms/f-hyodon/suspend-preview"),
        ("post", "/admin/farms/f-hyodon/suspend"),
        ("post", "/admin/farms/f-stop/unsuspend"),
        ("post", "/admin/producers/f-reject/revert"),
        ("get", "/admin/farms/f-hyodon/history"),
    ]:
        kwargs = {"json": REASON} if method == "post" else {}
        assert getattr(client, method)(path, headers=key(), **kwargs).status_code == 401, path
        response = getattr(client, method)(path, headers=login("u-kang") | key(), **kwargs)
        assert response.status_code == 403, path
    assert farm_row("f-hyodon").approval_status == "APPROVED"


# ---------------- 정지 ----------------


def test_AC_23_1_suspend_hides_farm_keeps_products_and_records(client, admin_headers):
    before = product_statuses("f-hyodon")
    assert client.get("/api/farms/f-hyodon").status_code == 200
    done = suspend(client, admin_headers, "f-hyodon")
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "SUSPENDED" and body["suspendReason"] == REASON["reason"]
    farm = farm_row("f-hyodon")
    assert (farm.approval_status, farm.suspend_reason) == ("SUSPENDED", REASON["reason"])
    assert product_statuses("f-hyodon") == before  # 상품 상태는 그대로
    # 공개 경로가 승인 농가만 보여 줘 농가·상품이 함께 숨는다
    assert client.get("/api/farms/f-hyodon").status_code == 404
    assert client.get("/api/products/p-hyodon").status_code == 404
    assert decisions("f-hyodon") == ["SUSPENDED"]
    [event] = events("f-hyodon", "farm.suspend")
    assert (event.actor_id, event.status) == ("u-admin", "SUCCEEDED")
    assert event.request_summary == {"reasonProvided": True}  # 사유 원문은 감사에 남기지 않는다


def test_AC_23_1_suspended_producer_sees_reason(client, admin_headers, login):
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(User).where(User.id == "u-hyodon").values(is_test_account=True))
    headers = login("u-hyodon", "producer")
    assert suspend(client, admin_headers, "f-hyodon").status_code == 200
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["farmStatus"] == "SUSPENDED"
    assert me["suspendReason"] == REASON["reason"]


def test_AC_23_2_refuses_with_pre_shipment_orders_and_no_refund(client, admin_headers):
    before = refunds_and_payments()
    response = suspend(client, admin_headers, "f-kang")
    assert response.status_code == 409, response.text
    details = response.json()["details"]
    assert details["reason"] == "FARM_HAS_OPEN_ORDERS"
    statuses = {o["status"] for o in details["orders"]}
    assert statuses == {"RESERVED", "PREPARING"}
    assert len(details["orders"]) == 37  # 시드 f-kang 예약 30 + 준비 7, 출고·배송 완료·환불 제외
    first = details["orders"][0]
    assert {"orderId", "orderNo", "productName", "consumerId", "totalAmount"} <= set(first)
    assert "recipientName" not in first and "address" not in first
    farm = farm_row("f-kang")
    assert (farm.approval_status, farm.suspend_reason) == ("APPROVED", None)
    assert refunds_and_payments() == before  # 계좌이체라 자동 환불하지 않는다
    assert decisions("f-kang") == []
    [event] = events("f-kang", "farm.suspend")
    assert (event.status, event.error_code) == ("REJECTED", "FARM_HAS_OPEN_ORDERS")


def test_AC_23_2_awaiting_deposit_blocks_and_pending_payment_does_not(client, admin_headers, login):
    order_id = hyodon_order(client, login)
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Order).where(Order.id == order_id).values(status="AWAITING_DEPOSIT"))
    blocked = suspend(client, admin_headers, "f-hyodon")
    assert blocked.status_code == 409
    assert [o["orderId"] for o in blocked.json()["details"]["orders"]] == [order_id]

    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Order).where(Order.id == order_id).values(status="PENDING_PAYMENT"))
    assert suspend(client, admin_headers, "f-hyodon").status_code == 200


def test_AC_23_2_suspended_farm_order_cannot_get_deposit_instructions(client, admin_headers, login):
    order_id = hyodon_order(client, login)
    assert suspend(client, admin_headers, "f-hyodon").status_code == 200
    consumer = login("u-seojun")
    response = client.post(f"/api/orders/{order_id}/deposit", headers=consumer | key(), json={})
    assert response.status_code == 404, response.text
    with get_sessionmaker()() as session:
        assert session.get(Order, order_id).status == "PENDING_PAYMENT"

    assert unsuspend(client, admin_headers, "f-hyodon").status_code == 200
    response = client.post(f"/api/orders/{order_id}/deposit", headers=consumer | key(), json={})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "AWAITING_DEPOSIT"


def test_AC_23_1_only_approved_farms_can_be_suspended(client, admin_headers):
    for farm_id in ("f-wimi", "f-reject", "f-stop"):
        response = suspend(client, admin_headers, farm_id)
        assert response.status_code == 409, farm_id
        assert response.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert suspend(client, admin_headers, "f-404").status_code == 404


# ---------------- 미리보기 ----------------


def test_AC_23_3_preview_changes_nothing(client, admin_headers):
    preview = client.get("/admin/farms/f-kang/suspend-preview", headers=admin_headers)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["action"] == "suspend" and body["status"] == "APPROVED"
    assert body["refusal"]["reason"] == "FARM_HAS_OPEN_ORDERS"
    assert len(body["blockingOrders"]) == 37
    assert {p["productId"] for p in body["products"]} == set(product_statuses("f-kang"))

    ok = client.get("/admin/farms/f-hyodon/suspend-preview", headers=admin_headers).json()
    assert ok["action"] == "suspend" and ok["refusal"] is None and ok["blockingOrders"] == []
    assert ok["products"] == [
        {"productId": "p-hyodon", "name": ok["products"][0]["name"], "status": "PUBLISHED"}
    ]

    stop = client.get("/admin/farms/f-stop/suspend-preview", headers=admin_headers).json()
    assert stop["action"] == "unsuspend" and stop["suspensionKind"] == "ADMIN"
    assert stop["refusal"] is None
    rejected = client.get("/admin/farms/f-reject/suspend-preview", headers=admin_headers).json()
    assert rejected["action"] == "revert"
    pending = client.get("/admin/farms/f-wimi/suspend-preview", headers=admin_headers).json()
    assert pending["action"] is None

    assert farm_row("f-kang").approval_status == "APPROVED"
    assert farm_row("f-stop").approval_status == "SUSPENDED"
    assert decisions("f-kang") == [] and events("f-kang", "farm.suspend") == []
    assert (
        client.get("/admin/farms/f-404/suspend-preview", headers=admin_headers).status_code == 404
    )


def test_AC_23_3_preview_shows_unsuspend_refusals(client, admin_headers):
    make_order_consumers_test_accounts("f-kang")
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Order)
            .where(Order.status.in_(("RESERVED", "PREPARING")))
            .values(status="DELIVERED")
        )
    assert client.post("/admin/farms/f-kang/retire", headers=admin_headers | key()).is_success
    hidden = client.get("/admin/farms/f-kang/suspend-preview", headers=admin_headers).json()
    assert hidden["suspensionKind"] == "TEST_HIDDEN"
    assert hidden["refusal"]["reason"] == "TEST_FARM_HIDDEN"


# ---------------- 정지 풀기 ----------------


def test_AC_23_4_unsuspend_restores_selling_immediately(client, admin_headers):
    before = product_statuses("f-hyodon")
    assert suspend(client, admin_headers, "f-hyodon").status_code == 200
    done = unsuspend(client, admin_headers, "f-hyodon")
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "APPROVED" and done.json()["suspendReason"] is None
    farm = farm_row("f-hyodon")
    assert (farm.approval_status, farm.suspend_reason) == ("APPROVED", None)
    assert product_statuses("f-hyodon") == before
    assert client.get("/api/products/p-hyodon").status_code == 200  # 바로 다시 판매
    assert sorted(decisions("f-hyodon")) == ["SUSPENDED", "UNSUSPENDED"]
    [event] = events("f-hyodon", "farm.unsuspend")
    assert event.status == "SUCCEEDED"


def test_AC_23_4_unsuspend_seed_suspended_farm_opens_support_room(client, admin_headers):
    # 시드 f-stop은 결정 행 없이 운영자 사유로 정지돼 있고 farmclub 문의 대화방도 없다
    done = unsuspend(client, admin_headers, "f-stop")
    assert done.status_code == 200, done.text
    assert farm_row("f-stop").approval_status == "APPROVED"
    room = client.get("/admin/support/f-stop/messages", headers=admin_headers)
    assert room.status_code == 200


def test_AC_23_5_unsuspend_refuses_withdrawn_hidden_and_not_suspended(client, admin_headers):
    response = unsuspend(client, admin_headers, "f-hyodon")
    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "INVALID_TRANSITION"

    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Farm).where(Farm.id == "f-stop").values(suspend_reason=FARM_WITHDRAWN_REASON)
        )
    withdrawn = unsuspend(client, admin_headers, "f-stop")
    assert withdrawn.status_code == 409
    assert withdrawn.json()["details"]["reason"] == "FARM_WITHDRAWN"
    assert farm_row("f-stop").approval_status == "SUSPENDED"

    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Farm).where(Farm.id == "f-stop").values(suspend_reason=RETIRE_REASON)
        )
    hidden = unsuspend(client, admin_headers, "f-stop")
    assert hidden.status_code == 409
    assert hidden.json()["details"]["reason"] == "TEST_FARM_HIDDEN"
    assert "되돌리기" in hidden.json()["message"]
    assert farm_row("f-stop").suspend_reason == RETIRE_REASON
    assert decisions("f-stop") == []


def test_AC_23_5_unsuspend_refuses_when_producer_account_was_deleted(client, admin_headers):
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(User)
            .where(User.id == "u-taeho")
            .values(deleted_at=farm_row("f-stop").applied_at)
        )
    response = unsuspend(client, admin_headers, "f-stop")
    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "FARM_WITHDRAWN"


# ---------------- 되돌리기 ----------------


def test_AC_23_6_revert_rejected_to_pending(client, admin_headers):
    applied = farm_row("f-reject").applied_at
    done = revert(client, admin_headers, "f-reject")
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "PENDING" and done.json()["rejectReason"] is None
    farm = farm_row("f-reject")
    assert (farm.approval_status, farm.reject_reason, farm.decided_at) == ("PENDING", None, None)
    assert farm.applied_at == applied  # 신청 시각은 그대로
    assert decisions("f-reject") == ["REVERTED"]
    pending = client.get("/admin/producers?kind=all", headers=admin_headers).json()
    assert "f-reject" in {p["farmId"] for p in pending}
    # 다시 승인할 수 있다
    approve = client.post("/admin/producers/f-reject/approve", headers=admin_headers | key())
    assert approve.status_code == 200, approve.text
    # 기존 결정 이력 API는 계약대로 승인·반려만
    old = client.get("/admin/producers/f-reject/decisions", headers=admin_headers).json()
    assert [d["decision"] for d in old] == ["APPROVED"]


def test_AC_23_6_revert_only_rejected(client, admin_headers):
    for farm_id in ("f-wimi", "f-hyodon", "f-stop"):
        response = revert(client, admin_headers, farm_id)
        assert response.status_code == 409, farm_id
        assert response.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert revert(client, admin_headers, "f-404").status_code == 404


# ---------------- 사유·멱등·동시성 ----------------


def test_AC_23_7_reason_required_for_every_action(client, admin_headers):
    for call, farm_id in ((suspend, "f-hyodon"), (unsuspend, "f-stop"), (revert, "f-reject")):
        for body in (
            {},
            {"reason": ""},
            {"reason": "   "},
            {"reason": RETIRE_REASON},
            {"reason": FARM_WITHDRAWN_REASON},
        ):
            response = call(client, admin_headers, farm_id, body=body)
            assert response.status_code == 400, (farm_id, body, response.text)
            assert "reason" in response.json()["details"]["fields"]
        too_long = call(client, admin_headers, farm_id, body={"reason": "가" * 501})
        assert too_long.status_code == 400
    assert farm_row("f-hyodon").approval_status == "APPROVED"
    assert farm_row("f-stop").approval_status == "SUSPENDED"
    assert farm_row("f-reject").approval_status == "REJECTED"


def test_AC_23_7_idempotency_key_required_and_replayed(client, admin_headers):
    missing = client.post("/admin/farms/f-hyodon/suspend", headers=admin_headers, json=REASON)
    assert missing.status_code == 400

    same = key()
    first = suspend(client, admin_headers, "f-hyodon", headers=same)
    again = suspend(client, admin_headers, "f-hyodon", headers=same)
    assert first.status_code == again.status_code == 200
    assert first.json() == again.json()
    assert decisions("f-hyodon") == ["SUSPENDED"]  # 한 번만 실행
    mismatch = suspend(
        client, admin_headers, "f-hyodon", body={"reason": "다른 사유"}, headers=same
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    # 다른 키로 다시 정지하면 상태가 이미 바뀌어 409
    other = suspend(client, admin_headers, "f-hyodon")
    assert other.status_code == 409
    assert other.json()["details"]["reason"] == "INVALID_TRANSITION"


def test_AC_23_7_refusal_is_replayed_with_same_key(client, admin_headers):
    same = key()
    first = suspend(client, admin_headers, "f-kang", headers=same)
    again = suspend(client, admin_headers, "f-kang", headers=same)
    assert first.status_code == again.status_code == 409
    assert first.json() == again.json()


def test_AC_23_7_concurrent_suspends_run_once(client, admin_headers):
    barrier = threading.Barrier(2)

    def go(_):
        barrier.wait()
        return suspend(client, admin_headers, "f-hyodon")

    results = []
    threads = [threading.Thread(target=lambda: results.append(go(None))) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(20)
    assert sorted(r.status_code for r in results) == [200, 409]
    assert decisions("f-hyodon") == ["SUSPENDED"]


def test_AC_23_7_suspend_waits_for_in_flight_deposit(client, admin_headers, login):
    """입금 안내가 농가 행을 FOR SHARE로 읽는 동안 정지는 기다렸다가 새 입금 대기를 보고
    거부한다."""
    order_id = hyodon_order(client, login)
    result = {}
    with get_sessionmaker()() as session:
        session.begin()
        assert farms.get_farm_shared(session, "f-hyodon").approval_status == "APPROVED"
        worker = threading.Thread(
            target=lambda: result.update(response=suspend(client, admin_headers, "f-hyodon"))
        )
        worker.start()
        time.sleep(0.5)
        assert worker.is_alive()  # FOR UPDATE가 공유 잠금을 기다린다
        session.get(Order, order_id).status = "AWAITING_DEPOSIT"
        session.commit()
    worker.join(20)
    response = result["response"]
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "FARM_HAS_OPEN_ORDERS"
    assert farm_row("f-hyodon").approval_status == "APPROVED"


# ---------------- 이력 ----------------


def _at(monkeypatch, value: str) -> None:
    monkeypatch.setattr(get_settings(), "fixed_now", value)


def test_AC_23_8_history_is_chronological_across_sources(client, admin_headers, monkeypatch):
    # f-reject: 신청(10/05) → 반려(10/06, 시드에는 결정 행이 없어 신청만) → 되돌림 → 승인 →
    # 정지 → 풀기 → 숨김 → 복구
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(User).where(User.id == "u-soonja").values(is_test_account=True))
    _at(monkeypatch, "2026-10-07T10:00:01+09:00")
    assert revert(client, admin_headers, "f-reject").status_code == 200
    _at(monkeypatch, "2026-10-07T10:00:02+09:00")
    assert client.post(
        "/admin/producers/f-reject/approve", headers=admin_headers | key()
    ).is_success
    _at(monkeypatch, "2026-10-07T10:00:03+09:00")
    assert suspend(client, admin_headers, "f-reject").status_code == 200
    _at(monkeypatch, "2026-10-07T10:00:04+09:00")
    assert unsuspend(client, admin_headers, "f-reject").status_code == 200
    _at(monkeypatch, "2026-10-07T10:00:05+09:00")
    assert client.post("/admin/farms/f-reject/retire", headers=admin_headers | key()).is_success
    _at(monkeypatch, "2026-10-07T10:00:06+09:00")
    assert client.post("/admin/farms/f-reject/restore", headers=admin_headers | key()).is_success
    # 거부된 작업은 이력에 들어가지 않는다
    assert unsuspend(client, admin_headers, "f-reject").status_code == 409

    response = client.get("/admin/farms/f-reject/history", headers=admin_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "APPROVED"
    kinds = [i["kind"] for i in body["items"]]
    assert kinds == [
        "APPLIED",
        "REVERTED",
        "APPROVED",
        "SUSPENDED",
        "UNSUSPENDED",
        "HIDDEN",
        "RESTORED",
    ]
    times = [i["at"] for i in body["items"]]
    assert times == sorted(times)
    by_kind = {i["kind"]: i for i in body["items"]}
    assert by_kind["SUSPENDED"]["reason"] == REASON["reason"]
    assert by_kind["SUSPENDED"]["actorId"] == "u-admin"
    assert by_kind["HIDDEN"]["source"] == "manager_event"
    assert by_kind["APPLIED"]["source"] == "farm"


def test_AC_23_8_history_includes_rejection_reapplication_and_withdrawal(
    client, admin_headers, login, monkeypatch
):
    _at(monkeypatch, "2026-10-07T10:00:01+09:00")
    reject = client.post(
        "/admin/producers/f-wimi/reject",
        headers=admin_headers | key(),
        json={"reason": "번호 확인"},
    )
    assert reject.status_code == 200
    _at(monkeypatch, "2026-10-07T10:00:02+09:00")
    reapply = client.post(
        "/api/auth/producer-application",
        headers=login("u-misook"),
        json={
            "ownerName": "김미숙",
            "farmName": "위미 감귤농장",
            "region": "제주",
            "mainItems": "노지 감귤",
            "phone": "010-4321-8765",
        },
    )
    assert reapply.status_code == 200, reapply.text
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(User)
            .where(User.id == "u-misook")
            .values(deleted_at=farm_row("f-wimi").applied_at)
        )
    body = client.get("/admin/farms/f-wimi/history", headers=admin_headers).json()
    kinds = [i["kind"] for i in body["items"]]
    # 처음 신청 → 반려 → 다시 신청 (탈퇴는 다시 신청과 같은 시각이라 그 뒤)
    assert kinds == ["APPLIED", "REJECTED", "APPLIED", "WITHDRAWN"]
    assert client.get("/admin/farms/f-404/history", headers=admin_headers).status_code == 404


def test_AC_23_2_expired_deposit_is_flagged_and_clears_after_bulk_expiry(
    client, admin_headers, login
):
    from datetime import timedelta

    from app.core.clock import now

    order_id = hyodon_order(client, login)
    deposit = client.post(
        f"/api/orders/{order_id}/deposit", headers=login("u-seojun") | key(), json={}
    )
    assert deposit.status_code == 200, deposit.text  # 물량을 잡은 실제 입금 대기
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Order)
            .where(Order.id == order_id)
            .values(deposit_due_at=now() - timedelta(hours=1))
        )
    blocked = suspend(client, admin_headers, "f-hyodon")
    assert blocked.status_code == 409
    [order] = blocked.json()["details"]["orders"]
    assert order["depositExpired"] is True
    assert "자동 취소" in blocked.json()["message"]
    expired = client.post("/admin/orders/expire-deposits", headers=admin_headers | key())
    assert expired.status_code == 200, expired.text
    assert suspend(client, admin_headers, "f-hyodon").status_code == 200
