"""DEV-452: sources and sale inputs form one private, versioned generation input."""

from copy import deepcopy
from uuid import uuid4

import pytest

from app.core.db import get_sessionmaker
from app.source_analysis.models import ProductWorkspace, Run
from tests.test_source_analysis import source_settings, upload  # noqa: F401
from tests.test_source_page_migration import SOURCE, open_composer

BASE = "/api/source-analysis/product-workspaces/p-house"


def prepare(client, login):
    response = client.post(
        "/api/source-analysis/product-workspaces",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json={"composer": True, "sourceCopyEnabled": True},
    )
    assert response.status_code == 200, response.text
    return response.json()


def inputs():
    return {
        "productName": "카라향",
        "productHint": "카라향",
        "origin": "제주",
        "requestedKg": None,
        "terms": {
            "options": [],
            "rows": [],
            "shippingFeeType": "FREE",
            "shippingFee": None,
            "remoteAreaFee": None,
            "deliveryWindow": None,
            "maxDelayUntil": None,
        },
    }


def post(client, login, row, info, action="setup", **extra):
    return client.post(
        f"/api/source-analysis/product-workspaces/{row['productId']}/{action}",
        headers={**login("u-kang"), "Idempotency-Key": str(uuid4())},
        json={"version": row["version"], "inputs": info, **extra},
    )


def test_AC_SRC_1_partial_setup_persists_without_publication_or_invented_values(client, login):
    row = prepare(client, login)
    result = post(client, login, row, inputs())
    assert result.status_code == 200, result.text
    reopened = open_composer(client, login, pid=row["productId"])
    assert reopened["snapshot"]["setupInputs"] == inputs()
    assert result.json()["product"]["status"] == "DRAFT"
    assert reopened["snapshot"]["setupInputs"]["terms"]["deliveryWindow"] is None


def test_AC_SRC_1_generation_freezes_material_and_current_sale_inputs(client, login, monkeypatch):
    from app.source_analysis import worker
    from tests.test_source_analysis import add_cover, drain

    seen = []
    original = worker.extract

    def capture(mode, model, chunk, targets, images):
        seen.extend(deepcopy(targets))
        return original(mode, model, chunk, targets, images)

    monkeypatch.setattr(worker, "extract", capture)
    row = prepare(client, login)
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    upload(client, login("u-kang"), batch, text="카라향의 예전 안내 가격은 20,000원입니다.")
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    add_cover(client, login("u-kang"), row["batchId"])
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    info = inputs()
    info["requestedKg"] = 500
    info["terms"].update(
        options=[{"optionId": "opt-5", "label": "5kg", "weightKg": 5}],
        rows=[
            {
                "key": "one",
                "startsAt": "2026-10-07",
                "endsAt": "2026-11-09",
                "options": {"opt-5": {"price": 35000}},
            }
        ],
        deliveryWindow={"start": "2026-11-10", "end": "2026-11-20"},
        maxDelayUntil="2026-11-30",
    )
    response = post(client, login, row, info, "generate", batchVersion=batch["version"])
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["product"]["stages"][0]["options"]["opt-5"]["price"] == 35000
    with get_sessionmaker()() as db:
        run = db.get(Run, result["run"]["id"])
        from app.source_analysis.setup import SetupInputs

        assert run.inputs and run.targets[0]["producerInputs"] == SetupInputs.model_validate(
            info
        ).model_dump(mode="json", by_alias=True)
        frozen = deepcopy(run.targets)
        # A different future setting must not mutate queued generation context.
        w = db.get(ProductWorkspace, row["productId"])
        modified = deepcopy(w.snapshot)
        modified["setupInputs"]["requestedKg"] = 900
        w.snapshot = modified
        db.commit()
        db.refresh(run)
        assert run.targets == frozen
    blocked = post(client, login, result["workspace"], info)
    assert blocked.status_code == 409
    drain()
    if not seen:
        from app.source_analysis.models import Item

        with get_sessionmaker()() as db:
            details = [
                (i.phase, i.status, i.error, i.diagnostics)
                for i in db.query(Item).filter(Item.run_id == result["run"]["id"])
            ]
        pytest.fail(str(details))
    assert seen[0]["producerInputs"]["requestedKg"] == 500
    assert seen[0]["producerInputs"]["terms"]["rows"][0]["options"]["opt-5"]["price"] == 35000


