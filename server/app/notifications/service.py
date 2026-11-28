"""농가 주문 알림 넣기(DEV-495, FEAT-18 AC-18-1~5).

업무 모듈(orders)은 여기 함수만 부르고 외부 호출을 하지 않는다. 행은 주문 변경과 같은
트랜잭션에 savepoint로 넣는다. 넣기가 어떤 이유로 실패해도 savepoint만 되돌리고 경고 로그를
남긴 뒤 돌아간다 — 주문은 그대로 커밋된다(설계 6).
"""

import logging
import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.clock import KST, now
from app.core.config import get_settings
from app.core.ids import new_id
from app.notifications.models import Notification, NotificationSettings

logger = logging.getLogger(__name__)

ORDER_AWAITING_DEPOSIT = "ORDER_AWAITING_DEPOSIT"
DEPOSIT_REPORTED = "DEPOSIT_REPORTED"
# 휴대폰 번호(숫자만): 010·011·016·017·018·019 + 7~8자리
_MOBILE = re.compile(r"01[016789]\d{7,8}")
PRODUCT_MAX = 40


def mobile_digits(phone: str | None) -> str | None:
    """휴대폰 형식이면 숫자만 돌려준다. 아니면 None."""
    digits = "".join(ch for ch in phone or "" if ch.isdigit())
    return digits if _MOBILE.fullmatch(digits) else None


def awaiting_key(order_id: str) -> str:
    return f"order_awaiting_deposit:{order_id}"


def reported_key(order_id: str, reported_at: datetime) -> str:
    # 미승인 뒤 다시 알리면 시각이 달라 새 알림이다. 같은 시각이 늘 같은 글자가 되게 KST로 고정한다
    return f"deposit_reported:{order_id}:{reported_at.astimezone(KST).isoformat()}"


def skip_reason(db: Session, farm) -> str | None:
    """보내면 안 되는 농가면 사유. 넣을 때와 보내기 직전에 같은 검사를 한다(설계 2).

    테스트 계정 농가(시드의 가짜 번호)는 절대 보내지 않는다. `ops_tester`는 보낸다.
    """
    from app.accounts.models import User

    if farm is None:
        return "farm_missing"
    producer = db.get(User, farm.producer_id)
    if producer is None or producer.is_test_account:
        return "test_account"
    if farm.approval_status != "APPROVED":
        return "farm_not_approved"
    setting = db.get(NotificationSettings, farm.id)
    if setting is not None and not setting.order_alimtalk_enabled:
        return "farm_disabled"
    if mobile_digits(farm.contact_phone) is None:
        return "invalid_phone"
    return None


def deadline_text(value: datetime) -> str:
    """'11월 28일 오후 3시'(KST). 분이 있으면 '오후 3시 5분'."""
    local = value.astimezone(KST)
    half = "오전" if local.hour < 12 else "오후"
    hour = local.hour % 12 or 12
    minute = f" {local.minute}분" if local.minute else ""
    return f"{local.month}월 {local.day}일 {half} {hour}시{minute}"


def _order_variables(db: Session, order) -> dict[str, str]:
    from app.catalog.models import Product, ProductOption
    from app.orders.service import _short_name  # 주문 화면과 같은 상품 이름 줄이기

    product = db.get(Product, order.product_id)
    option = db.get(ProductOption, (order.product_id, order.option_id))
    name = _short_name(product.name) if product else ""
    if option is not None and option.label:
        name = f"{name} {option.label}".strip()
    return {
        "#{상품명}": name[:PRODUCT_MAX],
        "#{수량}": f"{order.quantity}박스",
        "#{입금자명}": order.deposit_code or order.order_no,
        "#{입금금액}": f"{order.total_amount:,}",
    }


def _enqueue(db: Session, *, event: str, order, farm_of, dedupe_key: str, build) -> None:
    """DB를 읽는 일(농가 찾기·검사·변수)도 모두 savepoint 안에서 한다.

    savepoint 밖에서 DB 오류가 나면 바깥 트랜잭션이 깨져 주문 커밋까지 실패하기 때문이다.
    """
    try:
        with db.begin_nested():
            farm = farm_of()
            if farm is None:
                return
            reason = skip_reason(db, farm)
            if reason is None and get_settings().notify_provider == "none":
                reason = "provider_disabled"
            at = now()
            db.execute(
                insert(Notification)
                .values(
                    id=new_id("ntf"),
                    event=event,
                    dedupe_key=dedupe_key,
                    order_id=order.id,
                    farm_id=farm.id,
                    template=event,
                    # 보내지 않을 행에는 변수(입금자명 등)를 남기지 않는다
                    variables={} if reason else build(),
                    status="SKIPPED" if reason else "PENDING",
                    skip_reason=reason,
                    attempts=0,
                    next_attempt_at=at,
                    created_at=at,
                )
                .on_conflict_do_nothing(index_elements=["dedupe_key"])
            )
    except Exception as exc:  # noqa: BLE001 — 알림 때문에 주문이 실패하면 안 된다
        logger.warning(
            "notification enqueue failed event=%s order=%s error=%s",
            event,
            order.id,
            type(exc).__name__,
        )


def order_awaiting_deposit(db: Session, order, farm) -> None:
    """입금 안내 직후(AWAITING_DEPOSIT 진입). 주문 하나에 한 번만(AC-18-1)."""

    def build() -> dict[str, str]:
        return {
            "#{농가명}": farm.name,
            **_order_variables(db, order),
            "#{입금기한}": deadline_text(order.deposit_due_at) if order.deposit_due_at else "",
        }

    _enqueue(
        db,
        event=ORDER_AWAITING_DEPOSIT,
        order=order,
        farm_of=lambda: farm,
        dedupe_key=awaiting_key(order.id),
        build=build,
    )


def deposit_reported(db: Session, order) -> None:
    """소비자 '입금을 마쳤어요'(deposit_reported_at을 처음 채운 때). 신호마다 한 번(AC-18-2)."""
    from app.catalog.models import Product
    from app.farms.models import Farm

    def farm_of():
        product = db.get(Product, order.product_id)
        return db.get(Farm, product.farm_id) if product else None

    _enqueue(
        db,
        event=DEPOSIT_REPORTED,
        order=order,
        farm_of=farm_of,
        dedupe_key=reported_key(order.id, order.deposit_reported_at),
        build=lambda: _order_variables(db, order),
    )


def list_notifications(
    db: Session, *, order_id: str | None, status: str | None, limit: int
) -> list[Notification]:
    query = select(Notification).order_by(Notification.created_at.desc(), Notification.id)
    if order_id:
        query = query.where(Notification.order_id == order_id)
    if status:
        query = query.where(Notification.status == status)
    return list(db.scalars(query.limit(limit)))


def retry(db: Session, notification_id: str) -> Notification:
    """운영자 재시도(FAILED만). 다음 발송 루프가 처음부터 다시 시도한다(AC-18-7)."""
    from app.core.errors import conflict, not_found

    row = db.scalar(
        select(Notification).where(Notification.id == notification_id).with_for_update()
    )
    if row is None:
        raise not_found("알림을 찾을 수 없어요.")
    if row.status != "FAILED":
        raise conflict("INVALID_TRANSITION", "실패한 알림만 다시 보낼 수 있어요.")
    if get_settings().notify_provider == "none":
        raise conflict("NOTIFY_DISABLED", "알림 발송이 꺼져 있어요(NOTIFY_PROVIDER=none).")
    at = now()
    row.status, row.attempts, row.next_attempt_at = "PENDING", 0, at
    row.retried_at, row.lease_until, row.lease_token = at, None, None
    db.flush()
    return row

