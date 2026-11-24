"""Bounded wording-only experiment. Mechanical guards are not semantic proof."""

import copy
import hashlib
import json
import re
import unicodedata
from collections import Counter

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.ai.source_refine import TEXT_MODULE_FIELDS, Refinement
from app.source_analysis.inventory_refinement import _hash
from app.source_analysis.preprocess import scrub
from app.source_analysis.text_safety import _NUMBER, SAFETY_LISTS_HASH, has_health_claim, has_money

VERSION = "source-voice-polish-v1"
CRITIC_VERSION = "source-voice-critic-v1"
MAX_REQUEST_CHARS = 64000
MAX_TEXTS = 100
MAX_CANDIDATES = 80
MAX_VOICE_CHARS = 8000
PROTECTED = (
    r"없|않|아니|못",
    r"간혹|때때로|종종|일부|보통|일반적|경우|참고",
    r"예상|추정|예정|실측|측정|표본|샘플|평균",
    r"약(?=\s*\d)|대략|내외|정도|달라|수\s*있|미확인|미정|확정되지",
    r"작년|지난해|올해|현재|당시|과거|이번|였|이었|했",
)
CAUSAL = ("때문", "덕분", "따라서")
REASONS = frozenset(
    {
        "INVALID_INPUT",
        "INPUT_LIMIT",
        "STALE_REQUEST",
        "OUTPUT_SCHEMA",
        "REQUEST_HASH_MISMATCH",
        "UNKNOWN_TEXT_ID",
        "DUPLICATE_TEXT_ID",
        "MISSING_TEXT_IDS",
        "NUMERIC_CHANGED",
        "QUALIFIER_CHANGED",
        "POLARITY_CHANGED",
        "NEW_CAUSAL_RELATION",
        "FINAL_SAFETY_REJECTED",
    }
)


class PolishError(ValueError):
    def __init__(self, reason="INVALID_INPUT"):
        self.reason = reason if reason in REASONS else "INVALID_INPUT"
        super().__init__("Invalid voice-polishing input or output (details redacted)")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PolishText(Strict):
    id: str
    value: str = Field(min_length=1, max_length=3000)


class PolishOutput(Strict):
    requestSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    texts: list[PolishText] = Field(max_length=MAX_TEXTS)


class CriticText(Strict):
    id: str
    factualPreservation: str = Field(pattern=r"^(PASS|FAIL|UNKNOWN)$")
    styleNotes: str = Field(max_length=3000)


class CriticOutput(Strict):
    requestSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    texts: list[CriticText] = Field(max_length=MAX_TEXTS)


def _fail(reason="INVALID_INPUT"):
    raise PolishError(reason) from None


def _nonempty(value):
    return type(value) is str and bool(value.strip())


def _normalize(value):
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", value))


def _numeric(value):
    value = re.sub(r"브릭\s*스", "브릭스", unicodedata.normalize("NFC", value))
    labels = list(
        re.finditer(
            r"[a-zA-Z](?:상품|표본|옵션)|옵션\s*[a-zA-Z0-9]+|[대중소]과|"
            r"선물용|가정용|실속형|실속용|선물세트|가정세트|중량|당도|개수|수량",
            value,
        )
    )
    return tuple(
        (
            re.sub(r"\s+", "", match[0]).casefold(),
            tuple(label[0] for label in labels if label.end() <= match.start()),
        )
        for match in _NUMBER.finditer(value)
    )


def _qualifiers(value):
    return Counter(
        (pattern, re.sub(r"\s+", "", match[0]))
        for pattern in PROTECTED
        for match in re.finditer(pattern, value)
    )


def _polarity(value):
    """Bound explicit property/polarity pairs; unknown properties retain prefix scope."""
    value = _normalize(value)
    properties = list(re.finditer(r"씨|껍질|과피|점|얼룩|흠집|향|맛|당도|색|보관|농약|약품", value))
    result = []
    for marker in re.finditer(r"없|있|않|아니|못", value):
        anchors = [p[0] for p in properties if p.end() <= marker.start()]
        if anchors:
            anchor = anchors[-1]
        else:
            anchor = re.split(r"[.!?。\n]", value[: marker.start()])[-1]
        result.append((anchor, "POSITIVE" if marker[0] == "있" else "NEGATIVE"))
    return tuple(result)


