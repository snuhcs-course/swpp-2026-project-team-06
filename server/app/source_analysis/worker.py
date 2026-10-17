"""Durable PostgreSQL worker: python -m app.source_analysis.worker [--once]."""

import base64
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import timedelta
from threading import Event, Thread

from sqlalchemy import delete, select

from app.accounts import models as _account_models  # noqa: F401
from app.ai.source_analysis import PROMPT_VERSION, ExtractionError, extract
from app.ai.source_ocr import OCR_MAX_TOKENS, OCR_MODEL, OCR_PROMPT, crops, transcribe
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.farms import models as _farm_models  # noqa: F401
from app.source_analysis.models import (
    Asset,
    Batch,
    Candidate,
    Draft,
    Item,
    Page,
    PublicPhoto,
    ReviewedField,
    Run,
    new_id,
    utcnow,
)
from app.source_analysis.preprocess import (
    PREPROCESS_VERSION,
    PreparationError,
    prepare,
    scrub,
)
from app.source_analysis.service import refresh_runs
from app.source_analysis.storage import Storage


def claim():
    with get_sessionmaker()() as db:
        # All transaction paths lock batch before item. SKIP LOCKED avoids convoying.
        ids = list(
            db.execute(
                select(Item.id, Run.batch_id)
                .join(Run, Run.id == Item.run_id)
                .join(Batch, Batch.id == Run.batch_id)
                .where(
                    Batch.deleted.is_(False),
                    Run.status.in_(["QUEUED", "PREPARING", "ANALYZING", "PRIVACY_REVIEW"]),
                    ((Item.status == "QUEUED") & (Item.available_at <= utcnow()))
                    | ((Item.status == "RUNNING") & (Item.lease_until < utcnow())),
                )
                .order_by(Item.available_at)
                .limit(20)
            )
        )
        for item_id, batch_id in ids:
            batch = db.scalar(
                select(Batch)
                .where(Batch.id == batch_id)
                .with_for_update(skip_locked=True)
                .execution_options(populate_existing=True)
            )
            if batch is None:
                db.rollback()
                continue
            item = db.scalar(
                select(Item)
                .where(Item.id == item_id)
                .with_for_update(skip_locked=True)
                .execution_options(populate_existing=True)
            )
            if item is None or item.status not in ("QUEUED", "RUNNING"):
                db.rollback()
                continue
            if item.status == "RUNNING" and item.lease_until >= utcnow():
                db.rollback()
                continue
            if item.status == "RUNNING" and item.sent:
                item.status, item.error = "FAILED", "REQUEST_UNCERTAIN"
                item.lease_token = None
                refresh_runs(db, batch.id)
                db.commit()
                continue
            item.status, item.lease_token = "RUNNING", new_id()
            item.lease_until = utcnow() + timedelta(seconds=180)
            item.attempt += 1
            refresh_runs(db, batch.id)
            db.commit()
            return item.id, item.lease_token
    return None


@contextmanager
def heartbeat(item_id, token):
    stop = Event()

    def beat():
        while not stop.wait(30):
            try:
                with get_sessionmaker()() as db:
                    item = db.scalar(
                        select(Item)
                        .where(
                            Item.id == item_id, Item.lease_token == token, Item.status == "RUNNING"
                        )
                        .with_for_update()
                    )
                    if item:
                        item.lease_until = utcnow() + timedelta(seconds=180)
                        db.commit()
            except Exception:
                # Lease expiry fences this worker if DB is unavailable.
                return

    thread = Thread(target=beat, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=2)


