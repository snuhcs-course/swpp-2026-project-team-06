"""DEV-35 환불 이력, 운영자 결정 이력과 예외 복구."""

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.accounts.models import User
from app.admin.models import ManagerEvent
from app.catalog.models import StageAllocation
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.ids import new_id
from app.core.security import issue_token
from app.farms.models import ProducerDecisionHistory
from app.orders.models import Order, Payment, Refund


def keyed(headers: dict[str, str], value: str | None = None) -> dict[str, str]:
    return headers | {"Idempotency-Key": value or str(uuid.uuid4())}


def refund_rows(order_id: str) -> list[Refund]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(Refund).where(Refund.order_id == order_id).order_by(Refund.created_at)
            )
        )


def test_AC_11_3_partial_then_consumer_final_refund_preserves_order_until_final(
    client, login, admin_headers
):
    with get_sessionmaker()() as session:
        order = session.get(Order, "o-42")
        payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
        original = (order.status, order.refunded_at, order.refund_reason, order.released_quantity)
        total = payment.amount
        allocation = session.get(StageAllocation, (order.stage_id, order.option_id))
        allocation_before = allocation.reserved_count

    partial = client.post(
        "/admin/orders/o-42/refund",
        headers=keyed(admin_headers),
        json={"reason": "일부 품질 보상", "amount": 10000},
    )

    assert partial.status_code == 200, partial.text
    assert partial.json()["status"] == original[0]
    with get_sessionmaker()() as session:
        order = session.get(Order, "o-42")
        payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
        state = (order.status, order.refunded_at, order.refund_reason, order.released_quantity)
        assert state == original
        assert payment.status == "PARTIALLY_REFUNDED"
        assert len(payment.status) <= Payment.__table__.c.status.type.length

    canceled = client.post("/api/orders/o-42/cancel", headers=login("u-minji"))
    repeated = client.post("/api/orders/o-42/cancel", headers=login("u-minji"))

    assert canceled.status_code == 200
    assert repeated.status_code == 200
    rows = refund_rows("o-42")
    assert [(row.actor, row.amount) for row in rows] == [
        ("MANAGER", 10000),
        ("CONSUMER", total - 10000),
    ]
    with get_sessionmaker()() as session:
        order = session.get(Order, "o-42")
        payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
        allocation = session.get(StageAllocation, (order.stage_id, order.option_id))
        assert payment.status == "REFUNDED"
        assert order.status == "REFUNDED"
        assert order.refunded_at is not None and order.refund_reason
        assert allocation.reserved_count == allocation_before - order.quantity


def test_AC_11_3_refundable_balance_includes_delivery_fees(client, admin_headers):
    with get_sessionmaker()() as session, session.begin():
        order = session.get(Order, "o-42")
        payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
        order.shipping_fee = 4000
        order.remote_area_fee = 3000
        order.total_amount += 7000
        payment.amount = order.total_amount
        total = payment.amount

    first = client.post(
        "/admin/orders/o-42/refund",
        headers=keyed(admin_headers),
        json={"reason": "상품 일부 환불", "amount": total - 7000},
    )
    final = client.post(
        "/admin/orders/o-42/refund",
        headers=keyed(admin_headers),
        json={"reason": "배송비 포함 잔액 환불"},
    )

    assert first.status_code == 200
    assert first.json()["status"] == "RESERVED"
    assert final.status_code == 200
    assert sum(row.amount for row in refund_rows("o-42")) == total


def test_AC_10_6_partial_refund_keeps_delivery_and_confirmation_flow(
    client, login, admin_headers
):
    partial = client.post(
        "/admin/orders/o-07/refund",
        headers=keyed(admin_headers),
        json={"reason": "일부 보상", "amount": 1000},
    )
    confirmed = client.post("/api/orders/o-07/confirm", headers=login("u-minji"))

    assert partial.status_code == 200
    assert partial.json()["status"] == "DELIVERED"
    assert partial.json()["refundedAt"] is None
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "COMPLETED"


