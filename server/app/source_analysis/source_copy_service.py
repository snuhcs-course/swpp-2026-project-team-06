"""Source-bound owner decisions; callers hold the existing owning-batch lock."""

from sqlalchemy import select

from app.core.errors import conflict, invalid, not_found
from app.source_analysis import service as s
from app.source_analysis.models import Asset, Item, ReviewedField, Run, SourceCopyDecision
from app.source_analysis.refinement import current_candidates, fields, payload


def decisions(db, batch, target_id):
    return list(
        db.scalars(
            select(SourceCopyDecision).where(
                SourceCopyDecision.batch_id == batch.id, SourceCopyDecision.target_id == target_id
            )
        )
    )


def choice(row):
    return {
        "bindingHash": row.binding_hash,
        "action": row.action,
        "value": row.value,
        "note": row.note,
        "module": row.module,
    }


def baseline_plan(db, batch, target_id, *, choices=None):
    from app.source_analysis.source_preserving import build_plan

    target = next((t for t in batch.targets if t["id"] == target_id), None)
    if target is None:
        raise not_found()
    # Inventory includes common and other-target passages so ambiguous scope is accounted for.
    inventory = {}
    for tid in [None, *(t["id"] for t in batch.targets)]:
        for candidate in current_candidates(db, batch.id, tid):
            inventory[candidate.id] = candidate
    sources = list(
        db.scalars(select(Asset).where(Asset.batch_id == batch.id, Asset.deleted.is_(False)))
    )
    versions = {
        a.id: {"revision": a.revision, "sanitizationVersion": a.sanitization_version}
        for a in sources
    }
    arguments = {"source_versions": versions, "target_count": len(batch.targets)}
    candidates = payload(list(inventory.values()))
    base = build_plan(target, candidates, **arguments)
    if choices is None:
        bindings = {p["bindingHash"] for p in base["passages"]}
        choices = [choice(r) for r in decisions(db, batch, target_id) if r.binding_hash in bindings]
    return build_plan(target, candidates, **arguments, decisions=choices)


def plan(db, batch, target_id, *, choices=None):
    base = baseline_plan(db, batch, target_id, choices=choices)
    from app.source_analysis.source_presentation import resolve

    target = next(t for t in batch.targets if t["id"] == target_id)
    return resolve(db, batch, target, base)


def get(db, batch, target_id):
    return {
        "plan": plan(db, batch, target_id),
        "reviewVersion": batch.review_version,
        "enabled": batch.source_copy_enabled,
    }


