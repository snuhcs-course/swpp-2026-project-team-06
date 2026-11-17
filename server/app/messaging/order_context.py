"""Current order eligibility; a stored link alone never grants access.

A stored context counts while its order is the consumer's own order of that farm with payment
history, or awaiting a deposit. Contexts have an origin (`source`):
- CONSUMER: the consumer's own paid-order entry (and order inquiries). These are the chat's
  linked orders (`page.orders`), so the consumer app asks which order a message is about.
- PRODUCER: a producer's '채팅하기' from an awaiting-deposit order (DEV-342). It only lets the
  buyer see and answer the chat whether or not they follow the farm; it does not switch the chat
  into order-inquiry mode.
Consumers still start order chats and file problem inquiries from paid orders only.
"""

from sqlalchemy import select, union
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.messaging.models import OrderInquiry, Thread, ThreadOrderContext
from app.orders import service as orders

PRODUCER = "PRODUCER"


def require_paid_order(
    db: Session, consumer_id: str, farm_id: str, order_id: str, *, fresh: bool = False
):
    order = orders.get_paid_order_of(db, consumer_id, order_id)
    if fresh and order is not None:
        db.refresh(order)
        order = orders.get_paid_order_of(db, consumer_id, order_id)
    if order is None or not orders.order_belongs_to_farm(db, order, farm_id):
        raise not_found("결제한 본인 주문만 문의할 수 있어요.")
    return order


def eligible_order_ids(db: Session, thread: Thread, *, sources=("CONSUMER",)) -> list[str]:
    """Read-only, including legitimate historical inquiries without backfill.

    Default: the chat's linked orders (consumer-origin contexts and inquiries).
    """
    contexts = select(ThreadOrderContext.order_id).where(
        ThreadOrderContext.thread_id == thread.id, ThreadOrderContext.source.in_(sources)
    )
    if "CONSUMER" in sources:
        query = union(
            contexts, select(OrderInquiry.order_id).where(OrderInquiry.thread_id == thread.id)
        )
    else:
        query = contexts
    recorded = db.scalars(query)
    result = []
    for order_id in recorded:
        order = orders.get_chat_order_of(db, thread.consumer_id, order_id)
        if order is not None and orders.order_belongs_to_farm(db, order, thread.farm_id):
            result.append(order_id)
    return sorted(result)


def has_order_context(db: Session, thread: Thread) -> bool:
    """Visibility without following: any current context, consumer- or producer-origin."""
    return bool(eligible_order_ids(db, thread, sources=("CONSUMER", PRODUCER)))


def has_producer_context(db: Session, thread: Thread) -> bool:
    """A producer opened this chat from the buyer's current order: the buyer may answer with
    ordinary messages even without following (DEV-342)."""
    return bool(eligible_order_ids(db, thread, sources=(PRODUCER,)))