def test_AC_11_3_delivery_window_refund_records_consumer_history(client, login):
    response = client.post(
        "/api/orders/o-11/delivery-window-response",
        headers=login("u-minji"),
        json={"choice": "refund"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "REFUNDED"
    rows = refund_rows("o-11")
    assert len(rows) == 1
    assert (rows[0].actor, rows[0].actor_user_id) == ("CONSUMER", "u-minji")
    with get_sessionmaker()() as session:
        payment = session.scalar(select(Payment).where(Payment.order_id == "o-11"))
        assert payment.status == "REFUNDED"


def test_AC_11_3_excessive_or_zero_refund_has_no_partial_writes(client, admin_headers):
    with get_sessionmaker()() as session:
        payment = session.scalar(select(Payment).where(Payment.order_id == "o-42"))
        total = payment.amount

    for amount in (0, -1, total + 1):
        response = client.post(
            "/admin/orders/o-42/refund",
            headers=keyed(admin_headers),
            json={"reason": "잘못된 금액", "amount": amount},
        )
        assert response.status_code == 400

    assert refund_rows("o-42") == []
    with get_sessionmaker()() as session:
        order = session.get(Order, "o-42")
        payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
        assert order.status == "RESERVED"
        assert payment.status == "APPROVED"


def test_AC_01_3_reject_history_survives_reapplication(client, login, admin_headers):
    rejected = client.post(
        "/admin/producers/f-wimi/reject",
        headers=keyed(admin_headers),
        json={"reason": "연락처 확인 필요"},
    )
    reapplied = client.post(
        "/api/auth/producer-application",
        headers=login("u-misook"),
        json={
            "ownerName": "오미숙",
            "farmName": "위미 감귤농장",
            "region": "제주 서귀포시 남원읍",
            "mainItems": "노지 감귤, 레드향",
            "phone": "010-4321-8765",
        },
    )
    history = client.get("/admin/producers/f-wimi/decisions", headers=admin_headers)

    assert rejected.status_code == 200
    assert reapplied.status_code == 200
    assert reapplied.json()["rejectReason"] is None
    assert history.status_code == 200
    assert history.json()[0]["decision"] == "REJECTED"
    assert history.json()[0]["reason"] == "연락처 확인 필요"
    with get_sessionmaker()() as session:
        assert session.scalar(select(func.count(ProducerDecisionHistory.id))) == 1


def test_AC_11_3_success_audit_is_sanitized_and_cached_replay_is_single(
    client, admin_headers
):
    idempotency_key = str(uuid.uuid4())
    headers = keyed(admin_headers, idempotency_key)
    body = {"reason": "연락처 010-1234-5678 확인", "amount": 1000}

    first = client.post("/admin/orders/o-42/refund", headers=headers, json=body)
    replay = client.post("/admin/orders/o-42/refund", headers=headers, json=body)

    assert first.status_code == replay.status_code == 200
    with get_sessionmaker()() as session:
        events = list(
            session.scalars(
                select(ManagerEvent).where(ManagerEvent.idempotency_key == idempotency_key)
            )
        )
        assert len(events) == 1
        event = events[0]
        assert event.original_body == body
        assert event.request_summary == {"amount": 1000, "reasonProvided": True}
        assert "010" not in str(event.request_summary)
        assert event.attempts == 1


def test_AC_11_3_concurrent_same_key_creates_one_refund_and_audit(client, admin_headers):
    idempotency_key = str(uuid.uuid4())
    headers = keyed(admin_headers, idempotency_key)
    body = {"reason": "동시 요청", "amount": 1000}

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda _: client.post("/admin/orders/o-42/refund", headers=headers, json=body),
                range(2),
            )
        )

    assert [response.status_code for response in responses] == [200, 200]
    assert len(refund_rows("o-42")) == 1
    with get_sessionmaker()() as session:
        events = list(
            session.scalars(
                select(ManagerEvent).where(ManagerEvent.idempotency_key == idempotency_key)
            )
        )
        assert len(events) == 1


def test_AC_11_3_commit_failure_rolls_back_action_and_records_failed_event(
    client, admin_headers, monkeypatch
):
    from app.admin import service

    real_run_idempotent = service.run_idempotent
    idempotency_key = str(uuid.uuid4())

    def fail_after_action(db, actor_id, scope, key, body, run):
        run()
        raise OperationalError("commit", {}, RuntimeError("temporary"))

    monkeypatch.setattr(service, "run_idempotent", fail_after_action)
    with pytest.raises(OperationalError):
        client.post(
            "/admin/orders/o-42/refund",
            headers=keyed(admin_headers, idempotency_key),
            json={"reason": "커밋 실패", "amount": 1000},
        )
    monkeypatch.setattr(service, "run_idempotent", real_run_idempotent)

    assert refund_rows("o-42") == []
    with get_sessionmaker()() as session:
        event = session.scalar(
            select(ManagerEvent).where(ManagerEvent.idempotency_key == idempotency_key)
        )
        assert event.status == "FAILED" and event.retryable


