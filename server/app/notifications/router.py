"""알림 관리 API(DEV-495, ADMIN만). 화면 없이 Swagger로 쓴다.

응답에는 상태·시도 횟수·끝 4자리·업체 코드·시각만 담는다.
변수 값(입금자명 등)·전체 번호는 내보내지 않는다.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.admin.service import run_manager_action
from app.core.db import get_db
from app.core.masking import phone_tail
from app.core.schemas import CamelModel
from app.core.security import Admin
from app.notifications import service
from app.notifications.models import Notification

router = APIRouter(prefix="/admin/notifications", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]
Status = Literal["PENDING", "SENDING", "SENT", "FAILED", "SKIPPED"]


class NotificationView(CamelModel):
    notification_id: str
    event: str
    order_id: str
    farm_id: str
    status: str
    skip_reason: str | None
    attempts: int
    # '●●●●1234'. 보내기 전이면 없음
    phone_tail: str | None
    # 업체 상태 코드·예외 종류(예: http_503, failed:3059)
    provider_code: str | None
    provider_group_id: str | None
    provider_message_id: str | None
    created_at: datetime
    next_attempt_at: datetime
    sent_at: datetime | None


def _view(row: Notification) -> NotificationView:
    return NotificationView(
        notification_id=row.id,
        event=row.event,
        order_id=row.order_id,
        farm_id=row.farm_id,
        status=row.status,
        skip_reason=row.skip_reason,
        attempts=row.attempts,
        phone_tail=phone_tail(row.phone_last4) if row.phone_last4 else None,
        provider_code=row.last_error,
        provider_group_id=row.provider_group_id,
        provider_message_id=row.provider_message_id,
        created_at=row.created_at,
        next_attempt_at=row.next_attempt_at,
        sent_at=row.sent_at,
    )


@router.get("", response_model=list[NotificationView])
def list_notifications(
    db: Db,
    _: Admin,
    order_id: Annotated[str | None, Query(alias="orderId")] = None,
    status: Status | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
):
    """알림 목록(최근 순). 주문·상태로 거른다(AC-18-7)."""
    rows = service.list_notifications(db, order_id=order_id, status=status, limit=limit)
    return [_view(row) for row in rows]


@router.post("/{notification_id}/retry", response_model=NotificationView)
def retry_notification(
    db: Db, admin: Admin, notification_id: str, key: IdempotencyKey = None
):
    """FAILED 알림을 다시 보낸다(Idempotency-Key 필수, 감사 기록). 다른 상태면 409."""
    return run_manager_action(
        db,
        actor_id=admin.id,
        action="notification.retry",
        target_type="notification",
        target_id=notification_id,
        scope=f"notification-retry:{notification_id}",
        key=key,
        body={},
        run=lambda _: _view(service.retry(db, notification_id)),
    )
