"""catalog 모듈 Pydantic 입출력 스키마 (screens.md 7.2 catalog)."""

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

ProductStatus = Literal["DRAFT", "PENDING_APPROVAL", "REJECTED", "PUBLISHED", "CLOSED"]
ShippingFeeType = Literal["FREE", "SEPARATE"]


class DateRange(CamelModel):
    start: date
    end: date


class ProductOptionView(CamelModel):
    option_id: str
    label: str
    weight_kg: float
    note: str | None = None


class StageOptionValue(CamelModel):
    price: int
    quantity: int
    reserved_count: int


class StageView(CamelModel):
    stage_id: str
    seq: int
    name: str
    starts_at: date
    ends_at: date
    options: dict[str, StageOptionValue]


class ProductInfo(CamelModel):
    origin: str = ""
    producer: str = ""
    size: str = ""
    packed_at: str = ""
    storage: str = ""
    contact: str = ""


class ProductCard(CamelModel):
    product_id: str
    name: str
    farm_id: str
    farm_name: str
    photo: str | None
    current_price: int | None
    next_price: int | None
    stage_ends_at: date | None
    d_day: int | None
    delivery_window: DateRange | None
    sold_out: bool
    next_stage_starts_at: date | None
    reserved_count: int
    expected_brix: float | None


class ProductDetail(ProductCard):
    variety: str
    description: str
    grade: str | None
    measured_brix: float | None
    measured_brix_at: datetime | None
    brix_record_count: int
    farmer_note: str
    farm_region: str
    farm_photo: str | None
    options: list[ProductOptionView]
    stages: list[StageView]
    current_stage_id: str | None
    shipping_fee_type: ShippingFeeType
    shipping_fee: int
    remote_area_fee: int
    max_quantity_per_order: int
    max_delay_until: date | None
    info: ProductInfo
    status: ProductStatus


class MyProduct(CamelModel):
    product_id: str
    farm_id: str
    name: str
    photo: str | None
    photos: list[str]
    variety: str
    description: str
    grade: str | None
    expected_brix: float | None
    measured_brix: float | None
    measured_brix_at: datetime | None
    options: list[ProductOptionView]
    stages: list[StageView]
    shipping_fee_type: ShippingFeeType
    shipping_fee: int
    remote_area_fee: int
    max_quantity_per_order: int
    delivery_window: DateRange | None
    max_delay_until: date | None
    info: ProductInfo
    status: ProductStatus
    reject_reason: str | None
    pending_reapproval: bool
    missing_fields: list[str]
    reserved_count: int


class ProductOptionInput(CamelModel):
    option_id: str | None = None
    label: str = Field(min_length=1, max_length=50)
    weight_kg: float = Field(gt=0)
    note: str | None = None


class ProductPatch(CamelModel):
    name: str | None = Field(default=None, max_length=200)
    variety: str | None = Field(default=None, max_length=100)
    description: str | None = None
    grade: str | None = None
    expected_brix: float | None = None
    measured_brix: float | None = None
    options: list[ProductOptionInput] | None = None
    max_quantity_per_order: int | None = Field(default=None, ge=1)
    delivery_window: DateRange | None = None
    max_delay_until: date | None = None
    shipping_fee_type: ShippingFeeType | None = None
    shipping_fee: int | None = Field(default=None, ge=0)
    remote_area_fee: int | None = Field(default=None, ge=0)
    photos: list[str] | None = None
    info: ProductInfo | None = None


class StageOptionInput(CamelModel):
    price: int
    quantity: int


class StageInput(CamelModel):
    name: str = ""
    starts_at: date
    ends_at: date
    options: dict[str, StageOptionInput]


class StagesInput(CamelModel):
    stages: list[StageInput]


class StagePreset(CamelModel):
    preset_id: str
    label: str
    stage_count: int
    step_price: int


class DraftInput(CamelModel):
    input_text: str = ""


class DraftFields(CamelModel):
    name: str | None = None
    variety: str | None = None
    options: list[str] | None = None
    expected_brix: float | None = None
    grade: str | None = None
    delivery_window: str | None = None
    description: str | None = None


class Draft(CamelModel):
    draft_id: str
    input_text: str
    extracted: DraftFields
    missing_fields: list[str]
    failed: bool
    price_mentioned: str | None


class CreateProductInput(CamelModel):
    draft_id: str | None = None
