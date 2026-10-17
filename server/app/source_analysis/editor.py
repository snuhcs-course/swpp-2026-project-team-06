"""Automatic suggestions are not human confirmations; save all edits atomically."""

from pydantic import Field

from app.core.errors import conflict, invalid
from app.source_analysis import service as s
from app.source_analysis.schemas import MODULE_FIELDS, DraftSave, FieldReview, ReviewPatch


class EditorSave(DraftSave):
    fields: list[FieldReview] = Field(default_factory=list, max_length=200)


def suggestions(review, photos=None):
    result = []
    for target in review["targets"]:
        for key in dict.fromkeys(k for keys in MODULE_FIELDS.values() for k in keys):
            saved = next(
                (
                    f
                    for f in review["fields"]
                    if f["targetId"] == target["id"] and f["fieldKey"] == key
                ),
                None,
            )
            if (
                saved
                and saved["state"] == "UNREVIEWED"
                and not any(
                    saved[k] for k in ("value", "photoAssetIds", "illustrationId", "candidateIds")
                )
            ):
                saved = None
            choices = [
                c
                for c in review["candidates"]
                if c["targetId"] == target["id"]
                and c["fieldKey"] == key
                and not c["historical"]
                and not c["outdated"]
            ]
            status = "missing"
            field = saved or dict(
                targetId=target["id"],
                fieldKey=key,
                value="",
                state="UNREVIEWED",
                provenance="PRODUCER",
                candidateIds=[],
                photoAssetIds=[],
                illustrationId=None,
            )
            if saved:
                old = any(
                    c["outdated"] and set(c["candidateIds"]) & set(saved["candidateIds"])
                    for c in review["candidates"]
                )
                if photos is not None and any(
                    not any(
                        p.id == pid
                        and not p.deleted
                        and p.status == "PREPARED"
                        and p.original_photo
                        and (p.common or target["id"] in p.target_ids)
                        for p in photos
                    )
                    for pid in saved["photoAssetIds"]
                ):
                    old = True
                status = "outdated" if old else "ready"
                if saved["state"] == "UNREVIEWED" and len(choices) > 1:
                    status = "conflict"
            elif len(choices) == 1:
                c = choices[0]
                field = {
                    **field,
                    "value": c["value"],
                    "provenance": "EXTRACTED",
                    "candidateIds": c["candidateIds"],
                }
                status = "ready"
            elif choices:
                status = "conflict"
            elif any(
                c["targetId"] is None
                and c["fieldKey"] == key
                and not c["historical"]
                and not c["outdated"]
                for c in review["candidates"]
            ):
                status = "unassigned"
            if not saved and photos is not None:
                placed = [
                    p.id
                    for p in photos
                    if p.original_photo
                    and not p.deleted
                    and p.status == "PREPARED"
                    and (p.common or target["id"] in p.target_ids)
                    and p.placement.get("revision") == p.revision
                    and p.placement.get("fieldKey") == key
                ]
                if placed:
                    field = {**field, "photoAssetIds": placed}
                    if status == "missing":
                        status = "ready"
            field = {
                k: field[k]
                for k in (
                    "targetId",
                    "fieldKey",
                    "value",
                    "state",
                    "provenance",
                    "candidateIds",
                    "photoAssetIds",
                    "illustrationId",
                )
            }
            result.append({"field": field, "status": status})
    return result


def save(db, row, body):
    s.version(row.review_version, body.review_version)
    target_ids = {t.target_id for t in body.targets}
    if any(f.target_id not in target_ids or f.field_key == "historicalSales" for f in body.fields):
        raise invalid({"fields": "선택한 상품의 상세 항목만 저장해 주세요."})
    expected = {(t, k) for t in target_ids for keys in MODULE_FIELDS.values() for k in keys}
    if {(f.target_id, f.field_key) for f in body.fields} != expected:
        raise invalid({"fields": "상품의 전체 편집 내용을 함께 저장해 주세요."})
    enabled = {
        (t.target_id, k)
        for t in body.targets
        for m in t.enabled_module_ids
        for k in MODULE_FIELDS.get(m, [])
    }
    current = s.review(db, row)
    recommended = {
        (x["field"]["targetId"], x["field"]["fieldKey"]): x for x in current["editorFields"]
    }
    for f in body.fields:
        if (f.target_id, f.field_key) not in enabled or f.state != "UNREVIEWED":
            continue
        if not (f.value or f.photo_asset_ids or f.illustration_id):
            continue
        rec = recommended[(f.target_id, f.field_key)]
        if rec["status"] != "ready" or f.model_dump(by_alias=True) != FieldReview.model_validate(
            rec["field"]
        ).model_dump(by_alias=True):
            raise conflict(
                "EDITOR_CONFIRMATION_REQUIRED", "확인 필요한 항목을 수정하거나 꺼 주세요."
            )
    # Disabled stale fields remain private and must not block unrelated publication.
    inactive = {(f.target_id, f.field_key) for f in body.fields} - enabled
    if body.fields:
        s.patch_review(
            db,
            row,
            ReviewPatch(review_version=body.review_version, fields=body.fields),
            inactive=inactive,
        )
    return s.save_drafts(
        db, row, DraftSave(review_version=row.review_version, targets=body.targets), editor=True
    )
