"""운영자 예외 조회·복구 API."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.admin import service
from app.admin.schemas import ManagerEventPage, ManagerEventView
from app.core.db import get_db
from app.core.pagination import page_limit
from app.core.security import Admin

router = APIRouter(prefix="/admin/exceptions", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]


@router.get("", response_model=ManagerEventPage)
def list_exceptions(
    db: Db,
    _: Admin,
    limit: Annotated[int, Depends(page_limit)],
    status: str | None = None,
    type: Annotated[str | None, Query()] = None,
    cursor: str | None = None,
):
    return service.list_events(db, status, type, cursor, limit)


@router.get("/{exception_id}", response_model=ManagerEventView)
def get_exception(db: Db, _: Admin, exception_id: str):
    return service.event_detail(db, exception_id)


@router.post("/{exception_id}/retry", response_model=ManagerEventView)
def retry_exception(db: Db, admin: Admin, exception_id: str):
    return service.retry_event(db, exception_id, admin.id)


@router.post("/{exception_id}/resolve", response_model=ManagerEventView)
def resolve_exception(db: Db, admin: Admin, exception_id: str):
    return service.resolve_event(db, exception_id, admin.id)
