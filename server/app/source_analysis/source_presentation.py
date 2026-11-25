"""Persisted opt-in presentation jobs; deterministic source plans remain the fallback."""

import copy
import hashlib
import json
import time

from sqlalchemy import select

from app.ai.source_analysis import ExtractionError, ExtractionResponse, extract
from app.ai.source_assembly import ASSEMBLY_VERSION, PROMPT, AssemblyOutput, audit
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Item, ReviewedField, Run, SourceCopyDecision
from app.source_analysis.preprocess import scrub

VERSION = "source-presentation-v2"
MODEL = "openai/gpt-6.2-astra"
OUTPUT_TOKENS = 8000
MAX_INPUT_TEXTS = 200
MAX_INPUT_CHARS = 64_000


def enabled(batch):
    return bool(
        batch.source_copy_enabled and getattr(get_settings(), "source_presentation_enabled", False)
    )


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def current(db, batch, target_id):
    from app.source_analysis.source_copy_service import baseline_plan

    target = next((target for target in batch.targets if target["id"] == target_id), None)
    if target is None:
        raise ExtractionError("SOURCE_CHANGED")
    return baseline_plan(db, batch, target_id), target


def snapshot(db, batch):
    """All owner/editor/media and source state, not just the anchor's revision."""
    decisions = [
        {
            "targetId": row.target_id,
            "bindingHash": row.binding_hash,
            "action": row.action,
            "value": row.value,
            "note": row.note,
            "module": row.module,
            "sourceBinding": row.source_binding,
        }
        for row in db.scalars(
            select(SourceCopyDecision).where(SourceCopyDecision.batch_id == batch.id)
        )
    ]
    fields = [
        {
            "id": row.id,
            "targetId": row.target_id,
            "fieldKey": row.field_key,
            "value": row.value,
            "state": row.state,
            "provenance": row.provenance,
            "candidateIds": row.candidate_ids,
            "photoAssetIds": row.photo_asset_ids,
            "illustrationId": row.illustration_id,
        }
        for row in db.scalars(select(ReviewedField).where(ReviewedField.batch_id == batch.id))
    ]
    sources = [
        {
            "id": row.id,
            "revision": row.revision,
            "sanitizationVersion": row.sanitization_version,
            "privacyApproved": row.privacy_approved,
            "deleted": row.deleted,
            "targetIds": row.target_ids,
            "common": row.common,
            "checksum": row.checksum,
        }
        for row in db.scalars(select(Asset).where(Asset.batch_id == batch.id))
    ]
    return {
        "decisions": sorted(decisions, key=lambda value: (value["targetId"], value["bindingHash"])),
        "fields": sorted(fields, key=lambda value: value["id"]),
        "sources": sorted(sources, key=lambda value: value["id"]),
    }


def enqueue(db, batch, run, items):
    """Owning batch is locked by caller; at most one job per target and run."""
    if not enabled(batch) or any(
        i.phase in {"PREPARE", "EXTRACT"} and i.status != "SUCCEEDED" for i in items
    ):
        return False
    if not any(i.phase in {"PREPARE", "EXTRACT"} for i in items):
        return False
    from app.source_analysis.presentation_plan import content_hash, prepare

    anchors = list(
        db.scalars(
            select(Asset)
            .where(Asset.batch_id == batch.id, Asset.deleted.is_(False))
            .order_by(Asset.created_at, Asset.id)
        )
    )
    if not anchors:
        return False
    queued = False
    for named in batch.targets:
        if any(i.phase == "ASSEMBLE" and i.target_ids == [named["id"]] for i in items):
            continue
        base, target = current(db, batch, named["id"])
        row = prepare(base, target)
        if not row["texts"]:
            continue
        used_passages = {pid for text in row["texts"] for pid in text.get("passageIds", [])}
        used_sources = {
            ref["sourceId"]
            for passage in base["passages"]
            if passage["id"] in used_passages
            for ref in passage.get("evidence", [])
        }
        anchor = next((source for source in anchors if source.id in used_sources), anchors[0])
        state = snapshot(db, batch)
        db.add(
            Item(
                run_id=run.id,
                asset_id=anchor.id,
                revision=anchor.revision,
                sanitization_version=anchor.sanitization_version,
                target_ids=[target["id"]],
                phase="ASSEMBLE",
                refinement={
                    "version": VERSION,
                    "assemblyVersion": ASSEMBLY_VERSION,
                    "provider": "mock" if run.mode == "mock" else "openrouter",
                    "model": MODEL,
                    "contentHash": content_hash(base, target),
                    "input": row,
                    "snapshot": state,
                    "snapshotHash": digest(state),
                    "accepted": False,
                },
            )
        )
        queued = True
    db.flush()
    return queued


