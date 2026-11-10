"""운영자 농가 정지·정지 풀기·반려 되돌리기와 결정 이력(DEV-307, FEAT-23, R-22·R-24).

- 정지: 승인 농가만. 사유 필수. 출하 전 주문이 하나라도 있으면 거부하고 그 주문 목록을 돌려준다.
  무통장 입금이라 서버가 환불할 수 없으므로 자동 환불하지 않는다(R-24 11/10 예외). 상품 상태는
  그대로 두고, 공개 경로가 승인 농가만 보여 주므로 상품이 함께 숨는다.
- 정지 풀기: 운영자가 정지한 농가만 APPROVED로 되돌린다(상품 상태 그대로라 바로 판매 재개).
  탈퇴한 농가와 테스트로 숨긴 농가(DEV-93·98)는 거부한다. 숨긴 농가는 /admin/farms/{id}/restore.
- 되돌리기: 반려(REJECTED) → 확인 중(PENDING). 사유 필수.

결정은 producer_decisions에 SUSPENDED·UNSUSPENDED·REVERTED로 남기고(사유·운영자), 실행은
run_manager_action으로 멱등 키·감사(ManagerEvent)를 남긴다. 농가 행을 FOR UPDATE로 잠근 뒤
상태를 다시 본다. 입금 안내는 같은 행을 FOR SHARE로 읽는다(orders.request_deposit).
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import User
from app.accounts.service import FARM_WITHDRAWN_REASON
from app.admin.models import ManagerEvent
from app.admin.retire_test_farm import OPEN_STATUSES, RETIRE_REASON
from app.admin.service import run_manager_action
from app.catalog.models import Product
from app.core.clock import now
from app.core.db import get_db
from app.core.errors import conflict, invalid, not_found
from app.core.ids import new_id
from app.core.schemas import CamelModel
from app.core.security import Admin
from app.farms.models import Farm, ProducerDecisionHistory
from app.orders.models import Order

router = APIRouter(prefix="/admin/farms", tags=["admin"])
producers_router = APIRouter(prefix="/admin/producers", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]

# 출하 전 주문: 입금 대기·예약·준비. 농가를 정지하면 생산자가 처리할 수 없다.
# PENDING_PAYMENT(입금 안내 전)는 돈·물량이 없고 정지된 농가에서는 입금 안내가 막혀 세지 않는다.
PRE_SHIPMENT_STATUSES = OPEN_STATUSES  # 테스트 농가 숨기기와 같은 기준
REASON_MAX = 500
# 숨김·탈퇴와 정지는 정지 사유 문구로만 구분된다
RESERVED_REASONS = (RETIRE_REASON, FARM_WITHDRAWN_REASON)
SuspensionKind = Literal["ADMIN", "TEST_HIDDEN", "WITHDRAWN"]


class FarmReasonInput(CamelModel):
    reason: str = Field(default="", max_length=REASON_MAX)


class BlockingOrder(CamelModel):
    order_id: str
    order_no: str
    status: str
    product_id: str
    product_name: str
    consumer_id: str
    total_amount: int
    created_at: datetime
    deposit_due_at: datetime | None
    deposit_reported_at: datetime | None
    paid_at: datetime | None
    # 입금 기한이 지났고 '입금했어요'도 없는 입금 대기. 소비자·생산자가 주문을 열거나
    # 운영자 일괄 만료가 돌면 취소되고, 그 뒤에는 정지를 막지 않는다
    deposit_expired: bool


class AffectedProduct(CamelModel):
    product_id: str
    name: str
    status: str


class Refusal(CamelModel):
    reason: str
    message: str


class FarmStatusPreview(CamelModel):
    farm_id: str
    name: str
    region: str
    producer_id: str
    status: str
    suspend_reason: str | None
    suspension_kind: SuspensionKind | None
    # 지금 상태에서 할 수 있는 운영 작업. 정지(suspend)·정지 풀기(unsuspend)·되돌리기(revert)
    action: Literal["suspend", "unsuspend", "revert"] | None
    refusal: Refusal | None
    blocking_orders: list[BlockingOrder]
    products: list[AffectedProduct]


class FarmStatusResult(CamelModel):
    farm_id: str
    status: str
    suspend_reason: str | None
    reject_reason: str | None
    decision_id: str
    decided_at: datetime


HistoryKind = Literal[
    "APPLIED",
    "APPROVED",
    "REJECTED",
    "REVERTED",
    "SUSPENDED",
    "UNSUSPENDED",
    "HIDDEN",
    "RESTORED",
    "WITHDRAWN",
]


class FarmHistoryEntry(CamelModel):
    kind: HistoryKind
    at: datetime
    reason: str | None
    actor_id: str | None
    source: Literal["decision", "manager_event", "farm", "user"]
    ref_id: str | None


class FarmHistory(CamelModel):
    farm_id: str
    status: str
    items: list[FarmHistoryEntry]


# ---------------- 조회 ----------------


def suspension_kind(farm: Farm) -> SuspensionKind | None:
    if farm.approval_status != "SUSPENDED":
        return None
    if farm.suspend_reason == RETIRE_REASON:
        return "TEST_HIDDEN"
    if farm.suspend_reason == FARM_WITHDRAWN_REASON:
        return "WITHDRAWN"
    return "ADMIN"


def blocking_orders(db: Session, farm_id: str) -> list[BlockingOrder]:
    current = now()
    rows = db.execute(
        select(Order, Product.name)
        .join(Product, Product.id == Order.product_id)
        .where(Product.farm_id == farm_id, Order.status.in_(PRE_SHIPMENT_STATUSES))
        .order_by(Order.created_at, Order.id)
    ).all()
    return [
        BlockingOrder(
            order_id=o.id,
            order_no=o.order_no,
            status=o.status,
            product_id=o.product_id,
            product_name=name,
            consumer_id=o.consumer_id,
            total_amount=o.total_amount,
            created_at=o.created_at,
            deposit_due_at=o.deposit_due_at,
            deposit_reported_at=o.deposit_reported_at,
            paid_at=o.paid_at,
            deposit_expired=(
                o.status == "AWAITING_DEPOSIT"
                and o.deposit_reported_at is None
                and o.deposit_due_at is not None
                and o.deposit_due_at <= current
            ),
        )
        for o, name in rows
    ]


def _products(db: Session, farm_id: str) -> list[AffectedProduct]:
    rows = db.scalars(
        select(Product).where(Product.farm_id == farm_id).order_by(Product.updated_at.desc())
    )
    return [AffectedProduct(product_id=p.id, name=p.name, status=p.status) for p in rows]


def _get_farm(db: Session, farm_id: str, lock: bool = False) -> Farm:
    query = select(Farm).where(Farm.id == farm_id)
    if lock:
        # identity map에 남은 옛 값이 아니라 잠근 뒤 DB 값을 읽는다
        query = query.with_for_update().execution_options(populate_existing=True)
    farm = db.scalar(query)
    if farm is None:
        raise not_found("농가를 찾을 수 없어요.")
    return farm


def _withdrawn(db: Session, farm: Farm) -> bool:
    producer = db.get(User, farm.producer_id)
    return farm.suspend_reason == FARM_WITHDRAWN_REASON or (
        producer is not None and producer.deleted_at is not None
    )


def _suspend_refusal(db: Session, farm: Farm) -> tuple[Refusal | None, list[BlockingOrder]]:
    if farm.approval_status != "APPROVED":
        return Refusal(reason="INVALID_TRANSITION", message="승인된 농가만 정지할 수 있어요."), []
    orders = blocking_orders(db, farm.id)
    if orders:
        message = (
            f"출하 전 주문이 {len(orders)}건 있어 정지할 수 없어요. "
            "계좌이체라 자동 환불되지 않으니 주문을 먼저 정리해 주세요."
        )
        if any(o.deposit_expired for o in orders):
            message += " 입금 기한이 지난 입금 대기는 소비자·생산자가 주문을 열면 자동 취소돼요."
        return Refusal(reason="FARM_HAS_OPEN_ORDERS", message=message), orders
    return None, []


def _unsuspend_refusal(db: Session, farm: Farm) -> Refusal | None:
    if farm.approval_status != "SUSPENDED":
        return Refusal(reason="INVALID_TRANSITION", message="정지된 농가만 정지를 풀 수 있어요.")
    if _withdrawn(db, farm):
        return Refusal(reason="FARM_WITHDRAWN", message="탈퇴한 농가는 정지를 풀 수 없어요.")
    if farm.suspend_reason == RETIRE_REASON:
        return Refusal(
            reason="TEST_FARM_HIDDEN",
            message="테스트 농가로 숨긴 농가예요. 테스트 농가 되돌리기로 다시 공개해 주세요.",
        )
    return None


def _revert_refusal(farm: Farm) -> Refusal | None:
    if farm.approval_status != "REJECTED":
        return Refusal(reason="INVALID_TRANSITION", message="반려된 신청만 되돌릴 수 있어요.")
    return None


@router.get("/{farm_id}/suspend-preview", response_model=FarmStatusPreview)
def status_preview(db: Db, _: Admin, farm_id: str):
    """바꾸지 않고, 지금 할 수 있는 작업과 거부 사유·막는 주문·영향받는 상품을 알려 준다."""
    farm = _get_farm(db, farm_id)
    action: str | None = None
    refusal: Refusal | None = None
    orders: list[BlockingOrder] = []
    if farm.approval_status == "APPROVED":
        action = "suspend"
        refusal, orders = _suspend_refusal(db, farm)
    elif farm.approval_status == "SUSPENDED":
        action = "unsuspend"
        refusal = _unsuspend_refusal(db, farm)
    elif farm.approval_status == "REJECTED":
        action = "revert"
    return FarmStatusPreview(
        farm_id=farm.id,
        name=farm.name,
        region=farm.region,
        producer_id=farm.producer_id,
        status=farm.approval_status,
        suspend_reason=farm.suspend_reason,
        suspension_kind=suspension_kind(farm),
        action=action,
        refusal=refusal,
        blocking_orders=orders,
        products=_products(db, farm.id),
    )


# ---------------- 실행 ----------------


def _reason(raw: str) -> str:
    reason = (raw or "").strip()
    if not reason:
        raise invalid({"reason": "사유를 적어 주세요"})
    if reason in RESERVED_REASONS:
        raise invalid({"reason": "다른 사유를 적어 주세요"})
    return reason


def _record(db: Session, farm: Farm, decision: str, reason: str, manager_id: str):
    row = ProducerDecisionHistory(
        id=new_id("producer-decision"),
        farm_id=farm.id,
        application_at=farm.applied_at,
        decision=decision,
        reason=reason,
        manager_id=manager_id,
        decided_at=now(),
    )
    db.add(row)
    return row


def _result(farm: Farm, row: ProducerDecisionHistory) -> FarmStatusResult:
    return FarmStatusResult(
        farm_id=farm.id,
        status=farm.approval_status,
        suspend_reason=farm.suspend_reason,
        reject_reason=farm.reject_reason,
        decision_id=row.id,
        decided_at=row.decided_at,
    )


def _refuse(refusal: Refusal, **details) -> None:
    raise conflict(refusal.reason, refusal.message, **details)


def suspend_farm(db: Session, farm_id: str, raw_reason: str, manager_id: str) -> FarmStatusResult:
    reason = _reason(raw_reason)
    farm = _get_farm(db, farm_id, lock=True)
    refusal, orders = _suspend_refusal(db, farm)
    if refusal is not None:
        # 409는 멱등 기록에 JSON으로 저장되므로 날짜를 문자열로 바꾼다
        _refuse(refusal, orders=[o.model_dump(mode="json", by_alias=True) for o in orders])
    farm.approval_status = "SUSPENDED"
    farm.suspend_reason = reason
    row = _record(db, farm, "SUSPENDED", reason, manager_id)
    db.flush()
    return _result(farm, row)


def unsuspend_farm(db: Session, farm_id: str, raw_reason: str, manager_id: str) -> FarmStatusResult:
    reason = _reason(raw_reason)
    farm = _get_farm(db, farm_id, lock=True)
    refusal = _unsuspend_refusal(db, farm)
    if refusal is not None:
        _refuse(refusal)
    farm.approval_status = "APPROVED"
    farm.suspend_reason = None
    # 정지 전 승인 농가와 같게: farmclub 문의 대화방이 없으면 연다(DEV-111).
    # 다른 호출부(retire_test_farm·accounts)와 같은 지연 import
    from app.messaging.support import ensure_support_thread

    ensure_support_thread(db, farm.id)
    row = _record(db, farm, "UNSUSPENDED", reason, manager_id)
    db.flush()
    return _result(farm, row)


def revert_rejection(
    db: Session, farm_id: str, raw_reason: str, manager_id: str
) -> FarmStatusResult:
    reason = _reason(raw_reason)
    farm = _get_farm(db, farm_id, lock=True)
    refusal = _revert_refusal(farm)
    if refusal is not None:
        _refuse(refusal)
    farm.approval_status = "PENDING"
    farm.reject_reason = None
    farm.decided_at = None
    row = _record(db, farm, "REVERTED", reason, manager_id)
    db.flush()
    return _result(farm, row)


def _act(db: Session, admin_id: str, farm_id: str, body: FarmReasonInput, key, verb: str):
    # 없는 농가는 멱등 기록·감사 전에 404(admin/farms.py와 같은 방식).
    # 상태는 run 안에서 잠그고 다시 본다
    if db.get(Farm, farm_id) is None:
        raise not_found("농가를 찾을 수 없어요.")
    run = {"suspend": suspend_farm, "unsuspend": unsuspend_farm, "revert": revert_rejection}[verb]
    return run_manager_action(
        db,
        actor_id=admin_id,
        action=f"farm.{verb}",
        target_type="farm",
        target_id=farm_id,
        scope=f"farm-{verb}:{farm_id}",
        key=key,
        body=body.model_dump(by_alias=True),
        run=lambda _: run(db, farm_id, body.reason, admin_id),
    )


@router.post("/{farm_id}/suspend", response_model=FarmStatusResult)
def suspend(db: Db, admin: Admin, farm_id: str, body: FarmReasonInput, key: IdempotencyKey = None):
    """농가 정지(R-24). 출하 전 주문이 있으면 409 FARM_HAS_OPEN_ORDERS(details.orders)."""
    return _act(db, admin.id, farm_id, body, key, "suspend")


@router.post("/{farm_id}/unsuspend", response_model=FarmStatusResult)
def unsuspend(
    db: Db, admin: Admin, farm_id: str, body: FarmReasonInput, key: IdempotencyKey = None
):
    """정지 풀기. 탈퇴 농가 409 FARM_WITHDRAWN, 테스트로 숨긴 농가 409 TEST_FARM_HIDDEN."""
    return _act(db, admin.id, farm_id, body, key, "unsuspend")


@producers_router.post("/{farm_id}/revert", response_model=FarmStatusResult)
def revert(db: Db, admin: Admin, farm_id: str, body: FarmReasonInput, key: IdempotencyKey = None):
    """반려 → 확인 중 되돌리기(R-22). 반려가 아니면 409 INVALID_TRANSITION."""
    return _act(db, admin.id, farm_id, body, key, "revert")


# ---------------- 결정 이력 ----------------

HIDE_EVENTS = {
    "test_farm.retire": "HIDDEN",
    "test_farm.restore": "RESTORED",
    "test_farm_retired": "HIDDEN",  # 서버 셸 명령(DEV-93)
    "test_farm_restored": "RESTORED",
}
_TIE = {"APPLIED": 0}


def farm_history(db: Session, farm: Farm) -> list[FarmHistoryEntry]:
    """신청·승인·반려·되돌림·정지·풀기·숨김·복구·탈퇴를 오래된 순으로."""
    items: list[FarmHistoryEntry] = []
    decisions = list(
        db.scalars(
            select(ProducerDecisionHistory)
            .where(ProducerDecisionHistory.farm_id == farm.id)
            .order_by(ProducerDecisionHistory.decided_at, ProducerDecisionHistory.id)
        )
    )
    applied = {d.application_at for d in decisions} | {farm.applied_at}
    items += [
        FarmHistoryEntry(
            kind="APPLIED",
            at=at,
            reason=None,
            actor_id=farm.producer_id,
            source="farm",
            ref_id=None,
        )
        for at in applied
    ]
    items += [
        FarmHistoryEntry(
            kind=d.decision,
            at=d.decided_at,
            reason=d.reason,
            actor_id=d.manager_id,
            source="decision",
            ref_id=d.id,
        )
        for d in decisions
    ]
    events = db.scalars(
        select(ManagerEvent)
        .where(
            ManagerEvent.target_type == "farm",
            ManagerEvent.target_id == farm.id,
            ManagerEvent.event_type.in_(tuple(HIDE_EVENTS)),
            ManagerEvent.status.in_(("SUCCEEDED", "RECOVERED")),
        )
        .order_by(ManagerEvent.created_at, ManagerEvent.id)
    )
    items += [
        FarmHistoryEntry(
            kind=HIDE_EVENTS[e.event_type],
            at=e.created_at,
            reason=RETIRE_REASON if HIDE_EVENTS[e.event_type] == "HIDDEN" else None,
            actor_id=e.actor_id,
            source="manager_event",
            ref_id=e.id,
        )
        for e in events
    ]
    producer = db.get(User, farm.producer_id)
    if producer is not None and producer.deleted_at is not None:
        items.append(
            FarmHistoryEntry(
                kind="WITHDRAWN",
                at=producer.deleted_at,
                reason=FARM_WITHDRAWN_REASON,
                actor_id=producer.id,
                source="user",
                ref_id=None,
            )
        )
    # 같은 시각이면 신청을 먼저, 나머지는 출처별로 읽은 순서(시각·ID)를 지켜 결과가 늘 같다.
    # 운영 시계는 마이크로초라 같은 시각의 결정은 사실상 없다
    items.sort(key=lambda e: (e.at, _TIE.get(e.kind, 1)))
    return items


@router.get("/{farm_id}/history", response_model=FarmHistory)
def history(db: Db, _: Admin, farm_id: str):
    farm = _get_farm(db, farm_id)
    return FarmHistory(farm_id=farm.id, status=farm.approval_status, items=farm_history(db, farm))
