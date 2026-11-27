"""Source-first, deterministic suggestions from the full current evidence inventory.

Exact source quotes are evidence, not proof of truth or grammatical correctness.
Every candidate and evidence occurrence is accounted for, including held material.
"""

import copy
import hashlib
import json
import re
from collections import Counter

from app.ai.source_refine import TEXT_MODULE_FIELDS, farm_common_allowed
from app.source_analysis.preprocess import scrub
from app.source_analysis.review_prompts import prompts_for
from app.source_analysis.source_options import assemble_options
from app.source_analysis.source_reflow import reflow_prose
from app.source_analysis.text_safety import (
    SAFETY_LISTS_HASH,
    has_health_claim,
    has_health_words,
    has_money,
    has_period_text,
    has_platform_text,
    has_policy_text,
    has_product_lineup,
    is_target_comparison,
)

VERSION = "source-preserving-v6-owner-questions"
LAYOUT_VERSION = "source-prose-layout-v1"
_KINDS = ("COPY_EDIT", "OWNER_CONFIRMATION", "PLACEMENT", "SAFETY")
_RESTRICTED = {"PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"}
_ACTIONS = {"KEEP", "EDIT", "OMIT", "TRANSFER_TO_SETTINGS", "ACCEPT_REPAIR"}
_SPLIT = re.compile(r"(?P<head>[가-힣]*(?:습니|입니))[ \t]*\r?\n[ \t]*다(?=[.!?。]|$)")
_FRAGMENT = re.compile(r"(?:듯이|지만|지고|때문에|그리고|또한|하지만)[,，]?\s*$|[,，]\s*$")
_PARTICLE = re.compile(r"(?<=[가-힣])\s+(?:에서|을|를)(?=\s|[,.!?。]|$)")
_SENTENCE = re.compile(r"(?<!\d\.)(?<=[.!?。])\s+")
_TIME_END = r"(?=$|[\s,.!?。:;·()]|(?:에도|에는|부터|까지|은|는|의|에|도|쯤)(?=$|[\s,.!?。:;·()]))"
_RELATIVE = re.compile(
    r"(?<![가-힣A-Za-z0-9])(?:올해|내년|조만간|내일|어제|이번|현재|지금|최근|곧)"
    + _TIME_END
    + r"|\d+\s*년\s*전|(?<![가-힣A-Za-z0-9])(?:내년|올해|작년)이맘(?:때|쯤)"
)
# DEV-452 QA 11/28: a past sale's closing notice ("판매가 올해 종료되었습니다", "품절되었습니다")
# contradicts the sale being set up; it starts off the page and stays in "안 넣은 내용" for the
# owner to put back.
_SALE_ENDED = re.compile(
    r"판매(?:가|를|는)?\s*(?:\S+\s*)?(?:종료되|종료했|종료됐|종료입니|마감되|마감했|마감됐|끝났|끝냈)"
    r"|(?:품절|매진)(?:되었|됐|입니|이에요|했)"
    r"|(?:내년|다음\s*(?:해|시즌))에(?:도)?\s*(?:\S+\s*){0,3}(?:찾아\s*뵙|만나)"
)
# Another seller's or brand's own introduction (a reseller's detail page used as material).
_OTHER_SELLER = re.compile(
    r"(?<![A-Za-z])MD(?![A-Za-z])|엠디|입점|셀러|브랜드\s*입니다|브랜드(?:예|이에)요"
)
_FEE_LINE = re.compile(r"무료\s*배송|배송비|택배비|배송\s*택배|주문\s*시\s*결제|착불")
_HISTORY = re.compile(r"작년|지난해|당시|과거|\d{4}\s*년|\d+\s*년\s*차")
_SEASON = re.compile(
    r"제철|시즌|한정|품절|재고|예약\s*마감|수량\s*소진|추석|명절|"
    r"(?<![가-힣A-Za-z0-9])설(?:날|\s|선물|을|에|용|[),.!?]|$)|"
    r"(?<!\d)\d{1,2}\s*(?:[~–-]\s*\d{1,2}\s*)?월"
)
_DISPATCH = re.compile(r"발송|배송|출고|택배|보내드|주문.{0,12}마감|(?:그날|당일|매일).{0,20}수확")
# DEV-452 QA 11/28: an order-time shipping promise ("오전 6시 이전 입금 … 당일 발송") contradicts a
# pre-order with the producer's own 받는 시기; like a season sentence it starts off the page.
_SHIP_TIMING = re.compile(
    r"(?:당일|익일|다음\s*날)\s*(?:발송|출고)"
    r"|(?:주문|입금|결제)[^.\n]{0,16}(?:즉시|바로)\s*(?:발송|출고)"
    r"|[월화수목금토일]요일에\s*(?:발송|출고)"
    r"|오전\s*\d{1,2}\s*시\s*(?:이전|전|까지)[^.\n]{0,12}(?:입금|주문|결제)"
)
_CURATIVE = re.compile(r"(?:감기|당뇨|질병|질환).{0,16}(?:치료|예방|완화)")
# Source-copy review deliberately permits ordinary subjective promotional wording.
# This is local policy; the legacy extraction/refinement safety lists stay intact.
_EXCESSIVE_PROMOTION = re.compile(
    r"(?:세계|전\s*세계|우주|지구)(?:에서|의|적으로)?(?:가장|제일)?(?:최고|최상|으뜸|1위|일등|유일)"
    r"|(?:절대|무조건|반드시|100%|백퍼센트).{0,16}(?:보장|만족|성공|효과|실패.{0,4}없)"
    r"|(?:당도|맛|품질|만족|효과).{0,12}(?:100%|백퍼센트|무조건|절대).{0,8}보장"
)
_CONTINUATION_END = re.compile(r"(?:듯이|지만|지고|때문에)[,，]?\s*$")
_BOUNDARY_START = re.compile(
    r"^(?:[-*•▶※#\[【(]|\d+[.)]|옵션|선택|상품|구성|소과|중과|대과|가정용|선물용|"
    r"보관|배송|가격|주의|참고|또한|그리고|하지만|한편|다음|\d{1,4}\s*(?:년|월|일)|"
    r"\d+(?:[,.]\d+)?\s*(?:kg|㎏|g|키로|킬로|박스|상자|과)(?=\s|[:：/–~-]|$))"
)
_SPAN_ORDER = re.compile(r"^(.+?)(\d+)$")
_TERMS = re.compile(
    r"결제|입금|환불|반품|교환|취소|추가\s*(?:금|비)"
    r"|책임(?:을)?\s*지지|책임지기\s*어렵|보상(?:이|은|해)?\s*(?:어렵|불가)"
)


