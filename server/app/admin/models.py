"""운영자 작업 감사와 복구 상태."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ManagerEvent(Base):
    __tablename__ = "manager_events"
    __table_args__ = (
        UniqueConstraint(
            "actor_id",
            "scope",
            "idempotency_key",
            deferrable=True,
            initially="DEFERRED",
        ),
        UniqueConstraint("message_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(160), index=True)
    scope: Mapped[str | None] = mapped_column(String(160))
    idempotency_key: Mapped[str | None] = mapped_column(String(128))
    original_body: Mapped[Any | None] = mapped_column(JSON)
    request_summary: Mapped[Any] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), index=True)
    retryable: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    result: Mapped[Any | None] = mapped_column(JSON)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    message_id: Mapped[str | None] = mapped_column(String(64), index=True)
    last_retried_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class AiUsage(Base):
    """AI 호출 한 번과 그 비용(DEV-144). 기능별로 모은다: spec-check(CI), 상품 초안, 상세 초안,
    AI 답변, 자료 분석. 금액을 모르면(단가표에 없는 모델) cost_usd가 비어 있다."""

    __tablename__ = "ai_usage"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    feature: Mapped[str] = mapped_column(String(32), index=True)
    model: Mapped[str] = mapped_column(String(80), default="")
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    status: Mapped[str] = mapped_column(String(16), default="")
    ref: Mapped[str] = mapped_column(String(40), default="")  # 예: PR 번호 "#170"
    title: Mapped[str] = mapped_column(String(300), default="")
    link: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
