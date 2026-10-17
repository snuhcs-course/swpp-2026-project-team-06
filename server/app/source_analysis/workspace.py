"""Product-bound private page drafts; opening never publishes or invokes AI."""

from copy import deepcopy
from typing import Literal

from pydantic import Field, model_validator
from sqlalchemy import select, text

from app.catalog import service as catalog
from app.core.clock import now
from app.core.detail import DetailContent
from app.core.errors import invalid
from app.source_analysis import service as s
from app.source_analysis.models import Batch, ProductWorkspace, PublicPhoto
from app.source_analysis.schemas import (
    ILLUSTRATIONS,
    MODULE_FIELDS,
    BatchCreate,
    FieldKey,
    Id,
    Input,
    Target,
    Version,
)


class OpenWorkspace(Input):
    product_id: Id | None = None
    discard_changes: bool = False
    version: int | None = Field(default=None, ge=1)


class PageText(Input):
    field_key: FieldKey
    value: str = Field(max_length=3000)


class PagePhoto(Input):
    uri: str = Field(max_length=2000)
    alt: str = Field(max_length=200)


class PageModule(Input):
    enabled: bool = True
    id: str
    texts: list[PageText] = Field(max_length=40)
    photos: list[PagePhoto] = Field(max_length=30)
    illustration_id: str | None = None

    @model_validator(mode="after")
    def known_module(self):
        if self.id not in MODULE_FIELDS or any(
            t.field_key not in MODULE_FIELDS[self.id] for t in self.texts
        ):
            raise ValueError("지원하는 상세 항목을 선택해 주세요")
        if self.illustration_id and self.illustration_id not in ILLUSTRATIONS:
            raise ValueError("지원하는 일러스트를 선택해 주세요")
        return self


class PageSnapshot(Input):
    kind: Literal["modules", "blocks"]
    modules: list[PageModule] = Field(default_factory=list, max_length=18)
    content: DetailContent = Field(default_factory=lambda: DetailContent(blocks=[]))

    @model_validator(mode="after")
    def one_format(self):
        if len({m.id for m in self.modules}) != len(self.modules):
            raise ValueError("상세 항목이 중복됐어요")
        if (self.kind == "modules" and self.content.blocks) or (
            self.kind == "blocks" and self.modules
        ):
            raise ValueError("상세 형식은 하나만 사용해 주세요")
        return self


class PageSave(Version):
    snapshot: PageSnapshot


def published(product):
    if product.module_detail is not None:
        return PageSnapshot(kind="modules", modules=product.module_detail["modules"]).model_dump(
            by_alias=True
        )
    return PageSnapshot(kind="blocks", content=product.detail_content or {"blocks": []}).model_dump(
        by_alias=True
    )


def view(row):
    return {**s.json_row(row), "hasUnpublishedChanges": row.snapshot != row.published_snapshot}


def product_lock(db, farm, pid):
    # Shared lock order with source publication: batch -> product. A transaction advisory
    # lock serializes workspace entry, while batch locks fence source edits/publication.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": "page:" + pid}
    )
    product = catalog.load_my_product(db, farm.id, pid).product
    row = db.get(ProductWorkspace, pid)
    if row:
        db.scalar(
            select(Batch)
            .where(Batch.id == row.batch_id, Batch.farm_id == farm.id)
            .with_for_update()
        )
    product = catalog.load_my_product(db, farm.id, pid, lock=True).product
    if row:
        db.refresh(row)
    return product, row


def open_workspace(db, farm, body):
    if body.product_id:
        product, row = product_lock(db, farm, body.product_id)
        if row:
            current = published(product)
            if body.discard_changes:
                s.version(row.version, body.version)
            if body.discard_changes or (
                row.snapshot == row.published_snapshot
                and product.version != row.base_product_version
            ):
                row.snapshot = deepcopy(current)
                row.published_snapshot = deepcopy(current)
                row.base_product_version = product.version
                row.version += 1
            return view(row)
    else:
        created = catalog.create_product(db, farm, None)
        product = catalog.load_my_product(db, farm.id, created.product_id, lock=True).product
    batch = s.create_batch(
        db,
        farm.id,
        BatchCreate(targets=[Target(name=product.name or "새 상품", product_id=product.id)]),
    )
    snap = published(product)
    row = ProductWorkspace(
        product_id=product.id,
        batch_id=batch["id"],
        target_id=batch["targets"][0]["id"],
        snapshot=deepcopy(snap),
        published_snapshot=deepcopy(snap),
        base_product_version=product.version,
    )
    db.add(row)
    db.flush()
    return view(row)


def owned(db, farm, pid):
    product, row = product_lock(db, farm, pid)
    if row is None:
        raise invalid({"productId": "판매페이지 편집을 먼저 열어 주세요."})
    return product, row


def save(db, farm, pid, body):
    product, row = owned(db, farm, pid)
    s.version(row.version, body.version)
    snapshot = body.snapshot.model_dump(by_alias=True)
    # Only retain photos already belonging to this product; never accept another farm's private URI.
    allowed = set(product.photos)
    allowed.update(
        f"/api/source-media/{p.id}"
        for p in db.scalars(select(PublicPhoto).where(PublicPhoto.product_id == pid))
    )
    base = row.published_snapshot
    allowed.update(p["uri"] for m in base["modules"] for p in m["photos"])
    allowed.update(b["uri"] for b in base["content"]["blocks"] if b["type"] == "image")
    requested = [p["uri"] for m in snapshot["modules"] for p in m["photos"]]
    requested += [b["uri"] for b in snapshot["content"]["blocks"] if b["type"] == "image"]
    if any(uri not in allowed for uri in requested):
        raise invalid({"photos": "현재 상품의 사진만 사용할 수 있어요."})
    if snapshot["kind"] != base["kind"]:
        raise invalid({"kind": "기존 상세 형식을 유지해 주세요."})
    row.snapshot = snapshot
    row.version += 1
    db.flush()
    return view(row)


def apply(db, farm, pid, body):
    product, row = owned(db, farm, pid)
    s.version(row.version, body.version)
    s.version(product.version, row.base_product_version)
    snap = row.snapshot
    if snap["kind"] == "modules":
        product.module_detail = {
            "schemaVersion": 1,
            "modules": [
                {k: v for k, v in m.items() if k != "enabled"}
                for m in deepcopy(snap["modules"])
                if m["enabled"]
            ],
        }
    else:
        product.detail_content = deepcopy(snap["content"])
    product.version += 1
    product.updated_at = now()
    row.base_product_version = product.version
    row.published_snapshot = deepcopy(snap)
    row.version += 1
    db.flush()
    return view(row)
