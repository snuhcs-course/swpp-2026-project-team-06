"""Local experimental runner boundaries; no real provider calls."""

import hashlib
import io
import json
from types import SimpleNamespace

import pytest
from PIL import Image

from app.source_analysis import design_preview as runner


def test_AC_SRC_11_local_ledger_boundary():
    for url in [
        "postgresql://u:p@prod.example/farmclub_dev445_eval",
        "postgresql://u:p@127.0.0.1/farmclub",
    ]:
        with pytest.raises(ValueError, match="LOCAL_LEDGER"):
            runner.validate_local_ledger(SimpleNamespace(app_env="local", database_url=url))
    runner.validate_local_ledger(
        SimpleNamespace(
            app_env="local",
            database_url="postgresql://u:p@127.0.0.1/farmclub_dev445_eval",
        )
    )


def test_AC_SRC_11_scrub_planner_copy_preserves_saved_text_and_photo_presence():
    modules = [
        {
            "id": "hero",
            "texts": [{"value": "문의 010-1234-5678"}],
            "photos": [{"uri": "/private/photo.png"}],
        }
    ]
    safe = runner.safe_modules(modules)
    assert "010-1234-5678" not in safe[0]["texts"][0]["value"]
    assert safe[0]["photos"] and "uri" not in safe[0]["photos"][0]
    assert modules[0]["texts"][0]["value"] == "문의 010-1234-5678"
    assert modules[0]["photos"][0]["uri"] == "/private/photo.png"


def test_AC_SRC_11_dry_run_never_calls_provider_and_rejects_unreviewed_source(
    tmp_path, monkeypatch
):
    buffer = io.BytesIO()
    Image.new("RGB", (160, 160), "orange").save(buffer, "PNG")
    image = tmp_path / "source.png"
    image.write_bytes(buffer.getvalue())
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    item = {
        "id": "example",
        "path": str(image),
        "sha256": digest,
        "privacyReviewedSha256": digest,
        "modules": [
            {"id": "hero", "texts": [{"fieldKey": "name", "value": "Saved fruit"}], "photos": []}
        ],
    }
    manifest = tmp_path / "input.json"
    manifest.write_text(json.dumps({"sources": [item]}))
    baseline = tmp_path / "baseline.json"
    baseline.write_text(json.dumps({"rows": 1, "settledMicros": 100, "uncertainReservedMicros": 0}))
    snapshot = {
        "rows": 1,
        "settledMicros": 100,
        "uncertainReservedMicros": 0,
        "remainingMicros": 4_999_900,
    }
    monkeypatch.setattr(runner, "get_settings", lambda: SimpleNamespace())
    monkeypatch.setattr(runner, "ledger_snapshot", lambda: snapshot)
    monkeypatch.setattr(runner, "validate_local_ledger", lambda cfg: None)
    monkeypatch.setattr(runner.ai, "analyze", lambda *args: pytest.fail("Unexpected paid call"))
    args = SimpleNamespace(
        max_usd=1,
        out=tmp_path / "dry",
        manifest=manifest,
        ledger_baseline=baseline,
        execute=False,
        env_file=None,
    )
    runner.run(args)
    records = json.loads((args.out / "records.json").read_text())
    assert records[0]["status"] == "DRY_RUN_NO_PROVIDER_CALL"
    assert not (args.out / "example/fixture.json").exists()
    item["privacyReviewedSha256"] = "0" * 64
    manifest.write_text(json.dumps({"sources": [item]}))
    args.out = tmp_path / "unreviewed"
    with pytest.raises(ValueError, match="UNREVIEWED_SOURCE"):
        runner.run(args)
    assert not args.out.exists()
    item["privacyReviewedSha256"] = digest
    manifest.write_text(json.dumps({"sources": [item]}))
    baseline.write_text(json.dumps({"rows": 2, "settledMicros": 200, "uncertainReservedMicros": 0}))
    with pytest.raises(ValueError, match="BASELINE_NOT_RECONCILED"):
        runner.run(args)
    assert not args.out.exists()


def test_AC_SRC_11_invalid_modules_rejected_before_database_or_provider(tmp_path, monkeypatch):
    manifest = tmp_path / "invalid.json"
    manifest.write_text(
        json.dumps(
            {
                "sources": [
                    {
                        "id": "example",
                        "path": "never-read.png",
                        "sha256": "a" * 64,
                        "privacyReviewedSha256": "a" * 64,
                        "modules": [],
                    }
                ]
            }
        )
    )
    monkeypatch.setattr(runner, "get_settings", lambda: pytest.fail("Database accessed"))
    monkeypatch.setattr(runner.ai, "analyze", lambda *args: pytest.fail("Unexpected paid call"))
    args = SimpleNamespace(
        max_usd=1,
        out=tmp_path / "no-output",
        manifest=manifest,
        ledger_baseline=tmp_path / "unused.json",
        execute=True,
        env_file=None,
    )
    with pytest.raises(ValueError):
        runner.run(args)
    assert not args.out.exists()


