"""Invented migration contract controls, no private source or database."""

import copy
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "gold_migration", Path(__file__).with_name("migrate.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def source_gold():
    return {
        "split": "development",
        "sources": [
            {
                "id": "example",
                "sentences": [
                    {
                        "text": "2025년 수확",
                        "section": "production",
                        "module": "productionProcess",
                        "facts": [
                            {
                                "id": "f1",
                                "statement": "2025년 수확",
                                "mustContain": ["2025년"],
                                "critical": True,
                            }
                        ],
                    }
                ],
                "forbidden": [{"kind": "price", "text": "100원"}],
            }
        ],
    }


def test_policy_classification_preserves_original_critical_and_input():
    original = source_gold()
    saved = copy.deepcopy(original)
    gold, policy, report = module.migrate(original)
    assert original == saved
    assert gold["sources"][0]["sentences"][0]["facts"][0]["critical"] is True
    assert policy["sources"]["example"]["facts"]["f1"]["requirement"] == "review"
    assert report["factMap"][0]["oldCritical"] is True
    assert report["requirements"] == {"review": 1}


@pytest.mark.parametrize(
    "overrides",
    [
        {"missing": {}},
        {"example": {"facts": {"missing": {}}}},
        {"example": {"forbidden": {"3": {}}}},
        {"example": {"unknown": 1}},
        {"example": {"facts": {"f1": {"requirement": "pass"}}}},
        {"example": {"facts": {"f1": {"aliases": [""]}}}},
        {"example": {"forbidden": {"0": {"disposition": "ignore"}}}},
    ],
)
def test_unknown_or_malformed_override_rejects(overrides):
    with pytest.raises(ValueError):
        module.migrate(source_gold(), overrides)


def test_source_specific_forbidden_resolution_and_no_reason_in_report():
    _, policy, report = module.migrate(
        source_gold(),
        {
            "example": {
                "forbidden": {
                    "0": {"disposition": "source_equivalent", "reason": "PRIVATE QUOTE"}
                }
            }
        },
    )
    assert (
        policy["sources"]["example"]["forbidden"]["0"]["disposition"]
        == "source_equivalent"
    )
    assert "PRIVATE QUOTE" not in str(report)


def test_holdout_rejects():
    gold = source_gold()
    gold["split"] = "holdout"
    with pytest.raises(ValueError):
        module.migrate(gold)


def test_explicit_manifest_format_is_added_without_changing_original():
    original = source_gold()
    gold, policy, _ = module.migrate(original, formats={"example": "text"})
    assert "format" not in original["sources"][0]
    assert gold["sources"][0]["format"] == "text"
    assert policy["sources"]["example"]["sourceSha256"] == module.digest(
        gold["sources"][0]
    )


@pytest.mark.parametrize("formats", [{}, {"example": "unknown"}])
def test_missing_or_invalid_format_rejects(formats):
    with pytest.raises(ValueError):
        module.migrate(source_gold(), formats=formats)
