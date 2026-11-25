"""DEV-451 fixed-input comparison controls; no DB, provider or holdout access."""

import copy
import json
from threading import Event
from types import SimpleNamespace

import pytest

from app.ai.source_analysis import ExtractionError
from app.ai.source_refine import Refinement, RefineResponse
from app.source_analysis import pipeline_compare as compare
from app.source_analysis.source_presentation import generate


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded(monkeypatch):
    monkeypatch.setattr(compare, "check_frozen", lambda frozen: None)
    monkeypatch.setattr(compare, "code_hashes", lambda: {"fixture": "hash"})
    monkeypatch.setattr(compare, "ledger_snapshot", lambda: pytest.fail("DB access forbidden"))
    monkeypatch.setattr(
        compare.legacy_ai, "refine", lambda *args: pytest.fail("provider forbidden")
    )
    monkeypatch.setattr(compare, "generate", lambda *args: pytest.fail("provider forbidden"))
    yield


def source(sid="source"):
    return {
        "id": sid,
        "format": "text",
        "target": {"id": "target", "name": "합성 감귤"},
        "candidates": [
            {
                "id": "candidate",
                "targetId": "target",
                "fieldKey": "composition",
                "value": "가정용 감귤 3kg",
                "historical": False,
                "evidence": [
                    {
                        "sourceId": sid,
                        "sourceRevision": 1,
                        "page": 1,
                        "spanIds": ["s0"],
                        "quote": "가정용 감귤 3kg",
                    }
                ],
            }
        ],
        "sourceVersions": {sid: {"revision": 1, "sanitizationVersion": 0}},
    }


def data():
    rows = [source(f"source-{i}") for i in range(47)]
    for i, row in enumerate(rows):
        row["subset"] = "public" if i < 24 else "synthetic"
    return {"version": 1, "split": "development", "sources": rows}


def job(row, arm):
    return {"id": row["id"], "format": row["format"], "arm": arm, "trial": 1}


class Calls:
    def __init__(self, *args):
        self.entries = []
        self.count = 0

    def __call__(self, stage, model, payload, targets, images, send, **kwargs):
        self.count += 1
        assert kwargs["output_tokens"] == 8000
        assert "prompt" in payload and "schema" in payload
        return send()


def test_prepare_requires_explicit_fixed_development_population():
    assert len(compare.prepare(data())) == 47
    for split in ["holdout", "test", None]:
        bad = data()
        bad["split"] = split
        with pytest.raises(ValueError, match="EXPLICIT_DEVELOPMENT"):
            compare.prepare(bad)
    bad = data()
    bad["sources"].pop()
    with pytest.raises(ValueError, match="EXACT_47"):
        compare.prepare(bad)
    bad = data()
    bad["sources"][0]["subset"] = "synthetic"
    with pytest.raises(ValueError, match="EXPECTED_24"):
        compare.prepare(bad)


def test_all_188_jobs_predeclared_including_empty_failure_sources():
    inputs = data()
    inputs["sources"][0]["candidates"] = []
    jobs = compare.declare_jobs(compare.prepare(inputs))
    assert len(jobs) == 188
    assert len({(j["id"], j["trial"], j["arm"]) for j in jobs}) == 188
    assert all(j["record"]["status"] == "FAILED" for j in jobs)
    assert len([j for j in jobs if j["id"] == "source-0"]) == 4


def test_wire_whitelists_target_candidates_evidence_no_gold_or_local_metadata():
    row = source()
    original = copy.deepcopy(row)
    row.update(gold="DO_NOT_SEND", safeTexts="DO_NOT_SEND", historicalRecords="DO_NOT_SEND")
    row["target"]["secret"] = "DO_NOT_SEND"
    row["candidates"][0]["gold"] = "DO_NOT_SEND"
    row["candidates"][0]["evidence"][0]["selector"] = "DO_NOT_SEND"
    wire, selected, limits = compare.legacy_payload(row)
    assert "DO_NOT_SEND" not in json.dumps(wire)
    assert wire["target"] == original["target"]
    assert selected == original["candidates"]
    assert not limits["privacyMaskingChanged"]


