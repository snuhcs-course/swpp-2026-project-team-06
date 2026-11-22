"""accounts 모듈 Pydantic 입출력 스키마 (screens.md 7.2 accounts)."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

App = Literal["consumer", "producer"]
FarmStatus = Literal["NONE", "PENDING", "REJECTED", "APPROVED", "SUSPENDED"]
# 운영자 가입 신청 목록 필터(DEV-82)
ApplicationFilter = Literal["PENDING", "REJECTED", "APPROVED", "SUSPENDED", "ALL"]


class TestAccount(CamelModel):
    user_id: str
    name: str
    role: str
    farm_status: FarmStatus
    farm_name: str | None


ConsentKind = Literal["TERMS", "PRIVACY", "AGE14", "MARKETING"]
REQUIRED_CONSENTS: tuple[ConsentKind, ...] = ("TERMS", "PRIVACY", "AGE14")
# 생산자는 약관·개인정보만 받는다(만 14세는 소비자 가입 항목, DEV-113)
REQUIRED_PRODUCER_CONSENTS: tuple[ConsentKind, ...] = ("TERMS", "PRIVACY")
# 지금 시행 중인 약관·처리방침 문구 버전(시행일). 바꾸면 모든 회원이 다시 동의해야 쓸 수 있다
# (DEV-113, policy.md 5장). 앱(packages/ui legalContent LEGAL_VERSION)·Mock(packages/api
# mock/db.ts)과 같은 값이어야 한다(scripts/test-legal.mjs가 확인)
CONSENT_VERSION = "2026-11-20"
# 농가에게 알리는 법정 안내(DEV-121). 원산지 표시제도 안내
# (원산지표시법 제6조 ⑥, 시행규칙 제4조의2 1호). 안내 본문(packages/ui legalContent
# ORIGIN_NOTICE_VERSION)·Mock(packages/api mock/db.ts)과 같은 값이어야 한다.
# 본문을 바꾸면 버전을 올려 다시 읽게 한다(동의 버전과 따로 움직인다)
NoticeKind = Literal["ORIGIN"]
ORIGIN_NOTICE_VERSION = "2026-10-22"


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
    # 필수 동의가 없거나 지금 버전이 아니다(DEV-113). 소비자·생산자 모두. 테스트 계정은 항상 false
    consent_required: bool = False
    # 원산지 표시제도 안내 지금 버전을 읽은 시각(DEV-121). 생산자만 채우고, 안 읽었으면 None
    origin_notice_read_at: datetime | None = None
    # 아이디·비밀번호 계정(DEV-363). 카카오·테스트 계정은 username이 없다
    username: str | None = None
    # 운영자가 준 임시 비밀번호로 들어왔다. 앱은 비밀번호 변경 화면만 연다
    must_change_password: bool = False


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


class NoticeReadInput(CamelModel):
    kind: NoticeKind
    version: str = Field(min_length=1, max_length=32)


class NoticeReadView(CamelModel):
    kind: NoticeKind
    version: str
    read_at: datetime


class TestLoginInput(CamelModel):
    user_id: str
    app: App


class LoginResult(CamelModel):
    access_token: str
    user: UserView


class KakaoSignup(CamelModel):
    """카카오 새 사용자. 계정은 없고 약관 동의 뒤 `/api/auth/kakao/signup`으로 만든다(DEV-132)."""

    signup_token: str
    email: str | None = None


class KakaoLoginResult(CamelModel):
    """기존 회원은 access_token·user, 새 사용자는 signup만 채운다(DEV-132)."""

    access_token: str | None = None
    user: UserView | None = None
    signup: KakaoSignup | None = None


class KakaoSignupInput(CamelModel):
    signup_token: str = Field(min_length=1, max_length=4096)
    consents: list[ConsentInput] = Field(min_length=1, max_length=8)


# ---- 아이디·비밀번호 (DEV-363) ----
# 길이 상한은 아주 큰 본문만 막는다. 8~128자 정책은 서비스가 문구와 함께 본다(검증 오류에는 입력값이
# 나가지 않고, 비밀번호 칸 메시지는 고정 문구로 바뀐다 — core/errors.py)
SECRET_MAX = 1024


class PasswordLoginInput(CamelModel):
    app: App
    username: str = Field(max_length=64)
    password: str = Field(max_length=SECRET_MAX)


class PasswordChangeInput(CamelModel):
    current_password: str = Field(max_length=SECRET_MAX)
    new_password: str = Field(max_length=SECRET_MAX)


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


AccountKind = Literal["REAL", "SEED_TEST", "OPS_TESTER"]
KindFilter = Literal["real", "test", "all"]


class AdminProducerApplication(ProducerApplication):
    """운영자 가입 신청 목록 한 줄. 생산자 계정 종류와 탈퇴 여부를 더한다(DEV-307)."""

    producer_id: str
    account_kind: AccountKind
    withdrawn: bool


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
    recipient_name: str = Field(default="", max_length=100)
    recipient_phone: str = Field(default="", max_length=32)
    postal_code: str = Field(default="", max_length=16)
    address: str = Field(default="", max_length=300)
    address_detail: str = Field(default="", max_length=300)
    label: str | None = Field(default=None, max_length=50)
    is_default: bool = False


class AddressPatchInput(CamelModel):
    """배송지 수정. 보낸 필드만 바꾼다.

    null은 ‘바꾸지 않음’이다(배송지 이름을 지우려면 빈 문자열). `isDefault=false`는 무시한다:
    기본은 다른 배송지를 기본으로 바꾸거나 지울 때만 옮긴다.
    """

    recipient_name: str | None = Field(default=None, max_length=100)
    recipient_phone: str | None = Field(default=None, max_length=32)
    postal_code: str | None = Field(default=None, max_length=16)
    address: str | None = Field(default=None, max_length=300)
    address_detail: str | None = Field(default=None, max_length=300)
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


class IdAccountInput(CamelModel):
    """운영자가 만드는 아이디 계정(PM 11/18: 공개 가입 없음). 비밀번호는 서버가 임시로 만든다."""

    app: App
    username: str = Field(max_length=64)
    # 소비자: 농가에 보이는 닉네임(필수). 생산자: 가입 신청 전 계정 이름(선택, 비면 ‘농가 사용자’)
    nickname: str | None = Field(default=None, max_length=50)
    # 소비자 휴대폰(선택). 비면 첫 로그인 온보딩(SCR-06)에서 받는다
    phone: str | None = Field(default=None, max_length=32)


class IdCredentialsProvisionInput(CamelModel):
    """기존 시드 생산자에게 운영자 ID 로그인 자격 증명을 붙인다(DEV-439)."""

    username: str = Field(max_length=64)


class IdAccountView(CamelModel):
    """운영자 아이디 계정 목록 한 줄. 전화는 끝 4자리만."""

    user_id: str
    role: str
    username: str
    nickname: str | None
    name: str
    phone_last4: str | None
    must_change_password: bool
    consented: bool
    farm_status: str | None
    created_at: datetime
    withdrawn: bool
    account_kind: AccountKind


class IdAccountCreated(IdAccountView):
    """만든 직후 응답. `temporary_password`는 이 응답에 한 번만 있다.

    같은 멱등 키로 다시 보내면 비어 있다.
    `issue_id`는 이번 발급을 가리키는 값이고 비밀번호가 아니다.
    """

    issue_id: str
    temporary_password: str | None = None


class TemporaryPasswordView(CamelModel):
    """운영자에게 한 번만 보이는 임시 비밀번호. 서버는 해시만 저장하고 감사에도 남기지 않는다."""

    user_id: str
    username: str
    temporary_password: str
    must_change_password: bool = True
