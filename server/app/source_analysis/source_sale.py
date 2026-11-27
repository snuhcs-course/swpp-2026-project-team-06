"""DEV-452: private page navigation and explicit initial sale submission."""

from sqlalchemy import select

from app.core.errors import conflict, invalid, not_found
from app.source_analysis import service as s
from app.source_analysis.models import Asset, Draft, ProductWorkspace
from app.source_analysis.page_review import pending, visible
from app.source_analysis.processing import issues, require_complete
from app.source_analysis.source_copy_service import plan


def context(db, farm_id, product_id, *, lock=False):
    from app.catalog.service import load_my_product

    load_my_product(db, farm_id, product_id)
    workspace = db.get(ProductWorkspace, product_id)
    if not workspace or not workspace.batch_id:
        return None
    batch = s.batch(db, farm_id, workspace.batch_id, lock)
    target = next((t for t in batch.targets if t.get("productId") == product_id), None)
    if not target:
        raise not_found()
    draft = db.scalar(
        select(Draft)
        .where(Draft.batch_id == batch.id, Draft.target_id == target["id"])
        .order_by(Draft.created_at.desc(), Draft.id.desc())
    )
    return batch, target, draft


def preview(db, farm_id, product_id):
    ctx = context(db, farm_id, product_id)
    if ctx is None:
        return None
    batch, target, draft = ctx
    workspace = db.get(ProductWorkspace, product_id)
    saved_page = bool(workspace.snapshot.get("design") and not batch.source_copy_enabled)
    current = bool(
        draft
        and draft.snapshot.get("batchVersion") == batch.version
        and draft.snapshot.get("reviewVersion") == batch.review_version
    )
    return {
        "batch": {
            **s.json_row(batch),
            "sources": [
                s.asset_view(a)
                for a in db.scalars(
                    select(Asset)
                    .where(Asset.batch_id == batch.id, Asset.deleted.is_(False))
                    .order_by(Asset.created_at, Asset.id)
                )
            ],
        },
        "targetId": target["id"],
        "draft": s.json_row(draft) if draft else None,
        "current": current or saved_page,
        **(
            {"workspace": s.json_row(workspace, ("page_source", "page_draft_id", "product_draft"))}
            if saved_page
            else {}
        ),
        "processingIssues": issues(db, batch, target["id"])
        + (
            [
                {
                    "sourceId": "imported-partial",
                    "itemId": "imported-partial",
                    "runId": "imported-partial",
                    "phase": "PREPARE",
                    "status": "FAILED",
                    "error": "IMPORTED_PARTIAL",
                    "pagesSkipped": 0,
                    "failedPages": [],
                    "targetIds": [target["id"]],
                    "common": False,
                }
            ]
            if workspace.snapshot.get("sourceProcessingIncomplete")
            else []
        ),
        "reviewPending": sum(
            bool(p["reviewPending"]) for p in plan(db, batch, target["id"])["passages"]
        )
        if batch.source_copy_enabled
        else max(1, len(pending(workspace.snapshot)))
        if workspace.snapshot.get("sourceReviewRequired")
        else 0,
    }


def unconfirmed_photos(db, batch, target, snapshots):
    """Extracted document photos the page uses that the producer has not confirmed (DEV-452)."""
    import json

    used = json.dumps([x for x in snapshots if x])
    return [
        a
        for a in db.scalars(
            select(Asset).where(
                Asset.batch_id == batch.id,
                Asset.deleted.is_(False),
                Asset.original_photo.is_(True),
            )
        )
        if (a.placement or {}).get("extracted")
        and not a.placement["extracted"].get("confirmed")
        and (a.common or target["id"] in a.target_ids)
        and (a.id == target.get("representativeAssetId") or f'"{a.id}"' in used)
    ]


def require_confirmed_photos(db, batch, target, snapshots):
    pending = unconfirmed_photos(db, batch, target, snapshots)
    if pending:
        raise invalid(
            {
                "photos": (
                    f"자료에서 가져온 사진 {len(pending)}장을 확인해 주세요. "
                    "쓸 사진은 확인을 누르고, 아니면 빼 주세요."
                )
            }
        )


def apply_for_sale(db, farm_id, product, page):
    ctx = context(db, farm_id, product.id, lock=True)
    if ctx is None:
        if page is not None:
            raise conflict("SOURCE_PAGE_CHANGED", "판매페이지를 다시 확인해 주세요.")
        return
    batch, target, draft = ctx
    from app.source_analysis.setup import require_sale_inputs

    require_sale_inputs(db.get(ProductWorkspace, product.id).snapshot)
    # Product is already locked by the initial capacity request; fence source edits too.
    batch = s.batch(db, farm_id, batch.id)
    require_complete(db, batch, target["id"])
    workspace = db.get(ProductWorkspace, product.id)
    require_confirmed_photos(
        db, batch, target, [workspace.snapshot, draft.snapshot if draft else None]
    )
    if workspace.snapshot.get("design") and not batch.source_copy_enabled:
        if (
            page is None
            or page.draft_id != "workspace-" + product.id
            or page.draft_version != workspace.version
        ):
            raise conflict(
                "SOURCE_PAGE_CHANGED",
                "판매페이지가 바뀌었어요. 최종 미리보기를 다시 확인해 주세요.",
            )
        from app.farms.models import Farm
        from app.source_analysis import workspace as w
        from app.source_analysis.schemas import Version

        # Sales setup changes product.version but must not discard the saved page.
        # Only rebase if the underlying published page still exactly matches its baseline.
        if visible(w.published(product)) != visible(workspace.published_snapshot):
            raise conflict("SOURCE_PAGE_CHANGED", "판매페이지가 바뀌었어요. 다시 확인해 주세요.")
        workspace.base_product_version = product.version
        w.apply(db, db.get(Farm, farm_id), product.id, Version(version=workspace.version))
        return
    if not draft or page is None:
        raise conflict(
            "SOURCE_PAGE_REQUIRED", "판매페이지를 저장하고 최종 미리보기를 확인해 주세요."
        )
    if page.draft_id != draft.id or page.draft_version != draft.version:
        raise conflict(
            "SOURCE_PAGE_CHANGED", "판매페이지가 바뀌었어요. 최종 미리보기를 다시 확인해 주세요."
        )
    from app.source_analysis.publish import apply_draft
    from app.source_analysis.schemas import ApplyDraft

    apply_draft(
        db,
        batch,
        draft,
        ApplyDraft(
            product_id=product.id, product_version=product.version, draft_version=page.draft_version
        ),
    )
