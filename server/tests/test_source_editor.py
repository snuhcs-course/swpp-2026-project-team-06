from copy import deepcopy

import pytest
from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.source_analysis.editor import suggestions
from app.source_analysis.models import Candidate, Draft, ReviewedField
from tests.test_orders import key as order_key
from tests.test_source_analysis import (  # noqa: F401
    PREFIX,
    create,
    drain,
    key,
    source_settings,
    start,
    upload,
)
from tests.test_source_refine import ready as refine_ready
from tests.test_source_refine import review as refine_review


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


@pytest.mark.parametrize("field_key", ["summary", "composition"])
def test_AC_SRC_11_conflict_no_guess_and_atomic_rollback(client, login, field_key):
    h, batch = ready(client, login)
    with get_sessionmaker()() as db:
        c = db.scalar(
            select(Candidate).where(
                Candidate.batch_id == batch["id"], Candidate.field_key == "summary"
            )
        )
        c.field_key = field_key
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
    rec = next(e for e in review["editorFields"] if e["field"]["fieldKey"] == field_key)
    assert rec["status"] == "conflict"
    assert rec["field"]["value"] == ""
    body = body_for(client, h, batch)
    if field_key != "summary":
        body["targets"][0]["enabledModuleIds"] = [field_key]
    f = next(f for f in body["fields"] if f["fieldKey"] == field_key)
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


def test_AC_SRC_11_analysis_without_photo_and_representative_select_and_delete(client, login):
    from tests.test_source_analysis import add_cover

    h = login("u-kang")
    batch = create(client, h)
    bid, tid = batch["id"], batch["targets"][0]["id"]
    upload(client, h, batch)
    current = client.get(f"{PREFIX}/{bid}", headers=h).json()
    run = client.post(
        f"{PREFIX}/{bid}/runs", headers=key(h), json={"batchVersion": current["version"]}
    )
    assert run.status_code == 202, run.text
    assert (
        client.post(f"{PREFIX}/{bid}/runs/{run.json()['id']}/cancel", headers=h).status_code == 202
    )
    first = add_cover(client, h, bid)
    second = add_cover(client, h, bid, "blue")
    endpoint = f"{PREFIX}/{bid}/representative"
    current = client.get(f"{PREFIX}/{bid}", headers=h).json()
    assert current["targets"][0]["representativeAssetId"] == first["id"]
    body = {"version": current["version"], "targetIds": [tid], "assetId": second["id"]}
    assert client.put(endpoint, headers=login("u-misook"), json=body).status_code == 403
    changed = client.put(endpoint, headers=h, json=body)
    assert changed.status_code == 200, changed.text
    assert changed.json()["targets"][0]["representativeAssetId"] == second["id"]
    assert client.put(endpoint, headers=h, json=body).status_code == 409
    body["version"] = changed.json()["version"]
    text_id = next(s["id"] for s in current["sources"] if not s["originalPhoto"])
    body["assetId"] = text_id
    assert client.put(endpoint, headers=h, json=body).status_code == 400
    for photo, expected in [(second, first["id"]), (first, None)]:
        result = client.delete(
            f"{PREFIX}/{bid}/sources/{photo['id']}?version={photo['revision']}", headers=h
        )
        assert result.status_code == 202, result.text
        latest = client.get(f"{PREFIX}/{bid}", headers=h).json()
        assert latest["targets"][0]["representativeAssetId"] == expected
    run = client.post(
        f"{PREFIX}/{bid}/runs", headers=key(h), json={"batchVersion": latest["version"]}
    )
    assert run.status_code == 202, run.text


