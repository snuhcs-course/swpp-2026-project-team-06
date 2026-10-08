"""accounts 모듈 SQLAlchemy 모델 (docs/spec/tech-design/README.md 데이터 모델)."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    """계정 하나는 역할 하나(CONSUMER·PRODUCER·ADMIN, ADR 0010)."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("kakao_id", "role"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kakao_id: Mapped[str | None] = mapped_column(String(64))
    is_test_account: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ShippingAddress(Base):
    """사용자별 저장 배송지(AC-08-5). 주문은 참조하지 않고 값을 복사한다."""

    __tablename__ = "shipping_addresses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str | None] = mapped_column(String(50))
    recipient_name: Mapped[str] = mapped_column(String(100))
    recipient_phone: Mapped[str] = mapped_column(String(32))
    postal_code: Mapped[str] = mapped_column(String(16))
    address: Mapped[str] = mapped_column(String(300))
    address_detail: Mapped[str] = mapped_column(String(300), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
