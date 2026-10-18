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
    # 가입 온보딩(FEAT-01 I2, DEV-32): 농가에 보이는 표시 이름과 카카오계정 이메일.
    # 식별은 kakao_id로 한다
    nickname: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserConsent(Base):
    """가입 동의 기록(이용약관·개인정보·만 14세·마케팅).

    항목마다 최근 동의 한 줄을 두고 시각·버전을 남긴다.
    """

    __tablename__ = "user_consents"
    __table_args__ = (UniqueConstraint("user_id", "kind"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    version: Mapped[str] = mapped_column(String(32))
    agreed: Mapped[bool] = mapped_column(Boolean, default=True)
    agreed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


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
