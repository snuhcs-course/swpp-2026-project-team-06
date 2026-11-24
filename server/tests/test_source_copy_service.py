"""Source-preserving owner review endpoints and persistence guards."""

from tests.test_source_analysis import (  # noqa: F401
    PREFIX,
    create,
    drain,
    key,
    source_settings,
    start,
    upload,
)
from tests.test_source_editor import body_for


def ready(client, login):
    headers = login("u-kang")
    batch = create(client, headers)
    upload(client, headers, batch)
    start(client, headers, batch["id"])
    drain()
    return headers, batch


def get_plan(client, headers, batch, target_id=None):
    target_id = target_id or batch["targets"][0]["id"]
    response = client.get(
        f"{PREFIX}/{batch['id']}/source-copy",
        headers=headers,
        params={"targetId": target_id},
    )
    assert response.status_code == 200, response.text
    return response.json(), target_id


def test_AC_SRC_2_3_source_copy_requires_opt_in_and_persists_owner_omission(client, login):
    headers, batch = ready(client, login)
    state, target_id = get_plan(client, headers, batch)
    assert state["enabled"] is False
    assert state["plan"]["passages"]
    first = state["plan"]["passages"][0]
    url = f"{PREFIX}/{batch['id']}/source-copy/{target_id}"
    disabled = client.put(
        url,
        headers=key(headers),
        json={
            "reviewVersion": state["reviewVersion"],
            "planHash": state["plan"]["planHash"],
            "decisions": [{"bindingHash": first["bindingHash"], "action": "OMIT"}],
        },
    )
    assert disabled.status_code == 409

    enabled = client.post(
        f"{PREFIX}/{batch['id']}/source-copy/enable",
        headers=key(headers),
        json={"reviewVersion": state["reviewVersion"]},
    )
    assert enabled.status_code == 200, enabled.text
    state = client.get(
        f"{PREFIX}/{batch['id']}/source-copy", headers=headers, params={"targetId": target_id}
    ).json()
    saved = client.put(
        url,
        headers=key(headers),
        json={
            "reviewVersion": state["reviewVersion"],
            "planHash": state["plan"]["planHash"],
            "decisions": [{"bindingHash": first["bindingHash"], "action": "OMIT"}],
        },
    )
    assert saved.status_code == 200, saved.text
    reloaded = client.get(
        f"{PREFIX}/{batch['id']}/source-copy", headers=headers, params={"targetId": target_id}
    ).json()
    stored = next(
        p for p in reloaded["plan"]["passages"] if p["bindingHash"] == first["bindingHash"]
    )
    assert stored["decision"]["action"] == "OMIT"


def test_AC_SRC_5_6_source_copy_tenant_scope_and_stale_versions(client, login, other_farm_headers):
    headers, batch = ready(client, login)
    state, target_id = get_plan(client, headers, batch)
    path = f"{PREFIX}/{batch['id']}/source-copy"
    assert (
        client.get(path, headers=other_farm_headers, params={"targetId": target_id}).status_code
        == 404
    )
    assert client.get(path, params={"targetId": target_id}).status_code == 401
    assert (
        client.get(path, headers=login("u-minji"), params={"targetId": target_id}).status_code
        == 403
    )

    enabled = client.post(
        f"{path}/enable", headers=key(headers), json={"reviewVersion": state["reviewVersion"]}
    )
    assert enabled.status_code == 200, enabled.text
    stale = client.put(
        f"{path}/{target_id}",
        headers=key(headers),
        json={
            "reviewVersion": state["reviewVersion"],
            "planHash": state["plan"]["planHash"],
            "decisions": [],
        },
    )
    assert stale.status_code == 409


def _update_source_decision(client, headers, batch, target_id, passage, action, *, value=None):
    state, _ = get_plan(client, headers, batch, target_id)
    decision = {"bindingHash": passage["bindingHash"], "action": action}
    if value is not None:
        decision.update(value=value, note="농가가 상품 문구로 확인", module="summary")
    response = client.put(
        f"{PREFIX}/{batch['id']}/source-copy/{target_id}",
        headers=key(headers),
        json={
            "reviewVersion": state["reviewVersion"],
            "planHash": state["plan"]["planHash"],
            "decisions": [decision],
        },
    )
    assert response.status_code == 200, response.text
    return response


