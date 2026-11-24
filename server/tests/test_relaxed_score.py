"""AC-SRC-2/3/5/10: source-scoped relaxed diagnostics; no DB/provider access."""

import copy

import pytest

from app.source_analysis import final_score as legacy
from app.source_analysis import relaxed_score as scorer
from app.source_analysis.corpus_score import canonical_bytes, sha256


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


def inputs(reference="A옵션 감귤 4kg입니다.", output=None, tokens=None):
    source = {
        "id": "sample",
        "format": "text",
        "product": "가상 감귤",
        "sentences": [
            {
                "section": legacy.MODULE_SECTIONS["composition"],
                "module": "composition",
                "text": reference,
                "facts": [
                    {
                        "id": "f1",
                        "statement": reference,
                        "mustContain": tokens or ["A옵션", "4kg"],
                        "critical": True,
                    }
                ],
            }
        ],
        "forbidden": [],
    }
    gold = {"schemaVersion": 1, "split": "development", "sources": [source]}
    policy = {
        "schemaVersion": 1,
        "policyVersion": "synthetic-v1",
        "approval": "USER_AUTHORIZED_POLICY",
        "sources": {
            "sample": {
                "sourceSha256": sha256(canonical_bytes(source)),
                "facts": {
                    "f1": {
                        "requirement": "essential",
                        "aliases": [],
                        "reason": "Synthetic control",
                        "sourceRef": "line1",
                    }
                },
                "forbidden": {},
            }
        },
    }
    runs = [
        {
            "id": "sample",
            "format": "text",
            "modules": [
                {"module": "composition", "texts": [reference] if output is None else output}
            ],
        }
    ]
    return gold, runs, {"sample": reference}, policy


def score(data):
    gold, runs, safe, policy = data
    return scorer.score(gold, runs, safe, policy=policy)


def test_AC_SRC_2_source_scope_placement_and_duplicate_once():
    data = inputs()
    data[1][0]["modules"] = [{"module": "storage", "texts": [data[2]["sample"]] * 3}]
    report = score(data)
    assert report["byRequirement"]["essential"]["boundedPreservation"] == {
        "hit": 1,
        "total": 1,
        "rate": 1,
    }
    assert report["acceptance"] == "NOT_ASSESSED"
    assert report["byFact"][0]["id"] == "sample/f1"


@pytest.mark.parametrize("actual", ["A옵션 감귤 4000g입니다.", "A옵션 감귤 4 kg입니다."])
def test_AC_SRC_3_safe_mass_equivalence(actual):
    assert score(inputs(output=[actual]))["byFact"][0]["status"] == "PRESERVED"


@pytest.mark.parametrize(
    "reference,actual",
    [
        ("당도 12~14브릭스입니다.", "당도 12-14 브릭 스입니다."),
        ("무게 2~4kg입니다.", "무게 2000g~4000g입니다."),
    ],
)
def test_AC_SRC_3_range_brix_whitespace(reference, actual):
    assert (
        score(inputs(reference, [actual], tokens=[reference]))["byFact"][0]["status"] == "PRESERVED"
    )


@pytest.mark.parametrize(
    "actual", ["A옵션 감귤 14kg입니다.", "A옵션 감귤 4kga입니다.", "A옵션 감귤 4g입니다."]
)
def test_AC_SRC_3_wrong_mass_never_preserved(actual):
    row = score(inputs(output=[actual]))["byFact"][0]
    assert not row["linkedSelectorHit"]
    assert row["status"] != "PRESERVED"


def test_AC_SRC_3_wrong_option_cross_sentence_ambiguous():
    report = score(inputs(output=["A옵션 감귤 3kg입니다. B옵션 감귤 4kg입니다."]))
    row = report["byFact"][0]
    assert row["status"] == "CONFLICT"
    assert row["pageWideSelectorHit"]
    assert not row["linkedSelectorHit"]


def test_AC_SRC_3_disconnected_tokens_do_not_create_fact():
    row = score(inputs(output=["A옵션 안내", "B옵션 4kg"]))["byFact"][0]
    assert row["status"] == "AMBIGUOUS"
    assert not row["linkedSelectorHit"]


def test_AC_SRC_3_tokens_only_are_diagnostic():
    report = score(inputs(output=["A옵션의 감귤은 4kg 한 상자로 구성했어요."]))
    row = report["byFact"][0]
    assert row["status"] == "SELECTOR_MATCH"
    assert report["supportIssues"][0]["status"] == "UNKNOWN"
    assert report["byRequirement"]["essential"]["boundedPreservation"]["hit"] == 0


def test_AC_SRC_3_explicit_alias_paraphrase_only():
    data = inputs(output=["A옵션의 감귤은 4kg 한 상자로 구성했어요."])
    assert score(data)["byFact"][0]["status"] == "SELECTOR_MATCH"
    data[3]["sources"]["sample"]["facts"]["f1"]["aliases"] = [data[1][0]["modules"][0]["texts"][0]]
    assert score(data)["byFact"][0]["status"] == "PRESERVED"