def test_legacy_masks_value_quote_target_without_changing_original():
    row = source()
    row["target"]["name"] = "fixture@example.com"
    row["candidates"][0]["value"] = "fixture@example.com"
    row["candidates"][0]["evidence"][0]["quote"] = "문의 fixture@example.com"
    original = copy.deepcopy(row)
    wire, selected, limits = compare.legacy_payload(row)
    assert wire["target"]["name"] == wire["candidates"][0]["value"] == "[가림]"
    assert wire["candidates"][0]["evidence"][0]["quote"] == "문의 [가림]"
    assert limits["privacyMaskingChanged"]
    assert row == original and selected[0]["value"] == "fixture@example.com"


def test_baseline_is_free_and_retains_exact_accepted_source_facts():
    row = source()
    base = compare.baseline(row)
    assert base["status"] == "EVALUATED"
    assert base["record"]["modules"] == [{"module": "composition", "texts": ["가정용 감귤 3kg"]}]
    row["sourceVersions"] = {}
    failed = compare.baseline(row)
    assert failed["status"] == failed["record"]["status"] == "FAILED"


def test_empty_inputs_use_no_fake_paid_calls():
    row = source()
    row["candidates"] = []
    base = compare.baseline(row)
    calls = Calls()
    for arm in ["A", "C"]:
        result = compare.execute_job(job(row, arm), row, base, calls, {})
        assert result["record"]["modules"] == []
        assert result["generationStatus"] == "SKIPPED"
    assert calls.count == 0


def test_A_uses_original_validator_and_preserves_failure_denominator(monkeypatch):
    row = source()
    base = compare.baseline(row)
    calls = Calls()
    response = RefineResponse(
        Refinement(
            modules=[
                {
                    "module": "composition",
                    "texts": [{"value": "감귤 99kg", "candidateIds": ["candidate"]}],
                }
            ]
        ),
        {"cost": 0},
        "fixture",
    )
    monkeypatch.setattr(compare.legacy_ai, "refine", lambda *args: response)
    result = compare.execute_job(job(row, "A"), row, base, calls, {})
    assert result["record"]["modules"] == []
    assert result["diagnostics"]["rejectedCount"] == 1
    assert result["rawRecord"]["modules"][0]["texts"] == ["감귤 99kg"]
    assert calls.count == 1


@pytest.mark.parametrize("reason", ["REQUEST_UNCERTAIN", "BUDGET_EXCEEDED"])
def test_A_failure_does_not_silently_substitute_B(monkeypatch, reason):
    row = source()
    base = compare.baseline(row)

    def failed(*args):
        raise ExtractionError(reason, usage={"cost": 0.01})

    monkeypatch.setattr(compare.legacy_ai, "refine", failed)
    result = compare.execute_job(job(row, "A"), row, base, Calls(), {})
    assert result["record"]["status"] == "FAILED" and result["record"]["modules"] == []
    assert result["error"] == reason and result["usage"] == {"cost": 0.01}


def test_C_uses_production_admission_raw_and_effective_are_separate(monkeypatch):
    row = source()
    base = compare.baseline(row)
    monkeypatch.setattr(compare, "generate", lambda mode, prepared: generate("mock", prepared))
    result = compare.execute_job(job(row, "C"), row, base, Calls(), {})
    assert result["presentation"]["status"] == "APPLIED"
    assert result["record"] == result["rawRecord"] == base["record"]
    assert result["generationFailed"] is False


def test_C_provider_failure_has_explicit_B_fallback_and_failed_raw(monkeypatch):
    row = source()
    base = compare.baseline(row)

    def failed(*args):
        raise ExtractionError("REQUEST_UNCERTAIN", usage={"cost": 0.03})

    monkeypatch.setattr(compare, "generate", failed)
    result = compare.execute_job(job(row, "C"), row, base, Calls(), {})
    assert result["record"] == base["record"]
    assert result["record"]["status"] == "EVALUATED"
    assert result["rawRecord"]["status"] == "FAILED" and result["rawRecord"]["modules"] == []
    assert result["generationFailed"] and result["fallbackReason"] == "REQUEST_UNCERTAIN"


