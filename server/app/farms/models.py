"""farms 모듈 SQLAlchemy 모델 (docs/spec/tech-design/README.md 데이터 모델)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    producer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(100))
    intro: Mapped[str] = mapped_column(Text, default="")
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