@pytest.mark.parametrize("actual", ["A옵션은 씨가 있습니다.", "A옵션은 씨가 없지 않습니다."])
def test_AC_SRC_3_negation_never_bounded_preserved(actual):
    row = score(inputs("A옵션은 씨가 없습니다.", [actual], ["A옵션", "씨"]))["byFact"][0]
    assert row["status"] != "PRESERVED"


def test_AC_SRC_3_contradictory_duplicate_does_not_credit():
    row = score(inputs(output=["A옵션 감귤 4kg입니다.", "A옵션 감귤 5kg입니다."]))["byFact"][0]
    assert row["status"] == "CONFLICT"
    assert not row["linkedSelectorHit"]


def test_AC_SRC_2_separate_requirement_format_denominators():
    data = inputs()
    source = data[0]["sources"][0]
    for fid, requirement in (("f2", "optional"), ("f3", "review")):
        fact = copy.deepcopy(source["sentences"][0]["facts"][0])
        fact["id"] = fid
        source["sentences"][0]["facts"].append(fact)
        meta = copy.deepcopy(data[3]["sources"]["sample"]["facts"]["f1"])
        meta["requirement"] = requirement
        data[3]["sources"]["sample"]["facts"][fid] = meta
    data[3]["sources"]["sample"]["sourceSha256"] = sha256(canonical_bytes(source))
    report = score(data)
    assert [report["byRequirement"][r]["facts"] for r in scorer.REQUIREMENTS] == [1, 1, 1]
    assert report["byFormat"]["pdf"]["essential"]["selectorCoverage"]["rate"] is None


@pytest.mark.parametrize("status", ["FAILED", "EMPTY", "REJECTED", "NOT_RUN"])
def test_AC_SRC_5_failed_with_saved_output_keeps_denominator_and_audits(status):
    data = inputs(output=["A옵션 감귤 4kg입니다.", "가격 10000원입니다."])
    data[1][0]["status"] = status
    report = score(data)
    assert report["byFact"][0]["status"] == "NOT_PROCESSED"
    assert report["byRequirement"]["essential"]["selectorCoverage"] == {
        "hit": 0,
        "total": 1,
        "rate": 0,
    }
    assert report["safetyIssues"]


def test_AC_SRC_2_missing_run_counts_miss():
    data = inputs()
    data[1].clear()
    assert score(data)["byFact"][0]["status"] == "NOT_PROCESSED"


def test_AC_SRC_3_forbidden_conflict_explicit_disposition_safety_separate():
    data = inputs(output=["A옵션 감귤 4kg입니다.", "가격 10000원입니다."])
    source = data[0]["sources"][0]
    source["forbidden"] = [{"kind": "other", "text": "A옵션 감귤 4kg"}]
    config = data[3]["sources"]["sample"]
    config["sourceSha256"] = sha256(canonical_bytes(source))
    with pytest.raises(ValueError, match="forbidden"):
        score(data)
    config["forbidden"]["0"] = {"disposition": "enforce", "reason": "Control", "sourceRef": "line1"}
    assert score(data)["forbiddenIssues"]
    config["forbidden"]["0"]["disposition"] = "source_equivalent"
    report = score(data)
    assert not report["forbiddenIssues"]
    assert report["safetyIssues"]


@pytest.mark.parametrize("mutation", ["stale", "missing", "extra", "holdout", "duplicate"])
def test_AC_SRC_2_policy_validation(mutation):
    data = inputs()
    if mutation == "stale":
        data[0]["sources"][0]["product"] = "changed"
    elif mutation == "missing":
        data[3]["sources"]["sample"]["facts"].clear()
    elif mutation == "extra":
        data[3]["sources"]["sample"]["facts"]["unknown"] = {}
    elif mutation == "holdout":
        data[0]["split"] = "holdout"
    else:
        data[1].append(copy.deepcopy(data[1][0]))
    with pytest.raises(ValueError):
        score(data)


def test_AC_SRC_2_inputs_immutable_and_report_redacted():
    data = inputs()
    before = copy.deepcopy(data)
    report = score(data)
    assert data == before
    assert "A옵션" not in str(report)


def test_AC_SRC_3_option_list_without_punctuation_cannot_borrow_quantity():
    row = score(inputs(output=["A옵션 감귤 3kg B옵션 감귤 4kg"]))["byFact"][0]
    assert row["status"] == "AMBIGUOUS"
    assert not row["linkedSelectorHit"]


def test_AC_SRC_3_explicit_copula_negation_conflicts():
    row = score(inputs(output=["A옵션 감귤 4kg이 아닙니다."]))["byFact"][0]
    assert row["status"] == "CONFLICT"
    assert not row["linkedSelectorHit"]


def test_AC_SRC_2_format_identity_cannot_be_overridden():
    data = inputs()
    data[1][0]["format"] = "pdf"
    with pytest.raises(ValueError, match="format"):
        score(data)
