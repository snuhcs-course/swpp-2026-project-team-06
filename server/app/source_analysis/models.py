"""Private source analysis records. Runtime clocks never use the demo clock."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.ai.source_analysis import PROMPT_VERSION
from app.core.db import Base


def utcnow():
    return datetime.now(UTC)


def new_id():
    return "src_" + uuid4().hex


class Batch(Base):
    __tablename__ = "source_batches"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    targets: Mapped[list] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(default=1)
    review_version: Mapped[int] = mapped_column(default=1)
    deleted: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Asset(Base):
    __tablename__ = "source_assets"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    batch_id: Mapped[str] = mapped_column(ForeignKey("source_batches.id"), index=True)
    checksum: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(300))
    filename: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    target_ids: Mapped[list] = mapped_column(JSON)
    common: Mapped[bool] = mapped_column(default=False)
    original_photo: Mapped[bool] = mapped_column(default=False)
    revision: Mapped[int] = mapped_column(default=1)
    sanitization_version: Mapped[int] = mapped_column(default=0)
    privacy_approved: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(32), default="UPLOADED")
    error: Mapped[str | None] = mapped_column(String(64))
    preprocess_version: Mapped[str | None] = mapped_column(String(40))
    page_count: Mapped[int] = mapped_column(default=0)
    char_count: Mapped[int] = mapped_column(default=0)
    deleted: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Page(Base):
    __tablename__ = "source_pages"
    __table_args__ = (UniqueConstraint("asset_id", "revision", "number"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(ForeignKey("source_assets.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    number: Mapped[int] = mapped_column(Integer)
    spans: Mapped[list] = mapped_column(JSON)
    redacted_spans: Mapped[list] = mapped_column(JSON)
    image_key: Mapped[str | None] = mapped_column(String(300))
    sanitized_key: Mapped[str | None] = mapped_column(String(300))
    redactions: Mapped[list] = mapped_column(JSON, default=list)


class Run(Base):
    __tablename__ = "source_runs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    batch_id: Mapped[str] = mapped_column(ForeignKey("source_batches.id"), index=True)
    mode: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(100))
    visual_pages: Mapped[dict] = mapped_column(JSON, default=dict)
    prompt_version: Mapped[str] = mapped_column(String(30), default=PROMPT_VERSION)
    targets: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Item(Base):
    __tablename__ = "source_items"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("source_runs.id"), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("source_assets.id"))
    revision: Mapped[int] = mapped_column(Integer)
    sanitization_version: Mapped[int] = mapped_column(default=0)
    target_ids: Mapped[list] = mapped_column(JSON)
    phase: Mapped[str] = mapped_column(String(16), default="PREPARE")
    pages: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="QUEUED", index=True)
    attempt: Mapped[int] = mapped_column(default=0)
    lease_token: Mapped[str | None] = mapped_column(String(64))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sent: Mapped[bool] = mapped_column(default=False)
    error: Mapped[str | None] = mapped_column(String(64))
    usage: Mapped[dict] = mapped_column(JSON, default=dict)
    photo_requests: Mapped[list] = mapped_column(JSON, default=list)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    provider_request_id: Mapped[str | None] = mapped_column(String(150))


class Candidate(Base):
    __tablename__ = "source_candidates"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    batch_id: Mapped[str] = mapped_column(ForeignKey("source_batches.id"), index=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("source_items.id"))
    target_id: Mapped[str | None] = mapped_column(String(64))
    field_key: Mapped[str] = mapped_column(String(64))
    value: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list] = mapped_column(JSON)
    historical: Mapped[bool] = mapped_column(default=False)
    outdated: Mapped[bool] = mapped_column(default=False)


class ReviewedField(Base):
    __tablename__ = "source_reviewed_fields"
    __table_args__ = (UniqueConstraint("batch_id", "target_id", "field_key"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    batch_id: Mapped[str] = mapped_column(ForeignKey("source_batches.id"), index=True)
    target_id: Mapped[str] = mapped_column(String(64))
    field_key: Mapped[str] = mapped_column(String(64))
    value: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(20))
    provenance: Mapped[str] = mapped_column(String(20))
    candidate_ids: Mapped[list] = mapped_column(JSON)
    photo_asset_ids: Mapped[list] = mapped_column(JSON, default=list)
    illustration_id: Mapped[str | None] = mapped_column(String(64))


class Draft(Base):
    __tablename__ = "source_drafts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    batch_id: Mapped[str] = mapped_column(ForeignKey("source_batches.id"), index=True)
    target_id: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(default=1)
    snapshot: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RequestRecord(Base):
    __tablename__ = "source_requests"
    __table_args__ = (UniqueConstraint("farm_id", "scope", "key"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"))
    scope: Mapped[str] = mapped_column(String(200))
    key: Mapped[str] = mapped_column(String(128))
    digest: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)


class PublicPhoto(Base):
    __tablename__ = "source_public_photos"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    storage_key: Mapped[str] = mapped_column(String(300))


class Spend(Base):
    # No FK to jobs: deleting source material must never erase the cost ledger.
    __tablename__ = "source_spend"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    reserved_micros: Mapped[int] = mapped_column(Integer)
    charged_micros: Mapped[int | None] = mapped_column(Integer)
    evaluation: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProductWorkspace(Base):
    __tablename__ = "source_product_workspaces"
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("source_batches.id"), unique=True)
    target_id: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSON)
    published_snapshot: Mapped[dict] = mapped_column(JSON)
    base_product_version: Mapped[int] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer, default=1)
