from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.accounts import service
from app.accounts.schemas import (
    Address,
    AddressInput,
    App,
    LoginResult,
    TestAccount,
    TestLoginInput,
    UserView,
)
from app.core.db import get_db
from app.core.security import Consumer, CurrentUser

router = APIRouter(prefix="/auth", tags=["accounts"])

Db = Annotated[Session, Depends(get_db)]


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


@router.get("/me/addresses", response_model=list[Address])
def my_addresses(db: Db, user: Consumer):
    return service.list_addresses(db, user.id)


@router.post("/me/addresses", response_model=Address)
def add_address(db: Db, user: Consumer, body: AddressInput):
    address = service.add_address(db, user.id, body)
    db.commit()
    return address
