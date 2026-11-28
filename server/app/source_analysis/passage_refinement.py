"""DEV-450 conservative verbatim passage routing; accounting is not semantic truth."""

import copy
import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.ai.source_refine import TEXT_MODULE_FIELDS
from app.source_analysis.inventory_refinement import _hash
from app.source_analysis.source_inventory import build_inventory
from app.source_analysis.text_safety import SAFETY_LISTS_HASH

PLANNER_VERSION = "source-passage-plan-v1"
MAX_CANDIDATES = 80
MAX_REQUEST_CHARS = 32000
MAX_PASSAGES = 240
# Protect whole units when sentence splitting could detach scope or uncertainty.
_CONTEXT = re.compile(
    r"표본|샘플|평균|예상|추정|예정|약\s*\d|대략|내외|정도|달라|수\s*있|없|않|아니|"
    r"간혹|때때로|종종|일부|보통|일반적|경우|참고|이번|"
    r"\d{4}\s*년|작년|지난해|올해|현재|당시|옵션|선택|[AB]상품|"
    r"(?:결과|정보|소개|안내|설명)(?:입니다|예요|합니다|(?=[.!?。\n]|$))|이\s*상품|또한|이것"
)
_BOUNDARY = re.compile(r"(?:[!?。]+|(?<!\d)\.)(?:\s+|$)")


class Assignment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    passageId: str
    status: Literal["KEEP", "EXCLUDE", "REVIEW"]
    module: str | None
    reason: str


class PassageOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    requestSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    assignments: list[Assignment] = Field(max_length=MAX_PASSAGES)


VALIDATION_REASONS = frozenset(
    {
        "INVALID_INPUT",
        "INPUT_LIMIT",
        "STALE_REQUEST",
        "OUTPUT_SCHEMA",
        "REQUEST_HASH_MISMATCH",
        "UNKNOWN_PASSAGE_ID",
        "DUPLICATE_PASSAGE_ID",
        "MISSING_PASSAGE_IDS",
        "BLOCKED_KEEP",
        "INVALID_MODULE",
        "MISSING_REASON",
        "LEGACY_OUTPUT_SCHEMA",
        "RESPONSE_SERIALIZATION",
        "PROVIDER_OUTPUT_SCHEMA",
    }
)


class PassageValidationError(ValueError):
    """Fixed safe classification; never includes input values or validation details."""

    def __init__(self, reason):
        self.reason = reason if reason in VALIDATION_REASONS else "INVALID_INPUT"
        message = (
            "INVENTORY_INPUT_LIMIT"
            if self.reason == "INPUT_LIMIT"
            else "Invalid passage writer input or output (details redacted)"
        )
        super().__init__(message)


def _fail(reason="INVALID_INPUT"):
    raise PassageValidationError(reason) from None


def _partitions(value):
    protected = bool(_CONTEXT.search(value))
    if protected:
        return [(0, len(value))], True
    cuts = [0, *[match.end() for match in _BOUNDARY.finditer(value)]]
    if cuts[-1] != len(value):
        cuts.append(len(value))
    parts = [(left, right) for left, right in zip(cuts, cuts[1:], strict=False) if left < right]
    if any(not value[left:right].strip() for left, right in parts):
        return [(0, len(value))], True
    return parts, False


