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
    """결제 전 동의 4개(R-03, 정책 2장) + 개인정보 제3자 제공(판매자 농가, 제17조, DEV-120)."""

    delivery_window: bool = False
    delay_refund: bool = False
    shortage: bool = False
    cancel_policy: bool = False
    third_party: bool = False


class OrderInput(CamelModel):
    product_id: str
    option_id: str
    quantity: int
    recipient_name: str = Field(default="", max_length=100)
    recipient_phone: str = Field(default="", max_length=32)
    postal_code: str = Field(default="", max_length=16)
    address: str = Field(default="", max_length=300)
    address_detail: str = Field(default="", max_length=300)
    delivery_note: str | None = None
    consents: Consents = Field(default_factory=Consents)
    consent_version: str = Field(default="", max_length=32)
    save_address: bool = False
    # 주문서가 본 지금 기간·단가·옵션 중량(AC-08-8, DEV-216). 보내면 지금 값과 비교해 다르면
    # 409 STAGE_CHANGED. 이번에는 선택(오래된 앱 보호), 다음 이터레이션에 필수로 바꾼다
    expected_stage_id: str | None = Field(default=None, max_length=64)
    expected_unit_price: int | None = None
    expected_unit_weight_grams: int | None = None


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
    # 농가 미승인 사유(DEV-68). 입금 대기로 남은 주문·송금 보류 중인 환불에만
    deposit_issue: str | None
    refund_issue: str | None
    recipient_name: str
    recipient_phone: str
    postal_code: str
    address: str
    address_detail: str
    actions: list[OrderAction]


class DeliveryWindowResponse(CamelModel):
    choice: Literal["accept", "refund"]


class RejectDepositInput(CamelModel):
    """입금 미승인(DEV-68). 사유는 필수이고 소비자에게 그대로 보인다. cancel이면 주문을 취소한다."""

    reason: str = Field(min_length=1, max_length=200)
    cancel: bool = False


class RefundIssueInput(CamelModel):
    """환불 미승인(DEV-68). 송금하지 못한 사유. 소비자에게 그대로 보인다."""

    reason: str = Field(min_length=1, max_length=200)


class HarvestStartInput(CamelModel):
    product_id: str
    # DEV-231: 예약 기간(단계) 하나만. 없으면 예전처럼 상품 전체
    stage_id: str | None = None


class HarvestStarted(CamelModel):
    changed: int
    stage_id: str | None
    order_ids: list[str]


class Changed(CamelModel):
    changed: int


class ShipInput(CamelModel):
    tracking_number: str | None = Field(default=None, max_length=50)
    carrier: Literal["CJ", "EPOST", "HANJIN", "LOTTE", "LOGEN", "ETC"] | None = None


class TrackingInput(CamelModel):
    version: int = Field(ge=1)
    carrier: Literal["CJ", "EPOST", "HANJIN", "LOTTE", "LOGEN", "ETC"]
    tracking_number: str | None = Field(default=None, max_length=50)


class ProducerOrder(CamelModel):
    tracking_version: int
    order_id: str
    order_no: str
    product_id: str
    # DEV-231: 예약 기간 화면 수확 시작 시트가 그 기간 주문만 고른다
    stage_id: str
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
    deposit_issue: str | None
    refund_issue: str | None
    recipient_name: str
    recipient_phone: str
    postal_code: str
    address: str
    address_detail: str


class HarvestTarget(CamelModel):
    """예약 완료 주문이 남은 예약 기간(DEV-231). closed는 예약 기간이 끝났는지(KST)."""

    product_id: str
    product_name: str
    stage_id: str
    stage_name: str
    ends_at: date
    count: int
    closed: bool


class DashboardTodo(CamelModel):
    # '답하지 않은 문의': AI 답변 확인 요청만 열린 대화는 빼고 센다(DEV-296)
    open_questions: int
    # 'AI 답변 확인 요청': 농가 전체의 열린 확인 요청 수(DEV-296)
    ai_check_requests: int = 0
    to_ship: int
    pending_products: int
    awaiting_deposit: int
    refunds_to_settle: int
    has_account: bool
    # DEV-231: 예약 기간이 끝난 기간의 예약 완료 주문 수, 수확을 시작할 수 있는 기간들
    to_harvest: int = 0
    harvest_targets: list[HarvestTarget] = []


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
