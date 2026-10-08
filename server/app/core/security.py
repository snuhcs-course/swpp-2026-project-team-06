"""JWT 발급·검증과 역할 검사 (ADR 0009·0010, N-06). 권한은 항상 서버에서 검사한다."""

from collections.abc import Callable
from datetime import timedelta
from enum import StrEnum
from typing import Annotated

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import forbidden, unauthenticated

ALGORITHM = "HS256"


class Role(StrEnum):
    CONSUMER = "CONSUMER"
    PRODUCER = "PRODUCER"
    ADMIN = "ADMIN"


def issue_token(user_id: str, role: str) -> str:
    settings = get_settings()
    issued = now()
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(minutes=settings.jwt_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


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
    if user is None:
        raise unauthenticated()
    return user


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
):
    """Authorization 헤더의 JWT를 검증하고 User를 돌려준다. 없으면 401."""
    token = _bearer(authorization)
    if token is None:
        raise unauthenticated()
    return _user_from_token(db, token)


def get_optional_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
):
    """공개 API용. 토큰이 없으면 None(내 팔로우·내 좋아요 표시에 쓴다)."""
    token = _bearer(authorization)
    return _user_from_token(db, token) if token else None


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


def require_approved_producer(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[object, Depends(_producer_role)],
):
    """PRODUCER 역할 + Farm.approvalStatus = APPROVED (AC-01-3). 돌려주는 값은 (User, Farm)."""
    from app.farms import service as farms

    farm = farms.get_farm_of_producer(db, user.id)
    if farm is None or farm.approval_status != "APPROVED":
        raise forbidden("승인된 농가만 쓸 수 있어요.")
    return user, farm


CurrentUser = Annotated[object, Depends(get_current_user)]
OptionalUser = Annotated[object, Depends(get_optional_user)]
Consumer = Annotated[object, Depends(require_roles(Role.CONSUMER))]
ApprovedProducer = Annotated[tuple, Depends(require_approved_producer)]
Admin = Annotated[object, Depends(require_roles(Role.ADMIN))]