def test_AC_11_3_transient_retry_uses_original_actor_and_exact_body(
    client, admin_headers, monkeypatch
):
    from app.orders import service as orders

    original = orders.admin_refund

    def fail(*args, **kwargs):
        raise OperationalError("refund", {}, RuntimeError("temporary"))

    monkeypatch.setattr(orders, "admin_refund", fail)
    idempotency_key = str(uuid.uuid4())
    body = {"reason": "연락처 010-9999-8888 확인", "amount": 1000}
    with pytest.raises(OperationalError):
        client.post(
            "/admin/orders/o-42/refund",
            headers=keyed(admin_headers, idempotency_key),
            json=body,
        )

    monkeypatch.setattr(orders, "admin_refund", original)
    with get_sessionmaker()() as session, session.begin():
        session.add(
            User(
                id="u-admin-2",
                name="보조 운영자",
                role="ADMIN",
                is_test_account=False,
                created_at=now(),
            )
        )
    second_admin = {"Authorization": f"Bearer {issue_token('u-admin-2', 'ADMIN')}"}
    with get_sessionmaker()() as session:
        event = session.scalar(
            select(ManagerEvent).where(ManagerEvent.idempotency_key == idempotency_key)
        )
        event_id = event.id
        assert event.actor_id == "u-admin"
        assert event.original_body == body
        assert event.status == "FAILED" and event.retryable

    retried = client.post(f"/admin/exceptions/{event_id}/retry", headers=second_admin)

    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "RECOVERED"
    assert retried.json()["lastRetriedBy"] == "u-admin-2"
    assert retried.json()["attempts"] == 2
    assert refund_rows("o-42")[0].actor_user_id == "u-admin"
    with get_sessionmaker()() as session:
        assert session.get(ManagerEvent, event_id).original_body is None


def test_AC_17_4_secondary_audit_failure_logs_and_preserves_original(
    caplog, monkeypatch
):
    from unittest.mock import Mock

    from app.admin import service

    original = RuntimeError("original action failure")
    monkeypatch.setattr(service, "run_idempotent", lambda *args: args[-1]())
    monkeypatch.setattr(service, "_write_event", lambda *args, **kwargs: Mock())
    monkeypatch.setattr(service, "get_sessionmaker", lambda: (_ for _ in ()).throw(RuntimeError()))
    db = Mock()

    with caplog.at_level(logging.ERROR, logger="farmclub.manager.audit"):
        with pytest.raises(RuntimeError, match="original action failure") as raised:
            service.run_manager_action(
                db,
                actor_id="u-admin",
                action="order.deliver",
                target_type="order",
                target_id="o-g4",
                scope="order-deliver:o-g4",
                key="key",
                body={},
                run=lambda _: (_ for _ in ()).throw(original),
            )

    assert raised.value is original
    assert "manager_failure_audit_write_failed" in caplog.text
    assert "original action failure" not in caplog.text


def test_M_07_refund_alert_can_resolve_but_not_retry(client, admin_headers):
    with get_sessionmaker()() as session, session.begin():
        event = ManagerEvent(
            id=new_id("manager-event"),
            event_type="manager_refund_request",
            actor_id=None,
            target_type="message",
            target_id="message-1",
            scope=None,
            idempotency_key=None,
            original_body=None,
            request_summary={"category": "refund_or_compensation"},
            status="OPEN",
            retryable=False,
            attempts=1,
            result=None,
            error_code=None,
            error_message=None,
            message_id="message-1",
            last_retried_by=None,
            created_at=now(),
            updated_at=now(),
            resolved_at=None,
            resolved_by=None,
        )
        session.add(event)
        event_id = event.id

    retry = client.post(f"/admin/exceptions/{event_id}/retry", headers=admin_headers)
    resolved = client.post(f"/admin/exceptions/{event_id}/resolve", headers=admin_headers)

    assert retry.status_code == 409
    assert retry.json()["details"]["reason"] == "RETRY_NOT_ALLOWED"
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "RESOLVED"


def _event_by_key(idempotency_key: str) -> ManagerEvent:
    with get_sessionmaker()() as session:
        return session.scalar(
            select(ManagerEvent).where(ManagerEvent.idempotency_key == idempotency_key)
        )


