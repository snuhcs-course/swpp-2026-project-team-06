"""catalog 모듈 SQLAlchemy 모델 (docs/spec/tech-design/README.md 데이터 모델)."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    variety: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    farmer_note: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list[str]] = mapped_column(JSON, default=list)
    grade: Mapped[str | None] = mapped_column(String(20))
    expected_brix: Mapped[float | None] = mapped_column(Float)
    measured_brix: Mapped[float | None] = mapped_column(Float)
    measured_brix_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    brix_record_count: Mapped[int] = mapped_column(Integer, default=0)
    delivery_start: Mapped[date | None] = mapped_column(Date)
    delivery_end: Mapped[date | None] = mapped_column(Date)
    max_delay_until: Mapped[date | None] = mapped_column(Date)
    # FREE · SEPARATE
    shipping_fee_type: Mapped[str] = mapped_column(String(16), default="FREE")
    shipping_fee: Mapped[int] = mapped_column(Integer, default=0)
    remote_area_fee: Mapped[int] = mapped_column(Integer, default=3000)
    max_quantity_per_order: Mapped[int] = mapped_column(Integer, default=3)
    # 상품정보 표시(원산지·생산자·크기·포장일·보관·상담, R-16)
    info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # DRAFT · PENDING_APPROVAL · REJECTED · PUBLISHED · CLOSED
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    reject_reason: Mapped[str | None] = mapped_column(Text)
    # 판매 중 상품의 재승인 대기(R-25, 스펙 1.1)
    pending_reapproval: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ProductOption(Base):
    """중량 옵션. ID는 상품 안에서만 유일하다(opt-5)."""

    __tablename__ = "product_options"

    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(50))
    weight_kg: Mapped[float] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Stage(Base):
    """판매 단계. 시작·끝 날짜를 모두 포함한다(Asia/Seoul 날짜)."""

    __tablename__ = "stages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(50))
    starts_at: Mapped[date] = mapped_column(Date)
    ends_at: Mapped[date] = mapped_column(Date)


class StagePrice(Base):
    __tablename__ = "stage_prices"
    __table_args__ = (
        ForeignKeyConstraint(
            ["product_id", "option_id"], ["product_options.product_id", "product_options.id"]
        ),
    )

    stage_id: Mapped[str] = mapped_column(ForeignKey("stages.id"), primary_key=True)
    option_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    product_id: Mapped[str] = mapped_column(String(64))
    price: Mapped[int] = mapped_column(Integer)


class StageAllocation(Base):
    """단계·옵션별 물량. reserved_count는 예약된 박스 수(R-06)."""

    __tablename__ = "stage_allocations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["product_id", "option_id"], ["product_options.product_id", "product_options.id"]
        ),
    )

    stage_id: Mapped[str] = mapped_column(ForeignKey("stages.id"), primary_key=True)
    option_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    product_id: Mapped[str] = mapped_column(String(64))
    quantity: Mapped[int] = mapped_column(Integer)
    reserved_count: Mapped[int] = mapped_column(Integer, default=0)


class ProductDraft(Base):
    """AI 상품 초안(FEAT-03). ai 모듈은 저장하지 않고 catalog가 저장한다."""

    __tablename__ = "product_drafts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    input_text: Mapped[str] = mapped_column(Text)
    output: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    missing_fields: Mapped[list[str]] = mapped_column(JSON, default=list)
    failed: Mapped[bool] = mapped_column(Boolean, default=False)
    price_mentioned: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
