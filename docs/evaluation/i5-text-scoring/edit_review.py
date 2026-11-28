"""Offline per-edit observations and explicit human-approved baseline composition."""

import copy
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from app.ai.source_polish import _privacy
from app.ai.source_refine import RefineError, Refinement
from app.source_analysis import voice_polish as core
from app.source_analysis.preprocess import scrub
from app.source_analysis.refinement import validate as final_validate
from app.source_analysis.text_safety import has_health_claim, has_money

VERSION = "source-edit-review-v1"
ERROR_REASONS = frozenset(
    {
        "INVALID_INPUT",
        "STALE_RESULT",
        "INVALID_REVIEW",
        "STALE_REVIEW",
        "DUPLICATE_REVIEW",
        "INVALID_CRITIC",
    }
)
_REVIEW_REQUIRED = {
    "requestSha256",
    "textId",
    "beforeSha256",
    "proposedSha256",
    "reviewerKind",
    "reviewerId",
    "decision",
}
_REVIEW_OPTIONAL = {"semanticAssessment", "readabilityNotes"}
_PROPERTIES = {
    "씨",
    "껍질",
    "과피",
    "점",
    "얼룩",
    "흠집",
    "향",
    "맛",
    "당도",
    "색",
    "보관",
    "농약",
    "약품",
}


class EditReviewError(ValueError):
    def __init__(self, reason="INVALID_INPUT"):
        self.reason = reason if reason in ERROR_REASONS else "INVALID_INPUT"
        super().__init__("Invalid per-edit review input (details redacted)")


def _fail(reason="INVALID_INPUT"):
    raise EditReviewError(reason) from None


def _sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _replay(request, result):
    try:
        core._current(request, request["sourceRevisions"])
        if type(result) is not dict:
            _fail("STALE_RESULT")
        replay = core.validate(
            request,
            {
                "requestSha256": request["requestSha256"],
                "texts": [
                    {"id": row["id"], "value": row["value"]} for row in result["texts"]
                ],
            },
            source_revisions=request["sourceRevisions"],
        )
        if replay != {
            key: value
            for key, value in result.items()
            if key not in {"usage", "requestId"}
        }:
            _fail("STALE_RESULT")
        return replay
    except EditReviewError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail("STALE_RESULT")


def _binding(request, before, after):
    return {
        "requestSha256": request["requestSha256"],
        "textId": before["id"],
        "beforeSha256": _sha(before["value"]),
        "proposedSha256": _sha(after["value"]),
    }


def binding(request, text_id, result):
    replay = _replay(request, result)
    for before, after in zip(request["texts"], replay["texts"], strict=True):
        if before["id"] == text_id:
            return _binding(request, before, after)
    _fail("INVALID_REVIEW")


def _reviews(rows, bindings):
    if type(rows) is not list:
        _fail("INVALID_REVIEW")
    accepted = {}
    for row in rows:
        if (
            type(row) is not dict
            or not _REVIEW_REQUIRED.issubset(row)
            or set(row) - _REVIEW_REQUIRED - _REVIEW_OPTIONAL
        ):
            _fail("INVALID_REVIEW")
        tid = row["textId"]
        if type(tid) is not str or tid not in bindings:
            _fail("INVALID_REVIEW")
        if tid in accepted:
            _fail("DUPLICATE_REVIEW")
        if any(row[key] != value for key, value in bindings[tid].items()):
            _fail("STALE_REVIEW")
        if (
            row["reviewerKind"] != "HUMAN"
            or type(row["reviewerId"]) is not str
            or not row["reviewerId"].strip()
            or row["decision"] not in {"APPROVE", "REJECT", "UNKNOWN"}
            or row.get("semanticAssessment", "UNKNOWN")
            not in {"PASS", "FAIL", "UNKNOWN"}
            or type(row.get("readabilityNotes", "")) is not str
        ):
            _fail("INVALID_REVIEW")
        accepted[tid] = row
    return accepted


def _final(modules, request):
    parsed = Refinement.model_validate({"modules": modules, "excluded": []})
    return final_validate(
        parsed,
        request["candidates"],
        request["target"]["id"],
        target_count=1,
        target_name=request["target"]["name"],
    )


