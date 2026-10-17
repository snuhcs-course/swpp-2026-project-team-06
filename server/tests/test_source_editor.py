from copy import deepcopy

import pytest
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


@pytest.mark.parametrize("field_key", ["hero", "specification"])
def test_AC_SRC_11_hidden_changed_photo_retained_until_repaired(client, login, field_key):
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
    hero = next(f for f in body["fields"] if f["fieldKey"] == field_key)
    hero["state"] = "CONFIRMED" if field_key == "hero" else "UNREVIEWED"
    hero["photoAssetIds"] = [pid]
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 200, response.text
    rec = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    assert (
        next(e for e in rec["editorFields"] if e["field"]["fieldKey"] == field_key)["status"]
        == "outdated"
    )
    body = body_for(client, h, batch)
    body["targets"][0]["enabledModuleIds"].append(field_key)
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


def test_AC_SRC_11_basic_info_required_optional_and_private(client, login):
    h = login("u-kang")
    batch = client.post(PREFIX, headers=key(h), json={"targets": [{"name": "새 상품"}]}).json()
    upload(client, h, batch)
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    denied = client.post(
        f"{PREFIX}/{batch['id']}/runs", headers=key(h), json={"batchVersion": current["version"]}
    )
    assert denied.status_code == 400
    assert "variety" in denied.json()["details"]["fields"]
    endpoint = f"{PREFIX}/{batch['id']}/basic-info"
    payload = {
        "version": current["version"],
        "targets": [
            {
                "targetId": batch["targets"][0]["id"],
                "basicInfo": {"variety": "  온주밀감  ", "size": "", "expectedBrix": None},
            }
        ],
    }
    for brix in [-1, 101]:
        invalid = deepcopy(payload)
        invalid["targets"][0]["basicInfo"]["expectedBrix"] = brix
        assert client.put(endpoint, headers=h, json=invalid).status_code == 400
    response = client.put(endpoint, headers=h, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["targets"][0]["basicInfo"] == {
        "variety": "온주밀감",
        "size": "",
        "expectedBrix": None,
    }
    assert client.put(endpoint, headers=h, json=payload).status_code == 409
    payload["version"] = response.json()["version"]
    assert client.put(endpoint, headers=login("u-misook"), json=payload).status_code in (403, 404)
    start(client, h, batch["id"])
    assert client.put(endpoint, headers=h, json=payload).status_code == 409
    drain()
    assert (
        client.get(f"{PREFIX}/{batch['id']}", headers=h).json()["targets"][0]["basicInfo"][
            "variety"
        ]
        == "온주밀감"
    )


def test_AC_SRC_11_basic_info_defaults_and_manual_precedence(client, login):
    h = login("u-kang")
    from app.catalog.models import Product

    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        product.variety = "온주밀감"
        product.info = {**product.info, "size": "중과"}
        product.expected_brix = 12.5
        product.measured_brix = 14.0
        db.commit()
    batch = client.post(
        PREFIX, headers=key(h), json={"targets": [{"name": "기본값 확인", "productId": "p-house"}]}
    ).json()
    tid = batch["targets"][0]["id"]
    assert batch["targets"][0]["basicInfo"] == {
        "variety": "온주밀감",
        "size": "중과",
        "expectedBrix": 12.5,
    }
    upload(client, h, batch)
    start(client, h, batch["id"])
    drain()
    body = body_for(client, h, batch)
    fields = {f["fieldKey"]: f for f in body["fields"]}
    assert fields["specification"]["value"] == "품종: 온주밀감\n사이즈: 중과"
    assert fields["qualityEvidence"]["value"] == "예상 당도: 12.5 °Bx"
    assert fields["qualityEvidence"]["candidateIds"] == []
    body["targets"][0]["enabledModuleIds"] += ["specification", "qualityEvidence"]
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 200, response.text
    endpoint = f"{PREFIX}/{batch['id']}/basic-info"
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    response = client.put(
        endpoint,
        headers=h,
        json={
            "version": current["version"],
            "targets": [
                {
                    "targetId": tid,
                    "basicInfo": {"variety": "천혜향", "size": "대과", "expectedBrix": 13.2},
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    assert (
        client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body).status_code == 409
    )
    body = body_for(client, h, batch)
    fields = {f["fieldKey"]: f for f in body["fields"]}
    assert fields["specification"]["value"] == "품종: 천혜향\n사이즈: 대과"
    assert fields["qualityEvidence"]["value"] == "예상 당도: 13.2 °Bx"
    for name, value in [("specification", "직접 수정한 규격"), ("qualityEvidence", "")]:
        fields[name].update(value=value, state="CONFIRMED", provenance="PRODUCER", candidateIds=[])
    response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert response.status_code == 200, response.text
    start(client, h, batch["id"])
    drain()
    fields = {f["fieldKey"]: f for f in body_for(client, h, batch)["fields"]}
    assert fields["specification"]["value"] == "직접 수정한 규격"
    assert fields["qualityEvidence"]["value"] == ""
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        assert product.variety == "온주밀감"
        assert product.expected_brix == 12.5
        assert product.measured_brix == 14.0
