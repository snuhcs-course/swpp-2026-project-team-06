"""accounts 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

import re
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import ShippingAddress, User, UserConsent
from app.accounts.schemas import (
    REQUIRED_CONSENTS,
    Address,
    AddressInput,
    ConsentsInput,
    ConsentView,
    KakaoConfig,
    LoginResult,
    MeUpdateInput,
    ProducerApplication,
    ProducerApplicationInput,
    ProducerDecision,
    ProducerDecisionHistoryView,
    TestAccount,
    UserView,
)
from app.core.clock import now
from app.core.config import get_settings
from app.core.errors import conflict, forbidden, invalid, not_found
from app.core.ids import new_id
from app.core.security import issue_token

PHONE = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")
# 저장 배송지는 계정당 50개까지(사용자 결정 10/18)
ADDRESS_LIMIT = 50

# 앱별 시드 테스트 계정 순서(ADR 0009·0010, 화면 SCR-05·SCR-19)
TEST_ACCOUNTS = {
    "consumer": ["u-minji", "u-seojun"],
    "producer": ["u-kang", "u-misook", "u-new", "u-soonja", "u-taeho"],
}
APP_ROLE = {"consumer": "CONSUMER", "producer": "PRODUCER"}


def get_user(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def get_users(db: Session, user_ids: list[str]) -> dict[str, User]:
    if not user_ids:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))}


def _require_mock_login() -> None:
    if not get_settings().mock_login_enabled:
        raise not_found("지금은 테스트 로그인을 쓸 수 없어요.")


def public_name(user: User | None) -> str:
    """농가에 보이는 소비자 이름(R-15). 닉네임, 없으면 이름 앞 글자 + ○○."""
    if user is None:
        return "고○○"
    if user.nickname:
        return user.nickname
    return f"{(user.name or '고')[:1]}○○"


def list_consents(db: Session, user_id: str) -> list[UserConsent]:
    return list(db.scalars(select(UserConsent).where(UserConsent.user_id == user_id)))


def needs_onboarding(db: Session, user: User) -> bool:
    """첫 가입 온보딩이 남았는가(FEAT-01 I2, AC-01-12). 소비자 카카오 계정만 해당한다.

    닉네임·이름·연락처 중 하나라도 없거나 필수 동의(약관·개인정보·만 14세)가 빠지면 true.
    테스트 계정은 시드가 채운 것으로 보고 항상 false.
    """
    if user.role != "CONSUMER" or user.is_test_account:
        return False
    if not (user.nickname or "").strip() or not user.name.strip() or not user.phone.strip():
        return True
    agreed = {c.kind for c in list_consents(db, user.id) if c.agreed}
    return any(kind not in agreed for kind in REQUIRED_CONSENTS)


def user_view(db: Session, user: User) -> UserView:
    from app.farms import service as farms

    farm = farms.get_farm_of_producer(db, user.id) if user.role == "PRODUCER" else None
    return UserView(
        user_id=user.id,
        name=user.name,
        role=user.role,
        is_test_account=user.is_test_account,
        farm_id=farm.id if farm else None,
        farm_status=farm.approval_status if farm else "NONE",
        suspend_reason=farm.suspend_reason if farm else None,
        nickname=user.nickname,
        email=user.email,
        phone=user.phone,
        needs_onboarding=needs_onboarding(db, user),
    )


def update_me(db: Session, user: User, data: MeUpdateInput) -> UserView:
    """온보딩 1장·프로필 수정(SCR-17). 보낸 필드만 검증해 바꾼다."""
    fields: dict[str, str] = {}
    if data.nickname is not None:
        nickname = data.nickname.strip()
        if not 2 <= len(nickname) <= 12:
            fields["nickname"] = "닉네임은 2~12자로 적어 주세요"
    if data.name is not None:
        name = data.name.strip()
        if not 2 <= len(name) <= 20:
            fields["name"] = "이름은 2~20자로 적어 주세요"
    if data.phone is not None and not PHONE.fullmatch(data.phone.strip()):
        fields["phone"] = "휴대폰 번호 형식으로 입력해 주세요"
    if fields:
        raise invalid(fields)
    if data.nickname is not None:
        user.nickname = data.nickname.strip()
    if data.name is not None:
        user.name = data.name.strip()
    if data.phone is not None:
        user.phone = data.phone.strip()
    db.flush()
    return user_view(db, user)


def save_consents(db: Session, user: User, data: ConsentsInput) -> list[ConsentView]:
    """가입 동의 저장(AC-01-14). 항목마다 최근 한 줄, 시각·버전을 기록한다(R-03과 같은 방식)."""
    existing = {c.kind: c for c in list_consents(db, user.id)}
    at = now()
    for item in data.consents:
        row = existing.get(item.kind)
        if row is None:
            row = UserConsent(id=new_id("c"), user_id=user.id, kind=item.kind)
            db.add(row)
            existing[item.kind] = row
        row.version = item.version.strip()
        row.agreed = item.agreed
        row.agreed_at = at
    db.flush()
    return consent_views(db, user.id)


def consent_views(db: Session, user_id: str) -> list[ConsentView]:
    return [
        ConsentView(kind=c.kind, version=c.version, agreed=c.agreed, agreed_at=c.agreed_at)
        for c in sorted(list_consents(db, user_id), key=lambda c: c.kind)
    ]


def test_accounts(db: Session, app: str) -> list[TestAccount]:
    from app.farms import service as farms

    _require_mock_login()
    users = get_users(db, TEST_ACCOUNTS[app])
    result = []
    for uid in TEST_ACCOUNTS[app]:
        user = users.get(uid)
        if user is None or not user.is_test_account:
            continue
        farm = farms.get_farm_of_producer(db, uid)
        result.append(
            TestAccount(
                user_id=uid,
                name=user.name,
                role=user.role,
                farm_status=farm.approval_status if farm else "NONE",
                farm_name=farm.name if farm else None,
            )
        )
    return result


def test_login(db: Session, user_id: str, app: str) -> LoginResult:
    """시드 테스트 계정만 로그인한다. 새 계정은 만들지 않는다(AC-01-4)."""
    _require_mock_login()
    user = get_user(db, user_id)
    if user is None or not user.is_test_account:
        raise not_found("테스트 계정이 아니에요.")
    if user.role != APP_ROLE[app]:
        raise forbidden("이 앱의 계정이 아니에요.", reason="WRONG_APP")
    return LoginResult(access_token=issue_token(user.id, user.role), user=user_view(db, user))


# ---- 카카오 로그인 (FEAT-01 I2, ADR 0003·0010) ----

KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_ME_URL = "https://kapi.kakao.com/v2/user/me"
# 각 앱의 복귀 경로. 카카오 개발자 콘솔에는 <앱 주소>/auth/kakao 를 등록한다
KAKAO_REDIRECT_PATH = "/auth/kakao"
KAKAO_TIMEOUT_SECONDS = 8.0


class KakaoError(Exception):
    """카카오 토큰 교환·사용자 조회 실패."""


def kakao_config() -> KakaoConfig:
    settings = get_settings()
    enabled = bool(settings.kakao_rest_api_key)
    return KakaoConfig(
        enabled=enabled,
        client_id=settings.kakao_rest_api_key if enabled else None,
        redirect_path=KAKAO_REDIRECT_PATH,
    )


def _require_kakao() -> None:
    if not get_settings().kakao_rest_api_key:
        raise not_found("지금은 카카오 로그인을 쓸 수 없어요.")


def _allowed_redirect(redirect_uri: str, app: str) -> bool:
    """그 앱 주소의 /auth/kakao 만 허용한다(CORS 허용 목록과 같은 출처).

    다른 앱 주소로 받은 코드는 거절한다.
    """
    settings = get_settings()
    base = settings.consumer_app_url if app == "consumer" else settings.producer_app_url
    return redirect_uri == f"{base.rstrip('/')}{KAKAO_REDIRECT_PATH}"


# 이름이 없는 카카오 생산자 계정의 자리 이름(가입 신청 SCR-20에서 대표자 이름으로 바뀐다)
KAKAO_PLACEHOLDER_NAME = "카카오 사용자"


@dataclass(frozen=True)
class KakaoProfile:
    """카카오에서 받은 것. 식별은 kakao_id, 이메일은 연락용.

    이름·전화번호는 비즈 앱 동의항목 심사 뒤에만 온다(2단계).
    """

    kakao_id: str
    email: str = ""
    name: str = ""
    phone: str = ""


def _kakao_phone(raw: str) -> str:
    """카카오 전화번호(+82 10-1234-5678)를 010-1234-5678 꼴로. 국내 번호가 아니면 빈 값."""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("82"):
        digits = "0" + digits[2:]
    if len(digits) == 11 and digits.startswith("01"):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    if len(digits) == 10 and digits.startswith("01"):
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return ""


def _kakao_fetch(code: str, redirect_uri: str) -> KakaoProfile:
    """인가 코드 → 카카오 식별자와 동의받은 항목(이메일, 심사 뒤 이름·전화번호).

    빠진 값은 온보딩에서 직접 입력한다(FEAT-01 I2). 테스트에서 바꿔 끼운다.
    """
    settings = get_settings()
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.kakao_rest_api_key,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    if settings.kakao_client_secret:
        data["client_secret"] = settings.kakao_client_secret
    with httpx.Client(timeout=KAKAO_TIMEOUT_SECONDS) as http:
        token = http.post(
            KAKAO_TOKEN_URL,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        )
        if token.status_code != 200:
            raise KakaoError(f"token exchange failed: {token.status_code}")
        access_token = token.json().get("access_token")
        if not access_token:
            raise KakaoError("token exchange returned no access_token")
        me = http.get(KAKAO_ME_URL, headers={"Authorization": f"Bearer {access_token}"})
        if me.status_code != 200:
            raise KakaoError(f"user lookup failed: {me.status_code}")
    body = me.json()
    kakao_id = body.get("id")
    if kakao_id is None:
        raise KakaoError("user lookup returned no id")
    account = body.get("kakao_account") or {}
    return KakaoProfile(
        kakao_id=str(kakao_id),
        email=str(account.get("email") or ""),
        name=str(account.get("name") or ""),
        phone=str(account.get("phone_number") or ""),
    )


def kakao_login(db: Session, code: str, redirect_uri: str, app: str) -> LoginResult:
    """카카오 인가 코드로 로그인. (카카오 식별자, 역할)마다 계정 하나(ADR 0010). 없으면 만든다.

    처음이면 이메일만 채운 계정을 만들고 `needsOnboarding=true`로 돌려준다.
    카카오에서 온 이름·전화번호는 빈 칸에만 채운다(온보딩에서 고친 값은 덮지 않는다).
    """
    _require_kakao()
    if not _allowed_redirect(redirect_uri, app):
        raise invalid(
            {"redirectUri": "허용된 복귀 주소가 아니에요"}, "카카오 로그인 주소를 확인해 주세요."
        )
    try:
        profile = _kakao_fetch(code, redirect_uri)
    except (KakaoError, httpx.HTTPError) as exc:
        raise invalid(
            {"code": "카카오 인증에 실패했어요"}, "카카오 로그인에 실패했어요. 다시 시도해 주세요."
        ) from exc
    role = APP_ROLE[app]
    kakao_phone = _kakao_phone(profile.phone)
    user = db.scalar(select(User).where(User.kakao_id == profile.kakao_id, User.role == role))
    if user is None:
        # 소비자는 온보딩에서 이름을 받는다. 생산자는 가입 신청(SCR-20) 전까지 자리 이름
        name = profile.name.strip()[:100]
        if not name and role == "PRODUCER":
            name = KAKAO_PLACEHOLDER_NAME
        user = User(
            id=new_id("u"),
            kakao_id=profile.kakao_id,
            is_test_account=False,
            role=role,
            name=name,
            phone=kakao_phone,
            email=profile.email.strip()[:200] or None,
            created_at=now(),
        )
        db.add(user)
    else:
        if profile.email.strip():
            user.email = profile.email.strip()[:200]
        if not user.name.strip() and profile.name.strip():
            user.name = profile.name.strip()[:100]
        if not user.phone.strip() and kakao_phone:
            user.phone = kakao_phone
    db.flush()
    return LoginResult(access_token=issue_token(user.id, user.role), user=user_view(db, user))


def _application_view(user: User, farm) -> ProducerApplication:
    return ProducerApplication(
        farm_id=farm.id,
        owner_name=user.name,
        farm_name=farm.name,
        region=farm.region,
        main_items=farm.main_items,
        phone=farm.contact_phone,
        status=farm.approval_status,
        reject_reason=farm.reject_reason,
        submitted_at=farm.applied_at,
        decided_at=farm.decided_at,
    )


def producer_application(db: Session, user: User) -> ProducerApplication:
    from app.farms import service as farms

    farm = farms.get_farm_of_producer(db, user.id)
    if farm is None:
        raise not_found("신청 내역이 없어요.")
    return _application_view(user, farm)


def list_producer_applications(db: Session, status: str | None) -> list[ProducerApplication]:
    """운영자 가입 신청 목록(DEV-82). 대표자 이름은 생산자 계정 이름."""
    from app.farms import service as farms

    rows = farms.list_applications(db, status)
    users = get_users(db, [f.producer_id for f in rows])
    return [_application_view(users[f.producer_id], f) for f in rows if f.producer_id in users]


def submit_producer_application(
    db: Session, user: User, data: ProducerApplicationInput
) -> ProducerApplication:
    from app.farms import service as farms

    fields = {}
    if not data.owner_name.strip():
        fields["ownerName"] = "대표자 이름을 적어 주세요"
    if not data.farm_name.strip():
        fields["farmName"] = "농가 이름을 적어 주세요"
    if not data.region.strip():
        fields["region"] = "지역을 적어 주세요"
    if not data.main_items.strip():
        fields["mainItems"] = "주로 키우는 것을 적어 주세요"
    if not PHONE.fullmatch(data.phone.strip()):
        fields["phone"] = "휴대폰 번호 형식으로 입력해 주세요"
    if fields:
        raise invalid(fields)

    locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise not_found()
    user = locked_user
    farm = farms.submit_application(
        db,
        producer_id=user.id,
        name=data.farm_name.strip(),
        region=data.region.strip(),
        main_items=data.main_items.strip(),
        contact_phone=data.phone.strip(),
    )
    user.name = data.owner_name.strip()
    db.flush()
    return _application_view(user, farm)


def decide_producer_application(
    db: Session,
    farm_id: str,
    approved: bool,
    manager_id: str,
    reason: str | None = None,
) -> ProducerDecision:
    from app.farms import service as farms

    farm = farms.decide_application(db, farm_id, approved, manager_id, reason)
    return ProducerDecision(
        farm_id=farm.id,
        status=farm.approval_status,
        reject_reason=farm.reject_reason,
        decided_at=farm.decided_at,
    )


def producer_decision_history(db: Session, farm_id: str) -> list[ProducerDecisionHistoryView]:
    from app.farms import service as farms

    return farms.decision_history(db, farm_id)


def _address(a: ShippingAddress) -> Address:
    return Address(
        address_id=a.id,
        recipient_name=a.recipient_name,
        recipient_phone=a.recipient_phone,
        postal_code=a.postal_code,
        address=a.address,
        address_detail=a.address_detail,
        label=a.label,
        is_default=a.is_default,
    )


def list_addresses(db: Session, user_id: str) -> list[Address]:
    rows = db.scalars(
        select(ShippingAddress)
        .where(ShippingAddress.user_id == user_id)
        .order_by(ShippingAddress.is_default.desc(), ShippingAddress.created_at)
    )
    return [_address(a) for a in rows]


def validate_recipient(name: str, phone: str, postal_code: str, address: str) -> dict[str, str]:
    fields = {}
    if not name.strip():
        fields["recipientName"] = "받는 사람을 적어 주세요"
    if not PHONE.match(phone.strip()):
        fields["recipientPhone"] = "휴대폰 번호 형식으로 입력해 주세요"
    if not postal_code.strip() or not address.strip():
        fields["address"] = "우편번호와 주소를 입력해 주세요"
    return fields


def add_address(db: Session, user_id: str, data: AddressInput) -> Address:
    fields = validate_recipient(
        data.recipient_name, data.recipient_phone, data.postal_code, data.address
    )
    if fields:
        raise invalid(fields)
    existing = db.scalars(select(ShippingAddress).where(ShippingAddress.user_id == user_id)).all()
    if len(existing) >= ADDRESS_LIMIT:
        raise conflict(
            "ADDRESS_LIMIT",
            f"배송지는 {ADDRESS_LIMIT}개까지 저장할 수 있어요. 안 쓰는 배송지를 지워 주세요.",
            limit=ADDRESS_LIMIT,
        )
    is_default = data.is_default or not existing
    if is_default:
        for a in existing:
            a.is_default = False
    row = ShippingAddress(
        id=new_id("a"),
        user_id=user_id,
        label=data.label,
        recipient_name=data.recipient_name.strip(),
        recipient_phone=data.recipient_phone.strip(),
        postal_code=data.postal_code.strip(),
        address=data.address.strip(),
        address_detail=data.address_detail.strip(),
        is_default=is_default,
        created_at=now(),
    )
    db.add(row)
    db.flush()
    return _address(row)


def _own_address(db: Session, user_id: str, address_id: str) -> ShippingAddress:
    row = db.get(ShippingAddress, address_id)
    if row is None or row.user_id != user_id:
        raise not_found("배송지를 찾을 수 없어요.")
    return row


def update_address(db: Session, user_id: str, address_id: str, data: dict) -> Address:
    """배송지 수정(SCR-17 하위). 보낸 필드만 바꾸고, 기본으로 바꾸면 다른 배송지의 기본을 내린다."""
    row = _own_address(db, user_id, address_id)
    merged = {
        "recipient_name": row.recipient_name,
        "recipient_phone": row.recipient_phone,
        "postal_code": row.postal_code,
        "address": row.address,
        "address_detail": row.address_detail,
        "label": row.label,
    }
    for key in merged:
        if key in data and data[key] is not None:
            merged[key] = data[key]
    fields = validate_recipient(
        merged["recipient_name"],
        merged["recipient_phone"],
        merged["postal_code"],
        merged["address"],
    )
    if fields:
        raise invalid(fields)
    row.recipient_name = merged["recipient_name"].strip()
    row.recipient_phone = merged["recipient_phone"].strip()
    row.postal_code = merged["postal_code"].strip()
    row.address = merged["address"].strip()
    row.address_detail = (merged["address_detail"] or "").strip()
    row.label = merged["label"]
    if data.get("is_default"):
        for a in db.scalars(select(ShippingAddress).where(ShippingAddress.user_id == user_id)):
            a.is_default = a is row
    db.flush()
    return _address(row)


def delete_address(db: Session, user_id: str, address_id: str) -> None:
    """배송지 삭제. 기본을 지우면 가장 최근 배송지가 기본이 된다. 지난 주문은 그대로."""
    row = _own_address(db, user_id, address_id)
    was_default = row.is_default
    db.delete(row)
    db.flush()
    if was_default:
        latest = db.scalar(
            select(ShippingAddress)
            .where(ShippingAddress.user_id == user_id)
            .order_by(ShippingAddress.created_at.desc(), ShippingAddress.id.desc())
            .limit(1)
        )
        if latest is not None:
            latest.is_default = True
            db.flush()


def save_order_address(db: Session, user_id: str, data: AddressInput) -> None:
    """주문서의 '기본 배송지로 저장'(FEAT-08). 같은 주소가 있으면 기본으로만 바꾼다.

    50개가 다 찼으면 주문은 그대로 두고 저장만 건너뛴다(주문이 배송지 한도에 막히지 않게).
    """
    rows = db.scalars(select(ShippingAddress).where(ShippingAddress.user_id == user_id)).all()
    same = next(
        (
            a
            for a in rows
            if a.address == data.address.strip() and a.address_detail == data.address_detail.strip()
        ),
        None,
    )
    if same is None and len(rows) >= ADDRESS_LIMIT:
        return
    for a in rows:
        a.is_default = a is same
    if same is None:
        add_address(db, user_id, data.model_copy(update={"is_default": True}))
