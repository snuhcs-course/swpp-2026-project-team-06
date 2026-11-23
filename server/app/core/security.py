"""JWT 발급·검증과 역할 검사 (ADR 0009·0010, N-06). 권한은 항상 서버에서 검사한다."""

from collections.abc import Callable
from datetime import timedelta
from enum import StrEnum
from typing import Annotated

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ApiError, forbidden, unauthenticated

ALGORITHM = "HS256"


class Role(StrEnum):
    CONSUMER = "CONSUMER"
    PRODUCER = "PRODUCER"
    ADMIN = "ADMIN"


def issue_token(user_id: str, role: str, version: int = 0) -> str:
    """로그인 토큰. `ver`는 User.token_version과 같아야 쓸 수 있다.

    비밀번호를 바꾸면 버전이 올라 그 전 토큰이 끊긴다(DEV-363).
    """
    settings = get_settings()
    issued = now()
    payload = {
        "sub": user_id,
        "role": role,
        "ver": version,
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(minutes=settings.jwt_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


SIGNUP_TOKEN_TYPE = "kakao_signup"
SIGNUP_TOKEN_MINUTES = 30


def issue_signup_token(claims: dict) -> str:
    """카카오 새 사용자의 가입 토큰(DEV-132). 계정을 만들기 전 약관 동의 화면까지만 쓴다.

    서버에 저장하지 않는다. 카카오 인가 코드는 한 번만 쓸 수 있어 카카오에서 받은 값을 담아 넘긴다.
    """
    issued = now()
    payload = {
        **claims,
        "typ": SIGNUP_TOKEN_TYPE,
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(minutes=SIGNUP_TOKEN_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def read_signup_token(token: str) -> dict | None:
    """가입 토큰을 검증해 내용을 돌려준다. 서명·만료·종류가 틀리면 None."""
    try:
        claims = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[ALGORITHM],
            # 만료는 앱 시계(now)로 아래에서 본다. 로그인 토큰(_decode)과 같은 방식
            options={"require": ["exp", "typ"], "verify_exp": False},
        )
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != SIGNUP_TOKEN_TYPE or claims.get("exp", 0) < int(now().timestamp()):
        return None
    return claims


def _decode(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[ALGORITHM],
            options={"verify_exp": False},
        )
    except jwt.PyJWTError as exc:
        raise unauthenticated() from exc


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise unauthenticated()
    return token


def _user_from_token(db: Session, token: str):
    from app.accounts import service as accounts

    payload = _decode(token)
    # 만료는 고정 시계(FIXED_NOW) 기준으로 직접 확인한다.
    if payload.get("exp", 0) < int(now().timestamp()):
        raise unauthenticated("로그인이 만료됐어요. 다시 로그인해 주세요.")
    user = accounts.get_user(db, str(payload.get("sub", "")))
    # 탈퇴한 회원(DEV-94)의 토큰은 받지 않는다
    if user is None or user.deleted_at is not None or user.uat_closed_at is not None:
        raise unauthenticated()
    # 비밀번호를 바꾸거나 임시 비밀번호를 받으면 버전이 올라 그 전 토큰은 끊긴다(DEV-363).
    # `ver`가 없는 옛 토큰은 0으로 본다
    try:
        version = int(payload.get("ver", 0))
    except (TypeError, ValueError):
        raise unauthenticated() from None
    if version != user.token_version:
        raise unauthenticated("비밀번호가 바뀌어 로그인이 풀렸어요. 다시 로그인해 주세요.")
    return user


# 계정 관문(DEV-363). 걸린 동안 열리는 (메서드, 경로)만 둔다. 나머지 로그인 API는 403
# 1) 운영자 임시 비밀번호로 들어왔으면 비밀번호부터 바꾼다
_PASSWORD_CHANGE_OPEN = {
    ("GET", "/api/auth/me"),
    ("POST", "/api/auth/me/password"),
}
# 2) 운영자가 만든 아이디 계정은 필수 약관에 동의해야 쓴다
#    (카카오 가입은 동의해야 계정이 생기는 것과 같은 규칙).
#    동의·온보딩 화면이 쓰는 API와 탈퇴만 열린다
_CONSENT_OPEN = _PASSWORD_CHANGE_OPEN | {
    ("GET", "/api/auth/me/consents"),
    ("POST", "/api/auth/me/consents"),
    ("PATCH", "/api/auth/me"),
    ("POST", "/api/auth/me/withdraw"),
}
_GATE_MESSAGES = {
    "PASSWORD_CHANGE_REQUIRED": "비밀번호를 바꾸면 쓸 수 있어요.",
    "ONBOARDING_REQUIRED": "가입을 마치면 쓸 수 있어요.",
    "CONSENT_REQUIRED": "약관에 동의하면 쓸 수 있어요.",
}


def account_gate(db: Session, user) -> str | None:
    """아이디 계정 관문 사유. 없으면 None.

    PASSWORD_CHANGE_REQUIRED(임시 비밀번호) → 동의 전이면 소비자 ONBOARDING_REQUIRED
    (앱이 SCR-06을 연다)·생산자 CONSENT_REQUIRED(앱이 /consent를 연다).
    카카오·테스트 계정은 해당하지 않는다(기존 관문 그대로).
    """
    if user.must_change_password:
        return "PASSWORD_CHANGE_REQUIRED"
    if user.username:
        from app.accounts import service as accounts

        if accounts.consent_required(db, user):
            return "ONBOARDING_REQUIRED" if user.role == "CONSUMER" else "CONSENT_REQUIRED"
    return None


def _check_gate(request: Request, db: Session, user) -> None:
    reason = account_gate(db, user)
    if reason is None:
        return
    password_only = reason == "PASSWORD_CHANGE_REQUIRED"
    open_routes = _PASSWORD_CHANGE_OPEN if password_only else _CONSENT_OPEN
    if (request.method, request.url.path.rstrip("/")) in open_routes:
        return
    raise forbidden(_GATE_MESSAGES[reason], reason=reason)


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
):
    """Authorization 헤더의 JWT를 검증하고 User를 돌려준다. 없으면 401.

    임시 비밀번호를 받은 계정과 약관 동의 전 아이디 계정은 정해진 API만 연다(DEV-363).
    """
    token = _bearer(authorization)
    if token is None:
        raise unauthenticated()
    user = _user_from_token(db, token)
    _check_gate(request, db, user)
    return user


def get_optional_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
):
    """공개 API용. 토큰이 없거나 만료·잘못됐으면 None(둘러보기는 로그인 없이 된다).

    계정 관문에 걸린 계정(DEV-363)도 비로그인으로 본다.
    """
    try:
        token = _bearer(authorization)
        user = _user_from_token(db, token) if token else None
    except ApiError:
        return None
    if user is not None and account_gate(db, user) is not None:
        return None
    return user


def require_roles(*roles: Role) -> Callable[..., object]:
    """주어진 역할 중 하나가 있어야 통과한다. 다른 앱 계정의 토큰이면 403 WRONG_APP(ADR 0010)."""

    def dependency(user: Annotated[object, Depends(get_current_user)]):
        if user.role in roles:
            return user
        app_roles = {Role.CONSUMER, Role.PRODUCER}
        if user.role in app_roles and set(roles) & app_roles:
            raise forbidden("이 앱의 계정이 아니에요. 다시 로그인해 주세요.", reason="WRONG_APP")
        raise forbidden()

    return dependency


_producer_role = require_roles(Role.PRODUCER)


def require_consented_producer(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[object, Depends(_producer_role)],
):
    """PRODUCER 역할 + 지금 버전의 약관·개인정보 동의(DEV-113, AC-01-18).

    빠졌으면 403 FORBIDDEN(details.reason: CONSENT_REQUIRED). 앱은 동의 화면(/consent)으로 보낸다.
    """
    from app.accounts import service as accounts

    if accounts.consent_required(db, user):
        raise forbidden("약관에 동의하면 쓸 수 있어요.", reason="CONSENT_REQUIRED")
    return user


def require_approved_producer(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[object, Depends(require_consented_producer)],
):
    """PRODUCER 역할 + Farm.approvalStatus = APPROVED (AC-01-3). 돌려주는 값은 (User, Farm)."""
    from app.farms import service as farms

    farm = farms.get_farm_of_producer(db, user.id)
    if farm is None or farm.approval_status != "APPROVED":
        raise forbidden("승인된 농가만 쓸 수 있어요.")
    return user, farm


_consumer_role = require_roles(Role.CONSUMER)


def require_onboarded_consumer(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[object, Depends(_consumer_role)],
):
    """CONSUMER 역할 + 첫 가입 온보딩 완료(AC-01-12). 주문·팔로우·채팅처럼 농가에 닿는 행동에 쓴다.

    미완료면 403 FORBIDDEN(details.reason: ONBOARDING_REQUIRED). 앱은 온보딩 화면으로 보낸다.
    """
    from app.accounts import service as accounts

    if accounts.needs_onboarding(db, user):
        raise forbidden("가입을 마치면 쓸 수 있어요.", reason="ONBOARDING_REQUIRED")
    return user


CurrentUser = Annotated[object, Depends(get_current_user)]
OptionalUser = Annotated[object, Depends(get_optional_user)]
Consumer = Annotated[object, Depends(_consumer_role)]
OnboardedConsumer = Annotated[object, Depends(require_onboarded_consumer)]
Producer = Annotated[object, Depends(require_consented_producer)]
ApprovedProducer = Annotated[tuple, Depends(require_approved_producer)]
Admin = Annotated[object, Depends(require_roles(Role.ADMIN))]
