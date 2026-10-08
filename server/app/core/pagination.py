"""cursor 페이지네이션 (screens.md 7.1). limit 기본 20, 최대 50."""

import base64
import json
from typing import Annotated

from fastapi import Query

from app.core.errors import invalid

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def page_limit(limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT) -> int:
    return limit


def encode_cursor(values: list) -> str:
    return base64.urlsafe_b64encode(json.dumps(values).encode()).decode()


def decode_cursor(cursor: str | None) -> list | None:
    if not cursor:
        return None
    try:
        values = json.loads(base64.urlsafe_b64decode(cursor.encode()))
    except ValueError as exc:
        raise invalid({"cursor": "잘못된 cursor예요"}) from exc
    if not isinstance(values, list):
        raise invalid({"cursor": "잘못된 cursor예요"})
    return values
