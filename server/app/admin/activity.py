"""관리자 사용자 활동 로그 `GET /admin/users/{userId}/activity`(DEV-307, FEAT-23 AC-23-9·10).

사용자 상세(`user_detail.py`, DEV-303이 상품을 더하는 중)와 따로 둔 형제 경로다.

서버 기록(시각만, 본문 없음)과 PostHog 이벤트를 함께 준다.
- 가입, 동의(항목·버전), 법정 안내 읽음, 탈퇴
- 생산자: 농가 결정 이력(신청·승인·반려·되돌림·정지·풀기·숨김·복구, farm_status.farm_history),
  상품 마지막 수정(지금 상태), 공급 물량 신청·결정, 받은 주문, farmclub 문의 메시지
- 소비자: 주문(생성·입금 확인·출고·배송 완료·구매 확정·환불), farmclub 문의 메시지
- 운영 검증 계정 표시·해제(manager_events)
상품 생성 시각은 저장하지 않아(열 없음) 마지막 수정 시각만 보인다. 최신순, 서버 기록 SERVER_LIMIT개.
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import NoticeRead, User, UserConsent
from app.accounts.service import account_kind
from app.admin.farm_status import farm_history
from app.admin.models import ManagerEvent
from app.admin.posthog_events import PosthogActivity, person_events
from app.catalog.models import CapacityRequest, Product
from app.core.db import get_db
from app.core.errors import not_found
from app.core.schemas import CamelModel
from app.core.security import Admin
from app.farms.models import Farm
from app.messaging.models import SupportMessage, SupportThread, Thread, ThreadMessage
from app.messaging.support import SUPPORT_USER_ID
from app.orders.models import Order

router = APIRouter(prefix="/admin/users", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
SERVER_LIMIT = 300
# 테이블마다 최근 N행만 읽는다(한 사용자 화면이라 이 정도면 충분하다)
PER_SOURCE = 200

Category = Literal["account", "farm", "product", "order", "support", "operator"]


class ActivityItem(CamelModel):
    at: datetime
    category: Category
    kind: str
    ref_type: str | None = None
    ref_id: str | None = None
    meta: dict[str, Any] = {}


class UserActivity(CamelModel):
    user_id: str
    role: str
    account_kind: str
    withdrawn: bool
    items: list[ActivityItem]
    truncated: bool
    posthog: PosthogActivity


def _account(db: Session, user: User) -> list[ActivityItem]:
    items = [ActivityItem(at=user.created_at, category="account", kind="SIGNUP")]
    for c in db.scalars(select(UserConsent).where(UserConsent.user_id == user.id)):
        items.append(
            ActivityItem(
                at=c.agreed_at,
                category="account",
                kind="CONSENT",
                meta={"consent": c.kind, "version": c.version, "agreed": c.agreed},
            )
        )
    for n in db.scalars(select(NoticeRead).where(NoticeRead.user_id == user.id)):
        items.append(
            ActivityItem(
                at=n.read_at,
                category="account",
                kind="NOTICE_READ",
                meta={"notice": n.kind, "version": n.version},
            )
        )
    if user.deleted_at is not None:
        items.append(ActivityItem(at=user.deleted_at, category="account", kind="WITHDRAWN"))
    return items


def _operator(db: Session, user: User) -> list[ActivityItem]:
    labels = {"ops_tester.mark": "OPS_TESTER_MARKED", "ops_tester.unmark": "OPS_TESTER_UNMARKED"}
    rows = db.scalars(
        select(ManagerEvent)
        .where(
            ManagerEvent.target_type == "user",
            ManagerEvent.target_id == user.id,
            ManagerEvent.event_type.in_(tuple(labels)),
            ManagerEvent.status.in_(("SUCCEEDED", "RECOVERED")),
        )
        .order_by(ManagerEvent.created_at.desc())
        .limit(PER_SOURCE)
    )
    return [
        ActivityItem(
            at=e.created_at,
            category="operator",
            kind=labels[e.event_type],
            ref_type="manager_event",
            ref_id=e.id,
            meta={"actorId": e.actor_id},
        )
        for e in rows
    ]


def _farm(db: Session, farm: Farm) -> list[ActivityItem]:
    items = [
        ActivityItem(
            at=h.at,
            category="farm",
            kind=f"FARM_{h.kind}",
            ref_type="farm",
            ref_id=farm.id,
            meta={"reason": h.reason, "actorId": h.actor_id},
        )
        for h in farm_history(db, farm)
        if h.kind != "WITHDRAWN"  # 계정 탈퇴로 이미 보인다
    ]
    for p in db.scalars(
        select(Product)
        .where(Product.farm_id == farm.id)
        .order_by(Product.updated_at.desc())
        .limit(PER_SOURCE)
    ):
        items.append(
            ActivityItem(
                at=p.updated_at,
                category="product",
                kind="PRODUCT_UPDATED",
                ref_type="product",
                ref_id=p.id,
                meta={"name": p.name, "status": p.status},
            )
        )
    for r, name in db.execute(
        select(CapacityRequest, Product.name)
        .join(Product, Product.id == CapacityRequest.product_id)
        .where(Product.farm_id == farm.id)
        .order_by(CapacityRequest.created_at.desc())
        .limit(PER_SOURCE)
    ):
        meta = {"productId": r.product_id, "productName": name, "grams": r.requested_total_grams}
        items.append(
            ActivityItem(
                at=r.created_at,
                category="product",
                kind="CAPACITY_REQUESTED",
                ref_type="capacity_request",
                ref_id=r.id,
                meta=meta,
            )
        )
        if r.decided_at is not None:
            items.append(
                ActivityItem(
                    at=r.decided_at,
                    category="product",
                    kind=f"CAPACITY_{r.status}",
                    ref_type="capacity_request",
                    ref_id=r.id,
                    meta=meta,
                )
            )
    for o, name in db.execute(
        select(Order, Product.name)
        .join(Product, Product.id == Order.product_id)
        .where(Product.farm_id == farm.id, Order.status != "PENDING_PAYMENT")
        .order_by(Order.created_at.desc())
        .limit(PER_SOURCE)
    ):
        items.append(
            ActivityItem(
                at=o.created_at,
                category="order",
                kind="ORDER_RECEIVED",
                ref_type="order",
                ref_id=o.id,
                meta={"orderNo": o.order_no, "productName": name, "status": o.status},
            )
        )
    thread = db.scalar(
        select(Thread).where(Thread.farm_id == farm.id, Thread.consumer_id == SUPPORT_USER_ID)
    )
    if thread is not None:
        for m in db.scalars(
            select(ThreadMessage)
            .where(ThreadMessage.thread_id == thread.id)
            .order_by(ThreadMessage.created_at.desc())
            .limit(PER_SOURCE)
        ):
            items.append(_support_item(m.created_at, m.sender_type, m.id, "PRODUCER"))
    return items


def _support_item(at: datetime, sender: str, message_id: str, asker: str) -> ActivityItem:
    return ActivityItem(
        at=at,
        category="support",
        kind="SUPPORT_MESSAGE" if sender == asker else "SUPPORT_REPLY",
        ref_type="support_message",
        ref_id=message_id,
        meta={"senderType": sender},
    )


ORDER_STEPS = (
    ("created_at", "ORDER_CREATED"),
    ("paid_at", "ORDER_PAID"),
    ("shipped_at", "ORDER_SHIPPED"),
    ("delivered_at", "ORDER_DELIVERED"),
    ("completed_at", "ORDER_COMPLETED"),
    ("refunded_at", "ORDER_REFUNDED"),
)


def _consumer(db: Session, user: User) -> list[ActivityItem]:
    items: list[ActivityItem] = []
    for o, name in db.execute(
        select(Order, Product.name)
        .join(Product, Product.id == Order.product_id)
        .where(Order.consumer_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(PER_SOURCE)
    ):
        meta = {"orderNo": o.order_no, "productName": name, "status": o.status}
        for field, kind in ORDER_STEPS:
            at = getattr(o, field)
            if at is not None:
                items.append(
                    ActivityItem(
                        at=at, category="order", kind=kind, ref_type="order", ref_id=o.id, meta=meta
                    )
                )
    thread = db.scalar(select(SupportThread).where(SupportThread.user_id == user.id))
    if thread is not None:
        for m in db.scalars(
            select(SupportMessage)
            .where(SupportMessage.thread_id == thread.id)
            .order_by(SupportMessage.created_at.desc())
            .limit(PER_SOURCE)
        ):
            items.append(_support_item(m.created_at, m.sender_type, m.id, "CONSUMER"))
    return items


def server_activity(db: Session, user: User) -> tuple[list[ActivityItem], bool]:
    items = _account(db, user) + _operator(db, user)
    if user.role == "PRODUCER":
        farm = db.scalar(select(Farm).where(Farm.producer_id == user.id))
        if farm is not None:
            items += _farm(db, farm)
    elif user.role == "CONSUMER":
        items += _consumer(db, user)
    items.sort(key=lambda i: i.at, reverse=True)
    return items[:SERVER_LIMIT], len(items) > SERVER_LIMIT


@router.get("/{user_id}/activity", response_model=UserActivity)
def user_activity(db: Db, _: Admin, user_id: str):
    user = db.get(User, user_id)
    if user is None:
        raise not_found("사용자를 찾을 수 없어요.")
    # PostHog 조회(최대 5초) 동안 읽기 트랜잭션을 열어 두지 않는다. 실패해도 페이지는 200
    db.commit()
    posthog = person_events(user_id)
    items, truncated = server_activity(db, user)
    return UserActivity(
        user_id=user.id,
        role=user.role,
        account_kind=account_kind(user),
        withdrawn=user.deleted_at is not None,
        items=items,
        truncated=truncated,
        posthog=posthog,
    )
