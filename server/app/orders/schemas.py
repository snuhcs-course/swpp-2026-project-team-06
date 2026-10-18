"""orders 모듈 Pydantic 입출력 스키마 (screens.md 7.2 orders)."""

from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.catalog.schemas import DateRange, SalesState
from app.core.schemas import CamelModel
from app.farms.schemas import DepositAccount, SellerInfo

OrderAction = Literal["cancel", "confirm", "respondDeliveryWindow", "reportDeposit"]
OrderStatus = Literal[
    "PENDING_PAYMENT",
    "AWAITING_DEPOSIT",
    "RESERVED",
    "PREPARING",
    "SHIPPED",
    "DELIVERED",
    "COMPLETED",
    "CANCELED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
]


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


class AdminRefundInput(CamelModel):
    reason: str = Field(min_length=1, max_length=500)
    amount: int | None = None


class RefundView(CamelModel):
    refund_id: str
    order_id: str
    amount: int
    reason: str
    actor: Literal["MANAGER", "CONSUMER", "SYSTEM"]
    actor_user_id: str | None
    manager_event_id: str | None
    created_at: datetime
    settled_at: datetime | None


class OrderView(CamelModel):
    unit_weight_grams: int
    released_quantity: int
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
    # 무통장 입금(DEV-68). 계좌·판매자 정보는 입금 안내 이후 본인 주문에서만
    deposit_account: DepositAccount | None
    seller_info: SellerInfo | None
    deposit_due_at: datetime | None
    deposit_reported_at: datetime | None
    cancel_reason: str | None
    refund_settled_at: datetime | None
    recipient_name: str
    recipient_phone: str
    postal_code: str
    address: str
    address_detail: str
    actions: list[OrderAction]


class DeliveryWindowResponse(CamelModel):
    choice: Literal["accept", "refund"]


class HarvestStartInput(CamelModel):
    product_id: str


class Changed(CamelModel):
    changed: int


class ShipInput(CamelModel):
    tracking_number: str | None = Field(default=None, max_length=50)
    carrier: Literal["CJ", "EPOST", "HANJIN", "LOTTE", "LOGEN", "ETC"] | None = None


class ProducerOrder(CamelModel):
    order_id: str
    order_no: str
    product_id: str
    product_name: str
    option_label: str
    quantity: int
    status: OrderStatus
    delivery_note: str | None
    carrier: str | None
    tracking_number: str | None
    created_at: datetime
    total_amount: int
    deposit_due_at: datetime | None
    deposit_reported_at: datetime | None
    refund_settled_at: datetime | None
    recipient_name: str
    recipient_phone: str
    postal_code: str
    address: str
    address_detail: str


class DashboardTodo(CamelModel):
    open_questions: int
    to_ship: int
    pending_products: int
    awaiting_deposit: int
    refunds_to_settle: int
    has_account: bool


class DashboardProduct(SalesState):
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
