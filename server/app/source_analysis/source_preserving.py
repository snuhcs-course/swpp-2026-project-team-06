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
from app.source_analysis.text_safety import (
    SAFETY_LISTS_HASH,
    has_exaggeration,
    has_health_claim,
    has_health_words,
    has_money,
    has_period_text,
    has_platform_text,
    has_policy_text,
    has_product_lineup,
)

VERSION = "source-preserving-v2-private-review"
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
        (has_exaggeration(value), "EXAGGERATION"),
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
    for passage in passages:
        passage["includedInDraft"] = False
    modules = []
    for module in TEXT_MODULE_FIELDS:
        selected = [
            p
            for p in passages
            if p["module"] == module
            and p["status"] != "EXCLUDED"
            and scrub(p["value"]) == p["value"]
        ]
        total, ids = 0, set()
        texts = []
        for passage in selected:
            proposed_ids = ids | set(passage["candidateIds"])
            proposed_total = total + len(passage["value"]) + (2 if texts else 0)
            if proposed_total > 3000 or len(proposed_ids) > 100:
                passage["status"] = "PENDING"
                passage["reasonCodes"]["PLACEMENT"].append("FIELD_LIMIT")
                if "PLACEMENT" not in passage["queueKinds"]:
                    passage["queueKinds"].append("PLACEMENT")
                continue
            passage["includedInDraft"] = True
            ids = proposed_ids
            total = proposed_total
            texts.append({"value": passage["value"], "candidateIds": passage["candidateIds"]})
        if texts:
            modules.append({"module": module, "texts": texts})
    for passage in passages:
        passage["reviewPending"] = passage["status"] in {"PENDING", "BLOCKED"}
        passage["reviewExplanations"] = [_EXPLANATIONS[kind] for kind in passage["queueKinds"]]
        entries = [r for r in accounting if r["passageId"] == passage["id"]]
        for i, row in enumerate(entries):
            row["disposition"] = (
                "DEDUPLICATED" if passage["status"] == "READY" and i else passage["status"]
            )
    return {
        "version": VERSION,
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
