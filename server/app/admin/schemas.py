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
