"""Durable per-target refinement and private, current-evidence lookup."""

import hashlib
import json
import time

from sqlalchemy import or_, select

from app.ai.source_refine import (
    PROMPT,
    PROMPT_VERSION,
    TEXT_MODULE_FIELDS,
    RefineError,
    farm_common_allowed,
    refine,
)
from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Batch, Candidate, Item, Page, Run
from app.source_analysis.preprocess import scrub
from app.source_analysis.text_safety import (
    SAFETY_LISTS_HASH,
    has_health_claim,
    has_money,
    has_period_text,
    has_platform_text,
    numbers,
)


def includes_target(candidate_target_id, target_id, target_count):
    """Common evidence joins only a single product; preserve each candidate's target ID."""
    return candidate_target_id == target_id or target_count == 1 and candidate_target_id is None


def current_candidates(db, batch_id, target_id, *, target_count=None):
    if target_count is None:
        target_count = len(db.get(Batch, batch_id).targets)
    target_filter = Candidate.target_id == target_id
    if target_id is not None and includes_target(None, target_id, target_count):
        target_filter = or_(target_filter, Candidate.target_id.is_(None))
    rows = list(
        db.execute(
            select(Candidate, Item, Asset)
            .join(Item, Candidate.item_id == Item.id)
            .join(Asset, Item.asset_id == Asset.id)
            .where(
                Candidate.batch_id == batch_id,
                target_filter,
                Candidate.outdated.is_(False),
                Asset.deleted.is_(False),
                Item.phase == "EXTRACT",
                Item.revision == Asset.revision,
                Item.sanitization_version == Asset.sanitization_version,
            )
        )
    )
    pages = {
        (p.asset_id, p.revision, p.number): p.redacted_spans
        for p in db.scalars(
            select(Page).where(Page.asset_id.in_({source.id for _, _, source in rows}))
        )
    }

    def source_order(row):
        candidate, item, source = row
        evidence = candidate.evidence[0]
        spans = next(
            (
                p["ocrSpans"]
                for p in item.pages
                if p["number"] == evidence["page"] and "ocrSpans" in p
            ),
            pages.get((source.id, source.revision, evidence["page"]), []),
        )
        position = next((i for i, span in enumerate(spans) if span["id"] in evidence["spanIds"]), 0)
        offset = spans[position]["text"].find(evidence["quote"]) if spans else 0
        return source.created_at, evidence["page"], position, offset, candidate.id

    return [candidate for candidate, _, _ in sorted(rows, key=source_order)]


def is_current(item, candidates):
    return (
        item.refinement["version"] == PROMPT_VERSION
        and item.refinement["safetyListsHash"] == SAFETY_LISTS_HASH
        and set(item.refinement["inputCandidateIds"]) == {c.id for c in candidates}
        and item.refinement["inputCandidatesHash"] == input_hash(candidates)
    )


def matching_refinement(db, batch_id, target_id, candidates):
    return next(
        (
            item
            for item in db.scalars(
                select(Item)
                .join(Run)
                .where(
                    Run.batch_id == batch_id,
                    Run.status != "CANCELLED",
                    Item.phase == "REFINE",
                    Item.status == "SUCCEEDED",
                )
                .order_by(Run.created_at.desc(), Item.id)
            )
            if item.target_ids == [target_id] and is_current(item, candidates)
        ),
        None,
    )


def enqueue(db, batch, run, items):
    """Called under the batch lock, before declaring the extraction run complete."""
    if any(i.phase == "REFINE" for i in items) or any(
        not (
            i.status == "SUCCEEDED"
            or i.phase == "EXTRACT"
            and i.status == "PARTIAL"
            and i.error == "CANDIDATES_REJECTED"
            and i.diagnostics.get("acceptedCount", 0) > 0
            and i.diagnostics.get("rejectedCount", 0) > 0
        )
        for i in items
        if i.phase in {"PREPARE", "EXTRACT"}
    ):
        return
    sources = list(
        db.scalars(select(Asset).where(Asset.batch_id == batch.id, Asset.deleted.is_(False)))
    )
    if not sources:
        return
    for target in run.targets:
        candidates = current_candidates(db, batch.id, target["id"], target_count=len(run.targets))
        if matching_refinement(db, batch.id, target["id"], candidates):
            continue
        anchor = (
            db.get(Asset, db.get(Item, candidates[0].item_id).asset_id)
            if candidates
            else sources[0]
        )
        db.add(
            Item(
                run_id=run.id,
                asset_id=anchor.id,
                revision=anchor.revision,
                sanitization_version=anchor.sanitization_version,
                target_ids=[target["id"]],
                phase="REFINE",
                refinement={
                    "version": PROMPT_VERSION,
                    "safetyListsHash": SAFETY_LISTS_HASH,
                    "inputCandidateIds": [c.id for c in candidates],
                    "inputCandidatesHash": input_hash(candidates),
                },
            )
        )
    db.flush()


