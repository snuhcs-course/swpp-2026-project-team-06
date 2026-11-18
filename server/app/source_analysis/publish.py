"""Explicit publication: allow-listed snapshot; never expose source identifiers."""

from copy import deepcopy
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.catalog import service as catalog
from app.core.db import get_db
from app.core.errors import conflict, invalid, not_found
from app.core.images import sniff
from app.source_analysis import service as s
from app.source_analysis.caching import not_modified, tag_for
from app.source_analysis.models import ProductWorkspace, PublicPhoto
from app.source_analysis.photos import page_variant
from app.source_analysis.storage import Storage

public_router = APIRouter()


def apply_draft(db, batch, draft, body, apply_cover=False):
    """Apply a batch draft to the product page. `apply_cover` (DEV-361 apply-all): the draft's
    representative becomes the cover of a buyer-visible product too (the composer edits it now)."""
    s.version(draft.version, body.draft_version)
    snap = draft.snapshot
    s.version(batch.review_version, snap["reviewVersion"])
    # Drafts saved before publication existed must be saved again, never silently applied.
    s.version(batch.version, snap.get("batchVersion", -1))
    target = next(t for t in batch.targets if t["id"] == draft.target_id)
    if target.get("productId") and target["productId"] != body.product_id:
        raise invalid({"productId": "초안에 연결된 상품을 선택해 주세요."})
    product = catalog.load_my_product(db, batch.farm_id, body.product_id, lock=True).product
    s.version(product.version, body.product_version)
    workspace = db.get(ProductWorkspace, product.id)
    if workspace and workspace.snapshot != workspace.published_snapshot:
        raise conflict("PAGE_DRAFT_EXISTS", "저장된 판매페이지 수정본을 먼저 반영해 주세요.")
    for sid, expected in snap["sourceVersions"].items():
        source = s.asset(db, batch.id, sid)
        s.version(source.revision, expected["revision"])
        s.version(source.sanitization_version, expected["sanitizationVersion"])
    if not snap["previewModules"]:
        raise invalid({"modules": "확정된 상세 내용이 필요해요."})
    # Copy sanitized photos into independent keys as display-size JPEG (DEV-328). No EXIF.
    copied, store = {}, Storage()
    from app.source_analysis.representative import selected

    # DEV-346 (11/17 PM): applying a buyer-visible product's own page alone (the product
    # workspace's batch, this endpoint) leaves product.photos as they are. DEV-361 apply-all
    # (`apply_cover`) makes the draft's cover the cover, as before sale and from other workspaces.
    own_page = (
        product.status not in ("DRAFT", "REJECTED")
        and workspace is not None
        and batch.id == workspace.batch_id
    )
    keeps_cover = own_page and not apply_cover
    if own_page and workspace.page_source:
        from app.source_analysis.workspace import page_source, story_kind

        # The page was applied elsewhere (legacy editor, another screen, admin) since this draft
        # matched it: never overwrite it with an old draft (same description exception as open).
        if page_source(product) != workspace.page_source and story_kind(product) != "text":
            raise conflict("PAGE_CHANGED", "판매페이지가 바뀌었어요. 다시 열어 주세요.")
    if not keeps_cover:
        representative = selected(db, batch.id, target, required=True)
        if snap.get("representativeAssetId") != representative.id:
            raise conflict("PHOTO_CHANGED", "대표사진을 확인한 뒤 초안을 다시 저장해 주세요.")

    def copy_photo(sid):
        source = s.asset(db, batch.id, sid)
        if not source.original_photo or source.status != "PREPARED":
            raise conflict("PHOTO_NOT_PREPARED", "상품사진 준비를 완료해 주세요.")
        if not source.common and draft.target_id not in source.target_ids:
            raise conflict("PHOTO_CHANGED", "상품의 원본 사진 연결을 확인해 주세요.")
        if source.product_photo:
            # DEV-346: a photo the product page already used; keep its URI (no copy, no re-encode).
            uri = source.product_photo["uri"]
            path = urlparse(uri).path  # relative or absolute (https://…/api/source-media/<id>)
            if path.startswith("/api/source-media/"):
                own = db.get(PublicPhoto, path.removeprefix("/api/source-media/"))
                if own is None or own.product_id != product.id:
                    raise conflict("PHOTO_CHANGED", "상품의 원본 사진 연결을 확인해 주세요.")
            alt = source.product_photo["alt"] or "생산자가 제공한 상품사진"
            return {"uri": uri, "alt": alt}
        if sid not in copied:
            pages = s.pages_for(db, source)
            if len(pages) != 1 or not pages[0].sanitized_key:
                raise conflict("PHOTO_NOT_PREPARED", "원본 사진 처리를 완료해 주세요.")
            # Same bytes as public_photo(PNG); reuses the stored preview when present (DEV-341).
            data = page_variant(store, pages[0].sanitized_key, "display")
            photo = PublicPhoto(product_id=product.id, storage_key=store.put(data))
            db.add(photo)
            db.flush()
            copied[sid] = photo.id
        return {"uri": f"/api/source-media/{copied[sid]}", "alt": "생산자가 제공한 상품사진"}

    cover = None if keeps_cover else copy_photo(representative.id)
    modules = []
    for module in snap["previewModules"]:
        photos = [copy_photo(sid) for sid in module["photoAssetIds"]]
        modules.append(
            {
                "id": module["id"],
                "texts": deepcopy(module["texts"]),
                "photos": photos,
                "illustrationId": module["illustrationId"],
            }
        )
    if cover:
        product.photos = [cover["uri"], *[p for p in product.photos if p != cover["uri"]]]
    product.module_detail = {"schemaVersion": 1, "modules": modules}
    product.version += 1
    if workspace:
        from app.source_analysis.workspace import page_source, published

        if batch.id == workspace.batch_id:  # the workspace's own composer draft is the page now
            workspace.page_source, workspace.page_draft_id = page_source(product), draft.id
        workspace.snapshot = published(product)
        workspace.published_snapshot = deepcopy(workspace.snapshot)
        workspace.base_product_version = product.version
        workspace.version += 1
    db.flush()
    return {
        "productId": product.id,
        "version": product.version,
        "moduleDetail": product.module_detail,
    }


