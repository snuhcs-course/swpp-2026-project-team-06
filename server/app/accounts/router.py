from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.accounts import service
from app.accounts.schemas import (
    Address,
    AddressInput,
    AddressPatchInput,
    App,
    ApplicationFilter,
    ConsentsInput,
    ConsentView,
    KakaoConfig,
    KakaoLoginInput,
    LoginResult,
    MeUpdateInput,
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


@router.get("/kakao/config", response_model=KakaoConfig)
def kakao_config():
    """카카오 로그인 사용 여부와 클라이언트 ID(ADR 0003). REST API 키가 없으면 enabled=false."""
    return service.kakao_config()


@router.post("/kakao", response_model=LoginResult)
def kakao_login(db: Db, body: KakaoLoginInput):
    """카카오 인가 코드로 로그인. (식별자, 역할)로 그 앱 계정을 찾거나 만든다(ADR 0003·0010)."""
    result = service.kakao_login(db, body.code, body.redirect_uri, body.app)
    db.commit()
    return result


@router.get("/me", response_model=UserView)
def me(db: Db, user: CurrentUser):
    return service.user_view(db, user)


@router.patch("/me", response_model=UserView)
def update_me(db: Db, user: Consumer, body: MeUpdateInput):
    """온보딩 1장·프로필 수정(FEAT-01 I2): 닉네임·이름·휴대폰. 보낸 필드만 바꾼다."""
    result = service.update_me(db, user, body)
    db.commit()
    return result


@router.get("/me/consents", response_model=list[ConsentView])
def my_consents(db: Db, user: CurrentUser):
    return service.consent_views(db, user.id)


@router.post("/me/consents", response_model=list[ConsentView])
def save_consents(db: Db, user: CurrentUser, body: ConsentsInput):
    """가입·재동의 기록(AC-01-14·17·18). 소비자·생산자 모두. 항목·버전·시각을 남긴다."""
    result = service.save_consents(db, user, body)
    db.commit()
    return result


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
    """배송지 저장. 계정당 50개까지, 넘으면 409 ADDRESS_LIMIT."""
    address = service.add_address(db, user.id, body)
    db.commit()
    return address


@router.patch("/me/addresses/{address_id}", response_model=Address)
def update_address(db: Db, user: Consumer, address_id: str, body: AddressPatchInput):
    address = service.update_address(db, user.id, address_id, body.model_dump(exclude_unset=True))
    db.commit()
    return address


@router.delete("/me/addresses/{address_id}", status_code=204)
def delete_address(db: Db, user: Consumer, address_id: str):
    service.delete_address(db, user.id, address_id)
    db.commit()
    return None


@admin_router.get("", response_model=list[ProducerApplication])
def producer_applications(
    db: Db,
    _: Admin,
    status: Annotated[ApplicationFilter, Query()] = "PENDING",
):
    """가입 신청 목록(운영자, DEV-82). 기본 확인 중(PENDING), ALL이면 전부. 신청 최신순."""
    return service.list_producer_applications(db, None if status == "ALL" else status)


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