class SourcePlanError(ValueError):
    def __init__(self, reason="INVALID_INPUT"):
        self.reason = reason
        super().__init__("Invalid source-preserving plan (details redacted)")


def _hash(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _safety(value, target_name):
    checks = [
        (scrub(value) != value, "PRIVATE_VALUE"),
        (has_money(value), "MONEY_AMOUNT"),
        (has_health_claim(value) or bool(_CURATIVE.search(value)), "HEALTH_CLAIM"),
        (bool(_EXCESSIVE_PROMOTION.search(re.sub(r"\s+", "", value))), "EXAGGERATION"),
        (has_policy_text(value), "POLICY_TEXT"),
        (has_platform_text(value), "PLATFORM_TEXT"),
        (
            has_product_lineup(value, target_name) and not is_target_comparison(value, target_name),
            "OTHER_PRODUCT",
        ),
    ]
    return [code for matched, code in checks if matched]


def _reasons(value, historical, target_name):
    reasons = {kind: [] for kind in _KINDS}
    repair = _SPLIT.sub(lambda m: m["head"] + "다", value)
    if repair != value:
        reasons["COPY_EDIT"].append("OCR_SPLIT")
    if _FRAGMENT.search(value):
        reasons["COPY_EDIT"].append("POSSIBLE_FRAGMENT")
    if _PARTICLE.search(value) or re.search(r"\s+[,，]", value):
        reasons["COPY_EDIT"].append("POSSIBLE_SPACING")
    owner = reasons["OWNER_CONFIRMATION"]
    if has_money(value) or re.search(r"가격|배송비|수수료|추가요금", value):
        owner.append("PRICE_OR_FEE")
    if _RELATIVE.search(value):
        owner.append("RELATIVE_TIME")
    if historical or _HISTORY.search(value):
        owner.append("DATED_OR_HISTORICAL")
    if _SEASON.search(value):
        owner.append("SEASON_OR_AVAILABILITY")
    if _DISPATCH.search(value):
        owner.append("DISPATCH_OR_DELIVERY")
    if _TERMS.search(value):
        owner.append("PAYMENT_OR_RETURN_TERMS")
    if has_period_text(value):
        owner.append("TIMING_OR_SALES_TERMS")
    if _SALE_ENDED.search(value):
        owner.append("SALE_ENDED")
    if _OTHER_SELLER.search(value):
        owner.append("OTHER_SELLER")
    reasons["SAFETY"] = _safety(value, target_name)
    return reasons, repair if repair != value else None


def _span_order(passage):
    """Numeric source span IDs establish adjacency; prose/layout guesses do not."""
    refs = passage["evidence"]
    if len(refs) != 1:
        return None
    parsed = [_SPAN_ORDER.fullmatch(sid) for sid in refs[0]["spanIds"]]
    if not parsed or not all(parsed):
        return None
    prefixes = {match[1] for match in parsed}
    numbers = [int(match[2]) for match in parsed]
    if len(prefixes) != 1 or any(
        right != left + 1 for left, right in zip(numbers, numbers[1:], strict=False)
    ):
        return None
    return next(iter(prefixes)), numbers[0], numbers[-1]


_STRUCTURED_MODULES = {"composition", "pieceCount", "specification", "qualityEvidence"}


def _move_fragments_to_continuation(passages, decision_map):
    """Put an unfinished line next to its source-adjacent continuation.

    Extraction sometimes files the first half in a structured module and the rest
    in a narrative one; the join only looks at narrative modules. Only the module
    changes (provenance is untouched), and only for one unique consecutive span
    on the same source page.
    """
    starts = {}
    for p in passages:
        order = _span_order(p)
        if order and p["module"] not in _STRUCTURED_MODULES:
            key = (
                p["sourceId"],
                p["sourceRevision"],
                p["sanitizationVersion"],
                p["evidence"][0]["page"],
                order[0],
                order[1],
            )
            starts.setdefault(key, []).append(p)
    for left in passages:
        order = _span_order(left)
        if (
            not order
            or left["module"] not in _STRUCTURED_MODULES
            or "POSSIBLE_FRAGMENT" not in left["reasonCodes"]["COPY_EDIT"]
            or left["reasonCodes"]["PLACEMENT"]
            or left["bindingHash"] in decision_map
        ):
            continue
        key = (
            left["sourceId"],
            left["sourceRevision"],
            left["sanitizationVersion"],
            left["evidence"][0]["page"],
            order[0],
            order[2] + 1,
        )
        rights = starts.get(key, ())
        if len(rights) == 1 and not rights[0]["reasonCodes"]["PLACEMENT"]:
            left["module"] = rights[0]["module"]


def _assembly_allowed(passage):
    return not passage["decision"] or passage.get("assemblyAcknowledged", False)


def _source_candidate_edges(passages, candidate_by_id, occupied):
    """Use a complete, verbatim candidate as a paragraph boundary, never a paraphrase.

    Quote occurrences still need unique consecutive source-span identity. This
    permits OCR/text line wraps without joining separate captions or option rows.
    """
    edges = set()
    for cid, candidate in candidate_by_id.items():
        if candidate["fieldKey"] in {
            "composition",
            "pieceCount",
            "specification",
            "qualityEvidence",
        }:
            continue
        refs = candidate.get("evidence", [])
        if len(refs) < 2 or "\n\n" in candidate["value"]:
            continue
        parts = []
        for ref in refs:
            matches = [p for p in passages if cid in p["candidateIds"] and p["evidence"] == [ref]]
            if len(matches) != 1:
                break
            parts.append(matches[0])
        if len(parts) != len(refs) or any(
            not _assembly_allowed(p) or p["reasonCodes"]["PLACEMENT"] for p in parts
        ):
            continue

        def compact(value):
            return re.sub(r"\s+", "", value)

        if compact(candidate["value"]) != compact(" ".join(p["value"] for p in parts)):
            continue
        if any(
            "\n\n" in p["value"] or _BOUNDARY_START.search(p["value"].lstrip()) for p in parts[1:]
        ):
            continue
        orders = [_span_order(p) for p in parts]
        if not all(orders):
            continue
        if any(
            any(a[key] != b[key] for key in ("sourceId", "sourceRevision", "sanitizationVersion"))
            or a["evidence"][0]["page"] != b["evidence"][0]["page"]
            or x[0] != y[0]
            or x[2] + 1 != y[1]
            for a, b, x, y in zip(parts, parts[1:], orders, orders[1:], strict=False)
        ):
            continue
        if any(
            occupied[(p["sourceId"], p["evidence"][0]["page"], sid)] != 1
            for p in parts
            for sid in p["evidence"][0]["spanIds"]
        ):
            continue
        for a, b in zip(parts, parts[1:], strict=False):
            # Source line breaks can stand in for missing punctuation. Keep a
            # complete declarative line separate rather than invent a period.
            if re.search(r"(?:습니다|입니다|했어요|었어요|이에요|예요)\s*$", a["value"]):
                continue
            edges.add((a["id"], b["id"]))
    return edges


def _assembly_module(parts):
    modules = {p["module"] for p in parts}
    # A complete descriptive sentence is not a warning simply because its first
    # clause mentions appearance. Retain context review for cross-field joins.
    if len(modules) > 1 and modules <= {"appearanceFaq", "taste", "summary"}:
        return "summary"
    return parts[0]["module"]


def _can_join(left, right, occupied, candidate_by_id, candidate_edges):
    if not _assembly_allowed(left) or not _assembly_allowed(right):
        return False
    candidate_link = (left["id"], right["id"]) in candidate_edges
    if not candidate_link and not _CONTINUATION_END.search(left["value"].rstrip()):
        return False
    continuation = right["value"].strip()
    # A heading, option, independent topic or another unfinished label is not
    # evidence of the missing clause. Never supply text absent from the source.
    if (
        not continuation
        or (not candidate_link and _BOUNDARY_START.search(continuation))
        or "\n\n" in continuation
        or not (
            candidate_link
            or re.search(r"[.!?。]\s*$", continuation)
            or _CONTINUATION_END.search(continuation)
            or right["id"] in {a for a, _ in candidate_edges}
        )
        or left["reasonCodes"]["PLACEMENT"]
        or right["reasonCodes"]["PLACEMENT"]
    ):
        return False
    if (
        any(
            left[key] != right[key] for key in ("sourceId", "sourceRevision", "sanitizationVersion")
        )
        or left["evidence"][0]["page"] != right["evidence"][0]["page"]
    ):
        return False
    shared = set(left["candidateIds"]) & set(right["candidateIds"])
    a, b = _span_order(left), _span_order(right)
    if not a or not b or a[0] != b[0] or a[2] + 1 != b[1]:
        return False
    # Shared-candidate references must retain their recorded order. Across
    # candidates/modules, only unique consecutive source spans establish order.
    if shared and not any(
        any(
            first == left["evidence"][0] and second == right["evidence"][0]
            for first, second in zip(
                candidate_by_id[cid]["evidence"],
                candidate_by_id[cid]["evidence"][1:],
                strict=False,
            )
        )
        for cid in shared
    ):
        return False
    return all(
        occupied[(p["sourceId"], p["evidence"][0]["page"], sid)] == 1
        for p in (left, right)
        for sid in p["evidence"][0]["spanIds"]
    )


def _assembly_groups(passages, candidate_by_id):
    eligible = [
        p for p in passages if p["status"] != "EXCLUDED" and scrub(p["value"]) == p["value"]
    ]
    occupied = Counter(
        (p["sourceId"], p["evidence"][0]["page"], sid)
        for p in passages
        for sid in p["evidence"][0]["spanIds"]
    )
    candidate_edges = _source_candidate_edges(eligible, candidate_by_id, occupied)
    candidate_starts = {a for a, _ in candidate_edges}
    starts = {}
    orders = {}
    for passage in eligible:
        order = _span_order(passage)
        if order:
            orders[passage["id"]] = order
            key = (
                passage["sourceId"],
                passage["sourceRevision"],
                passage["sanitizationVersion"],
                passage["evidence"][0]["page"],
                order[0],
                order[1],
            )
            starts.setdefault(key, []).append(passage)
    links = []
    for left in eligible:
        order = orders.get(left["id"])
        if not order or not (
            _CONTINUATION_END.search(left["value"].rstrip()) or left["id"] in candidate_starts
        ):
            continue
        key = (
            left["sourceId"],
            left["sourceRevision"],
            left["sanitizationVersion"],
            left["evidence"][0]["page"],
            order[0],
            order[2] + 1,
        )
        for right in starts.get(key, ()):
            if _can_join(left, right, occupied, candidate_by_id, candidate_edges):
                links.append((left["id"], right["id"]))
    outgoing = Counter(left for left, _ in links)
    incoming = Counter(right for _, right in links)
    next_id = {left: right for left, right in links if outgoing[left] == incoming[right] == 1}
    consumed = set(next_id.values())
    by_id = {p["id"]: p for p in eligible}
    groups = []
    for passage in eligible:
        if passage["id"] in consumed:
            continue
        parts = [passage]
        while parts[-1]["id"] in next_id:
            parts.append(by_id[next_id[parts[-1]["id"]]])
        groups.append(parts)
    return groups


def _assembled_text(parts):
    ids = [p["id"] for p in parts]
    text = {
        "value": " ".join(p["value"].strip() for p in parts)
        if len(parts) > 1
        else parts[0]["value"],
        "candidateIds": list(dict.fromkeys(cid for p in parts for cid in p["candidateIds"])),
        "passageIds": ids,
    }
    if len(parts) > 1:
        text["assembly"] = {
            "type": "SOURCE_ADJACENT_CONTINUATION",
            "separator": " ",
            "passageIds": ids,
            "module": _assembly_module(parts),
        }
    return text


def _mark_assembly(parts, assembly):
    common_candidates = set.intersection(*(set(p["candidateIds"]) for p in parts))
    owner_confirmed = all(p.get("assemblyAcknowledged", False) for p in parts)
    context_review = not owner_confirmed and (
        not common_candidates or len({p["module"] for p in parts}) != 1
    )
    assembly["ownerConfirmed"] = owner_confirmed
    assembly["contextReviewRequired"] = context_review
    for index, passage in enumerate(parts):
        cleared = []
        if index < len(parts) - 1 and "POSSIBLE_FRAGMENT" in passage["reasonCodes"]["COPY_EDIT"]:
            passage["reasonCodes"]["COPY_EDIT"].remove("POSSIBLE_FRAGMENT")
            cleared.append("POSSIBLE_FRAGMENT")
        if context_review:
            passage["reasonCodes"]["COPY_EDIT"].append("CONTINUATION_CONTEXT")
        passage["autoRepair"] = {**assembly, "clearedReasonCodes": cleared}
        passage["queueKinds"] = [kind for kind in _KINDS if passage["reasonCodes"][kind]]
        passage["status"] = (
            "READY"
            if owner_confirmed
            else "BLOCKED"
            if _RESTRICTED.intersection(passage["reasonCodes"]["SAFETY"])
            else "PENDING"
            if passage["queueKinds"]
            else "READY"
        )


# A price at the very end of an option-style line ("가정용 3kg (9~12과) 32,000원").
_PRICE = re.compile(
    r"\s*[:：]?\s*(?:₩\s*)?(?:\d{1,3}(?:,\d{3})+|\d{4,}|\d+(?:\.\d+)?\s*만)\s*원?\s*\.?\s*$"
)
_WEIGHT = re.compile(r"\d+(?:\.\d+)?\s*(?:kg|㎏|키로|킬로|g)(?![a-z])", re.IGNORECASE)


def weight_conflict(value, input_weights):
    """The text names a box weight that is not among the producer's sale options.

    DEV-452 QA 11/28: "3kg, 5kg, 10kg" with options 3kg/5kg conflicts (10kg is not sold); only the
    producer's options appear on the page (PM 11/27 rule b).
    """
    if not input_weights:
        return False
    found = []
    for m in _WEIGHT.finditer(value):
        number = float(re.match(r"\d+(?:\.\d+)?", m.group(0)).group(0))
        found.append(number / 1000 if re.search(r"(?<!k)g$", m.group(0).lower()) else number)
    return any(not any(abs(w - o) < 1e-6 for o in input_weights) for w in found)


_VARIANT = re.compile(
    r"가정용|선물용|실속형?|프리미엄|명품|로얄|특대과?|특과|대과|중대과|중과|소과|못난이|흠과|파치"
)


def option_conflict(value, input_weights, input_labels=()):
    """Weight not among the options, or a variant (가정용, 중대과 …) no option label names."""
    if weight_conflict(value, input_weights):
        return True
    if not input_weights:
        return False
    labels = " ".join(input_labels)
    return any(v not in labels for v in _VARIANT.findall(value))


def months_in(value):
    """Months named in a text ("1월 중순부터 2월 말까지" → {1, 2}; "4~5월" → {4, 5})."""
    months = set()
    for a, b in re.findall(r"(\d{1,2})\s*월?\s*[~\-–]\s*(\d{1,2})\s*월", value):
        start, end = int(a), int(b)
        if 1 <= start <= 12 and 1 <= end <= 12:
            m = start
            while True:
                months.add(m)
                if m == end:
                    break
                m = m % 12 + 1
    months.update(int(m) for m in re.findall(r"(\d{1,2})\s*월", value) if 1 <= int(m) <= 12)
    return months


def season_conflict(value, input_months):
    """The text names months and none of them fall in the producer's delivery months."""
    named = months_in(value)
    return bool(named) and not (named & set(input_months))


def without_price(value):
    """The text with money amounts removed, or "" if nothing meaningful is left (DEV-452)."""
    if "\n" in value.strip() or not _PRICE.search(value):
        return ""
    rest = _PRICE.sub("", value)
    rest = re.sub(r"^[\s\-·•*]+|[\s,·:/-]+$", "", rest)
    rest = re.sub(r"[ \t]{2,}", " ", rest)
    if (
        has_money(rest)
        or re.search(r"가격|배송비|택배비|수수료|요금|할인", rest)
        or len(re.sub(r"[^가-힣A-Za-z0-9]", "", rest)) < 3
    ):
        return ""
    return rest


def build_plan(
    target,
    candidates,
    *,
    source_versions,
    target_count=1,
    decisions=(),
    input_prices=False,
    input_weights=(),
    input_labels=(),
    input_months=(),
):
    """Return private source wording plus separately version-bound public-review items.

    Candidate IDs are traceability, not part of a stable per-source decision key.
    planHash covers full current input; reviewVersion is separately fenced by API.
    """
    try:
        return _build(
            target,
            candidates,
            source_versions,
            target_count,
            decisions,
            input_prices,
            input_weights,
            input_labels,
            input_months,
        )
    except SourcePlanError:
        raise
    except (TypeError, KeyError, ValueError, AttributeError, IndexError):
        raise SourcePlanError() from None


def _build(
    target,
    candidates,
    versions,
    target_count,
    decisions,
    input_prices=False,
    input_weights=(),
    input_labels=(),
    input_months=(),
):
    if (
        not isinstance(target, dict)
        or not isinstance(target.get("id"), str)
        or not isinstance(candidates, list)
        or not isinstance(versions, dict)
        or len({c["id"] for c in candidates}) != len(candidates)
    ):
        raise SourcePlanError()
    scope = {
        "id": target["id"],
        "name": (target.get("basicInfo") or {}).get("variety") or target.get("name", ""),
    }
    fingerprint = _hash(
        {
            "version": VERSION,
            "layoutVersion": LAYOUT_VERSION,
            "safety": SAFETY_LISTS_HASH,
            "target": scope,
            "targetCount": target_count,
            "sources": versions,
            "candidates": candidates,
        }
    )
    candidate_by_id = {c["id"]: c for c in candidates}
    groups, accounting = {}, []
    for c in candidates:
        cid, field = c["id"], c["fieldKey"]
        module = "hero" if field == "name" else "farmStory" if field == "historicalSales" else field
        # Common evidence is visible for review, but is never auto-accepted into
        # fields that the shared editor cannot save as scoped REFINED evidence.
        allowed = c.get("targetId") in (target["id"], None)
        if not allowed or module not in TEXT_MODULE_FIELDS or not c.get("evidence"):
            reason = (
                "OTHER_TARGET"
                if not allowed
                else ("NON_TEXT_FIELD" if module not in TEXT_MODULE_FIELDS else "MISSING_EVIDENCE")
            )
            for evidence_index in range(len(c.get("evidence", []))) or [None]:
                accounting.append(
                    {
                        "candidateId": cid,
                        "evidenceIndex": evidence_index,
                        "passageId": None,
                        "disposition": "EXCLUDED",
                        "reason": reason,
                    }
                )
            continue
        for index, ref in enumerate(c["evidence"]):
            source = versions[ref["sourceId"]]
            if (
                ref["sourceRevision"] != source["revision"]
                or not ref["spanIds"]
                or not isinstance(ref["quote"], str)
                or not ref["quote"].strip()
            ):
                raise SourcePlanError("STALE_SOURCE")
            identity = {
                "sourceId": ref["sourceId"],
                "revision": source["revision"],
                "sanitizationVersion": source["sanitizationVersion"],
                "page": ref["page"],
                "spanIds": sorted(ref["spanIds"]),
                "quote": ref["quote"],
            }
            key = _hash(identity)
            group = groups.setdefault(
                key,
                {
                    "identity": identity,
                    "evidence": [copy.deepcopy(ref)],
                    "candidateIds": [],
                    "modules": [],
                    "historical": False,
                    "parentHealth": False,
                    "commonRestricted": False,
                    "ledger": [],
                },
            )
            if cid not in group["candidateIds"]:
                group["candidateIds"].append(cid)
            if module not in group["modules"]:
                group["modules"].append(module)
            group["historical"] |= bool(c.get("historical") or field == "historicalSales")
            group["parentHealth"] |= bool(has_health_words(c.get("value", "")))
            group["commonRestricted"] |= c.get("targetId") is None and (
                target_count != 1 or not farm_common_allowed(c, module)
            )
            row = {
                "candidateId": cid,
                "evidenceIndex": index,
                "passageId": key[:24],
                "disposition": "PENDING",
                "reason": None,
            }
            accounting.append(row)
            group["ledger"].append(row)
    passages = []
    for key, group in groups.items():
        identity = group["identity"]
        value = identity["quote"]
        reasons, repair = _reasons(value, group["historical"], scope["name"])
        if group["parentHealth"] and "HEALTH_CLAIM" not in reasons["SAFETY"]:
            reasons["SAFETY"].append("HEALTH_CLAIM")
        if group["commonRestricted"]:
            reasons["PLACEMENT"].append("COMMON_SCOPE_UNCONFIRMED")
        module = group["modules"][0]
        if len(group["modules"]) != 1:
            reasons["PLACEMENT"].append("AMBIGUOUS_MODULE_ROUTING")
        if len(value) > 3000:
            reasons["PLACEMENT"].append("FIELD_LIMIT")
        binding = _hash(
            {
                "version": VERSION,
                "safety": SAFETY_LISTS_HASH,
                "targetId": target["id"],
                "source": identity,
                "modules": sorted(group["modules"]),
                "historical": group["historical"],
                "parentHealth": group["parentHealth"],
                "commonRestricted": group["commonRestricted"],
            }
        )
        passages.append(
            {
                "id": key[:24],
                "bindingHash": binding,
                "module": module,
                "value": value,
                "originalValue": value,
                "sourceExact": True,
                "candidateIds": group["candidateIds"],
                "evidence": group["evidence"],
                "sourceId": identity["sourceId"],
                "sourceRevision": identity["revision"],
                "sanitizationVersion": identity["sanitizationVersion"],
                "reasonCodes": reasons,
                "repairValue": repair,
                "decision": None,
                "status": "PENDING",
                "queueKinds": [],
                "grammarAssessment": "NOT_RUN",
            }
        )
    # DEV-452 QA 11/28: a passage that repeats an earlier one word for word (the same sentence read
    # twice from one PDF) is dropped silently instead of being asked about twice.
    first_of, exact_repeats = {}, set()
    for p in passages:
        key = re.sub(r"\s+", " ", p["value"]).strip()
        if len(key) >= 12 and key in first_of:
            exact_repeats.add(p["id"])
        else:
            first_of.setdefault(key, p["id"])
    sentence_counts = Counter(
        s.strip()
        for p in passages
        if p["id"] not in exact_repeats
        for s in _SENTENCE.split(p["value"])
        if len(s.strip()) >= 12
    )
    seen_decisions = set()
    decision_map = {}
    bindings = {p["bindingHash"] for p in passages}
    for decision in decisions:
        binding = decision["bindingHash"]
        if binding not in bindings:
            raise SourcePlanError("STALE_DECISION")
        if binding in seen_decisions or decision.get("action") not in _ACTIONS:
            raise SourcePlanError("INVALID_DECISION")
        seen_decisions.add(binding)
        decision_map[binding] = decision
    acknowledged = set()
    _move_fragments_to_continuation(passages, decision_map)
    narrative = [p for p in passages if p["module"] not in _STRUCTURED_MODULES]
    for parts in _assembly_groups(narrative, candidate_by_id):
        if len(parts) < 2:
            continue
        module = _assembly_module(parts)
        if all(
            (decision_map.get(p["bindingHash"]) or {}).get("action") == "KEEP"
            and decision_map[p["bindingHash"]].get("module", module) == module
            for p in parts
        ):
            acknowledged.update(p["id"] for p in parts)
    for passage in passages:
        reasons = passage["reasonCodes"]
        if any(
            sentence_counts[s.strip()] > 1
            for s in _SENTENCE.split(passage["value"])
            if len(s.strip()) >= 12
        ):
            reasons["COPY_EDIT"].append("EXACT_REPETITION")
        decision = decision_map.get(passage["bindingHash"])
        passage["assemblyAcknowledged"] = passage["id"] in acknowledged
        passage["queueKinds"] = [kind for kind in _KINDS if reasons[kind]]
        if passage["id"] in exact_repeats and not decision:
            passage["status"] = "EXCLUDED"
            passage["duplicateOf"] = first_of[re.sub(r"\s+", " ", passage["value"]).strip()]
            passage["queueKinds"] = []
            continue
        if decision:
            action = decision["action"]
            note = (decision.get("note") or "").strip()
            passage["decision"] = copy.deepcopy(decision)
            if action in {"OMIT", "TRANSFER_TO_SETTINGS"}:
                passage["status"] = "EXCLUDED"
                continue
            if "COMMON_SCOPE_UNCONFIRMED" in reasons["PLACEMENT"] and action != "EDIT":
                raise SourcePlanError("EDIT_REQUIRED")
            if action == "KEEP":
                if _RESTRICTED.intersection(reasons["SAFETY"]):
                    raise SourcePlanError("EDIT_REQUIRED")
                if (reasons["OWNER_CONFIRMATION"] or reasons["SAFETY"]) and not note:
                    raise SourcePlanError("NOTE_REQUIRED")
            if action == "ACCEPT_REPAIR":
                if not passage["repairValue"] or reasons["OWNER_CONFIRMATION"] or reasons["SAFETY"]:
                    raise SourcePlanError("EDIT_REQUIRED")
                passage["value"] = passage["repairValue"]
            if action == "EDIT":
                value = (decision.get("value") or "").strip()
                if not value or len(value) > 3000 or not note:
                    raise SourcePlanError("INVALID_DECISION")
                if _RESTRICTED.intersection(_safety(value, scope["name"])):
                    raise SourcePlanError("UNSAFE_EDIT")
                passage["value"] = value
            if decision.get("module") is not None:
                if decision["module"] not in TEXT_MODULE_FIELDS:
                    raise SourcePlanError("INVALID_DECISION")
                passage["module"] = decision["module"]
            if action != "EDIT" and any(
                candidate_by_id[cid].get("targetId") is None
                and not farm_common_allowed(candidate_by_id[cid], passage["module"])
                for cid in passage["candidateIds"]
            ):
                raise SourcePlanError("EDIT_REQUIRED")
            if passage["module"] is None:
                raise SourcePlanError("PLACEMENT_REQUIRED")
            if len(passage["value"]) > 3000:
                raise SourcePlanError("FIELD_LIMIT")
            passage["sourceExact"] = passage["value"] == passage["originalValue"]
            passage["status"] = "READY"
        elif input_prices and (
            "MONEY_AMOUNT" in reasons["SAFETY"] or "PRICE_OR_FEE" in reasons["OWNER_CONFIRMATION"]
        ):
            # DEV-452: the producer's own sale settings win over prices in the material. The
            # material's wording stays visible (inputPreferred) and can be put back explicitly.
            passage["inputPreferred"] = "PRICE"
            remainder = without_price(passage["value"])
            if remainder and not _RESTRICTED.intersection(reasons["SAFETY"]):
                # An option line such as "가정용 3kg (9~12과) 32,000원" keeps its size and count;
                # only the price is dropped (deletion, no rewording).
                passage["value"] = remainder
                passage["priceRemoved"] = True
                if _WEIGHT.search(remainder):
                    passage["module"] = "composition"  # an option line: size and count
                elif "AMBIGUOUS_MODULE_ROUTING" in reasons["PLACEMENT"]:
                    passage["module"] = None
                if passage["module"] is not None and not option_conflict(
                    remainder, input_weights, input_labels
                ):
                    passage["sourceExact"] = False
                    passage["status"] = "READY"
                    passage["queueKinds"] = []
                    continue
            passage["status"] = "EXCLUDED"
            passage["queueKinds"] = []
            continue
        elif (
            input_prices
            and len(re.sub(r"\s+", "", passage["value"])) <= 30
            and _FEE_LINE.search(passage["value"])
        ):
            # DEV-452 QA 11/28: a short shipping-fee line from the material ("무료배송",
            # "배송 택배(주문 시 결제)") repeats or contradicts the 배송비 in the sale settings,
            # which the page already shows; it stays next to the price for reference.
            passage["inputPreferred"] = "PRICE"
            passage["status"] = "EXCLUDED"
            passage["queueKinds"] = []
            continue
        elif "SALE_ENDED" in reasons["OWNER_CONFIRMATION"]:
            # DEV-452 QA 11/28: a past sale's closing notice starts off the page (see _SALE_ENDED).
            passage["status"] = "EXCLUDED"
            passage["queueKinds"] = []
            continue
        elif passage["module"] == "composition" and option_conflict(
            passage["value"], input_weights, input_labels
        ):
            # DEV-452: the sale options entered by the producer win over the material's box sizes
            # and variants (PM 11/27 rule b: only the producer's options appear on the page).
            passage["inputPreferred"] = "WEIGHT"
            passage["status"] = "EXCLUDED"
            passage["queueKinds"] = []
            continue
        elif (
            input_months
            and "DISPATCH_OR_DELIVERY" in reasons["OWNER_CONFIRMATION"]
            and _SHIP_TIMING.search(passage["value"])
        ):
            # DEV-452 QA 11/28: the producer's 받는 시기 wins over an order-time shipping promise;
            # the wording is kept for reference next to 받는 시기 (same place as season text).
            passage["inputPreferred"] = "SEASON"
            passage["status"] = "EXCLUDED"
            passage["queueKinds"] = []
            continue
        elif (
            input_months
            and "SEASON_OR_AVAILABILITY" in reasons["OWNER_CONFIRMATION"]
            and season_conflict(passage["value"], input_months)
        ):
            # DEV-452 (PM 11/27 rule a): a harvest/season sentence outside the producer's delivery
            # months stays off the page and is shown next to the sale settings for reference.
            passage["inputPreferred"] = "SEASON"
            passage["status"] = "EXCLUDED"
            passage["queueKinds"] = []
            continue
        else:
            passage["status"] = (
                "BLOCKED"
                if _RESTRICTED.intersection(reasons["SAFETY"])
                else ("PENDING" if any(reasons.values()) else "READY")
            )
        passage["queueKinds"] = [kind for kind in _KINDS if reasons[kind]]
    option_units = assemble_options(
        [p for p in passages if p["status"] != "EXCLUDED" and scrub(p["value"]) == p["value"]]
    )
    option_ids = {p["id"] for unit in option_units for p in unit["parts"]}
    units = option_units + [
        {"module": _assembly_module(parts), "parts": parts, "text": _assembled_text(parts)}
        for parts in _assembly_groups(
            [p for p in passages if p["id"] not in option_ids], candidate_by_id
        )
    ]
    positions = {p["id"]: i for i, p in enumerate(passages)}
    units.sort(key=lambda unit: min(positions[p["id"]] for p in unit["parts"]))
    for passage in passages:
        passage["includedInDraft"] = False
    modules = []
    for module in TEXT_MODULE_FIELDS:
        selected = [unit for unit in units if unit["module"] == module]
        total, ids = 0, set()
        texts = []
        for unit in selected:
            parts, text = unit["parts"], unit["text"]
            original_layout = text["value"]
            preserve_layout = text.get("assembly", {}).get("type") == "SOURCE_OPTION_BLOCK" or any(
                p.get("decision") and p["decision"]["action"] in {"EDIT", "ACCEPT_REPAIR"}
                for p in parts
            )
            text["value"] = reflow_prose(original_layout, preserve_layout=preserve_layout)
            if text["value"] != original_layout:
                text["layout"] = {
                    "version": LAYOUT_VERSION,
                    "operation": "PROSE_REFLOW",
                    "sourceTextSha256": _sha(original_layout),
                    "resultTextSha256": _sha(text["value"]),
                }
            proposed_ids = ids | set(text["candidateIds"])
            proposed_total = total + len(text["value"]) + (2 if texts else 0)
            if proposed_total > 3000 or len(proposed_ids) > 100:
                for passage in parts:
                    passage["status"] = "PENDING"
                    passage["reasonCodes"]["PLACEMENT"].append("FIELD_LIMIT")
                    if "PLACEMENT" not in passage["queueKinds"]:
                        passage["queueKinds"].append("PLACEMENT")
                continue
            for passage in parts:
                passage["includedInDraft"] = True
            if text.get("assembly", {}).get("type") == "SOURCE_ADJACENT_CONTINUATION":
                _mark_assembly(parts, text["assembly"])
            elif text.get("assembly", {}).get("type") == "SOURCE_OPTION_BLOCK":
                for passage in parts:
                    passage["optionAssembly"] = text["assembly"]
            ids = proposed_ids
            total = proposed_total
            texts.append(text)
        if texts:
            modules.append({"module": module, "texts": texts})
    for passage in passages:
        passage["reviewPending"] = passage["status"] in {"PENDING", "BLOCKED"}
        passage["reviewPrompts"] = prompts_for(passage["value"], passage["reasonCodes"])
        passage["reviewExplanations"] = [
            f"{prompt['question']} {prompt['detail']}" for prompt in passage["reviewPrompts"]
        ]
        entries = [r for r in accounting if r["passageId"] == passage["id"]]
        for i, row in enumerate(entries):
            row["disposition"] = (
                "DEDUPLICATED" if passage["status"] == "READY" and i else passage["status"]
            )
    return {
        "version": VERSION,
        "layoutVersion": LAYOUT_VERSION,
        "planHash": fingerprint,
        "targetId": target["id"],
        "passages": passages,
        "modules": modules,
        "accounting": accounting,
        "summary": {
            "inputCandidates": len(candidates),
            "inputEvidence": sum(len(c.get("evidence", [])) for c in candidates),
            "passages": len(passages),
            "includedInDraft": sum(p["includedInDraft"] for p in passages),
            "reviewPending": sum(p["reviewPending"] for p in passages),
            "ready": sum(p["status"] == "READY" for p in passages),
            "held": sum(p["status"] in {"PENDING", "BLOCKED"} for p in passages),
            "excluded": sum(p["status"] == "EXCLUDED" for p in passages),
        },
        "requiresContentReview": True,
        "grammarAssessment": "NOT_RUN",
        "semanticAccuracyEstablished": False,
    }
