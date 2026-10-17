from copy import deepcopy

from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.source_analysis.models import Candidate, Draft, ReviewedField
from tests.test_source_analysis import (  # noqa: F401
    PREFIX,
    create,
    drain,
    key,
    source_settings,
    start,
    upload,
)


def ready(client, login):
    h = login("u-kang")
    batch = create(client, h)
    upload(client, h, batch)
    start(client, h, batch["id"])
    drain()
    return h, batch


def body_for(client, h, batch):
    review = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    return {
        "reviewVersion": review["reviewVersion"],
        "fields": [e["field"] for e in review["editorFields"]],
        "targets": [
            {"targetId": batch["targets"][0]["id"], "enabledModuleIds": ["summary", "storage"]}
        ],
    }


def test_AC_SRC_11_auto_fill_preserves_unreviewed_and_off_values(client, login):
    h, batch = ready(client, login)
    body = body_for(client, h, batch)
    body["targets"][0]["enabledModuleIds"] = ["summary"]
    headers = key(h)
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=headers, json=body)
    assert response.status_code == 200, response.text
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=headers, json=body).json()
        == response.json()
    )
    snap = response.json()["drafts"][0]["snapshot"]
    assert [m["id"] for m in snap["previewModules"]] == ["summary"]
    storage = next(m for m in snap["modules"] if m["id"] == "storage")
    assert storage["fields"][0]["value"]
    assert storage["fields"][0]["state"] == "UNREVIEWED"
    assert not storage["enabled"]
    reloaded = body_for(client, h, batch)
    assert (
        next(f for f in reloaded["fields"] if f["fieldKey"] == "storage")["value"]
        == storage["fields"][0]["value"]
    )
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=reloaded)
    assert response.status_code == 200, response.text
    assert [m["id"] for m in response.json()["drafts"][0]["snapshot"]["previewModules"]] == [
        "summary",
        "storage",
    ]
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 409
    )


def test_AC_SRC_11_conflict_no_guess_and_atomic_rollback(client, login):
    h, batch = ready(client, login)
    with get_sessionmaker()() as db:
        c = db.scalar(
            select(Candidate).where(
                Candidate.batch_id == batch["id"], Candidate.field_key == "summary"
            )
        )
        db.add(
            Candidate(
                batch_id=c.batch_id,
                item_id=c.item_id,
                target_id=c.target_id,
                field_key=c.field_key,
                value="different value",
                evidence=deepcopy(c.evidence),
            )
        )
        db.commit()
    review = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    rec = next(e for e in review["editorFields"] if e["field"]["fieldKey"] == "summary")
    assert rec["status"] == "conflict"
    assert rec["field"]["value"] == ""
    body = body_for(client, h, batch)
    f = next(f for f in body["fields"] if f["fieldKey"] == "summary")
    f["value"] = "unverified automatic guess"
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 409
    with get_sessionmaker()() as db:
        assert not list(
            db.scalars(select(ReviewedField).where(ReviewedField.batch_id == batch["id"]))
        )
        assert not list(db.scalars(select(Draft).where(Draft.batch_id == batch["id"])))
    f["state"] = "CONFIRMED"
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 200
    )


def test_AC_SRC_11_stale_off_does_not_block_other_sections(client, login):
    h, batch = ready(client, login)
    body = body_for(client, h, batch)
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 200
    )
    with get_sessionmaker()() as db:
        for c in db.scalars(
            select(Candidate).where(
                Candidate.batch_id == batch["id"], Candidate.field_key == "storage"
            )
        ):
            c.outdated = True
        db.commit()
    body = body_for(client, h, batch)
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 409
    )
    body["targets"][0]["enabledModuleIds"] = ["summary"]
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 200, response.text
    assert [m["id"] for m in response.json()["drafts"][0]["snapshot"]["previewModules"]] == [
        "summary"
    ]


def test_AC_SRC_11_hidden_changed_photo_retained_until_repaired(client, login):
    from app.source_analysis.models import Asset

    h, batch = ready(client, login)
    with get_sessionmaker()() as db:
        photo = db.scalar(select(Asset).where(Asset.batch_id == batch["id"]))
        photo.original_photo = True
        photo.mime = "image/png"
        photo.status = "UPLOADED"
        pid = photo.id
        db.commit()
    body = body_for(client, h, batch)
    hero = next(f for f in body["fields"] if f["fieldKey"] == "hero")
    hero["state"] = "CONFIRMED"
    hero["photoAssetIds"] = [pid]
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 200, response.text
    rec = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    assert (
        next(e for e in rec["editorFields"] if e["field"]["fieldKey"] == "hero")["status"]
        == "outdated"
    )
    body = body_for(client, h, batch)
    body["targets"][0]["enabledModuleIds"].append("hero")
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 409
    )


def test_AC_SRC_11_section_hidden_preserves_selection_and_revalidates(client, login):
    h, batch = ready(client, login)
    body = body_for(client, h, batch)
    body["targets"][0]["hiddenSectionIds"] = ["storage"]
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 200, response.text
    snap = response.json()["drafts"][0]["snapshot"]
    assert snap["hiddenSectionIds"] == ["storage"]
    assert next(m for m in snap["modules"] if m["id"] == "storage")["enabled"]
    assert [m["id"] for m in snap["previewModules"]] == ["summary"]
    with get_sessionmaker()() as db:
        for c in db.scalars(
            select(Candidate).where(
                Candidate.batch_id == batch["id"], Candidate.field_key == "storage"
            )
        ):
            c.outdated = True
        db.commit()
    body = body_for(client, h, batch)
    body["targets"][0]["hiddenSectionIds"] = ["storage"]
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert saved.status_code == 200, saved.text
    body = body_for(client, h, batch)
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 409
    )
    body["targets"][0]["hiddenSectionIds"] = ["unknown"]
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 400
    )


def test_AC_SRC_11_whitespace_only_content_not_published(client, login):
    h, batch = ready(client, login)
    body = body_for(client, h, batch)
    field = next(f for f in body["fields"] if f["fieldKey"] == "summary")
    field.update(value="   ", state="CONFIRMED", provenance="PRODUCER", candidateIds=[])
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 200, response.text
    assert [m["id"] for m in response.json()["drafts"][0]["snapshot"]["previewModules"]] == [
        "storage"
    ]
