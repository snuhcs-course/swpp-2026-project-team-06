"""farms 모듈 SQLAlchemy 모델 (docs/spec/tech-design/README.md 데이터 모델)."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    producer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(100))
    intro: Mapped[str] = mapped_column(Text, default="")
    detail_content: Mapped[dict | None] = mapped_column(JSON)
    photo: Mapped[str | None] = mapped_column(String(500))
    main_items: Mapped[str] = mapped_column(String(200), default="")
    contact_phone: Mapped[str] = mapped_column(String(32), default="")
    # PENDING · APPROVED · REJECTED · SUSPENDED
    approval_status: Mapped[str] = mapped_column(String(16), default="PENDING")
    reject_reason: Mapped[str | None] = mapped_column(Text)
    suspend_reason: Mapped[str | None] = mapped_column(Text)
    # 팔로워 수. 팔로우·해제 때 같은 트랜잭션에서 바꾼다.
    follower_count: Mapped[int] = mapped_column(Integer, default=0)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Follow(Base):
    __tablename__ = "follows"

    consumer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FarmAiSettings(Base):
    """농가 AI 응답 설정(contracts-1.2 5장). 행이 없으면 기본값(켜짐, 빈 원칙)."""

    __tablename__ = "farm_ai_settings"

    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    small_order_policy: Mapped[str] = mapped_column(Text, default="")
    reservation_shipping_policy: Mapped[str] = mapped_column(Text, default="")
    faqs: Mapped[list[dict]] = mapped_column(JSON, default=list)
    handoff_topics: Mapped[list[str]] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FarmAiSettingsHistory(Base):
    """AI 설정을 저장할 때마다 남기는 이력(contracts-1.2 5장)."""

    __tablename__ = "farm_ai_settings_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    settings: Mapped[dict] = mapped_column(JSON)
    saved_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
