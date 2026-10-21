"""관리자 페이지에서 테스트 농가를 숨기고 되돌린다(DEV-98).

조건과 동작은 운영 명령 retire_test_farm(DEV-93)과 같다. 행은 지우지 않고 농가를 SUSPENDED로
바꾼다. 실행할 때마다 운영자 이름으로 감사 이벤트를 남긴다(run_manager_action).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.accounts.models import User
from app.admin.retire_test_farm import (
    RETIRE_REASON,
    Result,
    RetireRefused,
    _result,
    check_restore,
    check_retire,
    is_retired,
    restore_in,
    retire_in,
)
from app.admin.schemas import TestFarmPreview, TestFarmResult, TestFarmView
from app.admin.service import run_manager_action
from app.catalog.models import Product
from app.core.db import get_db
from app.core.errors import conflict, not_found
from app.core.security import Admin
from app.farms.models import Farm

router = APIRouter(prefix="/admin/farms", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


@router.get("", response_model=list[TestFarmView])
def list_farms(db: Db, _: Admin):
    """공개 중인 승인 농가와 이 기능(또는 명령)으로 숨긴 농가. 숨긴 농가를 먼저, 그다음 이름순."""
    products = select(Product.farm_id, func.count().label("n")).group_by(Product.farm_id).subquery()
    rows = db.execute(
        select(Farm, User, func.coalesce(products.c.n, 0))
        .join(User, User.id == Farm.producer_id)
        .outerjoin(products, products.c.farm_id == Farm.id)
        .where(
            or_(
                Farm.approval_status == "APPROVED",
                (Farm.approval_status == "SUSPENDED") & (Farm.suspend_reason == RETIRE_REASON),
            )
        )
    ).all()
    views = [
        TestFarmView(
            farm_id=farm.id,
            name=farm.name,
            region=farm.region,
            producer_id=farm.producer_id,
            producer_name=user.name,
            producer_is_test_account=user.is_test_account,
            hidden=is_retired(farm),
            product_count=count,
        )
        for farm, user, count in rows
    ]
    return sorted(views, key=lambda v: (not v.hidden, v.name))


@router.get("/{farm_id}/preview", response_model=TestFarmPreview)
def preview(db: Db, _: Admin, farm_id: str):
    """바꾸지 않고, 숨기기(또는 숨긴 농가면 되돌리기)를 하면 어떻게 되는지 알려 준다."""
    farm = db.get(Farm, farm_id)
    if farm is None:
        raise not_found("농가를 찾을 수 없어요.")
    action = "restore" if is_retired(farm) else "retire"
    try:
        if action == "restore":
            check_restore(farm, farm_id)
        else:
            check_retire(db, farm, farm_id)
        refusal = None
    except RetireRefused as exc:
        refusal = str(exc)
    result = _result(db, farm)
    return TestFarmPreview(
        farm_id=farm.id,
        name=farm.name,
        region=farm.region,
        producer_id=farm.producer_id,
        action=action,
        refusal=refusal,
        open_orders=result.open_orders,
        reported_deposits=result.reported_deposits,
    )


def _view(db: Session, result: Result) -> TestFarmResult:
    farm = db.get(Farm, result.farm_id)
    return TestFarmResult(
        farm_id=result.farm_id,
        name=result.name,
        hidden=is_retired(farm),
        open_orders=result.open_orders,
        reported_deposits=result.reported_deposits,
    )


def _act(db: Session, admin_id: str, farm_id: str, key: str | None, undo: bool):
    """run_manager_action이 멱등 키 저장과 커밋, 거부(409)·실패 감사를 맡는다."""
    if db.get(Farm, farm_id) is None:
        raise not_found("농가를 찾을 수 없어요.")

    def run(_: str) -> TestFarmResult:
        try:
            result = (restore_in if undo else retire_in)(db, farm_id, commit=True, audit=False)
        except RetireRefused as exc:
            raise conflict("TEST_FARM_REFUSED", str(exc)) from exc
        return _view(db, result)

    verb = "restore" if undo else "retire"
    return run_manager_action(
        db,
        actor_id=admin_id,
        action=f"test_farm.{verb}",
        target_type="farm",
        target_id=farm_id,
        scope=f"test-farm-{verb}:{farm_id}",
        key=key,
        body={},
        run=run,
    )


@router.post("/{farm_id}/retire", response_model=TestFarmResult)
def retire_farm(db: Db, admin: Admin, farm_id: str, key: IdempotencyKey = None):
    return _act(db, admin.id, farm_id, key, undo=False)


@router.post("/{farm_id}/restore", response_model=TestFarmResult)
def restore_farm(db: Db, admin: Admin, farm_id: str, key: IdempotencyKey = None):
    return _act(db, admin.id, farm_id, key, undo=True)
