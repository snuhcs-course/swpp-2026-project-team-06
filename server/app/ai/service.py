"""Claude 어댑터 (ADR 0004). 모든 AI 호출은 이 파일에서만 한다. DB에는 쓰지 않는다."""

import json
import re

from app.ai.schemas import DraftExtraction
from app.core.config import get_settings

# 연락처·계좌·주소처럼 보이는 값은 보내기 전에 지운다(M-18).
_CONTACT = re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}|\d{2,6}-\d{2,6}-\d{2,8}")
_PRICE = re.compile(r"(\d+(?:\.\d+)?\s*만\s*원|\d{1,3}(?:,\d{3})+\s*원|\d{4,6}\s*원)")

_DRAFT_SYSTEM = """너는 농가 판매 문구에서 상품 정보를 뽑는 도우미다.
반드시 JSON 객체 하나만 출력한다.
키: name, variety, options, expectedBrix, grade, deliveryWindow, description.
- options는 중량 문자열 목록(예: ["5kg", "10kg"]).
- 문구에 없는 값은 null로 둔다. 당도·배송 시기를 지어내지 않는다.
- 가격은 어떤 키에도 넣지 않는다.
- description은 문구를 바탕으로 2~3문장 한국어."""


def strip_personal_info(text: str) -> str:
    return _CONTACT.sub("[연락처]", text)


def price_mentioned(text: str) -> str | None:
    """문구에 가격이 있었는지(AC-03-2: 채우지 않고 안내만 한다)."""
    match = _PRICE.search(text)
    return re.sub(r"\s+", "", match.group(1)) if match else None


def _call_claude(text: str) -> str:
    import anthropic

    settings = get_settings()
    client = anthropic.Anthropic(
        api_key=settings.anthropic_api_key, timeout=settings.ai_draft_timeout_seconds
    )
    message = client.messages.create(
        model=settings.ai_model,
        max_tokens=1024,
        system=_DRAFT_SYSTEM,
        messages=[{"role": "user", "content": text}],
    )
    return "".join(block.text for block in message.content if block.type == "text")


def _parse(raw: str) -> DraftExtraction:
    start, end = raw.find("{"), raw.rfind("}")
    data = json.loads(raw[start : end + 1])
    renamed = {
        "name": data.get("name"),
        "variety": data.get("variety"),
        "options": data.get("options"),
        "expected_brix": data.get("expectedBrix"),
        "grade": data.get("grade"),
        "delivery_window": data.get("deliveryWindow"),
        "description": data.get("description"),
    }
    return DraftExtraction(**renamed)


def draft_product(text: str) -> DraftExtraction | None:
    """상품 초안 추출(FEAT-03). 키가 없거나 실패·시간 초과·형식 오류면 None(AC-03-3)."""
    if not get_settings().anthropic_api_key:
        return None
    try:
        result = _parse(_call_claude(strip_personal_info(text)))
    except Exception:  # noqa: BLE001  형식 오류·네트워크·SDK 오류는 모두 실패로 처리한다(N-04)
        return None
    if all(value in (None, [], "") for value in result.model_dump().values()):
        return None
    return result
