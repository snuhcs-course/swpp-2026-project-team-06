"""Private flagged drafts and explicit source-bound public review are separate."""

from copy import deepcopy

import pytest
from sqlalchemy import select

from app.catalog.models import Product, StagePrice
from app.core.db import get_sessionmaker
from app.source_analysis.models import Candidate
from tests.test_source_analysis import source_settings  # noqa: F401
from tests.test_source_copy_service import PREFIX, get_plan, key, ready
from tests.test_source_editor import body_for


def flagged(client, login, quote="가격은 5,000원이며 올해 판매합니다."):
    headers, batch = ready(client, login)
    with get_sessionmaker()() as db:
        candidates = list(db.scalars(select(Candidate).where(Candidate.batch_id == batch["id"])))
        candidate = next(c for c in candidates if c.field_key == "summary")
        candidate.value = quote
        candidate.evidence = [{**candidate.evidence[0], "quote": quote}]
        db.commit()
    state, target_id = get_plan(client, headers, batch)
    enabled = client.post(
        f"{PREFIX}/{batch['id']}/source-copy/enable",
        headers=key(headers),
        json={"reviewVersion": state["reviewVersion"]},
    )
    assert enabled.status_code == 200, enabled.text
    return headers, batch, target_id


def save_private(client, headers, batch):
    body = body_for(client, headers, batch)
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(headers), json=body)
    assert saved.status_code == 200, saved.text
    return saved.json()["drafts"][0]


def resolve(client, headers, batch, target_id, *, action="KEEP", note="판매 설정과 현재 정보 확인"):
    state, _ = get_plan(client, headers, batch)
    decisions = [
        {
            "bindingHash": p["bindingHash"],
            "action": action if p["module"] == "summary" else "OMIT",
            "note": note,
        }
        for p in state["plan"]["passages"]
    ]
    return client.put(
        f"{PREFIX}/{batch['id']}/source-copy/{target_id}",
        headers=key(headers),
        json={
            "reviewVersion": state["reviewVersion"],
            "planHash": state["plan"]["planHash"],
            "decisions": decisions,
        },
    )


def apply(client, headers, batch, draft):
    product = client.get("/api/products/mine/p-house", headers=headers).json()
    return client.post(
        f"{PREFIX}/{batch['id']}/drafts/{draft['id']}/apply",
        headers=key(headers),
        json={
            "productId": "p-house",
            "productVersion": product["version"],
            "draftVersion": draft["version"],
        },
    )


def test_AC_SRC_2_10_flagged_price_is_private_saved_reopened_then_reviewed_before_apply(
    client, login
):
    headers, batch, tid = flagged(client, login)
    with get_sessionmaker()() as db:
        original = deepcopy(db.get(Product, "p-house").module_detail)
        prices = list(
            db.scalars(select(StagePrice.price).where(StagePrice.product_id == "p-house"))
        )
        shipping_fee = db.get(Product, "p-house").shipping_fee
    draft = save_private(client, headers, batch)
    texts = [t["value"] for m in draft["snapshot"]["previewModules"] for t in m["texts"]]
    assert any("5,000원" in t and "올해" in t for t in texts)
    reopened = body_for(client, headers, batch)
    assert any("5,000원" in f["value"] for f in reopened["fields"])
    blocked = apply(client, headers, batch, draft)
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["details"]["reason"] == "SOURCE_REVIEW_PENDING"
    with get_sessionmaker()() as db:
        assert db.get(Product, "p-house").module_detail == original
    missing_note = resolve(client, headers, batch, tid, note="")
    assert missing_note.status_code == 400, missing_note.text
    reviewed = resolve(client, headers, batch, tid)
    assert reviewed.status_code == 200, reviewed.text
    assert all(not p["reviewPending"] for p in reviewed.json()["plan"]["passages"])
    draft = save_private(client, headers, batch)
    applied = apply(client, headers, batch, draft)
    assert applied.status_code == 200, applied.text
    with get_sessionmaker()() as db:
        assert (
            list(db.scalars(select(StagePrice.price).where(StagePrice.product_id == "p-house")))
            == prices
        )
        assert db.get(Product, "p-house").shipping_fee == shipping_fee
        assert "5,000원" in str(db.get(Product, "p-house").module_detail)


@pytest.mark.parametrize("quote", ["감기를 치료하는 감귤입니다.", "최고의 감귤입니다."])
def test_AC_SRC_7_flagged_health_and_marketing_save_private_but_unresolved_cannot_apply(
    client, login, quote
):
    headers, batch, tid = flagged(client, login, quote)
    draft = save_private(client, headers, batch)
    assert quote in str(draft["snapshot"]["previewModules"])
    blocked = apply(client, headers, batch, draft)
    assert blocked.status_code == 409, blocked.text
    if "치료" in quote:
        assert resolve(client, headers, batch, tid).status_code == 400
    else:
        assert resolve(client, headers, batch, tid).status_code == 200
        assert (
            apply(client, headers, batch, save_private(client, headers, batch)).status_code == 200
        )


