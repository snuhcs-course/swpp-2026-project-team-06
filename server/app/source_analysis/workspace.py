"""Product-bound private page drafts; opening never publishes or invokes AI."""

import hashlib
import json
import mimetypes
from copy import deepcopy
from pathlib import PurePosixPath
from typing import Literal

from pydantic import Field, model_validator
from sqlalchemy import delete, select, text

from app.catalog import service as catalog
from app.catalog.models import Product
from app.core.clock import now
from app.core.detail import DetailContent
from app.core.errors import invalid, not_found
from app.source_analysis import service as s
from app.source_analysis.models import (
    Asset,
    Batch,
    Draft,
    ProductWorkspace,
    PublicPhoto,
    ReviewedField,
    Run,
)
from app.source_analysis.schemas import (
    ILLUSTRATIONS,
    MODULE_FIELDS,
    BatchCreate,
    DraftSave,
    DraftTarget,
    FieldKey,
    Id,
    Input,
    SectionId,
    Target,
    Version,
    hidden_modules,
)


class OpenWorkspace(Input):
    product_id: Id | None = None
    discard_changes: bool = False
    version: int | None = Field(default=None, ge=1)
    # DEV-346: the caller opens the page in the composer. Opt-in so the legacy editor
    # (and older apps) never trigger the page migration below.
    composer: bool = False
    source_copy_enabled: bool = False


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
    source_review_version: int | None = Field(
        default=None, ge=1, exclude_if=lambda value: value is None
    )
    representative_uri: str | None = Field(max_length=2000)
    hidden_section_ids: list[SectionId] = Field(default_factory=list, max_length=9)
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
        return PageSnapshot(
            kind="modules",
            modules=product.module_detail["modules"],
            representative_uri=product.photos[0] if product.photos else None,
        ).model_dump(by_alias=True)
    return PageSnapshot(
        kind="blocks",
        content=product.detail_content or {"blocks": []},
        representative_uri=product.photos[0] if product.photos else None,
    ).model_dump(by_alias=True)


def view(row):
    return {
        # internal DEV-346 bookkeeping; the DEV-361 product draft has its own view
        **s.json_row(row, ("page_source", "page_draft_id", "product_draft")),
        "hasUnpublishedChanges": row.snapshot != row.published_snapshot,
        "hasProductDraft": bool(row.product_draft),
    }