def test_C_missing_ID_output_admission_falls_back_without_pretending_model_preserved_facts(
    monkeypatch,
):
    row = source()
    base = compare.baseline(row)
    response = generate("mock", compare.prepare_presentation(base["plan"], row["target"]))
    response.extraction.modules[0].texts[0].text_ids = ["foreign"]
    response.extraction.modules[0].texts[0].value = "무관한 생성 문구"
    monkeypatch.setattr(compare, "generate", lambda *args: response)
    result = compare.execute_job(job(row, "C"), row, base, Calls(), {})
    assert result["fallbackReason"] == "TEXT_ACCOUNTING"
    assert result["record"] == base["record"]
    assert result["rawRecord"]["modules"][0]["texts"] == ["무관한 생성 문구"]


@pytest.mark.parametrize("cause", ["privacy", "input_limit"])
def test_C_privacy_and_full_input_limits_fallback_before_budget_send(monkeypatch, cause):
    row = source()
    base = compare.baseline(row)
    prepared = compare.prepare_presentation(base["plan"], row["target"])
    if cause == "privacy":
        prepared["texts"][0]["value"] = "fixture@example.com"
    else:
        prepared["texts"] *= compare.MAX_INPUT_TEXTS + 1
    monkeypatch.setattr(compare, "prepare_presentation", lambda *args: prepared)
    calls = Calls()
    result = compare.execute_job(job(row, "C"), row, base, calls, {})
    assert calls.count == 0
    assert result["fallbackReason"] == (
        "PRIVACY_CHANGED" if cause == "privacy" else "PRESENTATION_INPUT_LIMIT"
    )
    assert result["record"] == base["record"]


def test_code_drift_stops_remaining_jobs_before_sends(monkeypatch):
    row = source()
    base = compare.baseline(row)
    stop = Event()
    calls = Calls()

    def changed(frozen):
        raise compare.FrozenCodeChanged()

    monkeypatch.setattr(compare, "check_frozen", changed)
    result = compare.execute_job(job(row, "A"), row, base, calls, {}, stop)
    assert stop.is_set() and result["error"] == "FROZEN_CODE_CHANGED"
    assert calls.count == 0


def test_reconciled_local_budget_gate_cannot_exceed_phase_or_cumulative_cap():
    before = {
        "rows": 529,
        "settledMicros": 3_700_270,
        "uncertainReservedMicros": 956_184,
        "remainingMicros": 25_343_546,
    }
    assert compare.ledger_gate(before) == 18
    assert compare.ledger_gate({**before, "remainingMicros": 1_000_000}) == 1
    with pytest.raises(ValueError, match="UNRECONCILED"):
        compare.ledger_gate({**before, "rows": 528})
    with pytest.raises(ValueError, match="BUDGET_EXCEEDED"):
        compare.ledger_gate({**before, "remainingMicros": 0})


def test_dry_run_predeclares_every_job_without_calling_provider_or_DB(monkeypatch, tmp_path):
    path = tmp_path / "input.json"
    path.write_text(json.dumps(data()))
    out = tmp_path / "result"
    before = {
        "rows": 529,
        "settledMicros": 3_700_270,
        "uncertainReservedMicros": 956_184,
        "remainingMicros": 25_343_546,
    }
    monkeypatch.setattr(compare, "ledger_snapshot", lambda: before)
    monkeypatch.setattr(compare, "get_settings", lambda: SimpleNamespace())
    monkeypatch.setattr(compare, "Calls", Calls)
    compare.run(SimpleNamespace(input=path, out=out, execute=False, env_file=None))
    assert len(json.loads((out / "jobs.json").read_text())) == 188
    assert len(json.loads((out / "baselines.json").read_text())) == 47
    protocol = json.loads((out / "protocol.json").read_text())
    assert (
        protocol["goldSentToModels"] is False
        and protocol["OCRCalls"] == protocol["extractionCalls"] == 0
    )
    assert protocol["maxPhaseUsd"] == 18
    assert json.loads((out / "calls.json").read_text()) == []
    assert not (out / "input.json").stat().st_mode & 0o077


