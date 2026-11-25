"""Unresolved reading is private progress, not a publishable complete result."""

from sqlalchemy import select

from app.core.errors import conflict
from app.source_analysis.models import Asset, Item, Run


def issues(db, batch, target_id=None):
    sources = {
        a.id: a
        for a in db.scalars(
            select(Asset).where(
                Asset.batch_id == batch.id,
                Asset.deleted.is_(False),
                Asset.original_photo.is_(False),
            )
        )
        if not a.deleted and (target_id is None or a.common or target_id in a.target_ids)
    }
    work = db.execute(
        select(Item, Run.created_at)
        .join(Run, Item.run_id == Run.id)
        .where(Run.batch_id == batch.id, Item.phase.in_(["PREPARE", "EXTRACT"]))
        .order_by(Run.created_at.desc(), Item.available_at.desc(), Item.id.desc())
    )
    seen, result = set(), []
    for item, _ in work:
        source = sources.get(item.asset_id)
        if source is None or item.revision != source.revision:
            continue
        if item.phase == "EXTRACT" and item.sanitization_version != source.sanitization_version:
            continue
        scope = tuple((p["number"], tuple(p.get("spanIds", []))) for p in item.pages)
        targets = [target_id] if target_id is not None else [t["id"] for t in batch.targets]
        unresolved_targets = []
        for tid in targets:
            if tid not in item.target_ids or not (source.common or tid in source.target_ids):
                continue
            key = (source.id, item.phase, scope if item.phase == "EXTRACT" else (), tid)
            if key not in seen:
                seen.add(key)
                unresolved_targets.append(tid)
        if not unresolved_targets:
            continue
        diagnostics = item.diagnostics
        gaps = bool(
            diagnostics.get("pagesFailed")
            or diagnostics.get("chunksFailed")
            or diagnostics.get("pagesSkipped")
        )
        unfinished = (
            item.status in {"QUEUED", "RUNNING", "PRIVACY_REVIEW", "FAILED", "CANCELLED"}
            and item.error != "CANDIDATES_REJECTED"
        )
        if unfinished or gaps:
            result.append(
                {
                    "sourceId": source.id,
                    "itemId": item.id,
                    "runId": item.run_id,
                    "phase": item.phase,
                    "status": item.status,
                    "error": item.error,
                    "pagesSkipped": diagnostics.get("pagesSkipped", 0),
                    "targetIds": unresolved_targets,
                    "common": source.common,
                }
            )
    return result


def require_complete(db, batch, target_id):
    pending = issues(db, batch, target_id)
    if pending:
        raise conflict(
            "SOURCE_PROCESSING_INCOMPLETE",
            "자료를 모두 읽지 못했어요. "
            "미완료 부분을 다시 처리하거나 해당 자료를 제외한 뒤 반영해 주세요.",
            sourceIds=sorted({i["sourceId"] for i in pending}),
        )
