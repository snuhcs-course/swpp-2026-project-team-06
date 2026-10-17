"""DEV-56/57/58: publication, privacy, budget and provider contracts."""

import io
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from types import SimpleNamespace

import pytest
from PIL import Image
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis import worker
from app.source_analysis.models import Asset, Batch, Draft, Page, Spend
from tests.test_source_analysis import (
    PREFIX,
    create,
    drain,
    key,
    reviewed,
    source_settings,  # noqa: F401
    start,
    upload,
)


def saved(client, headers):
    b = create(client, headers)
    upload(client, headers, b)
    start(client, headers, b["id"])
    drain()
    r = reviewed(client, headers, b["id"])
    d = client.post(
        f"{PREFIX}/{b['id']}/drafts",
        headers=key(headers),
        json={
            "reviewVersion": r["reviewVersion"],
            "targets": [
                {
                    "targetId": b["targets"][0]["id"],
                    "enabledModuleIds": ["hero", "summary", "storage"],
                }
            ],
        },
    ).json()["drafts"][0]
    return b, d


def apply(client, headers, b, d, product="p-house", request_headers=None, version=None):
    p = client.get(f"/api/products/mine/{product}", headers=headers).json()
    return client.post(
        f"{PREFIX}/{b['id']}/drafts/{d['id']}/apply",
        headers=request_headers or key(headers),
        json={
            "productId": product,
            "productVersion": version or p["version"],
            "draftVersion": d["version"],
        },
    )


def test_AC_SRC_7_apply_preserves_sales_and_is_idempotent(client, login):
    h = login("u-kang")
    b, d = saved(client, h)
    before = client.get("/api/products/mine/p-house", headers=h).json()
    headers = key(h)
    a = apply(client, h, b, d, request_headers=headers, version=before["version"])
    assert a.status_code == 200, a.text
    again = apply(client, h, b, d, request_headers=headers, version=before["version"])
    assert again.json() == a.json()
    public = client.get("/api/products/p-house").json()
    assert public["moduleDetail"]["modules"][1]["texts"][0]["value"] == "제주산 감귤입니다."
    assert all(
        k not in str(public["moduleDetail"])
        for k in ["sourceId", "candidateId", "photoAssetId", "reviewVersion"]
    )
    after = client.get("/api/products/mine/p-house", headers=h).json()
    for field in ["options", "stages", "status", "detailContent"]:
        assert after.get(field) == before.get(field)
    assert after["version"] == before["version"] + 1
    assert apply(client, h, b, d, version=before["version"]).status_code == 409


def test_AC_SRC_7_stale_review_and_cross_tenant_rejected(client, login):
    h = login("u-kang")
    b, d = saved(client, h)
    with get_sessionmaker()() as db:
        db.get(Batch, b["id"]).review_version += 1
        db.commit()
    assert apply(client, h, b, d).status_code == 409
    other = login("u-misook")
    response = client.post(
        f"{PREFIX}/{b['id']}/drafts/{d['id']}/apply",
        headers=key(other),
        json={"productId": "p-house", "productVersion": 1, "draftVersion": 1},
    )
    assert response.status_code in [403, 404]


def test_AC_SRC_9_pre_publication_draft_requires_resave(client, login):
    h = login("u-kang")
    b, d = saved(client, h)
    with get_sessionmaker()() as db:
        draft = db.get(Draft, d["id"])
        snap = deepcopy(draft.snapshot)
        del snap["batchVersion"]
        del snap["sourceVersions"]
        draft.snapshot = snap
        db.commit()
    assert apply(client, h, b, d).status_code == 409


def test_AC_SRC_10_deleting_sources_preserves_cost_ledger(client, login):
    h = login("u-kang")
    b = create(client, h)
    with get_sessionmaker()() as db:
        db.add(Spend(id="completed-call", reserved_micros=10000, charged_micros=1000))
        db.add(Spend(id="uncertain-call", reserved_micros=10000))
        db.commit()
    response = client.request(
        "DELETE", f"{PREFIX}/{b['id']}", headers=h, json={"version": b["version"]}
    )
    assert response.status_code == 202
    worker.cleanup()
    with get_sessionmaker()() as db:
        assert db.get(Spend, "completed-call").charged_micros == 1000
        assert db.get(Spend, "uncertain-call").reserved_micros == 10000


