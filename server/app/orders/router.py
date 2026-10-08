from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.idempotency import run_idempotent
from app.core.pagination import page_limit
from app.core.schemas import Paged
from app.core.security import ApprovedProducer, Consumer, CurrentUser
from app.messaging import service as messaging
from app.messaging.schemas import InquiryCreated, InquiryInput, InquiryView
from app.orders import service
from app.orders.schemas import Dashboard, OrderInput, OrderView, PayInput, PayResult

router = APIRouter(prefix="/orders", tags=["orders"])

Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


@router.post("", response_model=OrderView)
def create_order(db: Db, user: Consumer, body: OrderInput, key: IdempotencyKey = None):
    """예약 주문(FEAT-08). Idempotency-Key 필수, 같은 키면 처음 결과를 돌려준다."""
    return run_idempotent(
        db, user.id, "orders", key, body, lambda: service.create_order(db, user, body)
    )


@router.get("/producer/dashboard", response_model=Dashboard)
def dashboard(db: Db, producer: ApprovedProducer):
    """생산자 현황(SCR-22, FEAT-14)."""
    _, farm = producer
    return service.dashboard(db, farm)


@router.post("/{order_id}/pay", response_model=PayResult)
def pay(db: Db, user: Consumer, order_id: str, body: PayInput, key: IdempotencyKey = None):
    """Mock 결제(FEAT-09). 결제와 물량 차감은 한 번만 일어난다(AC-09-1·3)."""
    return run_idempotent(
        db,
        user.id,
        f"pay:{order_id}",
        key,
        body,
        lambda: service.pay(db, user.id, order_id, body.mock_result),
    )


@router.get("/{order_id}", response_model=OrderView)
def get_order(db: Db, user: Consumer, order_id: str):
    return service.get_order(db, user.id, order_id)


@router.post("/{order_id}/inquiries", response_model=InquiryCreated)
def create_inquiry(
    db: Db, user: Consumer, order_id: str, body: InquiryInput, key: IdempotencyKey = None
):
    """주문 문제 문의(SCR-32, FEAT-33). 본인 결제 주문만, 같은 키면 같은 문의를 돌려준다."""
    return run_idempotent(
        db,
        user.id,
        f"inquiry:{order_id}",
        key,
        body,
        lambda: messaging.create_inquiry(db, user, order_id, body),
    )


@router.get("/{order_id}/inquiries", response_model=Paged[InquiryView])
def list_inquiries(
    db: Db,
    user: CurrentUser,
    order_id: str,
    limit: Annotated[int, Depends(page_limit)],
    cursor: str | None = None,
):
    """본인 소비자 또는 그 농가 생산자만."""
    return messaging.list_inquiries(db, user, order_id, cursor, limit)