def test_AC_SRC_11_representative_survives_hidden_intro_and_publishes_cover(client, login):
    h, batch = ready(client, login)
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    cover_id = current["targets"][0]["representativeAssetId"]
    body = body_for(client, h, batch)
    body["targets"][0]["hiddenSectionIds"] = ["intro"]
    body["targets"][0]["enabledModuleIds"] = ["storage"]
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
    assert saved.status_code == 200, saved.text
    draft = saved.json()["drafts"][0]
    assert draft["snapshot"]["representativeAssetId"] == cover_id
    assert cover_id in draft["snapshot"]["sourceVersions"]
    before = client.get("/api/products/mine/p-house", headers=h).json()
    assert not before["photo"].startswith("/api/source-media/")
    applied = client.post(
        f"{PREFIX}/{batch['id']}/drafts/{draft['id']}/apply",
        headers=key(h),
        json={
            "productId": "p-house",
            "productVersion": before["version"],
            "draftVersion": draft["version"],
        },
    )
    assert applied.status_code == 200, applied.text
    public = client.get("/api/products/p-house").json()
    assert public["photo"].startswith("/api/source-media/")
    assert client.get(public["photo"]).status_code == 200
    assert [m["id"] for m in public["moduleDetail"]["modules"]] == ["storage"]


def test_AC_SRC_11_analysis_accepts_text_without_representative_photo(client, login):
    h = login("u-kang")
    batch = create(client, h)
    upload(client, h, batch)
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    assert current["targets"][0]["representativeAssetId"] is None
    assert not any(s["originalPhoto"] for s in current["sources"])
    response = client.post(
        f"{PREFIX}/{batch['id']}/runs",
        headers=key(h),
        json={"batchVersion": current["version"]},
    )
    assert response.status_code == 202, response.text
    assert (
        client.get(f"{PREFIX}/{batch['id']}", headers=h).json()["targets"][0][
            "representativeAssetId"
        ]
        is None
    )


@pytest.mark.parametrize("basic_info", [{}, {"variety": ""}, {"variety": "   "}])
def test_AC_SRC_11_text_analysis_still_requires_nonblank_variety(client, login, basic_info):
    h = login("u-kang")
    created = client.post(
        PREFIX,
        headers=key(h),
        json={"targets": [{"name": "품종 미입력 상품", "basicInfo": basic_info}]},
    )
    assert created.status_code == 201, created.text
    batch = created.json()
    upload(client, h, batch)
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    response = client.post(
        f"{PREFIX}/{batch['id']}/runs",
        headers=key(h),
        json={"batchVersion": current["version"]},
    )
    assert response.status_code == 400, response.text
    assert "variety" in response.json()["details"]["fields"]


def _review_input(field_key, values):
    candidates = [
        {
            "id": f"c{i}",
            "targetId": "target",
            "fieldKey": field_key,
            "value": value,
            "historical": False,
            "outdated": False,
            "candidateIds": [f"c{i}"],
            "evidence": [{"quote": value}],
        }
        for i, value in enumerate(values)
    ]
    return {
        "targets": [
            {"id": "target", "name": "감귤", "basicInfo": {"size": "중과", "expectedBrix": 12}}
        ],
        "candidates": candidates,
        "fields": [],
        "refinements": {
            "target": [
                {
                    "module": field_key,
                    "texts": [
                        {"value": " ".join(values), "candidateIds": [c["id"] for c in candidates]}
                    ],
                }
            ]
        },
    }


def _entry(review_input, field_key):
    return next(e for e in suggestions(review_input) if e["field"]["fieldKey"] == field_key)


@pytest.mark.parametrize("field_key", ["summary", "farmStory"])
def test_AC_SRC_11_combined_narrative_fragments_are_ready_unreviewed(field_key):
    r = _review_input(field_key, ["제주에서 감귤을 재배해요", "농부가 정성껏 가꿔요"])
    entry = _entry(r, field_key)
    assert entry["status"] == "ready"
    assert entry["field"]["state"] == "UNREVIEWED"
    assert entry["field"]["value"] == "제주에서 감귤을 재배해요 농부가 정성껏 가꿔요"
    assert entry["field"]["candidateIds"] == ["c0", "c1"]
    assert entry["field"]["provenance"] == "REFINED"


