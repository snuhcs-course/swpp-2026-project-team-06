"""orders 모듈 SQLAlchemy 모델 (docs/spec/tech-design/README.md 데이터 모델·주문 상태)."""

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Sequence,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

# 주문 번호 FC-MMDD-NNNN의 NNNN
ORDER_NO_SEQ = Sequence("order_no_seq", start=1000, metadata=Base.metadata)


class Order(Base):
    """배송지는 주문 시점 값을 복사한다(ShippingAddress를 참조하지 않음)."""

    __tablename__ = "orders"
    __table_args__ = (
        ForeignKeyConstraint(
            ["product_id", "option_id"], ["product_options.product_id", "product_options.id"]
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_no: Mapped[str] = mapped_column(String(32), unique=True)
    consumer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    product_id: Mapped[str] = mapped_column(String(64), index=True)
    option_id: Mapped[str] = mapped_column(String(64))
    stage_id: Mapped[str] = mapped_column(ForeignKey("stages.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
    unit_weight_grams: Mapped[int] = mapped_column(Integer)
    released_quantity: Mapped[int] = mapped_column(Integer, default=0)
    shipping_fee: Mapped[int] = mapped_column(Integer, default=0)
    remote_area_fee: Mapped[int] = mapped_column(Integer, default=0)
    total_amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24))
    delivery_start: Mapped[date] = mapped_column(Date)
    delivery_end: Mapped[date] = mapped_column(Date)
    proposed_delivery_start: Mapped[date | None] = mapped_column(Date)
    proposed_delivery_end: Mapped[date | None] = mapped_column(Date)
    recipient_name: Mapped[str] = mapped_column(String(100))
    recipient_phone: Mapped[str] = mapped_column(String(32))
    postal_code: Mapped[str] = mapped_column(String(16))
    address: Mapped[str] = mapped_column(String(300))
    address_detail: Mapped[str] = mapped_column(String(300), default="")
    delivery_note: Mapped[str | None] = mapped_column(String(100))
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consent_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # CJ · EPOST · HANJIN · LOTTE · LOGEN · ETC
    carrier: Mapped[str | None] = mapped_column(String(16))
    tracking_number: Mapped[str | None] = mapped_column(String(50))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refund_reason: Mapped[str | None] = mapped_column(Text)
    # 무통장 입금(DEV-68): 입금 기한, 소비자 '입금했어요' 신호, 확인 주체(PRODUCER·ADMIN), 취소 사유
    deposit_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deposit_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deposit_confirmed_by: Mapped[str | None] = mapped_column(String(16))
    cancel_reason: Mapped[str | None] = mapped_column(Text)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), unique=True)
    # BANK_TRANSFER / FARM_ACCOUNT: 소비자가 농가 계좌로 직접 입금(DEV-68)
    method: Mapped[str] = mapped_column(String(16), default="BANK_TRANSFER")
    provider: Mapped[str] = mapped_column(String(16), default="FARM_ACCOUNT")
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24))
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Refund(Base):
    __tablename__ = "refunds"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(16))
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    manager_event_id: Mapped[str | None] = mapped_column(
        ForeignKey("manager_events.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    # 농가가 입금했던 계좌로 송금한 시각(DEV-68). 없으면 송금 대기
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
