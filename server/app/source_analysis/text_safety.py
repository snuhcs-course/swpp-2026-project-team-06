"""Shared money detection and unit-aware numeric grounding for private story text."""

import hashlib
import json
import re
from pathlib import Path

_LISTS_TEXT = Path(__file__).with_name("text_safety_lists.json").read_text(encoding="utf-8")
SAFETY_LISTS = json.loads(_LISTS_TEXT)
SAFETY_LISTS_HASH = hashlib.sha256(_LISTS_TEXT.encode("utf-8")).hexdigest()
MONEY = re.compile(SAFETY_LISTS["moneyPattern"], re.IGNORECASE)
_UNIT = (
    r"kg|㎏|km|cm|mm|ml|mg|g|ℓ|l|%|°\s*Bx|브릭스|brix|"
    r"개월|상자|박스|시간|과|개|알|년|월|일|분|회|평|ha|㎡"
)
_NUMBER = re.compile(
    rf"(?P<a>\d+(?:[,.]\d+)*)(?:\s*[~–-]\s*(?P<b>\d+(?:[,.]\d+)*))?\s*(?P<unit>{_UNIT})?",
    re.IGNORECASE,
)


def has_money(value):
    return bool(MONEY.search(value))


def numbers(value):
    """Keep units attached, including both endpoints of a range. No unit conversion."""
    result = set()
    for match in _NUMBER.finditer(value):
        unit = re.sub(r"\s", "", match["unit"] or "").lower()
        for number in (match["a"], match["b"]):
            if number:
                result.add((number.replace(",", ""), unit))
    return result


_RANGE = re.compile(
    rf"(?P<a>\d+(?:[,.]\d+)*)\s*(?P<ua>{_UNIT})?\s*[~–-]\s*(?P<b>\d+(?:[,.]\d+)*)\s*(?P<ub>{_UNIT})?",
    re.IGNORECASE,
)


def ranges(value):
    """Range endpoints written as a~b / a-b, as (a, b). Units are checked by numbers().
    Two separate values ("13.2Brix 13.5Brix") are not a range."""
    return {
        (m["a"].replace(",", ""), m["b"].replace(",", "")) for m in _RANGE.finditer(value)
    }


def _contains(value, words):
    compact = re.sub(r"\s+", "", value).lower()
    return any(re.sub(r"\s+", "", word).lower() in compact for word in words)


def has_health_claim(value):
    return _contains(value, SAFETY_LISTS["health"])


def has_platform_text(value):
    return _contains(value, SAFETY_LISTS["platform"])


_PERIOD_PATTERNS = [re.compile(pattern) for pattern in SAFETY_LISTS["periodPatterns"]]


def has_period_text(value):
    return _contains(value, SAFETY_LISTS["period"]) or any(
        pattern.search(value) for pattern in _PERIOD_PATTERNS
    )


_EXAGGERATION_PATTERNS = [re.compile(p) for p in SAFETY_LISTS["exaggerationPatterns"]]


def has_exaggeration(value):
    """DEV-264: superlatives, comparisons with other products and calls to action."""
    return _contains(value, SAFETY_LISTS["exaggeration"]) or any(
        pattern.search(value) for pattern in _EXAGGERATION_PATTERNS
    )


_POLICY_PATTERNS = [re.compile(p) for p in SAFETY_LISTS["policyPatterns"]]


def has_policy_text(value):
    """DEV-264: unambiguous order/refund/sales-status policy. Weaker platform and period
    words stay warnings (spec source-analysis.md)."""
    return _contains(value, SAFETY_LISTS["policy"]) or any(
        pattern.search(value) for pattern in _POLICY_PATTERNS
    )
