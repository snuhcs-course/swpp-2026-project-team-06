"""Private offline exact-quote control; copying source is not semantic approval.

Only evidence present in a current frozen voice request is available here. No source
fetch, provider call, publication, persistence, gold change or default change occurs.
The returned review queue intentionally retains unsafe originals: keep it private.
"""

# ruff: noqa: E402 -- standalone offline loader adds the server package path first.

import copy
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from app.ai.source_refine import Refinement
from app.source_analysis import voice_polish as core
from app.source_analysis.inventory_refinement import _hash
from app.source_analysis.passage_refinement import _CONTEXT
from app.source_analysis.refinement import validate as final_validate
from app.source_analysis.text_safety import has_period_text, has_platform_text

VERSION = "source-preserving-copy-v1"
ERROR_REASONS = frozenset({"INVALID_INPUT", "STALE_REQUEST"})
# A full quote preserves ordinary hedges/options/negation. Only unresolved
# relative time and explicit dated/history scope need a separate suitability review.
_HISTORICAL = re.compile(r"작년|지난해|당시|과거|\d{4}\s*년|\d+\s*년\s*차")
_TEMPORAL_END = (
    r"(?=$|[\s,.!?。:;·()]|"
    r"(?:에도|에는|부터|까지|은|는|의|에|도|쯤)(?=$|[\s,.!?。:;·()]))"
)
_RELATIVE = re.compile(
    r"(?<![가-힣A-Za-z0-9])(?:올해|내년|조만간|내일|어제|이번|현재|지금)"
    + _TEMPORAL_END
    + r"|\d+\s*년\s*전"
)


class SourceCopyError(ValueError):
    def __init__(self, reason="INVALID_INPUT"):
        self.reason = reason if reason in ERROR_REASONS else "INVALID_INPUT"
        super().__init__("Invalid source-copy input (details redacted)")


def _fail(reason="INVALID_INPUT"):
    raise SourceCopyError(reason) from None


def _sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _provenance(ref, revisions):
    """Validate location types that the older voice request does not constrain."""
    if (
        type(ref["sourceId"]) is not str
        or ref["sourceId"] not in revisions
        or type(ref["page"]) is not int
        or ref["page"] < 1
        or type(ref["spanIds"]) is not list
        or not ref["spanIds"]
        or any(type(span) is not str or not span.strip() for span in ref["spanIds"])
        or len(set(ref["spanIds"])) != len(ref["spanIds"])
    ):
        _fail()
    return {
        "sourceId": ref["sourceId"],
        "sourceRevision": revisions[ref["sourceId"]],
        "page": ref["page"],
        "spanIds": copy.deepcopy(ref["spanIds"]),
        "quoteSha256": _sha(ref["quote"]),
    }


def compose(request, *, source_revisions):
    """Copy full cited evidence quotes under unchanged baseline module routing.

    An occurrence is one candidate/evidence-index pair, regardless of the number
    of baseline texts citing it. Every such occurrence is displayed, deduplicated
    within a module, or queued. All baseline citation edges remain in baselineLinks.
    Exactness describes source bytes only; every item still needs human review.
    """
    try:
        current = core._current(request, source_revisions)
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail("STALE_REQUEST")
    try:
        return _compose(current, source_revisions)
    except SourceCopyError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError, IndexError):
        _fail()