def _contents(modules):
    return Counter(
        (m["module"], t["value"], tuple(t["candidateIds"]))
        for m in modules
        for t in m["texts"]
    )


def _explicit_polarity(before, after):
    left, right = {}, {}
    for destination, text in ((left, before), (right, after)):
        for anchor, polarity in core._polarity(text):
            if anchor in _PROPERTIES:
                # Preserve repeated-property order and multiplicity. A set would
                # hide swapped positive/negative claims about different subjects.
                destination.setdefault(anchor, []).append(polarity)
    flags = set()
    for anchor in left.keys() | right.keys():
        if anchor not in right:
            flags.add("EXPLICIT_POLARITY_REMOVED")
        elif anchor not in left:
            flags.add("EXPLICIT_POLARITY_ADDED")
        elif left[anchor] != right[anchor]:
            flags.add(
                "EXPLICIT_POLARITY_REVERSAL"
                if len(left[anchor]) == len(right[anchor]) == 1
                else "EXPLICIT_POLARITY_CHANGED"
            )
    return flags


def _flags(before, after, request):
    baseline, proposed = before["value"], after["value"]
    observed = {after["reason"]} if after["reason"] else set()
    hard, soft = set(), set()
    if scrub(proposed) != proposed:
        hard.add("PRIVATE_VALUE")
    if core._numeric(baseline) != core._numeric(proposed):
        hard.add("NUMERIC_CHANGED")
    if core._qualifiers(baseline) != core._qualifiers(proposed):
        soft.add("QUALIFIER_CHANGED")
    if core._polarity(baseline) != core._polarity(proposed):
        soft.add("POLARITY_CHANGED")
    hard.update(_explicit_polarity(baseline, proposed))
    by_id = {c["id"]: c for c in request["candidates"]}
    evidence = [
        baseline,
        *[e["quote"] for cid in before["candidateIds"] for e in by_id[cid]["evidence"]],
    ]
    for marker in core.CAUSAL:
        if marker in proposed and marker not in baseline:
            clauses = [c for c in re.split(r"[.!?。\n]+", proposed) if marker in c]
            if any(
                not any(core._normalize(clause) in core._normalize(s) for s in evidence)
                for clause in clauses
            ):
                hard.add("NEW_CAUSAL_RELATION")
    raw = [
        {
            "module": before["module"],
            "texts": [{"value": proposed, "candidateIds": before["candidateIds"]}],
        }
    ]
    validated, _ = _final(raw, request)
    if _contents(validated) != _contents(raw):
        hard.add("FINAL_SAFETY_REJECTED")
    hard.update(
        observed & {"NUMERIC_CHANGED", "NEW_CAUSAL_RELATION", "FINAL_SAFETY_REJECTED"}
    )
    soft.update(observed & {"QUALIFIER_CHANGED", "POLARITY_CHANGED"})
    return sorted(observed | hard | soft), sorted(hard), sorted(soft)


def critic_plan(request, result):
    """Prepare every safe saved proposal, even incomplete pages; never execute."""
    replay = _replay(request, result)
    try:
        if any(scrub(row["value"]) != row["value"] for row in replay["texts"]):
            return {
                "status": "BLOCKED_PRIVATE",
                "providerReady": False,
                "request": None,
                "reason": "PRIVATE_SOURCE",
            }
        if any(
            has_money(row["value"]) or has_health_claim(row["value"])
            for row in replay["texts"]
        ):
            return {
                "status": "BLOCKED_INPUT",
                "providerReady": False,
                "request": None,
                "reason": "UNSAFE_PROPOSAL",
            }
        prepared = core.prepare_critic(request, replay)
        _privacy(core.critic_payload(prepared))
        return {
            "status": "PENDING",
            "providerReady": True,
            "request": prepared,
            "reason": None,
        }
    except RefineError:
        return {
            "status": "BLOCKED_PRIVATE",
            "providerReady": False,
            "request": None,
            "reason": "PRIVATE_SOURCE",
        }
    except (ValueError, TypeError, KeyError, AttributeError):
        return {
            "status": "BLOCKED_INPUT",
            "providerReady": False,
            "request": None,
            "reason": "CRITIC_INPUT_REJECTED",
        }