def _bound_refs(refs, revisions):
    if type(refs) is not list:
        _fail()
    for ref in refs:
        if type(ref) is not dict:
            _fail()
        if "sourceId" in ref:
            if ref["sourceId"] not in revisions:
                _fail()
            if "sourceRevision" in ref and ref["sourceRevision"] != revisions[ref["sourceId"]]:
                _fail("STALE_REQUEST")


def prepare(target, candidates, baseline_modules, voice_excerpts, source_revisions):
    """Freeze exact reviewed baseline plus bounded safe voice contexts; never reroute."""
    try:
        if (
            type(target) is not dict
            or set(target) != {"id", "name"}
            or not _nonempty(target["id"])
            or type(target["name"]) is not str
            or type(candidates) is not list
            or type(baseline_modules) is not list
            or type(voice_excerpts) is not list
            or type(source_revisions) is not dict
            or any(
                not _nonempty(k) or type(v) is not int or v < 1 for k, v in source_revisions.items()
            )
        ):
            _fail()
        candidate_ids = set()
        for candidate in candidates:
            if (
                type(candidate) is not dict
                or set(candidate)
                != {"id", "targetId", "fieldKey", "value", "historical", "evidence"}
                or not _nonempty(candidate["id"])
                or candidate["id"] in candidate_ids
                or candidate["targetId"] not in {target["id"], None}
                or not _nonempty(candidate["fieldKey"])
                or not _nonempty(candidate["value"])
                or type(candidate["historical"]) is not bool
                or not candidate["evidence"]
            ):
                _fail()
            _bound_refs(candidate["evidence"], source_revisions)
            for ref in candidate["evidence"]:
                if not {"sourceId", "page", "spanIds", "quote"}.issubset(ref) or not _nonempty(
                    ref["quote"]
                ):
                    _fail()
            candidate_ids.add(candidate["id"])
        rows, seen_modules, external_ids = [], set(), set()
        for module in baseline_modules:
            if (
                type(module) is not dict
                or set(module) != {"module", "texts"}
                or module["module"] not in TEXT_MODULE_FIELDS
                or module["module"] in seen_modules
                or type(module["texts"]) is not list
            ):
                _fail()
            seen_modules.add(module["module"])
            for index, text in enumerate(module["texts"]):
                if (
                    type(text) is not dict
                    or set(text) not in ({"value", "candidateIds"}, {"id", "value", "candidateIds"})
                    or not _nonempty(text["value"])
                    or type(text["candidateIds"]) is not list
                    or not text["candidateIds"]
                    or len(set(text["candidateIds"])) != len(text["candidateIds"])
                    or not set(text["candidateIds"]).issubset(candidate_ids)
                ):
                    _fail()
                if "id" in text:
                    if not _nonempty(text["id"]) or text["id"] in external_ids:
                        _fail()
                    external_ids.add(text["id"])
                rows.append(
                    {
                        "id": f"t{len(rows) + 1:03}",
                        "module": module["module"],
                        "textIndex": index,
                        "value": text["value"],
                        "candidateIds": copy.deepcopy(text["candidateIds"]),
                    }
                )
        excerpt_ids = set()
        for excerpt in voice_excerpts:
            if (
                type(excerpt) is not dict
                or not {"id", "text", "sourceRefs", "styleRole"}.issubset(excerpt)
                or set(excerpt)
                - {
                    "id",
                    "text",
                    "sourceRefs",
                    "styleRole",
                    "quoteStart",
                    "quoteEnd",
                    "styleOnly",
                    "cannotAddFacts",
                    "sourceTextSha256",
                }
                or not _nonempty(excerpt["id"])
                or excerpt["id"] in excerpt_ids
                or not _nonempty(excerpt["text"])
                or not _nonempty(excerpt["styleRole"])
                or scrub(excerpt["text"]) != excerpt["text"]
                or has_money(excerpt["text"])
                or has_health_claim(excerpt["text"])
            ):
                _fail()
            _bound_refs(excerpt["sourceRefs"], source_revisions)
            if any(
                key in excerpt and excerpt[key] is not True
                for key in ("styleOnly", "cannotAddFacts")
            ):
                _fail()
            if (
                "sourceTextSha256" in excerpt
                and excerpt["sourceTextSha256"]
                != hashlib.sha256(excerpt["text"].encode()).hexdigest()
            ):
                _fail()
            if "quoteStart" in excerpt or "quoteEnd" in excerpt:
                start, end = excerpt.get("quoteStart"), excerpt.get("quoteEnd")
                if (
                    type(start) is not int
                    or type(end) is not int
                    or start < 0
                    or end <= start
                    or not any(
                        type(ref.get("quote")) is str
                        and end <= len(ref["quote"])
                        and ref["quote"][start:end] == excerpt["text"]
                        for ref in excerpt["sourceRefs"]
                    )
                ):
                    _fail()
            excerpt_ids.add(excerpt["id"])
        body = {
            "version": VERSION,
            "target": copy.deepcopy(target),
            "candidates": copy.deepcopy(candidates),
            "baselineModules": copy.deepcopy(baseline_modules),
            "voiceExcerpts": copy.deepcopy(voice_excerpts),
            "sourceRevisions": copy.deepcopy(source_revisions),
            "texts": rows,
            "safetyListsHash": SAFETY_LISTS_HASH,
        }
        request = {**body, "requestSha256": _hash(body)}
        if (
            len(rows) > MAX_TEXTS
            or len(candidates) > MAX_CANDIDATES
            or sum(len(e["text"]) for e in voice_excerpts) > MAX_VOICE_CHARS
            or len(json.dumps(_payload(request), ensure_ascii=False)) > MAX_REQUEST_CHARS
        ):
            _fail("INPUT_LIMIT")
        # Validate the unchanged baseline's schema, without assuming its semantics.
        Refinement.model_validate(
            {
                "modules": [
                    {
                        "module": m["module"],
                        "texts": [
                            {key: t[key] for key in ("value", "candidateIds")} for t in m["texts"]
                        ],
                    }
                    for m in baseline_modules
                ],
                "excluded": [],
            }
        )
        return request
    except PolishError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail()


