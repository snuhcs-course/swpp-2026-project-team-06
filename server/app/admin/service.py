"""운영자 작업 감사, 예외 조회와 제한된 재시도."""

import logging
from collections.abc import Callable
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin.models import ManagerEvent
from app.admin.schemas import ManagerEventPage, ManagerEventView
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.errors import ApiError, conflict, not_found
from app.core.idempotency import run_idempotent
from app.core.ids import new_id
from app.core.pagination import decode_cursor, encode_cursor

logger = logging.getLogger("farmclub.manager.audit")

RETRYABLE_ACTIONS = {
    "producer.approve",
    "producer.reject",
    "capacity.approve",
    "capacity.reject",
    "order.deliver",
    "order.refund",
}
FAILURE_STATUSES = ("FAILED", "REJECTED")
DONE_STATUSES = ("SUCCEEDED", "RECOVERED", "RESOLVED")


def _summary(body: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for key in ("amount", "version", "productId", "requestId"):
        if key in body:
            summary[key] = body[key]
    if "reason" in body:
        summary["reasonProvided"] = bool(str(body["reason"]).strip())
    return summary


def _result_summary(result: Any) -> dict[str, Any]:
    encoded = jsonable_encoder(result, by_alias=True)
    if not isinstance(encoded, dict):
        return {"completed": True}
    allowed = (
        "farmId",
        "orderId",
        "productId",
        "requestId",
        "status",
        "decidedAt",
        "deliveredAt",
    )
    return {key: encoded[key] for key in allowed if key in encoded}


def _event_view(event: ManagerEvent) -> ManagerEventView:
    return ManagerEventView(
        exception_id=event.id,
        type=event.event_type,
        actor_id=event.actor_id,
        target_type=event.target_type,
        target_id=event.target_id,
        request_summary=event.request_summary,
        status=event.status,
        retryable=event.retryable,
        attempts=event.attempts,
        result=event.result,
        error_code=event.error_code,
        error_message=event.error_message,
        message_id=event.message_id,
        last_retried_by=event.last_retried_by,
        created_at=event.created_at,
        updated_at=event.updated_at,
        resolved_at=event.resolved_at,
        resolved_by=event.resolved_by,
    )


def _find_correlated(
    db: Session, actor_id: str, scope: str, key: str
) -> ManagerEvent | None:
    return db.scalar(
        select(ManagerEvent).where(
            ManagerEvent.actor_id == actor_id,
            ManagerEvent.scope == scope,
            ManagerEvent.idempotency_key == key,
        )
    )


def _write_event(
    db: Session,
    *,
    event_id: str,
    actor_id: str,
    action: str,
    target_type: str,
    target_id: str,
    scope: str,
    key: str,
    body: dict[str, Any],
    status: str,
    retryable: bool,
    result: Any | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    retrying_manager_id: str | None = None,
) -> ManagerEvent:
    event = _find_correlated(db, actor_id, scope, key)
    timestamp = now()
    if event is not None and status in FAILURE_STATUSES:
        # 끝난 작업의 감사와, 같은 키에 다른 본문으로 온 요청의 실패는 원래 기록을 덮어쓰지 않는다
        if event.status in DONE_STATUSES or event.original_body != body:
            return event
    if event is None:
        event = ManagerEvent(
            id=event_id,
            event_type=action,
            actor_id=actor_id,
            target_type=target_type,
            target_id=target_id,
            scope=scope,
            idempotency_key=key,
            original_body=body,
            request_summary=_summary(body),
            status=status,
            retryable=retryable,
            attempts=1,
            result=result,
            error_code=error_code,
            error_message=error_message,
            message_id=None,
            last_retried_by=retrying_manager_id,
            created_at=timestamp,
            updated_at=timestamp,
            resolved_at=None,
            resolved_by=None,
        )
        db.add(event)
    else:
        event.status = status
        event.retryable = retryable
        event.result = result
        event.error_code = error_code
        event.error_message = error_message
        event.updated_at = timestamp
        if retrying_manager_id:
            event.attempts += 1
            event.last_retried_by = retrying_manager_id
        if status not in FAILURE_STATUSES:
            # 실제로 실행된 본문을 남기고, 재시도가 끝나면 원문 body는 더 필요 없으므로 지운다
            event.original_body = None if status == "RECOVERED" else body
            event.request_summary = _summary(body)
    db.flush()
    return event


def _write_failure_clean(**fields: Any) -> None:
    try:
        with get_sessionmaker()() as clean, clean.begin():
            _write_event(clean, **fields)
    except Exception:
        logger.exception(
            "manager_failure_audit_write_failed",
            extra={
                "manager_action": fields["action"],
                "manager_scope": fields["scope"],
                "target_type": fields["target_type"],
                "target_id": fields["target_id"],
            },
        )


def run_manager_action(
    db: Session,
    *,
    actor_id: str,
    action: str,
    target_type: str,
    target_id: str,
    scope: str,
    key: str | None,
    body: dict[str, Any],
    run: Callable[[str], Any],
    retrying_manager_id: str | None = None,
) -> Any:
    event_id = new_id("manager-event")
    audit_key = key or f"missing:{event_id}"

    def audited_run() -> Any:
        event = _write_event(
            db,
            event_id=event_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            scope=scope,
            key=audit_key,
            body=body,
            status="RECOVERED" if retrying_manager_id else "SUCCEEDED",
            retryable=False,
            result=None,
            retrying_manager_id=retrying_manager_id,
        )
        result = run(event.id)
        event.result = _result_summary(result)
        event.updated_at = now()
        db.flush()
        return result

    try:
        return run_idempotent(db, actor_id, scope, key, body, audited_run)
    except ApiError as exc:
        db.rollback()
        _write_failure_clean(
            event_id=event_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            scope=scope,
            key=audit_key,
            body=body,
            status="REJECTED",
            retryable=False,
            result=None,
            error_code=exc.details.get("reason") or exc.code,
            error_message="요청 조건을 확인해야 하는 작업",
            retrying_manager_id=retrying_manager_id,
        )
        raise
    except Exception as exc:
        db.rollback()
        _write_failure_clean(
            event_id=event_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            scope=scope,
            key=audit_key,
            body=body,
            status="FAILED",
            retryable=action in RETRYABLE_ACTIONS,
            result=None,
            error_code=type(exc).__name__,
            error_message="일시적인 내부 오류",
            retrying_manager_id=retrying_manager_id,
        )
        raise


def list_events(
    db: Session,
    status: str | None,
    event_type: str | None,
    cursor: str | None,
    limit: int,
) -> ManagerEventPage:
    query = select(ManagerEvent)
    if status:
        query = query.where(ManagerEvent.status == status)
    else:
        query = query.where(ManagerEvent.status.in_(("OPEN", "FAILED")))
    if event_type:
        query = query.where(ManagerEvent.event_type == event_type)
    rows = list(
        db.scalars(query.order_by(ManagerEvent.created_at.desc(), ManagerEvent.id.desc()))
    )
    offset = int((decode_cursor(cursor) or [0])[0])
    page = rows[offset : offset + limit]
    next_cursor = encode_cursor([offset + limit]) if offset + limit < len(rows) else None
    return ManagerEventPage(items=[_event_view(row) for row in page], next_cursor=next_cursor)


def get_event(db: Session, event_id: str, *, lock: bool = False) -> ManagerEvent:
    query = select(ManagerEvent).where(ManagerEvent.id == event_id)
    if lock:
        query = query.with_for_update()
    event = db.scalar(query)
    if event is None:
        raise not_found("운영자 예외를 찾을 수 없어요.")
    return event


def event_detail(db: Session, event_id: str) -> ManagerEventView:
    return _event_view(get_event(db, event_id))


def _dispatch(
    db: Session, event: ManagerEvent, body: dict[str, Any], manager_event_id: str
) -> Any:
    if event.event_type.startswith("producer."):
        from app.accounts import service as accounts

        approved = event.event_type == "producer.approve"
        return accounts.decide_producer_application(
            db, event.target_id, approved, event.actor_id, body.get("reason")
        )
    if event.event_type.startswith("order."):
        from app.orders import service as orders

        if event.event_type == "order.deliver":
            return orders.mark_delivered(db, event.target_id)
        return orders.admin_refund(
            db,
            event.target_id,
            body["reason"],
            body.get("amount"),
            event.actor_id,
            manager_event_id,
        )
    if event.event_type.startswith("capacity."):
        from app.catalog import service as catalog

        product_id, request_id = event.target_id.split(":", 1)
        return catalog.decide_capacity_request(
            db,
            product_id,
            request_id,
            body["version"],
            event.event_type == "capacity.approve",
            body.get("reason"),
            event.actor_id,
        )
    raise conflict("RETRY_NOT_ALLOWED", "재시도할 수 없는 작업이에요.")


def retry_event(db: Session, event_id: str, retrying_manager_id: str) -> ManagerEventView:
    # 행 잠금은 쓰지 않는다. 동시 재시도는 원래 actor·scope·key의 run_idempotent가 한 번만 실행한다.
    event = get_event(db, event_id)
    if event.status != "FAILED" or not event.retryable or event.event_type not in RETRYABLE_ACTIONS:
        raise conflict("RETRY_NOT_ALLOWED", "재시도할 수 없는 작업이에요.")
    actor_id = event.actor_id
    if actor_id is None or event.scope is None or event.idempotency_key is None:
        raise conflict("RETRY_NOT_ALLOWED", "재시도 정보가 없어요.")
    action = event.event_type
    target_type = event.target_type
    target_id = event.target_id
    scope = event.scope
    key = event.idempotency_key
    body = event.original_body or {}
    db.rollback()
    run_manager_action(
        db,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        scope=scope,
        key=key,
        body=body,
        run=lambda manager_event_id: _dispatch(db, event, body, manager_event_id),
        retrying_manager_id=retrying_manager_id,
    )
    return event_detail(db, event_id)


def resolve_event(db: Session, event_id: str, manager_id: str) -> ManagerEventView:
    event = get_event(db, event_id, lock=True)
    if event.status not in ("OPEN", "FAILED", "REJECTED"):
        raise conflict("INVALID_TRANSITION", "해결할 수 없는 예외 상태예요.")
    event.status = "RESOLVED"
    event.retryable = False
    event.original_body = None
    event.resolved_at = now()
    event.resolved_by = manager_id
    event.updated_at = now()
    db.commit()
    return _event_view(event)