def _critic(request, result, critic):
    if critic is None:
        return {}
    try:
        prepared = core.prepare_critic(request, result)
        if type(critic) is not dict:
            _fail("INVALID_CRITIC")
        validated = core.validate_critic(
            prepared,
            {"requestSha256": critic["requestSha256"], "texts": critic["rows"]},
        )
        if validated != {
            key: value
            for key, value in critic.items()
            if key not in {"usage", "requestId"}
        }:
            _fail("INVALID_CRITIC")
        return {row["id"]: row["factualPreservation"] for row in validated["rows"]}
    except EditReviewError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail("INVALID_CRITIC")


def _critic_jobs(request, replay, existing):
    jobs = {}
    candidates = {candidate["id"]: candidate for candidate in request["candidates"]}
    for before, after in zip(request["texts"], replay["texts"], strict=True):
        job = {
            "parentTextId": before["id"],
            "parentBinding": _binding(request, before, after),
            "parentOutputSha256": replay["outputSha256"],
            "localTextId": "t001",
            "status": "NOT_NEEDED",
            "providerReady": False,
            "request": None,
            "reason": None,
        }
        if before["value"] != after["value"]:
            if before["id"] in existing:
                job["status"] = "ALREADY_EVALUATED"
            else:
                try:
                    baseline = next(
                        module
                        for module in request["baselineModules"]
                        if module["module"] == before["module"]
                    )
                    original = copy.deepcopy(baseline["texts"][before["textIndex"]])
                    local_request = core.prepare(
                        request["target"],
                        [
                            copy.deepcopy(candidates[cid])
                            for cid in before["candidateIds"]
                        ],
                        [{"module": before["module"], "texts": [original]}],
                        request["voiceExcerpts"],
                        request["sourceRevisions"],
                    )
                    local_result = core.validate(
                        local_request,
                        {
                            "requestSha256": local_request["requestSha256"],
                            "texts": [{"id": "t001", "value": after["value"]}],
                        },
                        source_revisions=request["sourceRevisions"],
                    )
                    job.update(critic_plan(local_request, local_result))
                except (ValueError, TypeError, KeyError, AttributeError):
                    job.update(status="BLOCKED_INPUT", reason="CRITIC_INPUT_REJECTED")
        job["jobSha256"] = core._hash(
            {
                "parentBinding": job["parentBinding"],
                "parentOutputSha256": job["parentOutputSha256"],
                "localTextId": job["localTextId"],
                "status": job["status"],
                "criticRequestSha256": job["request"]["requestSha256"]
                if job["request"]
                else None,
            }
        )
        jobs[before["id"]] = job
    return jobs


def critic_plans(request, result, *, critic=None):
    """Prepare isolated changed-edit jobs; no-op/previously judged edits never rerun."""
    replay = _replay(request, result)
    return _critic_jobs(request, replay, _critic(request, replay, critic))