def test_AC_SRC_6_public_photo_is_independent_and_requires_approval(client, login):
    h = login("u-kang")
    b, d = saved(client, h)
    from app.source_analysis.storage import Storage

    image = io.BytesIO()
    Image.new("RGB", (30, 30), "orange").save(image, "PNG")
    with get_sessionmaker()() as db:
        source = Asset(
            batch_id=b["id"],
            checksum="image",
            storage_key=Storage().put(image.getvalue()),
            filename="original.png",
            mime="image/png",
            size=len(image.getvalue()),
            target_ids=[b["targets"][0]["id"]],
            common=False,
            original_photo=True,
            status="PREPARED",
            page_count=1,
        )
        db.add(source)
        db.flush()
        db.add(
            Page(
                asset_id=source.id,
                revision=1,
                number=1,
                spans=[],
                redacted_spans=[],
                image_key=source.storage_key,
                sanitized_key=source.storage_key,
                redactions=[],
            )
        )
        draft = db.get(Draft, d["id"])
        snap = deepcopy(draft.snapshot)
        snap["previewModules"][0]["photoAssetIds"] = [source.id]
        snap["sourceVersions"][source.id] = {"revision": 1, "sanitizationVersion": 0}
        draft.snapshot = snap
        sid = source.id
        db.commit()
    assert apply(client, h, b, d).status_code == 409
    with get_sessionmaker()() as db:
        db.get(Asset, sid).privacy_approved = True
        db.commit()
    result = apply(client, h, b, d)
    assert result.status_code == 200, result.text
    uri = result.json()["moduleDetail"]["modules"][0]["photos"][0]["uri"]
    assert client.get(uri).status_code == 200
    current = client.get(f"{PREFIX}/{b['id']}", headers=h).json()
    client.request("DELETE", f"{PREFIX}/{b['id']}", headers=h, json={"version": current["version"]})
    worker.cleanup()
    assert client.get(uri).status_code == 200
    with get_sessionmaker()() as db:
        from app.catalog.models import Product

        db.get(Product, "p-house").status = "DRAFT"
        db.commit()
    assert client.get(uri).status_code == 404


def test_AC_SRC_5_identical_reanalysis_reuses_candidates(client, login):
    h = login("u-kang")
    b, d = saved(client, h)
    before = client.get(f"{PREFIX}/{b['id']}/review", headers=h).json()
    start(client, h, b["id"])
    drain()
    after = client.get(f"{PREFIX}/{b['id']}/review", headers=h).json()
    assert after == before


def test_AC_SRC_5_changed_prompt_does_not_reuse_previous_success(client, login):
    from app.ai.source_analysis import PROMPT_VERSION
    from app.source_analysis.models import Item, Run

    h = login("u-kang")
    b = create(client, h)
    upload(client, h, b)
    start(client, h, b["id"])
    drain()
    with get_sessionmaker()() as db:
        previous = db.scalar(select(Run).where(Run.batch_id == b["id"]))
        previous.prompt_version = "source-v3"
        previous_id = previous.id
        db.commit()
    start(client, h, b["id"])
    drain()
    with get_sessionmaker()() as db:
        current = db.scalar(select(Run).where(Run.batch_id == b["id"], Run.id != previous_id))
        assert current.prompt_version == PROMPT_VERSION
        items = list(
            db.scalars(select(Item).where(Item.run_id == current.id, Item.phase == "EXTRACT"))
        )
        assert items and all(i.status == "SUCCEEDED" for i in items)