def _current(request, source_revisions):
    try:
        rebuilt = prepare(
            request["target"],
            request["candidates"],
            request["baselineModules"],
            request["voiceExcerpts"],
            source_revisions,
        )
        if rebuilt != request:
            _fail("STALE_REQUEST")
        return rebuilt
    except PolishError as exc:
        _fail("INPUT_LIMIT" if exc.reason == "INPUT_LIMIT" else "STALE_REQUEST")
    except (TypeError, KeyError, AttributeError):
        _fail("STALE_REQUEST")


def _payload(request):
    return {
        key: request[key]
        for key in (
            "version",
            "requestSha256",
            "target",
            "candidates",
            "voiceExcerpts",
            "sourceRevisions",
            "texts",
        )
    }


def provider_payload(request):
    _current(request, request.get("sourceRevisions"))
    return copy.deepcopy(_payload(request))


def _rows(output, model, request_hash, ids):
    try:
        if type(output) is not dict:
            _fail("OUTPUT_SCHEMA")
        parsed = model.model_validate(output)
    except ValidationError:
        _fail("OUTPUT_SCHEMA")
    if parsed.requestSha256 != request_hash:
        _fail("REQUEST_HASH_MISMATCH")
    seen, rows = set(), {}
    for text in parsed.texts:
        if text.id not in ids:
            _fail("UNKNOWN_TEXT_ID")
        if text.id in seen:
            _fail("DUPLICATE_TEXT_ID")
        seen.add(text.id)
        rows[text.id] = text
    if seen != set(ids):
        _fail("MISSING_TEXT_IDS")
    return rows


