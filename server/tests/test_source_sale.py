"""DEV-452: initial sale reviews and applies a private page atomically."""

from uuid import uuid4

from sqlalchemy import select

from app.catalog.models import CapacityRequest, Product
from app.core.db import get_sessionmaker
from app.source_analysis.models import Batch, Draft
from tests.test_source_analysis import drain, source_settings, start, upload  # noqa: F401
from tests.test_source_page_migration import SOURCE, open_composer, set_modules

BASE = "/api/source-analysis/product-workspaces"


def setup_page(client, login):
    set_modules()
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.status, p.approved_supply_grams = "DRAFT", 0
        db.commit()
    row = open_composer(client, login)
    with get_sessionmaker()() as db:
        b = db.get(Batch, row["batchId"])
        b.source_copy_enabled = True
        db.commit()
    response = client.get(f"{BASE}/p-house/sale-preview", headers=login("u-kang"))
    assert response.status_code == 200, response.text
    return response.json()


def submit(client, login, preview, page=True, **overrides):
    product = client.get("/api/products/mine/p-house", headers=login("u-kang")).json()
    body = {"version": product["version"], "requestedTotalGrams": 1000000}
    if page:
        body["page"] = {
            "draftId": preview["draft"]["id"],
            "draftVersion": preview["draft"]["version"],
        }
    body.update(overrides)
    return client.post(
        "/api/products/p-house/capacity-requests",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json=body,
    )


def test_AC_04_8_private_page_is_applied_only_with_reviewed_sale(client, login):
    preview = setup_page(client, login)
    assert preview["current"] and not preview["processingIssues"]
    missing = submit(client, login, preview, page=False)
    assert (
        missing.status_code == 409 and missing.json()["details"]["reason"] == "SOURCE_PAGE_REQUIRED"
    )
    result = submit(client, login, preview)
    assert result.status_code == 200, result.text
    with get_sessionmaker()() as db:
        assert db.get(Product, "p-house").status == "PENDING_APPROVAL"
        assert db.scalar(select(CapacityRequest).where(CapacityRequest.product_id == "p-house"))


def test_AC_04_8_changed_page_requires_new_preview(client, login):
    preview = setup_page(client, login)
    with get_sessionmaker()() as db:
        db.get(Draft, preview["draft"]["id"]).version += 1
        db.commit()
    result = submit(client, login, preview)
    assert result.status_code == 409 and result.json()["details"]["reason"] == "SOURCE_PAGE_CHANGED"
    with get_sessionmaker()() as db:
        assert db.get(Product, "p-house").status == "DRAFT"


def test_AC_04_8_failed_reading_is_private_and_cannot_bypass_sale(client, login):
    preview = setup_page(client, login)
    h = login("u-kang")
    batch = client.get(f"{SOURCE}/{preview['batch']['id']}", headers=h).json()
    upload(client, h, batch)
    start(client, h, batch["id"])
    current = client.get(f"{BASE}/p-house/sale-preview", headers=h)
    assert current.status_code == 200 and current.json()["processingIssues"]
    result = submit(client, login, preview, page=False)
    assert (
        result.status_code == 409
        and result.json()["details"]["reason"] == "SOURCE_PROCESSING_INCOMPLETE"
    )
    with get_sessionmaker()() as db:
        assert db.get(Product, "p-house").status == "DRAFT"
        assert (
            db.scalar(select(CapacityRequest).where(CapacityRequest.product_id == "p-house"))
            is None
        )


def test_AC_04_8_invalid_sales_roll_back_page_application(client, login):
    preview = setup_page(client, login)
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        p.variety = ""
        p.module_detail = None
        version = p.version
        db.commit()
    result = submit(client, login, preview)
    assert result.status_code == 400, result.text
    with get_sessionmaker()() as db:
        p = db.get(Product, "p-house")
        assert p.status == "DRAFT" and p.module_detail is None and p.version == version


def test_AC_SRC_1_upload_first_allows_missing_product_hint(client, login):
    h = login("u-kang")
    response = client.post(
        BASE,
        headers={**h, "Idempotency-Key": str(uuid4())},
        json={"composer": True, "sourceCopyEnabled": True},
    )
    assert response.status_code == 200, response.text
    row = response.json()
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=h).json()
    upload(client, h, batch)
    start(client, h, batch["id"])
    drain()


def test_AC_04_8_sale_preview_is_owner_only(client, login, other_farm_headers):
    setup_page(client, login)
    result = client.get(f"{BASE}/p-house/sale-preview", headers=other_farm_headers)
    assert result.status_code == 404