def test_AC_SRC_5_stale_queued_prompt_fails_before_call(client, login, monkeypatch):
    from app.source_analysis.models import Item, Run

    h = login("u-kang")
    b = create(client, h)
    upload(client, h, b)
    start(client, h, b["id"])
    with get_sessionmaker()() as db:
        run = db.scalar(select(Run).where(Run.batch_id == b["id"]))
        run.prompt_version = "source-v3"
        rid = run.id
        db.commit()

    def must_not_call(*args, **kwargs):
        pytest.fail("stale queued prompt must not reach the provider")

    monkeypatch.setattr(worker, "extract", must_not_call)
    drain()
    with get_sessionmaker()() as db:
        item = db.scalar(select(Item).where(Item.run_id == rid))
        assert item.status == "FAILED" and item.error == "PROMPT_CHANGED"
        assert item.sent is False


@pytest.mark.parametrize(
    "model,prices,reasoning",
    [
        ("google/gemini-3.1-flash-lite", (0.25, 1.5), {"enabled": False}),
        ("google/gemini-3-flash-preview", (0.5, 3.0), {"effort": "minimal", "exclude": True}),
        ("openai/gpt-6.1-sol", (2.0, 10.0), {"effort": "low", "exclude": True}),
    ],
)
def test_AC_SRC_6_openrouter_contract_and_cost(monkeypatch, model, prices, reasoning):
    from app.ai import source_analysis as adapter

    calls = {}

    class Client:
        def __init__(self, **kw):
            calls["client"] = kw
            self.chat = SimpleNamespace(completions=self)

        def create(self, **kw):
            calls["request"] = kw
            return SimpleNamespace(
                id="req",
                usage=SimpleNamespace(model_dump=lambda: {"cost": 0.002}),
                choices=[
                    SimpleNamespace(
                        finish_reason="stop",
                        message=SimpleNamespace(content='{"candidates":[],"photo_requests":[]}'),
                    )
                ],
            )

        def close(self):
            pass

    monkeypatch.setattr(adapter, "OpenAI", Client)
    result = adapter.extract("openrouter", model, {"pages": []}, [], [])
    assert result.usage["cost"] == 0.002
    assert calls["client"]["base_url"] == "https://openrouter.ai/api/v1"
    assert calls["client"]["max_retries"] == 0
    req = calls["request"]
    assert req["response_format"]["type"] == "json_schema"
    assert req["model"] == model
    assert req["max_tokens"] == 4096
    assert req["extra_body"]["provider"]["max_price"] == {
        "prompt": prices[0],
        "completion": prices[1],
    }
    assert req["extra_body"]["provider"]["allow_fallbacks"] is False
    assert req["extra_body"]["reasoning"] == reasoning
    assert all(p["type"] == "text" for p in req["messages"][1]["content"])


@pytest.mark.parametrize(
    "model,cap",
    [
        ("google/gemini-3.1-flash-lite", 0.012),
        ("google/gemini-3-flash-preview", 0.024),
        ("openai/gpt-6.1-sol", 0.10),
    ],
)
def test_AC_SRC_5_concurrent_budget_and_unknown_cost_retained(monkeypatch, model, cap):
    from app.ai.source_analysis import ExtractionError
    from app.source_analysis.budget import reserve, settle

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_budget_usd", cap)

    def attempt(i):
        with get_sessionmaker()() as db:
            try:
                rid = reserve(
                    db, SimpleNamespace(id=f"job{i}", attempt=1), "openrouter", model, {}, [], []
                )
                db.commit()
                return rid
            except ExtractionError as e:
                db.rollback()
                assert e.code == "BUDGET_EXCEEDED"
                return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))
    assert sum(r is not None for r in results) == 1
    rid = next(r for r in results if r)
    with get_sessionmaker()() as db:
        settle(db, rid, {})
        db.commit()
        assert db.get(Spend, rid).charged_micros is None
        settle(db, rid, {"cost": 0.001})
        db.commit()
        assert db.get(Spend, rid).charged_micros == 1000
    assert attempt(3)


