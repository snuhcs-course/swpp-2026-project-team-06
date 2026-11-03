"""Explicit, target-bound representative photos; independent of AI placement."""

from copy import deepcopy

from sqlalchemy import select

from app.core.errors import invalid
from app.source_analysis.models import Asset


def photos(db, batch_id, target_id):
    return [
        p
        for p in db.scalars(
            select(Asset)
            .where(
                Asset.batch_id == batch_id, Asset.deleted.is_(False), Asset.original_photo.is_(True)
            )
            .order_by(Asset.created_at, Asset.id)
        )
        if p.mime.startswith("image/") and (p.common or target_id in p.target_ids)
    ]


def selected(db, batch_id, target, *, required=False):
    available = photos(db, batch_id, target["id"])
    # Persisted targets predating representative selection use their first product photo.
    pid = target.get("representativeAssetId", available[0].id if available else None)
    photo = next((p for p in available if p.id == pid), None)
    if required and (photo is None or photo.status != "PREPARED"):
        raise invalid({"representativePhoto": "대표 상품사진을 한 장 이상 올려 주세요."})
    return photo


def reconcile(db, batch):
    db.flush()
    targets = deepcopy(batch.targets)
    for target in targets:
        available = photos(db, batch.id, target["id"])
        if not any(p.id == target.get("representativeAssetId") for p in available):
            target["representativeAssetId"] = available[0].id if available else None
    batch.targets = targets


def choose(db, batch, target_ids, asset_id):
    if (
        not target_ids
        or len(set(target_ids)) != len(target_ids)
        or not set(target_ids) <= {t["id"] for t in batch.targets}
    ):
        raise invalid({"targetIds": "대표사진을 지정할 상품을 확인해 주세요."})
    targets = deepcopy(batch.targets)
    for target in targets:
        if target["id"] in target_ids:
            photo = next((p for p in photos(db, batch.id, target["id"]) if p.id == asset_id), None)
            if photo is None or photo.status != "PREPARED":
                raise invalid(
                    {"assetId": "이 상품에 연결된 준비 완료 상품사진만 지정할 수 있어요."}
                )
            target["representativeAssetId"] = asset_id
    if targets != batch.targets:
        batch.targets = targets
        batch.version += 1
        batch.review_version += 1
