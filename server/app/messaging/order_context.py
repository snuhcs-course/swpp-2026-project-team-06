"""Current paid-order eligibility; a stored link alone never grants access."""

from sqlalchemy import select, union
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.messaging.models import OrderInquiry, Thread, ThreadOrderContext
from app.orders import service as orders


def require_paid_order(db: Session, consumer_id: str, farm_id: str, order_id: str):
    order = orders.get_paid_order_of(db, consumer_id, order_id)
    if order is None or not orders.order_belongs_to_farm(db, order, farm_id):
        raise not_found("결제한 본인 주문만 문의할 수 있어요.")
    return order


def eligible_order_ids(db: Session, thread: Thread) -> list[str]:
    """Read-only, including legitimate historical inquiries without backfill."""
    recorded = db.scalars(
        union(
            select(ThreadOrderContext.order_id).where(ThreadOrderContext.thread_id == thread.id),
            select(OrderInquiry.order_id).where(OrderInquiry.thread_id == thread.id),
        )
    )
    result = []
    for order_id in recorded:
        order = orders.get_paid_order_of(db, thread.consumer_id, order_id)
        if order is not None and orders.order_belongs_to_farm(db, order, thread.farm_id):
            result.append(order_id)
    return sorted(result)


def has_order_context(db: Session, thread: Thread) -> bool:
    return bool(eligible_order_ids(db, thread))