@pytest.mark.parametrize(
    "field_key,values",
    [
        ("specification", ["중과", "대과"]),
        ("specification", ["원산지 제주", "원산지 남해"]),
        ("composition", ["감귤 3kg", "감귤 5kg"]),
        ("pieceCount", ["12과", "20과"]),
        ("qualityEvidence", ["당도 12브릭스", "당도 14브릭스"]),
    ],
)
def test_AC_SRC_11_factual_conflicts_survive_automatic_refinement_and_basic_info(field_key, values):
    r = _review_input(field_key, values)
    entry = _entry(r, field_key)
    assert entry["status"] == "conflict"
    assert entry["field"]["state"] == "UNREVIEWED"


@pytest.mark.parametrize(
    "field_key", ["specification", "composition", "pieceCount", "qualityEvidence"]
)
def test_AC_SRC_11_normalized_duplicate_fact_sources_are_not_conflicts(field_key):
    r = _review_input(field_key, ["ＧＲＡＤＥ   Ａ．", "grade a"])
    r["candidates"][0]["evidence"][0]["sourceId"] = "first-source"
    r["candidates"][1]["evidence"][0]["sourceId"] = "second-source"
    entry = _entry(r, field_key)
    assert entry["status"] == "ready"
    assert entry["field"]["state"] == "UNREVIEWED"


@pytest.mark.parametrize(
    "field_key,values",
    [
        ("specification", ["품종: 온주밀감", "사이즈: 중과"]),
        ("composition", ["감귤 3kg", "감귤 3000g"]),
        ("qualityEvidence", ["당도 12.0브릭스", "당도 12브릭스"]),
    ],
)
def test_AC_SRC_11_complementary_or_equivalent_facts_are_not_conflicts(field_key, values):
    entry = _entry(_review_input(field_key, values), field_key)
    assert entry["status"] == "ready"
    assert entry["field"]["state"] == "UNREVIEWED"


@pytest.mark.parametrize("state", ["CONFIRMED", "EXCLUDED"])
def test_AC_SRC_11_saved_producer_decision_remains_authoritative_over_fact_conflict(state):
    r = _review_input("composition", ["감귤 3kg", "감귤 5kg"])
    chosen = {
        "targetId": "target",
        "fieldKey": "composition",
        "value": "생산자가 선택한 구성",
        "state": state,
        "provenance": "PRODUCER",
        "candidateIds": [],
        "photoAssetIds": [],
        "illustrationId": None,
    }
    r["fields"] = [chosen]
    entry = _entry(r, "composition")
    assert entry["status"] != "conflict"
    assert entry["field"] == chosen


def test_AC_SRC_11_saved_stale_evidence_stays_outdated_despite_factual_conflict():
    r = _review_input("composition", ["감귤 3kg", "감귤 5kg"])
    saved = {
        "targetId": "target",
        "fieldKey": "composition",
        "value": "감귤 3kg",
        "state": "UNREVIEWED",
        "provenance": "EXTRACTED",
        "candidateIds": ["old"],
        "photoAssetIds": [],
        "illustrationId": None,
    }
    r["candidates"].append(
        {
            **r["candidates"][0],
            "id": "old",
            "candidateIds": ["old"],
            "outdated": True,
        }
    )
    r["fields"] = [saved]
    r["refinements"] = {}
    entry = _entry(r, "composition")
    assert entry["status"] == "outdated"
    assert entry["field"] == saved


def test_AC_SRC_11_narrative_autosave_keeps_fields_unreviewed(client, login, monkeypatch):
    h, batch, _ = refine_ready(client, login, monkeypatch)
    drain()
    r = refine_review(client, h, batch)
    narratives = [
        e for e in r["editorFields"] if e["field"]["fieldKey"] in {"summary", "farmStory"}
    ]
    assert len(narratives) == 2
    assert all(e["status"] == "ready" and e["field"]["state"] == "UNREVIEWED" for e in narratives)
    saved = client.put(
        f"{PREFIX}/{batch['id']}/editor",
        headers=h | order_key(),
        json={
            "reviewVersion": r["reviewVersion"],
            "fields": [e["field"] for e in r["editorFields"]],
            "targets": [
                {
                    "targetId": batch["targets"][0]["id"],
                    "enabledModuleIds": ["summary", "farmStory"],
                }
            ],
        },
    )
    assert saved.status_code == 200, saved.text
    fields = [
        f
        for module in saved.json()["drafts"][0]["snapshot"]["modules"]
        if module["id"] in {"summary", "farmStory"}
        for f in module["fields"]
    ]
    assert len(fields) == 2
    assert all(f["state"] == "UNREVIEWED" and f["provenance"] == "REFINED" for f in fields)