def validate(output, candidates, target_id, *, target_count=0):
    """Drop bad texts independently. Never rescue rejected text with raw candidates."""
    by_id = {
        c["id"]: c
        for c in candidates
        if includes_target(c["targetId"], target_id, target_count)
    }
    accepted, rejected, warnings = {}, [], []
    for module in output.modules:
        for text in module.texts:
            code = None
            cited = [by_id[cid] for cid in text.candidate_ids if cid in by_id]
            if module.module not in TEXT_MODULE_FIELDS:
                code = "INVALID_TEXT_MODULE"
            elif len(cited) != len(text.candidate_ids) or not cited:
                code = "INVALID_EVIDENCE"
            elif any(
                c["targetId"] is None and not farm_common_allowed(c, module.module) for c in cited
            ):
                code = "INVALID_COMMON_MODULE"
            elif has_money(text.value):
                code = "MONEY_AMOUNT"
            elif has_health_claim(text.value) or any(has_health_claim(c["value"]) for c in cited):
                code = "HEALTH_CLAIM"
            elif scrub(text.value) != text.value:
                code = "PRIVATE_VALUE"
            elif numbers(text.value) - numbers(
                "\n".join(e["quote"] for c in cited for e in c["evidence"])
            ):
                code = "UNSUPPORTED_NUMBER"
            elif any(
                (c["historical"] or c["fieldKey"] == "historicalSales") and has_money(c["value"])
                for c in cited
            ):
                code = "PRICED_HISTORY"
            elif (
                any(c["historical"] or c["fieldKey"] == "historicalSales" for c in cited)
                and module.module != "farmStory"
            ):
                code = "HISTORICAL_MODULE"
            field = accepted.setdefault(module.module, [])
            # The editor stores one value per field; bound the joined value and citations too.
            if not code and (
                len("\n".join([t["value"] for t in field] + [text.value])) > 3000
                or len({cid for t in field for cid in t["candidateIds"]} | set(text.candidate_ids))
                > 100
            ):
                code = "FIELD_LIMIT"
            if code:
                rejected.append(
                    {"module": module.module, "code": code, "text": text.model_dump(by_alias=True)}
                )
            else:
                for detector, warning in (
                    (has_platform_text, "PLATFORM_TEXT"),
                    (has_period_text, "PERIOD_TEXT"),
                ):
                    if detector(text.value):
                        warnings.append(
                            {
                                "module": module.module,
                                "code": warning,
                                "text": text.model_dump(by_alias=True),
                            }
                        )
                field.append(text.model_dump(by_alias=True))
    modules = [{"module": m, "texts": accepted[m]} for m in TEXT_MODULE_FIELDS if accepted.get(m)]
    # Keep one explanation per candidate, with safety rejections taking precedence.
    reasons = {}
    for entry in output.excluded:
        for cid in entry.candidate_ids:
            if cid in by_id:
                reasons.setdefault(cid, entry.reason)
    reason_codes = {
        "MONEY_AMOUNT": "price",
        "PRICED_HISTORY": "price",
        "HEALTH_CLAIM": "health",
        "PRIVATE_VALUE": "pii",
    }
    for rejected_text in rejected:
        for cid in rejected_text["text"]["candidateIds"]:
            if cid in by_id:
                reasons[cid] = reason_codes.get(rejected_text["code"], "unsupported")
    covered = {cid for m in modules for t in m["texts"] for cid in t["candidateIds"]}
    for cid in by_id.keys() - covered - reasons.keys():
        reasons[cid] = "unused"
    excluded = [{"candidateIds": [cid], "reason": reasons[cid]} for cid in by_id if cid in reasons]
    return modules, {
        "excluded": excluded,
        "acceptedCount": sum(len(m["texts"]) for m in modules),
        "rejectedCount": len(rejected),
        "rejected": rejected,
        "warningCount": len(warnings),
        "warnings": warnings,
    }


def payload(candidates):
    return [
        {
            "id": c.id,
            "targetId": c.target_id,
            "fieldKey": c.field_key,
            "value": c.value,
            "historical": c.historical,
            "evidence": c.evidence,
        }
        for c in candidates
    ]


