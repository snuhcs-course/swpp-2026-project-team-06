"""현재 사용자·역할 검사 자리. 구현은 DEV-4 (ADR 0003, N-06)."""

from collections.abc import Callable
from enum import StrEnum


class Role(StrEnum):
    CONSUMER = "CONSUMER"
    PRODUCER = "PRODUCER"
    ADMIN = "ADMIN"


def get_current_user():
    """Authorization 헤더의 JWT를 검증하고 User를 돌려준다."""
    raise NotImplementedError("DEV-4")


def require_roles(*roles: Role) -> Callable[..., object]:
    """주어진 역할 중 하나가 있어야 통과하는 의존성을 만든다. 관리 API는 ADMIN(ADR 0008)."""

    def dependency():
        raise NotImplementedError("DEV-4")

    return dependency


def require_approved_producer():
    """PRODUCER 역할 + Farm.approvalStatus = APPROVED를 확인한다."""
    raise NotImplementedError("DEV-4")