def test_AC_11_3_key_reuse_with_other_body_keeps_success_audit(client, admin_headers):
    idempotency_key = str(uuid.uuid4())
    headers = keyed(admin_headers, idempotency_key)

    first = client.post(
        "/admin/orders/o-g4/refund", headers=headers, json={"reason": "일부", "amount": 1000}
    )
    reused = client.post(
        "/admin/orders/o-g4/refund", headers=headers, json={"reason": "다른", "amount": 1000}
    )

    assert first.status_code == 200
    assert reused.status_code == 409
    assert reused.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    event = _event_by_key(idempotency_key)
    assert event.status == "SUCCEEDED"
    assert event.error_code is None
    assert event.result["status"] == "SHIPPED"
    assert len(refund_rows("o-g4")) == 1


def test_AC_11_3_key_reuse_with_other_body_keeps_failed_event_retryable(
    client, admin_headers, monkeypatch
):
    from app.orders import service as orders

    original = orders.admin_refund
    idempotency_key = str(uuid.uuid4())
    headers = keyed(admin_headers, idempotency_key)

    def fail(*args, **kwargs):
        raise OperationalError("refund", {}, RuntimeError("temporary"))

    monkeypatch.setattr(orders, "admin_refund", fail)
    with pytest.raises(OperationalError):
        client.post(
            "/admin/orders/o-42/refund", headers=headers, json={"reason": "원래", "amount": 1000}
        )
    monkeypatch.setattr(orders, "admin_refund", original)
    # 실패한 작업은 멱등 결과를 남기지 않으므로 같은 키의 다른 본문은 새로 실행된다
    other = client.post(
        "/admin/orders/o-42/refund", headers=headers, json={"reason": "다른", "amount": 0}
    )

    assert other.status_code == 400
    event = _event_by_key(idempotency_key)
    assert event.status == "FAILED" and event.retryable
    assert event.original_body == {"reason": "원래", "amount": 1000}

    retried = client.post(f"/admin/exceptions/{event.id}/retry", headers=admin_headers)

    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "RECOVERED"
    assert [row.reason for row in refund_rows("o-42")] == ["원래"]


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/admin/producers/f-wimi/approve", None),
        ("/admin/producers/f-wimi/reject", {"reason": "확인 필요"}),
        ("/admin/orders/o-g4/delivered", None),
        ("/admin/orders/o-42/refund", {"reason": "환불"}),
    ],
)
def test_AC_11_3_manager_mutations_require_idempotency_key(client, admin_headers, path, body):
    response = client.post(path, headers=admin_headers, json=body)

    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["details"]["fields"]
    assert refund_rows("o-42") == []


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/admin/producers/f-wimi/decisions"),
        ("GET", "/admin/orders/o-42/refunds"),
        ("GET", "/admin/exceptions"),
        ("GET", "/admin/exceptions/manager-event-missing"),
        ("POST", "/admin/exceptions/manager-event-missing/retry"),
        ("POST", "/admin/exceptions/manager-event-missing/resolve"),
    ],
)
def test_AC_01_3_manager_history_and_exception_apis_require_admin(
    client, login, method, path
):
    for user_id in ("u-minji", "u-kang"):
        response = client.request(method, path, headers=login(user_id))
        assert response.status_code == 403, (user_id, response.text)


def _migration_0007():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).parents[1] / "migrations/versions/0007_manager_exception_recovery.py"
    spec = importlib.util.spec_from_file_location("migration_0007", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_AC_11_3_migration_backfills_legacy_refunds_with_and_without_payment():
    from sqlalchemy import delete, text

    migration = _migration_0007()
    with get_sessionmaker()() as session:
        for order_id in ("o-40", "o-42"):
            order = session.get(Order, order_id)
            order.status = "REFUNDED"
            order.refund_reason = None
            order.refunded_at = None
        session.execute(delete(Payment).where(Payment.order_id == "o-42"))
        session.execute(delete(Refund))
        session.flush()

        session.execute(text(migration.BACKFILL_REFUNDS_SQL))
        session.execute(text(migration.NORMALIZE_PAYMENTS_SQL))

        with_payment = session.scalar(select(Refund).where(Refund.order_id == "o-40"))
        payment = session.scalar(select(Payment).where(Payment.order_id == "o-40"))
        without_payment = session.scalar(select(Refund).where(Refund.order_id == "o-42"))
        order_without = session.get(Order, "o-42")
        assert (with_payment.actor, with_payment.amount) == ("SYSTEM", payment.amount)
        assert with_payment.reason == "기존 전액 환불"
        assert with_payment.created_at == session.get(Order, "o-40").created_at
        assert payment.status == "REFUNDED"
        assert without_payment.amount == order_without.total_amount
        session.rollback()
