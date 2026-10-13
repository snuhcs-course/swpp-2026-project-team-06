"""AI draft and answer grounding helpers for Korean product facts."""

import calendar
import re
from collections.abc import Iterable
from typing import Any

from app.ai.schemas import DraftExtraction, Evidence
from app.core import masking

_WEIGHT = re.compile(
    r"(?P<value>\d+(?:\.\d+)?)\s*(?:kg|키로그램|킬로그램|키로|킬로)(?![가-힣a-z])",
    re.IGNORECASE,
)
_PRICE = re.compile(
    r"\d+(?:\.\d+)?\s*만\s*원|\d[\d,]*(?:\.\d+)?\s*원|"
    r"(?:가격|할인|흥정|깎아|네고)",
    re.IGNORECASE,
)
_RESERVATION_PERIOD = re.compile(r"예약\s*(?:기간|마감|시작|종료|접수)|\d+\s*차\s*예약")
_CONTACT_OR_ACCOUNT = re.compile(r"(?:연락처|전화|휴대폰|계좌|입금)\s*[:：]?")
_DELIVERY_CONTEXT = re.compile(r"배송|도착|수령|받는|받을|출하")
_ISO_DATE = re.compile(r"(?P<year>20\d{2})[-./](?P<month>\d{1,2})[-./](?P<day>\d{1,2})")
_KOREAN_DATE = re.compile(
    r"(?:(?P<year>20\d{2})\s*년\s*)?(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일"
)
_KOREAN_RANGE = re.compile(
    r"(?:(?P<year>20\d{2})\s*년\s*)?(?P<month>\d{1,2})\s*월\s*"
    r"(?P<start>\d{1,2})\s*(?:일)?\s*[~～\-–]\s*(?P<end>\d{1,2})\s*일"
)
_VAGUE_DATE = re.compile(r"(?P<month>\d{1,2})\s*월\s*(?P<bucket>초순|중순|하순)")
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_FIRST_PERSON_FARMER = re.compile(
    r"저희\s*(?:가|는|농장|농가)|제가\s*(?:직접|키운|재배)|우리\s*(?:농장|농가)|"
    r"\b(?:our farm|we (?:grow|harvest|ship)|we ourselves)\b",
    re.IGNORECASE,
)
_UNSAFE_MODEL = re.compile(
    r"환불|보상|농약|재배|유기농|항의|불만|흥정|할인|깎|네고|"
    r"파손|상했|썩|맛있|달콤|새콤|신맛|신선|최상|최고급|품질이?\s*(?:좋|나쁘)|"
    r"배송.{0,8}(?:확정|보장|약속)|"
    r"(?:확정|보장|약속).{0,8}(?:배송|도착)"
)


def normalize_units(text: str) -> str:
    return _WEIGHT.sub(lambda match: f"{_plain_number(match.group('value'))}kg", text).lower()


def _compact(text: str) -> str:
    return re.sub(r"[^0-9a-z가-힣.]", "", normalize_units(text))


def _plain_number(value: str) -> str:
    number = value.replace(",", "")
    if "." in number:
        number = number.rstrip("0").rstrip(".")
    return number


def _date_facts(text: str) -> set[tuple[int | None, int, int]]:
    facts: set[tuple[int | None, int, int]] = set()
    for match in _ISO_DATE.finditer(text):
        facts.add((int(match.group("year")), int(match.group("month")), int(match.group("day"))))
    for match in _KOREAN_RANGE.finditer(text):
        year = int(match.group("year")) if match.group("year") else None
        month = int(match.group("month"))
        facts.add((year, month, int(match.group("start"))))
        facts.add((year, month, int(match.group("end"))))
    without_ranges = _KOREAN_RANGE.sub("", text)
    for match in _KOREAN_DATE.finditer(without_ranges):
        year = int(match.group("year")) if match.group("year") else None
        facts.add((year, int(match.group("month")), int(match.group("day"))))
    return facts


def _date_supported(answer_fact: tuple[int | None, int, int], evidence_facts: set) -> bool:
    year, month, day = answer_fact
    matches = [
        (source_year, source_month, source_day)
        for source_year, source_month, source_day in evidence_facts
        if month == source_month
        and day == source_day
        and (year is None or source_year is None or year == source_year)
    ]
    if not matches:
        return False
    return year is not None or len({source_year for source_year, _, _ in matches}) <= 1


def _bucket(day: int, month: int, year: int | None) -> str:
    if day <= 10:
        return "초순"
    if day <= 20:
        return "중순"
    max_day = calendar.monthrange(year or 2024, month)[1]
    if day <= max_day:
        return "하순"
    return "invalid"


def _dates_supported(answer: str, evidence: str) -> bool:
    evidence_facts = _date_facts(evidence)
    if any(not _date_supported(fact, evidence_facts) for fact in _date_facts(answer)):
        return False
    for match in _VAGUE_DATE.finditer(answer):
        month = int(match.group("month"))
        if any(
            int(source.group("month")) == month
            and source.group("bucket") == match.group("bucket")
            for source in _VAGUE_DATE.finditer(evidence)
        ):
            continue
        relevant = [fact for fact in evidence_facts if fact[1] == month]
        years = {year for year, _, _ in relevant}
        outside_bucket = any(
            _bucket(day, month, year) != match.group("bucket") for year, _, day in relevant
        )
        if not relevant or len(years) > 1 or outside_bucket:
            return False
    return True


def _without_dates(text: str) -> str:
    for pattern in (_ISO_DATE, _KOREAN_RANGE, _KOREAN_DATE, _VAGUE_DATE):
        text = pattern.sub(" ", text)
    return text