def test_AC_SRC_11_source_owned_edit_reconciles_and_keeps_independent_canvas_text(client, login):
    headers, batch = ready(client, login)
    target_id = batch["targets"][0]["id"]
    state, _ = get_plan(client, headers, batch, target_id)
    enabled = client.post(
        f"{PREFIX}/{batch['id']}/source-copy/enable",
        headers=key(headers),
        json={"reviewVersion": state["reviewVersion"]},
    )
    assert enabled.status_code == 200, enabled.text

    state, _ = get_plan(client, headers, batch, target_id)
    passage = next(p for p in state["plan"]["passages"] if p["module"] == "summary")
    _update_source_decision(
        client, headers, batch, target_id, passage, "EDIT", value="농가가 확인한 첫 문안입니다."
    )
    body = body_for(client, headers, batch)
    owner_field = next(f for f in body["fields"] if f["fieldKey"] == "summary")
    assert owner_field["value"] == "농가가 확인한 첫 문안입니다."
    assert owner_field["provenance"] == "PRODUCER"
    assert owner_field["candidateIds"] == []
    media = client.get(f"{PREFIX}/{batch['id']}", headers=headers).json()["sources"]
    cover = next(source for source in media if source["originalPhoto"])
    owner_field["photoAssetIds"] = [cover["id"]]
    owner_field["state"] = "CONFIRMED"
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(headers), json=body)
    assert saved.status_code == 200, saved.text

    _update_source_decision(
        client,
        headers,
        batch,
        target_id,
        passage,
        "EDIT",
        value="농가가 확인한 두 번째 문안입니다.",
    )
    refreshed = client.get(f"{PREFIX}/{batch['id']}/review", headers=headers).json()
    summary = next(
        e["field"] for e in refreshed["editorFields"] if e["field"]["fieldKey"] == "summary"
    )
    assert summary["value"] == "농가가 확인한 두 번째 문안입니다."
    assert summary["photoAssetIds"] == [cover["id"]]

    body = body_for(client, headers, batch)
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(headers), json=body)
    assert saved.status_code == 200, saved.text
    _update_source_decision(client, headers, batch, target_id, passage, "OMIT")
    refreshed = client.get(f"{PREFIX}/{batch['id']}/review", headers=headers).json()
    summary = next(
        e["field"] for e in refreshed["editorFields"] if e["field"]["fieldKey"] == "summary"
    )
    assert summary["value"] == ""
    assert summary["photoAssetIds"] == [cover["id"]]

    refreshed_plan, _ = get_plan(client, headers, batch, target_id)
    passage = next(
        p for p in refreshed_plan["plan"]["passages"] if p["bindingHash"] == passage["bindingHash"]
    )
    _update_source_decision(
        client,
        headers,
        batch,
        target_id,
        passage,
        "EDIT",
        value="농가가 확인한 세 번째 문안입니다.",
    )
    body = body_for(client, headers, batch)
    refreshed_suggestion = next(f for f in body["fields"] if f["fieldKey"] == "summary")
    assert refreshed_suggestion["value"] == "농가가 확인한 세 번째 문안입니다."
    assert refreshed_suggestion["photoAssetIds"] == [cover["id"]]
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(headers), json=body)
    assert saved.status_code == 200, saved.text
    body = body_for(client, headers, batch)
    field = next(f for f in body["fields"] if f["fieldKey"] == "summary")
    field.update(
        value="독립 캔버스 문구입니다.",
        state="CONFIRMED",
        provenance="PRODUCER",
        candidateIds=[],
    )
    saved = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(headers), json=body)
    assert saved.status_code == 200, saved.text
    _update_source_decision(client, headers, batch, target_id, passage, "OMIT")
    refreshed = client.get(f"{PREFIX}/{batch['id']}/review", headers=headers).json()
    summary = next(
        e["field"] for e in refreshed["editorFields"] if e["field"]["fieldKey"] == "summary"
    )
    assert summary["value"] == "독립 캔버스 문구입니다."


def test_AC_SRC_2_new_composer_workspace_opts_in_and_existing_workspace_keeps_policy(client, login):
    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.source_analysis.models import Batch, Item, Run

    headers = login("u-kang")
    workspace_url = "/api/source-analysis/product-workspaces"
    legacy = client.post(
        workspace_url,
        headers=key(headers),
        json={"productId": "p-house", "composer": True},
    )
    assert legacy.status_code == 200, legacy.text
    legacy_data = legacy.json()
    requested_opt_in = client.post(
        workspace_url,
        headers=key(headers),
        json={"productId": "p-house", "composer": True, "sourceCopyEnabled": True},
    )
    assert requested_opt_in.status_code == 200, requested_opt_in.text
    assert requested_opt_in.json()["batchId"] == legacy_data["batchId"]
    with get_sessionmaker()() as db:
        assert db.get(Batch, legacy_data["batchId"]).source_copy_enabled is False

    opted_in = client.post(
        workspace_url,
        headers=key(headers),
        json={"composer": True, "sourceCopyEnabled": True},
    )
    assert opted_in.status_code == 200, opted_in.text
    opted_batch_id = opted_in.json()["batchId"]
    with get_sessionmaker()() as db:
        assert db.get(Batch, opted_batch_id).source_copy_enabled is True

    batch = client.get(f"{PREFIX}/{opted_batch_id}", headers=headers).json()
    basic_info = client.put(
        f"{PREFIX}/{opted_batch_id}/basic-info",
        headers=headers,
        json={
            "version": batch["version"],
            "targets": [
                {
                    "targetId": batch["targets"][0]["id"],
                    "basicInfo": {"variety": "온주밀감", "size": "", "expectedBrix": None},
                }
            ],
        },
    )
    assert basic_info.status_code == 200, basic_info.text
    batch = client.get(f"{PREFIX}/{opted_batch_id}", headers=headers).json()
    upload(client, headers, batch, text="합성 보관: 서늘한 곳에 두세요.")
    start(client, headers, opted_batch_id)
    drain()
    with get_sessionmaker()() as db:
        phases = list(
            db.scalars(
                select(Item.phase)
                .join(Run, Run.id == Item.run_id)
                .where(Run.batch_id == opted_batch_id)
            )
        )
    assert "EXTRACT" in phases
    assert "REFINE" not in phases


