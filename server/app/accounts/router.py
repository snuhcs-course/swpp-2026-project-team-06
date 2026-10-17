from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.accounts import service
from app.accounts.schemas import (
    Address,
    AddressInput,
    App,
    LoginResult,
    ProducerApplication,
    ProducerApplicationInput,
    ProducerDecision,
    ProducerDecisionHistoryView,
    ProducerDecisionInput,
    TestAccount,
    TestLoginInput,
    UserView,
)
from app.core.db import get_db
from app.core.security import Admin, Consumer, CurrentUser, Producer

router = APIRouter(prefix="/auth", tags=["accounts"])
admin_router = APIRouter(prefix="/admin/producers", tags=["admin"])

Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


@router.get("/test-accounts", response_model=list[TestAccount])
def test_accounts(db: Db, app: Annotated[App, Query()]):
    """앱별 시드 테스트 계정(ADR 0009·0010). MOCK_LOGIN_ENABLED가 꺼지면 404."""
    return service.test_accounts(db, app)


@router.post("/test-login", response_model=LoginResult)
def test_login(db: Db, body: TestLoginInput):
    """시드 테스트 계정으로 로그인. 앱과 역할이 다르면 403 WRONG_APP."""
    return service.test_login(db, body.user_id, body.app)


@router.get("/me", response_model=UserView)
def me(db: Db, user: CurrentUser):
    return service.user_view(db, user)


@router.post("/producer-application", response_model=ProducerApplication)
def submit_producer_application(db: Db, user: Producer, body: ProducerApplicationInput):
    service.submit_producer_application(db, user, body)
    db.commit()
    return service.producer_application(db, user)


@router.get("/producer-application", response_model=ProducerApplication)
def producer_application(db: Db, user: Producer):
    return service.producer_application(db, user)


@router.get("/me/addresses", response_model=list[Address])
def my_addresses(db: Db, user: Consumer):
    return service.list_addresses(db, user.id)


@router.post("/me/addresses", response_model=Address)
def add_address(db: Db, user: Consumer, body: AddressInput):
    address = service.add_address(db, user.id, body)
    db.commit()
    return address


@admin_router.post("/{farm_id}/approve", response_model=ProducerDecision)
def approve_producer(db: Db, admin: Admin, farm_id: str, key: IdempotencyKey = None):
    from app.admin.service import run_manager_action

    return run_manager_action(
        db,
        actor_id=admin.id,
        action="producer.approve",
        target_type="farm",
        target_id=farm_id,
        scope=f"producer-approve:{farm_id}",
        key=key,
        body={},
        run=lambda _: service.decide_producer_application(db, farm_id, True, admin.id),
    )


@admin_router.post("/{farm_id}/reject", response_model=ProducerDecision)
def reject_producer(
    db: Db,
    admin: Admin,
    farm_id: str,
    body: ProducerDecisionInput,
    key: IdempotencyKey = None,
):
    from app.admin.service import run_manager_action

    raw = body.model_dump(by_alias=True)
    return run_manager_action(
        db,
        actor_id=admin.id,
        action="producer.reject",
        target_type="farm",
        target_id=farm_id,
        scope=f"producer-reject:{farm_id}",
        key=key,
        body=raw,
        run=lambda _: service.decide_producer_application(
            db, farm_id, False, admin.id, body.reason
        ),
    )


@admin_router.get("/{farm_id}/decisions", response_model=list[ProducerDecisionHistoryView])
def producer_decisions(db: Db, _: Admin, farm_id: str):
    return service.producer_decision_history(db, farm_id)