def test_AC_SRC_10_legacy_workspace_apply_also_gates_source_warnings(client, login):
    headers = login("u-kang")
    opened = client.post(
        "/api/source-analysis/product-workspaces",
        headers=key(headers),
        json={"productId": "p-house", "sourceCopyEnabled": True},
    )
    assert opened.status_code == 200, opened.text
    workspace = opened.json()
    from app.source_analysis.models import Batch
    from tests.test_source_analysis import drain, start, upload

    batch = client.get(f"{PREFIX}/{workspace['batchId']}", headers=headers).json()
    upload(client, headers, batch)
    start(client, headers, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        # Use an actual current extracted candidate; the legacy editor must not bypass it.
        c = db.scalar(select(Candidate).where(Candidate.batch_id == batch["id"]))
        c.value = "올해 판매합니다."
        c.evidence = [{**c.evidence[0], "quote": c.value}]
        assert db.get(Batch, batch["id"]).source_copy_enabled is True
        db.commit()
    snapshot = deepcopy(workspace["snapshot"])
    snapshot["kind"] = workspace["snapshot"]["kind"]
    saved = client.put(
        "/api/source-analysis/product-workspaces/p-house",
        headers=key(headers),
        json={"version": workspace["version"], "snapshot": snapshot},
    )
    assert saved.status_code == 200, saved.text
    blocked = client.post(
        "/api/source-analysis/product-workspaces/p-house/apply",
        headers=key(headers),
        json={"version": saved.json()["version"]},
    )
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["details"]["reason"] == "SOURCE_REVIEW_PENDING"


def test_AC_SRC_3_11_common_scope_warning_private_refined_save_uses_exact_plan_signature(
    client, login
):
    from app.source_analysis.models import Batch
    from tests.test_source_analysis import create, drain, start, upload

    headers = login("u-kang")
    batch = create(client, headers, count=2)
    upload(client, headers, batch)
    start(client, headers, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        db.get(Batch, batch["id"]).source_copy_enabled = True
        c = db.scalar(
            select(Candidate).where(
                Candidate.batch_id == batch["id"],
                Candidate.field_key == "summary",
            )
        )
        c.target_id = None
        c.value = "달콤한 감귤입니다."
        c.evidence = [{**c.evidence[0], "quote": c.value}]
        db.commit()
    state, _ = get_plan(client, headers, batch)
    common = next(p for p in state["plan"]["passages"] if p["value"] == "달콤한 감귤입니다.")
    assert common["includedInDraft"] is True
    assert common["reviewPending"] is True
    body = body_for(client, headers, batch)
    body["fields"] = [f for f in body["fields"] if f["targetId"] == batch["targets"][0]["id"]]
    summary = next(
        f
        for f in body["fields"]
        if f["fieldKey"] == "summary" and f["targetId"] == batch["targets"][0]["id"]
    )
    assert "달콤한 감귤입니다." in summary["value"]
    assert summary["provenance"] == "REFINED"
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(headers), json=body)
    assert saved.status_code == 200, saved.text
    forged = body_for(client, headers, batch)
    forged["fields"] = [f for f in forged["fields"] if f["targetId"] == batch["targets"][0]["id"]]
    next(f for f in forged["fields"] if f["fieldKey"] == "summary")["value"] += " 변조"
    rejected = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(headers), json=forged)
    assert rejected.status_code in {400, 409}, rejected.text


def test_AC_SRC_10_legacy_saved_snapshot_cannot_republish_omitted_source_after_review(
    client, login
):
    headers = login("u-kang")
    opened = client.post(
        "/api/source-analysis/product-workspaces",
        headers=key(headers),
        json={"productId": "p-house", "sourceCopyEnabled": True},
    )
    assert opened.status_code == 200, opened.text
    workspace = opened.json()
    from tests.test_source_analysis import drain, start, upload

    batch = client.get(f"{PREFIX}/{workspace['batchId']}", headers=headers).json()
    upload(client, headers, batch)
    start(client, headers, batch["id"])
    drain()
    state, tid = get_plan(client, headers, batch)
    passage = state["plan"]["passages"][0]
    quote = passage["originalValue"]
    snapshot = deepcopy(workspace["snapshot"])

    def set_text(value):
        if snapshot["kind"] == "modules":
            snapshot["modules"] = [
                {
                    "id": "summary",
                    "enabled": True,
                    "texts": [{"fieldKey": "summary", "value": value}],
                    "photos": [],
                    "illustrationId": None,
                }
            ]
        else:
            snapshot["content"] = {
                "blocks": [
                    {
                        "id": "story",
                        "type": "text",
                        "title": "",
                        "body": value,
                    }
                ]
            }

    set_text(quote)
    base = "/api/source-analysis/product-workspaces/p-house"
    saved = client.put(
        base,
        headers=key(headers),
        json={
            "version": workspace["version"],
            "snapshot": snapshot,
        },
    )
    assert saved.status_code == 200, saved.text
    reviewed = resolve(client, headers, batch, tid, action="OMIT")
    assert reviewed.status_code == 200, reviewed.text
    blocked = client.post(
        base + "/apply",
        headers=key(headers),
        json={
            "version": saved.json()["version"],
        },
    )
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["details"]["reason"] == "SOURCE_REVIEW_CHANGED"
    snapshot["sourceReviewVersion"] = 999999  # client metadata is never trusted
    resaved = client.put(
        base,
        headers=key(headers),
        json={
            "version": saved.json()["version"],
            "snapshot": snapshot,
        },
    )
    assert resaved.status_code == 200, resaved.text
    assert resaved.json()["snapshot"]["sourceReviewVersion"] == reviewed.json()["reviewVersion"]
    excluded = client.post(
        base + "/apply",
        headers=key(headers),
        json={
            "version": resaved.json()["version"],
        },
    )
    assert excluded.status_code == 409, excluded.text
    assert excluded.json()["details"]["reason"] == "SOURCE_REVIEW_CHANGED"
    set_text("농가가 직접 작성한 별도의 소개입니다.")
    clean = client.put(
        base,
        headers=key(headers),
        json={
            "version": resaved.json()["version"],
            "snapshot": snapshot,
        },
    )
    assert clean.status_code == 200, clean.text
    applied = client.post(
        base + "/apply",
        headers=key(headers),
        json={
            "version": clean.json()["version"],
        },
    )
    assert applied.status_code == 200, applied.text
