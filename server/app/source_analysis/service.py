"""Transactions for private source analysis. Every mutation holds the owning batch lock."""

import hashlib
import json
from collections import defaultdict
from copy import deepcopy
from pathlib import Path

from sqlalchemy import delete, select, text, update
from sqlalchemy.inspection import inspect

from app.catalog import service as catalog
from app.core.config import get_settings
from app.core.errors import ApiError, conflict, invalid, not_found
from app.source_analysis.models import (
    Asset,
    Batch,
    Candidate,
    Draft,
    Item,
    Page,
    RequestRecord,
    ReviewedField,
    Run,
    new_id,
)
from app.source_analysis.preprocess import PreparationError, identify, redact
from app.source_analysis.schemas import ILLUSTRATIONS, MODULE_FIELDS, hidden_modules
from app.source_analysis.storage import Storage

ACTIVE = {"QUEUED", "PREPARING", "PRIVACY_REVIEW", "ANALYZING"}


def json_row(row, exclude=()):
    from fastapi.encoders import jsonable_encoder
    from pydantic.alias_generators import to_camel

    return {
        to_camel(c.key): jsonable_encoder(getattr(row, c.key))
        for c in inspect(row).mapper.column_attrs
        if c.key not in exclude
    }


def asset_view(asset):
    return json_row(asset, ("storage_key", "checksum"))


def batch(db, farm_id, batch_id, lock=True):
    query = select(Batch).where(
        Batch.id == batch_id, Batch.farm_id == farm_id, Batch.deleted.is_(False)
    )
    if lock:
        query = query.with_for_update()
    result = db.scalar(query.execution_options(populate_existing=True))
    if result is None:
        raise not_found()
    return result


def version(actual, expected):
    if actual != expected:
        raise conflict("VERSION_MISMATCH", "변경된 내용을 다시 확인해 주세요.", version=actual)


def asset(db, batch_id, asset_id):
    result = db.scalar(
        select(Asset).where(
            Asset.batch_id == batch_id, Asset.id == asset_id, Asset.deleted.is_(False)
        )
    )
    if result is None:
        raise not_found()
    return result


def owned_run(db, batch_id, run_id):
    result = db.scalar(select(Run).where(Run.batch_id == batch_id, Run.id == run_id))
    if result is None:
        raise not_found()
    return result