def lock_context(db, item_id, token):
    item = db.get(Item, item_id)
    if item is None:
        return None
    run = db.get(Run, item.run_id)
    batch = db.scalar(
        select(Batch)
        .where(Batch.id == run.batch_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    item = db.scalar(
        select(Item)
        .where(Item.id == item_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    source = db.get(Asset, item.asset_id, populate_existing=True)
    if (
        batch.deleted
        or source.deleted
        or item.lease_token != token
        or (item.status != "RUNNING")
        or source.revision != item.revision
    ):
        return None
    return batch, source, run, item


def enqueue_extraction(db, source, run, item, pages):
    if source.original_photo:
        item.status = "SUCCEEDED"
        return
    # One page per chunk is within the maximum-four-pages contract. Split long text.
    prior_runs = list(
        db.scalars(
            select(Run).where(
                Run.batch_id == run.batch_id,
                Run.id != run.id,
                Run.mode == run.mode,
                Run.model == run.model,
                Run.prompt_version == run.prompt_version,
            )
        )
    )
    prior_ids = [
        r.id
        for r in prior_runs
        if r.targets == run.targets
        and r.visual_pages.get(source.id, []) == run.visual_pages.get(source.id, [])
    ]
    previous = list(
        db.scalars(
            select(Item).where(
                Item.run_id.in_(prior_ids),
                Item.asset_id == source.id,
                Item.revision == source.revision,
                Item.sanitization_version == source.sanitization_version,
                Item.phase == "EXTRACT",
            )
        )
    )
    for page in pages:
        spans = page.redacted_spans
        groups, group, size = [], [], 0
        for span in spans:
            length = len(span["text"])
            if size + length > 20_000 and group:
                groups.append(group)
                group, size = [], 0
            group.append(span["id"])
            size += length
        groups.append(group)
        if run.mode == "openrouter" and page.sanitized_key:
            groups = [[s["id"] for s in spans]]
        for group in groups:
            requested = [{"number": page.number, "spanIds": group}]
            if any(
                old.status == "SUCCEEDED"
                and [{"number": p["number"], "spanIds": p["spanIds"]} for p in old.pages]
                == requested
                and old.target_ids == item.target_ids
                for old in previous
            ):
                continue
            db.add(
                Item(
                    run_id=run.id,
                    asset_id=source.id,
                    revision=source.revision,
                    target_ids=item.target_ids,
                    phase="EXTRACT",
                    pages=[{"number": page.number, "spanIds": group}],
                    sanitization_version=source.sanitization_version,
                    status="QUEUED"
                    if run.mode == "mock" or source.privacy_approved
                    else "PRIVACY_REVIEW",
                )
            )
    item.status = "SUCCEEDED"


def canonical_quote(quote, source):
    """Recover exact source offsets when only whitespace layout differs."""
    if not quote.strip():
        return None
    if quote in source:
        return quote
    tokens = list(re.finditer(r"\s+|\S", source))
    normalized = "".join(" " if t.group().isspace() else t.group() for t in tokens)
    wanted = re.sub(r"\s+", " ", quote).strip()
    start = normalized.find(wanted)
    if start < 0:
        return None
    return source[tokens[start].start() : tokens[start + len(wanted) - 1].end()]


def validate(extraction, chunk, allowed_targets):
    span_map = {(p["number"], s["id"]): s["text"] for p in chunk["pages"] for s in p["spans"]}
    for candidate_index, candidate in enumerate(extraction.candidates):
        quotes = "\n".join(e.quote for e in candidate.evidence)

        def numbers(value):
            return set(re.findall(r"\d+(?:[,.]\d+)*", value))

        if numbers(candidate.value) - numbers(quotes):
            raise ExtractionError("UNSUPPORTED_NUMBER")
        if (
            candidate.field_key == "pieceCount"
            and numbers(candidate.value)
            and not re.search(r"\d+(?:\s*[~–-]\s*\d+)?\s*(?:개|과|알)", quotes)
        ):
            raise ExtractionError("UNSUPPORTED_PIECE_COUNT")
        for claim in ("무농약", "유기농", "GAP", "HACCP", "친환경", "인증", "실측"):
            if claim in candidate.value and claim not in quotes:
                raise ExtractionError("UNSUPPORTED_CLAIM")
        if candidate.target_id is not None and candidate.target_id not in allowed_targets:
            raise ExtractionError("INVALID_TARGET")
        if len(allowed_targets) != 1:
            candidate.target_id = None
        if scrub(candidate.value) != candidate.value:
            raise ExtractionError("UNSUPPORTED_PRIVATE_VALUE")
        if candidate.historical and candidate.field_key != "historicalSales":
            raise ExtractionError("HISTORICAL_FIELD")
        for evidence in candidate.evidence:
            if evidence.source_id != chunk["sourceId"] or (
                evidence.source_revision != chunk["sourceRevision"]
            ):
                raise ExtractionError(
                    "INVALID_EVIDENCE",
                    details={"candidate": candidate_index, "reason": "SOURCE_REVISION"},
                )
            if any((evidence.page, sid) not in span_map for sid in evidence.span_ids):
                raise ExtractionError(
                    "INVALID_EVIDENCE",
                    details={"candidate": candidate_index, "reason": "UNKNOWN_SPAN"},
                )
            quoted = "\n".join(span_map[(evidence.page, sid)] for sid in evidence.span_ids)
            exact = canonical_quote(evidence.quote, quoted)
            if exact is None or "[가림]" in exact:
                raise ExtractionError(
                    "INVALID_EVIDENCE",
                    details={"candidate": candidate_index, "reason": "QUOTE_NOT_VERBATIM"},
                )
            evidence.quote = exact
    return extraction


def validate_candidates(extraction, chunk, allowed_targets):
    """Keep strict per-candidate checks; a bad quote cannot discard unrelated facts."""
    accepted, rejected = [], []
    for index, candidate in enumerate(extraction.candidates):
        single = extraction.model_copy(
            update={"candidates": [candidate.model_copy(deep=True)]}
        )
        try:
            validate(single, chunk, allowed_targets)
        except ExtractionError as exc:
            rejected.append(
                {
                    "index": index,
                    "code": exc.code,
                    "reason": exc.details.get("reason"),
                    "candidate": candidate.model_dump(by_alias=True),
                }
            )
        else:
            accepted.extend(single.candidates)
    return extraction.model_copy(update={"candidates": accepted}), {
        "acceptedCount": len(accepted),
        "rejectedCount": len(rejected),
        "rejected": rejected,
    }


def store_candidates(db, batch, item, extraction):
    """Replace the same chunk's automatic suggestions without invalidating confirmed edits."""

    def scope(pages):
        return [(p["number"], p["spanIds"]) for p in pages]

    previous = list(
        db.scalars(
            select(Item).where(
                Item.asset_id == item.asset_id,
                Item.id != item.id,
                Item.phase == "EXTRACT",
                Item.revision == item.revision,
                Item.sanitization_version == item.sanitization_version,
            )
        )
    )
    prior_ids = [
        i.id
        for i in previous
        if i.target_ids == item.target_ids and scope(i.pages) == scope(item.pages)
    ]
    old = list(
        db.scalars(
            select(Candidate).where(
                Candidate.item_id.in_(prior_ids),
                Candidate.outdated.is_(False),
            )
        )
    )
    confirmed = {
        cid
        for field in db.scalars(
            select(ReviewedField).where(
                ReviewedField.batch_id == batch.id,
                ReviewedField.state == "CONFIRMED",
            )
        )
        for cid in field.candidate_ids
    }
    retained = set()
    for value in extraction.candidates:
        evidence = [e.model_dump(by_alias=True) for e in value.evidence]
        same = next(
            (
                c
                for c in old
                if c.target_id == value.target_id
                and c.field_key == value.field_key
                and c.value == value.value
                and c.historical == value.historical
                and c.evidence == evidence
            ),
            None,
        )
        if same:
            retained.add(same.id)
        else:
            db.add(
                Candidate(
                    batch_id=batch.id,
                    item_id=item.id,
                    target_id=value.target_id,
                    field_key=value.field_key,
                    value=value.value,
                    historical=value.historical,
                    evidence=evidence,
                )
            )
    for candidate in old:
        if candidate.id not in retained | confirmed:
            candidate.outdated = True


def paid_vision_call(item_id, token, stage, model, chunk, targets, images, fn, output_tokens=None):
    """Fence every individual request, reserve before sending, settle even after cancellation."""
    from app.source_analysis.budget import reserve, settle

    with get_sessionmaker()() as db:
        context = lock_context(db, item_id, token)
        if not context:
            raise ExtractionError("SOURCE_CHANGED")
        _, source, run, item = context
        if not source.privacy_approved or source.sanitization_version != item.sanitization_version:
            raise ExtractionError("PRIVACY_CHANGED")
        reservation = reserve(
            db,
            item,
            run.mode,
            model,
            chunk,
            targets,
            images,
            stage=stage,
            output_tokens=output_tokens,
        )
        item.sent = True
        db.commit()
    try:
        response = fn()
    except ExtractionError as exc:
        with get_sessionmaker()() as db:
            settle(db, reservation, exc.usage)
            db.commit()
        # Earlier OCR tiles may have completed; replaying the job is never automatic.
        exc.retry_after = None
        raise
    with get_sessionmaker()() as db:
        settle(db, reservation, response.usage)
        db.commit()
    return response


def vision_extraction(item_id, token, chunk, targets, mode, model, page_images):
    for page in chunk["pages"]:
        image = page_images.get(page["number"])
        if image is None:
            raise PreparationError("PAGE_IMAGE_MISSING")
        spans = []
        for index, encoded in enumerate(crops(image)):
            result = paid_vision_call(
                item_id,
                token,
                f"ocr-{page['number']}-{index}",
                OCR_MODEL,
                {"prompt": OCR_PROMPT},
                [],
                [encoded],
                lambda encoded=encoded: transcribe(encoded),
                OCR_MAX_TOKENS,
            )
            for line in result.lines:
                text = scrub(line).strip()
                if text and "[판독불가]" not in text and "[가림]" not in text:
                    spans.append({"id": f"vision-gemini-{len(spans)}", "text": text})
            if sum(len(s["text"]) for s in spans) > 20_000:
                raise ExtractionError("OCR_TEXT_LIMIT")
        if not spans:
            raise ExtractionError("OCR_UNCERTAIN")
        page["spans"] = spans
    # Preserve the exact OCR evidence with this private job, never replace privacy-review geometry.
    with get_sessionmaker()() as db:
        context = lock_context(db, item_id, token)
        if not context:
            raise ExtractionError("SOURCE_CHANGED")
        _, source, _, item = context
        if not source.privacy_approved or source.sanitization_version != item.sanitization_version:
            raise ExtractionError("PRIVACY_CHANGED")
        by_number = {p["number"]: p["spans"] for p in chunk["pages"]}
        item.pages = [{**p, "ocrSpans": by_number[p["number"]]} for p in item.pages]
        db.commit()
    return paid_vision_call(
        item_id,
        token,
        "extract",
        model,
        chunk,
        targets,
        [],
        lambda: extract(mode, model, chunk, targets, []),
    )


def process(item_id, token):
    with get_sessionmaker()() as lookup:
        if lookup.get(Item, item_id).phase == "PLACE_PHOTOS":
            from app.source_analysis.photos import process as place_photos

            return place_photos(item_id, token)
    store = Storage()
    reservation_id = None
    with get_sessionmaker()() as db:
        context = lock_context(db, item_id, token)
        if not context:
            return
        batch, source, run, item = context
        if run.prompt_version != PROMPT_VERSION:
            raise ExtractionError("PROMPT_CHANGED")
        phase, mime, key = item.phase, source.mime, source.storage_key
        already_prepared = source.status == "PREPARED"
        if already_prepared and source.preprocess_version != PREPROCESS_VERSION:
            raise PreparationError("PARSER_CHANGED")
        if phase == "PREPARE" and already_prepared:
            pages = list(
                db.scalars(
                    select(Page).where(Page.asset_id == source.id, Page.revision == source.revision)
                )
            )
            source.privacy_approved = True
            enqueue_extraction(db, source, run, item, pages)
            refresh_runs(db, batch.id)
            db.commit()
            return
        if phase == "EXTRACT":
            if source.sanitization_version != item.sanitization_version or (
                run.mode != "mock" and not source.privacy_approved
            ):
                item.status, item.error = "CANCELLED", "PRIVACY_CHANGED"
                refresh_runs(db, batch.id)
                db.commit()
                return
            images, payload, page_images = [], [], {}
            use_vision_ocr = run.mode == "openrouter" and source.mime != "text/plain"
            for requested in item.pages:
                page = db.scalar(
                    select(Page).where(
                        Page.asset_id == source.id,
                        Page.revision == source.revision,
                        Page.number == requested["number"],
                    )
                )
                if page is None:
                    raise PreparationError("PAGE_MISSING")
                payload.append(
                    {
                        "number": page.number,
                        "spans": [
                            s for s in page.redacted_spans if s["id"] in requested["spanIds"]
                        ],
                    }
                )
                if use_vision_ocr and page.sanitized_key:
                    page_images[page.number] = store.get(page.sanitized_key)
                elif page.sanitized_key and page.number in run.visual_pages.get(source.id, []):
                    images.append(base64.b64encode(store.get(page.sanitized_key)).decode())
            if sum(map(len, images)) > 8 * 1024 * 1024:
                raise PreparationError("CHUNK_IMAGE_LIMIT")
            chunk = {
                "sourceId": source.id,
                "sourceRevision": source.revision,
                "checksum": source.checksum,
                "pages": payload,
            }
            allowed = set(item.target_ids)
            selected_targets = [t for t in run.targets if t["id"] in allowed]
            # Names may contain personal data; only approved source contents are needed.
            selected_targets = [{"id": t["id"]} for t in selected_targets]
            mode, model = run.mode, run.model
            if mode != "mock" and not use_vision_ocr:
                from app.source_analysis.budget import reserve

                reservation_id = reserve(db, item, mode, model, chunk, selected_targets, images)
            item.sent = mode != "mock" and not use_vision_ocr
        db.commit()
    started = time.monotonic()
    if phase == "PREPARE":
        if source.original_photo:
            from app.source_analysis.photos import prepare_photo

            prepared = [
                {"image": base64.b64encode(prepare_photo(store.get(key))).decode(), "spans": []}
            ]
        else:
            prepared = prepare(store.get(key), mime)
        with get_sessionmaker()() as db:
            context = lock_context(db, item_id, token)
            if not context:
                return
            batch, source, run, item = context
            if source.mime == "application/pdf":
                others = sum(
                    db.scalars(
                        select(Asset.page_count).where(
                            Asset.batch_id == batch.id,
                            Asset.id != source.id,
                            Asset.mime == "application/pdf",
                            Asset.deleted.is_(False),
                        )
                    )
                )
                if others + len(prepared) > 60:
                    raise PreparationError("BATCH_PDF_PAGE_LIMIT")
            pages = []
            for number, raw in enumerate(prepared, 1):
                image = base64.b64decode(raw["image"]) if raw["image"] else None
                # Uploaders remove personal information before submitting materials.
                safe_image, safe = image, raw["spans"]
                page = Page(
                    asset_id=source.id,
                    revision=source.revision,
                    number=number,
                    spans=raw["spans"],
                    redacted_spans=safe,
                    redactions=[],
                    image_key=store.put(image) if image else None,
                    sanitized_key=store.put(safe_image) if safe_image else None,
                )
                db.add(page)
                pages.append(page)
            source.status, source.error = "PREPARED", None
            source.preprocess_version = PREPROCESS_VERSION
            source.page_count = len(prepared)
            source.sanitization_version += 1
            source.privacy_approved = True
            enqueue_extraction(db, source, run, item, pages)
            item.duration_ms = int((time.monotonic() - started) * 1000)
            refresh_runs(db, batch.id)
            db.commit()
    else:
        try:
            response = (
                vision_extraction(item_id, token, chunk, selected_targets, mode, model, page_images)
                if use_vision_ocr
                else extract(mode, model, chunk, selected_targets, images)
            )
        except ExtractionError as exc:
            from app.source_analysis.budget import settle

            with get_sessionmaker()() as accounting:
                settle(accounting, reservation_id, exc.usage)
                accounting.commit()
            raise
        from app.source_analysis.budget import settle

        with get_sessionmaker()() as accounting:
            settle(accounting, reservation_id, response.usage)
            accounting.commit()
        extraction, diagnostics = validate_candidates(response.extraction, chunk, allowed)
        with get_sessionmaker()() as db:
            # Account for completed provider usage even if cancellation fenced the result.
            context = lock_context(db, item_id, token)
            current = db.get(Item, item_id)
            if current:
                current.usage = response.usage
                current.provider_request_id = response.request_id
                current.duration_ms = int((time.monotonic() - started) * 1000)
            if context:
                batch, source, run, item = context
                if source.sanitization_version != item.sanitization_version or (
                    mode != "mock" and not source.privacy_approved
                ):
                    item.status, item.error = "CANCELLED", "PRIVACY_CHANGED"
                else:
                    item.diagnostics = diagnostics
                    if diagnostics["rejectedCount"]:
                        item.status = "PARTIAL" if extraction.candidates else "FAILED"
                        item.error = "CANDIDATES_REJECTED"
                    else:
                        item.status, item.error = "SUCCEEDED", None
                    # A wholly rejected reply leaves prior usable suggestions intact.
                    if extraction.candidates or not diagnostics["rejectedCount"]:
                        store_candidates(db, batch, item, extraction)
                    item.photo_requests = response.extraction.photo_requests
                    batch.review_version += 1
                refresh_runs(db, batch.id)
            db.commit()


def fail(item_id, token, exc):
    code = str(exc) if isinstance(exc, (PreparationError, ExtractionError)) else "PROCESSING_FAILED"
    with get_sessionmaker()() as db:
        context = lock_context(db, item_id, token)
        item = db.get(Item, item_id)
        if item and isinstance(exc, ExtractionError):
            item.usage = exc.usage
            item.provider_request_id = exc.request_id
        if context:
            batch, source, run, item = context
            retry_after = getattr(exc, "retry_after", None)
            if retry_after is not None and item.attempt < 3:
                item.status = "QUEUED"
                item.available_at = utcnow() + timedelta(
                    seconds=retry_after * 2 ** (item.attempt - 1)
                )
                item.sent = False
            else:
                item.status = "FAILED"
                if item.phase == "PREPARE":
                    source.status, source.error = "FAILED", code
            item.error, item.lease_token = code, None
            refresh_runs(db, batch.id)
        db.commit()


def run_once():
    job = claim()
    if job is None:
        return False
    with heartbeat(*job):
        try:
            process(*job)
        except Exception as exc:
            fail(*job, exc)
    return True


def cleanup():
    store = Storage()
    with get_sessionmaker()() as db:
        # Deleted batches/assets retain tombstones until physical deletion succeeds.
        for batch in db.scalars(
            select(Batch).where(Batch.deleted.is_(True)).with_for_update(skip_locked=True)
        ):
            db.execute(delete(Draft).where(Draft.batch_id == batch.id))
            db.execute(delete(ReviewedField).where(ReviewedField.batch_id == batch.id))
            db.execute(delete(Candidate).where(Candidate.batch_id == batch.id))
            db.execute(
                delete(Item).where(Item.run_id.in_(select(Run.id).where(Run.batch_id == batch.id)))
            )
            db.execute(delete(Run).where(Run.batch_id == batch.id))
            for source in db.scalars(select(Asset).where(Asset.batch_id == batch.id)):
                source.deleted = True
            batch.targets = []
        db.flush()
        for source in db.scalars(
            select(Asset).where(Asset.deleted.is_(True), Asset.status != "DELETED")
        ):
            for page in db.scalars(select(Page).where(Page.asset_id == source.id)):
                for key in (page.image_key, page.sanitized_key):
                    if key:
                        store.delete(key)
                db.delete(page)
            store.delete(source.storage_key)
            source.filename = "deleted"
            source.description = ""
            source.placement = {}
            source.status = "DELETED"
            source.target_ids = []
        db.commit()
        used = set(db.scalars(select(Asset.storage_key).where(Asset.deleted.is_(False))))
        used.update(db.scalars(select(PublicPhoto.storage_key)))
        for p in db.scalars(select(Page)):
            used.update(k for k in (p.image_key, p.sanitized_key) if k)
        for key in store.expired():
            if key not in used:
                store.delete(key)


def main():
    if not get_settings().source_analysis_enabled:
        raise SystemExit("SOURCE_ANALYSIS_ENABLED must be true")
    if "--once" in sys.argv:
        run_once()
        cleanup()
        return
    with ThreadPoolExecutor(max_workers=2) as pool:
        while True:
            results = list(pool.map(lambda _: run_once(), range(2)))
            if not any(results):
                cleanup()
                time.sleep(2)


if __name__ == "__main__":
    main()
