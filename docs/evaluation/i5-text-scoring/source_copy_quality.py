"""Private offline copyediting signals and owner conditions; no edits apply.

A clean bounded check is not grammar, semantic correctness or release approval.
"""

# ruff: noqa: E402 -- standalone loader adds the server package path first.
import copy
import importlib.util
import re
from collections import Counter
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "_source_copy_quality_base", Path(__file__).with_name("source_copy.py")
)
base = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(base)
from app.source_analysis.preprocess import scrub
from app.source_analysis.text_safety import (
    has_exaggeration,
    has_health_claim,
    has_money,
    has_period_text,
    has_platform_text,
    has_policy_text,
)

VERSION = "source-copy-quality-v1"
_QUEUE_NAMES = {
    "COPY_EDIT": "editorialQueue",
    "OWNER_CONFIRMATION": "ownerQueue",
    "PLACEMENT": "placementQueue",
    "SAFETY": "safetyQueue",
}
_SPLIT = re.compile(r"(?P<head>[가-힣]*(?:습니|입니))[ \t]*\r?\n[ \t]*다(?=[.!?。]|$)")
_FRAGMENT = re.compile(r"(?:듯이|지만|지고|때문에|그리고|또한|하지만)[,，]?\s*$|[,，]\s*$")
_PARTICLE = re.compile(r"(?<=[가-힣])\s+(?:에서|을|를)(?=\s|[,.!?。]|$)")
_RECENT = re.compile(
    r"(?:^|\s)(?:최근|곧|금년|차주|금주|다음\s*(?:주|달|해))(?=\s|[,.!?。]|$)"
    r"|(?<![가-힣A-Za-z0-9])(?:내년|올해|작년)이맘(?:때|쯤)"
)
_SEASON = re.compile(
    r"제철|시즌|한정|품절|재고|예약\s*마감|수량\s*소진|추석|명절|"
    r"(?<![가-힣A-Za-z0-9])설(?:날|\s|선물|을|에|용|[),.!?]|$)|(?<!\d)\d{1,2}\s*(?:[~–-]\s*\d{1,2}\s*)?월"
)
_DISPATCH = re.compile(
    r"발송|배송|출고|택배|수령|주문.{0,12}마감|보내드|"
    r"(?:그날|당일|매일).{0,20}수확"
)
_TERMS = re.compile(r"결제|입금|환불|반품|교환|취소|추가\s*(?:금|비)")


class QualityError(ValueError):
    def __init__(self, reason="INVALID_INPUT"):
        self.reason = reason if reason in {"INVALID_INPUT", "STALE_REQUEST"} else "INVALID_INPUT"
        super().__init__("Invalid source quality input (details redacted)")


def _finding(code, *, exact=False, proposal=None):
    return {
        "code": code,
        "confidence": "EXACT" if exact else "HEURISTIC",
        "details": {},
        "proposal": proposal,
    }


