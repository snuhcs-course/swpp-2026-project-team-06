"""DEV-464: persisted source layout retains owned photos and exact copy."""

from copy import deepcopy
from uuid import uuid4

from app.catalog.models import Product
from app.core.db import get_sessionmaker
from tests.test_source_analysis import source_settings  # noqa: F401
from tests.test_source_page_migration import open_composer

BASE = "/api/source-analysis/product-workspaces"


def layout(uri="/photos/basket.jpg"):
    return {
        "version": 1,
        "theme": "citrus-warm",
        "sections": [
            {
                "id": "intro",
                "group": "intro",
                "layout": "hero",
                "tone": "accent",
                "moduleIds": ["hero"],
                "mediaIds": ["fruit"],
            }
        ],
        "media": {
            "fruit": {
                "uri": uri,
                "alt": "Source fruit",
                "width": 400,
                "height": 300,
                "kind": "photo",
                "sourceId": "original",
                "sourceSha256": "a" * 64,
                "sourceRegionId": "fruit-region",
            }
        },
    }


def prepare(client, login):
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.module_detail = {
            "schemaVersion": 1,
            "modules": [
                {
                    "id": "hero",
                    "texts": [{"fieldKey": "name", "value": "Original complete paragraph"}],
                    "photos": [],
                    "illustrationId": None,
                }
            ],
            "design": layout(),
        }
        db.commit()
    return open_composer(client, login, composer=False)


def save(client, login, row, snapshot):
    return client.put(
        f"{BASE}/p-house",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json={"version": row["version"], "snapshot": snapshot},
    )


def test_AC_SRC_9_layout_and_copy_survive_private_edit_reopen_and_apply(client, login):
    row = prepare(client, login)
    assert row["snapshot"]["design"] == layout()
    snapshot = deepcopy(row["snapshot"])
    snapshot["modules"][0]["texts"][0]["value"] = "Edited complete paragraph"
    saved = save(client, login, row, snapshot)
    assert saved.status_code == 200, saved.text
    reopened = open_composer(client, login, composer=False)
    assert reopened["snapshot"] == snapshot
    with get_sessionmaker()() as db:
        assert (
            db.get(Product, "p-house").module_detail["modules"][0]["texts"][0]["value"]
            == "Original complete paragraph"
        )
    response = client.post(
        f"{BASE}/p-house/apply",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json={"version": reopened["version"]},
    )
    assert response.status_code == 200, response.text
    with get_sessionmaker()() as db:
        detail = db.get(Product, "p-house").module_detail
        assert detail["design"] == layout()
        assert detail["modules"][0]["texts"][0]["value"] == "Edited complete paragraph"


def test_AC_SRC_9_layout_cannot_reference_another_products_media(client, login):
    row = prepare(client, login)
    snapshot = deepcopy(row["snapshot"])
    snapshot["design"]["media"]["fruit"]["uri"] = "/api/source-media/foreign"
    response = save(client, login, row, snapshot)
    assert response.status_code == 400
    assert "photos" in response.json()["details"]["fields"]


def test_AC_SRC_9_layout_rejects_dangling_caption_and_dropped_content(client, login):
    row = prepare(client, login)
    snapshot = deepcopy(row["snapshot"])
    snapshot["design"]["media"]["fruit"]["captionRef"] = {"moduleId": "hero", "textIndex": 12}
    assert save(client, login, row, snapshot).status_code == 400
    snapshot = deepcopy(row["snapshot"])
    snapshot["design"]["sections"][0]["moduleIds"] = []
    assert save(client, login, row, snapshot).status_code == 400