def test_AC_SRC_6_visual_pages_need_approval(client, login):
    h = login("u-kang")
    b = create(client, h)
    s = upload(client, h, b)
    b = client.get(f"{PREFIX}/{b['id']}", headers=h).json()
    response = client.post(
        f"{PREFIX}/{b['id']}/runs",
        headers=key(h),
        json={"batchVersion": b["version"], "visualPages": {s["id"]: [1]}},
    )
    assert response.status_code == 400 or response.status_code == 422


def test_AC_SRC_5_evaluation_budget_separate(monkeypatch):
    from app.ai.source_analysis import ExtractionError
    from app.source_analysis.budget import reserve

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", True)
    monkeypatch.setattr(cfg, "source_evaluation_budget_usd", 0.001)
    with get_sessionmaker()() as db:
        with pytest.raises(ExtractionError, match="BUDGET_EXCEEDED"):
            reserve(
                db,
                SimpleNamespace(id="eval", attempt=1),
                "openrouter",
                cfg.source_analysis_model,
                {},
                [],
                [],
            )
        db.rollback()
        assert list(db.scalars(select(Spend))) == []


def test_AC_SRC_1_browser_form_normalizes_newlines(client, login):
    from app.ai.source_analysis import MOCK_TEXT

    h = login("u-kang")
    b = create(client, h)
    upload(client, h, b, text=MOCK_TEXT.replace("\n", "\r\n"))
    start(client, h, b["id"])
    drain()
    assert len(client.get(f"{PREFIX}/{b['id']}/review", headers=h).json()["candidates"]) == 3


def test_AC_SRC_3_weight_cannot_become_count():
    from app.ai.source_analysis import ExtractionError
    from app.source_analysis.schemas import Extraction

    chunk = {
        "sourceId": "s",
        "sourceRevision": 1,
        "pages": [{"number": 1, "spans": [{"id": "s1", "text": "감귤 5kg"}]}],
    }
    result = Extraction.model_validate(
        {
            "photo_requests": [],
            "candidates": [
                {
                    "targetId": "t",
                    "fieldKey": "pieceCount",
                    "value": "5kg",
                    "historical": False,
                    "evidence": [
                        {
                            "sourceId": "s",
                            "sourceRevision": 1,
                            "page": 1,
                            "spanIds": ["s1"],
                            "quote": "감귤 5kg",
                        }
                    ],
                }
            ],
        }
    )
    with pytest.raises(ExtractionError, match="UNSUPPORTED_PIECE_COUNT"):
        worker.validate(result, chunk, {"t"})


def test_AC_SRC_5_standalone_worker_registers_related_models(client, login):
    import os
    import subprocess
    import sys

    h = login("u-kang")
    b = create(client, h)
    upload(client, h, b)
    start(client, h, b["id"])
    env = {
        **os.environ,
        "SOURCE_ANALYSIS_ENABLED": "true",
        "SOURCE_ANALYSIS_PROVIDER": "mock",
        "SOURCE_STORAGE_DIR": get_settings().source_storage_dir,
    }
    subprocess.run(
        [
            sys.executable,
            "-c",
            "from app.source_analysis.worker import run_once;\n"
            "for _ in range(4):\n if not run_once(): break",
        ],
        env=env,
        check=True,
        timeout=30,
    )
    assert len(client.get(f"{PREFIX}/{b['id']}/review", headers=h).json()["candidates"]) == 3


@pytest.mark.parametrize(
    "model", ["google/gemini-3-flash-preview", "google/gemini-3.1-flash-lite", "openai/gpt-6.1-sol"]
)
def test_AC_SRC_10_model_selection_is_budget_qualified(model):
    from pydantic import ValidationError

    from app.core.config import Settings

    cfg = Settings(
        _env_file=None,
        source_analysis_enabled=True,
        source_analysis_provider="openrouter",
        openrouter_api_key="test",
        source_analysis_model=model,
    )
    assert cfg.source_analysis_model == model
    assert Settings(_env_file=None).source_analysis_model == "google/gemini-3-flash-preview"
    with pytest.raises(ValidationError, match="budget-qualified"):
        Settings(
            _env_file=None,
            source_analysis_enabled=True,
            source_analysis_provider="openrouter",
            openrouter_api_key="test",
            source_analysis_model="unpriced-model",
        )


