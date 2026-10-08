from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.idempotency import run_idempotent
from app.core.pagination import decode_cursor, encode_cursor, page_limit
from app.core.schemas import Paged
from app.core.security import ApprovedProducer, Consumer, CurrentUser
from app.messaging import service as messaging
from app.messaging.schemas import InquiryCreated, InquiryInput, InquiryView
from app.orders import service
from app.orders.schemas import (
    Changed,
    Dashboard,
    DeliveryWindowResponse,
    HarvestStartInput,
    OrderInput,
    OrderView,
    PayInput,
    PayResult,
    ProducerOrder,
    ShipInput,
)

router = APIRouter(prefix="/orders", tags=["orders"])

Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


def _page(items: list, cursor: str | None, limit: int) -> Paged:
    offset = int((decode_cursor(cursor) or [0])[0])
    page = items[offset : offset + limit]
    next_cursor = encode_cursor([offset + limit]) if offset + limit < len(items) else None
    return Paged(items=page, next_cursor=next_cursor)


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


@router.get("/producer", response_model=Paged[ProducerOrder])
def producer_orders(
    db: Db,
    producer: ApprovedProducer,
    limit: Annotated[int, Depends(page_limit)],
    cursor: str | None = None,
    status: str | None = None,
    product_id: str | None = None,
):
    _, farm = producer
    return _page(service.producer_orders(db, farm.id, status, product_id), cursor, limit)


@router.post("/producer/harvest-start", response_model=Changed)
def harvest_start(db: Db, producer: ApprovedProducer, body: HarvestStartInput):
    _, farm = producer
    result = service.harvest_start(db, farm.id, body.product_id)
    db.commit()
    return result


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


@router.get("", response_model=Paged[OrderView])
def list_orders(
    db: Db,
    user: Consumer,
    limit: Annotated[int, Depends(page_limit)],
    cursor: str | None = None,
):
    return _page(service.list_orders(db, user.id), cursor, limit)


@router.post("/{order_id}/cancel", response_model=OrderView)
def cancel_order(db: Db, user: Consumer, order_id: str):
    result = service.cancel_order(db, user.id, order_id)
    db.commit()
    return result


@router.post("/{order_id}/confirm", response_model=OrderView)
def confirm_order(db: Db, user: Consumer, order_id: str):
    result = service.confirm_order(db, user.id, order_id)
    db.commit()
    return result


@router.post("/{order_id}/delivery-window-response", response_model=OrderView)
def delivery_window_response(
    db: Db, user: Consumer, order_id: str, body: DeliveryWindowResponse
):
    result = service.respond_delivery_window(db, user.id, order_id, body.choice)
    db.commit()
    return result


@router.post("/{order_id}/ship", response_model=ProducerOrder)
def ship_order(
    db: Db,
    producer: ApprovedProducer,
    order_id: str,
    body: ShipInput,
):
    _, farm = producer
    result = service.ship_order(db, farm.id, order_id, body.tracking_number, body.carrier)
    db.commit()
    return result


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
