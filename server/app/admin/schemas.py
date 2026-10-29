"""운영자 예외 목록·복구 API 스키마."""

from datetime import datetime
from typing import Any, Literal

from app.core.schemas import CamelModel
from app.messaging.schemas import ChatMessage


class ManagerEventView(CamelModel):
    exception_id: str
    type: str
    actor_id: str | None
    target_type: str
    target_id: str
    request_summary: Any
    status: str
    retryable: bool
    attempts: int
    result: Any | None
    error_code: str | None
    error_message: str | None
    message_id: str | None
    last_retried_by: str | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    resolved_by: str | None


class ManagerEventPage(CamelModel):
    items: list[ManagerEventView]
    next_cursor: str | None


class TestFarmView(CamelModel):
    """관리자 페이지 테스트 농가 목록 한 줄(DEV-98)."""

    farm_id: str
    name: str
    region: str
    producer_id: str
    producer_name: str
    producer_is_test_account: bool
    hidden: bool
    product_count: int


class TestFarmPreview(CamelModel):
    """숨기기·되돌리기 시험 실행 결과. refusal이 있으면 실행하면 거부된다."""

    farm_id: str
    name: str
    region: str
    producer_id: str
    action: str
    refusal: str | None
    open_orders: dict[str, int]
    reported_deposits: int


class TestFarmResult(CamelModel):
    farm_id: str
    name: str
    hidden: bool
    open_orders: dict[str, int]
    reported_deposits: int


class AdminUserView(CamelModel):
    """관리자 페이지 사용자 목록 한 줄(DEV-107). 전화는 끝 4자리만 보인다."""

    user_id: str
    name: str
    nickname: str | None
    role: str
    signup: str  # SEED(kakao_id 없음) | KAKAO
    is_test_account: bool
    ops_tester: bool
    phone_last4: str | None
    created_at: datetime
    order_count: int
    farm_id: str | None
    farm_name: str | None
    farm_status: str | None


class AdminUserPage(CamelModel):
    items: list[AdminUserView]
    total: int


class SupportThreadView(CamelModel):
    """문의함 한 줄(DEV-111·DEV-150). kind가 PRODUCER면 target_id는 농가 ID, CONSUMER면 사용자 ID.

    waiting은 마지막 메시지가 문의라 답장이 필요한 상태.
    """

    kind: Literal["PRODUCER", "CONSUMER"]
    target_id: str
    name: str
    detail: str
    last_message: str
    last_sender_type: str
    last_at: datetime
    unread_count: int
    waiting: bool


class SupportThreadPage(CamelModel):
    kind: Literal["PRODUCER", "CONSUMER"]
    target_id: str
    name: str
    detail: str
    items: list[ChatMessage]
    unread_count: int


class SupportSendInput(CamelModel):
    text: str


class SupportReadInput(CamelModel):
    message_id: str


class SupportReadResult(CamelModel):
    unread_count: int
