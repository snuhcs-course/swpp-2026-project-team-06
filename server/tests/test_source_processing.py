"""AC-SRC-5/10/11: private incomplete drafts, public gates, and partial retry scope."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Batch, Item, Run
from app.source_analysis.processing import issues, require_complete
from tests.test_source_analysis import source_settings  # noqa: F401
from tests.test_source_copy_publication import apply, save_private
from tests.test_source_copy_service import PREFIX, ready


def failed_item(db, bid, *, diagnostics=None, status="FAILED", error="REQUEST_UNCERTAIN"):
    item = db.scalar(select(Item).join(Run).where(Run.batch_id == bid, Item.phase == "EXTRACT"))
    item.status, item.error = status, error
    item.diagnostics = diagnostics or {}
    return item


@pytest.mark.parametrize(
    "status,diagnostics,error",
    [
        ("FAILED", {}, "REQUEST_UNCERTAIN"),
        ("CANCELLED", {}, None),
        ("PARTIAL", {"pagesFailed": [{"number": 2, "code": "REQUEST_UNCERTAIN"}]}, None),
        ("PARTIAL", {"chunksFailed": [{"pages": [2]}]}, None),
        ("SUCCEEDED", {"pagesSkipped": 2}, None),
    ],
)
def test_AC_SRC_5_incomplete_private_save_survives_public_apply_block(
    client, login, status, diagnostics, error
):
    headers, batch = ready(client, login)
    with get_sessionmaker()() as db:
        failed_item(db, batch["id"], diagnostics=diagnostics, status=status, error=error)
        db.commit()
    review = client.get(f"{PREFIX}/{batch['id']}/review", headers=headers).json()
    assert review["processingIssues"]
    draft = save_private(client, headers, batch)
    response = apply(client, headers, batch, draft)
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "SOURCE_PROCESSING_INCOMPLETE"
    reopened = client.get(f"{PREFIX}/{batch['id']}/drafts", headers=headers)
    assert reopened.status_code == 200


def test_AC_SRC_5_retry_one_chunk_does_not_clear_other_failed_chunk(client, login):
    _, batch = ready(client, login)
    with get_sessionmaker()() as db:
        item = failed_item(db, batch["id"])
        source = db.get(Asset, item.asset_id)
        old = db.get(Run, item.run_id)
        first = item.pages
        second = [{"number": 999, "spanIds": ["other"]}]
        db.add(
            Item(
                run_id=old.id,
                asset_id=source.id,
                revision=source.revision,
                target_ids=item.target_ids,
                phase="EXTRACT",
                pages=second,
                sanitization_version=source.sanitization_version,
                status="FAILED",
                error="REQUEST_UNCERTAIN",
            )
        )
        new = Run(
            batch_id=batch["id"],
            mode=old.mode,
            model=old.model,
            targets=old.targets,
            created_at=old.created_at + timedelta(seconds=1),
        )
        db.add(new)
        db.flush()
        db.add(
            Item(
                run_id=new.id,
                asset_id=source.id,
                revision=source.revision,
                target_ids=item.target_ids,
                phase="EXTRACT",
                pages=first,
                sanitization_version=source.sanitization_version,
                status="SUCCEEDED",
            )
        )
        db.flush()
        remaining = issues(db, db.get(Batch, batch["id"]), item.target_ids[0])
        assert len(remaining) == 1
        assert remaining[0]["runId"] == old.id
        source.deleted = True
        assert issues(db, db.get(Batch, batch["id"]), item.target_ids[0]) == []


def test_AC_SRC_5_content_rejection_is_not_unread_processing(client, login):
    _, batch = ready(client, login)
    with get_sessionmaker()() as db:
        item = failed_item(db, batch["id"], error="CANDIDATES_REJECTED")
        assert issues(db, db.get(Batch, batch["id"]), item.target_ids[0]) == []


def test_AC_SRC_5_other_target_and_deleted_source_do_not_block(client, login):
    _, batch = ready(client, login)
    with get_sessionmaker()() as db:
        item = failed_item(db, batch["id"])
        row = db.get(Batch, batch["id"])
        source = db.get(Asset, item.asset_id)
        source.common = False
        source.target_ids = item.target_ids
        require_complete(db, row, "other-target")
        source.deleted = True
        require_complete(db, row, item.target_ids[0])


@pytest.mark.parametrize("path", ["apply", "apply-all"])
def test_AC_SRC_10_workspace_and_product_apply_cannot_bypass_processing(client, login, path):
    from tests.test_source_analysis import drain, key, start, upload

    headers = login("u-kang")
    base = "/api/source-analysis/product-workspaces"
    opened = client.post(base, headers=key(headers), json={"productId": "p-house"})
    assert opened.status_code == 200, opened.text
    view = opened.json()
    batch = client.get(f"{PREFIX}/{view['batchId']}", headers=headers).json()
    upload(client, headers, batch)
    start(client, headers, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        failed_item(db, batch["id"])
        db.commit()
    saved = client.put(
        f"{base}/p-house",
        headers=key(headers),
        json={"version": view["version"], "snapshot": view["snapshot"]},
    )
    assert saved.status_code == 200, saved.text
    response = client.post(
        f"{base}/p-house/{path}", headers=key(headers), json={"version": saved.json()["version"]}
    )
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "SOURCE_PROCESSING_INCOMPLETE"


def test_AC_SRC_5_common_material_retry_is_resolved_per_target(client, login):
    _, batch = ready(client, login)
    with get_sessionmaker()() as db:
        item = failed_item(db, batch["id"])
        source = db.get(Asset, item.asset_id)
        source.common = True
        tid = item.target_ids[0]
        old = db.get(Run, item.run_id)
        newer = Run(
            batch_id=old.batch_id,
            mode=old.mode,
            model=old.model,
            targets=old.targets,
            created_at=old.created_at + timedelta(seconds=1),
        )
        db.add(newer)
        db.flush()
        success = Item(
            run_id=newer.id,
            asset_id=source.id,
            revision=source.revision,
            target_ids=["other"],
            phase="EXTRACT",
            pages=item.pages,
            sanitization_version=source.sanitization_version,
            status="SUCCEEDED",
        )
        db.add(success)
        db.flush()
        assert issues(db, db.get(Batch, batch["id"]), tid)
        success.target_ids = [tid, "other"]
        assert issues(db, db.get(Batch, batch["id"]), tid) == []