def _number_facts(text: str) -> set[str]:
    normalized = normalize_units(_without_dates(text))
    facts = set()
    for match in _NUMBER.finditer(normalized):
        end = match.end()
        suffix = normalized[end : end + 8].lstrip()
        unit_match = re.match(r"(kg|브릭스|brix|원|박스|개)", suffix, re.IGNORECASE)
        unit = unit_match.group(1).lower() if unit_match else ""
        if unit == "브릭스":
            unit = "brix"
        facts.add(f"{_plain_number(match.group())}{unit}")
    return facts


def _facts_supported(candidate: str, source: str) -> bool:
    return _number_facts(candidate).issubset(_number_facts(source)) and _dates_supported(
        candidate, source
    )


def _safe_generated_text(candidate: str | None, source: str) -> str | None:
    if not candidate:
        return None
    if (
        _PRICE.search(candidate)
        or _RESERVATION_PERIOD.search(candidate)
        or _CONTACT_OR_ACCOUNT.search(candidate)
        or masking.find_contacts(candidate)
        or not _facts_supported(candidate, source)
    ):
        return None
    return candidate


def _supported_brix(source: str, value: float | None) -> float | None:
    if value is None:
        return None
    number = _plain_number(str(value))
    patterns = (
        rf"(?:당도|브릭스|brix)[^\d]{{0,12}}{re.escape(number)}",
        rf"{re.escape(number)}\s*(?:브릭스|brix)",
    )
    return value if any(re.search(pattern, source, re.IGNORECASE) for pattern in patterns) else None


def _supported_delivery(source: str, value: str | None) -> str | None:
    if not value or not _DELIVERY_CONTEXT.search(source):
        return None
    return value if _facts_supported(value, source) else None


def ground_draft(source: str, draft: DraftExtraction) -> DraftExtraction:
    source_compact = _compact(source)

    def exact(value: str | None) -> str | None:
        return value if value and _compact(value) in source_compact else None

    options = [option for option in (draft.options or []) if _compact(option) in source_compact]
    return DraftExtraction(
        name=_safe_generated_text(draft.name, source),
        variety=exact(draft.variety),
        options=options or None,
        expected_brix=_supported_brix(source, draft.expected_brix),
        grade=exact(draft.grade),
        delivery_window=_supported_delivery(source, draft.delivery_window),
        description=_safe_generated_text(draft.description, source),
    )


def _clean(value: Any, sanitizer) -> Any:
    if isinstance(value, str):
        return sanitizer(value)
    if isinstance(value, list):
        return [_clean(item, sanitizer) for item in value]
    if isinstance(value, tuple):
        return [_clean(item, sanitizer) for item in value]
    if isinstance(value, dict):
        return {key: _clean(item, sanitizer) for key, item in value.items()}
    return value


def evidence_payload(ev: Evidence, sanitizer) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    payload: list[dict[str, Any]] = []
    texts: dict[str, list[str]] = {}

    def add(ref: str, facts: dict[str, Any], fact_texts: Iterable[str]) -> None:
        present = {key: value for key, value in facts.items() if value not in (None, "", [])}
        cleaned = _clean(present, sanitizer)
        if cleaned:
            payload.append({"sourceRef": ref, "facts": cleaned})
            texts[ref] = [sanitizer(text) for text in fact_texts if text]

    if ev.product_id:
        ref = f"product:{ev.product_id}"
        add(
            ref,
            {
                "name": ev.product_name,
                "shippingFeeType": ev.shipping_fee_type,
                "shippingFee": ev.shipping_fee,
                "remoteAreaFee": ev.remote_area_fee,
                "deliveryWindow": ev.delivery_window,
                "measuredBrix": ev.measured_brix,
                "expectedBrix": ev.expected_brix,
            },
            [
                ev.product_name or "",
                f"{ev.shipping_fee or 0}원" if ev.shipping_fee is not None else "",
                f"{ev.remote_area_fee or 0}원" if ev.remote_area_fee is not None else "",
                " ".join(ev.delivery_window or ()),
                f"{ev.measured_brix} Brix" if ev.measured_brix is not None else "",
                f"예상 {ev.expected_brix} Brix" if ev.expected_brix is not None else "",
            ],
        )
    if ev.order_id:
        add(
            f"order:{ev.order_id}",
            {"status": ev.order_status, "deliveryWindow": ev.order_delivery_window},
            [ev.order_status or "", " ".join(ev.order_delivery_window or ())],
        )
    if ev.faqs:
        add(
            "farm:faq",
            {"faqs": ev.faqs},
            [item.get("question", "") for item in ev.faqs]
            + [item.get("answer", "") for item in ev.faqs],
        )
    if ev.small_order_policy:
        add(
            "farm:smallOrderPolicy",
            {"policy": ev.small_order_policy},
            [ev.small_order_policy],
        )
    if ev.reservation_shipping_policy:
        add(
            "farm:reservationShippingPolicy",
            {"policy": ev.reservation_shipping_policy},
            [ev.reservation_shipping_policy],
        )
    return payload, texts


def validate_model_answer(
    answer: str,
    refs: list[str],
    source_texts: dict[str, list[str]],
    ev: Evidence,
) -> bool:
    if not refs or len(refs) != len(set(refs)) or any(ref not in source_texts for ref in refs):
        return False
    if _UNSAFE_MODEL.search(answer) or _PRICE.search(answer) or _FIRST_PERSON_FARMER.search(answer):
        return False
    evidence = "\n".join(text for ref in refs for text in source_texts[ref])
    if not _facts_supported(answer, evidence):
        return False
    product_ref = f"product:{ev.product_id}" if ev.product_id else None
    if (
        product_ref in refs
        and ev.expected_brix is not None
        and ev.measured_brix is None
        and re.search(r"당도|브릭스|brix", answer, re.IGNORECASE)
        and "예상" not in answer
    ):
        return False
    return True
