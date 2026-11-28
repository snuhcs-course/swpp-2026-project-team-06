"""Whitespace-only prose layout repair; source evidence remains separate and exact."""

import re

_NEWLINE = re.compile(r"\r?\n")
_PARAGRAPH = re.compile(r"(\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*)")
_POLITE_SPLIT = re.compile(r"(?P<head>[가-힣]*(?:습니|입니))[ \t]*\r?\n[ \t]*다(?=[.!?。]|$)")
_LIST_START = re.compile(
    r"^\s*(?:[-*•·▶※▪●✓✔]|[①-⑳]|(?:\d+|[A-Za-z가-힣])[.)](?=\s|[가-힣]|$)|\(\d+\))"
)
_LABEL = re.compile(r"^[가-힣A-Za-z][가-힣A-Za-z /()]{0,24}\s*[:：]")
_PROPERTY = re.compile(
    r"^(?:중량|무게|수량|개수|과수|크기|규격|포장|당도|원산지|품종|가격|금액|"
    r"배송비|보관법|보관방법|구성품)(?:\s|[:：/]|$)"
)
_NUMBER = r"\d+(?:[,.]\d+)?(?:\s*[~–-]\s*\d+(?:[,.]\d+)?)?"
# Calendar conditions such as '6~7월에만 맛 볼 수 있는' are prose, not measurements.
_UNIT = r"(?:kg|㎏|g|㎎|mg|ml|mL|L|ℓ|cm|mm|브릭스|Brix|brix|개입|개|과|팩|봉|상자|박스)"
_MEASUREMENT = re.compile(
    rf"^(?:약\s*)?{_NUMBER}(?:\s*{_UNIT})?(?:\s*(?:내외|정도|이상|이하|미만|초과))?"
    r"(?:\s*\([^\n]*\))?$"
)
_WEIGHT_HEADING = re.compile(rf"^.{{1,32}}?\s*{_NUMBER}\s*{_UNIT}(?:\s*\([^\n]*\))?$")
_OPTION_HEADING = re.compile(
    r"^(?:(?:옵션|선택|구성)(?=$|[\s:：.)-]|\d)\s*\d*\s*[:：.)-]?.{0,28}|"
    r".{0,20}(?:가정용|선물용|세트|꾸러미|박스|상자))$"
)


def _structural(line: str) -> bool:
    text = line.strip()
    if not text:
        return True
    if "\t" in line or "|" in text or re.search(r"\S {2,}\S", text):
        return True
    if _LIST_START.search(text) or _LABEL.search(text):
        return True
    property_match = _PROPERTY.search(text)
    if property_match:
        # A full sentence or a qualitative phrase ('당도 높은 ...') is prose.
        if re.search(r"[.!?。][\"'”’」』)]?$", text):
            return False
        rest = text[property_match.end() :].strip()
        if re.match(r"^(?:중량|무게|수량|개수|과수|당도|가격|금액|배송비)(?:\s|$)", text):
            return not rest or bool(re.match(r"(?:약\s*)?\d", rest))
        return True
    if len(re.findall(rf"{_NUMBER}\s*{_UNIT}(?=$|[\s,/|])", text)) >= 2:
        return True
    return bool(
        _MEASUREMENT.fullmatch(text)
        or _WEIGHT_HEADING.fullmatch(text)
        or _OPTION_HEADING.fullmatch(text)
    )


def _reflow_paragraph(value: str) -> str:
    pieces = _NEWLINE.split(value)
    separators = _NEWLINE.findall(value)
    result = pieces[0]
    for index, following in enumerate(pieces[1:]):
        incomplete_word = bool(
            re.search(r"(?:습|입)$", pieces[index].strip())
            and re.fullmatch(r"(?:니|다)[.!?。]?", following.strip())
        )
        if incomplete_word or _structural(pieces[index]) or _structural(following):
            result += separators[index] + following
        else:
            result = result.rstrip(" \t") + " " + following.lstrip(" \t")
    return result


def reflow_prose(value: str, *, preserve_layout: bool = False) -> str:
    """Join layout-only prose wraps without changing words, facts or blank paragraphs.

    Explicit option blocks should use ``preserve_layout=True``. Structural rows
    otherwise retain their boundary newlines; adjacent narrative lines may flow.
    This does not infer missing clauses or repair general Korean grammar.
    """
    if preserve_layout or "\n" not in value:
        return value
    repaired = _POLITE_SPLIT.sub(lambda match: match["head"] + "다", value)
    blocks = _PARAGRAPH.split(repaired)
    return "".join(
        block if index % 2 else _reflow_paragraph(block) for index, block in enumerate(blocks)
    )


def contains_source_wording(source: str, rendered: str) -> bool:
    """Detect original wording after declared whitespace/layout transformations.

    Option properties may follow a shared heading with other properties between
    them. Restrict that check to the matching option block, never another option.
    This is a stale-copy guard, not a semantic equivalence or truth judgment.
    """
    from app.source_analysis.source_options import _option_heading

    def normalized(value):
        return re.sub(r"\s+", " ", value).strip()

    variants = {normalized(source), normalized(reflow_prose(source))}
    target = normalized(rendered)
    if any(value and value in target for value in variants):
        return True
    lines = source.strip().splitlines()
    if len(lines) < 2 or not _option_heading(lines[0]):
        return False
    heading, body = normalized(lines[0]), normalized("\n".join(lines[1:]))
    actual = rendered.splitlines()
    for index, line in enumerate(actual):
        if normalized(line) != heading:
            continue
        block = []
        for following in actual[index + 1 :]:
            if not following.strip() or _option_heading(following):
                break
            block.append(following)
        if body and body in normalized("\n".join(block)):
            return True
    return False
