"""DEV-58 two input boxes and description-only placement; no paid network calls."""

import io

from PIL import Image
from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Item, Run
from tests.test_source_analysis import (  # noqa: F401
    PREFIX,
    create,
    drain,
    source_settings,
    start,
    upload,
)


def photo(client, h, batch, description="배송 박스 포장"):
    image = io.BytesIO()
    Image.new("RGB", (24, 24), "orange").save(image, "PNG")
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    result = client.post(
        f"{PREFIX}/{batch['id']}/sources",
        headers=h,
        data={"batchVersion": current["version"], "common": "true", "originalPhoto": "true"},
        files={"file": ("photo.png", image.getvalue(), "image/png")},
    )
    assert result.status_code == 201, result.text
    asset = result.json()
    response = client.put(
        f"{PREFIX}/{batch['id']}/sources/{asset['id']}/details",
        headers=h,
        json={
            "sourceVersion": asset["revision"],
            "descriptionVersion": asset["descriptionVersion"],
            "description": description,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_AC_SRC_11_photos_skip_ocr_and_place_from_description(client, login, monkeypatch):
    h = login("u-kang")
    batch = create(client, h)
    asset = photo(client, h, batch)
    from app.source_analysis import worker

    monkeypatch.setattr(
        worker, "prepare", lambda *_: (_ for _ in ()).throw(AssertionError("photo OCR forbidden"))
    )
    run = start(client, h, batch["id"])
    drain()
    result = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    target = next(e for e in result["editorFields"] if e["field"]["fieldKey"] == "packagePhoto")
    assert target["field"]["photoAssetIds"] == [asset["id"]]
    assert target["field"]["value"] == ""
    with get_sessionmaker()() as db:
        assert db.get(Run, run["id"]).status == "SUCCEEDED"
        assert not list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "EXTRACT"))
        )
        assert db.get(Asset, asset["id"]).placement["fieldKey"] == "packagePhoto"


def test_AC_SRC_11_ambiguous_photo_stays_unplaced(client, login):
    h = login("u-kang")
    batch = create(client, h)
    asset = photo(client, h, batch, "잘 찍은 사진")
    start(client, h, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        assert db.get(Asset, asset["id"]).placement["fieldKey"] is None


def test_AC_SRC_11_text_edit_versions_and_ownership(client, login):
    h = login("u-kang")
    batch = create(client, h)
    asset = upload(client, h, batch)
    url = f"{PREFIX}/{batch['id']}/sources/{asset['id']}"
    before = client.get(url + "/text", headers=h)
    assert before.status_code == 200
    update = {"sourceVersion": 1, "text": "새 보관 안내"}
    assert client.put(url + "/details", headers=h, json=update).status_code == 200
    assert client.get(url + "/text", headers=h).json()["text"] == "새 보관 안내"
    assert client.put(url + "/details", headers=h, json=update).status_code == 409
    assert client.get(url + "/text", headers=login("u-misook")).status_code in (403, 404)


def test_AC_SRC_11_workspace_photo_private_until_apply(client, login, other_farm_headers):
    from uuid import uuid4

    h = login("u-kang")
    base = "/api/source-analysis/product-workspaces"
    row = client.post(
        base, headers={**h, "Idempotency-Key": str(uuid4())}, json={"productId": "p-house"}
    ).json()
    image = io.BytesIO()
    Image.new("RGB", (20, 20), "orange").save(image, "PNG")
    added = client.post(
        base + "/p-house/photos",
        headers=h,
        files={"file": ("new.png", image.getvalue(), "image/png")},
    )
    assert added.status_code == 201, added.text
    media = added.json()
    uri = media["uri"]
    photo_id = uri.rsplit("/", 1)[1]
    assert client.get(uri).status_code == 404
    assert client.get(base + "/p-house/photos/" + photo_id, headers=h).status_code == 200
    other = other_farm_headers
    assert client.get(base + "/p-house/photos/" + photo_id, headers=other).status_code == 404
    snap = row["snapshot"]
    snap["content"]["blocks"].append({"id": "uploaded-photo", "type": "image", **media})
    saved = client.put(
        base + "/p-house",
        headers={**h, "Idempotency-Key": str(uuid4())},
        json={"version": row["version"], "snapshot": snap},
    )
    assert saved.status_code == 200, saved.text
    assert client.get(uri).status_code == 404
    applied = client.post(
        base + "/p-house/apply",
        headers={**h, "Idempotency-Key": str(uuid4())},
        json={"version": saved.json()["version"]},
    )
    assert applied.status_code == 200, applied.text
    assert client.get(uri).status_code == 200


def test_AC_SRC_11_description_version_and_no_reanalysis_of_pixels(client, login):
    h = login("u-kang")
    batch = create(client, h)
    asset = photo(client, h, batch)
    url = f"{PREFIX}/{batch['id']}/sources/{asset['id']}/details"
    before = asset["revision"]
    edit = {
        "sourceVersion": before,
        "descriptionVersion": asset["descriptionVersion"],
        "description": "귤 단면",
    }
    changed = client.put(url, headers=h, json=edit)
    assert changed.status_code == 200, changed.text
    assert changed.json()["revision"] == before
    assert changed.json()["status"] == "PREPARED"
    assert client.put(url, headers=h, json=edit).status_code == 409
    start(client, h, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        assert db.get(Asset, asset["id"]).placement["fieldKey"] == "crossSectionPhoto"


def test_AC_SRC_11_paid_placement_sends_only_descriptions(client, login, monkeypatch):
    from app.ai.source_analysis import ExtractionResponse
    from app.core.config import get_settings
    from app.source_analysis import photos
    from app.source_analysis.schemas import Extraction

    h = login("u-kang")
    batch = create(client, h)
    asset = photo(client, h, batch)
    settings = get_settings()
    monkeypatch.setattr(settings, "source_analysis_provider", "openrouter")
    monkeypatch.setattr(settings, "source_analysis_model", "google/gemini-3-flash-preview")
    received = []

    def classify(mode, model, chunk, targets, images, *, prompt):
        received.append((chunk, images, prompt))
        span = chunk["pages"][0]["spans"][0]
        return ExtractionResponse(
            Extraction(
                candidates=[
                    dict(
                        targetId=None,
                        fieldKey="packagePhoto",
                        value=span["text"],
                        historical=False,
                        evidence=[
                            dict(
                                sourceId=chunk["sourceId"],
                                sourceRevision=chunk["sourceRevision"],
                                page=1,
                                spanIds=[span["id"]],
                                quote=span["text"],
                            )
                        ],
                    )
                ],
                photo_requests=[],
            ),
            {"cost": 0},
            "fixture",
        )

    monkeypatch.setattr(photos, "extract", classify)
    start(client, h, batch["id"])
    drain()
    assert len(received) == 1
    assert received[0][1] == []
    assert received[0][0]["pages"][0]["spans"] == [{"id": asset["id"], "text": "배송 박스 포장"}]