def test_AC_SRC_11_compact_profile_retains_all_source_pixels_for_cropping():
    buffer = io.BytesIO()
    Image.new("RGB", (400, 8000), "orange").save(buffer, "PNG")
    source = runner.prepare_raster(buffer.getvalue(), "long-example")
    original = source.image.tobytes()
    tiles = runner.make_tiles(source, profile="compact")
    assert [t["bounds"] for t in tiles] == [
        [0, 0, 400, 3600],
        [0, 1800, 400, 5400],
        [0, 3600, 400, 7200],
        [0, 5400, 400, 8000],
    ]
    assert all(t["width"] <= 384 and t["profile"] == "compact" for t in tiles)
    assert sum(len(t["image"]) for t in tiles) <= 400000
    assert source.image.tobytes() == original
    with pytest.raises(ValueError):
        runner.make_tiles(source, profile="unknown")


def test_AC_SRC_11_review_unexpected_provider_error_retains_audit(tmp_path, monkeypatch):
    from app.source_analysis import design_review as review

    buffer = io.BytesIO()
    Image.new("RGB", (160, 160), "orange").save(buffer, "PNG")
    image = tmp_path / "source.png"
    image.write_bytes(buffer.getvalue())
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    modules = [
        {"id": "taste", "texts": [{"fieldKey": "taste", "value": "Saved text"}], "photos": []}
    ]
    item = {
        "id": "example",
        "path": str(image),
        "sha256": digest,
        "privacyReviewedSha256": digest,
        "modules": modules,
    }
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"sources": [item]}))
    parent = tmp_path / "parent"
    (parent / "example").mkdir(parents=True)
    (parent / "protocol.json").write_text(json.dumps({"preparationProfile": "standard"}))
    (parent / "example/fixture.json").write_text(
        json.dumps({"content": {"modules": modules}, "provenance": {"sourceSha256": digest}})
    )
    region = {
        "id": "diagram",
        "tileId": "tile-00",
        "bounds": [0, 0, 1000, 1000],
        "kind": "comparison",
        "role": "sizeGuide",
        "confidence": 0.9,
        "complete": True,
    }
    plan = {
        "theme": "citrus-warm",
        "regions": [region],
        "sections": [
            {
                "id": "taste",
                "group": "taste",
                "layout": "figure",
                "tone": "paper",
                "moduleIds": ["taste"],
                "regionIds": ["diagram"],
            }
        ],
        "warnings": [],
    }
    (parent / "example/response.json").write_text(json.dumps(plan))
    baseline = tmp_path / "baseline.json"
    snapshot = {
        "rows": 1,
        "settledMicros": 100,
        "uncertainReservedMicros": 0,
        "remainingMicros": 4_999_900,
    }
    baseline.write_text(json.dumps(snapshot))
    monkeypatch.setattr(review, "ledger_snapshot", lambda: snapshot)
    monkeypatch.setattr(review, "validate_local_ledger", lambda cfg: None)
    monkeypatch.setattr(review, "get_settings", lambda: SimpleNamespace(openrouter_api_key="test"))

    class FailedCalls:
        def __init__(self, *args):
            self.entries = []

        def __call__(self, *args, **kwargs):
            self.entries.append({"reservedMicros": 1000, "costKnown": False})
            raise RuntimeError("Unexpected SDK failure")

    monkeypatch.setattr(review, "Calls", FailedCalls)
    args = SimpleNamespace(
        manifest=manifest,
        parent_run=parent,
        ledger_baseline=baseline,
        out=tmp_path / "review",
        max_usd=0.1,
        execute=True,
        env_file=None,
    )
    with pytest.raises(RuntimeError, match="Unexpected SDK"):
        review.run(args)
    assert json.loads((args.out / "calls.json").read_text())[0]["costKnown"] is False
    assert json.loads((args.out / "records.json").read_text())[0]["status"] == "UNEXPECTED_FAILURE"
    assert json.loads((args.out / "ledger-after.json").read_text()) == snapshot


def test_AC_SRC_11_comparison_margin_is_source_bound_and_preserves_pixels(tmp_path):
    from app.source_analysis import source_design as core

    buffer = io.BytesIO()
    Image.new("RGB", (400, 400), "orange").save(buffer, "PNG")
    source = core.prepare_raster(buffer.getvalue(), "diagram-example")
    tiles = core.make_tiles(source)
    modules = [
        {"id": "taste", "texts": [{"fieldKey": "taste", "value": "Saved text"}], "photos": []}
    ]
    region = {
        "id": "diagram",
        "tileId": tiles[0]["id"],
        "bounds": [200, 200, 800, 800],
        "kind": "comparison",
        "role": "sizeGuide",
        "confidence": 0.95,
        "complete": True,
    }
    plan = {
        "theme": "citrus-warm",
        "regions": [region],
        "sections": [
            {
                "id": "taste",
                "group": "taste",
                "layout": "figure",
                "tone": "paper",
                "moduleIds": ["taste"],
                "regionIds": ["diagram"],
            }
        ],
        "warnings": [],
    }
    compiled = core.compile_plan(source, tiles, modules, plan, tmp_path / "compiled")
    record = compiled["provenance"]["regions"][0]
    assert record["modelNativeBounds"] == [80, 80, 320, 320]
    assert record["contextMarginPixels"] == 20
    assert record["nativeBounds"] == [60, 60, 340, 340]
    with Image.open(compiled["localAssets"][0]["path"]) as crop:
        assert crop.tobytes() == source.image.crop((60, 60, 340, 340)).tobytes()
    assert region["bounds"] == [200, 200, 800, 800]


