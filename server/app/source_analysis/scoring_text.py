"""Versioned mechanical scoring primitives; no fuzzy spelling or semantic credit."""

import re
from decimal import Decimal

from app.source_analysis import final_score as legacy

VERSION = "dev448-mechanical-v2"
_MEASURE_END = re.compile(r"\d\s*(?:kg|㎏|g|brix|브릭\s*스|개|과|년|월|일)\s*$", re.I)
_MEASURE_START = re.compile(r"^[+-]?\d+(?:\.\d+)?\s*(?:[~–-]|kg|g|개|과|월|년|일|brix|브릭)", re.I)


def brix(text):
    # Before legacy normalization: otherwise its number scanner sees a unitless 12.
    return re.sub(r"브릭[ \t\r\n]+스", "brix", text, flags=re.I)


def mechanical(text):
    value = legacy.normalize_final(legacy.numeric_text(brix(text))).casefold()
    # A bare minus with preceding whitespace and no following space can be a
    # separate signed value (13.2 -13.5), not a range separator.
    value = re.sub(r"(?<=\d)(?:[–—−-]\s*|\s+[–—−-]\s+)(?=\d)", "~", value)
    # An explicit matching unit proves endpoint syntax:12월-2월,10월중순-11월중순.
    # This never waives the minus guard for standalone -4kg or incompatible units.
    value = re.sub(
        r"(?P<left>(?<![\d.])\d+(?:\.\d+)?\s*"
        r"(?P<unit>kg|g|brix|cm|mm|ml|l|%|개월|년|월|일|시간|분|개|과|상자|박스)(?![a-z])"
        r"(?P<phase>\s*(?:초순|중순|하순|초|말))?)\s*[–—−-]\s*"
        r"(?=\d+(?:\.\d+)?\s*(?P=unit)(?![a-z]))",
        lambda match: (
            (match["left"] + "~")
            if not match["phase"] or match["unit"] in {"년", "월", "일"}
            else match[0]
        ),
        value,
    )
    value = re.sub(
        r"(?<![\d.])(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])", r"\1\3~\2\3", value
    )
    value = re.sub(
        r"(?<![\d.])(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])",
        lambda m: f"{Decimal(m[1]) * (1000 if m[2] == 'kg' else 1):f}g",
        value,
    )
    value = re.sub(r"(?<=\d)\.0+(?=g)", "", value)
    # Whitespace between independent numerals is a boundary, not an OCR digit repair.
    # Keep an explicit marker through compacting so 13.2 13.5 never becomes13.213.5.
    value = re.sub(r"(?<=\d)\s+(?=[+-]?\d)", "␞", value)
    value = re.sub(r"(\d(?:kg|g|brix|cm|mm|ml|l|%))\s+(?=[a-z0-9+-])", r"\1␞", value)
    return re.sub(r"\s+", "", value).strip(".。!?;:")


def paragraphs(text):
    """Retain hard boundaries while allowing ordinary wrapped source prose.

    Completed quantities, a fresh numeric row and explicit blank/sentence boundaries
    are never glued. This is layout handling, not reconstruction of a missing clause.
    """
    # Preserve an inline sentence boundary before a fresh numeric expression.
    # No whitespace means an actual decimal point (0.5), so it stays untouched.
    text = re.sub(r"(?<=[.!?。;])[ \t]+(?=[+-]?\d)", "\n", text)
    result, pending = [], ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            if pending:
                result.append(pending)
                pending = ""
            continue
        boundary = pending and (
            re.search(r"[.!?。;]$", pending)
            or _MEASURE_END.search(pending)
            or _MEASURE_START.search(line)
        )
        if boundary:
            result.append(pending)
            pending = line
        else:
            pending = (pending + " " + line).strip()
    if pending:
        result.append(pending)
    return result


def selector_contains(tokens, text):
    """Each token stays within a paragraph; token sets remain lexical diagnostics."""
    values = [text] if isinstance(text, str) else text
    segments = [mechanical(part) for value in values for part in paragraphs(value)]
    for token in tokens:
        token = mechanical(token)
        before = r"(?<![\d.+-])" if token[:1].isdigit() else ""
        after = (
            r"(?![a-z])"
            if token[-1:].isascii() and token[-1:].isalpha()
            else r"(?![\d.])"
            if token[-1:].isdigit()
            else ""
        )
        if not token or not any(
            re.search(before + re.escape(token) + after, part) for part in segments
        ):
            return False
    return True


def sensitive_tokens(text, cultivar_words=legacy.CULTIVARS):
    result = {"number": set(), "cultivar": set(), "certification": set()}
    for paragraph in paragraphs(text):
        # Keep legacy numbering treatment before compacting and mass conversion.
        cleaned = re.sub(r"^\s*\d{1,2}[.)]\s+", "", paragraph)
        tokens = legacy.sensitive_tokens(mechanical(cleaned), cultivar_words)
        for kind in result:
            result[kind].update(tokens[kind])
    return result


def source_clauses(text):
    chunks = []
    for paragraph in paragraphs(text):
        for clause in re.split(
            r"[!?。;]+|(?<!\d)\.(?!\d)|(?<=\d)\.(?=\s|$)|이고\s+|이며\s+", paragraph
        ):
            chunks.extend(
                re.split(r"(?=(?:[a-zA-Z]|\d+)\s*(?:옵션|상품)|옵션\s*[a-zA-Z0-9])", clause)
            )
    return [chunk for chunk in chunks if chunk.strip()]


def _option_ids(text):
    value = mechanical(text)
    return set(re.findall(r"(?:[a-z0-9]+(?:옵션|상품)|(?:옵션|상품)[a-z0-9]+|\d+번)", value))


def validate_selector_aliases(original, alternatives, safe):
    """Validate explicit local selector alternatives, never infer their meaning."""
    if not isinstance(alternatives, list):
        raise ValueError("Invalid selector aliases")
    original_text = " ".join(original)
    original_numbers = sensitive_tokens(original_text)["number"]
    original_options = _option_ids(original_text)
    constraint_patterns = (
        r"이상",
        r"이하",
        r"미만",
        r"초과",
        r"이내",
        r"최대",
        r"최소",
        r"미확인|미확정|미정|불확실",
        r"경우|하면|이면|할때|일때",
        r"수있|가능|변동|달라",
        r"않|없|아니|못|안돼|안되",
        r"예상|추정|예정",
        r"실측|측정",
        r"정확히|반드시|보장",
        r"약(?=\d)|대략|내외|정도",
        r"현재|올해|이번",
        r"작년|지난해|과거|당시|\d{4}년",
    )
    constraints = {
        pattern for pattern in constraint_patterns if re.search(pattern, mechanical(original_text))
    }
    for alternative in alternatives:
        if (
            not isinstance(alternative, list)
            or not alternative
            or any(not isinstance(token, str) or not mechanical(token) for token in alternative)
        ):
            raise ValueError("Invalid selector aliases")
        joined = " ".join(alternative)
        if (
            sensitive_tokens(joined)["number"] != original_numbers
            or _option_ids(joined) != original_options
            or any(not re.search(pattern, mechanical(joined)) for pattern in constraints)
            or not any(selector_contains(alternative, clause) for clause in source_clauses(safe))
        ):
            raise ValueError("Unbound or altered selector alias")
    return alternatives