def test_AC_SRC_11_editor_rejects_unreviewed_factual_conflict(client, login, monkeypatch):
    from app.ai.source_analysis import ExtractionResponse
    from app.ai.source_refine import Refinement, RefineResponse
    from app.source_analysis import refinement, worker
    from app.source_analysis.schemas import Extraction

    values = ["감귤 3kg", "감귤 5kg"]
    h, batch, _ = refine_ready(client, login, monkeypatch, text="\n".join(values))

    def extract(mode, model, chunk, targets, images):
        return ExtractionResponse(
            Extraction(
                candidates=[
                    {
                        "targetId": targets[0]["id"],
                        "fieldKey": "composition",
                        "value": value,
                        "historical": False,
                        "evidence": [
                            {
                                "sourceId": chunk["sourceId"],
                                "sourceRevision": chunk["sourceRevision"],
                                "page": 1,
                                "spanIds": [chunk["pages"][0]["spans"][i]["id"]],
                                "quote": value,
                            }
                        ],
                    }
                    for i, value in enumerate(values)
                ],
                photo_requests=[],
            ),
            {"mock": True},
            None,
        )

    def auto_choose(mode, model, target, candidates):
        return RefineResponse(
            Refinement(
                modules=[
                    {
                        "module": "composition",
                        "texts": [
                            {"value": candidates[0]["value"], "candidateIds": [candidates[0]["id"]]}
                        ],
                    }
                ]
            ),
            {"mock": True},
            None,
        )

    monkeypatch.setattr(worker, "extract", extract)
    monkeypatch.setattr(refinement, "refine", auto_choose)
    drain()
    r = refine_review(client, h, batch)
    entry = next(e for e in r["editorFields"] if e["field"]["fieldKey"] == "composition")
    assert entry["status"] == "conflict"
    field = deepcopy(entry["field"])
    field["value"], field["state"] = values[0], "UNREVIEWED"
    rejected = client.put(
        f"{PREFIX}/{batch['id']}/editor",
        headers=h | order_key(),
        json={
            "reviewVersion": r["reviewVersion"],
            "fields": [
                field if e["field"]["fieldKey"] == "composition" else e["field"]
                for e in r["editorFields"]
            ],
            "targets": [
                {"targetId": batch["targets"][0]["id"], "enabledModuleIds": ["composition"]}
            ],
        },
    )
    assert rejected.status_code == 409, rejected.text
    assert rejected.json()["details"]["reason"] == "EDITOR_CONFIRMATION_REQUIRED"


@pytest.mark.parametrize("source_count", [1, 2])
def test_AC_SRC_11_one_multivalue_fact_repeated_across_sources_is_not_disagreement(source_count):
    r = _review_input("composition", ["감귤 3kg 또는 5kg 구성"] * source_count)
    for i, candidate in enumerate(r["candidates"]):
        candidate["evidence"][0]["sourceId"] = f"source-{i}"
    entry = _entry(r, "composition")
    assert entry["status"] == "ready"
    assert entry["field"]["state"] == "UNREVIEWED"


@pytest.mark.parametrize("values", [
    ["감귤 3kg", "레몬 3kg"],
    ["감귤 3kg + 한라봉 1kg", "감귤 1kg + 한라봉 3kg"],
])
def test_AC_SRC_11_composition_identity_and_item_weight_association_must_agree(values):
    entry = _entry(_review_input("composition", values), "composition")
    assert entry["status"] == "conflict"
    assert entry["field"]["state"] == "UNREVIEWED"


