"""Last producer action rollback, guarded by the current persisted state (DEV-455)."""

from collections.abc import Callable
from datetime import UTC, date, datetime

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin.models import ManagerEvent
from app.core.clock import now
from app.core.errors import conflict, not_found
from app.core.ids import new_id
from app.orders.models import Order, Payment, Refund
from app.orders.schemas import ProducerOrder, ProducerOrderUndo

EVENT = "orders.producer_action"
LABELS = {
    "confirm_deposit": "입금 확인",
    "reject_deposit": "입금 미승인",
    "cancel_deposit": "미승인 주문 취소",
    "ship": "출하 처리",
    "refund_issue": "환불 미승인",
    "refund_settled": "환불 완료 표시",
}
# Only transaction state is retained. Addresses, phones and recipient names are not copied.
STATE_FIELDS = (
    "status",
    "paid_at",
    "shipped_at",
    "delivered_at",
    "completed_at",
    "refunded_at",
    "refund_reason",
    "released_quantity",
    "quantity",
    "deposit_code",
    "deposit_due_at",
    "deposit_reported_at",
    "deposit_confirmed_by",
    "cancel_reason",
    "deposit_issue",
    "deposit_issue_at",
    "refund_issue",
    "refund_issue_at",
    "carrier",
    "tracking_number",
    "tracking_version",
    "delivery_start",
    "delivery_end",
    "proposed_delivery_start",
    "proposed_delivery_end",
)
DATE_FIELDS = {"delivery_start", "delivery_end", "proposed_delivery_start", "proposed_delivery_end"}
PAYMENT_FIELDS = ("id", "status", "amount", "method", "provider", "approved_at")


_UNREAD = object()


def _snapshot(db: Session, order: Order, payment=_UNREAD, refunds=_UNREAD) -> dict:
    """거래 상태 스냅샷. 목록은 결제·환불을 미리 묶어 읽어 넘긴다(N+1 방지)."""
    if payment is _UNREAD:
        payment = db.scalar(select(Payment).where(Payment.order_id == order.id))
    if refunds is _UNREAD:
        refunds = db.scalars(select(Refund).where(Refund.order_id == order.id).order_by(Refund.id))
    return jsonable_encoder(
        {
            "order": {key: getattr(order, key) for key in STATE_FIELDS},
            "payment": {key: getattr(payment, key) for key in PAYMENT_FIELDS} if payment else None,
            "refunds": [{"id": row.id, "settled_at": row.settled_at} for row in refunds],
        },
        custom_encoder={datetime: lambda value: value.astimezone(UTC).isoformat()},
    )


def _latest(db: Session, order_id: str) -> ManagerEvent | None:
    # A new action supersedes its predecessor under the order lock. No timestamp tie-breaker.
    return db.scalar(
        select(ManagerEvent).where(
            ManagerEvent.event_type == EVENT,
            ManagerEvent.target_type == "order",
            ManagerEvent.target_id == order_id,
            ManagerEvent.status == "SUCCEEDED",
        )
    )


class _Preload:
    """목록용 묶음 읽기: 취소 주문의 상품과 농가별 입금자명을 한 번씩만 읽는다."""

    def __init__(self, db: Session, products: dict):
        self.db, self.products, self._codes = db, products, {}

    def code_owners(self, farm_id: str) -> dict[str, set[str]]:
        from app.orders import service

        if farm_id not in self._codes:
            self._codes[farm_id] = service.deposit_code_owners(self.db, farm_id)
        return self._codes[farm_id]


