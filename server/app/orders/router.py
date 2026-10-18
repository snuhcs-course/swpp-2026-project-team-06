from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.idempotency import run_idempotent
from app.core.pagination import decode_cursor, encode_cursor, page_limit
from app.core.schemas import Paged
from app.core.security import Admin, ApprovedProducer, Consumer, CurrentUser
from app.messaging import service as messaging
from app.messaging.schemas import InquiryCreated, InquiryInput, InquiryView
from app.orders import service
from app.orders.schemas import (
    AdminRefundInput,
    Changed,
    Dashboard,
    DeliveryWindowResponse,
    HarvestStartInput,
    OrderInput,
    OrderView,
    ProducerOrder,
    RefundView,
    ShipInput,
)

router = APIRouter(prefix="/orders", tags=["orders"])
admin_router = APIRouter(prefix="/admin/orders", tags=["admin"])

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


@router.post("/{order_id}/deposit", response_model=OrderView)
def request_deposit(db: Db, user: Consumer, order_id: str, key: IdempotencyKey = None):
    """입금 안내(FEAT-09 개정). 물량 선점과 입금 대기 전환은 한 번만 일어난다(AC-09-1·3)."""
    return run_idempotent(
        db,
        user.id,
        f"deposit:{order_id}",
        key,
        {},
        lambda: service.request_deposit(db, user.id, order_id),
    )


@router.post("/{order_id}/deposit-reported", response_model=OrderView)
def deposit_reported(db: Db, user: Consumer, order_id: str):
    """소비자 '입금했어요' 신호. 상태는 바뀌지 않는다."""
    result = service.report_deposit(db, user.id, order_id)
    db.commit()
    return result


@router.post("/{order_id}/confirm-deposit", response_model=ProducerOrder)
def confirm_deposit(db: Db, producer: ApprovedProducer, order_id: str):
    """생산자가 통장과 대조한 뒤 입금을 확인한다(AC-09-8). 입금 대기 → 예약 완료."""
    _, farm = producer
    order = service.confirm_deposit(db, order_id, farm_id=farm.id, confirmed_by="PRODUCER")
    db.commit()
    return service.producer_order_view(db, order)


@router.post("/{order_id}/refund-settled", response_model=ProducerOrder)
def refund_settled(db: Db, producer: ApprovedProducer, order_id: str):
    """농가가 입금했던 계좌로 환불 송금을 마쳤다고 표시한다(AC-17-7)."""
    _, farm = producer
    result = service.settle_refund(db, farm.id, order_id)
    db.commit()
    return result


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


@admin_router.post("/{order_id}/delivered", response_model=OrderView)
def mark_delivered(db: Db, admin: Admin, order_id: str, key: IdempotencyKey = None):
    from app.admin.service import run_manager_action

    return run_manager_action(
        db,
        actor_id=admin.id,
        action="order.deliver",
        target_type="order",
        target_id=order_id,
        scope=f"order-deliver:{order_id}",
        key=key,
        body={},
        run=lambda _: service.mark_delivered(db, order_id),
    )


@admin_router.post("/{order_id}/refund", response_model=OrderView)
def refund_order(
    db: Db,
    admin: Admin,
    order_id: str,
    body: AdminRefundInput,
    key: IdempotencyKey = None,
):
    from app.admin.service import run_manager_action

    raw = body.model_dump(by_alias=True, exclude_none=True)
    return run_manager_action(
        db,
        actor_id=admin.id,
        action="order.refund",
        target_type="order",
        target_id=order_id,
        scope=f"order-refund:{order_id}",
        key=key,
        body=raw,
        run=lambda event_id: service.admin_refund(
            db, order_id, body.reason, body.amount, admin.id, event_id
        ),
    )


@admin_router.post("/{order_id}/confirm-deposit", response_model=OrderView)
def admin_confirm_deposit(db: Db, admin: Admin, order_id: str, key: IdempotencyKey = None):
    from app.admin.service import run_manager_action

    def run(_):
        order = service.confirm_deposit(db, order_id, farm_id=None, confirmed_by="ADMIN")
        return service.order_view(db, order)

    return run_manager_action(
        db,
        actor_id=admin.id,
        action="order.confirm_deposit",
        target_type="order",
        target_id=order_id,
        scope=f"order-confirm-deposit:{order_id}",
        key=key,
        body={},
        run=run,
    )


@admin_router.post("/expire-deposits", response_model=Changed)
def expire_deposits(db: Db, _: Admin):
    """기한이 지난 입금 대기 주문을 일괄 취소하고 물량을 돌려준다(R-28)."""
    changed = service.expire_overdue_deposits(db)
    db.commit()
    return Changed(changed=changed)


@admin_router.get("/{order_id}/refunds", response_model=list[RefundView])
def refunds(db: Db, _: Admin, order_id: str):
    return service.refund_history(db, order_id)