def validate(request, output, *, source_revisions):
    """Guard wording changes and run existing final safety. Rejections are not rescued."""
    _current(request, source_revisions)
    rows = _rows(
        output, PolishOutput, request["requestSha256"], {t["id"] for t in request["texts"]}
    )
    by_candidate = {c["id"]: c for c in request["candidates"]}
    checked, groups = [], {}
    for before in request["texts"]:
        value, reason = rows[before["id"]].value, None
        if _numeric(before["value"]) != _numeric(value):
            reason = "NUMERIC_CHANGED"
        elif _qualifiers(before["value"]) != _qualifiers(value):
            reason = "QUALIFIER_CHANGED"
        elif _polarity(before["value"]) != _polarity(value):
            reason = "POLARITY_CHANGED"
        else:
            evidence = [
                before["value"],
                *[
                    e["quote"]
                    for cid in before["candidateIds"]
                    for e in by_candidate[cid]["evidence"]
                ],
            ]
            for marker in CAUSAL:
                if marker in value and marker not in before["value"]:
                    clauses = [c for c in re.split(r"[.!?。\n]+", value) if marker in c]
                    if any(
                        not any(_normalize(clause) in _normalize(s) for s in evidence)
                        for clause in clauses
                    ):
                        reason = "NEW_CAUSAL_RELATION"
                        break
        checked.append(
            {
                "id": before["id"],
                "value": value,
                "status": "REJECTED" if reason else "ACCEPTED",
                "reason": reason,
            }
        )
        if not reason:
            groups.setdefault(before["module"], []).append(
                {"value": value, "candidateIds": before["candidateIds"]}
            )
    from app.source_analysis.refinement import validate as final_validate

    assembled = [
        {"module": m["module"], "texts": groups[m["module"]]}
        for m in request["baselineModules"]
        if m["module"] in groups
    ]
    modules, diagnostics = final_validate(
        Refinement.model_validate({"modules": assembled, "excluded": []}),
        request["candidates"],
        request["target"]["id"],
        target_count=1,
        target_name=request["target"]["name"],
    )
    remaining = Counter(
        (m["module"], t["value"], tuple(t["candidateIds"])) for m in modules for t in m["texts"]
    )
    for before, row in zip(request["texts"], checked, strict=True):
        if row["status"] == "ACCEPTED":
            signature = (before["module"], row["value"], tuple(before["candidateIds"]))
            if remaining[signature]:
                remaining[signature] -= 1
            else:
                row.update(status="REJECTED", reason="FINAL_SAFETY_REJECTED")
    result = {
        "version": VERSION,
        "requestSha256": request["requestSha256"],
        "modules": modules,
        "texts": checked,
        "diagnostics": diagnostics,
        "status": "INCOMPLETE"
        if any(r["status"] == "REJECTED" for r in checked)
        else "COMPLETE"
        if checked
        else "EMPTY",
        "requiresContentReview": True,
        "semanticPreservationEstablished": False,
        "statusScope": "POLISH_GUARDS_ONLY",
    }
    result["outputSha256"] = _hash({"modules": modules, "texts": checked})
    return result


def prepare_critic(request, result):
    _current(request, request.get("sourceRevisions"))
    try:
        replay = validate(
            request,
            {
                "requestSha256": request["requestSha256"],
                "texts": [{"id": row["id"], "value": row["value"]} for row in result["texts"]],
            },
            source_revisions=request["sourceRevisions"],
        )
        comparable = {
            key: value for key, value in result.items() if key not in {"usage", "requestId"}
        }
        if replay != comparable:
            _fail("STALE_REQUEST")
        body = {
            "version": CRITIC_VERSION,
            "polishRequestSha256": request["requestSha256"],
            "outputSha256": result["outputSha256"],
            "source": provider_payload(request),
            "after": copy.deepcopy(result["texts"]),
            "polishRequest": copy.deepcopy(request),
            "polishResult": copy.deepcopy(comparable),
        }
        critic_request = {**body, "requestSha256": _hash(body)}
        if len(json.dumps(_critic_wire(critic_request), ensure_ascii=False)) > MAX_REQUEST_CHARS:
            _fail("INPUT_LIMIT")
        return critic_request
    except PolishError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail("STALE_REQUEST")


def _critic_wire(request):
    return {
        key: value for key, value in request.items() if key not in {"polishRequest", "polishResult"}
    }


def critic_payload(request):
    try:
        if type(request) is not dict or set(request) != {
            "version",
            "polishRequestSha256",
            "outputSha256",
            "source",
            "after",
            "requestSha256",
            "polishRequest",
            "polishResult",
        }:
            _fail("STALE_REQUEST")
        rebuilt = prepare_critic(request["polishRequest"], request["polishResult"])
        if rebuilt != request:
            _fail("STALE_REQUEST")
        return copy.deepcopy(_critic_wire(request))
    except PolishError:
        raise
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail("STALE_REQUEST")


def validate_critic(request, output):
    critic_payload(request)
    ids = {row["id"] for row in request["after"]}
    rows = _rows(output, CriticOutput, request["requestSha256"], ids)
    ordered = [rows[row["id"]].model_dump() for row in request["after"]]
    states = [r["factualPreservation"] for r in ordered]
    return {
        "version": CRITIC_VERSION,
        "requestSha256": request["requestSha256"],
        "polishRequestSha256": request["polishRequestSha256"],
        "outputSha256": request["outputSha256"],
        "rows": ordered,
        "status": "FAIL"
        if "FAIL" in states
        else "UNKNOWN"
        if "UNKNOWN" in states or not states
        else "PASS",
        "requiresContentReview": True,
        "calibrated": False,
        "semanticAcceptance": False,
    }
