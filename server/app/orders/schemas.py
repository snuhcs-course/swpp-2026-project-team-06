"""orders 모듈 Pydantic 입출력 스키마 (screens.md 7.2 orders)."""

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.catalog.schemas import DateRange
from app.core.schemas import CamelModel

OrderAction = Literal["cancel", "confirm", "respondDeliveryWindow"]


class Consents(CamelModel):
    """결제 전 동의 4개(R-03, 정책 2장)."""

    delivery_window: bool = False
    delay_refund: bool = False
    shortage: bool = False
    cancel_policy: bool = False


class OrderInput(CamelModel):
    product_id: str
    option_id: str
    quantity: int
    recipient_name: str = ""
    recipient_phone: str = ""
    postal_code: str = ""
    address: str = ""
    address_detail: str = ""
    delivery_note: str | None = None
    consents: Consents = Field(default_factory=Consents)
    consent_version: str = Field(default="", max_length=32)
    save_address: bool = False


class PayInput(CamelModel):
    mock_result: Literal["success", "fail"] = "success"


class OrderView(CamelModel):
    order_id: str
    order_no: str
    product_id: str
    product_name: str
    farm_id: str
    farm_name: str
    photo: str | None
    option_id: str
    option_label: str
    quantity: int
    unit_price: int
    shipping_fee: int
    remote_area_fee: int
    total_amount: int
    status: str
    delivery_window: DateRange
    proposed_delivery_window: DateRange | None
    delivery_note: str | None
    carrier: str | None
    tracking_number: str | None
    created_at: datetime
    paid_at: datetime | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    refunded_at: datetime | None
    refund_reason: str | None
    recipient_name: str
    recipient_phone: str
    postal_code: str
    address: str
    address_detail: str
    actions: list[OrderAction]


class PayResult(CamelModel):
    order: OrderView
    result: Literal["success", "fail"]
    fail_reason: str | None


class DashboardTodo(CamelModel):
    open_questions: int
    to_ship: int
    pending_products: int


class DashboardProduct(CamelModel):
    product_id: str
    product_name: str
    reserved_count: int
    order_count: int


class DashboardStageOption(CamelModel):
    option_id: str
    label: str
    price: int
    reserved: int
    quantity: int


class DashboardStage(CamelModel):
    stage_name: str
    current: bool
    ends_at: date
    options: list[DashboardStageOption]


class RecentOrder(CamelModel):
    order_id: str
    buyer_name: str
    option_label: str
    quantity: int
    created_at: datetime
    region: str
    status: str


class Dashboard(CamelModel):
    todo: DashboardTodo
    product: DashboardProduct | None
    stages: list[DashboardStage]
    recent_orders: list[RecentOrder]
