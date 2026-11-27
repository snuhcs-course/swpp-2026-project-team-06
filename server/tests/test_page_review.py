"""DEV-452: actionable page suggestions use producer decisions, never UI-only dismissal."""

from copy import deepcopy
from uuid import uuid4

import pytest

from app.core.db import get_sessionmaker
from app.source_analysis.models import ProductWorkspace
from tests.test_source_analysis import source_settings  # noqa: F401
from tests.test_source_page_migration import open_composer
from tests.test_story_design import BASE, prepare, save


def ready(client, login, value="Original complete paragraph", notes=1):
    prepare(client, login)
    with get_sessionmaker()() as db:
        w = db.get(ProductWorkspace, "p-house")
        snap = deepcopy(w.snapshot)
        snap["modules"][0]["texts"][0]["value"] = value
        if notes == 2:
            snap["modules"][0]["texts"].append(
                {"fieldKey": "hero", "value": "Another complete paragraph"}
            )
        snap.update(
            sourceReviewRequired=True,
            reviewNotes={f"hero:{i}": ["Verify this passage"] for i in range(notes)},
            reviewContext={
                f"hero:{i}": {
                    "targetName": "테스트 상품",
                    "originalValue": snap["modules"][0]["texts"][i]["value"],
                    "pages": [5],
                }
                for i in range(notes)
            },
        )
        w.snapshot = snap
        db.commit()
    return open_composer(client, login, composer=False)