def test_AC_SRC_10_source_decision_persists_across_addition_then_invalidates_and_purges(
    client, login
):
    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.source_analysis.models import SourceCopyDecision

    headers = login("u-kang")
    batch = create(client, headers)
    source = upload(client, headers, batch)
    start(client, headers, batch["id"])
    drain()
    state, target_id = get_plan(client, headers, batch)
    enabled = client.post(
        f"{PREFIX}/{batch['id']}/source-copy/enable",
        headers=key(headers),
        json={"reviewVersion": state["reviewVersion"]},
    )
    assert enabled.status_code == 200, enabled.text
    state, _ = get_plan(client, headers, batch, target_id)
    passage = next(p for p in state["plan"]["passages"] if p["module"] == "summary")
    original_plan_hash = state["plan"]["planHash"]
    _update_source_decision(
        client, headers, batch, target_id, passage, "EDIT", value="농가 확인 문구입니다."
    )

    current = client.get(f"{PREFIX}/{batch['id']}", headers=headers).json()
    from app.ai.source_analysis import MOCK_REFINE_TEXT

    second = upload(client, headers, current, text=MOCK_REFINE_TEXT)
    start(client, headers, batch["id"])
    drain()
    state, _ = get_plan(client, headers, batch, target_id)
    assert state["plan"]["planHash"] != original_plan_hash
    persisted = next(
        p for p in state["plan"]["passages"] if p["bindingHash"] == passage["bindingHash"]
    )
    assert persisted["decision"]["action"] == "EDIT"

    changed = client.put(
        f"{PREFIX}/{batch['id']}/sources/{source['id']}/details",
        headers=headers,
        json={"sourceVersion": source["revision"], "text": "분류: 최근에 바뀐 시험 자료입니다."},
    )
    assert changed.status_code == 200, changed.text
    with get_sessionmaker()() as db:
        assert not list(
            db.scalars(
                select(SourceCopyDecision).where(
                    SourceCopyDecision.batch_id == batch["id"],
                    SourceCopyDecision.binding_hash == passage["bindingHash"],
                )
            )
        )

    state, _ = get_plan(client, headers, batch, target_id)
    survivor = next(p for p in state["plan"]["passages"] if p["sourceId"] == second["id"])
    _update_source_decision(client, headers, batch, target_id, survivor, "OMIT")
    deleted_source = client.delete(
        f"{PREFIX}/{batch['id']}/sources/{second['id']}?version={second['revision']}",
        headers=headers,
    )
    assert deleted_source.status_code == 202, deleted_source.text
    with get_sessionmaker()() as db:
        assert not list(
            db.scalars(select(SourceCopyDecision).where(SourceCopyDecision.batch_id == batch["id"]))
        )

    current = client.get(f"{PREFIX}/{batch['id']}", headers=headers).json()
    third = upload(client, headers, current, text=MOCK_REFINE_TEXT)
    start(client, headers, batch["id"])
    drain()
    state, _ = get_plan(client, headers, batch, target_id)
    last = next(p for p in state["plan"]["passages"] if p["sourceId"] == third["id"])
    _update_source_decision(client, headers, batch, target_id, last, "OMIT")
    current = client.get(f"{PREFIX}/{batch['id']}", headers=headers).json()
    removed = client.request(
        "DELETE",
        f"{PREFIX}/{batch['id']}",
        headers=key(headers),
        json={"version": current["version"]},
    )
    assert removed.status_code == 202, removed.text
    with get_sessionmaker()() as db:
        assert not list(
            db.scalars(select(SourceCopyDecision).where(SourceCopyDecision.batch_id == batch["id"]))
        )
