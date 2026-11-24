"""DEV-451 shared budget, paired preflight and uncertainty-stop regressions."""

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ai.source_analysis import ExtractionError
from app.source_analysis.final_score import MODULE_SECTIONS

PATH = Path(__file__).resolve().parents[2] / "docs/evaluation/i5-text-scoring/passage_compare.py"
spec = importlib.util.spec_from_file_location("passage_compare", PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def envelope():
    sources, rows, safe = [], [], {}
    for sid in sorted(runner.PRIMARY_IDS):
        value = "가상 농장의 감귤이에요."
        sources.append(
            {
                "id": sid,
                "format": "text",
                "product": "가상 감귤",
                "sentences": [
                    {
                        "section": MODULE_SECTIONS["summary"],
                        "module": "summary",
                        "text": value,
                        "facts": [
                            {
                                "id": "f1",
                                "statement": value,
                                "mustContain": ["감귤"],
                                "critical": True,
                            }
                        ],
                    }
                ],
                "forbidden": [],
            }
        )
        candidate = {
            "id": "c1",
            "targetId": "target",
            "fieldKey": "summary",
            "value": value,
            "historical": False,
            "evidence": [
                {
                    "sourceId": sid,
                    "sourceRevision": 1,
                    "page": 1,
                    "spanIds": ["span1"],
                    "quote": value,
                }
            ],
        }
        rows.append(
            {
                "id": sid,
                "target": {"id": "target", "name": "가상 감귤"},
                "candidates": [candidate],
                "acceptedCandidateIds": ["c1"],
                "sourceRevisions": {sid: 1},
                "baselineRecord": {"id": sid, "format": "text", "modules": []},
            }
        )
        safe[sid] = value
    return {
        "version": 1,
        "gold": {"schemaVersion": 1, "split": "development", "sources": sources},
        "sources": rows,
        "safeTexts": safe,
    }


def test_AC_SRC_10_shared_phase_budget_counts_prior_uncertain_spend():
    baseline = dict(runner.PHASE_BASELINE)
    assert runner.available_micros(baseline) == 1_500_000
    baseline["rows"] += 1
    baseline["uncertainReservedMicros"] += 400_000
    assert runner.available_micros(baseline) == 1_100_000
    baseline["settledMicros"] += 1_200_000
    assert runner.available_micros(baseline) == 0
    with pytest.raises(ValueError):
        runner.available_micros(dict(runner.PHASE_BASELINE), 1.51)


def test_AC_SRC_10_preflight_refuses_private_source_for_both_arms():
    data = envelope()
    data["sources"][0]["candidates"][0]["evidence"][0]["quote"] = "문의 010-1234-5678"
    rows = runner.prepare(data)
    assert len(rows) == 8
    assert rows[0]["eligible"] is False
    assert rows[0]["error"] == "PRIVATE_SOURCE"
    assert "requests" not in rows[0]
    assert sum(r["eligible"] for r in rows) == 7


def test_AC_SRC_10_preflight_keeps_offline_gold_out_of_provider_request():
    rows = runner.prepare(envelope())
    assert all(r["eligible"] for r in rows)
    for row in rows:
        assert set(row["requests"]) == {"v11", "passages"}
        for request in row["requests"].values():
            assert "safeTexts" not in json.dumps(request)
            assert "mustContain" not in json.dumps(request)
            assert request["model"] == runner.MODEL


@pytest.mark.parametrize("mutation", ["holdout", "foreign", "duplicate"])
def test_AC_SRC_10_cohort_is_frozen_before_reservations(mutation):
    data = envelope()
    if mutation == "holdout":
        data["gold"]["split"] = "holdout"
    elif mutation == "foreign":
        data["gold"]["sources"][0]["id"] = "foreign"
    else:
        data["sources"][0] = data["sources"][1]
    with pytest.raises(ValueError):
        runner.prepare(data)


@pytest.mark.parametrize("unknown_kind", ["request", "cost"])
def test_AC_SRC_10_uncertainty_stops_remaining_jobs_without_retry(
    monkeypatch, tmp_path, unknown_kind
):
    path = tmp_path / "input.json"
    path.write_text(json.dumps(envelope()))
    cfg = SimpleNamespace(
        app_env="local", database_url="local-fixture", openrouter_api_key="fixture"
    )
    monkeypatch.setattr(runner, "get_settings", lambda: cfg)
    monkeypatch.setattr(runner, "validate_local_ledger", lambda c: None)
    monkeypatch.setattr(runner, "ledger_snapshot", lambda: dict(runner.PHASE_BASELINE))
    monkeypatch.setattr(runner, "code_hashes", lambda: {"fixture": "stable"})
    monkeypatch.setattr(runner, "_score_all", lambda data, jobs: [])

    class UncertainCalls:
        def __init__(self, *args):
            self.entries = []

        def __call__(self, *args, **kwargs):
            self.entries.append({"costKnown": False, "reservedMicros": 1000})
            if unknown_kind == "request":
                raise ExtractionError("REQUEST_UNCERTAIN")
            raise ExtractionError(
                "INVALID_MODEL_OUTPUT",
                details={"reason": "MISSING_PASSAGE_IDS", "untrusted": "must-not-be-recorded"},
            )

    monkeypatch.setattr(runner, "Calls", UncertainCalls)
    result = runner._run_locked(
        SimpleNamespace(
            input=path,
            out=tmp_path / "private-result",
            execute=True,
            cohort="primary",
            max_phase_usd=1.5,
            env_file=None,
        )
    )
    assert result["providerCalls"] == 1
    assert result["stopped"] == (
        "REQUEST_UNCERTAIN" if unknown_kind == "request" else "UNSETTLED_CALL"
    )
    assert sum(j["status"] == "NOT_RUN" for j in result["jobs"]) == 31
    assert len(result["jobs"]) == 32
    if unknown_kind == "cost":
        assert result["jobs"][0]["validationReason"] == "MISSING_PASSAGE_IDS"
        failure = next((tmp_path / "private-result").rglob("*-failure.json")).read_text()
        assert "MISSING_PASSAGE_IDS" in failure
        assert "must-not-be-recorded" not in failure