def _compose(request, revisions):
    candidates = {candidate["id"]: candidate for candidate in request["candidates"]}
    links = {cid: [] for cid in candidates}
    for text in request["texts"]:
        link = {
            "textId": text["id"],
            "module": text["module"],
            "textIndex": text["textIndex"],
            "baselineSha256": _sha(text["value"]),
        }
        for cid in text["candidateIds"]:
            links[cid].append(copy.deepcopy(link))

    occurrences, identities = [], {}
    for candidate in request["candidates"]:
        for index, ref in enumerate(candidate["evidence"]):
            provenance = _provenance(ref, revisions)
            # Span order does not change the cited source location; preserve its
            # original order in provenance but canonicalize only the identity.
            identity = _hash({**provenance, "spanIds": sorted(provenance["spanIds"])})
            modules = list(
                dict.fromkeys(link["module"] for link in links[candidate["id"]])
            )
            row = {
                "id": f"e{len(occurrences) + 1:04}",
                "candidateId": candidate["id"],
                "evidenceIndex": index,
                "modules": modules,
                "disposition": None,
                "passageId": None,
                "reasonCodes": [],
            }
            occurrences.append(row)
            identities.setdefault(identity, []).append(
                (row, candidate, ref, provenance)
            )

    passages, review, pending = [], [], []
    # A source identity routed to multiple modules is ambiguous, including when
    # different candidates or baseline texts introduced that routing.
    for entries in identities.values():
        all_modules = {module for row, *_ in entries for module in row["modules"]}
        ambiguous = len(all_modules) > 1
        buckets = {}
        for entry in entries:
            row, candidate, ref, provenance = entry
            module = row["modules"][0] if len(row["modules"]) == 1 else None
            reasons = []
            if not row["modules"]:
                reasons.append("BASELINE_UNREPRESENTED")
            if ambiguous:
                reasons.append("AMBIGUOUS_MODULE_ROUTING")
            if (
                candidate["historical"]
                or candidate["fieldKey"] == "historicalSales"
                or _HISTORICAL.search(ref["quote"])
            ):
                reasons.append("HISTORICAL_CONTEXT")
            if _RELATIVE.search(ref["quote"]):
                reasons.append("CONTEXT_DEPENDENT")
            if has_period_text(ref["quote"]):
                reasons.append("PERIOD_TEXT")
            if has_platform_text(ref["quote"]):
                reasons.append("PLATFORM_TEXT")
            if len(ref["quote"]) > 3000:
                reasons.append("FIELD_LIMIT")
            # Only identical identities with the same unambiguous module and
            # eligibility can collapse. All review occurrences stay visible.
            key = (module, tuple(reasons))
            buckets.setdefault(key, []).append(entry)
        for (module, reason_tuple), group in buckets.items():
            row, _, ref, _ = group[0]
            cids = list(dict.fromkeys(candidate["id"] for _, candidate, _, _ in group))
            baseline_links = []
            provenance = []
            for _, candidate, _, source_ref in group:
                for link in links[candidate["id"]]:
                    if link not in baseline_links:
                        baseline_links.append(copy.deepcopy(link))
                if source_ref not in provenance:
                    provenance.append(copy.deepcopy(source_ref))
            passage = {
                "id": f"p{len(pending) + 1:04}",
                "module": module,
                "value": ref["quote"],
                "candidateIds": cids,
                "provenance": provenance,
                "baselineLinks": baseline_links,
                "occurrenceIds": [entry[0]["id"] for entry in group],
                "sourceExact": True,
                "semanticAssessment": "PENDING",
                "reasonCodes": list(reason_tuple),
                "reviewWarnings": ["CONTEXT_PRESERVED_WHOLE"]
                if _CONTEXT.search(ref["quote"])
                else [],
            }
            pending.append((passage, group))

    # Validate all initially eligible full quotes together, retaining cumulative
    # field limits and candidate-level safety rules from the existing validator.
    grouped = {}
    for passage, _ in pending:
        if (
            not passage["reasonCodes"]
            and len(grouped.get(passage["module"], [])) >= 100
        ):
            passage["reasonCodes"].append("FIELD_LIMIT")
        if not passage["reasonCodes"]:
            grouped.setdefault(passage["module"], []).append(
                {"value": passage["value"], "candidateIds": passage["candidateIds"]}
            )
    output = Refinement.model_validate(
        {
            "modules": [
                {"module": key, "texts": value} for key, value in grouped.items()
            ],
            "excluded": [],
        }
    )
    accepted, diagnostics = final_validate(
        output,
        request["candidates"],
        request["target"]["id"],
        target_count=1,
        target_name=request["target"]["name"],
    )
    remaining = Counter(
        (module["module"], text["value"], tuple(text["candidateIds"]))
        for module in accepted
        for text in module["texts"]
    )
    rejected = {}
    for item in diagnostics["rejected"]:
        text = item["text"]
        rejected.setdefault(
            (item["module"], text["value"], tuple(text["candidateIds"])), []
        ).append(item["code"])
    for passage, group in pending:
        signature = (
            passage["module"],
            passage["value"],
            tuple(passage["candidateIds"]),
        )
        if not passage["reasonCodes"]:
            if remaining[signature]:
                remaining[signature] -= 1
            else:
                passage["reasonCodes"] = rejected.get(
                    signature, ["FINAL_SAFETY_REJECTED"]
                )
        is_review = bool(passage["reasonCodes"])
        (review if is_review else passages).append(passage)
        for index, (row, *_rest) in enumerate(group):
            row.update(
                disposition="REVIEW"
                if is_review
                else "DISPLAYED"
                if index == 0
                else "DEDUPLICATED",
                passageId=passage["id"],
                reasonCodes=copy.deepcopy(passage["reasonCodes"]),
            )
    # Assemble original strings, never normalized validator strings.
    modules = []
    for baseline in request["baselineModules"]:
        texts = [
            {"value": passage["value"], "candidateIds": passage["candidateIds"]}
            for passage in passages
            if passage["module"] == baseline["module"]
        ]
        if texts:
            modules.append({"module": baseline["module"], "texts": texts})
    counts = Counter(row["disposition"] for row in occurrences)
    result = {
        "version": VERSION,
        "requestSha256": request["requestSha256"],
        "sourceRevisions": copy.deepcopy(revisions),
        "modules": modules,
        "passages": passages,
        "reviewQueue": review,
        "occurrences": occurrences,
        "summary": {
            "inputEvidenceOccurrences": len(occurrences),
            "displayedOccurrences": counts["DISPLAYED"],
            "deduplicatedOccurrences": counts["DEDUPLICATED"],
            "reviewOccurrences": counts["REVIEW"],
            "displayedPassages": len(passages),
            "reviewPassages": len(review),
        },
        "outsideControl": {
            "fullAcceptedSourceInputs": "NOT_AVAILABLE_IN_FROZEN_REQUEST",
            "baselineUnrepresentedFacts": "NOT_ASSESSED",
            "uncitedCandidateIds": [cid for cid in candidates if not links[cid]],
            "candidatesWithoutEvidence": [],
        },
        "status": "INCOMPLETE" if review else "COMPLETE" if passages else "EMPTY",
        "statusScope": "EXACT_QUOTE_ACCOUNTING_ONLY",
        "requiresContentReview": True,
        "semanticPreservationEstablished": False,
        "humanReviewStatus": "PENDING",
        "experimental": True,
        "adopted": False,
    }
    result["outputSha256"] = _hash(result)
    return result
