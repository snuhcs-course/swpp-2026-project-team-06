"""현재 시각. FIXED_NOW로 고정할 수 있다(데모 기준일 2026-10-07, 테스트)."""

from datetime import UTC, date, datetime, timedelta, timezone

from app.core.config import get_settings

KST = timezone(timedelta(hours=9))


def now() -> datetime:
    fixed = get_settings().fixed_now
    if fixed:
        value = datetime.fromisoformat(fixed)
        return value if value.tzinfo else value.replace(tzinfo=KST)
    return datetime.now(UTC)


def today() -> date:
    """영업일 경계는 Asia/Seoul 00:00이다."""
    return now().astimezone(KST).date()


def days_until(day: date) -> int:
    return (day - today()).days