# Access depends on the product staying published, so only the viewer's own cache
# may keep a photo, briefly. `private` keeps shared proxies from holding it after an
# unpublish (there is no CDN in front of the API).
PUBLIC_CACHE = "private, max-age=300"


def media_type(data: bytes) -> str:
    """Stored bytes decide the type: legacy copies are PNG, DEV-328 copies are JPEG."""
    return sniff(data) or "application/octet-stream"


def etag(photo: PublicPhoto) -> str:
    # The ETag follows the storage key (recompress writes a new key, so the tag changes).
    return tag_for(photo.storage_key)


@public_router.get("/source-media/{photo_id}")
def public_photo(
    photo_id: str,
    db: Annotated[Session, Depends(get_db)],
    if_none_match: Annotated[str | None, Header()] = None,
):
    photo = db.get(PublicPhoto, photo_id)
    if photo is None:
        raise not_found()
    detail = catalog.product_detail(db, photo.product_id)
    referenced = detail is not None and (
        f"/api/source-media/{photo_id}" == detail.photo
        or any(
            p["uri"] == f"/api/source-media/{photo_id}"
            for m in (detail.module_detail or {}).get("modules", [])
            for p in m["photos"]
        )
        or any(
            b.get("uri") == f"/api/source-media/{photo_id}"
            for b in (detail.detail_content.model_dump() if detail.detail_content else {}).get(
                "blocks", []
            )
            if b.get("type") == "image"
        )
    )
    if not referenced:
        raise not_found()
    tag = etag(photo)
    headers = {"Cache-Control": PUBLIC_CACHE, "ETag": tag, "X-Content-Type-Options": "nosniff"}
    if not_modified(tag, if_none_match):
        return Response(status_code=304, headers=headers)
    data = Storage().get(photo.storage_key)
    return Response(data, media_type=media_type(data), headers=headers)
