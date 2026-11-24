"""AC-ENG-1~4: derive participation from canonical, committed domain records."""

from collections import Counter
from datetime import timedelta

from sqlalchemy import case, distinct, exists, func, select
from sqlalchemy.orm import Session, aliased

from app.accounts.models import User
from app.catalog.models import Product
from app.core.clock import now
from app.core.errors import conflict, invalid, not_found
from app.core.ids import new_id
from app.core.pagination import decode_cursor, encode_cursor
from app.core.schemas import Paged
from app.engagement.models import CustomerReview, FarmReport, FollowReceipt
from app.engagement.schemas import (
    Achievement,
    Achievements,
    ReportDecision,
    ReportRecord,
    ReportView,
    ReviewView,
    Temperature,
)
from app.farms.models import Farm, Follow
from app.messaging.models import Broadcast, Reaction, RoomReply, Thread, ThreadMessage
from app.orders.models import Order

VALID_CONSUMER = (User.role == "CONSUMER", User.deleted_at.is_(None))
VALID_PURCHASE = (
    Order.status == "COMPLETED",
    Order.completed_at.is_not(None),
    Order.refunded_at.is_(None),
)


def approved_farm(db: Session, farm_id: str, *, lock: bool = False) -> Farm:
    query = select(Farm).where(Farm.id == farm_id, Farm.approval_status == "APPROVED")
    farm = db.scalar(query.with_for_update() if lock else query)
    if farm is None:
        raise not_found("찾을 수 없는 농가예요.")
    return farm


def follow_receipt(
    db: Session, consumer_id: str, farm_id: str, *, was_following: bool, on: bool
) -> tuple[FollowReceipt | None, bool]:
    """Caller holds Farm's row lock. Receipt survives unfollow and retries."""
    receipt = db.get(FollowReceipt, (consumer_id, farm_id))
    first = on and not was_following and receipt is None
    if on and receipt is None:
        number = db.scalar(
            select(func.coalesce(func.max(FollowReceipt.fan_number), 0)).where(
                FollowReceipt.farm_id == farm_id
            )
        )
        receipt = FollowReceipt(
            consumer_id=consumer_id, farm_id=farm_id, fan_number=number + 1, created_at=now()
        )
        db.add(receipt)
        db.flush()
    return receipt, first


def clamp_temperature(contributions: dict[str, int]) -> int:
    """Clamp only the final sum, retaining contributions beyond either boundary."""
    return min(990, max(0, 365 + sum(contributions[k] for k in "FPLHR") - contributions["M"]))


def temperature(db: Session, farm_id: str) -> Temperature:
    approved_farm(db, farm_id)
    instant = now()
    since = instant - timedelta(days=28)
    follows = db.scalar(
        select(func.count(distinct(Follow.consumer_id)))
        .join(User, User.id == Follow.consumer_id)
        .where(Follow.farm_id == farm_id, *VALID_CONSUMER)
    )
    # At most 29 distinct days cross the inclusive rolling window. Count a day once,
    # then cap each KST Monday-based week; edits and multiple posts cannot inflate it.
    days = db.scalars(
        select(func.date(func.timezone("Asia/Seoul", Broadcast.created_at)))
        .where(
            Broadcast.farm_id == farm_id,
            Broadcast.deleted_at.is_(None),
            Broadcast.visibility == "PUBLIC",
            Broadcast.created_at.between(since, instant),
        )
        .distinct()
    )
    weeks = Counter(day - timedelta(days=day.weekday()) for day in days)
    posts = sum(min(3, count) for count in weeks.values())
    likes = db.scalar(
        select(func.count(distinct(Reaction.user_id)))
        .join(Broadcast, Broadcast.id == Reaction.broadcast_id)
        .join(User, User.id == Reaction.user_id)
        .where(
            Broadcast.farm_id == farm_id,
            Broadcast.deleted_at.is_(None),
            Reaction.created_at.between(since, instant),
            *VALID_CONSUMER,
        )
    )
    earlier = aliased(ThreadMessage)
    human = db.scalar(
        select(func.count(distinct(Thread.consumer_id)))
        .join(ThreadMessage, ThreadMessage.thread_id == Thread.id)
        .join(User, User.id == Thread.consumer_id)
        .where(
            Thread.farm_id == farm_id,
            ThreadMessage.sender_type == "PRODUCER",
            ThreadMessage.created_at.between(since, instant),
            exists(
                select(earlier.id).where(
                    earlier.thread_id == Thread.id,
                    earlier.sender_type == "CONSUMER",
                    earlier.seq < ThreadMessage.seq,
                    earlier.created_at <= ThreadMessage.created_at,
                )
            ),
            *VALID_CONSUMER,
        )
    )
    reviews = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    case((CustomerReview.stars >= 4, 1), (CustomerReview.stars <= 2, -1), else_=0)
                ),
                0,
            )
        )
        .join(Order, Order.id == CustomerReview.order_id)
        .join(Product, Product.id == Order.product_id)
        .join(User, User.id == Order.consumer_id)
        .where(Product.farm_id == farm_id, *VALID_PURCHASE, *VALID_CONSUMER)
    )
    reports = db.scalar(
        select(func.count(distinct(FarmReport.incident_key))).where(
            FarmReport.farm_id == farm_id, FarmReport.status == "CONFIRMED"
        )
    )
    parts = dict(
        F=min(100, follows), P=posts, L=min(30, likes), H=min(30, human), R=reviews, M=reports
    )
    return Temperature(
        temperature_tenths=clamp_temperature(parts), contributions=parts, calculated_at=instant
    )