def enqueue_completed(db, batch):
    """Explicit enable only; reuse the latest completed run, never retry its job."""
    if not enabled(batch):
        return False
    run = db.scalar(
        select(Run)
        .where(Run.batch_id == batch.id, Run.status.in_(["SUCCEEDED", "PARTIAL"]))
        .order_by(Run.created_at.desc(), Run.id.desc())
        .limit(1)
    )
    if run is None or db.scalar(
        select(Run.id).where(
            Run.batch_id == batch.id,
            Run.status.in_(["QUEUED", "PREPARING", "ANALYZING", "PRIVACY_REVIEW"]),
        )
    ):
        return False
    items = list(db.scalars(select(Item).where(Item.run_id == run.id)))
    if enqueue(db, batch, run, items):
        run.status = "ANALYZING"
        return True
    return False


def resolve(db, batch, target, base):
    """Re-admit stored raw output against live flags; KEEP acknowledgements may survive."""
    result = copy.deepcopy(base)
    if not enabled(batch):
        result["presentation"] = {"status": "DISABLED"}
        return result
    from app.source_analysis.presentation_plan import admit, content_hash

    item = next(
        (
            item
            for item in db.scalars(
                select(Item)
                .join(Run)
                .where(
                    Run.batch_id == batch.id, Run.status != "CANCELLED", Item.phase == "ASSEMBLE"
                )
                .order_by(Run.created_at.desc(), Item.available_at.desc(), Item.id.desc())
            )
            if item.target_ids == [target["id"]]
        ),
        None,
    )
    if item is None:
        result["presentation"] = {"status": "FALLBACK", "reason": "NOT_GENERATED"}
    elif (
        item.refinement.get("version") != VERSION
        or item.refinement.get("assemblyVersion") != ASSEMBLY_VERSION
        or item.refinement.get("contentHash") != content_hash(base, target)
    ):
        result["presentation"] = {"status": "STALE", "reason": "SOURCE_CHANGED"}
    elif item.status in {"QUEUED", "RUNNING"}:
        result["presentation"] = {"status": "PENDING"}
    elif item.status == "SUCCEEDED" and item.refinement.get("raw"):
        try:
            result = admit(base, target, AssemblyOutput.model_validate(item.refinement["raw"]))
        except (ValueError, KeyError, TypeError):
            result["presentation"] = {"status": "FALLBACK", "reason": "ADMISSION_FAILED"}
    else:
        result["presentation"] = {
            "status": "FALLBACK",
            "reason": item.error or item.refinement.get("reason") or "GENERATION_FAILED",
        }
    return result


def check_inputs(db, context):
    batch, _, run, item = context
    if not enabled(batch):
        raise ExtractionError("PRESENTATION_DISABLED")
    saved = item.refinement
    if (
        saved.get("version") != VERSION
        or saved.get("assemblyVersion") != ASSEMBLY_VERSION
        or saved.get("model") != MODEL
    ):
        raise ExtractionError("PROMPT_CHANGED")
    from app.source_analysis.presentation_plan import content_hash

    base, target = current(db, batch, item.target_ids[0])
    if saved["contentHash"] != content_hash(base, target) or saved["snapshotHash"] != digest(
        snapshot(db, batch)
    ):
        raise ExtractionError("SOURCE_CHANGED")
    if run.mode != "mock":
        for source in db.scalars(
            select(Asset).where(
                Asset.batch_id == batch.id,
                Asset.deleted.is_(False),
                Asset.original_photo.is_(False),
            )
        ):
            if not source.product_photo and not source.privacy_approved:
                raise ExtractionError("PRIVACY_CHANGED")
        if not get_settings().openrouter_api_key:
            raise ExtractionError("PROVIDER_AUTH")
    return base, target


