import base64
import hashlib
import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import unauthenticated
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
    PayInput,
    PaymentConfig,
    PayResult,
    PortoneWebhook,
    ProducerOrder,
    RefundView,
    ShipInput,
)

router = APIRouter(prefix="/orders", tags=["orders"])
payments_router = APIRouter(prefix="/payments", tags=["orders"])
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


@router.post("/{order_id}/pay", response_model=PayResult)
def pay(db: Db, user: Consumer, order_id: str, body: PayInput, key: IdempotencyKey = None):
    """결제 확인(FEAT-09). PortOne이면 paymentId 검증, 아니면 Mock. 차감은 한 번만(AC-09-1·3)."""
    return run_idempotent(
        db,
        user.id,
        f"pay:{order_id}",
        key,
        body,
        lambda: service.pay(db, user.id, order_id, body.mock_result, payment_id=body.payment_id),
    )


@payments_router.get("/config", response_model=PaymentConfig)
def payment_config():
    """결제 설정(SCR-11, DEV-36). PortOne 공개 키만 내려간다."""
    return service.payment_config()


def _verify_webhook_signature(request: Request, raw: bytes) -> None:
    """Standard Webhooks 서명(v1, HMAC-SHA256). 시크릿이 비어 있으면 건너뛴다(로컬 전용)."""
    secret = get_settings().portone_webhook_secret
    if not secret:
        return
    msg_id = request.headers.get("webhook-id", "")
    timestamp = request.headers.get("webhook-timestamp", "")
    signatures = request.headers.get("webhook-signature", "")
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = base64.b64encode(
        hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw, hashlib.sha256).digest()
    ).decode()
    given = [s.split(",", 1)[1] for s in signatures.split() if s.startswith("v1,")]
    if not any(hmac.compare_digest(expected, g) for g in given):
        raise unauthenticated("웹훅 서명이 맞지 않아요.")


@payments_router.post("/portone/webhook")
async def portone_webhook(db: Db, request: Request):
    """PortOne 웹훅(Transaction.Paid). 결제를 조회해 결제 전 주문을 예약 완료로. 중복은 무시."""
    raw = await request.body()
    _verify_webhook_signature(request, raw)
    body = PortoneWebhook.model_validate_json(raw)
    if body.type != "Transaction.Paid":
        return {"result": f"ignored: {body.type}"}
    result = service.portone_webhook(db, body.data.payment_id)
    db.commit()
    return {"result": result}


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
def delivery_window_response(db: Db, user: Consumer, order_id: str, body: DeliveryWindowResponse):
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


@admin_router.get("/{order_id}/refunds", response_model=list[RefundView])
def refunds(db: Db, _: Admin, order_id: str):
    return service.refund_history(db, order_id)