def input_hash(candidates):
    return hashlib.sha256(
        json.dumps(payload(candidates), ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


MAX_REFINE_CANDIDATES = 40
MAX_REFINE_CHARS = 16000


def limit_candidates(candidates):
    """Deterministic source-order prefix; retain full input IDs for freshness checks."""
    selected, size = [], 2
    for candidate in candidates:
        length = len(json.dumps(candidate, ensure_ascii=False, sort_keys=True)) + 2
        if len(selected) >= MAX_REFINE_CANDIDATES or size + length > MAX_REFINE_CHARS:
            break
        selected.append(candidate)
        size += length
    return selected, {
        "candidatesAnalysed": len(selected),
        "candidatesSkipped": len(candidates) - len(selected),
        "emptyReason": "REFINE_INPUT_LIMIT" if candidates and not selected else None,
    }


def empty_reason(candidates, target_id, modules, *, target_count=0):
    # Extraction owns the file-level explanation when it produced no candidates.
    if modules or not candidates:
        return None
    if not any(includes_target(c["targetId"], target_id, target_count) for c in candidates):
        return "NO_TARGET_CANDIDATES"
    return "ALL_TEXTS_FILTERED"


def check_inputs(db, context):
    batch, _, run, item = context
    candidates = current_candidates(
        db, batch.id, item.target_ids[0], target_count=len(run.targets)
    )
    if (
        item.refinement["version"] != PROMPT_VERSION
        or item.refinement["safetyListsHash"] != SAFETY_LISTS_HASH
    ):
        raise RefineError("PROMPT_CHANGED")
    if not is_current(item, candidates):
        raise RefineError("SOURCE_CHANGED")
    if run.mode != "mock" and any(
        not db.get(Asset, db.get(Item, c.item_id).asset_id).privacy_approved for c in candidates
    ):
        raise RefineError("PRIVACY_CHANGED")
    return candidates


def process(item_id, token):
    from app.source_analysis.service import refresh_runs
    from app.source_analysis.worker import lock_context, paid_vision_call

    started = time.monotonic()
    with get_sessionmaker()() as db:
        context = lock_context(db, item_id, token)
        if not context:
            return
        batch, _, run, item = context
        all_candidates = payload(check_inputs(db, context))
        candidates, limits = limit_candidates(all_candidates)
        diagnostic_candidates = all_candidates + (
            payload(current_candidates(db, batch.id, None)) if len(run.targets) > 1 else []
        )
        # Target names may be personal data. Candidate values already identify the product.
        target = {"id": item.target_ids[0]}
        mode, model = run.mode, run.model
        target_count = len(run.targets)
    if mode == "mock" or not candidates:
        response = refine("mock", model, target, candidates)
    else:
        # Quotes can include surrounding contact details; scrub them before transmission.
        safe = [
            {
                **c,
                "value": scrub(c["value"]),
                "evidence": [{**e, "quote": scrub(e["quote"])} for e in c["evidence"]],
            }
            for c in candidates
        ]
        response = paid_vision_call(
            item_id,
            token,
            "refine",
            model,
            {"prompt": PROMPT, "candidates": safe},
            [target],
            [],
            lambda: refine(mode, model, target, safe),
            guard=check_inputs,
        )
    modules, diagnostics = validate(
        response.refinement, candidates, target["id"], target_count=target_count
    )
    diagnostics["excluded"].extend(
        {"candidateIds": [c["id"]], "reason": "unused"} for c in all_candidates[len(candidates) :]
    )
    diagnostics.update(
        limits,
        emptyReason=limits["emptyReason"]
        or empty_reason(diagnostic_candidates, target["id"], modules, target_count=target_count),
    )
    with get_sessionmaker()() as db:
        context = lock_context(db, item_id, token)
        current = db.get(Item, item_id)
        if current:
            current.usage, current.provider_request_id = response.usage, response.request_id
            current.duration_ms = int((time.monotonic() - started) * 1000)
        if context:
            try:
                check_inputs(db, context)
            except RefineError as exc:
                raise RefineError(
                    str(exc), usage=response.usage, request_id=response.request_id
                ) from exc
            batch, _, _, item = context
            result = {"modules": modules, "excluded": diagnostics["excluded"]}
            fingerprint = hashlib.sha256(
                json.dumps(result, ensure_ascii=False, sort_keys=True).encode()
            ).hexdigest()
            item.refinement = {**item.refinement, **result, "refinementVersion": fingerprint}
            item.diagnostics = diagnostics
            item.status, item.error = "SUCCEEDED", None
            batch.review_version += 1
            refresh_runs(db, batch.id)
        db.commit()


def safe_refinement(item, candidates):
    """Recheck persisted output against today's detectors without mutating stored data."""
    by_id = {c.id: c for c in candidates}
    modules, reasons = [], {}
    for module in item.refinement["modules"]:
        texts = []
        for text in module["texts"]:
            reason = None
            if has_money(text["value"]):
                reason = "price"
            elif has_health_claim(text["value"]) or any(
                has_health_claim(by_id[cid].value) for cid in text["candidateIds"] if cid in by_id
            ):
                reason = "health"
            if reason:
                reasons.update({cid: reason for cid in text["candidateIds"]})
            else:
                texts.append(text)
        if texts:
            modules.append({**module, "texts": texts})
    if not reasons:
        return item.refinement
    excluded = {
        cid: entry["reason"]
        for entry in item.refinement["excluded"]
        for cid in entry["candidateIds"]
    }
    excluded.update(reasons)
    result = {
        "modules": modules,
        "excluded": [{"candidateIds": [cid], "reason": reason} for cid, reason in excluded.items()],
    }
    fingerprint = hashlib.sha256(
        json.dumps(result, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()
    return {**item.refinement, **result, "refinementVersion": fingerprint}


def current_refinements(db, batch):
    """Only an actual pending refinement for current inputs blocks verbatim fallback."""
    run = db.scalar(
        select(Run)
        .where(Run.batch_id == batch.id, Run.status != "CANCELLED")
        .order_by(Run.created_at.desc())
        .limit(1)
    )
    if run is None:
        return {}
    items = {
        i.target_ids[0]: i
        for i in db.scalars(select(Item).where(Item.run_id == run.id, Item.phase == "REFINE"))
    }
    result = {}
    for target in run.targets:
        tid = target["id"]
        candidates = current_candidates(db, batch.id, tid, target_count=len(run.targets))
        item = items.get(tid)
        if item is None:
            previous = matching_refinement(db, batch.id, tid, candidates)
            if previous:
                result[tid] = safe_refinement(previous, candidates)["modules"]
        elif item.status == "SUCCEEDED" and is_current(item, candidates):
            result[tid] = safe_refinement(item, candidates)["modules"]
        elif (
            run.status in {"QUEUED", "PREPARING", "ANALYZING", "PRIVACY_REVIEW"}
            and item.status in {"QUEUED", "RUNNING"}
            and is_current(item, candidates)
        ):
            result[tid] = None
    return result


def review_results(db, batch):
    result = {}
    for target in batch.targets:
        tid = target["id"]
        candidates = current_candidates(db, batch.id, tid)
        item = matching_refinement(db, batch.id, tid, candidates)
        if not item:
            result[tid] = {"excluded": [], "refinementVersion": None}
            continue
        by_id = {c.id: c for c in candidates}
        safe = safe_refinement(item, candidates)
        cited = {cid for m in safe["modules"] for t in m["texts"] for cid in t["candidateIds"]}

        # 문구에 반영된 중복·금액 없는 과거 판매 후보는 "뺐다"고 안내하지 않는다.
        hidden = {
            (cid, entry["reason"])
            for entry in safe["excluded"]
            for cid in entry["candidateIds"]
            if cid in cited
            and cid in by_id
            and (
                entry["reason"] == "duplicate"
                or (by_id[cid].historical or by_id[cid].field_key == "historicalSales")
                and entry["reason"] != "price"
            )
        }
        result[tid] = {
            "refinementVersion": safe["refinementVersion"],
            "excluded": [
                {"candidateId": cid, "value": by_id[cid].value, "reason": entry["reason"]}
                for entry in safe["excluded"]
                for cid in entry["candidateIds"]
                if cid in by_id and (cid, entry["reason"]) not in hidden
            ],
        }
    return result


def stored_fields(db, batch_id):
    """Review may preserve an older confirmed refinement with still-current citations."""
    return {
        (item.target_ids[0], key, field["value"], frozenset(field["candidateIds"]))
        for item in db.scalars(
            select(Item)
            .join(Run)
            .where(Run.batch_id == batch_id, Item.phase == "REFINE", Item.status == "SUCCEEDED")
        )
        for key, field in fields(
            safe_refinement(item, current_candidates(db, batch_id, item.target_ids[0]))["modules"]
        ).items()
    }


def fields(modules):
    return {
        TEXT_MODULE_FIELDS[m["module"]]: {
            "value": "\n".join(t["value"] for t in m["texts"]),
            "candidateIds": list(
                dict.fromkeys(cid for t in m["texts"] for cid in t["candidateIds"])
            ),
        }
        for m in modules
    }
