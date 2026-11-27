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
    rf"(?P<a>\d+(?:[,.]\d+)*)\s*(?P<ua>{_UNIT})?\s*"
    # DEV-355: Korean range forms too ("1월에서 4월 사이", "3월부터 5월까지").
    rf"(?:[~–-]|(?:에서|부터)\s*(?=\d[^~–\n]*?(?:까지|사이)))"
    rf"\s*(?P<b>\d+(?:[,.]\d+)*)\s*(?P<ub>{_UNIT})?",
    re.IGNORECASE,
)


def ranges(value):
    """Range endpoints written as a~b, a-b, a에서 b 사이 or a부터 b까지, as (a, b).
    Units are checked by numbers(). Two separate values ("13.2Brix 13.5Brix") are not a range."""
    return {(m["a"].replace(",", ""), m["b"].replace(",", "")) for m in _RANGE.finditer(value)}


def _contains(value, words):
    compact = re.sub(r"\s+", "", value).lower()
    return any(re.sub(r"\s+", "", word).lower() in compact for word in words)


_HEALTH_PATTERNS = [re.compile(p) for p in SAFETY_LISTS["healthPatterns"]]


def has_health_claim(value):
    # DEV-355: "건강한 (제주) 먹거리" is a health claim (gold); "건강하게 키운" stays neutral.
    return has_health_words(value) or any(p.search(value) for p in _HEALTH_PATTERNS)


def has_health_words(value):
    """Health-claim word list only. Used on the candidates a page text cites: a cited
    "건강한 … 먹거리" phrase that the text itself left out must not reject the clean text
    (DEV-355 replay: GAP, 저농약 and EM-farming sentences were lost this way)."""
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


# A marker is a line-up only when a list starts right after it ("주 생산품목: 비트차, 비트칩"),
# not when it introduces one product ("주 생산 품목인 레드향은 달고, 새콤해요").
_LINEUP_LIST = re.compile(
    "(?:"
    + "|".join(
        r"\s*".join(map(re.escape, re.sub(r"\s+", "", m))) for m in SAFETY_LISTS["lineupMarkers"]
    )
    + r")\s*(?::|은|는|으로는|로는)?\s*[^\s,·/、]+\s*[,·/、]\s*[^\s,·/、]+",
    re.IGNORECASE,
)


def has_product_lineup(value, target_name=""):
    """Reject explicit farm item lists and clear multi-variety lists.

    Product identity/package attribution is deliberately not inferred from cultivar names.
    """
    compact = re.sub(r"\s+", "", value)
    if _LINEUP_LIST.search(value):
        return True
    own = re.sub(r"\s+", "", target_name or "")
    return sum(1 for name in SAFETY_LISTS["cultivars"] if name in compact and name not in own) >= 3


def is_target_comparison(value, target_name):
    """A contrast with the explicitly named subject is not a sale-product lineup."""
    if not target_name or not re.search(re.escape(target_name) + r"(?:은|는)", value):
        return False
    if re.search(r"(?:판매|취급|구성)\s*(?:품종|상품|목록)", value):
        return False
    return bool(re.search(r"(?:지만|반면|비해|달리|보다)", value))
