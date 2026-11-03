"""Automatic suggestions are not human confirmations; save all edits atomically."""

import re
import unicodedata
from collections import defaultdict
from decimal import Decimal

from pydantic import Field

from app.core.errors import conflict, invalid
from app.source_analysis import service as s
from app.source_analysis.schemas import (
    MODULE_FIELDS,
    DraftSave,
    FieldReview,
    ReviewPatch,
    hidden_modules,
)


class EditorSave(DraftSave):
    fields: list[FieldReview] = Field(default_factory=list, max_length=200)


FACT_FIELDS = {"specification", "composition", "pieceCount", "qualityEvidence"}
BRIX = r"(\d+(?:\.\d+)?)\s*(?:°?\s*(?:bx|brix)|브릭스)"


def normalize_fact_value(value):
    value = unicodedata.normalize("NFKC", value).casefold()

    def weight(match):
        grams = Decimal(match[1]) * (1000 if match[2] in {"kg", "킬로그램"} else 1)
        return format(grams.normalize(), "f") + "g"

    value = re.sub(r"(\d+(?:\.\d+)?)\s*(kg|g|킬로그램|그램)", weight, value)
    value = re.sub(
        BRIX,
        lambda match: format(Decimal(match[1]).normalize(), "f") + "bx",
        value,
    )
    return re.sub(r"[\s:：,，。]+|[.!]+$", "", value)


def factual_conflict(key, choices):
    # Narrative modules intentionally combine complementary source fragments.
    if key not in FACT_FIELDS:
        return False

    facts = defaultdict(set)
    for choice in choices:
        value = unicodedata.normalize("NFKC", choice["value"]).casefold()
        if key == "qualityEvidence":
            # A range or multiple options within ONE source is not source disagreement.
            brix = tuple(Decimal(n) for n in re.findall(BRIX, value))
            if brix:
                facts["brix"].add(brix)
            continue
        labelled = re.findall(r"(품종|사이즈|크기|원산지|산지)\s*[:：]\s*([^,;\n]+)", value)
        if key == "specification" and labelled:
            for label, fact in labelled:
                slot = {"크기": "사이즈", "산지": "원산지"}.get(label, label)
                facts[slot].add(normalize_fact_value(fact))
        else:
            # Preserve fruit identity and its weight association in composite fact values.
            facts[key].add(normalize_fact_value(value))
    return any(len(values) > 1 for values in facts.values())


def suggestions(review, photos=None):
    from app.ai.source_refine import farm_common_allowed
    from app.source_analysis.refinement import fields as refined_fields
    from app.source_analysis.refinement import includes_target
    from app.source_analysis.text_safety import (
        has_health_claim,
        has_money,
        has_period_text,
        has_platform_text,
    )

    result = []
    for target in review["targets"]:
        modules = review["refinements"].get(target["id"])
        refined = refined_fields(modules or [])
        has_refinement = target["id"] in review["refinements"]
        basic = target.get("basicInfo") or {}
        specification = "\n".join(
            filter(
                None,
                [
                    f"품종: {basic['variety']}" if basic.get("variety") else "",
                    f"사이즈: {basic['size']}" if basic.get("size") else "",
                ],
            )
        )
        basic_values = {
            "specification": specification,
            "qualityEvidence": (
                f"예상 당도: {basic['expectedBrix']:g} °Bx"
                if basic.get("expectedBrix") is not None
                else ""
            ),
        }
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
            if (
                saved
                and saved["state"] == "UNREVIEWED"
                and saved["provenance"] in {"EXTRACTED", "REFINED"}
                and (
                    modules is not None
                    # 배포 전에 저장된 자동 값에 금액·효능·운영 문구가 있으면 다시 계산한다.
                    or has_money(saved["value"] or "")
                    or has_health_claim(saved["value"] or "")
                    or has_platform_text(saved["value"] or "")
                    or has_period_text(saved["value"] or "")
                )
            ):
                saved = None
            choices = [
                c
                for c in review["candidates"]
                if includes_target(c["targetId"], target["id"], len(review["targets"]))
                and (c["targetId"] is not None or farm_common_allowed(c, key))
                and c["fieldKey"] == key
                and not c["historical"]
                and not c["outdated"]
                and not has_money(c["value"])
                and not has_health_claim(c["value"])
                and not has_platform_text(c["value"])
                and not has_period_text(c["value"])
            ]
            # Equivalent raw facts use the lowest candidate id as a stable representative.
            if modules is None and key in FACT_FIELDS:
                unique = {}
                for choice in sorted(choices, key=lambda c: min(c["candidateIds"], default="")):
                    unique.setdefault(normalize_fact_value(choice["value"]), choice)
                choices = list(unique.values())
            # Without a current refinement, all distinct raw alternatives need a picker.
            raw_choices = modules is None and len(choices) > 1
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
            if basic_values.get(key) and (not saved or saved["state"] == "UNREVIEWED"):
                field = {
                    **field,
                    "value": basic_values[key],
                    "provenance": "PRODUCER",
                    "candidateIds": [],
                    "state": "UNREVIEWED",
                }
                status = "ready"
                if photos is not None and any(
                    not any(
                        p.id == pid
                        and not p.deleted
                        and p.status == "PREPARED"
                        and p.original_photo
                        and (p.common or target["id"] in p.target_ids)
                        for p in photos
                    )
                    for pid in field["photoAssetIds"]
                ):
                    status = "outdated"
            elif saved:
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
                if (
                    saved["state"] == "UNREVIEWED"
                    and saved["provenance"] != "REFINED"
                    and (factual_conflict(key, choices) or raw_choices)
                    and status != "outdated"
                ):
                    status = "conflict"
            elif has_refinement and modules is not None:
                if key in refined:
                    field = {**field, **refined[key], "provenance": "REFINED"}
                    status = "ready"
            elif len(choices) == 1 and not has_refinement:
                c = choices[0]
                field = {
                    **field,
                    "value": c["value"],
                    "provenance": "EXTRACTED",
                    "candidateIds": c["candidateIds"],
                }
                status = "ready"
            elif factual_conflict(key, choices) or raw_choices:
                status = "conflict"
            if (
                not saved
                and status == "missing"
                and not choices
                and key not in refined
                and any(
                    c["targetId"] is None
                    and c["fieldKey"] == key
                    and not c["historical"]
                    and not c["outdated"]
                    for c in review["candidates"]
                )
            ):
                status = "unassigned"
            # Automatic refinement/basic info must not silently resolve competing facts.
            # A producer's explicit confirmation or exclusion remains authoritative.
            if (
                factual_conflict(key, choices)
                and status != "outdated"
                and (not saved or saved["state"] == "UNREVIEWED")
                and (
                    not has_refinement or key in refined or modules is None or basic_values.get(key)
                )
            ):
                status = "conflict"
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
        if m not in hidden_modules(t.hidden_section_ids)
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