def idempotent(db, farm_id, scope, key, body, action):
    if not key or len(key) > 128:
        raise invalid({"Idempotency-Key": "1~128자 요청 키가 필요해요."})
    # Serialize identical keys before reading; same transaction as the action.
    lock_id = int.from_bytes(
        hashlib.sha256(f"{farm_id}:{scope}:{key}".encode()).digest()[:8], "big", signed=True
    )
    db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": lock_id})
    digest = hashlib.sha256(
        json.dumps(body, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    record = db.scalar(
        select(RequestRecord).where(
            RequestRecord.farm_id == farm_id, RequestRecord.scope == scope, RequestRecord.key == key
        )
    )
    if record:
        if record.digest != digest:
            raise conflict("IDEMPOTENCY_MISMATCH", "요청 키와 내용이 달라요.")
        return record.response
    result = action()
    db.add(RequestRecord(farm_id=farm_id, scope=scope, key=key, digest=digest, response=result))
    db.flush()
    return result


def targets(db, farm_id, inputs, current=None):
    old = {t["id"]: t for t in current or []}
    result = []
    for entry in inputs:
        if entry.id and entry.id not in old:
            raise invalid({"targets": "새 대상 ID는 서버에서 발급해요."})
        if not entry.name.strip():
            raise invalid({"targets": "상품 이름이 필요해요."})
        basic = entry.basic_info.model_dump(by_alias=True) if entry.basic_info else None
        if entry.id and basic is None:
            basic = old[entry.id].get("basicInfo")
        if entry.product_id:
            product = catalog.load_my_product(db, farm_id, entry.product_id).product
            if basic is None:
                basic = {
                    "variety": product.variety,
                    "size": (product.info or {}).get("size", ""),
                    "expectedBrix": product.expected_brix,
                }
        result.append(
            {
                "id": entry.id or new_id(),
                "name": entry.name.strip(),
                "productId": entry.product_id,
                "basicInfo": basic or {"variety": "", "size": "", "expectedBrix": None},
            }
        )
    if len({t["id"] for t in result}) != len(result):
        raise invalid({"targets": "같은 상품을 두 번 지정할 수 없어요."})
    return result


def create_batch(db, farm_id, body):
    row = Batch(farm_id=farm_id, targets=targets(db, farm_id, body.targets))
    db.add(row)
    db.flush()
    return json_row(row)


def patch_batch(db, row, body):
    version(row.version, body.version)
    if db.scalar(select(Run.id).where(Run.batch_id == row.id, Run.status.in_(ACTIVE))):
        raise conflict("RUN_ACTIVE", "분석 후 대상을 수정해 주세요.")
    replacement = targets(db, row.farm_id, body.targets, row.targets)
    removed = {t["id"] for t in row.targets} - {t["id"] for t in replacement}
    if removed:
        raise conflict(
            "TARGET_IN_USE", "기존 대상은 유지하고 이름을 수정하거나 새 작업을 만들어 주세요."
        )
    row.targets = replacement
    row.version += 1
    row.review_version += 1
    db.execute(update(Candidate).where(Candidate.batch_id == row.id).values(outdated=True))
    return json_row(row)


def patch_basic_info(db, row, body):
    version(row.version, body.version)
    if db.scalar(select(Run.id).where(Run.batch_id == row.id, Run.status.in_(ACTIVE))):
        raise conflict("RUN_ACTIVE", "분석 후 기본 정보를 수정해 주세요.")
    incoming = {t.target_id: t.basic_info.model_dump(by_alias=True) for t in body.targets}
    if len(incoming) != len(body.targets) or not set(incoming) <= {t["id"] for t in row.targets}:
        raise invalid({"targets": "작업에 포함된 상품을 중복 없이 선택해 주세요."})
    updated = deepcopy(row.targets)
    changed = set()
    for target in updated:
        if target["id"] in incoming and target.get("basicInfo") != incoming[target["id"]]:
            target["basicInfo"] = incoming[target["id"]]
            changed.add(target["id"])
    if changed:
        # Only regenerate untouched basic-info suggestions; explicit edits (including
        # deliberate blank values) and extracted evidence remain intact.
        for field in db.scalars(
            select(ReviewedField).where(
                ReviewedField.batch_id == row.id,
                ReviewedField.target_id.in_(changed),
                ReviewedField.field_key.in_(["specification", "qualityEvidence"]),
                ReviewedField.state == "UNREVIEWED",
                ReviewedField.provenance == "PRODUCER",
            )
        ):
            if not field.candidate_ids:
                field.value = ""
        row.targets = updated
        row.version += 1
        row.review_version += 1
    return json_row(row)


def assignment(row, ids, common):
    allowed = {t["id"] for t in row.targets}
    if set(ids) - allowed or len(set(ids)) != len(ids) or (common and ids):
        raise invalid({"targetIds": "대상 상품 또는 공통 지정을 확인해 주세요."})
    return list(ids)


def upload(db, row, data, filename, ids, common, expected, original):
    version(row.version, expected)
    assignment(row, ids, common)
    if not data or len(data) > 20 * 1024 * 1024:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", "파일은 20MB 이하로 넣어 주세요.")
    filename = Path(filename.replace("\\", "/")).name[:200] or "source"
    try:
        mime = identify(data, filename)
    except PreparationError as exc:
        raise invalid({"file": str(exc)}) from exc
    if original and not mime.startswith("image/"):
        raise invalid({"originalPhoto": "원본 사진은 이미지 파일만 지정할 수 있어요."})
    rows = list(db.scalars(select(Asset).where(Asset.batch_id == row.id, Asset.deleted.is_(False))))
    checksum = hashlib.sha256(data).hexdigest()
    duplicate = next(
        (a for a in rows if a.checksum == checksum and a.original_photo == original), None
    )
    if duplicate:
        raise conflict("DUPLICATE_SOURCE", "이미 등록한 자료예요.", sourceId=duplicate.id)
    chars = len(data.decode("utf-8-sig")) if mime == "text/plain" else 0
    if len(rows) >= 30 or sum(a.size for a in rows) + len(data) > 100 * 1024 * 1024:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", "자료는 30개·총 100MB까지 넣을 수 있어요.")
    if sum(a.char_count for a in rows) + chars > 30_000:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", "텍스트는 합계 30,000자까지 넣을 수 있어요.")
    key = Storage().put(data)
    result = Asset(
        batch_id=row.id,
        checksum=checksum,
        storage_key=key,
        filename=filename,
        mime=mime,
        size=len(data),
        target_ids=ids,
        common=common,
        original_photo=original,
        char_count=chars,
    )
    db.add(result)
    row.version += 1
    row.review_version += 1
    db.flush()
    if original:
        from app.source_analysis.photos import ready_photo

        try:
            ready_photo(db, result, data)
        except PreparationError as exc:
            raise invalid({"file": str(exc)}) from exc
        db.flush()
    return asset_view(result)


def invalidate(db, row, source):
    item_ids = select(Item.id).where(Item.asset_id == source.id)
    db.execute(update(Candidate).where(Candidate.item_id.in_(item_ids)).values(outdated=True))
    db.execute(
        update(Item)
        .where(Item.asset_id == source.id, Item.status.in_(["QUEUED", "RUNNING", "PRIVACY_REVIEW"]))
        .values(status="CANCELLED", error="SOURCE_CHANGED", lease_token=None)
    )
    row.version += 1
    row.review_version += 1
    refresh_runs(db, row.id)


def patch_asset(db, row, source, body):
    version(source.revision, body.source_version)
    assignment(row, body.target_ids, body.common)
    if body.original_photo and not source.mime.startswith("image/"):
        raise invalid({"originalPhoto": "이미지 원본만 선택해 주세요."})
    source.target_ids, source.common = body.target_ids, body.common
    source.original_photo = body.original_photo
    source.revision += 1
    source.privacy_approved = False
    source.status = "UPLOADED"
    invalidate(db, row, source)
    return asset_view(source)


def remove_asset(db, row, source):
    source.deleted = True
    invalidate(db, row, source)
    return {"deleted": True}


def pages_for(db, source):
    return list(
        db.scalars(
            select(Page)
            .where(Page.asset_id == source.id, Page.revision == source.revision)
            .order_by(Page.number)
        )
    )


def privacy(db, row, source, body):
    version(source.revision, body.source_revision)
    version(source.sanitization_version, body.sanitization_version)
    pages = pages_for(db, source)
    if source.status != "PREPARED" or not pages:
        raise conflict("SOURCE_NOT_PREPARED", "자료 처리가 끝난 후 확인해 주세요.")
    valid_ids = {f"{p.number}:{s['id']}" for p in pages for s in p.spans}
    if set(body.span_ids) - valid_ids or any(
        r.page not in {p.number for p in pages} for r in body.regions
    ):
        raise invalid({"regions": "페이지와 문구 위치를 다시 확인해 주세요."})
    changed = bool(body.span_ids or body.regions)
    store = Storage()
    for p in pages:
        extra = [r.box for r in body.regions if r.page == p.number]
        ids = [v.split(":", 1)[1] for v in body.span_ids if v.startswith(f"{p.number}:")]
        # Redactions are additive; approval cannot restore masked content.
        old_ids = [
            s["id"]
            for s, safe in zip(p.spans, p.redacted_spans, strict=True)
            if s["text"] != safe["text"]
        ]
        boxes = p.redactions + extra
        image, safe = redact(
            store.get(p.image_key) if p.image_key else None, p.spans, boxes, ids + old_ids
        )
        if changed:
            p.sanitized_key = store.put(image) if image else None
            p.redacted_spans = safe
            p.redactions = boxes
    if changed:
        source.sanitization_version += 1
        # Waiting privacy items can adopt this revision; already-started results cannot.
        running_ids = list(
            db.scalars(
                select(Item.id).where(
                    Item.asset_id == source.id,
                    Item.phase == "EXTRACT",
                    Item.status != "PRIVACY_REVIEW",
                )
            )
        )
        if running_ids:
            db.execute(
                update(Candidate).where(Candidate.item_id.in_(running_ids)).values(outdated=True)
            )
            db.execute(
                update(Item)
                .where(Item.id.in_(running_ids), Item.status.in_(["QUEUED", "RUNNING"]))
                .values(status="CANCELLED", error="PRIVACY_CHANGED", lease_token=None)
            )
        row.review_version += 1
    source.privacy_approved = body.approved
    if not body.approved:
        # Revoking consent also prevents queued/running extraction results being accepted.
        db.execute(
            update(Item)
            .where(
                Item.asset_id == source.id,
                Item.phase == "EXTRACT",
                Item.status.in_(["QUEUED", "RUNNING"]),
            )
            .values(status="CANCELLED", error="PRIVACY_REVOKED", lease_token=None)
        )
    else:
        db.execute(
            update(Item)
            .where(
                Item.asset_id == source.id,
                Item.revision == source.revision,
                Item.status == "PRIVACY_REVIEW",
            )
            .values(status="QUEUED", sanitization_version=source.sanitization_version)
        )
    row.version += 1
    db.flush()
    refresh_runs(db, row.id)
    return asset_view(source)


def start_run(db, row, expected, retry_items=None, visual_pages=None):
    version(row.version, expected)
    if any(not (t.get("basicInfo") or {}).get("variety", "").strip() for t in row.targets):
        raise invalid({"variety": "과일 품종명을 입력해 주세요."})
    if db.scalar(select(Run.id).where(Run.batch_id == row.id, Run.status.in_(ACTIVE))):
        raise conflict("RUN_ACTIVE", "이미 분석하고 있어요.")
    sources = list(
        db.scalars(select(Asset).where(Asset.batch_id == row.id, Asset.deleted.is_(False)))
    )
    if not sources:
        raise invalid({"sources": "자료를 먼저 넣어 주세요."})
    settings = get_settings()
    visual_pages = visual_pages or {}
    for sid, numbers in visual_pages.items():
        source = next((a for a in sources if a.id == sid), None)
        if source is None or source.status != "PREPARED":
            raise invalid({"visualPages": "준비가 끝난 자료만 시각 분석할 수 있어요."})
        if (
            not numbers
            or len(set(numbers)) != len(numbers)
            or any(
                n not in {p.number for p in pages_for(db, source) if p.sanitized_key}
                for n in numbers
            )
        ):
            raise invalid({"visualPages": "이미지가 있는 페이지를 선택해 주세요."})
    from app.source_analysis.preprocess import PREPROCESS_VERSION

    for source in sources:
        if source.status == "PREPARED":
            source.privacy_approved = True
    reparsed = set()
    for source in sources:
        if retry_items is not None and not any(i.asset_id == source.id for i in retry_items):
            continue
        if source.status == "PREPARED" and source.preprocess_version != PREPROCESS_VERSION:
            # Previously approved geometry cannot authorize a newly parsed image.
            source.revision += 1
            source.status = "UPLOADED"
            source.privacy_approved = False
            invalidate(db, row, source)
            reparsed.add(source.id)
    visual_pages = {sid: nums for sid, nums in visual_pages.items() if sid not in reparsed}
    run = Run(
        inputs=[
            {"id": p.id, "revision": p.revision, "description": p.description} for p in sources
        ],
        visual_pages=visual_pages,
        batch_id=row.id,
        mode=settings.source_analysis_provider,
        model=settings.source_analysis_model,
        targets=deepcopy(row.targets),
    )
    db.add(run)
    db.flush()
    for source in sources:
        previous = [i for i in retry_items or [] if i.asset_id == source.id]
        if retry_items is not None and not previous:
            continue
        ids = [t["id"] for t in row.targets] if source.common else source.target_ids
        if previous and source.id not in reparsed:
            for old in previous:
                if old.phase == "PLACE_PHOTOS":
                    continue  # Rebuild a single batched placement job below.
                if old.revision != source.revision:
                    raise conflict("SOURCE_CHANGED", "자료가 바뀌었으니 새 분석을 시작해 주세요.")
                db.add(
                    Item(
                        run_id=run.id,
                        asset_id=source.id,
                        revision=source.revision,
                        target_ids=ids,
                        phase=old.phase,
                        pages=old.pages,
                        sanitization_version=source.sanitization_version,
                        status=(
                            "PRIVACY_REVIEW"
                            if old.phase == "EXTRACT"
                            and run.mode != "mock"
                            and not source.privacy_approved
                            else "QUEUED"
                        ),
                    )
                )
        else:
            db.add(
                Item(run_id=run.id, asset_id=source.id, revision=source.revision, target_ids=ids)
            )
    from app.source_analysis.photos import enqueue

    enqueue(db, row, run)
    row.version += 1
    db.flush()
    return run_view(db, run)


def run_view(db, run):
    result = json_row(run)
    items = list(db.scalars(select(Item).where(Item.run_id == run.id).order_by(Item.id)))
    result["items"] = [json_row(i, ("lease_token", "lease_until", "sent")) for i in items]
    result["completed"] = sum(i.status in ("SUCCEEDED", "FAILED", "CANCELLED") for i in items)
    result["total"] = len(items)
    return result


def refresh_runs(db, batch_id):
    db.flush()
    for run in db.scalars(select(Run).where(Run.batch_id == batch_id, Run.status.in_(ACTIVE))):
        items = list(db.scalars(select(Item).where(Item.run_id == run.id)))
        states = {i.status for i in items}
        if states & {"QUEUED", "RUNNING"}:
            run.status = (
                "PREPARING"
                if any(i.phase == "PREPARE" and i.status in {"QUEUED", "RUNNING"} for i in items)
                else "ANALYZING"
            )
        elif "PRIVACY_REVIEW" in states:
            run.status = "PRIVACY_REVIEW"
        elif states == {"SUCCEEDED"}:
            run.status = "SUCCEEDED"
        elif any(i.phase == "EXTRACT" and i.status == "SUCCEEDED" for i in items):
            run.status = "PARTIAL"
        else:
            run.status = "FAILED"


def cancel(db, run):
    if run.status not in ACTIVE:
        return run_view(db, run)
    run.status = "CANCELLED"
    db.execute(
        update(Item)
        .where(Item.run_id == run.id, Item.status.in_(["QUEUED", "RUNNING", "PRIVACY_REVIEW"]))
        .values(status="CANCELLED", lease_token=None)
    )
    return run_view(db, run)


def retry(db, row, run, body):
    items = list(db.scalars(select(Item).where(Item.run_id == run.id, Item.id.in_(body.item_ids))))
    if len(items) != len(set(body.item_ids)) or any(i.status != "FAILED" for i in items):
        raise invalid({"itemIds": "실패한 항목만 다시 분석할 수 있어요."})
    if any(i.error == "REQUEST_UNCERTAIN" for i in items) and not body.acknowledge_uncertain:
        raise conflict(
            "RETRY_ACK_REQUIRED", "재호출 비용이 생길 수 있어요. 확인 후 재시도해 주세요."
        )
    return start_run(db, row, row.version, items, run.visual_pages)


def review(db, row):
    candidates = list(db.scalars(select(Candidate).where(Candidate.batch_id == row.id)))
    grouped = defaultdict(list)
    for c in candidates:
        if not c.outdated:
            grouped[(c.target_id, c.field_key)].append(c)
    conflicts = [
        {"targetId": key[0], "fieldKey": key[1], "candidateIds": [c.id for c in values]}
        for key, values in grouped.items()
        if len({c.value for c in values}) > 1
    ]
    unique = {}
    for candidate in candidates:
        key = (
            candidate.target_id,
            candidate.field_key,
            candidate.value,
            candidate.historical,
            candidate.outdated,
        )
        if key not in unique:
            unique[key] = {**json_row(candidate), "candidateIds": [], "evidence": []}
        merged = unique[key]
        merged["candidateIds"].append(candidate.id)
        for evidence in candidate.evidence:
            if evidence not in merged["evidence"]:
                merged["evidence"].append(evidence)
    result = {
        "reviewVersion": row.review_version,
        "targets": row.targets,
        "candidates": list(unique.values()),
        "conflicts": conflicts,
        "fields": [
            json_row(f)
            for f in db.scalars(select(ReviewedField).where(ReviewedField.batch_id == row.id))
        ],
        "photoRequests": [
            {
                "targetId": t["id"],
                "roles": ["hero", "sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos"],
            }
            for t in row.targets
        ],
        "sourcePhotoRequests": [
            {"sourceId": i.asset_id, "targetIds": i.target_ids, "requests": i.photo_requests}
            for i in db.scalars(
                select(Item)
                .join(Run, Run.id == Item.run_id)
                .join(Asset, Asset.id == Item.asset_id)
                .where(
                    Run.batch_id == row.id,
                    Item.status == "SUCCEEDED",
                    Item.phase == "EXTRACT",
                    Asset.deleted.is_(False),
                    Item.revision == Asset.revision,
                    Item.sanitization_version == Asset.sanitization_version,
                )
            )
            if i.photo_requests
        ],
    }

    from app.source_analysis.editor import suggestions

    result["editorFields"] = suggestions(
        result, list(db.scalars(select(Asset).where(Asset.batch_id == row.id)))
    )
    return result


def patch_review(db, row, body, *, inactive=frozenset()):
    version(row.review_version, body.review_version)
    seen = set()
    for entry in body.fields:
        if (entry.target_id, entry.field_key) in seen:
            raise invalid({"fields": "같은 항목은 한 번만 수정해 주세요."})
        seen.add((entry.target_id, entry.field_key))
        assignment(row, [entry.target_id], False)
        candidates = list(
            db.scalars(
                select(Candidate).where(
                    Candidate.batch_id == row.id, Candidate.id.in_(entry.candidate_ids)
                )
            )
        )
        if len(candidates) != len(set(entry.candidate_ids)) or any(
            (c.outdated and (entry.target_id, entry.field_key) not in inactive)
            or c.field_key != entry.field_key
            or c.target_id not in (None, entry.target_id)
            for c in candidates
        ):
            raise conflict("INVALID_EVIDENCE", "최신 자료의 같은 상품·항목 근거를 선택해 주세요.")
        if entry.provenance == "EXTRACTED" and (
            not candidates or any(c.value != entry.value for c in candidates)
        ):
            raise invalid({"provenance": "수정한 문구는 생산자 제공으로 기록해 주세요."})
        if entry.field_key == "historicalSales" and entry.state == "CONFIRMED":
            raise invalid({"fieldKey": "과거 판매 정보는 참고용이며 상세 초안에 넣지 않아요."})
        for photo_id in entry.photo_asset_ids:
            if (entry.target_id, entry.field_key) in inactive:
                photo = db.get(Asset, photo_id)
                if photo is None or photo.batch_id != row.id:
                    raise invalid({"photoAssetIds": "이 작업의 사진만 사용할 수 있어요."})
                continue
            photo = asset(db, row.id, photo_id)
            if (
                not photo.original_photo
                or not photo.mime.startswith("image/")
                or (not photo.common and entry.target_id not in photo.target_ids)
            ):
                raise invalid({"photoAssetIds": "이 상품에 연결한 원본 사진을 선택해 주세요."})
            if photo.status != "PREPARED":
                raise conflict("PHOTO_NOT_PREPARED", "사진 처리를 먼저 완료해 주세요.")
        if entry.illustration_id and (
            entry.field_key != "sizePhoto" or entry.illustration_id not in ILLUSTRATIONS
        ):
            raise invalid({"illustrationId": "허용된 설명용 크기 일러스트를 선택해 주세요."})
        current = db.scalar(
            select(ReviewedField).where(
                ReviewedField.batch_id == row.id,
                ReviewedField.target_id == entry.target_id,
                ReviewedField.field_key == entry.field_key,
            )
        )
        values = entry.model_dump()
        if current is None:
            current = ReviewedField(batch_id=row.id, **values)
            db.add(current)
        else:
            for key, value in values.items():
                setattr(current, key, value)
    row.review_version += 1
    db.flush()
    return review(db, row)


def save_drafts(db, row, body, *, editor=False):
    version(row.review_version, body.review_version)
    if len({t.target_id for t in body.targets}) != len(body.targets):
        raise invalid({"targets": "상품을 중복 지정할 수 없어요."})
    result = []
    for target in body.targets:
        assignment(row, [target.target_id], False)
        if len(set(target.enabled_module_ids)) != len(target.enabled_module_ids) or (
            set(target.enabled_module_ids) - MODULE_FIELDS.keys()
        ):
            raise invalid({"enabledModuleIds": "18개 요소 중에서 선택해 주세요."})
        fields = list(
            db.scalars(
                select(ReviewedField).where(
                    ReviewedField.batch_id == row.id,
                    ReviewedField.target_id == target.target_id,
                    ReviewedField.state.in_(
                        ["CONFIRMED", "UNREVIEWED"] if editor else ["CONFIRMED"]
                    ),
                )
            )
        )
        visible_ids = set(target.enabled_module_ids) - hidden_modules(target.hidden_section_ids)
        sources, evidence = set(), {}
        active_keys = {k for m in visible_ids for k in MODULE_FIELDS[m]}
        for field in fields:
            if editor and field.field_key not in active_keys:
                continue
            candidates = list(
                db.scalars(
                    select(Candidate).where(
                        Candidate.id.in_(field.candidate_ids), Candidate.batch_id == row.id
                    )
                )
            )
            if any(c.outdated for c in candidates):
                raise conflict("OUTDATED_EVIDENCE", "바뀐 자료의 항목을 다시 확인해 주세요.")
            evidence[field.field_key] = [e for c in candidates for e in c.evidence]
            sources.update(e["sourceId"] for e in evidence[field.field_key])
            sources.update(field.photo_asset_ids)
            for pid in field.photo_asset_ids:
                p = asset(db, row.id, pid)
                if (
                    p.status != "PREPARED"
                    or not p.original_photo
                    or (not p.common and target.target_id not in p.target_ids)
                ):
                    raise conflict("PHOTO_CHANGED", "원본 사진 연결을 다시 확인해 주세요.")
        modules, warnings = [], []
        for module_id, keys in MODULE_FIELDS.items():
            selected = [f for f in fields if f.field_key in keys]
            filled = any(
                f.value.strip() or f.photo_asset_ids or f.illustration_id for f in selected
            )
            enabled = module_id in target.enabled_module_ids
            module = {
                "id": module_id,
                "enabled": enabled,
                "fieldKeys": keys,
                "fields": [json_row(f, ("id", "batch_id", "target_id")) for f in selected],
                "photoAssetIds": list(
                    dict.fromkeys(p for f in selected for p in f.photo_asset_ids)
                ),
                "illustrationId": next(
                    (f.illustration_id for f in selected if f.illustration_id), None
                ),
                "illustrationLabel": "설명용 일러스트"
                if any(f.illustration_id for f in selected)
                else None,
            }
            modules.append(module)
            if module_id in visible_ids and not filled:
                warnings.append({"moduleId": module_id, "code": "MISSING_CONFIRMED_CONTENT"})
        modes = set()
        if evidence:
            for candidate in db.scalars(
                select(Candidate).where(
                    Candidate.batch_id == row.id,
                    Candidate.id.in_([c for f in fields for c in f.candidate_ids]),
                )
            ):
                modes.add(db.get(Run, db.get(Item, candidate.item_id).run_id).mode)
        snapshot = {
            "schemaVersion": 1,
            "hiddenSectionIds": target.hidden_section_ids,
            "batchVersion": row.version,
            "sourceVersions": {
                sid: {
                    "revision": asset(db, row.id, sid).revision,
                    "sanitizationVersion": asset(db, row.id, sid).sanitization_version,
                }
                for sid in sources
            },
            "targetId": target.target_id,
            "reviewVersion": row.review_version,
            "modules": modules,
            "warnings": warnings,
            "sourceIds": sorted(sources),
            "evidence": evidence,
            "mode": "mock" if "mock" in modes else (sorted(modes)[0] if modes else "producer"),
            "previewModules": [
                {
                    "id": m["id"],
                    "texts": [
                        {"fieldKey": f["fieldKey"], "value": f["value"]}
                        for f in m["fields"]
                        if f["value"]
                    ],
                    "photoAssetIds": m["photoAssetIds"],
                    "illustrationId": m["illustrationId"],
                    "illustrationLabel": m["illustrationLabel"],
                }
                for m in modules
                if m["id"] in visible_ids
                and any(
                    f["value"].strip() or f["photoAssetIds"] or f["illustrationId"]
                    for f in m["fields"]
                )
            ],
        }
        draft = Draft(batch_id=row.id, target_id=target.target_id, snapshot=snapshot)
        db.add(draft)
        db.flush()
        result.append(json_row(draft))
    return {"drafts": result}


def delete_batch(db, row):
    for run in db.scalars(select(Run).where(Run.batch_id == row.id, Run.status.in_(ACTIVE))):
        cancel(db, run)
    db.execute(delete(Draft).where(Draft.batch_id == row.id))
    db.execute(
        delete(RequestRecord).where(
            RequestRecord.farm_id == row.farm_id,
            (RequestRecord.scope.contains(row.id))
            | (RequestRecord.response["id"].as_string() == row.id),
        )
    )
    row.deleted = True
    return {"deleted": True}