def evaluate(request, result, *, human_reviews=None, critic=None):
    try:
        replay = _replay(request, result)
        bindings = {
            before["id"]: _binding(request, before, after)
            for before, after in zip(request["texts"], replay["texts"], strict=True)
        }
        reviews = _reviews([] if human_reviews is None else human_reviews, bindings)
        critics = _critic(request, replay, critic)
        edits = []
        for before, after in zip(request["texts"], replay["texts"], strict=True):
            flags, hard, soft = _flags(before, after, request)
            review = reviews.get(before["id"], {})
            edits.append(
                {
                    **bindings[before["id"]],
                    "module": before["module"],
                    "textIndex": before["textIndex"],
                    "before": before["value"],
                    "proposed": after["value"],
                    "changed": before["value"] != after["value"],
                    "mechanicalEligibility": "HARD_BLOCKED"
                    if hard
                    else "SOFT_FLAG"
                    if soft
                    else "ELIGIBLE",
                    "guardFlags": flags,
                    "hardBlocks": hard,
                    "softFlags": soft,
                    "humanDecision": review.get("decision", "PENDING"),
                    "semanticAssessment": review.get("semanticAssessment", "UNKNOWN"),
                    "readabilityNotes": review.get("readabilityNotes", ""),
                    "criticAssessment": critics.get(before["id"], "MISSING"),
                    "criticCalibrated": False,
                }
            )
        changed = [row for row in edits if row["changed"]]
        return {
            "version": VERSION,
            "requestSha256": request["requestSha256"],
            "outputSha256": replay["outputSha256"],
            "edits": edits,
            "metrics": {
                "texts": len(edits),
                "noOps": len(edits) - len(changed),
                "changedEdits": len(changed),
                "usefulEditDenominator": len(changed),
                "hardBlockedChanges": sum(
                    r["mechanicalEligibility"] == "HARD_BLOCKED" for r in changed
                ),
                "softFlaggedChanges": sum(
                    r["mechanicalEligibility"] == "SOFT_FLAG" for r in changed
                ),
                "eligibleChanges": sum(
                    r["mechanicalEligibility"] == "ELIGIBLE" for r in changed
                ),
                "humanApprovedChanges": sum(
                    r["humanDecision"] == "APPROVE" for r in changed
                ),
                "humanRejectedChanges": sum(
                    r["humanDecision"] == "REJECT" for r in changed
                ),
                "pendingChanges": sum(
                    r["humanDecision"] in {"PENDING", "UNKNOWN"} for r in changed
                ),
            },
            "criticPlans": _critic_jobs(request, replay, critics),
            "criticPlan": critic_plan(request, replay)
            if critic is None
            else {
                "status": "ALREADY_EVALUATED",
                "providerReady": False,
                "request": None,
                "reason": None,
            },
            "requiresContentReview": True,
            "semanticAcceptance": False,
        }
    except EditReviewError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail()


def compose(request, result, *, human_reviews=None, critic=None):
    evaluated = evaluate(request, result, human_reviews=human_reviews, critic=critic)
    modules = copy.deepcopy(request["baselineModules"])
    origins, attempted = [], 0
    by_module = {module["module"]: module for module in modules}
    for edit in evaluated["edits"]:
        apply = (
            edit["changed"]
            and edit["humanDecision"] == "APPROVE"
            and edit["mechanicalEligibility"] != "HARD_BLOCKED"
            and edit["semanticAssessment"] == "PASS"
        )
        if apply:
            by_module[edit["module"]]["texts"][edit["textIndex"]]["value"] = edit[
                "proposed"
            ]
            attempted += 1
        reason = (
            "HARD_BLOCKED"
            if edit["humanDecision"] == "APPROVE" and edit["hardBlocks"]
            else "SEMANTIC_REJECTION"
            if edit["semanticAssessment"] == "FAIL"
            else "SEMANTIC_REVIEW_PENDING"
            if edit["humanDecision"] == "APPROVE"
            and edit["semanticAssessment"] != "PASS"
            else None
        )
        origins.append(
            {
                "textId": edit["textId"],
                "origin": "HUMAN_APPROVED_EDIT" if apply else "BASELINE_UNCHANGED",
                "decision": edit["humanDecision"],
                "applied": bool(apply),
                "reason": reason,
            }
        )
    plain = [
        {
            "module": m["module"],
            "texts": [
                {key: t[key] for key in ("value", "candidateIds")} for t in m["texts"]
            ],
        }
        for m in modules
    ]
    validated, diagnostics = _final(plain, request)
    safe = _contents(validated) == _contents(plain)
    if not safe:
        for origin in origins:
            if origin["applied"]:
                origin.update(applied=False, reason="FULL_PAGE_SAFETY_FAILED")
    return {
        "version": VERSION,
        "requestSha256": request["requestSha256"],
        "modules": modules,
        "origins": origins,
        "metrics": {
            "appliedEdits": attempted if safe else 0,
            "attemptedApprovedEdits": attempted,
            "baselineUnchanged": len(origins) - attempted,
            "texts": len(origins),
        },
        "status": "HARD_COMPOSITION_FAILURE"
        if not safe
        else "COMPOSED"
        if attempted
        else "BASELINE_UNCHANGED",
        "finalSafetyPassed": safe,
        "diagnostics": diagnostics,
        "requiresContentReview": True,
        "semanticAcceptance": False,
    }
