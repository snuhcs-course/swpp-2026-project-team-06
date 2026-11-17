"""Approved-producer API. All downloads/previews are authenticated.

Originals and unredacted pages are non-cacheable; resized page previews and workspace photos may
stay in the producer's own browser cache, keyed by revision/ETag (DEV-341).
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.security import ApprovedProducer
from app.source_analysis import editor as e
from app.source_analysis import service as s
from app.source_analysis import workspace as w
from app.source_analysis.caching import PREVIEW_CACHE, PREVIEW_REVALIDATE, not_modified, tag_for
from app.source_analysis.models import Asset, Batch, Draft, Page, PublicPhoto, Run
from app.source_analysis.schemas import (
    ApplyDraft,
    Assignment,
    BasicInfoPatch,
    BatchCreate,
    BatchPatch,
    DraftSave,
    Privacy,
    RepresentativePatch,
    Retry,
    ReviewPatch,
    RunStart,
    SourceEdit,
    Version,
)
from app.source_analysis.storage import Storage


def enabled():
    if not get_settings().source_analysis_enabled:
        raise not_found()


router = APIRouter(
    prefix="/source-analysis", tags=["source-analysis"], dependencies=[Depends(enabled)]
)
# Outside the feature gate so apps can tell "disabled" from "not found" (DEV-84).
config_router = APIRouter(prefix="/source-analysis", tags=["source-analysis"])


@config_router.get("/config")
def config():
    """자료 분석 사용 여부. 꺼진 서버면 생산자 앱이 기존 문구/직접 입력으로 간다(DEV-84)."""
    return {"enabled": get_settings().source_analysis_enabled}


DB = Annotated[Session, Depends(get_db)]
Key = Annotated[str | None, Header(alias="Idempotency-Key")]


def commit(db, result):
    db.commit()
    return result


@router.get("/product-workspaces/{pid}/photos/{photo_id}")
def workspace_photo(
    pid: str,
    photo_id: str,
    who: ApprovedProducer,
    db: DB,
    if_none_match: Annotated[str | None, Header()] = None,
):
    from app.catalog import service as catalog
    from app.source_analysis.publish import media_type

    catalog.load_my_product(db, who[1].id, pid)
    photo = db.get(PublicPhoto, photo_id)
    if photo is None or photo.product_id != pid:
        raise not_found()
    # A photo id is one stored copy (recompress writes a new key, so the ETag changes).
    tag = tag_for(photo.storage_key)
    headers = {"Cache-Control": PREVIEW_CACHE, "ETag": tag, "Vary": "Authorization"}
    if not_modified(tag, if_none_match):
        return Response(status_code=304, headers=headers)
    data = Storage().get(photo.storage_key)
    return Response(data, media_type=media_type(data), headers=headers)


@router.post("/product-workspaces")
def open_product_workspace(body: w.OpenWorkspace, who: ApprovedProducer, db: DB, key: Key = None):
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            "product-workspace",
            key,
            body.model_dump(),
            lambda: w.open_workspace(db, who[1], body),
        ),
    )


@router.put("/product-workspaces/{pid}")
def save_product_page(pid: str, body: w.PageSave, who: ApprovedProducer, db: DB, key: Key = None):
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            "page-save:" + pid,
            key,
            body.model_dump(),
            lambda: w.save(db, who[1], pid, body),
        ),
    )


@router.post("/product-workspaces/{pid}/apply")
def apply_product_page(pid: str, body: Version, who: ApprovedProducer, db: DB, key: Key = None):
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            "page-apply:" + pid,
            key,
            body.model_dump(),
            lambda: w.apply(db, who[1], pid, body),
        ),
    )


@router.post("/batches", status_code=201)
def create(body: BatchCreate, who: ApprovedProducer, db: DB, key: Key = None):
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            "create",
            key,
            body.model_dump(),
            lambda: s.create_batch(db, who[1].id, body),
        ),
    )


@router.get("/batches")
def listing(
    who: ApprovedProducer,
    db: DB,
    limit: int = Query(20, ge=1, le=50),
    cursor: str | None = Query(None, max_length=64),
):
    query = select(Batch).where(Batch.farm_id == who[1].id, Batch.deleted.is_(False))
    if cursor:
        query = query.where(Batch.id > cursor)
    rows = list(db.scalars(query.order_by(Batch.id).limit(limit + 1)))
    return {
        "items": [s.json_row(r) for r in rows[:limit]],
        "nextCursor": rows[limit - 1].id if len(rows) > limit else None,
    }


@router.get("/batches/{bid}")
def detail(bid: str, who: ApprovedProducer, db: DB):
    row = s.batch(db, who[1].id, bid, False)
    return {
        **s.json_row(row),
        "sources": [
            s.asset_view(a)
            for a in db.scalars(
                select(Asset)
                .where(Asset.batch_id == bid, Asset.deleted.is_(False))
                .order_by(Asset.created_at, Asset.id)
            )
        ],
    }


@router.put("/batches/{bid}/representative")
def representative(bid: str, body: RepresentativePatch, who: ApprovedProducer, db: DB):
    from app.source_analysis.representative import choose

    row = s.batch(db, who[1].id, bid)
    s.version(row.version, body.version)
    if db.scalar(select(Run.id).where(Run.batch_id == bid, Run.status.in_(s.ACTIVE))):
        raise conflict("RUN_ACTIVE", "분석 후 대표사진을 바꿔 주세요.")
    choose(db, row, body.target_ids, body.asset_id)
    return commit(db, s.json_row(row))


@router.put("/batches/{bid}/basic-info")
def basic_info(bid: str, body: BasicInfoPatch, who: ApprovedProducer, db: DB):
    return commit(db, s.patch_basic_info(db, s.batch(db, who[1].id, bid), body))


@router.patch("/batches/{bid}")
def patch(bid: str, body: BatchPatch, who: ApprovedProducer, db: DB):
    return commit(db, s.patch_batch(db, s.batch(db, who[1].id, bid), body))


@router.post("/batches/{bid}/sources", status_code=201)
def upload(
    bid: str,
    who: ApprovedProducer,
    db: DB,
    batch_version: int = Form(..., alias="batchVersion"),
    target_ids: Annotated[list[str] | None, Form(alias="targetIds")] = None,
    common: bool = Form(False),
    original_photo: bool = Form(False, alias="originalPhoto"),
    text: str | None = Form(None),
    file: Annotated[UploadFile | None, File()] = None,
):
    row = s.batch(db, who[1].id, bid)
    target_ids = target_ids or []
    if (file is None) == (text is None):
        raise invalid({"file": "파일 또는 텍스트 하나만 넣어 주세요."})
    if file:
        # Bounded read; multipart parser spools disk instead of buffering the entire request.
        data = file.file.read(20 * 1024 * 1024 + 1)
        name = file.filename or "source"
    else:
        if len(text) > 30_000:
            raise ApiError(413, "PAYLOAD_TOO_LARGE", "텍스트는 30,000자까지 넣어 주세요.")
        data, name = text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8"), "source.txt"
    return commit(
        db, s.upload(db, row, data, name, target_ids, common, batch_version, original_photo)
    )


@router.get("/batches/{bid}/sources/{sid}")
def source(bid: str, sid: str, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid, False)
    return s.asset_view(s.asset(db, bid, sid))


@router.patch("/batches/{bid}/sources/{sid}")
def source_patch(bid: str, sid: str, body: Assignment, who: ApprovedProducer, db: DB):
    row = s.batch(db, who[1].id, bid)
    return commit(db, s.patch_asset(db, row, s.asset(db, bid, sid), body))


@router.get("/batches/{bid}/sources/{sid}/text")
def source_text(bid: str, sid: str, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid, False)
    source = s.asset(db, bid, sid)
    if source.mime != "text/plain":
        raise invalid({"text": "텍스트 자료만 수정할 수 있어요."})
    return {
        "text": Storage().get(source.storage_key).decode("utf-8-sig"),
        "sourceVersion": source.revision,
    }


@router.put("/batches/{bid}/sources/{sid}/details")
def source_details(bid: str, sid: str, body: SourceEdit, who: ApprovedProducer, db: DB):
    import hashlib

    row = s.batch(db, who[1].id, bid)
    source = s.asset(db, bid, sid)
    s.version(source.revision, body.source_version)
    if body.text is not None:
        if source.mime != "text/plain" or not body.text.strip():
            raise invalid({"text": "내용이 있는 텍스트 자료만 수정할 수 있어요."})
        others = list(
            db.scalars(
                select(Asset).where(
                    Asset.batch_id == bid, Asset.id != sid, Asset.deleted.is_(False)
                )
            )
        )
        data = body.text.replace("\r\n", "\n").replace("\r", "\n").encode()
        if sum(a.char_count for a in others) + len(data.decode()) > 30000:
            raise invalid({"text": "텍스트는 합계 30,000자까지예요."})
        checksum = hashlib.sha256(data).hexdigest()
        if any(a.checksum == checksum for a in others):
            raise invalid({"text": "이미 등록한 내용이에요."})
        source.storage_key, source.checksum = Storage().put(data), checksum
        source.size, source.char_count = len(data), len(data.decode())
        source.revision += 1
        source.status, source.privacy_approved = "UPLOADED", False
        s.invalidate(db, row, source)
    if body.description is not None:
        if not source.original_photo:
            raise invalid({"description": "상품사진에만 설명을 넣을 수 있어요."})
        s.version(source.description_version, body.description_version)
        source.description_version += 1
        source.description = body.description.strip()
        # Description revisions do not invalidate image geometry or saved photo references.
        source.placement = {}
        row.version += 1
        row.review_version += 1
    return commit(db, s.asset_view(source))


@router.post("/product-workspaces/{pid}/photos", status_code=201)
def upload_page_photo(pid: str, who: ApprovedProducer, db: DB, file: Annotated[UploadFile, File()]):
    from app.catalog import service as catalog
    from app.source_analysis import photos
    from app.source_analysis.models import ProductWorkspace
    from app.source_analysis.preprocess import PreparationError

    # Unlocked ownership/workspace check first, so a stranger's upload is never decoded.
    catalog.load_my_product(db, who[1].id, pid)
    if db.get(ProductWorkspace, pid) is None:
        raise invalid({"productId": "판매페이지 편집을 먼저 열어 주세요."})
    # End the read transaction before the slow read/convert so the connection is not left idle in
    # a transaction; `w.owned` below re-checks everything under the lock.
    db.rollback()
    data = file.file.read(20 * 1024 * 1024 + 1)
    if not data or len(data) > 20 * 1024 * 1024:
        raise invalid({"file": "사진은 20MB 이하로 올려 주세요."})
    try:
        # Served to consumers via /api/source-media once applied: same display-size JPEG (DEV-328).
        # Encoded and stored outside the product lock (DEV-341) so saves/applies do not wait.
        prepared = photos.public_photo(data)
    except PreparationError as exc:
        raise invalid({"file": str(exc)}) from exc
    key = Storage().put(prepared)
    # The row itself is still added under the product lock, re-checking ownership/workspace.
    # If that fails, the stored file is an orphan that worker cleanup removes after 24h.
    w.owned(db, who[1], pid)
    photo = PublicPhoto(product_id=pid, storage_key=key)
    db.add(photo)
    db.flush()
    return commit(db, {"uri": f"/api/source-media/{photo.id}", "alt": "상품 사진"})


@router.delete("/batches/{bid}/sources/{sid}", status_code=202)
def source_delete(bid: str, sid: str, who: ApprovedProducer, db: DB, version: int = Query(ge=1)):
    row = s.batch(db, who[1].id, bid)
    source = s.asset(db, bid, sid)
    s.version(source.revision, version)
    return commit(db, s.remove_asset(db, row, source))


@router.get("/batches/{bid}/sources/{sid}/content")
def content(bid: str, sid: str, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid, False)
    source = s.asset(db, bid, sid)
    if source.product_photo:
        raise not_found()  # a referenced product page photo has no stored bytes (DEV-346)
    return Response(
        Storage().get(source.storage_key),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": 'attachment; filename="source"',
            "Cache-Control": "no-store",
        },
    )


def page_for(db, bid, sid, number):
    source = s.asset(db, bid, sid)
    if source.product_photo:
        raise not_found()  # referenced product page photos have no pages (DEV-346)
    page = db.scalar(
        select(Page).where(
            Page.asset_id == sid, Page.revision == source.revision, Page.number == number
        )
    )
    if page is None:
        raise not_found()
    return source, page


@router.get("/batches/{bid}/sources/{sid}/pages/{number}")
def page(bid: str, sid: str, number: int, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid, False)
    source, page = page_for(db, bid, sid, number)
    return {
        "sourceRevision": source.revision,
        "sanitizationVersion": source.sanitization_version,
        "privacyApproved": source.privacy_approved,
        "spans": page.spans,
        "redactedSpans": page.redacted_spans,
        "redactions": page.redactions,
        "hasImage": bool(page.image_key),
    }


@router.get("/batches/{bid}/sources/{sid}/pages/{number}/image")
def page_image(
    bid: str,
    sid: str,
    number: int,
    who: ApprovedProducer,
    db: DB,
    sanitized: bool = True,
    variant: Literal["original", "display", "thumb"] = "original",
    v: Annotated[str | None, Query(max_length=40)] = None,
    if_none_match: Annotated[str | None, Header()] = None,
):
    """Page image. `original` is the stored lossless PNG (no-store, unchanged contract).

    DEV-341: `display` (long edge <= 1600px JPEG, cover/editor) and `thumb` (short edge <= 480px,
    attachment tiles) are previews of the sanitized image. With `v=<revision>.<sanitizationVersion>`
    matching the current source they are cacheable for a day; otherwise they revalidate by ETag.
    """
    from app.source_analysis.photos import page_variant, variant_key
    from app.source_analysis.preprocess import PreparationError

    s.batch(db, who[1].id, bid, False)
    source, page = page_for(db, bid, sid, number)
    key = page.sanitized_key if sanitized else page.image_key
    if key is None:
        raise not_found()
    if variant == "original" or not sanitized:
        # Unredacted pages are never previewed or cached.
        if variant != "original":
            raise invalid({"variant": "가림 처리된 이미지만 미리보기로 받을 수 있어요."})
        return Response(
            Storage().get(key),
            media_type="image/png",
            headers={"Cache-Control": "no-store"},
        )
    current = v == f"{source.revision}.{source.sanitization_version}"
    tag = tag_for(variant_key(key, variant))
    headers = {
        "Cache-Control": PREVIEW_CACHE if current else PREVIEW_REVALIDATE,
        "ETag": tag,
        "Vary": "Authorization",
    }
    if not_modified(tag, if_none_match):
        return Response(status_code=304, headers=headers)
    try:
        data = page_variant(Storage(), key, variant)
    except PreparationError as exc:  # e.g. an oversized legacy page image
        raise invalid({"variant": "이 이미지는 미리보기를 만들 수 없어요."}) from exc
    return Response(data, media_type="image/jpeg", headers=headers)


@router.patch("/batches/{bid}/sources/{sid}/privacy")
def privacy(bid: str, sid: str, body: Privacy, who: ApprovedProducer, db: DB):
    row = s.batch(db, who[1].id, bid)
    return commit(db, s.privacy(db, row, s.asset(db, bid, sid), body))


@router.post("/batches/{bid}/runs", status_code=202)
def start(bid: str, body: RunStart, who: ApprovedProducer, db: DB, key: Key = None):
    # Existence/ownership is checked even on idempotent replay.
    s.batch(db, who[1].id, bid, False)
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            f"{bid}/runs",
            key,
            body.model_dump(),
            lambda: s.start_run(
                db, s.batch(db, who[1].id, bid), body.batch_version, visual_pages=body.visual_pages
            ),
        ),
    )


@router.get("/batches/{bid}/runs/{rid}")
def run(bid: str, rid: str, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid, False)
    return s.run_view(db, s.owned_run(db, bid, rid))


@router.post("/batches/{bid}/runs/{rid}/retry", status_code=202)
def retry(bid: str, rid: str, body: Retry, who: ApprovedProducer, db: DB, key: Key = None):
    s.batch(db, who[1].id, bid, False)
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            f"{bid}/{rid}/retry",
            key,
            body.model_dump(),
            lambda: s.retry(db, s.batch(db, who[1].id, bid), s.owned_run(db, bid, rid), body),
        ),
    )


@router.post("/batches/{bid}/runs/{rid}/cancel", status_code=202)
def cancel(bid: str, rid: str, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid)
    return commit(db, s.cancel(db, s.owned_run(db, bid, rid)))


@router.get("/batches/{bid}/review")
def review(bid: str, who: ApprovedProducer, db: DB):
    return s.review(db, s.batch(db, who[1].id, bid, False))


@router.patch("/batches/{bid}/review")
def review_patch(bid: str, body: ReviewPatch, who: ApprovedProducer, db: DB):
    return commit(db, s.patch_review(db, s.batch(db, who[1].id, bid), body))


@router.put("/batches/{bid}/editor")
def save_editor(bid: str, body: e.EditorSave, who: ApprovedProducer, db: DB, key: Key = None):
    s.batch(db, who[1].id, bid, False)
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            f"{bid}/editor",
            key,
            body.model_dump(),
            lambda: e.save(db, s.batch(db, who[1].id, bid), body),
        ),
    )


@router.post("/batches/{bid}/drafts", status_code=201)
def save(bid: str, body: DraftSave, who: ApprovedProducer, db: DB, key: Key = None):
    s.batch(db, who[1].id, bid, False)
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            f"{bid}/drafts",
            key,
            body.model_dump(),
            lambda: s.save_drafts(db, s.batch(db, who[1].id, bid), body),
        ),
    )


def draft_for(db, bid, did):
    draft = db.scalar(select(Draft).where(Draft.id == did, Draft.batch_id == bid))
    if draft is None:
        raise not_found()
    return draft


@router.get("/batches/{bid}/drafts/{did}")
def draft(bid: str, did: str, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid, False)
    return s.json_row(draft_for(db, bid, did))


@router.delete("/batches/{bid}/drafts/{did}")
def draft_delete(bid: str, did: str, who: ApprovedProducer, db: DB, version: int = Query(ge=1)):
    s.batch(db, who[1].id, bid)
    draft = draft_for(db, bid, did)
    s.version(draft.version, version)
    db.delete(draft)
    from sqlalchemy import delete

    from app.source_analysis.models import RequestRecord

    db.execute(
        delete(RequestRecord).where(
            RequestRecord.farm_id == who[1].id, RequestRecord.scope == f"{bid}/drafts"
        )
    )
    return commit(db, {"deleted": True})


@router.delete("/batches/{bid}", status_code=202)
def remove(bid: str, body: Version, who: ApprovedProducer, db: DB):
    row = s.batch(db, who[1].id, bid)
    s.version(row.version, body.version)
    return commit(db, s.delete_batch(db, row))


@router.get("/batches/{bid}/runs")
def runs(bid: str, who: ApprovedProducer, db: DB):
    from app.source_analysis.models import Run

    s.batch(db, who[1].id, bid, False)
    return {
        "items": [
            s.run_view(db, r)
            for r in db.scalars(
                select(Run).where(Run.batch_id == bid).order_by(Run.created_at.desc())
            )
        ]
    }


@router.get("/batches/{bid}/drafts")
def drafts(bid: str, who: ApprovedProducer, db: DB):
    s.batch(db, who[1].id, bid, False)
    return {
        "items": [
            s.json_row(d)
            for d in db.scalars(
                select(Draft).where(Draft.batch_id == bid).order_by(Draft.created_at.desc())
            )
        ]
    }


@router.post("/batches/{bid}/drafts/{did}/apply")
def apply(bid: str, did: str, body: ApplyDraft, who: ApprovedProducer, db: DB, key: Key = None):
    from app.source_analysis.publish import apply_draft

    s.batch(db, who[1].id, bid, False)
    return commit(
        db,
        s.idempotent(
            db,
            who[1].id,
            f"{bid}/{did}/apply",
            key,
            body.model_dump(),
            lambda: apply_draft(db, s.batch(db, who[1].id, bid), draft_for(db, bid, did), body),
        ),
    )
