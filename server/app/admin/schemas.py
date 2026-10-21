"""운영자 예외 목록·복구 API 스키마."""

from datetime import datetime
from typing import Any

from app.core.schemas import CamelModel


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