def save(db, batch, target_id, body, actor_id):
    s.version(batch.review_version, body.review_version)
    if not batch.source_copy_enabled:
        raise conflict("SOURCE_COPY_DISABLED", "원문 보존 검토를 먼저 시작해 주세요.")
    current = plan(db, batch, target_id)
    if current["planHash"] != body.plan_hash:
        raise conflict("SOURCE_PLAN_CHANGED", "자료가 바뀌었어요. 원문을 다시 확인해 주세요.")
    incoming = [c.model_dump(by_alias=True) for c in body.decisions]
    keys = [c["bindingHash"] for c in incoming]
    if len(keys) != len(set(keys)):
        raise invalid({"decisions": "같은 원문은 한 번만 확인해 주세요."})
    passages = {p["bindingHash"]: p for p in current["passages"]}
    if set(keys) - passages.keys():
        raise conflict("SOURCE_PLAN_CHANGED", "현재 원문 항목만 확인할 수 있어요.")
    # KEEP may merely acknowledge the presentation's already-visible placement.
    # Do not turn its implicit UI default into a new baseline placement decision:
    # that would invalidate the same presentation while the owner only confirmed it.
    if current.get("presentation", {}).get("status") == "APPLIED":
        for entry in incoming:
            passage = passages.get(entry["bindingHash"])
            if entry["action"] != "KEEP" or passage is None:
                continue
            shown = {
                module["module"]
                for module in current["modules"]
                for text in module["texts"]
                if passage["id"] in text.get("passageIds", [])
            }
            if len(shown) == 1 and entry.get("module") in shown:
                entry["module"] = passage["module"]
    existing = {r.binding_hash: r for r in decisions(db, batch, target_id)}
    proposed = {k: choice(r) for k, r in existing.items() if k in passages}
    proposed.update({c["bindingHash"]: c for c in incoming})
    # Validate the complete change before mutating any rows. The engine enforces safety,
    # owner-confirmation and placement rules equally for preview and persisted decisions.
    from app.source_analysis.source_preserving import SourcePlanError

    try:
        checked = plan(db, batch, target_id, choices=list(proposed.values()))
    except SourcePlanError as exc:
        messages = {
            "EDIT_REQUIRED": "그대로 쓸 수 없는 문구예요. 수정하거나 상세에서 빼 주세요.",
            "NOTE_REQUIRED": "현재도 맞는 내용인지 확인한 이유를 적어 주세요.",
            "UNSAFE_EDIT": "개인정보·건강 효능·다른 상품 표현을 확인해 수정해 주세요.",
            "PLACEMENT_REQUIRED": "문구를 넣을 상세 항목을 선택해 주세요.",
            "FIELD_LIMIT": "상세 항목의 글자 수를 줄이거나 일부 문구를 다른 항목으로 옮겨 주세요.",
            "STALE_DECISION": "자료가 바뀌었어요. 최신 원문을 불러와 다시 확인해 주세요.",
            "INVALID_DECISION": "수정할 문구와 확인 이유, 상세 항목을 다시 확인해 주세요.",
            "STALE_SOURCE": "자료가 바뀌었어요. 최신 원문을 불러와 다시 확인해 주세요.",
        }
        raise invalid(
            {"decisions": messages.get(exc.reason, "원문 검토 내용을 다시 확인해 주세요.")}
        ) from exc
    for value in incoming:
        key = value["bindingHash"]
        row = existing.get(key)
        if row is None:
            row = SourceCopyDecision(batch_id=batch.id, target_id=target_id, binding_hash=key)
            db.add(row)
        row.action, row.value, row.note, row.module = (
            value["action"],
            value["value"],
            value["note"],
            value["module"],
        )
        row.actor_id = actor_id
        evidence = passages[key]["evidence"]
        source_ids = {e["sourceId"] for e in evidence}
        row.source_binding = {
            "version": checked["version"],
            "evidence": evidence,
            "sources": {
                a.id: {"revision": a.revision, "sanitizationVersion": a.sanitization_version}
                for a in db.scalars(
                    select(Asset).where(Asset.id.in_(source_ids), Asset.batch_id == batch.id)
                )
            },
        }
    reconcile_owner_fields(db, batch, target_id, current, checked, set(keys))
    batch.review_version += 1
    db.flush()
    return {"plan": checked, "reviewVersion": batch.review_version, "enabled": True}


def enable(db, batch, body):
    s.version(batch.review_version, body.review_version)
    if batch.source_copy_enabled:
        from app.source_analysis.source_presentation import enqueue_completed

        if enqueue_completed(db, batch):
            batch.review_version += 1
            s.refresh_runs(db, batch.id)
        return s.review(db, batch)
    items = list(
        db.scalars(
            select(Item)
            .join(Run)
            .where(
                Run.batch_id == batch.id,
                Item.phase == "REFINE",
                Item.status.in_(["QUEUED", "RUNNING"]),
            )
        )
    )
    # A live lease may be inside a paid request. Do not revoke it behind the worker.
    if any(i.status == "RUNNING" for i in items):
        raise conflict("RUN_ACTIVE", "진행 중인 문구 정리가 끝난 뒤 다시 시도해 주세요.")
    for item in items:
        item.status, item.error = "CANCELLED", "SOURCE_COPY_ENABLED"
    batch.source_copy_enabled = True
    from app.source_analysis.source_presentation import enqueue_completed

    enqueue_completed(db, batch)
    batch.review_version += 1
    db.flush()
    s.refresh_runs(db, batch.id)
    return s.review(db, batch)


def refinements(db, batch):
    return {t["id"]: plan(db, batch, t["id"])["modules"] for t in batch.targets}


def stored_fields(db, batch):
    return {
        (tid, key, field["value"], frozenset(field["candidateIds"]))
        for tid, modules in refinements(db, batch).items()
        for key, field in fields(modules).items()
    }


def invalidate_source(db, batch_id, source_id):
    # Physically remove private owner text when its source is changed/deleted; bindings
    # independently prevent replay even if a caller only changes the source version.
    for row in db.scalars(
        select(SourceCopyDecision).where(SourceCopyDecision.batch_id == batch_id)
    ):
        if any(e.get("sourceId") == source_id for e in row.source_binding.get("evidence", [])):
            db.delete(row)


