"""Local writing runner boundaries. No test sends a provider request."""

import json
from types import SimpleNamespace

import pytest

from app.ai.source_analysis import ExtractionError
from app.source_analysis import copy_preview as runner


@pytest.fixture
def harness(tmp_path, monkeypatch):
    snapshot = {**runner.COPY_BASELINE, "remainingMicros": 2_833_586}
    baseline = tmp_path / "baseline.json"
    baseline.write_text(json.dumps(snapshot))
    cfg = SimpleNamespace(openrouter_api_key="test")
    monkeypatch.setattr(runner, "get_settings", lambda: cfg)
    monkeypatch.setattr(runner, "validate_local_ledger", lambda cfg: None)
    monkeypatch.setattr(runner, "ledger_snapshot", lambda: dict(snapshot))
    monkeypatch.setattr(
        runner,
        "load_inputs",
        lambda path: [({"id": "one"}, {}, {}, []), ({"id": "two"}, {}, {}, [])],
    )
    monkeypatch.setattr(
        runner.ai,
        "writer_payload",
        lambda ledger: {"prompt": "audited only", "schema": {"type": "object"}, "claims": []},
    )
    monkeypatch.setattr(runner.ai, "edit", lambda *args: pytest.fail("Paid request"))
    args = SimpleNamespace(
        max_usd=0.25,
        out=tmp_path / "run",
        manifest=tmp_path / "input.json",
        ledger_baseline=baseline,
        execute=False,
        env_file=None,
    )
    return args, snapshot


def test_AC_SRC_11_copy_dry_run_never_calls_provider(harness):
    args, _ = harness
    runner.run(args)
    records = json.loads((args.out / "records.json").read_text())
    assert len(records) == 2
    assert all(r["status"] == "DRY_RUN_NO_PROVIDER_CALL" for r in records)
    assert not (args.out / "one/fixture.json").exists()


@pytest.mark.parametrize("amount", [0, -0.1, 0.251, float("nan"), float("inf")])
def test_AC_SRC_11_copy_slice_cap_rejected_before_calls(harness, amount):
    args, _ = harness
    args.max_usd = amount
    with pytest.raises(ValueError, match="QUARTER"):
        runner.run(args)
    assert not args.out.exists()


def test_AC_SRC_11_uncertain_spend_consumes_shared_copy_slice(harness):
    args, snapshot = harness
    snapshot["rows"] += 1
    snapshot["uncertainReservedMicros"] += 250_000
    with pytest.raises(ExtractionError, match="BUDGET_EXCEEDED"):
        runner.run(args)
    assert not args.out.exists()


def test_AC_SRC_11_rewound_ledger_is_rejected(harness):
    args, snapshot = harness
    snapshot["rows"] -= 1
    with pytest.raises(ValueError, match="NOT_RECONCILED"):
        runner.run(args)
    assert not args.out.exists()


@pytest.mark.parametrize("error", ["REQUEST_UNCERTAIN", "BUDGET_EXCEEDED", "UNEXPECTED"])
def test_AC_SRC_11_copy_failure_preserves_evidence_stops_other_source(harness, monkeypatch, error):
    args, _ = harness
    args.execute = True

    class FailedCalls:
        def __init__(self, *args):
            self.entries = []

        def __call__(self, *args, **kwargs):
            self.entries.append({"costKnown": False, "reservedMicros": 1234})
            if error == "UNEXPECTED":
                raise RuntimeError("SDK error")
            raise ExtractionError(error)

    monkeypatch.setattr(runner, "Calls", FailedCalls)
    if error == "UNEXPECTED":
        with pytest.raises(RuntimeError, match="SDK error"):
            runner.run(args)
    else:
        runner.run(args)
    assert not (args.out / "two").exists()
    assert not (args.out / "one/fixture.json").exists()
    assert json.loads((args.out / "calls.json").read_text())[0]["reservedMicros"] == 1234
    assert (args.out / "ledger-after.json").exists()
    records = json.loads((args.out / "records.json").read_text())
    assert records[0]["status"] == (
        "UNEXPECTED_FAILURE" if error == "UNEXPECTED" else "NEEDS_REVIEW"
    )


def test_AC_SRC_11_copy_input_hash_checked_before_ledger_or_provider(tmp_path, monkeypatch):
    fixture = tmp_path / "fixture.json"
    fixture.write_text("{}")
    ledger = tmp_path / "ledger.json"
    ledger.write_text(json.dumps({"inputFixtureSha256": "0" * 64}))
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps({"sources": [{"id": "example", "fixture": str(fixture), "ledger": str(ledger)}]})
    )
    monkeypatch.setattr(runner, "validate_ledger", lambda *args: pytest.fail("Hash not checked"))
    with pytest.raises(ValueError, match="HASH_MISMATCH"):
        runner.load_inputs(manifest)


def test_AC_SRC_11_copy_request_reserves_duplicate_system_schema():
    payload = {"prompt": "full instruction", "schema": {"type": "object"}, "claims": ["data"]}
    chunk = runner.request_chunk(payload)
    assert chunk == {
        "completeRequest": payload,
        "systemPrompt": payload["prompt"],
        "responseFormatSchema": payload["schema"],
    }


def test_AC_SRC_11_copy_cannot_reset_allowance_with_newer_checkpoint(harness):
    args, snapshot = harness
    newer = dict(
        snapshot, rows=snapshot["rows"] + 1, settledMicros=snapshot["settledMicros"] + 50_000
    )
    args.ledger_baseline.write_text(json.dumps(newer))
    with pytest.raises(ValueError, match="ORIGINAL_COPY_BASELINE_REQUIRED"):
        runner.run(args)
    assert not args.out.exists()


def test_AC_SRC_11_copy_concurrent_slice_rejected_before_calls(harness, monkeypatch):
    args, _ = harness

    def already_locked(*args):
        raise BlockingIOError()

    monkeypatch.setattr(runner.fcntl, "flock", already_locked)
    with pytest.raises(ValueError, match="ALREADY_RUNNING"):
        runner.run(args)
    assert not args.out.exists()
