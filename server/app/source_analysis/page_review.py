"""Producer decisions bound to a complete saved page passage and its source notes."""

import hashlib
import json
from copy import deepcopy

from app.core.errors import conflict, invalid, not_found
from app.source_analysis.review_prompts import prompts_for
from app.source_analysis.source_preserving import _reasons, _safety

OWNED = (
    "sourceReviewRequired",
    "reviewNotes",
    "reviewContext",
    "reviewDecisions",
    "setupInputs",
    "sourceProcessingIncomplete",
)


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def value_at(snapshot, reference):
    try:
        mid, index = reference.split(":")
        module = next(m for m in snapshot["modules"] if m["id"] == mid)
        return module["texts"][int(index)]["value"]
    except (ValueError, KeyError, StopIteration, IndexError):
        raise invalid({"reference": "해당 문구를 다시 확인해 주세요."}) from None


def target_comparison(value, name):
    from app.source_analysis.text_safety import is_target_comparison

    return is_target_comparison(value, name)


def restricted(value, context):
    result = set(_safety(value, context.get("targetName", ""))) & {
        "PRIVATE_VALUE",
        "HEALTH_CLAIM",
        "OTHER_PRODUCT",
    }
    if target_comparison(value, context.get("targetName", "")):
        result.discard("OTHER_PRODUCT")
    return result


def items(snapshot):
    result = {}
    for ref, notes in (snapshot.get("reviewNotes") or {}).items():
        context = (snapshot.get("reviewContext") or {}).get(ref, {})
        value = value_at(snapshot, ref)
        binding = digest([ref, notes, context, value])
        reasons, _ = _reasons(value, False, context.get("targetName", ""))
        if target_comparison(value, context.get("targetName", "")):
            reasons["SAFETY"] = [c for c in reasons["SAFETY"] if c != "OTHER_PRODUCT"]
        if (
            len(context.get("passageIds", [])) > 1
            and "POSSIBLE_FRAGMENT" not in reasons["COPY_EDIT"]
        ):
            reasons["OWNER_CONFIRMATION"].append("CONTINUATION_CONTEXT")
        prompts = prompts_for(value, reasons) if context else []
        messages = list(dict.fromkeys(p["question"] for p in prompts)) if context else list(notes)
        if not messages:
            messages = ["현재 문구로 사용해도 괜찮은지 확인해 주세요."]
        decision = (snapshot.get("reviewDecisions") or {}).get(ref)
        pending = not decision or decision.get("bindingHash") != binding
        result[ref] = {
            "bindingHash": binding,
            "pending": pending,
            "messages": messages,
            "requiresNote": "PRICE_OR_FEE" in reasons["OWNER_CONFIRMATION"],
            "suggestedValue": context.get("suggestedValue"),
            "canKeep": bool(value.strip()) and not restricted(value, context),
            "originalValue": context.get("originalValue", value),
            "pages": context.get("pages", []),
            "decision": decision if not pending else None,
        }
    return result


def pending(snapshot):
    return [ref for ref, item in items(snapshot).items() if item["pending"]]


def refresh(snapshot):
    result = deepcopy(snapshot)
    result.pop("reviewItems", None)
    if result.get("reviewNotes"):
        result["sourceReviewRequired"] = bool(pending(result))
    return result


def decorate(snapshot):
    if not snapshot.get("reviewNotes"):
        return deepcopy(snapshot)
    return {**refresh(snapshot), "reviewItems": items(snapshot)}


def visible(snapshot):
    return {k: v for k, v in snapshot.items() if k not in (*OWNED, "reviewItems")}


def decide(db, farm, pid, body, actor_id):
    from app.source_analysis import service as s
    from app.source_analysis import workspace as w

    _, row = w.owned(db, farm, pid)
    s.version(row.version, body.version)
    before = items(row.snapshot).get(body.reference)
    if before is None:
        raise not_found("확인할 문구를 찾을 수 없어요.")
    if before["bindingHash"] != body.binding_hash:
        raise conflict("REVIEW_CHANGED", "문구나 확인 안내가 바뀌었어요. 다시 확인해 주세요.")
    # Save all in-flight text/media changes in this transaction. Any later rejection
    # rolls this save back as well; the browser retains its local inputs.
    w.save(db, farm, pid, w.PageSave(version=body.version, snapshot=body.snapshot))
    snapshot = deepcopy(row.snapshot)
    context = (snapshot.get("reviewContext") or {}).get(body.reference, {})
    value = value_at(snapshot, body.reference)
    decisions = dict(snapshot.get("reviewDecisions") or {})
    prior = decisions.get(body.reference)
    if body.action == "REOPEN":
        if prior and prior.get("action") == "OMIT" and not value.strip():
            set_value(snapshot, body.reference, prior.get("previousValue", ""))
            for link in prior.get("removedLinks", []):
                media = snapshot.get("design", {}).get("media", {}).get(link["mediaId"])
                if media is not None and link["kind"] not in media:
                    media[link["kind"]] = link["reference"]
        decisions.pop(body.reference, None)
    else:
        if body.action in {"KEEP", "EDIT"}:
            if not value.strip():
                raise invalid({"value": "문구를 입력하거나 본문에서 제외해 주세요."})
            if restricted(value, context):
                raise invalid({"value": "사용할 수 없는 표현을 수정하거나 본문에서 제외해 주세요."})
            if body.action == "EDIT" and value == context.get(
                "originalValue", before["originalValue"]
            ):
                raise invalid(
                    {
                        "value": (
                            "문구를 먼저 수정해 주세요. 그대로 사용하려면 확인했어요를 눌러 주세요."
                        )
                    }
                )
        if (
            body.action in {"KEEP", "EDIT"}
            and items(snapshot)[body.reference]["requiresNote"]
            and not body.note.strip()
        ):
            raise invalid({"note": "자료의 금액과 실제 판매 설정을 확인한 내용을 적어 주세요."})
        previous_value = value
        removed_links = []
        if body.action == "OMIT":
            set_value(snapshot, body.reference, "")
            # Keep picture and text identities stable. A removed caption cannot
            # remain attached to an image or become a dangling insertion anchor.
            for media_id, media in snapshot.get("design", {}).get("media", {}).items():
                for kind in ("captionRef", "afterTextRef"):
                    ref = media.get(kind)
                    if ref and f"{ref['moduleId']}:{ref['textIndex']}" == body.reference:
                        removed_links.append(
                            {"mediaId": media_id, "kind": kind, "reference": media.pop(kind)}
                        )
        from app.source_analysis.models import utcnow

        decisions[body.reference] = {
            "action": body.action,
            "actorId": actor_id,
            "previousValue": previous_value,
            "removedLinks": removed_links,
            "note": body.note.strip(),
            "at": utcnow().isoformat(),
        }
        snapshot["reviewDecisions"] = decisions
        decisions[body.reference]["bindingHash"] = items(snapshot)[body.reference]["bindingHash"]
    snapshot["reviewDecisions"] = decisions
    row.snapshot = refresh(snapshot)
    db.flush()
    return w.view(row)


def set_value(snapshot, reference, value):
    mid, index = reference.split(":")
    module = next(m for m in snapshot["modules"] if m["id"] == mid)
    module["texts"][int(index)]["value"] = value