def product_lock(db, farm, pid):
    # Shared lock order with source publication: batch -> product. A transaction advisory
    # lock serializes workspace entry, while batch locks fence source edits/publication.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": "page:" + pid}
    )
    # Ownership only (a column): the product and its options/stages are first read under the lock
    # below, so nothing committed while waiting is seen stale (DEV-361).
    if db.scalar(select(Product.farm_id).where(Product.id == pid)) != farm.id:
        raise not_found("찾을 수 없는 상품이에요.")
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
            return composer_view(db, product, row) if body.composer else view(row)
    else:
        created = catalog.create_product(db, farm, None)
        product = catalog.load_my_product(db, farm.id, created.product_id, lock=True).product
    batch = s.create_batch(
        db,
        farm.id,
        BatchCreate(
            targets=[Target(name=product.name or "새 상품", product_id=product.id)],
            source_copy_enabled=body.source_copy_enabled,
        ),
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
    return composer_view(db, product, row) if body.composer else view(row)


# --- DEV-346: open every product page in the composer -------------------------------------
# The composer edits a batch draft; applying it replaces the whole product page. A page made or
# changed outside the composer (seed, manual entry, the legacy editor, before the composer) is
# turned into a batch draft from its current content before the composer opens it. Photos are
# referenced as they are (any URI the product page already uses), never copied or re-encoded,
# so applying the untouched draft leaves the public page with the same text and photos.
SUMMARY_LIMIT = 3000
SOURCE_LIMIT = 30  # batch-wide source cap, as for uploads (service.upload)


def has_page(snapshot, product):
    return bool(
        snapshot["modules"]
        or snapshot["content"]["blocks"]
        or snapshot.get("representativeUri")
        or product.photos
        or (product.description or "").strip()
    )


def page_source(product):
    """Fingerprint of the buyer-visible story; recorded when the composer draft matches it."""
    if product.module_detail is not None:
        story = {"modules": product.module_detail.get("modules", [])}
    elif product.detail_content and product.detail_content.get("blocks"):
        story = {"blocks": product.detail_content["blocks"]}
    else:
        story = {"description": (product.description or "").strip()}
    data = json.dumps(story, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(data).hexdigest()


def same_story(draft, product):
    """Whether the composer draft's text is what the product page shows (photo URIs differ)."""
    if product.module_detail is None:
        return False

    def texts(modules):
        return sorted((m["id"], [(t["fieldKey"], t["value"]) for t in m["texts"]]) for m in modules)

    return texts(draft.snapshot["previewModules"]) == texts(product.module_detail["modules"])


def matching_draft(db, batch, row, product):
    """The newest draft of this product whose text is what the page shows, if any."""
    drafts = db.scalars(
        select(Draft)
        .where(Draft.batch_id == batch.id, Draft.target_id == row.target_id)
        .order_by(Draft.created_at.desc(), Draft.id.desc())
    )
    return next((d for d in drafts if same_story(d, product)), None)


def fresh_batch(db, product, row):
    """A deleted workspace batch is replaced, never written to."""
    previous = db.get(Batch, row.batch_id)
    created = s.create_batch(
        db,
        product.farm_id,
        BatchCreate(
            targets=[Target(name=product.name or "새 상품", product_id=product.id)],
            source_copy_enabled=bool(previous and previous.source_copy_enabled),
        ),
    )
    row.batch_id, row.target_id = created["id"], created["targets"][0]["id"]
    row.page_source = row.page_draft_id = None
    db.flush()
    return db.get(Batch, row.batch_id)


def refresh_basic_info(db, batch, row, product):
    """Variety and Brix of a buyer-visible product follow the product (DEV-346, 11/17 PM).

    The composer locks these fields for such products (edited only in SCR-25), so the batch's
    analysis inputs simply mirror the product. Before sale (DRAFT/REJECTED) the batch is the
    source of truth (the composer saves it first and writes the product on save), untouched.
    Size has no product input besides the composer and stays as it is.
    """
    if product.status in ("DRAFT", "REJECTED") or db.scalar(
        select(Run.id).where(Run.batch_id == batch.id, Run.status.in_(s.ACTIVE))
    ):
        return
    targets = deepcopy(batch.targets)
    target = next((t for t in targets if t["id"] == row.target_id), None)
    if target is None:
        return
    info = dict(target.get("basicInfo") or {"variety": "", "size": "", "expectedBrix": None})
    product_info = {"variety": (product.variety or "")[:100], "expectedBrix": product.expected_brix}
    if all(info.get(k) == v for k, v in product_info.items()):
        return
    target["basicInfo"] = {**info, **product_info}
    # Same as a basic-info save: regenerate only untouched suggestions built from basic info.
    for field in db.scalars(
        select(ReviewedField).where(
            ReviewedField.batch_id == batch.id,
            ReviewedField.target_id == row.target_id,
            ReviewedField.field_key.in_(["specification", "qualityEvidence"]),
            ReviewedField.state == "UNREVIEWED",
            ReviewedField.provenance == "PRODUCER",
        )
    ):
        if not field.candidate_ids:
            field.value = ""
    batch.targets = targets
    batch.version += 1
    batch.review_version += 1


def page_photo_uris(snapshot):
    uris = [p["uri"] for m in snapshot["modules"] for p in m["photos"]]
    return uris + [b["uri"] for b in snapshot["content"]["blocks"] if b["type"] == "image"]


def allowed_photo_uris(db, product):
    """Photos a legacy-editor save would accept now (workspace.save's allow-set)."""
    allowed = set(product.photos)
    allowed.update(
        f"/api/source-media/{p.id}"
        for p in db.scalars(select(PublicPhoto).where(PublicPhoto.product_id == product.id))
    )
    allowed.update(page_photo_uris(published(product)))
    return allowed


def active_run(db, batch):
    return bool(
        db.scalar(select(Run.id).where(Run.batch_id == batch.id, Run.status.in_(s.ACTIVE)).limit(1))
    )


def draft_content(draft):
    snap = draft.snapshot
    return (
        snap.get("previewModules"),
        [m["id"] for m in snap.get("modules", []) if m.get("enabled")],
        snap.get("representativeAssetId"),
        snap.get("hiddenSectionIds"),
    )


def newer_composer_draft(db, batch, row, product, latest):
    """A draft saved after the one the page last matched, with different content.

    Re-saving the same content (a refreshed version) is not composer work.
    """
    matched = db.get(Draft, row.page_draft_id) if row.page_draft_id else None
    if matched is None and row.page_draft_id is None:
        # pre-DEV-346 workspace: the applied draft is the one whose text the page shows
        matched = matching_draft(db, batch, row, product)
    if matched is None:
        return True  # nothing known to match: treat the drafts as composer work
    return latest.id != matched.id and draft_content(latest) != draft_content(matched)


def cancel_active_runs(db, batch):
    """Cancel analyses before the page replaces the composer values (True if any ran)."""
    runs = list(db.scalars(select(Run).where(Run.batch_id == batch.id, Run.status.in_(s.ACTIVE))))
    for run in runs:
        s.cancel(db, run)
    db.flush()
    return bool(runs)


def composer_work(db, batch, row, latest, product):
    """Unapplied composer work a page migration would replace (ReviewedField is rewritten)."""
    if active_run(db, batch):
        return True
    if latest is not None:
        return newer_composer_draft(db, batch, row, product, latest)
    return bool(
        db.scalar(
            select(ReviewedField.id)
            .where(ReviewedField.batch_id == batch.id, ReviewedField.target_id == row.target_id)
            .limit(1)
        )
    )


def retire_unused_references(db, batch):
    """Referenced page photos nothing points to any more leave the attachment list and cap."""
    used = {t.get("representativeAssetId") for t in batch.targets}
    for field in db.scalars(select(ReviewedField).where(ReviewedField.batch_id == batch.id)):
        used.update(field.photo_asset_ids)
    for asset in db.scalars(
        select(Asset).where(Asset.batch_id == batch.id, Asset.deleted.is_(False))
    ):
        if asset.product_photo and asset.id not in used:
            asset.deleted = True


def story_kind(product):
    if product.module_detail is not None:
        return "modules"
    return "blocks" if product.detail_content and product.detail_content.get("blocks") else "text"


def composer_view(db, product, row):
    batch = db.scalar(select(Batch).where(Batch.id == row.batch_id).with_for_update())
    if batch.deleted:
        batch = fresh_batch(db, product, row)
    if not any(t["id"] == row.target_id for t in batch.targets):
        return {**view(row), "composer": False}  # unexpected old data: keep the legacy editor
    refresh_basic_info(db, batch, row, product)
    latest = db.scalar(
        select(Draft)
        .where(Draft.batch_id == batch.id, Draft.target_id == row.target_id)
        .order_by(Draft.created_at.desc(), Draft.id.desc())
        .limit(1)
    )
    current = page_source(product)
    blocked = notice = None

    def move(cover=KEEP, before_write=None):
        return migrate(db, product, row, batch, cover=cover, before_write=before_write)

    def replace_with_page():
        """The page changed elsewhere: migrate it; a running analysis is cancelled only once the
        page is known to fit (an over-limit page keeps it and opens the legacy editor)."""
        if len(batch.targets) > 1 and active_run(db, batch):
            return False, False  # an analysis for other products too: legacy editor, no cancel
        cancelled = []

        def cancel():
            if cancel_active_runs(db, batch):
                cancelled.append(True)
                refresh_basic_info(db, batch, row, product)  # skipped above while it was running

        return move(before_write=cancel), bool(cancelled)

    if row.snapshot != row.published_snapshot:
        # An unapplied legacy-editor revision: move it in (composer apply is then not refused
        # with PAGE_DRAFT_EXISTS) only when no composer work would be replaced. Otherwise the
        # legacy editor opens so the producer applies or discards that revision there first.
        if composer_work(db, batch, row, latest, product):
            ready, blocked = False, "LEGACY_REVISION"
        elif row.base_product_version == product.version:
            ready = move()
        elif row.snapshot.get("representativeUri") == row.published_snapshot.get(
            "representativeUri"
        ):
            # The product moved on since the revision (its old cover is stale): keep the
            # revision's story with the product's current cover, if its photos are still ones
            # the legacy editor would accept now.
            allowed = allowed_photo_uris(db, product)
            if all(uri in allowed for uri in page_photo_uris(row.snapshot)):
                ready = move(cover=product.photos[0] if product.photos else None)
            else:
                ready = False
        else:
            ready = False  # the legacy editor shows its own version conflict for this revision
    elif latest is None:
        if not has_page(row.snapshot, product):
            ready = True  # nothing to lose: a new or still-empty product
        elif any(
            db.scalar(q.limit(1))
            for q in (
                select(ReviewedField.id).where(
                    ReviewedField.batch_id == batch.id, ReviewedField.target_id == row.target_id
                ),
                # an analysis in progress; finished or cancelled runs leave no composer state
                select(Run.id).where(Run.batch_id == batch.id, Run.status.in_(s.ACTIVE)),
            )
        ):
            # Half-used batch without a draft: the composer could not show the page. Before sale
            # it opens only for a description/photo page: a composer apply then shows its draft
            # instead of the description (module_detail wins on the buyer page) but the product
            # still keeps those fields. A module/block page would be overwritten: legacy editor.
            ready = product.status in ("DRAFT", "REJECTED") and story_kind(product) == "text"
        else:
            ready = move()
    elif row.page_source == current:
        ready = True  # the page has not changed outside the composer since the draft matched it
    elif (
        row.page_source is not None
        and story_kind(product) == "text"
        and (active_run(db, batch) or newer_composer_draft(db, batch, row, product, latest))
    ):
        # Only the description changed (SCR-25) while composer work is saved or an analysis is
        # running: the composer draft replaces the description story on apply anyway, so it is
        # kept and the analysis goes on.
        ready = True
    elif row.page_source is not None:
        # Changed outside the composer: the page wins. A running analysis is cancelled first.
        replaced = newer_composer_draft(db, batch, row, product, latest)
        ready, cancelled = replace_with_page()
        if ready and (replaced or cancelled):
            notice = "PAGE_AND_AI_REPLACED" if cancelled else "PAGE_REPLACED"
    elif not has_page(row.snapshot, product):
        ready = True  # composer-made product not applied yet
    elif matched := matching_draft(db, batch, row, product):
        # The page came from a composer draft; any later draft is newer private composer work.
        row.page_source, row.page_draft_id = current, matched.id
        ready = True
    elif product.status in ("DRAFT", "REJECTED") and story_kind(product) == "text":
        # Pre-DEV-346 draft and a description/photo page buyers do not see: the composer draft
        # (the producer's work) is kept. A later composer apply shows the draft instead of the
        # description (module_detail wins on the buyer page); the product keeps those fields.
        ready = True
    else:
        # Buyers see a page the draft does not match (e.g. applied with the legacy editor):
        # the buyer-visible page wins; the older drafts stay in the batch history. Whether those
        # drafts were unapplied work cannot be told here, so only a cancelled analysis is noted.
        ready, cancelled = replace_with_page()
        if ready and cancelled:
            notice = "PAGE_AND_AI_REPLACED"
    db.flush()
    result = {**view(row), "composer": ready}
    if blocked:
        result["composerBlocked"] = blocked  # the legacy editor warns before applying there
    if notice:
        result["composerNotice"] = notice  # the composer says earlier saved work was replaced
    return result


def page_parts(snapshot, product):
    """(fields {fieldKey: {value, photos, illustrationId}}, enabled module ids) or None."""
    fields, enabled = {}, []
    if snapshot["kind"] == "modules":
        for module in snapshot["modules"]:
            keys = MODULE_FIELDS[module["id"]]
            for key in keys:
                texts = [
                    t["value"].strip()
                    for t in module["texts"]
                    if t["fieldKey"] == key and t["value"].strip()
                ]
                fields[key] = {"value": "\n\n".join(texts), "photos": [], "illustrationId": None}
            # Photos and illustration belong to the module's photo field (hero) or its only field.
            holder = fields["hero" if module["id"] == "hero" else keys[0]]
            holder["photos"] = list(module["photos"])
            holder["illustrationId"] = module.get("illustrationId")
            if module.get("enabled", True):
                enabled.append(module["id"])
    else:
        # Blocks (legacy free-form page, or the description fallback the buyer page shows) become
        # one summary: text blocks in order ("title\nbody", blank line between), then all images.
        blocks = snapshot["content"]["blocks"]
        texts = [
            "\n".join(x for x in (b["title"].strip(), b["body"].strip()) if x)
            for b in blocks
            if b["type"] == "text"
        ]
        if not blocks and (product.description or "").strip():
            texts = [product.description.strip()]
        texts = [t for t in texts if t]
        images = [{"uri": b["uri"], "alt": b["alt"]} for b in blocks if b["type"] == "image"]
        if texts or images:
            fields["summary"] = {
                "value": "\n\n".join(texts),
                "photos": images,
                "illustrationId": None,
            }
            enabled.append("summary")
    if (
        not enabled
        and not snapshot["modules"]  # a page whose modules are all switched off is not photo-only
        and snapshot.get("representativeUri")
        and (product.name or "").strip()
    ):
        # Photo-only page: the title module makes the draft applicable (an empty draft is not).
        if not fields.get("name", {}).get("value"):
            fields.setdefault("name", {"photos": [], "illustrationId": None})
            fields["name"]["value"] = product.name.strip()
        enabled.append("hero")
    if any(len(f["value"]) > SUMMARY_LIMIT or len(f["photos"]) > 30 for f in fields.values()):
        return None  # does not fit the composer's fields; never cut content
    return fields, enabled


KEEP = object()  # migrate(cover=KEEP): use the snapshot's own representative


def migrate(db, product, row, batch, cover=KEEP, before_write=None):
    """Replace the target's composer values with the page and save one draft (or False).

    `cover` replaces the snapshot's representative (a stale legacy revision's old cover);
    None means the product has no photo now.
    """
    snapshot = row.snapshot  # an unapplied legacy-editor revision is the producer's latest page
    if cover is not KEEP:
        snapshot = {**snapshot, "representativeUri": cover}
    parts = page_parts(snapshot, product)
    if parts is None:
        return False
    fields, enabled = parts

    live = list(
        db.scalars(select(Asset).where(Asset.batch_id == batch.id, Asset.deleted.is_(False)))
    )
    assets = {a.product_photo["uri"]: a.id for a in live if a.product_photo}
    representative = snapshot.get("representativeUri")
    wanted = list(
        dict.fromkeys(
            ([representative] if representative else [])
            + [p["uri"] for f in fields.values() for p in f["photos"]]
        )
    )
    # Earlier references the page no longer uses are retired below, so they do not count.
    if len([a for a in live if not a.product_photo]) + len(wanted) > SOURCE_LIMIT:
        return False  # the batch could not hold these photos; never drop any
    if before_write:
        before_write()  # the page fits: e.g. cancel a running analysis before replacing values

    def ref(photo):
        if photo["uri"] not in assets:
            assets[photo["uri"]] = reference(db, batch, row, photo).id
        return assets[photo["uri"]]

    if representative:
        # Prefer the page's own alt text when the cover is also a story photo.
        alts = {p["uri"]: p.get("alt") for f in fields.values() for p in f["photos"]}
        ref({"uri": representative, "alt": alts.get(representative) or "대표 상품사진"})
    # Earlier values for this product (a stale draft's fields) give way to the page.
    db.execute(
        delete(ReviewedField).where(
            ReviewedField.batch_id == batch.id, ReviewedField.target_id == row.target_id
        )
    )
    for key, f in fields.items():
        ids = [ref(p) for p in f["photos"]]
        if not (f["value"] or ids or f["illustrationId"]):
            continue
        db.add(
            ReviewedField(
                batch_id=batch.id,
                target_id=row.target_id,
                field_key=key,
                value=f["value"],
                state="CONFIRMED",
                provenance="PRODUCER",
                candidate_ids=[],
                photo_asset_ids=list(dict.fromkeys(ids)),
                illustration_id=f["illustrationId"],
            )
        )
    targets = deepcopy(batch.targets)
    for target in targets:
        if target["id"] != row.target_id:
            continue
        old = db.get(Asset, target.get("representativeAssetId") or "")
        if old is not None and not old.deleted and not old.product_photo:
            continue  # a cover uploaded in the composer is composer work: it stays
        if representative:
            target["representativeAssetId"] = assets[representative]
        elif old is not None:
            # No cover on the page: an earlier referenced cover goes.
            target["representativeAssetId"] = None
    batch.targets = targets
    batch.version += 1
    batch.review_version += 1
    db.flush()
    retire_unused_references(db, batch)
    saved = s.save_drafts(
        db,
        batch,
        DraftSave(
            review_version=batch.review_version,
            targets=[
                DraftTarget(
                    target_id=row.target_id,
                    enabled_module_ids=enabled,
                    hidden_section_ids=snapshot.get("hiddenSectionIds", []),
                )
            ],
        ),
        editor=True,
        migrated=True,
    )
    if row.snapshot != row.published_snapshot:
        # The revision now lives in the composer draft; clear it so composer apply is allowed.
        row.snapshot = deepcopy(row.published_snapshot)
        row.version += 1
    row.page_source, row.page_draft_id = page_source(product), saved["drafts"][0]["id"]
    db.flush()
    return True


def reference(db, batch, row, photo):
    """A byte-less photo source pointing at a URI the product page already uses."""
    from app.source_analysis.preprocess import PREPROCESS_VERSION

    uri = photo["uri"]
    mime = mimetypes.guess_type(uri.split("?")[0])[0] or ""
    asset = Asset(
        batch_id=batch.id,
        checksum=hashlib.sha256(uri.encode()).hexdigest(),
        storage_key="",
        filename=(PurePosixPath(uri.split("?")[0]).name or "photo")[:200],
        mime=mime if mime.startswith("image/") else "image/jpeg",
        size=0,
        target_ids=[row.target_id],
        original_photo=True,
        status="PREPARED",
        page_count=1,
        sanitization_version=1,
        privacy_approved=True,
        preprocess_version=PREPROCESS_VERSION,
        product_photo={"uri": uri, "alt": photo.get("alt") or ""},
    )
    db.add(asset)
    db.flush()
    return asset


def owned(db, farm, pid):
    product, row = product_lock(db, farm, pid)
    if row is None:
        raise invalid({"productId": "판매페이지 편집을 먼저 열어 주세요."})
    return product, row


def save(db, farm, pid, body):
    product, row = owned(db, farm, pid)
    s.version(row.version, body.version)
    snapshot = body.snapshot.model_dump(by_alias=True, exclude={"source_review_version"})
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
    if snapshot.get("representativeUri"):
        requested.append(snapshot["representativeUri"])
    if any(uri not in allowed for uri in requested):
        raise invalid({"photos": "현재 상품의 사진만 사용할 수 있어요."})
    if snapshot["kind"] != base["kind"]:
        raise invalid({"kind": "기존 상세 형식을 유지해 주세요."})
    batch = db.get(Batch, row.batch_id)
    if batch and batch.source_copy_enabled:
        snapshot["sourceReviewVersion"] = batch.review_version
    row.snapshot = snapshot
    row.version += 1
    db.flush()
    return view(row)


def apply(db, farm, pid, body):
    product, row = owned(db, farm, pid)
    s.version(row.version, body.version)
    s.version(product.version, row.base_product_version)
    snap = row.snapshot
    from app.source_analysis.source_copy_service import validate_publication

    batch = db.get(Batch, row.batch_id)
    if batch:
        from app.source_analysis.processing import require_complete

        require_complete(db, batch, row.target_id)
    if batch and batch.source_copy_enabled:
        if snap.get("sourceReviewVersion") != batch.review_version:
            from app.core.errors import conflict

            raise conflict(
                "SOURCE_REVIEW_CHANGED",
                "원문 검토가 바뀌었어요. 수정본을 다시 확인하고 저장해 주세요.",
            )
        target = next(t for t in batch.targets if t["id"] == row.target_id)
        values = (
            [t["value"] for m in snap["modules"] for t in m["texts"]]
            if snap["kind"] == "modules"
            else [
                b.get(key, "")
                for b in snap["content"]["blocks"]
                for key in ("title", "body", "alt")
            ]
        )
        validate_publication(db, batch, target["id"], values)
    representative = snap["representativeUri"]
    if not representative:
        raise invalid({"representativePhoto": "대표 상품사진을 한 장 이상 지정해 주세요."})
    product.photos = [representative, *[p for p in product.photos if p != representative]]
    if snap["kind"] == "modules":
        product.module_detail = {
            "schemaVersion": 1,
            "modules": [
                {k: v for k, v in m.items() if k != "enabled"}
                for m in deepcopy(snap["modules"])
                if m["enabled"]
                and m["id"] not in hidden_modules(snap["hiddenSectionIds"])
                and (
                    any(t["value"].strip() for t in m["texts"])
                    or m["photos"]
                    or m.get("illustrationId")
                )
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
