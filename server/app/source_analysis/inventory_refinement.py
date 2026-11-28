"""DEV-450 opt-in literal source-unit assembly, never semantic preservation proof."""

import copy
import hashlib
import json
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.source_analysis.source_inventory import build_inventory, validate_dispositions
from app.source_analysis.text_safety import SAFETY_LISTS_HASH

WRITER_VERSION = "source-refine-inventory-v1"
MAX_CANDIDATES = 80
MAX_REQUEST_CHARS = 32000


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class InventoryText(Strict):
    value: str = Field(min_length=1, max_length=3000)
    unitIds: list[str] = Field(min_length=1, max_length=100)


class InventoryModule(Strict):
    module: str
    texts: list[InventoryText] = Field(min_length=1, max_length=100)


class UnitDisposition(Strict):
    unitId: str
    status: Literal["KEEP", "EXCLUDE", "REVIEW"]
    module: str | None
    reason: str


class InventoryOutput(Strict):
    requestSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    modules: list[InventoryModule] = Field(max_length=18)
    dispositions: list[UnitDisposition] = Field(max_length=1000)


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(value):
    return hashlib.sha256(_canonical(value).encode()).hexdigest()


def _fail():
    raise ValueError("Invalid inventory writer input or output (details redacted)")


def _literal(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


def prepare_request(target, inventory, *, source_revisions):
    """Validate/freeze the entire accepted boundary; never prefix-truncate units."""
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
        if rebuilt != inventory or target["id"] != inventory["targetId"]:
            _fail()
        body = {
            "writerVersion": WRITER_VERSION,
            "target": copy.deepcopy(target),
            "inventory": rebuilt,
            "sourceRevisions": copy.deepcopy(source_revisions),
            "safetyListsHash": SAFETY_LISTS_HASH,
        }
        if len(rebuilt["candidates"]) > MAX_CANDIDATES or len(_canonical(body)) > MAX_REQUEST_CHARS:
            raise ValueError("INVENTORY_INPUT_LIMIT")
        return {**body, "requestSha256": _hash(body)}
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        if str(exc) == "INVENTORY_INPUT_LIMIT":
            raise ValueError("INVENTORY_INPUT_LIMIT") from None
        _fail()


def validate_response(request, output, *, source_revisions):
    """Strict request binding, full accounting, literal text and final legacy safety.

    A KEEP rejected by the existing safety validator is INCOMPLETE, never rescued
    with raw text. Disposition coverage measures accounting, not source semantics.
    """
    try:
        if type(request) is not dict or set(request) != {
            "writerVersion",
            "target",
            "inventory",
            "sourceRevisions",
            "safetyListsHash",
            "requestSha256",
        }:
            _fail()
        current = prepare_request(
            request["target"], request["inventory"], source_revisions=source_revisions
        )
        if current != request or type(output) is not dict:
            _fail()
        parsed = InventoryOutput.model_validate(output)
        if parsed.requestSha256 != request["requestSha256"]:
            _fail()
        plan = validate_dispositions(
            request["inventory"],
            [r.model_dump() for r in parsed.dispositions],
            source_revisions=source_revisions,
        )
        units = {u["id"]: u for u in request["inventory"]["units"]}
        dispositions = {r.unitId: r for r in parsed.dispositions}
        kept = {uid for uid, row in dispositions.items() if row.status == "KEEP"}
        seen, module_names = set(), set()
        assembled = []
        text_units = []
        for module in parsed.modules:
            if module.module in module_names:
                _fail()
            module_names.add(module.module)
            texts = []
            for text in module.texts:
                uids = text.unitIds
                if (
                    len(set(uids)) != len(uids)
                    or seen.intersection(uids)
                    or any(
                        uid not in kept or dispositions[uid].module != module.module for uid in uids
                    )
                ):
                    _fail()
                expected = "\n".join(units[uid]["value"] for uid in uids)
                if _literal(text.value) != _literal(expected):
                    _fail()
                seen.update(uids)
                candidate_ids = list(
                    dict.fromkeys(cid for uid in uids for cid in units[uid]["candidateIds"])
                )
                texts.append({"value": text.value, "candidateIds": candidate_ids})
                text_units.append((module.module, text.value, candidate_ids, uids))
            assembled.append({"module": module.module, "texts": texts})
        if seen != kept:
            _fail()
        # Import only after request validation; the default worker path is untouched.
        from app.ai.source_refine import Refinement
        from app.source_analysis.refinement import validate

        legacy_output = Refinement.model_validate({"modules": assembled, "excluded": []})
        modules, diagnostics = validate(
            legacy_output,
            request["inventory"]["candidates"],
            request["target"]["id"],
            target_count=1,
            target_name=request["target"]["name"],
        )
        accepted = {
            (m["module"], t["value"], tuple(t["candidateIds"])) for m in modules for t in m["texts"]
        }
        retained = {
            uid
            for module, value, cids, uids in text_units
            if (module, value, tuple(cids)) in accepted
            for uid in uids
        }
        missing = sorted(kept - retained)
        review = sorted(uid for uid, row in dispositions.items() if row.status == "REVIEW")
        excluded = sorted(uid for uid, row in dispositions.items() if row.status == "EXCLUDE")
        diagnostics = {
            **diagnostics,
            "missingKeptUnitIds": missing,
            "reviewUnitIds": review,
            "excludedUnitIds": excluded,
        }
        status = (
            "INCOMPLETE"
            if missing
            else "REVIEW_REQUIRED"
            if review or excluded
            else "COMPLETE"
            if kept
            else "EMPTY"
        )
        return {
            "writerVersion": WRITER_VERSION,
            "requestSha256": current["requestSha256"],
            "inventorySha256": plan["inventorySha256"],
            "modules": modules,
            "dispositions": plan["dispositions"],
            "coverageComplete": True,
            "allKeptUnitsRetained": not missing,
            "semanticPreservationEstablished": False,
            "requiresContentReview": True,
            "statusScope": "ASSEMBLY_ACCOUNTING_ONLY",
            "status": status,
            "diagnostics": diagnostics,
        }
    except (ValueError, TypeError, KeyError, AttributeError):
        _fail()


def mock_output(request):
    """Deterministic literal fixture; reviewable units never become KEEP."""
    modules, dispositions = {}, []
    for unit in request["inventory"]["units"]:
        keep = unit["status"] == "PRESERVED"
        module = unit["permittedModules"][0] if keep else None
        dispositions.append(
            {
                "unitId": unit["id"],
                "status": "KEEP" if keep else "REVIEW",
                "module": module,
                "reason": "" if keep else "Source unit requires review",
            }
        )
        if keep:
            modules.setdefault(module, []).append({"value": unit["value"], "unitIds": [unit["id"]]})
    return {
        "requestSha256": request["requestSha256"],
        "modules": [{"module": key, "texts": value} for key, value in modules.items()],
        "dispositions": dispositions,
    }