def _restore_blocker(
    db: Session,
    order: Order,
    farm_id: str,
    state: dict,
    *,
    lock: bool,
    preload: _Preload | None = None,
) -> str | None:
    """입금 대기로 되돌릴 수 없는 이유.

    목록 표시(잠금 없음, 묶음 읽기)와 실제 실행 취소(잠금)가 같은 규칙을 쓴다.
    """
    from app.catalog import service as catalog
    from app.orders import service

    if state["status"] != "AWAITING_DEPOSIT":
        return None
    if order.status == "CANCELED":
        # 취소를 되돌리면 다시 물량을 잡고 입금을 받는다. 그사이 판매가 멈췄거나
        # 판매 기간이 바뀐 상품이면 되돌리지 않는다(입금 요청과 같은 판매 중 확인)
        item = (
            preload.products.get(order.product_id)
            if preload is not None
            else catalog.load_product(db, order.product_id)
        )
        current = catalog.current_stage(item) if item else None
        if (
            item is None
            or item.product.sales_paused
            or item.product.status != "PUBLISHED"
            or current is None
            or current.id != order.stage_id
        ):
            return "판매가 끝난 상품이라 되돌릴 수 없어요."
    due = _value("deposit_due_at", state["deposit_due_at"])
    if due is not None and due <= now() and state["deposit_reported_at"] is None:
        return "입금 기한이 지나 입금 대기로 되돌릴 수 없어요."
    code = state["deposit_code"]
    if not code:
        return None
    if preload is not None and not lock:
        taken = preload.code_owners(farm_id).get(code.casefold(), set()) - {order.id}
    else:
        read = service.used_deposit_codes if lock else service.taken_deposit_codes
        taken = code.casefold() in {c.casefold() for c in read(db, order, farm_id)}
    if taken:
        return "같은 입금자명을 쓰는 다른 주문이 있어 되돌릴 수 없어요."
    return None


def current_action(db: Session, order: Order) -> ProducerOrderUndo | None:
    return _offer(db, order, _latest(db, order.id))


def current_actions(db: Session, orders: list[Order]) -> dict[str, ProducerOrderUndo | None]:
    """목록용: 이벤트·결제·환불을 주문 묶음으로 한 번씩 읽고 같은 규칙으로 판단한다."""
    ids = [order.id for order in orders]
    if not ids:
        return {}
    events = {
        row.target_id: row
        for row in db.scalars(
            select(ManagerEvent).where(
                ManagerEvent.event_type == EVENT,
                ManagerEvent.target_type == "order",
                ManagerEvent.target_id.in_(ids),
                ManagerEvent.status == "SUCCEEDED",
            )
        )
    }
    with_events = [order.id for order in orders if order.id in events]
    payments, refunds = {}, {}
    if with_events:
        payments = {
            row.order_id: row
            for row in db.scalars(select(Payment).where(Payment.order_id.in_(with_events)))
        }
        for row in db.scalars(
            select(Refund).where(Refund.order_id.in_(with_events)).order_by(Refund.id)
        ):
            refunds.setdefault(row.order_id, []).append(row)
    from app.catalog import service as catalog
    from app.catalog.models import Product

    canceled = {
        order.product_id
        for order in orders
        if order.id in events and order.status == "CANCELED"
    }
    products = {}
    if canceled:
        rows = list(db.scalars(select(Product).where(Product.id.in_(canceled))))
        products = {item.product.id: item for item in catalog.load_products(db, rows)}
    preload = _Preload(db, products)
    return {
        order.id: _offer(
            db,
            order,
            events.get(order.id),
            payments.get(order.id),
            refunds.get(order.id, []),
            preload=preload,
        )
        if order.id in events
        else None
        for order in orders
    }


def _offer(
    db: Session,
    order: Order,
    event: ManagerEvent | None,
    payment=_UNREAD,
    refunds=_UNREAD,
    *,
    preload: _Preload | None = None,
) -> ProducerOrderUndo | None:
    if event is None or event.result["after"] != _snapshot(db, order, payment, refunds):
        return None
    # 눌러도 409가 날 처리는 내주지 않는다(기한 지남·입금자명 겹침·판매 끝)
    farm_id = event.scope.removeprefix("producer-order:")
    before = event.result["before"]["order"]
    if _restore_blocker(db, order, farm_id, before, lock=False, preload=preload):
        return None
    return ProducerOrderUndo(
        action_id=event.id,
        label=LABELS[event.request_summary["action"]],
        previous_status=event.result["before"]["order"]["status"],
        created_at=event.created_at,
    )


