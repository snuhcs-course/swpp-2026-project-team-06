"""catalog 모듈 Pydantic 입출력 스키마 (screens.md 7.2 catalog)."""

from datetime import date, datetime
from typing import Literal

from pydantic import Field, model_validator

from app.core.detail import DetailContent
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


class SalesState(CamelModel):
    approved_supply_grams: int
    sales_limit_grams: int
    reserved_grams: int
    shipped_grams: int
    sold_quantity: int
    remaining_grams: int
    sales_paused: bool
    availability: Literal[
        "PAUSED", "ENDED", "NOT_OPEN", "TOTAL_SOLD_OUT", "PERIOD_SOLD_OUT", "AVAILABLE"
    ]
    version: int


class CapacityRequestView(CamelModel):
    request_id: str
    product_id: str
    kind: Literal["INITIAL", "INCREASE"]
    requested_total_grams: int
    status: Literal["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]
    reason: str | None
    created_at: datetime
    decided_at: datetime | None
    version: int


class ProductCard(SalesState):
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
    detail_content: DetailContent | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
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


class MyProduct(SalesState):
    product_id: str
    farm_id: str
    name: str
    photo: str | None
    photos: list[str]
    variety: str
    description: str
    detail_content: DetailContent | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
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
    pending_capacity_request: CapacityRequestView | None
    missing_fields: list[str]
    reserved_count: int


class MyProductCard(SalesState):
    product_id: str
    name: str
    photo: str | None
    status: ProductStatus
    reject_reason: str | None
    pending_capacity_request: CapacityRequestView | None
    reserved_count: int
    current_stage_label: str | None
    updated_at: datetime


class ProductOptionInput(CamelModel):
    option_id: str | None = None
    label: str = Field(min_length=1, max_length=50)
    weight_kg: float = Field(gt=0)
    note: str | None = None


class ProductPatch(CamelModel):
    version: int
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
    detail_content: DetailContent | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_detail(cls, data):
        if isinstance(data, dict) and any(
            key in data and data[key] is None for key in ("detailContent", "detail_content")
        ):
            raise ValueError("detailContent는 null 대신 빈 blocks를 사용해 주세요")
        return data


class StageOptionInput(CamelModel):
    price: int
    quantity: int


class StageInput(CamelModel):
    stage_id: str | None = None
    name: str = ""
    starts_at: date
    ends_at: date
    options: dict[str, StageOptionInput]


class StagesInput(CamelModel):
    stages: list[StageInput]
    version: int


class StagesResult(CamelModel):
    version: int
    stages: list[StageView]


class SalesInput(CamelModel):
    sales_limit_grams: int = Field(ge=0)
    max_quantity_per_order: int = Field(ge=1)
    sales_paused: bool
    version: int


class CapacityRequestInput(CamelModel):
    requested_total_grams: int = Field(gt=0)
    version: int


class VersionInput(CamelModel):
    version: int


class CapacityDecisionInput(VersionInput):
    reason: str | None = None


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