def generate(mode, row):
    """Mock identity is provider-free; actual presentation always uses OpenRouter Astra."""
    if mode == "mock":
        modules = {}
        for text in row["texts"]:
            modules.setdefault(text["module"], []).append(
                {"value": text["value"], "textIds": [text["id"]], "editingNotes": []}
            )
        return ExtractionResponse(
            AssemblyOutput(
                modules=[{"module": module, "texts": texts} for module, texts in modules.items()],
                excluded=[],
            ),
            {"mock": True},
            None,
        )
    return extract(
        "openrouter",
        MODEL,
        {
            "target": row["target"],
            "texts": [
                {key: text[key] for key in ("id", "module", "value", "ownerFlags")}
                for text in row["texts"]
            ],
        },
        [],
        [],
        prompt=PROMPT,
        output_model=AssemblyOutput,
        reasoning_effort="medium",
    )


def process(item_id, token):
    from app.source_analysis.service import refresh_runs
    from app.source_analysis.worker import lock_context, paid_vision_call

    started = time.monotonic()
    response = None
    try:
        with get_sessionmaker()() as db:
            context = lock_context(db, item_id, token)
            if not context:
                return
            base, target = check_inputs(db, context)
            _, _, run, item = context
            row, mode = item.refinement["input"], run.mode
            if (
                len(row["texts"]) > MAX_INPUT_TEXTS
                or sum(len(text["value"]) for text in row["texts"]) > MAX_INPUT_CHARS
            ):
                raise ExtractionError("PRESENTATION_INPUT_LIMIT")
            if any(scrub(text["value"]) != text["value"] for text in row["texts"]) or scrub(
                row["target"].get("name", "")
            ) != row["target"].get("name", ""):
                raise ExtractionError("PRIVACY_CHANGED")
        if mode == "mock":
            response = generate(mode, row)
        else:
            response = paid_vision_call(
                item_id,
                token,
                "assemble",
                MODEL,
                {"prompt": PROMPT, "schema": AssemblyOutput.model_json_schema(), "input": row},
                [],
                [],
                lambda: generate(mode, row),
                output_tokens=OUTPUT_TOKENS,
                guard=check_inputs,
                reservation_mode="openrouter",
            )
        output = AssemblyOutput.model_validate(response.extraction)
        diagnostics = audit(output, row)
        from app.source_analysis.presentation_plan import admit

        with get_sessionmaker()() as db:
            context = lock_context(db, item_id, token)
            if not context:
                return
            base, target = check_inputs(db, context)
            batch, _, _, item = context
            admitted = admit(base, target, output)
            meta = admitted["presentation"]
            item.refinement = {
                **item.refinement,
                "raw": output.model_dump(by_alias=True),
                "audit": diagnostics,
                "accepted": meta["status"] == "APPLIED",
                "reason": meta.get("reason"),
                "admission": meta,
            }
            item.status, item.error = "SUCCEEDED", None
            item.usage, item.provider_request_id = response.usage, response.request_id
            item.duration_ms = int((time.monotonic() - started) * 1000)
            if meta["status"] == "APPLIED":
                batch.review_version += 1
            refresh_runs(db, batch.id)
            db.commit()
    except Exception as exc:
        # Presentation is optional: persist the failure and retain the whole baseline.
        # No paid retry, no swallowed charge, no editor mutation and no raw exception text.
        with get_sessionmaker()() as db:
            context = lock_context(db, item_id, token)
            if not context:
                return
            batch, _, _, item = context
            reason = exc.code if isinstance(exc, ExtractionError) else "PRESENTATION_FAILED"
            item.status, item.error = "FAILED", reason
            item.refinement = {**item.refinement, "accepted": False, "reason": reason}
            if response:
                item.refinement = {
                    **item.refinement,
                    "raw": response.extraction.model_dump(by_alias=True),
                }
                item.usage, item.provider_request_id = response.usage, response.request_id
            elif isinstance(exc, ExtractionError):
                item.usage, item.provider_request_id = exc.usage, exc.request_id
            item.duration_ms = int((time.monotonic() - started) * 1000)
            refresh_runs(db, batch.id)
            db.commit()
