"""DEV-448 private offline comparison boundaries; no model calls."""

import importlib.util
from pathlib import Path

import pytest

PATH = Path(__file__).resolve().parents[2] / "docs/evaluation/i5-text-scoring/compare.py"
spec = importlib.util.spec_from_file_location("text_compare", PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def envelope():
    return {
        "version": 1,
        "gold": {"split": "development", "sources": [{"id": "invented"}]},
        "arms": [
            {"name": n, "records": [], "safeTexts": {"invented": "감귤"}}
            for n in ["baseline", "candidate"]
        ],
    }


def test_AC_SRC_10_compare_keeps_both_arms_and_failed_records(monkeypatch):
    data = envelope()
    data["arms"][1]["records"] = [{"id": "invented", "status": "FAILED"}]
    seen = []

    def score(gold, records, safe):
        seen.append(records)
        return {"failed": bool(records)}

    monkeypatch.setattr(runner.text_score, "score", score)
    report = runner.compare(data)
    assert [a["name"] for a in report["arms"]] == ["baseline", "candidate"]
    assert report["arms"][1]["report"]["failed"] is True
    assert seen == [[], [{"id": "invented", "status": "FAILED"}]]


@pytest.mark.parametrize("mutation", ["holdout", "duplicate", "evidence", "extra", "empty"])
def test_AC_SRC_10_comparison_rejects_confounded_or_invalid_input(monkeypatch, mutation):
    data = envelope()
    if mutation == "holdout":
        data["gold"]["split"] = "holdout"
    if mutation == "duplicate":
        data["arms"][1]["name"] = "baseline"
    if mutation == "evidence":
        data["arms"][1]["safeTexts"] = {"invented": "다른 자료"}
    if mutation == "extra":
        data["arms"][0]["hidden"] = True
    if mutation == "empty":
        data["arms"] = []
    monkeypatch.setattr(runner.text_score, "score", lambda *args: {})
    with pytest.raises(ValueError):
        runner.compare(data)
