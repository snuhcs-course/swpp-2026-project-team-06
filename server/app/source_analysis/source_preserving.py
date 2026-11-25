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
)

VERSION = "source-preserving-v5-complete-units"
LAYOUT_VERSION = "source-prose-layout-v1"
_KINDS = ("COPY_EDIT", "OWNER_CONFIRMATION", "PLACEMENT", "SAFETY")
_RESTRICTED = {"PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"}
_EXPLANATIONS = {
    "COPY_EDIT": "원문의 문장·공백·반복을 확인한 뒤 공개해 주세요.",
    "OWNER_CONFIRMATION": (
        "가격·시점·배송 등 현재도 맞는 정보인지 확인해 주세요. "
        "원문 가격과 실제 판매 설정이 일치하는지 별도로 확인해 주세요. 판매 설정은 바뀌지 않습니다."
    ),
    "PLACEMENT": (
        "대상 상품과 상세 항목, 글자 수를 확인해 주세요. 전체 원문은 검토 목록에 보존됩니다."
    ),
    "SAFETY": "공개 제한 표현은 수정하거나 제외해 주세요. 홍보 표현은 사실 여부를 확인해 주세요.",
}
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
_HISTORY = re.compile(r"작년|지난해|당시|과거|\d{4}\s*년|\d+\s*년\s*차")
_SEASON = re.compile(
    r"제철|시즌|한정|품절|재고|예약\s*마감|수량\s*소진|추석|명절|"
    r"(?<![가-힣A-Za-z0-9])설(?:날|\s|선물|을|에|용|[),.!?]|$)|"
    r"(?<!\d)\d{1,2}\s*(?:[~–-]\s*\d{1,2}\s*)?월"
)
_DISPATCH = re.compile(
    r"발송|배송|출고|택배|수령|보내드|주문.{0,12}마감|(?:그날|당일|매일).{0,20}수확"
)
_CURATIVE = re.compile(r"(?:감기|당뇨|질병|질환).{0,16}(?:치료|예방|완화)")
# Source-copy review deliberately permits ordinary subjective promotional wording.
# This is local policy; the legacy extraction/refinement safety lists stay intact.
_EXCESSIVE_PROMOTION = re.compile(
    r"(?:세계|전\s*세계|우주|지구)(?:에서|의|적으로)?(?:가장|제일)?(?:최고|최상|으뜸|1위|일등|유일)"
    r"|(?:절대|무조건|반드시|100%|백퍼센트).{0,16}(?:보장|만족|성공|효과|실패.{0,4}없)"
    r"|(?:당도|맛|품질|만족|효과).{0,12}(?:100%|백퍼센트|무조건|절대).{0,8}보장"
)
_CONTINUATION_END = re.compile(r"(?:듯이|지만|지고|때문에)\s*$")
_BOUNDARY_START = re.compile(
    r"^(?:[-*•▶※#\[【(]|\d+[.)]|옵션|선택|상품|구성|소과|중과|대과|가정용|선물용|"
    r"보관|배송|가격|주의|참고|또한|그리고|하지만|한편|다음|\d{1,4}\s*(?:년|월|일)|"
    r"\d+(?:[,.]\d+)?\s*(?:kg|㎏|g|키로|킬로|박스|상자|과)(?=\s|[:：/–~-]|$))"
)
_SPAN_ORDER = re.compile(r"^(.+?)(\d+)$")
_TERMS = re.compile(r"결제|입금|환불|반품|교환|취소|추가\s*(?:금|비)")


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
        (has_product_lineup(value, target_name), "OTHER_PRODUCT"),
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
            p["decision"] or p["reasonCodes"]["PLACEMENT"] for p in parts
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
    if left["decision"] or right["decision"]:
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
    context_review = not common_candidates or len({p["module"] for p in parts}) != 1
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
            "BLOCKED"
            if _RESTRICTED.intersection(passage["reasonCodes"]["SAFETY"])
            else "PENDING"
            if passage["queueKinds"]
            else "READY"
        )


def build_plan(target, candidates, *, source_versions, target_count=1, decisions=()):
    """Return private source wording plus separately version-bound public-review items.

    Candidate IDs are traceability, not part of a stable per-source decision key.
    planHash covers full current input; reviewVersion is separately fenced by API.
    """
    try:
        return _build(target, candidates, source_versions, target_count, decisions)
    except SourcePlanError:
        raise
    except (TypeError, KeyError, ValueError, AttributeError, IndexError):
        raise SourcePlanError() from None


def _build(target, candidates, versions, target_count, decisions):
    if (
        not isinstance(target, dict)
        or not isinstance(target.get("id"), str)
        or not isinstance(candidates, list)
        or not isinstance(versions, dict)
        or len({c["id"] for c in candidates}) != len(candidates)
    ):
        raise SourcePlanError()
    scope = {"id": target["id"], "name": target.get("name", "")}
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
    sentence_counts = Counter(
        s.strip() for p in passages for s in _SENTENCE.split(p["value"]) if len(s.strip()) >= 12
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
    for passage in passages:
        reasons = passage["reasonCodes"]
        if any(
            sentence_counts[s.strip()] > 1
            for s in _SENTENCE.split(passage["value"])
            if len(s.strip()) >= 12
        ):
            reasons["COPY_EDIT"].append("EXACT_REPETITION")
        decision = decision_map.get(passage["bindingHash"])
        passage["queueKinds"] = [kind for kind in _KINDS if reasons[kind]]
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
        passage["reviewExplanations"] = [_EXPLANATIONS[kind] for kind in passage["queueKinds"]]
        if "CONTINUATION_CONTEXT" in passage["reasonCodes"]["COPY_EDIT"]:
            passage["reviewExplanations"].append(
                "인접한 원문을 연결했지만 서로 다른 추출 항목의 내용입니다. "
                "문맥이 자연스럽게 이어지는지 확인해 주세요."
            )
        if "POSSIBLE_FRAGMENT" in passage["reasonCodes"]["COPY_EDIT"]:
            passage["reviewExplanations"].append(
                "문장이 끊긴 것으로 보이지만 확실한 인접 원문 연결을 확인하지 못했습니다. "
                "없는 뒷문장은 만들지 않았으니 원자료를 확인해 주세요."
            )
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
