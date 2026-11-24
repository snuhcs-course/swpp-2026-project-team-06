"""DEV-449 pure accepted-source-unit accounting, not atomic facts or semantic proof.

No writer, provider, persistence or product adoption occurs here. Dispositions only
account for source units; they neither rewrite a value nor certify downstream meaning.
"""

import copy
import hashlib
import json
import re
from collections import Counter

from app.source_analysis.preprocess import scrub
from app.source_analysis.schemas import MODULE_FIELDS
from app.source_analysis.text_safety import (
    has_exaggeration,
    has_health_claim,
    has_money,
    has_period_text,
    has_platform_text,
    has_policy_text,
)

VERSION = "source-inventory-v1"
_PHOTOS = {"sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos"}
_FIELDS = {field: module for module, fields in MODULE_FIELDS.items() for field in fields}
_FIELDS["historicalSales"] = "farmStory"
_TEXT_MODULES = set(MODULE_FIELDS) - _PHOTOS
_CANDIDATE = {"id", "targetId", "fieldKey", "value", "evidence", "historical"}
_EVIDENCE = {"sourceId", "sourceRevision", "page", "spanIds", "quote"}
_WEIGHT = re.compile(r"(?<![\d.])\d+(?:\.\d+)?\s*(?:kg|㎏)(?![a-z])", re.I)


def _fail():
    raise ValueError("Invalid source inventory or disposition (details redacted)")


