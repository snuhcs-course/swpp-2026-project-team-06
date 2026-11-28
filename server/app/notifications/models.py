"""notifications 모듈 SQLAlchemy 모델(DEV-495, FEAT-18).

알림 행(outbox)은 주문 변경과 같은 트랜잭션에서 PENDING으로 들어가고, 발송 루프가 커밋 뒤에 보낸다.
받는 사람 이름·주소·전체 전화번호는 저장하지 않는다. 번호는 보낼 때 농가에서 읽고 끝 4자리만 남긴다.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

EVENTS = ("ORDER_AWAITING_DEPOSIT", "DEPOSIT_REPORTED")
# PENDING → SENDING → SENT(업체 접수) | FAILED | SKIPPED(사유)
STATUSES = ("PENDING", "SENDING", "SENT", "FAILED", "SKIPPED")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # 발송 루프가 가져갈 행: 상태 + 다음 시도 시각
        Index("ix_notifications_status_next", "status", "next_attempt_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event: Mapped[str] = mapped_column(String(32))
    # 한 번만 넣기: order_awaiting_deposit:{orderId}, deposit_reported:{orderId}:{ISO}
    dedupe_key: Mapped[str] = mapped_column(String(200), unique=True)
    # 주문·농가가 지워지면(시드 초기화·운영 데이터 정리) 같이 지운다
    order_id: Mapped[str] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    # 템플릿 종류(이벤트 이름과 같다). 템플릿 ID 값은 보낼 때 설정에서 읽는다
    template: Mapped[str] = mapped_column(String(64))
    # 알림톡 변수만(#{농가명} 등). 이름·주소·전화번호는 넣지 않는다.
    # 로그·관리 응답에 내보내지 않는다
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    skip_reason: Mapped[str | None] = mapped_column(String(32))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 임대한 발송 루프만 결과를 쓴다(늦게 끝난 다른 루프가 덮어쓰지 않게)
    lease_token: Mapped[str | None] = mapped_column(String(64))
    phone_last4: Mapped[str | None] = mapped_column(String(4))
    provider_group_id: Mapped[str | None] = mapped_column(String(100))
    provider_message_id: Mapped[str | None] = mapped_column(String(100))
    # 업체 상태 코드·예외 종류만(예: http_503, failed:3059, ConnectTimeout). 본문·번호는 넣지 않는다
    last_error: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # 운영자 재시도 시각. 6시간 지난 행 건너뛰기는 이 값(없으면 created_at)부터 센다
    retried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationSettings(Base):
    """농가별 알림 설정. 행이 없으면 켜짐. 1차는 앱 화면 없이 운영자가 요청받아 끈다(결정 5)."""

    __tablename__ = "notification_settings"

    farm_id: Mapped[str] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"), primary_key=True
    )
    order_alimtalk_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true()
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
