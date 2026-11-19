"""로그인 잠금(DEV-363). 워커가 여럿이어도 같게 DB(`auth_throttles`)에 센다.

카운터는 요청 트랜잭션과 따로 바로 커밋한다. 실패 응답(요청 세션은 커밋하지 않음)에도 남아야 한다.
키는 원문(아이디) 대신 HMAC이라 표를 봐도 누가 시도했는지 알 수 없다.
IP별 제한은 두지 않는다(PM 11/18: 아이디별 잠금만). 클라이언트 IP를 읽지 않으므로
X-Forwarded-For를 바꿔도 아무 효과가 없다.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import ceil

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.accounts.models import AuthThrottle
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.errors import too_many_requests

PRUNE_AFTER = timedelta(days=1)


def _now() -> datetime:
    """잠금은 실제 시각으로 잰다. 데모·테스트 고정 시각(FIXED_NOW)을 쓰면 창이 끝나지 않아
    한 번 잠긴 아이디가 영원히 잠긴다(운영 시각은 실제 시각, DEV-54와 같은 원칙)."""
    return datetime.now(UTC)


@dataclass(frozen=True)
class Rule:
    kind: str
    limit: int
    window: timedelta
    # None이면 창(window)이 끝날 때까지 막는다
    lock: timedelta | None
    message: str


LOGIN_USER = Rule(
    "login-user",
    10,
    timedelta(minutes=15),
    timedelta(minutes=15),
    "로그인을 여러 번 실패해서 잠시 막았어요. {minutes}분 뒤에 다시 시도해 주세요.",
)
def _key(rule: Rule, raw: str) -> str:
    secret = get_settings().jwt_secret.encode()
    digest = hmac.new(secret, f"{rule.kind}:{raw}".encode(), hashlib.sha256).hexdigest()
    return f"{rule.kind}:{digest[:48]}"


def _seconds(until: datetime, at: datetime) -> int:
    return max(1, ceil((until - at).total_seconds()))


def _raise(rule: Rule, seconds: int):
    minutes = max(1, ceil(seconds / 60))
    raise too_many_requests(rule.message.format(minutes=minutes), seconds)


def check(rule: Rule, raw: str) -> None:
    """잠겨 있으면 429(Retry-After). 세지 않는다."""
    at = _now()
    with get_sessionmaker()() as session:
        row = session.get(AuthThrottle, _key(rule, raw))
        if row is not None and row.locked_until is not None and row.locked_until > at:
            _raise(rule, _seconds(row.locked_until, at))


def hit(rule: Rule, raw: str, *, raise_when_locked: bool = True) -> None:
    """한 번 센다. 이미 잠겨 있으면 429. 이번에 한도에 닿으면 잠그고(이번 요청은 통과) 다음부터 429.

    `raise_when_locked=False`는 로그인 실패 기록처럼 결과와 상관없이 세기만 할 때.
    """
    at = _now()
    key = _key(rule, raw)
    locked_seconds: int | None = None
    with get_sessionmaker()() as session, session.begin():
        inserted = session.execute(
            pg_insert(AuthThrottle)
            .values(key=key, count=0, window_started_at=at, locked_until=None, updated_at=at)
            .on_conflict_do_nothing(index_elements=["key"])
        ).rowcount
        if inserted:
            # 하루 지난 기록은 새 행을 만들 때 함께 지운다(IP·아이디 흔적을 오래 두지 않는다)
            session.execute(
                delete(AuthThrottle).where(
                    AuthThrottle.updated_at < at - PRUNE_AFTER,
                    or_(AuthThrottle.locked_until.is_(None), AuthThrottle.locked_until < at),
                )
            )
        row = session.scalar(select(AuthThrottle).where(AuthThrottle.key == key).with_for_update())
        if row.locked_until is not None and row.locked_until > at:
            locked_seconds = _seconds(row.locked_until, at)
        else:
            if row.window_started_at + rule.window <= at or row.locked_until is not None:
                row.count = 0
                row.window_started_at = at
                row.locked_until = None
            row.count += 1
            row.updated_at = at
            if row.count >= rule.limit:
                row.locked_until = (
                    at + rule.lock if rule.lock else row.window_started_at + rule.window
                )
                row.count = 0
    if locked_seconds is not None and raise_when_locked:
        _raise(rule, locked_seconds)


def reset(rule: Rule, raw: str) -> None:
    """성공한 로그인·비밀번호 변경·운영자 임시 비밀번호 발급 뒤 그 아이디의 시도 수를 지운다."""
    with get_sessionmaker()() as session, session.begin():
        session.execute(delete(AuthThrottle).where(AuthThrottle.key == _key(rule, raw)))
