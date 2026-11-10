"""PostHog에서 한 사람의 최근 이벤트를 읽는다(DEV-307, 관리자 활동 로그).

앱은 로그인한 사용자를 내부 userId로 identify한다(packages/analytics/src/client.ts). 그래서
distinct_id = userId인 이벤트를 HogQL 조회 API로 읽는다. 로그인 전 익명 이벤트는 들어오지 않는다
(PostHog 사람 페이지 링크에서 본다).

- POSTHOG_PERSONAL_API_KEY(읽기 전용 개인 키)와 POSTHOG_PROJECT_ID가 모두 있을 때만 부른다.
  없으면 status="disabled"로 비워 둔다.
- 시간 제한(TIMEOUT_SECONDS)과 실패는 status="unavailable"로 돌려주고 페이지는 실패시키지 않는다.
- 키는 요청 헤더에만 쓰고 로그·응답에 남기지 않는다. 이벤트 속성은 이름·시각·앱·경로만 내려 준다
  (N-05: 이름·연락처·본문은 PostHog에도 없고, 있더라도 내려 주지 않는다).
"""

import logging
import re
from datetime import datetime
from typing import Literal
from urllib.parse import quote

import httpx

from app.core.config import get_settings
from app.core.schemas import CamelModel

logger = logging.getLogger("farmclub.admin.posthog")

TIMEOUT_SECONDS = 5.0
LIMIT = 50
DAYS = 30
# 테스트가 httpx.MockTransport로 바꾼다
TRANSPORT: httpx.BaseTransport | None = None
_SAFE_ID = re.compile(r"^[A-Za-z0-9_.@:-]{1,128}$")
QUERY = (
    "SELECT event, timestamp, properties.app, properties.$pathname "
    "FROM events "
    "WHERE distinct_id = {distinct_id} "
    f"AND timestamp > now() - INTERVAL {DAYS} DAY "
    f"ORDER BY timestamp DESC LIMIT {LIMIT}"
)


class PosthogEvent(CamelModel):
    event: str
    at: datetime
    app: str | None
    pathname: str | None


class PosthogActivity(CamelModel):
    # disabled = 키·프로젝트가 없음, ok = 조회함, unavailable = 조회 실패(시간 초과·오류)
    status: Literal["disabled", "ok", "unavailable"]
    person_url: str | None
    events: list[PosthogEvent]


def api_host(host: str) -> str:
    """조회 API 호스트. 앱 수집 호스트(us.i.posthog.com)를 넣어도 앱 호스트(us.posthog.com)로."""
    host = (host or "https://us.posthog.com").strip().rstrip("/")
    return re.sub(r"^(https?://)(us|eu)\.i\.posthog\.com$", r"\1\2.posthog.com", host)


def _person_url(host: str, project_id: str, user_id: str) -> str | None:
    if not project_id:
        return None
    return f"{host}/project/{quote(project_id, safe='')}/person/{quote(user_id, safe='')}"


def person_events(user_id: str) -> PosthogActivity:
    settings = get_settings()
    key = settings.posthog_personal_api_key.get_secret_value().strip()
    project_id = settings.posthog_project_id.strip()
    host = api_host(settings.posthog_host)
    person_url = _person_url(host, project_id, user_id)
    if not key or not project_id:
        return PosthogActivity(status="disabled", person_url=person_url, events=[])
    if not _SAFE_ID.fullmatch(user_id):
        return PosthogActivity(status="unavailable", person_url=person_url, events=[])
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS, transport=TRANSPORT) as client:
            response = client.post(
                f"{host}/api/projects/{quote(project_id, safe='')}/query/",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "query": {
                        "kind": "HogQLQuery",
                        "query": QUERY,
                        "values": {"distinct_id": user_id},
                    }
                },
            )
        if response.status_code != 200:
            logger.warning("posthog_query_failed", extra={"status_code": response.status_code})
            return PosthogActivity(status="unavailable", person_url=person_url, events=[])
        rows = response.json().get("results") or []
        events = [
            PosthogEvent(
                event=str(row[0]),
                at=row[1],
                app=row[2] if len(row) > 2 else None,
                pathname=row[3] if len(row) > 3 else None,
            )
            for row in rows[:LIMIT]
        ]
    except Exception as exc:
        # 시간 초과·연결 오류·응답 형식 오류. 키가 들어 있지 않은 예외 종류만 남긴다
        logger.warning("posthog_query_failed", extra={"error": type(exc).__name__})
        return PosthogActivity(status="unavailable", person_url=person_url, events=[])
    return PosthogActivity(status="ok", person_url=person_url, events=events)
