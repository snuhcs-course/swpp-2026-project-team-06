"""DEV-450 offline accepted-input comparison keeps partial/failure denominators."""

import importlib.util
from pathlib import Path

import pytest

PATH = Path(__file__).resolve().parents[2] / "docs/evaluation/i5-text-scoring/inventory_compare.py"
spec = importlib.util.spec_from_file_location("inventory_compare", PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def envelope():
    return {
        "version": 1,
        "gold": {"split": "development", "sources": [{"id": "invented", "format": "text"}]},
        "safeTexts": {"invented": "가상 자료"},
        "sources": [
            {
                "id": "invented",
                "target": {"id": "target", "name": "가상 감귤"},
                "candidates": [],
                "acceptedCandidateIds": [],
                "sourceRevisions": {},
                "baselineRecord": {
                    "id": "invented",
                    "format": "text",
                    "status": "FAILED",
                    "modules": [],
                },
            }
        ],
    }


def test_AC_SRC_10_inventory_comparison_retains_failed_sources(monkeypatch):
    data = envelope()
    monkeypatch.setattr(runner.text_score, "score", lambda gold, records, safe: records)
    monkeypatch.setattr(
        runner, "refine_inventory", lambda *a, **k: (_ for _ in ()).throw(ValueError())
    )
    result = runner.compare(data)
    assert result["providerCalls"] == 0
    assert result["arms"][0]["records"] == result["arms"][1]["records"]
    assert result["sources"][0]["error"] == "INVENTORY_ASSEMBLY_REJECTED"


def test_AC_SRC_10_review_control_cannot_count_as_complete(monkeypatch):
    monkeypatch.setattr(runner.text_score, "score", lambda gold, records, safe: {})
    monkeypatch.setattr(
        runner,
        "refine_inventory",
        lambda *a, **k: {
            "modules": [{"module": "summary", "texts": [{"value": "가상 자료"}]}],
            "status": "REVIEW_REQUIRED",
        },
    )
    result = runner.compare(envelope())
    assert result["arms"][1]["records"][0]["status"] == "PARTIAL"


@pytest.mark.parametrize("mutation", ["holdout", "duplicate", "missing", "foreign"])
def test_AC_SRC_10_inventory_comparison_rejects_wrong_split_or_alignment(mutation):
    data = envelope()
    if mutation == "holdout":
        data["gold"]["split"] = "holdout"
    elif mutation == "duplicate":
        data["sources"] *= 2
    elif mutation == "missing":
        data["sources"] = []
    else:
        data["sources"][0]["baselineRecord"]["id"] = "other"
    with pytest.raises(ValueError, match="redacted"):
        runner.compare(data)
