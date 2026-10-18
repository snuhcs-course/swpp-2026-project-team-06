"""accounts 모듈 Pydantic 입출력 스키마 (screens.md 7.2 accounts)."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

App = Literal["consumer", "producer"]
FarmStatus = Literal["NONE", "PENDING", "REJECTED", "APPROVED", "SUSPENDED"]


class TestAccount(CamelModel):
    user_id: str
    name: str
    role: str
    farm_status: FarmStatus
    farm_name: str | None


ConsentKind = Literal["TERMS", "PRIVACY", "AGE14", "MARKETING"]
REQUIRED_CONSENTS: tuple[ConsentKind, ...] = ("TERMS", "PRIVACY", "AGE14")


class UserView(CamelModel):
    user_id: str
    name: str
    role: str
    is_test_account: bool
    farm_id: str | None
    farm_status: FarmStatus
    suspend_reason: str | None = None
    # 가입 온보딩(FEAT-01 I2). 소비자 카카오 계정만 의미 있고 테스트 계정·생산자는 항상 false
    nickname: str | None = None
    email: str | None = None
    phone: str = ""
    needs_onboarding: bool = False


class MeUpdateInput(CamelModel):
    """내 정보 고치기(온보딩 1장·SCR-17 프로필). 보낸 필드만 바꾼다."""

    nickname: str | None = Field(default=None, max_length=50)
    name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=32)


class ConsentInput(CamelModel):
    kind: ConsentKind
    version: str = Field(min_length=1, max_length=32)
    agreed: bool = True


class ConsentsInput(CamelModel):
    consents: list[ConsentInput] = Field(min_length=1, max_length=8)


class ConsentView(CamelModel):
    kind: ConsentKind
    version: str
    agreed: bool
    agreed_at: datetime


class TestLoginInput(CamelModel):
    user_id: str
    app: App


class LoginResult(CamelModel):
    access_token: str
    user: UserView


class KakaoConfig(CamelModel):
    """카카오 로그인 사용 여부(ADR 0003). REST API 키가 없으면 enabled=false."""

    enabled: bool
    client_id: str | None
    redirect_path: str


class KakaoLoginInput(CamelModel):
    code: str = Field(min_length=1, max_length=512)
    redirect_uri: str = Field(max_length=512)
    app: App


class ProducerApplicationInput(CamelModel):
    owner_name: str = Field(max_length=100)
    farm_name: str = Field(max_length=100)
    region: str = Field(max_length=100)
    main_items: str = Field(max_length=200)
    phone: str = Field(max_length=32)


class ProducerApplication(ProducerApplicationInput):
    farm_id: str
    status: Literal["PENDING", "REJECTED", "APPROVED", "SUSPENDED"]
    reject_reason: str | None
    submitted_at: datetime
    decided_at: datetime | None


class ProducerDecisionInput(CamelModel):
    reason: str = Field(min_length=1, max_length=500)


class ProducerDecision(CamelModel):
    farm_id: str
    status: Literal["APPROVED", "REJECTED"]
    reject_reason: str | None
    decided_at: datetime


class ProducerDecisionHistoryView(CamelModel):
    decision_id: str
    farm_id: str
    application_at: datetime
    decision: Literal["APPROVED", "REJECTED"]
    reason: str | None
    manager_id: str
    decided_at: datetime


class AddressInput(CamelModel):
    recipient_name: str = ""
    recipient_phone: str = ""
    postal_code: str = ""
    address: str = ""
    address_detail: str = ""
    label: str | None = Field(default=None, max_length=50)
    is_default: bool = False


class AddressPatchInput(CamelModel):
    """배송지 수정. 보낸 필드만 바꾼다."""

    recipient_name: str | None = None
    recipient_phone: str | None = None
    postal_code: str | None = None
    address: str | None = None
    address_detail: str | None = None
    label: str | None = Field(default=None, max_length=50)
    is_default: bool | None = None


class Address(CamelModel):
    address_id: str
    recipient_name: str
    recipient_phone: str
    postal_code: str
    address: str
    address_detail: str
    label: str | None
    is_default: bool
