"""AC-ENG-1/3: durable follow receipts, verified reviews and moderated reports."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FollowReceipt(Base):
    __tablename__ = "follow_receipts"
    __table_args__ = (
        UniqueConstraint("farm_id", "fan_number", name="uq_follow_receipts_farm_number"),
        CheckConstraint("fan_number > 0", name="ck_follow_receipts_positive_number"),
    )

    consumer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), primary_key=True)
    fan_number: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CustomerReview(Base):
    __tablename__ = "customer_reviews"
    __table_args__ = (CheckConstraint("stars BETWEEN 1 AND 5", name="ck_customer_reviews_stars"),)

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), primary_key=True)
    stars: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FarmReport(Base):
    __tablename__ = "farm_reports"
    __table_args__ = (
        UniqueConstraint("consumer_id", "farm_id", name="uq_farm_reports_consumer_farm"),
        CheckConstraint(
            "status IN ('PENDING','CONFIRMED','REJECTED','OVERTURNED')",
            name="ck_farm_reports_status",
        ),
        CheckConstraint(
            "status != 'CONFIRMED' OR incident_key IS NOT NULL",
            name="ck_farm_reports_confirmed_incident",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    consumer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    incident_key: Mapped[str | None] = mapped_column(String(100))
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
