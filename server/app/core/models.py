"""여러 모듈이 함께 쓰는 테이블."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class IdempotencyRecord(Base):
    """멱등 키 결과(screens.md 7.1). (사용자, 범위, 키)마다 처음 결과를 24시간 보관한다."""

    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("user_id", "scope", "key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64))
    scope: Mapped[str] = mapped_column(String(128))
    key: Mapped[str] = mapped_column(String(128))
    body_hash: Mapped[str] = mapped_column(String(64))
    status_code: Mapped[int] = mapped_column(Integer)
    response: Mapped[Any] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