def _locked_order(db: Session, farm_id: str, order_id: str) -> Order:
    from app.catalog import service as catalog
    from app.orders import service

    existing = db.get(Order, order_id)
    if existing is None or not service.order_belongs_to_farm(db, existing, farm_id):
        raise not_found("주문을 찾을 수 없어요.")
    catalog.lock_product(db, existing.product_id)
    return db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def record_action(
    db: Session,
    farm_id: str,
    actor_id: str,
    order_id: str,
    kind: str,
    run: Callable[[], object],
) -> ProducerOrder:
    from app.orders import service

    order = _locked_order(db, farm_id, order_id)
    before = _snapshot(db, order)
    run()
    db.flush()
    after = _snapshot(db, order)
    if before != after:
        old = _latest(db, order_id)
        if old is not None:
            old.status = "SUPERSEDED"
            old.updated_at = now()
        db.add(
            ManagerEvent(
                id=new_id("evt"),
                event_type=EVENT,
                actor_id=actor_id,
                target_type="order",
                target_id=order_id,
                scope=f"producer-order:{farm_id}",
                request_summary={"action": kind, "farmId": farm_id},
                status="SUCCEEDED",
                retryable=False,
                attempts=1,
                result={"before": before, "after": after},
                created_at=now(),
                updated_at=now(),
            )
        )
        db.flush()
    return service.producer_order_view(db, order)


def _value(field: str, value):
    if value is not None and field.endswith("_at"):
        return datetime.fromisoformat(value)
    if value is not None and field in DATE_FIELDS:
        return date.fromisoformat(value)
    return value


def undo_action(db: Session, farm_id: str, actor_id: str, order_id: str, action_id: str) -> dict:
    from app.catalog import service as catalog
    from app.farms.service import get_farm_shared

    order = _locked_order(db, farm_id, order_id)
    farm = get_farm_shared(db, farm_id)
    if farm is None or farm.approval_status != "APPROVED":
        raise not_found("판매 중인 농가의 주문만 되돌릴 수 있어요.")
    event = db.get(ManagerEvent, action_id)
    if (
        event is None
        or event.event_type != EVENT
        or event.target_id != order_id
        or event.scope != f"producer-order:{farm_id}"
    ):
        raise not_found("되돌릴 처리를 찾을 수 없어요.")
    if event.status == "UNDONE":
        return {"orderId": order_id, "actionId": action_id}
    if event.status != "SUCCEEDED" or event.result["after"] != _snapshot(db, order):
        raise conflict(
            "UNDO_CONFLICT", "다른 처리가 이어져 실행 취소할 수 없어요. 최신 주문을 확인해 주세요."
        )

    before, after = event.result["before"], event.result["after"]
    state = before["order"]
    blocker = _restore_blocker(db, order, farm_id, state, lock=True)
    if blocker:
        raise conflict("UNDO_CONFLICT", blocker)

    reclaim = after["order"]["released_quantity"] - state["released_quantity"]
    if reclaim > 0:
        item = catalog.load_product(db, order.product_id)
        allocation = catalog.lock_allocation(db, order.stage_id, order.option_id)
        if (
            allocation.quantity - allocation.reserved_count < reclaim
            or catalog.sales_state(db, item).remaining_grams < reclaim * order.unit_weight_grams
        ):
            raise conflict("UNDO_CONFLICT", "남은 물량이 부족해 주문 취소를 되돌릴 수 없어요.")
        allocation.reserved_count += reclaim

    tracking_version = order.tracking_version
    for field in STATE_FIELDS:
        setattr(order, field, _value(field, state[field]))
    if event.request_summary["action"] == "ship":
        order.tracking_version = tracking_version + 1

    payment = db.scalar(select(Payment).where(Payment.order_id == order_id).with_for_update())
    if before["payment"] is None:
        if payment is not None:
            payment.status = "REVERSED"
    else:
        for field in PAYMENT_FIELDS:
            if field != "id":
                setattr(payment, field, _value(field, before["payment"][field]))
    for row in before["refunds"]:
        refund = db.get(Refund, row["id"])
        refund.settled_at = _value("settled_at", row["settled_at"])

    event.status = "UNDONE"
    event.updated_at = event.resolved_at = now()
    event.resolved_by = actor_id
    db.add(
        ManagerEvent(
            id=new_id("evt"),
            event_type="orders.producer_action_undone",
            actor_id=actor_id,
            target_type="order",
            target_id=order_id,
            request_summary={"actionId": action_id, "action": event.request_summary["action"]},
            status="SUCCEEDED",
            retryable=False,
            attempts=1,
            result={"restoredStatus": order.status},
            created_at=now(),
            updated_at=now(),
        )
    )
    db.flush()
    return {"orderId": order_id, "actionId": action_id}
