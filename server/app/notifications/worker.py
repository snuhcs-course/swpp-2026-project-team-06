"""API 프로세스 안 알림 발송 루프(DEV-495 결정 4).

lifespan이 NOTIFY_PROVIDER=solapi일 때만 데몬 스레드로 시작한다. 5초마다 보낼 행
(PENDING이고 때가 됐거나, 임대가 끝난 SENDING)을 `FOR UPDATE SKIP LOCKED`로 몇 건 가져와
보내기 직전 검사를 하고 임대(60초)를 커밋한 뒤 트랜잭션 밖에서 보낸다. 자료 분석 워커
(`source_analysis/worker.py` claim)와 같은 방식이라 여러 프로세스가 떠도 한 행을 같이 보내지 않는다.

로그에는 알림 id·주문 id·이벤트·상태·업체 코드·끝 4자리만 남긴다(설계 8).
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from threading import Event, Thread

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import KST, now
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.ids import new_id
from app.core.masking import phone_tail
from app.notifications.models import Notification
from app.notifications.sender import OutgoingMessage, Sender, SendResult, build_sender, template_id
from app.notifications.service import (
    DEPOSIT_REPORTED,
    ORDER_AWAITING_DEPOSIT,
    mobile_digits,
    reported_key,
    skip_reason,
)

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 5
BATCH = 10
LEASE = timedelta(seconds=60)
# 첫 시도 뒤 다시 보내는 간격. 세 번 다시 보내도 안 되면 FAILED(결정 7)
RETRY_DELAYS = (timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=30))
MAX_ATTEMPTS = 1 + len(RETRY_DELAYS)
# 만들어진(또는 운영자가 다시 보내라고 한) 지 6시간이 지나면 늦게 가서 헷갈리지 않게 건너뛴다
STALE_AFTER = timedelta(hours=6)


@dataclass(frozen=True)
class Job:
    id: str
    token: str
    order_id: str
    event: str
    message: OutgoingMessage


def _due(at: datetime):
    return or_(
        and_(Notification.status == "PENDING", Notification.next_attempt_at <= at),
        and_(Notification.status == "SENDING", Notification.lease_until < at),
    )


def _sent_count(db: Session, row: Notification, *, since: datetime, farm: bool) -> int:
    query = select(func.count()).select_from(Notification).where(
        Notification.id != row.id,
        or_(
            and_(Notification.status == "SENT", Notification.sent_at >= since),
            Notification.status == "SENDING",
        ),
    )
    if farm:
        query = query.where(Notification.farm_id == row.farm_id)
    return db.scalar(query) or 0


def _state_changed(db: Session, row: Notification) -> bool:
    from app.orders.models import Order

    order = db.get(Order, row.order_id)
    if order is None or order.status != "AWAITING_DEPOSIT":
        return True
    if row.event == DEPOSIT_REPORTED:
        # 미승인으로 신호가 지워졌거나 다시 알려 다른 행이 됐다
        return order.deposit_reported_at is None or (
            reported_key(order.id, order.deposit_reported_at) != row.dedupe_key
        )
    return row.event != ORDER_AWAITING_DEPOSIT


def _finish(row: Notification, status: str, *, reason: str | None = None, error=None) -> None:
    row.status, row.lease_until, row.lease_token = status, None, None
    if reason is not None:
        row.skip_reason = reason
    if error is not None:
        row.last_error = error
    _log(row)


def _log(row: Notification) -> None:
    logger.info(
        "notification id=%s order=%s event=%s status=%s reason=%s code=%s to=%s attempts=%s",
        row.id,
        row.order_id,
        row.event,
        row.status,
        row.skip_reason,
        row.last_error,
        phone_tail(row.phone_last4) if row.phone_last4 else None,
        row.attempts,
    )


def _prepare(db: Session, row: Notification) -> Job | None:
    """보내기 직전 검사. 보낼 행이면 임대하고 Job을, 아니면 SKIPPED·FAILED로 바꾸고 None."""
    from app.farms.models import Farm

    settings = get_settings()
    at = now()
    if row.status == "SENDING" and row.attempts >= MAX_ATTEMPTS:
        # 마지막 시도 중에 프로세스가 죽었다
        _finish(row, "FAILED", error="lease_expired")
        return None
    if at - (row.retried_at or row.created_at) > STALE_AFTER:
        _finish(row, "SKIPPED", reason="stale")
        return None
    if _state_changed(db, row):
        _finish(row, "SKIPPED", reason="order_state_changed")
        return None
    farm = db.get(Farm, row.farm_id)
    # 테스트 계정·승인·끄기·번호를 넣을 때에 이어 한 번 더 본다(시드 가짜 번호로 보내지 않게)
    reason = skip_reason(db, farm)
    if reason is not None:
        _finish(row, "SKIPPED", reason=reason)
        return None
    if _sent_count(db, row, since=at - timedelta(hours=1), farm=True) >= (
        settings.notify_farm_hourly_limit
    ) or _sent_count(
        db, row, since=at.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0),
        farm=False,
    ) >= settings.notify_daily_limit:
        logger.warning("notification rate limited id=%s farm=%s", row.id, row.farm_id)
        _finish(row, "SKIPPED", reason="rate_limited")
        return None
    template = template_id(settings, row.event)
    if not template:
        _finish(row, "FAILED", error="template_missing")
        return None
    to = mobile_digits(farm.contact_phone)
    row.status, row.lease_token = "SENDING", new_id("lease")
    row.lease_until = at + LEASE
    row.attempts += 1
    row.phone_last4 = to[-4:]
    return Job(row.id, row.lease_token, row.order_id, row.event, OutgoingMessage(
        to=to, template_id=template, variables=dict(row.variables or {})
    ))


def claim(batch: int = BATCH) -> list[Job]:
    jobs: list[Job] = []
    with get_sessionmaker()() as db:
        ids = list(
            db.scalars(
                select(Notification.id)
                .where(_due(now()))
                .order_by(Notification.next_attempt_at, Notification.id)
                .limit(batch)
            )
        )
        for notification_id in ids:
            row = db.scalar(
                select(Notification)
                .where(Notification.id == notification_id, _due(now()))
                .with_for_update(skip_locked=True)
                .execution_options(populate_existing=True)
            )
            if row is None:
                db.rollback()
                continue
            job = _prepare(db, row)
            db.commit()
            if job is not None:
                jobs.append(job)
    return jobs


def finish(job: Job, result: SendResult) -> None:
    with get_sessionmaker()() as db:
        row = db.scalar(
            select(Notification)
            .where(
                Notification.id == job.id,
                Notification.lease_token == job.token,
                Notification.status == "SENDING",
            )
            .with_for_update()
        )
        if row is None:
            # 임대가 끝나 다른 루프가 가져갔다. 그쪽 결과를 덮어쓰지 않는다
            logger.warning("notification lease lost id=%s", job.id)
            return
        if result.outcome == "sent":
            row.sent_at = now()
            row.provider_group_id = result.group_id
            row.provider_message_id = result.message_id
            _finish(row, "SENT", error=result.code)
        elif result.outcome == "skipped":
            _finish(row, "SKIPPED", reason=result.code or "provider_disabled")
        elif result.outcome == "retry" and row.attempts < MAX_ATTEMPTS:
            row.next_attempt_at = now() + RETRY_DELAYS[row.attempts - 1]
            _finish(row, "PENDING", error=result.code)
        else:
            _finish(row, "FAILED", error=result.code)
        db.commit()


def run_once(sender: Sender, batch: int = BATCH) -> int:
    """한 번 돌린다. 보낸(시도한) 건수를 돌려준다."""
    jobs = claim(batch)
    for job in jobs:
        try:
            result = sender.send(job.message)
        except Exception as exc:  # noqa: BLE001 — 발송자 버그로 루프가 멈추지 않게
            result = SendResult("retry", type(exc).__name__)
        finish(job, result)
    return len(jobs)


def start() -> Callable[[], None] | None:
    """NOTIFY_PROVIDER=solapi면 발송 루프를 시작하고 멈추는 함수를 돌려준다. 아니면 None."""
    settings = get_settings()
    if settings.notify_provider != "solapi":
        return None
    sender = build_sender(settings)
    stop = Event()

    def loop() -> None:
        while not stop.wait(INTERVAL_SECONDS):
            try:
                run_once(sender)
            except Exception as exc:  # noqa: BLE001 — DB가 잠시 끊겨도 다음 차례에 다시 본다
                logger.warning("notification loop error=%s", type(exc).__name__)

    thread = Thread(target=loop, name="notification-sender", daemon=True)
    thread.start()

    def shutdown() -> None:
        stop.set()
        thread.join(timeout=INTERVAL_SECONDS + 15)
        sender.close()

    return shutdown