def analyze(request, *, source_revisions):
    """Rebuild bound source quotes, flag exceptions and retain original wording."""
    try:
        original = base.compose(request, source_revisions=source_revisions)
    except base.SourceCopyError as exc:
        raise QualityError(exc.reason) from None
    passages = sorted(
        copy.deepcopy(original["passages"] + original["reviewQueue"]), key=lambda p: p["id"]
    )
    displayed = {p["id"] for p in original["passages"]}
    repeats = Counter(p["value"] for p in passages)
    sentence_counts = Counter(
        sentence.strip()
        for p in passages
        for sentence in re.split(r"(?<!\d\.)(?<=[.!?。])\s+", p["value"])
        if len(sentence.strip()) >= 12
    )
    result = {
        "version": VERSION,
        "requestSha256": original["requestSha256"],
        "baseOutputSha256": original["outputSha256"],
        "sourceRevisions": copy.deepcopy(source_revisions),
        "passages": passages,
        **{name: [] for name in _QUEUE_NAMES.values()},
    }
    for passage in passages:
        value = passage["value"]
        findings = {kind: [] for kind in _QUEUE_NAMES}
        editorial = findings["COPY_EDIT"]
        proposal = _SPLIT.sub(lambda m: m["head"] + "다", value)
        if proposal != value:
            assert re.sub(r"\s", "", proposal) == re.sub(r"\s", "", value)
            editorial.append(
                _finding(
                    "OCR_SPLIT",
                    proposal={
                        "value": proposal,
                        "beforeSha256": base._sha(value),
                        "afterSha256": base._sha(proposal),
                        "applied": False,
                        "kind": "WHITESPACE_ONLY",
                    },
                )
            )
        if _FRAGMENT.search(value):
            editorial.append(_finding("POSSIBLE_FRAGMENT"))
        if _PARTICLE.search(value) or re.search(r"\s+[,，]", value):
            editorial.append(_finding("POSSIBLE_SPACING"))
        sentences = [
            s.strip() for s in re.split(r"(?<!\d\.)(?<=[.!?。])\s+", value) if len(s.strip()) >= 12
        ]
        if repeats[value] > 1 or any(sentence_counts[sentence] > 1 for sentence in sentences):
            editorial.append(_finding("EXACT_REPETITION", exact=True))
        owner = findings["OWNER_CONFIRMATION"]
        codes = passage["reasonCodes"]
        if has_money(value) or re.search(r"가격|배송비|수수료|추가요금", value):
            owner.append(_finding("PRICE_OR_FEE"))
        if base._RELATIVE.search(value) or _RECENT.search(value):
            owner.append(_finding("RELATIVE_TIME"))
        if "HISTORICAL_CONTEXT" in codes or base._HISTORICAL.search(value):
            owner.append(_finding("DATED_OR_HISTORICAL"))
        if _SEASON.search(value):
            owner.append(_finding("SEASON_OR_AVAILABILITY"))
        if _DISPATCH.search(value):
            owner.append(_finding("DISPATCH_OR_DELIVERY"))
        if _TERMS.search(value):
            owner.append(_finding("PAYMENT_OR_RETURN_TERMS"))
        for code in codes:
            if code in {"AMBIGUOUS_MODULE_ROUTING", "BASELINE_UNREPRESENTED", "FIELD_LIMIT"}:
                findings["PLACEMENT"].append(_finding(code))
            elif code not in {"HISTORICAL_CONTEXT", "CONTEXT_DEPENDENT"}:
                findings["SAFETY"].append(_finding(code))
        # v1 may have held for date/routing before its final safety check.
        # Independently scan ALL full quotes: owner confirmation cannot clear safety.
        checks = [
            (scrub(value) != value, "PRIVATE_VALUE"),
            (has_money(value), "MONEY_AMOUNT"),
            (has_health_claim(value), "HEALTH_CLAIM"),
            (has_exaggeration(value), "EXAGGERATION"),
            (has_policy_text(value), "POLICY_TEXT"),
            (has_platform_text(value), "PLATFORM_TEXT"),
            (has_period_text(value), "PERIOD_TEXT"),
        ]
        for matched, code in checks:
            if matched and code not in {f["code"] for f in findings["SAFETY"]}:
                findings["SAFETY"].append(_finding(code))
        if passage["id"] not in displayed and not any(findings.values()):
            findings["PLACEMENT"].append(_finding("BASE_REVIEW_REQUIRED"))
        binding = {
            "requestSha256": original["requestSha256"],
            "baseOutputSha256": original["outputSha256"],
            "passageId": passage["id"],
            "quoteSha256": base._sha(value),
            "provenanceSha256": base._hash(passage["provenance"]),
        }
        passage.update(
            baseDisposition="DISPLAYED" if passage["id"] in displayed else "REVIEW",
            queueKinds=[kind for kind, rows in findings.items() if rows],
            grammarAssessment="NOT_RUN",
            binding=binding,
        )
        held = (
            passage["id"] not in displayed
            or findings["OWNER_CONFIRMATION"]
            or findings["PLACEMENT"]
            or findings["SAFETY"]
        )
        passage["draftStatus"] = "REVIEW_REQUIRED" if held else "ELIGIBLE_EXACT"
        for kind, rows in findings.items():
            if rows:
                result[_QUEUE_NAMES[kind]].append(
                    {
                        "passageId": passage["id"],
                        "binding": copy.deepcopy(binding),
                        "reasonCodes": [f["code"] for f in rows],
                        "findings": rows,
                        "reviewStatus": "PENDING",
                    }
                )
    eligible = {p["id"] for p in passages if p["draftStatus"] == "ELIGIBLE_EXACT"}
    result["draftModules"] = []
    for module in original["modules"]:
        texts = [
            {"value": p["value"], "candidateIds": p["candidateIds"]}
            for p in passages
            if p["id"] in eligible and p["module"] == module["module"]
        ]
        if texts:
            result["draftModules"].append({"module": module["module"], "texts": texts})
    result.update(
        summary={
            "inputPassages": len(passages),
            "eligibleExactPassages": len(eligible),
            "heldPassages": len(passages) - len(eligible),
            **{name: len(result[name]) for name in _QUEUE_NAMES.values()},
        },
        sourceExact=True,
        grammarAssessment="NOT_RUN",
        humanReviewStatus="PENDING",
        semanticPreservationEstablished=False,
        requiresContentReview=True,
        repairsApplied=0,
        adopted=False,
        statusScope="BOUNDED_COPY_CHECKS_AND_OWNER_TRIAGE_ONLY",
    )
    result["outputSha256"] = base._hash(result)
    return result