@pytest.mark.parametrize("kind", ["workspace", "batch", "bad_options", "no_sources"])
def test_AC_SRC_9_invalid_generation_rolls_back_setup_and_never_queues(client, login, kind):
    row = prepare(client, login)
    info = inputs()
    extra = {"batchVersion": 999}
    if kind == "workspace":
        row["version"] += 1
    elif kind == "bad_options":
        info["terms"]["options"] = [{"optionId": "a", "label": "5kg", "weightKg": 5}] * 2
    elif kind == "no_sources":
        batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
        extra["batchVersion"] = batch["version"]
    response = post(client, login, row, info, "generate", **extra)
    assert response.status_code in [400, 409], response.text
    with get_sessionmaker()() as db:
        w = db.get(ProductWorkspace, row["productId"])
        assert "setupInputs" not in w.snapshot
        assert not db.query(Run).filter(Run.batch_id == row["batchId"]).count()


def test_AC_SRC_9_setup_is_owner_only(client, login, other_farm_headers):
    row = prepare(client, login)
    response = client.post(
        f"/api/source-analysis/product-workspaces/{row['productId']}/setup",
        headers={**other_farm_headers, "Idempotency-Key": str(uuid4())},
        json={"version": row["version"], "inputs": inputs()},
    )
    assert response.status_code == 404


def test_AC_SRC_9_missing_saved_inputs_cannot_borrow_old_sale_settings():
    from app.core.errors import ApiError
    from app.source_analysis.setup import require_sale_inputs

    with pytest.raises(ApiError):
        require_sale_inputs({"setupInputs": inputs()})


def test_AC_SRC_5_presentation_context_masks_contact_and_preserves_sale_numbers():
    from app.source_analysis.presentation_plan import _safe_inputs

    result = _safe_inputs(
        {"productName": "문의 owner@example.com", "terms": {"price": 35000, "date": "2026-12-10"}}
    )
    assert "owner@example.com" not in result["productName"]
    assert result["terms"] == {"price": 35000, "date": "2026-12-10"}


def complete_inputs():
    info = inputs()
    info["requestedKg"] = 500
    info["terms"].update(
        options=[{"optionId": "opt-5", "label": "5kg", "weightKg": 5}],
        rows=[
            {
                "key": "one",
                "startsAt": "2026-10-07",
                "endsAt": "2026-11-09",
                "options": {"opt-5": {"price": 35000}},
            }
        ],
        deliveryWindow={"start": "2026-11-10", "end": "2026-11-20"},
        maxDelayUntil="2026-11-30",
    )
    return info


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda i: i.update(productHint=" "), "productHint"),
        (lambda i: i.update(requestedKg=None), "setupInputs"),
        (lambda i: i["terms"].update(deliveryWindow=None), "setupInputs"),
        (lambda i: i["terms"].update(maxDelayUntil=None), "setupInputs"),
        (lambda i: i["terms"]["rows"][0]["options"]["opt-5"].update(price=None), "setupInputs"),
        (None, "sources"),
    ],
)
def test_AC_SRC_1_generation_requires_every_required_input(client, login, change, field):
    """DEV-452 (PM 11/27): no page is generated while a required setup item is empty."""
    row = prepare(client, login)
    h = login("u-kang")
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=h).json()
    if change is not None:
        upload(client, h, batch, text="카라향 소개 글입니다.")
        batch = client.get(f"{SOURCE}/{row['batchId']}", headers=h).json()
    info = complete_inputs()
    if change is not None:
        change(info)
    response = post(client, login, row, info, "generate", batchVersion=batch["version"])
    assert response.status_code == 400, response.text
    assert field in response.json()["details"]["fields"]
    with get_sessionmaker()() as db:
        assert db.query(Run).filter(Run.batch_id == row["batchId"]).count() == 0
    # Saving partial input without generating stays allowed.
    assert post(client, login, row, info).status_code == 200


def test_AC_SRC_1_product_photos_alone_do_not_generate_a_page(client, login):
    """DEV-452 QA 11/28: a page needs a text, image, PDF or TXT material, not photos alone."""
    from tests.test_source_analysis import add_cover

    row = prepare(client, login)
    h = login("u-kang")
    add_cover(client, h, row["batchId"])
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=h).json()
    assert [s["originalPhoto"] for s in batch["sources"]] == [True]
    response = post(
        client, login, row, complete_inputs(), "generate", batchVersion=batch["version"]
    )
    assert response.status_code == 400, response.text
    assert "sources" in response.json()["details"]["fields"]
    with get_sessionmaker()() as db:
        assert db.query(Run).filter(Run.batch_id == row["batchId"]).count() == 0
