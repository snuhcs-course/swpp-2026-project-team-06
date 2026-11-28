"""Conservative admission of source-preserving page presentation; no IO or model calls."""

import copy
import hashlib
import json
import re
import unicodedata
from collections import Counter

from pydantic import ValidationError

from app.ai.source_assembly import AssemblyOutput
from app.source_analysis.preprocess import scrub
from app.source_analysis.source_reflow import reflow_prose
from app.source_analysis.text_safety import numbers, ranges

VERSION = "source-presentation-v2"


def _hash(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def _safe_inputs(value):
    if isinstance(value, str):
        return scrub(value)
    if isinstance(value, dict):
        return {key: _safe_inputs(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_safe_inputs(item) for item in value]
    return value


def prepare(base, target):
    by_id = {p["id"]: p for p in base["passages"]}
    texts = []
    for module in base["modules"]:
        for text in module["texts"]:
            ids = list(text.get("passageIds", []))
            passages = [by_id[pid] for pid in ids]
            flags = sorted(
                {
                    code
                    for p in passages
                    for codes in p.get("reasonCodes", {}).values()
                    for code in codes
                }
            )
            texts.append(
                {
                    "id": f"t{len(texts) + 1:03d}",
                    "module": module["module"],
                    "value": text["value"],
                    "passageIds": ids,
                    "ownerFlags": flags,
                }
            )
    return {
        "id": target["id"],
        "target": {
            "id": target["id"],
            "name": target.get("name", ""),
            **(
                {"producerInputs": _safe_inputs(target["producerInputs"])}
                if target.get("producerInputs")
                else {}
            ),
        },
        "texts": texts,
    }


def content_hash(base, target):
    row = prepare(base, target)
    return _hash(
        {
            "version": VERSION,
            "target": row["target"],
            "texts": [
                {k: t[k] for k in ("id", "module", "value", "passageIds")} for t in row["texts"]
            ],
            "bindings": [(p["id"], p["bindingHash"]) for p in base["passages"]],
        }
    )


def _numeric_text(value):
    # A bounded OCR spelling equivalence; never remove arbitrary word boundaries.
    return re.sub(r"브릭\s+스", "브릭스", unicodedata.normalize("NFC", value))


def _surface(value):
    value = _numeric_text(reflow_prose(value))
    value = re.sub(r'[.,!?;:：。"“”‘’]', " ", value)
    return " ".join(value.split())


def _verifiable(output, source):
    left, right = _numeric_text(output), _numeric_text(source)
    return (
        scrub(output) == output
        and _surface(output) == _surface(source)
        and numbers(left) == numbers(right)
        and ranges(left) == ranges(right)
    )


def _finish(base, modules, *, status, reason=None, retained=0):
    result = copy.deepcopy(base)
    result["modules"] = modules
    result["presentation"] = {"status": status, "baselineWordingRetained": retained}
    if reason:
        result["presentation"]["reason"] = reason
    result["planHash"] = _hash(
        {
            "version": VERSION,
            "base": base["planHash"],
            "modules": modules,
            "status": status,
            "reason": reason,
        }
    )
    return result


def fallback(base, reason):
    return _finish(base, copy.deepcopy(base["modules"]), status="FALLBACK", reason=reason)


def admit(base, target, output):
    """Admit organization with exact source accounting; uncertain wording stays original.

    This does not certify semantic accuracy. Evidence/passages/owner decisions remain
    authoritative and unchanged. Only input blocks can supply rendered words.
    """
    row = prepare(base, target)
    by_id = {t["id"]: t for t in row["texts"]}
    if not by_id:
        return fallback(base, "NO_TEXT")
    try:
        parsed = AssemblyOutput.model_validate(output)
    except (ValidationError, ValueError, TypeError):
        return fallback(base, "INVALID_OUTPUT")
    if parsed.excluded:
        return fallback(base, "EXCLUSIONS")
    references = [
        tid for module in parsed.modules for text in module.texts for tid in text.text_ids
    ]
    if set(references) != set(by_id) or any(n != 1 for n in Counter(references).values()):
        return fallback(base, "TEXT_ACCOUNTING")
    if not parsed.modules or any(not t.text_ids for m in parsed.modules for t in m.texts):
        return fallback(base, "TEXT_ACCOUNTING")
    if len({m.module for m in parsed.modules}) != len(parsed.modules):
        return fallback(base, "DUPLICATE_MODULE")
    passage_by_id = {p["id"]: p for p in base["passages"]}
    ordinal = {t["id"]: i for i, t in enumerate(row["texts"])}
    modules = []
    retained = 0
    for module in parsed.modules:
        entries = []
        for text in module.texts:
            selected = [by_id[tid] for tid in text.text_ids]
            historical = any("DATED_OR_HISTORICAL" in t["ownerFlags"] for t in selected)
            destination = module.module
            if historical:
                if len({t["module"] for t in selected}) != 1:
                    return fallback(base, "HISTORICAL_SCOPE")
                destination = selected[0]["module"]
                selected.sort(key=lambda t: ordinal[t["id"]])
            source = "\n\n".join(t["value"] for t in selected)
            value = text.value
            if not _verifiable(value, source):
                value = source
                retained += 1
            pids = list(dict.fromkeys(pid for t in selected for pid in t["passageIds"]))
            cids = list(
                dict.fromkeys(cid for pid in pids for cid in passage_by_id[pid]["candidateIds"])
            )
            flags = sorted({code for t in selected for code in t["ownerFlags"]})
            entries.append(
                (
                    destination,
                    min(ordinal[t["id"]] for t in selected),
                    historical,
                    {
                        "value": value,
                        "passageIds": pids,
                        "candidateIds": cids,
                        "inheritedOwnerFlags": flags,
                        "assembly": {
                            "type": "SOURCE_PRESENTATION",
                            "inputTextIds": [t["id"] for t in selected],
                        },
                    },
                )
            )
        for destination, order, historical, rendered in entries:
            existing = next((m for m in modules if m["module"] == destination), None)
            if existing is None:
                existing = {"module": destination, "texts": [], "_order": [], "_historical": False}
                modules.append(existing)
            existing["texts"].append(rendered)
            existing["_order"].append(order)
            existing["_historical"] |= historical
    for module in modules:
        if module.pop("_historical"):
            module["texts"] = [
                t
                for _, t in sorted(
                    zip(module["_order"], module["texts"], strict=True), key=lambda p: p[0]
                )
            ]
        module.pop("_order")
        field_candidates = {cid for text in module["texts"] for cid in text["candidateIds"]}
        if len(field_candidates) > 100:
            return fallback(base, "FIELD_CITATION_LIMIT")
        if len("\n".join(t["value"] for t in module["texts"])) > 3000:
            return fallback(base, "FIELD_LIMIT")
    if len({m["module"] for m in modules}) != len(modules):
        return fallback(base, "DUPLICATE_MODULE")
    return _finish(base, modules, status="APPLIED", retained=retained)