@pytest.mark.parametrize("values", [
    ["온주밀감 중과 3kg", "한라봉 대과 3kg"],
    ["제주산 감귤 3kg", "남해산 감귤 3kg"],
])
def test_AC_SRC_11_equal_specification_weight_does_not_hide_variety_or_origin_conflict(values):
    entry = _entry(_review_input("specification", values), "specification")
    assert entry["status"] == "conflict"
    assert entry["field"]["state"] == "UNREVIEWED"


@pytest.mark.parametrize("refinements", [{}, {"target": None}], ids=["absent", "pending"])
@pytest.mark.parametrize(
    "field_key,values",
    [
        ("specification", ["ＧＲＡＤＥ   Ａ．", "grade a"]),
        ("composition", ["ＧＲＡＤＥ   Ａ．", "grade a"]),
        ("pieceCount", ["ＧＲＡＤＥ   Ａ．", "grade a"]),
        ("qualityEvidence", ["ＧＲＡＤＥ   Ａ．", "grade a"]),
        ("composition", ["감귤 3kg", "감귤 3000g"]),
        ("qualityEvidence", ["당도 12.0브릭스", "당도 12브릭스"]),
    ],
)
def test_AC_SRC_11_unavailable_refinement_keeps_one_original_equivalent_fact(
    refinements, field_key, values
):
    r = _review_input(field_key, values)
    r["targets"][0]["basicInfo"] = {}
    r["refinements"] = refinements

    entry = _entry(r, field_key)

    assert entry["field"]["state"] == "UNREVIEWED"
    if refinements:
        # A pending refinement will supply the value; raw text is not prefilled meanwhile.
        assert entry["status"] == "missing"
        assert entry["field"]["value"] == ""
        return
    assert entry["status"] == "ready"
    assert entry["field"]["provenance"] == "EXTRACTED"
    assert (entry["field"]["value"], entry["field"]["candidateIds"]) in [
        (candidate["value"], candidate["candidateIds"]) for candidate in r["candidates"]
    ]


@pytest.mark.parametrize("refinements", [{}, {"target": None}], ids=["absent", "pending"])
@pytest.mark.parametrize(
    "field_key,values",
    [
        ("specification", ["품종: 온주밀감", "사이즈: 중과"]),
        ("qualityEvidence", ["GAP 인증", "무농약 재배"]),
    ],
)
def test_AC_SRC_11_unavailable_refinement_keeps_complementary_facts_selectable(
    refinements, field_key, values
):
    r = _review_input(field_key, values)
    r["targets"][0]["basicInfo"] = {}
    r["refinements"] = refinements

    entry = _entry(r, field_key)

    assert entry["status"] == "conflict"
    assert entry["field"]["state"] == "UNREVIEWED"
    assert entry["field"]["value"] == ""
    assert entry["field"]["candidateIds"] == []


@pytest.mark.parametrize("values", [["감귤 3kg", "감귤 3000g"], ["감귤 3000g", "감귤 3kg"]])
def test_AC_SRC_11_equivalent_fact_representative_ignores_candidate_order(values):
    r = _review_input("composition", values)
    r["targets"][0]["basicInfo"] = {}
    r["refinements"] = {}
    r["candidates"].reverse()

    entry = _entry(r, "composition")

    assert entry["status"] == "ready"
    assert entry["field"]["candidateIds"] == ["c0"]
    assert entry["field"]["value"] == values[0]


def test_AC_SRC_11_equivalent_facts_plus_distinct_fact_stay_selectable():
    r = _review_input("composition", ["감귤 3kg", "감귤 3000g", "감귤 5kg"])
    r["targets"][0]["basicInfo"] = {}
    r["refinements"] = {}

    entry = _entry(r, "composition")

    assert entry["status"] == "conflict"
    assert entry["field"]["value"] == ""