def _hash(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _text(value):
    return type(value) is str and bool(value.strip())


def _strings(value):
    return type(value) is list and all(_text(v) for v in value) and len(set(value)) == len(value)


def _revisions(value):
    if type(value) is not dict or any(
        not _text(k) or type(v) is not int or v < 1 for k, v in value.items()
    ):
        _fail()


def _candidate(candidate, revisions):
    if type(candidate) is not dict or set(candidate) != _CANDIDATE:
        _fail()
    if (
        not _text(candidate["id"])
        or candidate["targetId"] is not None and not _text(candidate["targetId"])
        or not _text(candidate["fieldKey"])
        or candidate["fieldKey"] not in _FIELDS
        or not _text(candidate["value"])
        or len(candidate["value"]) > 3000
        or type(candidate["historical"]) is not bool
        or type(candidate["evidence"]) is not list
        or not 1 <= len(candidate["evidence"]) <= 20
    ):
        _fail()
    for e in candidate["evidence"]:
        if type(e) is not dict or set(e) != _EVIDENCE:
            _fail()
        if (
            not _text(e["sourceId"])
            or type(e["sourceRevision"]) is not int
            or revisions.get(e["sourceId"]) != e["sourceRevision"]
            or type(e["page"]) is not int
            or e["page"] < 1
            or not _strings(e["spanIds"])
            or not 1 <= len(e["spanIds"]) <= 100
            or not _text(e["quote"])
            or len(e["quote"]) > 3000
        ):
            _fail()


def _context(candidate):
    # Same wording on a different source/page/revision is not assumed to have the
    # same product, option or time context. Repeated OCR spans may differ.
    return sorted(
        {(e["sourceId"], e["sourceRevision"], e["page"], e["quote"])
         for e in candidate["evidence"]}
    )


def _review_reasons(candidate, target_id):
    reasons = []
    if candidate["targetId"] != target_id:
        reasons.append("UNKNOWN_TARGET" if candidate["targetId"] is None else "OTHER_TARGET")
    value = candidate["value"]
    quotes = [e["quote"] for e in candidate["evidence"]]
    if any(scrub(v) != v for v in [value, *quotes]):
        reasons.append("PRIVATE_SOURCE")
    for detector, reason in (
        (has_money, "MONEY"),
        (has_health_claim, "HEALTH"),
        (has_policy_text, "POLICY"),
        (has_platform_text, "PLATFORM_REVIEW"),
        (has_period_text, "PERIOD_REVIEW"),
        (has_exaggeration, "EXAGGERATION_REVIEW"),
    ):
        if any(detector(v) for v in [value, *quotes]):
            reasons.append(reason)
    # Multiple weights need an explicit source audit, never index-based option pairing.
    if len({re.sub(r"\s", "", m[0]).lower() for m in _WEIGHT.finditer(value)}) > 1:
        reasons.append("MULTIPLE_OPTION_SCOPES")
    if candidate["fieldKey"] in _PHOTOS:
        reasons.append("NOT_TEXT_UNIT")
    if candidate["historical"] and _FIELDS[candidate["fieldKey"]] != "farmStory":
        reasons.append("HISTORICAL_ROUTING_REVIEW")
    return reasons


def build_inventory(candidates, *, accepted_candidate_ids, target_id, source_revisions):
    """Freeze exact accepted candidates; never recover a rejected/raw candidate.

    ``accepted_candidate_ids`` is the caller's explicit extraction-validation boundary,
    not a safety/semantic approval. Unsafe, common/other-target and ambiguous units
    remain preserved but may only receive EXCLUDE or REVIEW, never KEEP.
    Unit IDs are stable under input permutation and duplicate OCR/candidate additions
    within the same exact quoted source context. No substring/whitespace deduplication.
    """
    _revisions(source_revisions)
    if not _text(target_id) or type(candidates) is not list or len(candidates) > 1000:
        _fail()
    if not _strings(accepted_candidate_ids):
        _fail()
    by_id = {}
    for candidate in candidates:
        # Unaccepted values and evidence are deliberately never inspected or retained.
        if type(candidate) is not dict or not _text(candidate.get("id")):
            _fail()
        if candidate["id"] in by_id:
            _fail()
        by_id[candidate["id"]] = candidate
    if not set(accepted_candidate_ids).issubset(by_id):
        _fail()
    selected = [copy.deepcopy(by_id[cid]) for cid in sorted(accepted_candidate_ids)]
    groups, anchors = {}, {}
    for candidate in selected:
        _candidate(candidate, source_revisions)
        signature = {
            k: candidate[k] for k in ("targetId", "fieldKey", "value", "historical")
        }
        signature["context"] = _context(candidate)
        uid = "unit-" + _hash(signature)
        group = groups.setdefault(
            uid,
            {
                "id": uid,
                **{k: copy.deepcopy(candidate[k]) for k in
                   ("targetId", "fieldKey", "value", "historical")},
                "candidateIds": [],
                "sourceRefs": [],
                "permittedModules": [_FIELDS[candidate["fieldKey"]]],
                "reviewReasons": [],
            },
        )
        group["candidateIds"].append(candidate["id"])
        for evidence in candidate["evidence"]:
            ref = {"candidateId": candidate["id"], **copy.deepcopy(evidence)}
            if ref not in group["sourceRefs"]:
                group["sourceRefs"].append(ref)
        group["reviewReasons"] = sorted(
            set(group["reviewReasons"]) | set(_review_reasons(candidate, target_id))
        )
        anchor = _hash({
            "targetId": candidate["targetId"], "fieldKey": candidate["fieldKey"],
            "historical": candidate["historical"],
            "spans": sorted((e["sourceId"], e["sourceRevision"], e["page"],
                             tuple(sorted(e["spanIds"]))) for e in candidate["evidence"]),
        })
        anchors.setdefault(anchor, []).append(uid)
    for uids in anchors.values():
        if len({groups[uid]["value"] for uid in uids}) > 1:
            for uid in uids:
                groups[uid]["reviewReasons"] = sorted(
                    set(groups[uid]["reviewReasons"]) | {"CONFLICTING_SOURCE_SCOPE"}
                )
    units = []
    for uid in sorted(groups):
        unit = groups[uid]
        unit["status"] = "NEEDS_REVIEW" if unit["reviewReasons"] else "PRESERVED"
        units.append(unit)
    used_sources = {e["sourceId"] for c in selected for e in c["evidence"]}
    return {
        "version": VERSION,
        "targetId": target_id,
        "sourceRevisions": {sid: source_revisions[sid] for sid in sorted(used_sources)},
        "acceptedCandidateIds": sorted(accepted_candidate_ids),
        "candidates": selected,
        "units": units,
        "accounting": {
            "acceptedCandidates": len(selected), "sourceUnits": len(units),
            "exactDuplicateCandidates": len(selected) - len(units),
            "needsReviewUnits": sum(u["status"] == "NEEDS_REVIEW" for u in units),
        },
        "limitations": "Source units are not atomic gold facts. IDs/coverage are not semantic "
        "support or downstream preservation proof. No product adoption.",
    }


def validate_dispositions(inventory, dispositions, *, source_revisions):
    """Require one explicit disposition per immutable current unit; no text rewriting.

    KEEP uses the unit's hinted module. A different permitted section/module requires
    a separate reviewed inventory version, not an arbitrary writer routing decision.
    EXCLUDE/REVIEW require a reason and no module. Nothing here approves publication.
    """
    try:
        rebuilt = build_inventory(
            inventory["candidates"], accepted_candidate_ids=inventory["acceptedCandidateIds"],
            target_id=inventory["targetId"], source_revisions=source_revisions,
        )
        if rebuilt != inventory or type(dispositions) is not list:
            _fail()
        by_id = {u["id"]: u for u in rebuilt["units"]}
        seen, rows = set(), []
        for row in dispositions:
            if type(row) is not dict or set(row) != {"unitId", "status", "module", "reason"}:
                _fail()
            uid = row["unitId"]
            if uid not in by_id or uid in seen or type(row["reason"]) is not str:
                _fail()
            seen.add(uid)
            if row["status"] == "KEEP":
                unit = by_id[uid]
                if (
                    unit["status"] != "PRESERVED"
                    or row["module"] not in unit["permittedModules"]
                    or row["module"] not in _TEXT_MODULES
                ):
                    _fail()
            elif row["status"] in {"EXCLUDE", "REVIEW"}:
                if row["module"] is not None or not _text(row["reason"]):
                    _fail()
            else:
                _fail()
            rows.append(copy.deepcopy(row))
        if seen != set(by_id):
            _fail()
        return {
            "version": VERSION, "inventorySha256": _hash(inventory),
            "dispositions": sorted(rows, key=lambda r: r["unitId"]),
            "accounting": dict(Counter(row["status"] for row in rows)),
            "coverageComplete": True, "semanticPreservationEstablished": False,
        }
    except (KeyError, TypeError, AttributeError):
        _fail()