def decide(client, login, row, action="KEEP", ref="hero:0", snapshot=None, headers=None, **extra):
    body = {
        "version": row["version"],
        "snapshot": snapshot or row["snapshot"],
        "reference": ref,
        "action": action,
        "bindingHash": row["snapshot"]["reviewItems"][ref]["bindingHash"],
        **extra,
    }
    return client.post(
        f"{BASE}/p-house/review-decisions",
        headers=headers or {**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json=body,
    )


def test_AC_SRC_11_confirm_one_preserves_other_edits_and_survives_reopen(client, login):
    row = ready(client, login, notes=2)
    snap = deepcopy(row["snapshot"])
    snap["modules"][0]["texts"][1]["value"] = "Unsaved unrelated edit"
    response = decide(client, login, row, snapshot=snap)
    assert response.status_code == 200, response.text
    reopened = open_composer(client, login, composer=False)
    assert reopened["snapshot"]["reviewItems"]["hero:0"]["pending"] is False
    assert reopened["snapshot"]["reviewItems"]["hero:1"]["pending"] is True
    assert reopened["snapshot"]["modules"][0]["texts"][1]["value"] == "Unsaved unrelated edit"
    assert reopened["snapshot"]["sourceReviewRequired"] is True


def test_AC_SRC_11_edit_and_later_changes_reopen_the_confirmation(client, login):
    row = ready(client, login)
    snap = deepcopy(row["snapshot"])
    snap["modules"][0]["texts"][0]["value"] = "Producer corrected sentence"
    response = decide(client, login, row, "EDIT", snapshot=snap)
    assert response.status_code == 200, response.text
    row = response.json()
    assert row["snapshot"]["sourceReviewRequired"] is False
    snap = deepcopy(row["snapshot"])
    snap["modules"][0]["texts"][0]["value"] = "Changed after confirmation"
    changed = save(client, login, row, snap)
    assert changed.status_code == 200, changed.text
    assert changed.json()["snapshot"]["sourceReviewRequired"] is True


def test_AC_SRC_11_excluding_a_caption_keeps_photo_and_undo_restores_both(client, login):
    row = ready(client, login)
    with get_sessionmaker()() as db:
        w = db.get(ProductWorkspace, "p-house")
        snap = deepcopy(w.snapshot)
        snap["design"]["media"]["fruit"]["captionRef"] = {"moduleId": "hero", "textIndex": 0}
        w.snapshot = snap
        db.commit()
    row = open_composer(client, login, composer=False)
    result = decide(client, login, row, "OMIT")
    assert result.status_code == 200, result.text
    row = result.json()
    assert row["snapshot"]["modules"][0]["texts"][0]["value"] == ""
    assert "fruit" in row["snapshot"]["design"]["media"]
    assert "captionRef" not in row["snapshot"]["design"]["media"]["fruit"]
    undone = decide(client, login, row, "REOPEN")
    assert undone.status_code == 200, undone.text
    snap = undone.json()["snapshot"]
    assert snap["modules"][0]["texts"][0]["value"] == "Original complete paragraph"
    assert snap["design"]["media"]["fruit"]["captionRef"]["textIndex"] == 0
    assert snap["sourceReviewRequired"] is True


def test_AC_SRC_5_restricted_copy_requires_safe_edit_or_exclusion(client, login):
    row = ready(client, login, value="당뇨를 치료합니다.")
    assert row["snapshot"]["reviewItems"]["hero:0"]["canKeep"] is False
    assert decide(client, login, row).status_code == 400
    reopened = open_composer(client, login, composer=False)
    assert reopened["version"] == row["version"]
    snap = deepcopy(row["snapshot"])
    snap["modules"][0]["texts"][0]["value"] = "직접 키운 과일입니다."
    corrected = decide(client, login, row, "EDIT", snapshot=snap)
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["snapshot"]["sourceReviewRequired"] is False


def test_AC_SRC_5_target_comparison_is_not_a_wrong_product_keep_block(client, login):
    row = ready(
        client,
        login,
        value="한라봉, 천혜향, 황금향은 다르지만 테스트 상품은 껍질을 쉽게 벗길 수 있습니다.",
    )
    assert row["snapshot"]["reviewItems"]["hero:0"]["canKeep"] is True
    assert not any(
        "다른 상품의 설명" in m for m in row["snapshot"]["reviewItems"]["hero:0"]["messages"]
    )
    assert decide(client, login, row).status_code == 200


def test_AC_SRC_5_money_requires_recorded_confirmation_note(client, login):
    row = ready(client, login, value="5kg 35,000원")
    assert row["snapshot"]["reviewItems"]["hero:0"]["requiresNote"] is True
    assert decide(client, login, row).status_code == 400
    response = decide(client, login, row, note="현재 판매 설정의 금액과 일치함을 확인했습니다.")
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("change", ["version", "binding", "foreign_photo"])
def test_AC_SRC_9_stale_or_invalid_decision_fails_atomically(client, login, change):
    row = ready(client, login)
    snap = deepcopy(row["snapshot"])
    snap["modules"][0]["texts"][0]["value"] = "Local edit must stay in browser after failure"
    extra = {}
    if change == "version":
        row["version"] += 1
    elif change == "binding":
        extra["bindingHash"] = "a" * 64
    else:
        snap["design"]["media"]["fruit"]["uri"] = "/api/source-media/another-owner"
    result = decide(client, login, row, "EDIT", snapshot=snap, **extra)
    assert result.status_code in [400, 409], result.text
    reopened = open_composer(client, login, composer=False)
    assert reopened["snapshot"]["modules"][0]["texts"][0]["value"] == "Original complete paragraph"
    assert reopened["snapshot"]["reviewItems"]["hero:0"]["pending"] is True


def test_AC_SRC_9_other_owner_cannot_decide(client, login, other_farm_headers):
    row = ready(client, login)
    response = decide(
        client, login, row, headers={**other_farm_headers, "Idempotency-Key": str(uuid4())}
    )
    assert response.status_code == 404


def test_AC_SRC_5_confirmed_suggestions_do_not_clear_incomplete_reading(client, login):
    row = ready(client, login)
    with get_sessionmaker()() as db:
        w = db.get(ProductWorkspace, "p-house")
        w.snapshot = {**w.snapshot, "sourceProcessingIncomplete": True}
        db.commit()
    row = open_composer(client, login, composer=False)
    result = decide(client, login, row)
    assert result.status_code == 200, result.text
    row = result.json()
    assert row["snapshot"]["sourceReviewRequired"] is False
    snap = deepcopy(row["snapshot"])
    snap["sourceProcessingIncomplete"] = False
    result = save(client, login, row, snap)
    assert result.status_code == 200, result.text
    assert result.json()["snapshot"]["sourceProcessingIncomplete"] is True
    response = client.post(
        f"{BASE}/p-house/apply",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json={"version": result.json()["version"]},
    )
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "SOURCE_PROCESSING_INCOMPLETE"
