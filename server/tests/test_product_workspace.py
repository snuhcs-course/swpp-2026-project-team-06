from copy import deepcopy
from uuid import uuid4

from sqlalchemy import func, select

from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.source_analysis.models import Batch, ProductWorkspace
from tests.test_source_analysis import source_settings  # noqa: F401

BASE = "/api/source-analysis/product-workspaces"


def open_page(client, login, pid="p-house", key=None):
    return client.post(
        BASE,
        headers={**login("u-kang"), "Idempotency-Key": key or str(uuid4())},
        json={"productId": pid},
    )


def test_AC_SRC_1_atomic_creation_and_retry(client, login, monkeypatch):
    key = str(uuid4())
    first = open_page(client, login, None, key)
    assert first.status_code == 200, first.text
    assert open_page(client, login, None, key).json() == first.json()
    data = first.json()
    with get_sessionmaker()() as db:
        assert db.get(Product, data["productId"]).status == "DRAFT"
        assert db.get(Batch, data["batchId"]).targets[0]["productId"] == data["productId"]
        assert db.scalar(select(func.count()).select_from(ProductWorkspace)) == 1
        count = db.scalar(select(func.count()).select_from(Product))
    from app.core.errors import invalid
    from app.source_analysis import workspace

    def fail(*args):
        raise invalid({"workspace": "fixture"})

    monkeypatch.setattr(workspace.s, "create_batch", fail)
    assert open_page(client, login, None).status_code == 400
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Product)) == count


def test_AC_SRC_9_private_save_explicit_apply_without_original_sources(client, login):
    module = {
        "id": "taste",
        "texts": [{"fieldKey": "taste", "value": "original"}],
        "photos": [{"uri": "/photos/tangerine-box.jpg", "alt": "photo"}],
    }
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").module_detail = {"schemaVersion": 1, "modules": [module]}
        db.commit()
    row = open_page(client, login).json()
    assert row["snapshot"]["modules"][0]["photos"] == module["photos"]
    assert open_page(client, login).json()["batchId"] == row["batchId"]
    snapshot = deepcopy(row["snapshot"])
    snapshot["modules"][0]["texts"][0]["value"] = "edited"
    h = {**login("u-kang"), "Idempotency-Key": str(uuid4())}
    saved = client.put(
        BASE + "/p-house", headers=h, json={"version": row["version"], "snapshot": snapshot}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["hasUnpublishedChanges"]
    with get_sessionmaker()() as db:
        assert (
            db.get(Product, "p-house").module_detail["modules"][0]["texts"][0]["value"]
            == "original"
        )
    assert open_page(client, login).json()["snapshot"] == snapshot
    h["Idempotency-Key"] = str(uuid4())
    applied = client.post(
        BASE + "/p-house/apply", headers=h, json={"version": saved.json()["version"]}
    )
    assert applied.status_code == 200, applied.text
    assert not applied.json()["hasUnpublishedChanges"]
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        assert product.module_detail["modules"][0]["texts"][0]["value"] == "edited"
        assert product.module_detail["modules"][0]["photos"] == module["photos"]
        assert product.status == "PUBLISHED"


def test_AC_SRC_5_9_photo_and_version_guards(client, login):
    row = open_page(client, login).json()
    snap = deepcopy(row["snapshot"])
    snap["content"]["blocks"] = [
        {"id": "image", "type": "image", "uri": "/api/private/other", "alt": ""}
    ]
    h = {**login("u-kang"), "Idempotency-Key": str(uuid4())}
    assert (
        client.put(
            BASE + "/p-house", headers=h, json={"version": row["version"], "snapshot": snap}
        ).status_code
        == 400
    )
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").version += 1
        db.commit()
    h["Idempotency-Key"] = str(uuid4())
    assert (
        client.post(
            BASE + "/p-house/apply", headers=h, json={"version": row["version"]}
        ).status_code
        == 409
    )
    assert open_page(client, login, "p-other").status_code == 404


def test_AC_SRC_9_legacy_blocks_preserved(client, login):
    content = {
        "blocks": [{"id": "body", "type": "text", "title": "title", "body": "original\ntext"}]
    }
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.module_detail = None
        p.detail_content = content
        db.commit()
    assert open_page(client, login).json()["snapshot"]["content"] == content


def test_AC_SRC_9_conflict_discard_is_explicit_and_versioned(client, login):
    row = open_page(client, login).json()
    snap = deepcopy(row["snapshot"])
    snap["content"]["blocks"] = [{"id": "draft", "type": "text", "title": "", "body": "private"}]

    def headers():
        return {**login("u-kang"), "Idempotency-Key": str(uuid4())}

    saved = client.put(
        BASE + "/p-house", headers=headers(), json={"version": row["version"], "snapshot": snap}
    ).json()
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.detail_content = {
            "blocks": [{"id": "current", "type": "text", "title": "", "body": "external change"}]
        }
        p.version += 1
        db.get(Batch, row["batchId"]).deleted = True
        db.commit()
    # Deleting original sources does not prevent independent page editing.
    assert open_page(client, login).json()["snapshot"] == snap
    assert (
        client.post(
            BASE + "/p-house/apply", headers=headers(), json={"version": saved["version"]}
        ).status_code
        == 409
    )
    assert (
        client.post(
            BASE,
            headers=headers(),
            json={"productId": "p-house", "discardChanges": True, "version": row["version"]},
        ).status_code
        == 409
    )
    reset = client.post(
        BASE,
        headers=headers(),
        json={"productId": "p-house", "discardChanges": True, "version": saved["version"]},
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["snapshot"]["content"]["blocks"][0]["body"] == "external change"
    assert reset.json()["version"] > saved["version"]
    assert not reset.json()["hasUnpublishedChanges"]


def test_AC_SRC_5_private_product_photo_requires_owner(client, login):
    from app.source_analysis.models import PublicPhoto
    from app.source_analysis.storage import Storage

    with get_sessionmaker()() as db:
        photo = PublicPhoto(product_id="p-house", storage_key=Storage().put(b"image-fixture"))
        db.add(photo)
        db.flush()
        photo_id = photo.id
        db.commit()
    url = BASE + f"/p-house/photos/{photo_id}"
    assert client.get(url).status_code == 401
    response = client.get(url, headers=login("u-kang"))
    assert response.status_code == 200
    assert response.content == b"image-fixture"
    assert response.headers["cache-control"] == "no-store"
    assert (
        client.get(BASE + f"/p-other/photos/{photo_id}", headers=login("u-kang")).status_code == 404
    )
