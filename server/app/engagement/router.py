"""Authenticated participation writes; public temperature contains aggregates only."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.pagination import page_limit
from app.core.schemas import Paged
from app.core.security import Admin, Consumer, OnboardedConsumer
from app.engagement import service
from app.engagement.schemas import (
    Achievements,
    ReportDecision,
    ReportInput,
    ReportRecord,
    ReportView,
    ReviewInput,
    ReviewView,
    Temperature,
)

router = APIRouter(prefix="/engagement", tags=["engagement"])
public_router = APIRouter(prefix="/farms", tags=["engagement"])
Db = Annotated[Session, Depends(get_db)]


@public_router.get("/{farm_id}/temperature", response_model=Temperature)
def temperature(db: Db, farm_id: str):
    return service.temperature(db, farm_id)


@router.get("/achievements", response_model=Achievements)
def achievements(db: Db, user: Consumer):
    return service.achievements(db, user.id)


@router.get("/reviews/{order_id}", response_model=ReviewView)
def review(db: Db, order_id: str, user: Consumer):
    return service.get_review(db, user.id, order_id)


@router.put("/reviews/{order_id}", response_model=ReviewView)
def save_review(db: Db, order_id: str, user: OnboardedConsumer, body: ReviewInput):
    result = service.save_review(db, user.id, order_id, body.stars)
    db.commit()
    return result


@router.post("/farms/{farm_id}/reports", response_model=ReportView)
def report(db: Db, farm_id: str, user: OnboardedConsumer, body: ReportInput):
    result = service.submit_report(db, user.id, farm_id, body.reason)
    db.commit()
    return result


@router.patch("/reports/{report_id}", response_model=ReportView)
def moderate_report(db: Db, report_id: str, user: Admin, body: ReportDecision):
    result = service.moderate_report(db, report_id, user.id, body)
    db.commit()
    return result


@router.get("/reports", response_model=Paged[ReportRecord])
def list_reports(
    db: Db,
    user: Admin,
    limit: Annotated[int, Depends(page_limit)],
    status: Literal["PENDING", "CONFIRMED", "REJECTED", "OVERTURNED"] = "PENDING",
    cursor: str | None = None,
):
    return service.list_reports(db, status, limit, cursor)