def prepare_request(target, inventory, *, source_revisions):
    """Rebuild a complete deterministic partition. Never truncate accepted units."""
    try:
        if (
            type(target) is not dict
            or set(target) != {"id", "name"}
            or type(target["id"]) is not str
            or not target["id"].strip()
            or type(target["name"]) is not str
        ):
            _fail()
        rebuilt = build_inventory(
            inventory["candidates"],
            accepted_candidate_ids=inventory["acceptedCandidateIds"],
            target_id=inventory["targetId"],
            source_revisions=source_revisions,
        )
        if rebuilt != inventory or target["id"] != rebuilt["targetId"]:
            _fail()
        base = {
            "inventory": rebuilt,
            "target": copy.deepcopy(target),
            "sourceRevisions": copy.deepcopy(source_revisions),
            "safetyListsHash": SAFETY_LISTS_HASH,
        }
        taxonomy = list(TEXT_MODULE_FIELDS)
        passages = []
        for unit in base["inventory"]["units"]:
            parts, protected = _partitions(unit["value"])
            modules = (
                ["farmStory"]
                if unit["historical"] or unit["fieldKey"] == "historicalSales"
                else taxonomy
            )
            if unit["targetId"] is None:
                modules = [m for m in ("farmStory", "farmUpdates") if m in modules]
            for start, end in parts:
                text = unit["value"][start:end]
                identity = {"unitId": unit["id"], "start": start, "end": end, "text": text}
                passages.append(
                    {
                        "id": "passage-" + _hash(identity),
                        **identity,
                        "permittedModules": list(modules),
                        "requiresReview": unit["status"] != "PRESERVED",
                        "contextProtected": protected,
                    }
                )
        body = {
            "plannerVersion": PLANNER_VERSION,
            "target": base["target"],
            "inventory": base["inventory"],
            "sourceRevisions": base["sourceRevisions"],
            "safetyListsHash": base["safetyListsHash"],
            "moduleTaxonomy": taxonomy,
            "passages": passages,
        }
        request = {**body, "requestSha256": _hash(body)}
        if (
            len(base["inventory"]["candidates"]) > MAX_CANDIDATES
            or len(passages) > MAX_PASSAGES
            or len(json.dumps(_wire_payload(request), ensure_ascii=False)) > MAX_REQUEST_CHARS
        ):
            _fail("INPUT_LIMIT")
        return request
    except PassageValidationError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail()


def _wire_payload(request):
    counts = {}
    for passage in request["passages"]:
        counts[passage["unitId"]] = counts.get(passage["unitId"], 0) + 1
    units = []
    for unit in request["inventory"]["units"]:
        constraints = next(p for p in request["passages"] if p["unitId"] == unit["id"])
        contexts = {}
        for ref in unit["sourceRefs"]:
            context = {key: ref[key] for key in ("sourceId", "sourceRevision", "page", "quote")}
            contexts[_hash(context)] = context
        projected = {
            "id": unit["id"],
            "targetId": unit["targetId"],
            "fieldHint": unit["fieldKey"],
            "historical": unit["historical"],
            "reviewReasons": unit["reviewReasons"],
            "requiresReview": constraints["requiresReview"],
            "permittedModules": (
                "moduleTaxonomy"
                if constraints["permittedModules"] == request["moduleTaxonomy"]
                else constraints["permittedModules"]
            ),
            "contextProtected": constraints["contextProtected"],
            "quoteContexts": [contexts[key] for key in sorted(contexts)],
        }
        if counts.get(unit["id"], 0) > 1:
            projected["parentValue"] = unit["value"]
        units.append(projected)
    return {
        "plannerVersion": request["plannerVersion"],
        "requestSha256": request["requestSha256"],
        "target": request["target"],
        "moduleTaxonomy": request["moduleTaxonomy"],
        "safetyListsHash": request["safetyListsHash"],
        "units": units,
        "passages": [
            {
                key: passage[key]
                for key in (
                    "id",
                    "unitId",
                    "text",
                )
            }
            for passage in request["passages"]
        ],
    }


def provider_payload(request):
    """Compact context-complete wire projection; full request hash remains bound."""
    try:
        try:
            rebuilt = prepare_request(
                request["target"], request["inventory"], source_revisions=request["sourceRevisions"]
            )
        except PassageValidationError as exc:
            _fail("INPUT_LIMIT" if exc.reason == "INPUT_LIMIT" else "STALE_REQUEST")
        if rebuilt != request:
            _fail("STALE_REQUEST")
        return copy.deepcopy(_wire_payload(request))
    except PassageValidationError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail("STALE_REQUEST")


