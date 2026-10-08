"""orders 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.orders.models import Order

# 결제된 주문(예약한 사람 수·주문 수에 센다)
ACTIVE = ("RESERVED", "PREPARING", "SHIPPED", "DELIVERED", "COMPLETED")


def reserved_people(db: Session, product_ids: list[str]) -> dict[str, int]:
    """상품별 예약한 사람 수(reservedCount, 같은 사람의 여러 주문은 한 명)."""
    if not product_ids:
        return {}
    rows = db.execute(
        select(Order.product_id, func.count(func.distinct(Order.consumer_id)))
        .where(Order.product_id.in_(product_ids), Order.status.in_(ACTIVE))
        .group_by(Order.product_id)
    )
    return dict(rows.all())


def has_orders(db: Session, product_id: str, option_id: str | None = None) -> bool:
    query = select(Order.id).where(Order.product_id == product_id)
    if option_id is not None:
        query = query.where(Order.option_id == option_id)
    return db.scalar(query.limit(1)) is not None
