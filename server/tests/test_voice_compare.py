"""DEV-451 voice experiment budget and frozen-baseline boundaries."""

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.ai.source_analysis import ExtractionError
from app.source_analysis.final_score import MODULE_SECTIONS

PATH = Path(__file__).resolve().parents[2] / "docs/evaluation/i5-text-scoring/voice_compare.py"
spec = importlib.util.spec_from_file_location("voice_compare", PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def fixture(monkeypatch):
    cases, gold, safe = [], [], {}
    for sid in runner.REVIEWED_BASELINE_HASHES:
        value = "감귤을 재배해요."
        record = {"id": sid, "format": "text", "modules": [{"module": "summary", "texts": [value]}]}
        modules = [
            {
                "module": "summary",
                "texts": [{"id": "original", "value": value, "candidateIds": ["c1"]}],
            }
        ]
        candidates = [
            {
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
                        "spanIds": ["s1"],
                        "quote": value,
                    }
                ],
            }
        ]
        source = {
            "id": sid,
            "format": "text",
            "product": "가상 감귤",
            "forbidden": [],
            "sentences": [
                {
                    "section": MODULE_SECTIONS["summary"],
                    "module": "summary",
                    "text": value,
                    "facts": [
                        {"id": "f1", "statement": value, "mustContain": ["감귤"], "critical": True}
                    ],
                }
            ],
        }
        excerpts = []
        cases.append(
            {
                "id": sid,
                "target": {"id": "target", "name": "가상 감귤"},
                "baselineRecord": record,
                "baselineModules": modules,
                "acceptedCandidates": candidates,
                "acceptedCandidateIds": ["c1"],
                "sourceRevisions": {sid: 1},
                "voiceExcerpts": excerpts,
                "hashes": {
                    key: runner.value_hash(obj)
                    for key, obj in {
                        "baselineRecordSha256": record,
                        "baselineModulesSha256": modules,
                        "acceptedCandidatesSha256": candidates,
                        "goldSourceSha256": source,
                        "voiceExcerptsSha256": excerpts,
                    }.items()
                },
            }
        )
        gold.append(source)
        safe[sid] = value
    monkeypatch.setattr(
        runner,
        "REVIEWED_BASELINE_HASHES",
        {c["id"]: runner.value_hash(c["baselineRecord"]) for c in cases},
    )
    return {
        "version": 1,
        "purpose": "VOICE_POLISH_ONLY_EXACT_FOUR_REVIEWED_BASELINES",
        "baselineVersion": "source-refine-v11-routing",
        "baselineTrial": 1,
        "baselineArm": "baseline",
        "hashes": {"focusedSelectionFileSha256": runner.REVIEWED_SELECTION_SHA},
        "gold": {"schemaVersion": 1, "split": "development", "sources": gold},
        "safeTexts": safe,
        "cases": cases,
    }


def test_AC_SRC_10_phase_allowance_includes_previous_uncertainty():
    row = dict(runner.PHASE_BASELINE)
    assert runner.available_micros(row) == 750000
    row["rows"] += 1
    row["uncertainReservedMicros"] += 300000
    assert runner.available_micros(row) == 450000
    with pytest.raises(ValueError):
        runner.available_micros(row, 0.76)


def test_AC_SRC_10_preflight_rejects_unreviewed_output_even_if_manifest_rehashed(monkeypatch):
    data = fixture(monkeypatch)
    data["cases"][0]["baselineRecord"]["modules"][0]["texts"][0] = "다른 문장"
    data["cases"][0]["hashes"]["baselineRecordSha256"] = runner.value_hash(
        data["cases"][0]["baselineRecord"]
    )
    rows = runner.prepare(data)
    assert len(rows) == 4
    assert rows[0]["eligible"] is False
    assert rows[0]["error"] == "REVIEWED_BASELINE_MISMATCH"
    assert sum(r["eligible"] for r in rows) == 3


@pytest.mark.parametrize("failure", ["REQUEST_UNCERTAIN", "INVALID_MODEL_OUTPUT"])
def test_AC_SRC_10_uncertain_call_stops_without_baseline_rescue(monkeypatch, tmp_path, failure):
    data = fixture(monkeypatch)
    assert all(r["eligible"] for r in runner.prepare(data))
    path = tmp_path / "input.json"
    path.write_text(json.dumps(data))
    cfg = SimpleNamespace(openrouter_api_key="fixture")
    monkeypatch.setattr(runner, "get_settings", lambda: cfg)
    monkeypatch.setattr(runner, "validate_local_ledger", lambda c: None)
    monkeypatch.setattr(runner, "ledger_snapshot", lambda: dict(runner.PHASE_BASELINE))
    monkeypatch.setattr(runner, "code_hashes", lambda: {"fixture": "stable"})
    monkeypatch.setattr(runner, "_reports", lambda *args: [])

    class Calls:
        def __init__(self, *args):
            self.entries = []

        def __call__(self, *args, **kwargs):
            self.entries.append({"costKnown": False, "reservedMicros": 1})
            raise ExtractionError(failure)

    monkeypatch.setattr(runner, "Calls", Calls)
    result = runner._run_locked(
        SimpleNamespace(
            input=path, out=tmp_path / "result", execute=True, env_file=None, max_phase_usd=0.75
        )
    )
    assert result["providerCalls"] == 1
    assert result["stopped"] in {"REQUEST_UNCERTAIN", "UNSETTLED_CALL"}
    assert len(result["jobs"]) == 8
    assert all(not j["record"]["modules"] for j in result["jobs"])