def validate_response(request, output, *, source_revisions):
    """Route only exact passages; retain every rejected KEEP as an incomplete result."""
    try:
        if type(request) is not dict or set(request) != {
            "plannerVersion",
            "target",
            "inventory",
            "sourceRevisions",
            "safetyListsHash",
            "moduleTaxonomy",
            "passages",
            "requestSha256",
        }:
            _fail("STALE_REQUEST")
        if type(output) is not dict:
            _fail("OUTPUT_SCHEMA")
        try:
            rebuilt = prepare_request(
                request["target"], request["inventory"], source_revisions=source_revisions
            )
        except PassageValidationError as exc:
            _fail("INPUT_LIMIT" if exc.reason == "INPUT_LIMIT" else "STALE_REQUEST")
        if rebuilt != request:
            _fail("STALE_REQUEST")
        try:
            parsed = PassageOutput.model_validate(output)
        except ValidationError:
            _fail("OUTPUT_SCHEMA")
        if parsed.requestSha256 != request["requestSha256"]:
            _fail("REQUEST_HASH_MISMATCH")
        by_id = {p["id"]: p for p in request["passages"]}
        units = {u["id"]: u for u in request["inventory"]["units"]}
        seen, groups, kept_texts = set(), {}, []
        order = {pid: index for index, pid in enumerate(by_id)}
        assignments = sorted(
            parsed.assignments, key=lambda row: order.get(row.passageId, len(order))
        )
        for row in assignments:
            pid = row.passageId
            if pid not in by_id:
                _fail("UNKNOWN_PASSAGE_ID")
            if pid in seen:
                _fail("DUPLICATE_PASSAGE_ID")
            seen.add(pid)
            passage = by_id[pid]
            if row.status == "KEEP":
                if passage["requiresReview"]:
                    _fail("BLOCKED_KEEP")
                if row.module not in passage["permittedModules"]:
                    _fail("INVALID_MODULE")
                cids = units[passage["unitId"]]["candidateIds"]
                text = {"value": passage["text"], "candidateIds": cids}
                groups.setdefault(row.module, []).append(text)
                kept_texts.append((pid, row.module, text))
            elif row.module is not None:
                _fail("INVALID_MODULE")
            elif not row.reason.strip():
                _fail("MISSING_REASON")
        if seen != set(by_id):
            _fail("MISSING_PASSAGE_IDS")
        from app.ai.source_refine import Refinement
        from app.source_analysis.refinement import validate

        raw_modules = [
            {"module": module, "texts": groups[module]}
            for module in TEXT_MODULE_FIELDS
            if module in groups
        ]
        try:
            legacy = Refinement.model_validate({"modules": raw_modules, "excluded": []})
        except ValidationError:
            _fail("LEGACY_OUTPUT_SCHEMA")
        modules, diagnostics = validate(
            legacy,
            request["inventory"]["candidates"],
            request["target"]["id"],
            target_count=1,
            target_name=request["target"]["name"],
        )
        accepted = {
            (m["module"], t["value"], tuple(t["candidateIds"])) for m in modules for t in m["texts"]
        }
        missing = sorted(
            pid
            for pid, module, text in kept_texts
            if (module, text["value"], tuple(text["candidateIds"])) not in accepted
        )
        review = sorted(r.passageId for r in parsed.assignments if r.status == "REVIEW")
        excluded = sorted(r.passageId for r in parsed.assignments if r.status == "EXCLUDE")
        diagnostics = {
            **diagnostics,
            "missingKeptPassageIds": missing,
            "reviewPassageIds": review,
            "excludedPassageIds": excluded,
        }
        status = (
            "INCOMPLETE"
            if missing
            else "REVIEW_REQUIRED"
            if review or excluded
            else "COMPLETE"
            if kept_texts
            else "EMPTY"
        )
        return {
            "plannerVersion": PLANNER_VERSION,
            "requestSha256": request["requestSha256"],
            "inventorySha256": _hash(request["inventory"]),
            "modules": modules,
            "assignments": [row.model_dump() for row in assignments],
            "coverageComplete": True,
            "allKeptPassagesRetained": not missing,
            "semanticPreservationEstablished": False,
            "requiresContentReview": True,
            "statusScope": "ASSEMBLY_ACCOUNTING_ONLY",
            "status": status,
            "diagnostics": diagnostics,
        }
    except PassageValidationError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail()


def mock_output(request):
    """A field-hint fixture, not a model or routing-quality baseline."""
    units = {u["id"]: u for u in request["inventory"]["units"]}
    assignments = []
    for passage in request["passages"]:
        hinted = units[passage["unitId"]]["permittedModules"][0]
        keep = not passage["requiresReview"] and hinted in passage["permittedModules"]
        assignments.append(
            {
                "passageId": passage["id"],
                "status": "KEEP" if keep else "REVIEW",
                "module": hinted if keep else None,
                "reason": "" if keep else "Source passage requires review",
            }
        )
    return {"requestSha256": request["requestSha256"], "assignments": assignments}