def decorate_editor_fields(db, batch, entries, protected):
    """Owner edits remain producer text, with provenance in the private decision log."""
    from app.ai.source_refine import TEXT_MODULE_FIELDS

    by_target = {t["id"]: plan(db, batch, t["id"]) for t in batch.targets}
    for entry in entries:
        field = entry["field"]
        key = (field["targetId"], field["fieldKey"])
        if key in protected:
            entry["field"] = {k: protected[key][k] for k in field}
            continue
        target_plan = by_target[field["targetId"]]
        generated = fields(target_plan["modules"]).get(field["fieldKey"])
        if not generated or field["value"] != generated["value"]:
            continue
        entry["status"] = "ready"
        if any(
            p["status"] == "READY"
            and p.get("decision", {})
            and p["decision"].get("action") == "EDIT"
            and TEXT_MODULE_FIELDS.get(p["module"]) == field["fieldKey"]
            for p in target_plan["passages"]
        ):
            field["provenance"] = "PRODUCER"
            field["candidateIds"] = []


def reconcile_owner_fields(db, batch, target_id, previous, updated, changed_bindings):
    """An explicit owner decision supersedes its unchanged saved suggestion.

    Producer fields are otherwise authoritative. This deliberately runs only on decision
    PUT, never on GET, reanalysis, source invalidation or automatic queue refresh.
    """
    from app.ai.source_refine import TEXT_MODULE_FIELDS

    affected = {
        p["module"]
        for plan_value in (previous, updated)
        for p in plan_value["passages"]
        if p["bindingHash"] in changed_bindings
    }
    old_owner_modules = {
        p["module"]
        for p in previous["passages"]
        if p["status"] == "READY" and p.get("decision") and p["decision"].get("action") == "EDIT"
    }
    new_owner_modules = {
        p["module"]
        for p in updated["passages"]
        if p["status"] == "READY" and p.get("decision") and p["decision"].get("action") == "EDIT"
    }
    prior_fields, new_fields = fields(previous["modules"]), fields(updated["modules"])
    for module in affected:
        key = TEXT_MODULE_FIELDS.get(module)
        old = prior_fields.get(key, {"value": ""})
        saved = db.scalar(
            select(ReviewedField).where(
                ReviewedField.batch_id == batch.id,
                ReviewedField.target_id == target_id,
                ReviewedField.field_key == key,
            )
        )
        # Replace only unchanged source-owned text (or explicitly fill empty text).
        # Media on the same field is independent and is deliberately preserved.
        if (
            saved is None
            or saved.provenance != "PRODUCER"
            or saved.candidate_ids
            or saved.state == "EXCLUDED"
            or saved.value != old["value"]
            or (
                module not in old_owner_modules and (module not in new_owner_modules or saved.value)
            )
        ):
            continue
        replacement = new_fields.get(key, {"value": "", "candidateIds": []})
        producer = module in new_owner_modules or not replacement["value"]
        candidate_ids = [] if producer else replacement["candidateIds"]
        provenance = "PRODUCER" if producer else "REFINED"
        if (
            saved.value == replacement["value"]
            and saved.candidate_ids == candidate_ids
            and saved.provenance == provenance
        ):
            continue
        saved.value = replacement["value"]
        saved.candidate_ids = candidate_ids
        saved.provenance = provenance
        saved.state = "UNREVIEWED"


def validate_publication(db, batch, target_id, texts):
    """Private evidence can be complete; only explicitly reviewed, safe text is public.

    Recompute under the caller's batch/product lock, including hidden and overflow items.
    A private save, checkbox or manual canvas edit cannot acknowledge source warnings.
    """
    if not batch.source_copy_enabled:
        return
    current = plan(db, batch, target_id)
    if any(p["reviewPending"] for p in current["passages"]):
        raise conflict(
            "SOURCE_REVIEW_PENDING",
            "공개 전 원문 검토가 필요해요. 표시된 항목을 확인·수정하거나 제외해 주세요.",
        )
    from app.source_analysis.source_reflow import contains_source_wording

    for passage in current["passages"]:
        decision = passage.get("decision")
        if not decision:
            continue
        removed = decision["action"] in {"OMIT", "TRANSFER_TO_SETTINGS"}
        changed = decision["action"] in {"EDIT", "ACCEPT_REPAIR"} and (
            not contains_source_wording(passage["originalValue"], passage["value"])
        )
        if (removed or changed) and any(
            contains_source_wording(passage["originalValue"], value) for value in texts
        ):
            raise conflict(
                "SOURCE_REVIEW_CHANGED",
                "수정·제외한 원문이 상세에 남아 있어요. 저장된 문구를 확인해 주세요.",
            )
    from app.source_analysis.source_preserving import _RESTRICTED, _safety

    target = next(t for t in batch.targets if t["id"] == target_id)
    if any(_RESTRICTED.intersection(_safety(value, target.get("name", ""))) for value in texts):
        raise invalid({"modules": "공개 제한 표현은 수정하거나 제외한 뒤 다시 적용해 주세요."})
