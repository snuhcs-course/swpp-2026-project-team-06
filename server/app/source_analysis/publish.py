"""Explicit publication: allow-listed snapshot; never expose source identifiers."""

import io
from copy import deepcopy
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from PIL import Image
from sqlalchemy.orm import Session

from app.catalog import service as catalog
from app.core.db import get_db
from app.core.errors import conflict, invalid, not_found
from app.source_analysis import service as s
from app.source_analysis.models import ProductWorkspace, PublicPhoto
from app.source_analysis.storage import Storage

public_router = APIRouter()


def apply_draft(db, batch, draft, body):
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
    # Copy sanitized full original photos into independent keys. EXIF is never copied.
    copied, store = {}, Storage()
    modules = []
    for module in snap["previewModules"]:
        photos = []
        for sid in module["photoAssetIds"]:
            source = s.asset(db, batch.id, sid)
            if not source.original_photo or not source.privacy_approved:
                raise conflict("PHOTO_PRIVACY_REQUIRED", "원본 사진의 가림 검토를 승인해 주세요.")
            if not source.common and draft.target_id not in source.target_ids:
                raise conflict("PHOTO_CHANGED", "상품의 원본 사진 연결을 확인해 주세요.")
            if sid not in copied:
                pages = s.pages_for(db, source)
                if len(pages) != 1 or not pages[0].sanitized_key:
                    raise conflict("PHOTO_NOT_PREPARED", "원본 사진 처리를 완료해 주세요.")
                with Image.open(io.BytesIO(store.get(pages[0].sanitized_key))) as image:
                    output = io.BytesIO()
                    image.convert("RGB").save(output, format="PNG")
                photo = PublicPhoto(product_id=product.id, storage_key=store.put(output.getvalue()))
                db.add(photo)
                db.flush()
                copied[sid] = photo.id
            photos.append(
                {"uri": f"/api/source-media/{copied[sid]}", "alt": "생산자가 제공한 원본 사진"}
            )
        modules.append(
            {
                "id": module["id"],
                "texts": deepcopy(module["texts"]),
                "photos": photos,
                "illustrationId": module["illustrationId"],
            }
        )
    product.module_detail = {"schemaVersion": 1, "modules": modules}
    product.version += 1
    if workspace:
        from app.source_analysis.workspace import published

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


@public_router.get("/source-media/{photo_id}")
def public_photo(photo_id: str, db: Annotated[Session, Depends(get_db)]):
    photo = db.get(PublicPhoto, photo_id)
    if photo is None:
        raise not_found()
    detail = catalog.product_detail(db, photo.product_id)
    if (
        detail is None
        or not detail.module_detail
        or not any(
            p["uri"] == f"/api/source-media/{photo_id}"
            for m in detail.module_detail["modules"]
            for p in m["photos"]
        )
    ):
        raise not_found()
    return Response(
        Storage().get(photo.storage_key),
        media_type="image/png",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
