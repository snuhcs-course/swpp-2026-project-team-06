"""analytics 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

import logging
import re
import traceback
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

EXCEPTION_MESSAGE_MAX = 200
SEND_TIMEOUT_SECONDS = 2.0
SERVER_DISTINCT_ID = "server"

_URL = re.compile(r"https?://[^\s\"'<>]+")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_DIGITS = re.compile(r"\d[\d -]{2,}\d")


def _strip_query(url: str) -> str:
    cut = re.search(r"[?#]", url)
    return url if cut is None else url[: cut.start()]


def scrub_error_text(text: str) -> str:
    """오류 메시지의 개인정보를 가린다. 앱 scrubErrorText(analytics/src/privacy.ts)와 같다."""
    text = _URL.sub(lambda m: _strip_query(m.group(0)), text)
    text = _EMAIL.sub("[email]", text)
    text = _DIGITS.sub(
        lambda m: "[number]" if len(re.sub(r"\D", "", m.group(0))) >= 4 else m.group(0), text
    )
    return text[:EXCEPTION_MESSAGE_MAX]


def build_exception_event(
    exc: BaseException, route: str, method: str, api_key: str
) -> dict[str, Any]:
    """PostHog `$exception` 이벤트. 스택은 파일·함수·줄만(소스 줄·지역 변수 없음)."""
    frames = [
        {
            "filename": f.filename,
            "function": f.name,
            "lineno": f.lineno,
            "in_app": "site-packages" not in f.filename,
            "platform": "python",
        }
        for f in traceback.extract_tb(exc.__traceback__)
    ]
    return {
        "api_key": api_key,
        "event": "$exception",
        "distinct_id": SERVER_DISTINCT_ID,
        "properties": {
            "$process_person_profile": False,
            "$exception_list": [
                {
                    "type": type(exc).__name__,
                    "value": scrub_error_text(str(exc)),
                    "mechanism": {"handled": False, "type": "generic"},
                    "stacktrace": {"type": "raw", "frames": frames},
                }
            ],
            "$exception_level": "error",
            "route": route,
            "method": method,
            "source": "server",
        },
    }


def report_server_exception(exc: BaseException, route: str, method: str) -> None:
    """PostHog로 보낸다. 키가 없으면 아무것도 안 한다. 실패·시간 초과는 삼키고 로그만 남긴다."""
    try:
        settings = get_settings()
        key = settings.posthog_project_api_key.get_secret_value()
        if not key:
            return
        host = settings.posthog_capture_host.rstrip("/")
        response = httpx.post(
            f"{host}/i/v0/e/",
            json=build_exception_event(exc, route, method, key),
            timeout=SEND_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except Exception as err:  # noqa: BLE001 - 보고 실패가 서버에 영향을 주면 안 된다
        # 메시지에 키·URL이 섞일 수 있어 예외 종류만 남긴다
        logger.warning("PostHog 서버 오류 보고 실패: %s", type(err).__name__)