def test_AC_04_8_restored_page_and_layout_apply_with_final_sale_atomically(client, login):
    from app.source_analysis.models import Batch

    row = prepare(client, login)
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.status, p.approved_supply_grams = "DRAFT", 0
        # Sales-term saving advanced the product version, without changing its page.
        p.version += 1
        product_version = p.version
        assert not db.get(Batch, row["batchId"]).source_copy_enabled
        db.commit()
    snapshot = deepcopy(row["snapshot"])
    snapshot["modules"][0]["texts"][0]["value"] = "Private revised copy"
    response = save(client, login, row, snapshot)
    assert response.status_code == 200, response.text
    preview = client.get(f"{BASE}/p-house/sale-preview", headers=login("u-kang")).json()
    assert preview["workspace"]["snapshot"]["design"] == layout()
    body = {
        "version": product_version,
        "requestedTotalGrams": 1000000,
        "page": {"draftId": "workspace-p-house", "draftVersion": response.json()["version"]},
    }
    submitted = client.post(
        "/api/products/p-house/capacity-requests",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json=body,
    )
    assert submitted.status_code == 200, submitted.text
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        assert p.status == "PENDING_APPROVAL"
        assert p.module_detail["design"] == layout()
        assert p.module_detail["modules"][0]["texts"][0]["value"] == "Private revised copy"


def test_AC_04_8_restored_sale_does_not_overwrite_a_concurrent_page_change(client, login):
    row = prepare(client, login)
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.status, p.approved_supply_grams = "DRAFT", 0
        p.module_detail = {
            **p.module_detail,
            "modules": [
                {
                    "id": "hero",
                    "texts": [{"fieldKey": "name", "value": "Changed in another session"}],
                    "photos": [],
                }
            ],
        }
        version = p.version
        db.commit()
    response = client.post(
        "/api/products/p-house/capacity-requests",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json={
            "version": version,
            "requestedTotalGrams": 1000000,
            "page": {"draftId": "workspace-p-house", "draftVersion": row["version"]},
        },
    )
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "SOURCE_PAGE_CHANGED"
    with get_sessionmaker()() as db:
        assert db.get(Product, "p-house").status == "DRAFT"


def test_AC_SRC_9_design_only_picture_is_served_only_while_publicly_referenced(client, login):
    import io

    from PIL import Image

    from app.source_analysis.models import PublicPhoto
    from app.source_analysis.storage import Storage

    image = io.BytesIO()
    Image.new("RGB", (24, 24), "orange").save(image, "PNG")
    prepare(client, login)
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        photo = PublicPhoto(product_id=p.id, storage_key=Storage().put(image.getvalue()))
        db.add(photo)
        db.flush()
        uri = "/api/source-media/" + photo.id
        p.module_detail = {**p.module_detail, "design": layout(uri)}
        db.commit()
    assert client.get(uri).status_code == 200
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.status = "DRAFT"
        db.commit()
    assert client.get(uri).status_code == 404


def test_AC_SRC_9_product_card_entry_preserves_source_layout_instead_of_flattening(client, login):
    before = prepare(client, login)
    opened = open_composer(client, login, composer=True)
    assert opened["composerBlocked"] == "SOURCE_LAYOUT"
    assert opened["composer"] is False
    assert opened["snapshot"] == before["snapshot"]


def test_AC_SRC_5_recovery_never_auto_approves_unreviewed_source_copy(client, login):
    from app.source_analysis.models import ProductWorkspace

    row = prepare(client, login)
    with get_sessionmaker()() as db:
        w = db.get(ProductWorkspace, "p-house")
        w.snapshot = {
            **w.snapshot,
            "sourceReviewRequired": True,
            "reviewNotes": {"hero:0": ["Verify the current product"]},
        }
        db.commit()
    snapshot = {**row["snapshot"], "sourceReviewRequired": False, "reviewNotes": {}}
    response = save(client, login, row, snapshot)
    assert response.status_code == 200, response.text
    assert response.json()["snapshot"]["sourceReviewRequired"] is True
    assert response.json()["snapshot"]["reviewNotes"] == {"hero:0": ["Verify the current product"]}
    result = client.post(
        f"{BASE}/p-house/apply",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json={"version": response.json()["version"]},
    )
    assert result.status_code == 409, result.text
    assert result.json()["details"]["reason"] == "SOURCE_REVIEW_REQUIRED"
