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