def test_AC_SRC_11_normal_run_schedules_diagram_review_without_operator_choice(
    tmp_path, monkeypatch
):
    buffer = io.BytesIO()
    Image.new("RGB", (400, 400), "orange").save(buffer, "PNG")
    source = tmp_path / "source.png"
    source.write_bytes(buffer.getvalue())
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    modules = [
        {"id": "taste", "texts": [{"fieldKey": "taste", "value": "Frozen text"}], "photos": []}
    ]
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "sources": [
                    {
                        "id": "example",
                        "path": str(source),
                        "sha256": digest,
                        "privacyReviewedSha256": digest,
                        "modules": modules,
                    }
                ]
            }
        )
    )
    baseline = tmp_path / "baseline.json"
    snapshot = {
        "rows": 1,
        "settledMicros": 100,
        "uncertainReservedMicros": 0,
        "remainingMicros": 4_999_900,
    }
    baseline.write_text(json.dumps(snapshot))
    monkeypatch.setattr(runner, "ledger_snapshot", lambda: snapshot)
    monkeypatch.setattr(runner, "validate_local_ledger", lambda cfg: None)
    monkeypatch.setattr(runner, "get_settings", lambda: SimpleNamespace(openrouter_api_key="test"))
    plan = {
        "theme": "citrus-warm",
        "regions": [
            {
                "id": "diagram",
                "tileId": "tile-00",
                "bounds": [200, 200, 800, 800],
                "kind": "comparison",
                "role": "sizeGuide",
                "confidence": 0.95,
                "complete": True,
            }
        ],
        "sections": [
            {
                "id": "taste",
                "group": "taste",
                "layout": "figure",
                "tone": "paper",
                "moduleIds": ["taste"],
                "regionIds": ["diagram"],
            }
        ],
        "warnings": [],
    }
    review = {
        "reviews": [
            {
                "regionId": "diagram",
                "tileId": "tile-00",
                "bounds": [100, 100, 900, 900],
                "confidence": 0.95,
                "verdict": "EXPAND_COMPLETE",
            }
        ]
    }
    monkeypatch.setattr(
        runner.ai, "analyze", lambda *args: runner.ai.DesignResponse(plan, {}, "plan")
    )
    monkeypatch.setattr(
        runner.ai,
        "review_comparisons",
        lambda *args: runner.ai.DesignResponse(review, {}, "review"),
    )
    stages = []

    class ReplayCalls:
        def __init__(self, *args):
            self.entries = []

        def __call__(self, stage, model, chunk, targets, images, fn, **kwargs):
            stages.append(stage)
            self.entries.append({"stage": stage, "costKnown": True, "costUsd": 0})
            return fn()

    monkeypatch.setattr(runner, "Calls", ReplayCalls)
    args = SimpleNamespace(
        manifest=manifest,
        ledger_baseline=baseline,
        out=tmp_path / "run",
        max_usd=1,
        execute=True,
        env_file=None,
        profile="standard",
    )
    runner.run(args)
    assert stages == ["automatic-source-design", "automatic-diagram-review"]
    fixture = json.loads((args.out / "example/fixture.json").read_text())
    assert fixture["content"]["modules"] == modules
    assert fixture["provenance"]["diagramReview"]["requestId"] == "review"
    assert len(fixture["design"]["media"]) == 1
    assert (args.out / "example/planning-response.json").exists()

    # An uncertain review keeps the current safe text fixture but must not send the next source.
    original = json.loads(manifest.read_text())
    second = dict(original["sources"][0], id="second")
    original["sources"].append(second)
    manifest.write_text(json.dumps(original))
    stages.clear()

    class UncertainReviewCalls(ReplayCalls):
        def __call__(self, stage, model, chunk, targets, images, fn, **kwargs):
            if stage == "automatic-diagram-review":
                from app.ai.source_analysis import ExtractionError

                stages.append(stage)
                self.entries.append({"stage": stage, "costKnown": False, "reservedMicros": 1000})
                raise ExtractionError("REQUEST_UNCERTAIN")
            return super().__call__(stage, model, chunk, targets, images, fn, **kwargs)

    monkeypatch.setattr(runner, "Calls", UncertainReviewCalls)
    args.out = tmp_path / "uncertain-review-run"
    runner.run(args)
    assert stages == ["automatic-source-design", "automatic-diagram-review"]
    assert not (args.out / "second").exists()
    withheld = json.loads((args.out / "example/fixture.json").read_text())
    assert withheld["content"]["modules"] == modules
    assert withheld["design"]["media"] == {}
    assert len(json.loads((args.out / "calls.json").read_text())) == 2
