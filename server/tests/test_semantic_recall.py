"""DEV-264: semantic recall only asks the judge about strict misses; unknown is a miss."""

import json

import pytest

from app.source_analysis import semantic_recall as sr


def gold():
    return sr.fs.Gold.model_validate(
        {
            "schemaVersion": 1,
            "split": "development",
            "sources": [
                {
                    "id": "s1",
                    "format": "text",
                    "product": "황금향",
                    "sentences": [
                        {
                            "section": "storage",
                            "module": "storage",
                            "text": "서늘한 곳에 30일 보관하고 냉장은 피하세요.",
                            "where": "보관",
                            "facts": [
                                {
                                    "id": "f-strict",
                                    "statement": "서늘한 곳 보관",
                                    "mustContain": ["서늘한 곳"],
                                    "critical": False,
                                },
                                {
                                    "id": "f-reworded",
                                    "statement": "30일 보관 가능",
                                    "mustContain": ["30일"],
                                    "critical": True,
                                },
                                {
                                    "id": "f-unknown",
                                    "statement": "냉장 보관 금지",
                                    "mustContain": ["냉장"],
                                    "critical": False,
                                },
                            ],
                        }
                    ],
                    "forbidden": [],
                }
            ],
        }
    )


@pytest.fixture
def out(tmp_path):
    record = {
        "id": "s1",
        "format": "text",
        "status": "EVALUATED",
        "modules": [{"module": "storage", "texts": ["서늘한 곳에 한 달 두세요."]}],
    }
    (tmp_path / "s1.output.json").write_text(json.dumps(record, ensure_ascii=False))
    return tmp_path


def test_AC_SRC_2_only_strict_misses_reach_the_judge_and_unknown_is_a_miss(out):
    asked = []

    def judge(facts, sections):
        asked.extend(f["id"] for f in facts)
        assert sections["storage"] == "서늘한 곳에 한 달 두세요."
        return {"f-reworded": "yes", "f-unknown": "unknown"}, {"cost": 0.001}

    rows, spent, _ = sr.score(out, gold(), judge=judge)
    assert sorted(asked) == ["f-reworded", "f-unknown"]
    got = {r["fact"]: (r["strict"], r["semantic"]) for r in rows}
    assert got == {
        "f-strict": (True, True),
        "f-reworded": (False, True),
        "f-unknown": (False, False),
    }
    overall = sr.summary(rows)["overall"]
    assert overall["strict"] == {"hit": 1, "total": 3}
    assert overall["semantic"] == {"hit": 2, "total": 3}
    assert overall["criticalSemantic"] == {"hit": 1, "total": 1}
    assert spent == {"usd": 0.001, "calls": 1}


def test_AC_SRC_2_judge_failure_or_budget_counts_as_unknown(out):
    def broken(facts, sections):
        raise sr.fact_judge.JudgeError("INVALID")

    rows, _, _ = sr.score(out, gold(), judge=broken)
    assert sum(r["semantic"] for r in rows) == 1  # Only the strict hit.

    rows, spent, _ = sr.score(out, gold(), judge=broken, max_usd=0)
    assert spent["calls"] == 0 and sum(r["semantic"] for r in rows) == 1


def test_AC_SRC_2_holdout_needs_explicit_approval(out):
    (out / "metadata.json").write_text(json.dumps({"split": "holdout", "sources": []}))
    with pytest.raises(SystemExit, match="allow-holdout"):
        sr.main(["--out", str(out), "--gold", str(out / "missing.json")])