def _own_order(db: Session, consumer_id: str, order_id: str, *, lock: bool = False) -> Order:
    query = select(Order).where(Order.id == order_id, Order.consumer_id == consumer_id)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise not_found("찾을 수 없는 주문이에요.")
    return row


def _reviewable(order: Order) -> bool:
    return (
        order.status == "COMPLETED" and order.completed_at is not None and order.refunded_at is None
    )


def get_review(db: Session, consumer_id: str, order_id: str) -> ReviewView:
    order = _own_order(db, consumer_id, order_id)
    row = db.get(CustomerReview, order_id)
    return ReviewView(order_id=order_id, stars=row.stars if row and _reviewable(order) else None)


def save_review(db: Session, consumer_id: str, order_id: str, stars: int) -> ReviewView:
    # Lock the order, the same row that completion/refund mutates, also serializing upserts.
    order = _own_order(db, consumer_id, order_id, lock=True)
    if not _reviewable(order):
        raise conflict("REVIEW_NOT_AVAILABLE", "구매가 확정된 주문에만 후기를 남길 수 있어요.")
    row = db.get(CustomerReview, order_id)
    if row is None:
        row = CustomerReview(order_id=order_id, stars=stars, created_at=now(), updated_at=now())
        db.add(row)
    else:
        row.stars = stars
        row.updated_at = now()
    db.flush()
    return ReviewView(order_id=order_id, stars=row.stars)


def submit_report(db: Session, consumer_id: str, farm_id: str, reason: str) -> ReportView:
    approved_farm(db, farm_id, lock=True)
    row = db.scalar(
        select(FarmReport).where(
            FarmReport.consumer_id == consumer_id, FarmReport.farm_id == farm_id
        )
    )
    if row is None:
        row = FarmReport(
            id=new_id("report"),
            consumer_id=consumer_id,
            farm_id=farm_id,
            reason=reason,
            status="PENDING",
            created_at=now(),
        )
        db.add(row)
        db.flush()
    return ReportView(report_id=row.id, status=row.status)


def moderate_report(
    db: Session, report_id: str, admin_id: str, decision: ReportDecision
) -> ReportView:
    row = db.scalar(select(FarmReport).where(FarmReport.id == report_id).with_for_update())
    if row is None:
        raise not_found("찾을 수 없는 신고예요.")
    row.status = decision.status
    row.incident_key = decision.incident_key if decision.status == "CONFIRMED" else row.incident_key
    row.reviewed_by = admin_id
    row.reviewed_at = now()
    db.flush()
    return ReportView(report_id=row.id, status=row.status)


def achievements(db: Session, consumer_id: str) -> Achievements:
    def has(query) -> bool:
        return bool(db.scalar(select(exists(query))))

    followed = has(
        select(Follow.consumer_id)
        .join(Farm, Farm.id == Follow.farm_id)
        .where(Follow.consumer_id == consumer_id, Farm.approval_status == "APPROVED")
    )
    reacted = has(
        select(Reaction.user_id)
        .join(Broadcast, Broadcast.id == Reaction.broadcast_id)
        .where(Reaction.user_id == consumer_id, Broadcast.deleted_at.is_(None))
    )
    messaged = has(
        select(ThreadMessage.id)
        .join(Thread, Thread.id == ThreadMessage.thread_id)
        .where(Thread.consumer_id == consumer_id, ThreadMessage.sender_type == "CONSUMER")
    ) or has(select(RoomReply.id).where(RoomReply.consumer_id == consumer_id))
    purchased = has(select(Order.id).where(Order.consumer_id == consumer_id, *VALID_PURCHASE))
    reviewed = has(
        select(CustomerReview.order_id)
        .join(Order, Order.id == CustomerReview.order_id)
        .where(Order.consumer_id == consumer_id, *VALID_PURCHASE)
    )
    definitions = [
        ("first_follow", "첫 팔로우", "마음에 드는 농가를 팔로우해요", followed, "/farms"),
        (
            "first_reaction",
            "첫 소식 공감",
            "농가의 소식에 좋아요를 남겨요",
            reacted,
            "/chats?view=news",
        ),
        ("first_message", "첫 인사", "농가에 첫 인사를 건네요", messaged, "/chats"),
        ("first_purchase", "첫 상품 구매", "상품을 받고 구매를 확정해요", purchased, "/orders"),
        ("first_review", "첫 구매 후기", "구매한 상품에 별점을 남겨요", reviewed, "/orders"),
    ]
    tasks = [
        Achievement(
            id=id_,
            title=title,
            description=description,
            completed=done,
            progress=int(done),
            action=action,
        )
        for id_, title, description, done, action in definitions
    ]
    return Achievements(tasks=tasks, completed_count=sum(task.completed for task in tasks))


def list_reports(db: Session, status: str, limit: int, cursor: str | None) -> Paged[ReportRecord]:
    values = decode_cursor(cursor)
    if values is not None and (len(values) != 1 or type(values[0]) is not int or values[0] < 0):
        raise invalid({"cursor": "잘못된 cursor예요"})
    offset = values[0] if values else 0
    rows = list(
        db.scalars(
            select(FarmReport)
            .where(FarmReport.status == status)
            .order_by(FarmReport.created_at, FarmReport.id)
            .offset(offset)
            .limit(limit + 1)
        )
    )
    return Paged(
        items=[
            ReportRecord(
                report_id=row.id,
                status=row.status,
                farm_id=row.farm_id,
                reason=row.reason,
                incident_key=row.incident_key,
                created_at=row.created_at,
                reviewed_at=row.reviewed_at,
            )
            for row in rows[:limit]
        ],
        next_cursor=encode_cursor([offset + limit]) if len(rows) > limit else None,
    )