def test_legacy_prefix_limit_is_explicit_and_does_not_modify_frozen_candidates():
    row = source()
    row["candidates"] = [{**copy.deepcopy(row["candidates"][0]), "id": f"c{i}"} for i in range(81)]
    wire, selected, limits = compare.legacy_payload(row)
    assert len(wire["candidates"]) == len(selected) == 80
    assert limits["candidatesSkipped"] == 1
    assert len(row["candidates"]) == 81


def test_code_drift_after_response_retains_raw_and_stops_without_retry(monkeypatch):
    row = source()
    base = compare.baseline(row)
    stop = Event()
    checks = []

    def guard(expected):
        checks.append(True)
        if len(checks) > 1:
            raise compare.FrozenCodeChanged()

    monkeypatch.setattr(compare, "check_frozen", guard)
    monkeypatch.setattr(compare, "generate", lambda mode, prepared: generate("mock", prepared))
    calls = Calls()
    result = compare.execute_job(job(row, "C"), row, base, calls, {}, stop)
    assert calls.count == 1 and stop.is_set()
    assert result["raw"]["modules"]
    assert result["record"] == base["record"]
    assert result["fallbackReason"] == "FROZEN_CODE_CHANGED"


def test_mocked_execute_checkpoints_all_arms_and_never_leaks_local_gold(monkeypatch, tmp_path):
    row = source()
    row["gold"] = "DO_NOT_SEND"
    row["safeTexts"] = "DO_NOT_SEND"
    inputs = {"version": 1, "split": "development", "sources": [row]}
    input_path = tmp_path / "input.json"
    input_path.write_text(json.dumps(inputs))
    out = tmp_path / "out"
    monkeypatch.setattr(compare, "SOURCE_COUNT", 1)
    monkeypatch.setattr(compare, "get_settings", lambda: SimpleNamespace())
    monkeypatch.setattr(compare, "Calls", Calls)
    monkeypatch.setattr(
        compare,
        "ledger_snapshot",
        lambda: {
            "rows": 529,
            "settledMicros": 3_700_270,
            "uncertainReservedMicros": 956_184,
            "remainingMicros": 25_343_546,
        },
    )
    monkeypatch.setattr("dotenv.dotenv_values", lambda *args: {"OPENROUTER_API_KEY": "fixture"})

    def legacy(mode, model, target, candidates):
        assert "DO_NOT_SEND" not in json.dumps({"target": target, "candidates": candidates})
        return RefineResponse(
            Refinement(
                modules=[
                    {
                        "module": "composition",
                        "texts": [{"value": candidates[0]["value"], "candidateIds": ["candidate"]}],
                    }
                ]
            ),
            {"cost": 0},
            "fixture",
        )

    monkeypatch.setattr(compare.legacy_ai, "refine", legacy)

    def presentation(mode, prepared):
        assert "DO_NOT_SEND" not in json.dumps(prepared)
        return generate("mock", prepared)

    monkeypatch.setattr(compare, "generate", presentation)
    compare.run(
        SimpleNamespace(input=input_path, out=out, execute=True, env_file=tmp_path / "unused")
    )
    jobs = json.loads((out / "jobs.json").read_text())
    assert len(jobs) == 4 and len(list((out / "jobs").glob("*.json"))) == 4
    assert all(j["record"]["status"] == "EVALUATED" for j in jobs)
    assert all(j["generationStatus"] == "EVALUATED" for j in jobs)
    assert all(j["rawRecord"]["modules"] for j in jobs)
