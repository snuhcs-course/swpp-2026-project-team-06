"""아이디별 로그인 잠금(DEV-363). 워커가 여럿이어도 같게 DB(`auth_throttles`)에 센다.

- 같은 아이디(역할+아이디)로 15분 안에 10번 시도하면 15분 잠근다.
  시도는 비밀번호를 검증하기 **전에** 센다.
- 카운터는 요청 트랜잭션과 따로 바로 커밋한다. 실패 응답(요청 세션은 커밋하지 않음)에도 남아야 한다.
- 키는 원문(아이디) 대신 HMAC이라 표를 봐도 누가 시도했는지 알 수 없다.
- IP별 제한은 두지 않는다(PM 11/18: 아이디별 잠금만). 클라이언트 IP를 읽지 않으므로
  X-Forwarded-For를 바꿔도 아무 효과가 없다.
- 하루 지난 기록은 시도할 때마다 지운다(처리방침 ‘최대 1일’).
  로그인이 한 번도 없으면 다음 시도 때까지 남는다.
"""

import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from math import ceil

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.accounts.models import AuthThrottle
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.errors import too_many_requests

KIND = "login-user"
LIMIT = 10
WINDOW = timedelta(minutes=15)
LOCK = timedelta(minutes=15)
MESSAGE = "로그인을 여러 번 실패해서 잠시 막았어요. {minutes}분 뒤에 다시 시도해 주세요."
PRUNE_AFTER = timedelta(days=1)
# 한 번에 지우는 오래된 행 수(시도마다 지우므로 작게)
PRUNE_BATCH = 500


def _now() -> datetime:
    """잠금은 실제 시각으로 잰다. 데모·테스트 고정 시각(FIXED_NOW)을 쓰면 창이 끝나지 않아
    한 번 잠긴 아이디가 영원히 잠긴다(운영 시각은 실제 시각, DEV-54와 같은 원칙)."""
    return datetime.now(UTC)


def _key(raw: str) -> str:
    secret = get_settings().jwt_secret.encode()
    digest = hmac.new(secret, f"{KIND}:{raw}".encode(), hashlib.sha256).hexdigest()
    return f"{KIND}:{digest[:48]}"


def _prune(session, at: datetime) -> None:
    """하루 지난(잠겨 있지 않은) 기록을 지운다. updated_at 색인으로 한 묶음만."""
    stale = (
        select(AuthThrottle.key)
        .where(
            AuthThrottle.updated_at < at - PRUNE_AFTER,
            or_(AuthThrottle.locked_until.is_(None), AuthThrottle.locked_until < at),
        )
        .limit(PRUNE_BATCH)
    )
    session.execute(delete(AuthThrottle).where(AuthThrottle.key.in_(stale)))


def hit(raw: str) -> None:
    """시도를 한 번 센다. 이미 잠겨 있으면 429(Retry-After).

    이번이 10번째면 잠그고(이번 요청은 통과) 다음부터 429. 성공하면 호출한 쪽이 `reset`으로 지운다.
    """
    at = _now()
    key = _key(raw)
    locked_seconds: int | None = None
    with get_sessionmaker()() as session, session.begin():
        _prune(session, at)
        session.execute(
            pg_insert(AuthThrottle)
            .values(key=key, count=0, window_started_at=at, locked_until=None, updated_at=at)
            .on_conflict_do_nothing(index_elements=["key"])
        )
        row = session.scalar(select(AuthThrottle).where(AuthThrottle.key == key).with_for_update())
        if row.locked_until is not None and row.locked_until > at:
            locked_seconds = max(1, ceil((row.locked_until - at).total_seconds()))
        else:
            if row.window_started_at + WINDOW <= at or row.locked_until is not None:
                row.count = 0
                row.window_started_at = at
                row.locked_until = None
            row.count += 1
            row.updated_at = at
            if row.count >= LIMIT:
                row.locked_until = at + LOCK
                row.count = 0
    if locked_seconds is not None:
        minutes = max(1, ceil(locked_seconds / 60))
        raise too_many_requests(MESSAGE.format(minutes=minutes), locked_seconds)


def reset(raw: str) -> None:
    """성공한 로그인·비밀번호 변경·운영자 임시 비밀번호 발급 뒤 그 아이디의 시도 수를 지운다."""
    with get_sessionmaker()() as session, session.begin():
        session.execute(delete(AuthThrottle).where(AuthThrottle.key == _key(raw)))