def test_AC_SRC_10_reservation_uses_run_model_not_current_default(monkeypatch):
    from app.ai.source_analysis import ExtractionError
    from app.source_analysis.budget import reserve

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_analysis_model", "google/gemini-3.1-flash-lite")
    monkeypatch.setattr(cfg, "source_budget_usd", 0.012)
    with get_sessionmaker()() as db:
        # A queued Flash request cannot use the cheaper current default's reservation.
        with pytest.raises(ExtractionError, match="BUDGET_EXCEEDED"):
            reserve(
                db,
                SimpleNamespace(id="flash", attempt=1),
                "openrouter",
                "google/gemini-3-flash-preview",
                {},
                [],
                [],
            )
        db.rollback()
        monkeypatch.setattr(cfg, "source_analysis_model", "google/gemini-3-flash-preview")
        rid = reserve(
            db,
            SimpleNamespace(id="lite", attempt=1),
            "openrouter",
            "google/gemini-3.1-flash-lite",
            {},
            [],
            [],
        )
        assert db.get(Spend, rid).reserved_micros <= 12000
        db.rollback()
        with pytest.raises(ExtractionError, match="UNSUPPORTED_MODEL"):
            reserve(
                db,
                SimpleNamespace(id="unknown", attempt=1),
                "openrouter",
                "unpriced-model",
                {},
                [],
                [],
            )
        assert list(db.scalars(select(Spend))) == []


def test_AC_SRC_10_unpriced_model_never_calls_provider():
    from app.ai.source_analysis import ExtractionError, extract

    with pytest.raises(ExtractionError, match="UNSUPPORTED_MODEL"):
        extract("openrouter", "unpriced-model", {"pages": []}, [], [])


@pytest.mark.parametrize(
    "model", ["google/gemini-3-flash-preview", "google/gemini-3.1-flash-lite", "openai/gpt-6.1-sol"]
)
def test_AC_SRC_10_evaluation_calls_and_reports_selected_model(monkeypatch, tmp_path, model):
    import json
    import sys

    from app.ai.source_analysis import ExtractionResponse
    from app.source_analysis import synthetic
    from app.source_analysis.schemas import Extraction

    cfg = get_settings()
    monkeypatch.setattr(cfg, "openrouter_api_key", "test")
    monkeypatch.setattr(cfg, "source_analysis_model", model)
    # main() enables evaluation for the invocation; restore it after this test.
    monkeypatch.setattr(cfg, "source_evaluation", True)
    cases = tmp_path / "cases.json"
    cases.write_text(
        json.dumps([{"id": "selection", "kind": "text", "text": "fixture", "expected": []}])
    )
    monkeypatch.setattr(synthetic, "prepare", lambda *_: [{"image": None, "spans": []}])
    calls = []

    def extract(mode, selected_model, chunk, targets, images):
        calls.append((mode, selected_model))
        return ExtractionResponse(
            Extraction(candidates=[], photo_requests=[]), {"cost": 0.001}, "test-request"
        )

    monkeypatch.setattr(synthetic, "extract", extract)
    output = tmp_path / "output"
    monkeypatch.setattr(
        sys, "argv", ["synthetic", "--live", "--cases", str(cases), "--output", str(output)]
    )
    synthetic.main()
    assert calls == [("openrouter", model)]
    report = json.loads((output / "report.json").read_text())
    assert report["model"] == model
    assert report["cases"][0]["status"] == "EVALUATED"
    diagnostic = json.loads((output / "selection-diagnostic.json").read_text())
    assert diagnostic["usage"] == {"cost": 0.001}
    assert diagnostic["requestId"] == "test-request"
    with get_sessionmaker()() as db:
        row = db.scalar(select(Spend))
        assert row.evaluation and row.charged_micros == 1000
