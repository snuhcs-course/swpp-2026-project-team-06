"""Exact source quotation copy-control contract (no provider calls)."""

import importlib.util
from copy import deepcopy
from pathlib import Path

import pytest

from app.source_analysis import voice_polish

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "source_copy", ROOT / "docs/evaluation/i5-text-scoring/source_copy.py"
)
source_copy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(source_copy)

TARGET = {"id": "target-a", "name": "가상 감귤"}
REVISIONS = {"source-a": 1, "source-b": 3}


def candidate(
    candidate_id,
    value,
    quote=None,
    *,
    span="span-1",
    source="source-a",
    revision=1,
    historical=False,
    field="summary",
    page=1,
):
    return {
        "id": candidate_id,
        "targetId": TARGET["id"],
        "fieldKey": field,
        "value": value,
        "historical": historical,
        "evidence": [
            {
                "sourceId": source,
                "sourceRevision": revision,
                "page": page,
                "spanIds": [span],
                "quote": quote if quote is not None else value,
            }
        ],
    }


def request(rows, modules=None):
    modules = (
        modules
        if modules is not None
        else [
            {
                "module": "summary",
                "texts": [
                    {
                        "id": "base-summary",
                        "value": "baseline prose",
                        "candidateIds": [r["id"] for r in rows],
                    }
                ],
            }
        ]
    )
    return voice_polish.prepare(TARGET, rows, modules, [], REVISIONS)


def test_AC_SRC_10_uses_full_exact_quote_instead_of_candidate_value_and_keeps_provenance():
    quote = "저희 농장은\n당도 12브릭스 정도로 나와요."
    req = request([candidate("c1", "농장 당도 12브릭스", quote, span="page-2-line-4")])

    result = source_copy.compose(req, source_revisions=REVISIONS)

    passage = result["passages"][0]
    assert passage["value"] == quote
    assert passage["sourceExact"] is True
    assert passage["semanticAssessment"] == "PENDING"
    assert passage["provenance"][0]["sourceId"] == "source-a"
    assert passage["provenance"][0]["sourceRevision"] == 1
    assert passage["provenance"][0]["spanIds"] == ["page-2-line-4"]
    assert len(passage["provenance"][0]["quoteSha256"]) == 64
    assert result["modules"][0]["texts"][0]["value"] == quote
    assert result["requiresContentReview"] is True


def test_AC_SRC_10_preserves_warmth_connectives_and_line_breaks_without_rewriting():
    quote = "저희가 직접 골라 보내드려요.\n그리고 아침마다 상태를 살펴요."
    req = request([candidate("c1", "선별 배송", quote)])

    result = source_copy.compose(req, source_revisions=REVISIONS)

    assert result["passages"][0]["value"] == quote
    assert "그리고" in result["passages"][0]["value"]
    assert "\n" in result["passages"][0]["value"]


def test_AC_SRC_10_numeric_qualifiers_and_complete_clause_are_not_split_or_normalized():
    quote = "약 12브릭스 정도였고,\n수확량은 300kg 내외로 예상해요."
    req = request([candidate("c1", "12브릭스; 300kg", quote)])

    result = source_copy.compose(req, source_revisions=REVISIONS)

    assert result["passages"][0]["value"] == quote
    assert result["passages"][0]["value"].count("\n") == 1
    assert "약 12브릭스 정도" in result["passages"][0]["value"]
    assert "300kg 내외로 예상" in result["passages"][0]["value"]


def test_AC_SRC_10_only_identical_source_location_and_quote_deduplicate_with_all_refs():
    quote = "저희 농장은 매일 과실을 살펴요."
    rows = [
        candidate("c1", quote, span="same-span"),
        candidate("c2", quote, span="same-span"),
        candidate("c3", quote, span="different-span"),
    ]
    req = request(rows)

    result = source_copy.compose(req, source_revisions=REVISIONS)

    assert len(result["passages"]) == 2
    assert sum(o["disposition"] == "DEDUPLICATED" for o in result["occurrences"]) == 1
    assert sum(o["disposition"] == "DISPLAYED" for o in result["occurrences"]) == 2
    first = next(p for p in result["passages"] if "c1" in p["candidateIds"])
    assert {"c1", "c2"}.issubset(first["candidateIds"])
    assert len(first["provenance"]) == 1
    assert len(first["occurrenceIds"]) == 2
    assert result["summary"]["inputEvidenceOccurrences"] == 3


def test_AC_SRC_10_same_words_from_distinct_evidence_are_not_conflated():
    quote = "감귤을 정성껏 수확합니다."
    rows = [
        candidate("c1", quote, span="span-a", source="source-a", revision=1),
        candidate("c2", quote, span="span-b", source="source-b", revision=3),
    ]
    req = request(rows)

    result = source_copy.compose(req, source_revisions=REVISIONS)

    assert len(result["passages"]) == 2
    assert {p["provenance"][0]["sourceId"] for p in result["passages"]} == {"source-a", "source-b"}


def test_AC_SRC_10_ambiguous_multi_module_assignment_is_reviewed_not_silently_moved():
    quote = "감귤을 정성껏 수확합니다."
    row = candidate("c1", quote)
    req = request(
        [row],
        [
            {
                "module": "summary",
                "texts": [{"id": "base-1", "value": quote, "candidateIds": ["c1"]}],
            },
            {
                "module": "productionProcess",
                "texts": [{"id": "base-2", "value": quote, "candidateIds": ["c1"]}],
            },
        ],
    )

    result = source_copy.compose(req, source_revisions=REVISIONS)

    assert result["passages"] == []
    assert len(result["reviewQueue"]) == 1
    assert "AMBIGUOUS_MODULE_ROUTING" in result["reviewQueue"][0]["reasonCodes"]
    assert result["reviewQueue"][0]["value"] == quote


@pytest.mark.parametrize(
    ("historical", "quote", "reason"),
    [
        (True, "지난해는 약 12브릭스였어요.", "HISTORICAL_CONTEXT"),
        (False, "연락처는 010-1234-5678이에요.", "PRIVATE_VALUE"),
        (False, "가격은 3만원이에요.", "MONEY_AMOUNT"),
    ],
)
def test_AC_SRC_10_history_and_privacy_or_money_are_retained_for_review_not_displayed(
    historical, quote, reason
):
    req = request([candidate("c1", "가공된 짧은 문장", quote, historical=historical)])

    result = source_copy.compose(req, source_revisions=REVISIONS)

    assert result["passages"] == []
    assert result["reviewQueue"][0]["value"] == quote
    assert reason in result["reviewQueue"][0]["reasonCodes"]
    assert result["occurrences"][0]["disposition"] == "REVIEW"


def test_AC_SRC_10_stale_request_and_source_revision_fail_closed():
    req = request([candidate("c1", "문장입니다.")])
    edited = deepcopy(req)
    edited["candidates"][0]["evidence"][0]["quote"] = "조작된 문장입니다."
    with pytest.raises(source_copy.SourceCopyError) as stale_request:
        source_copy.compose(edited, source_revisions=REVISIONS)
    assert stale_request.value.reason in {"INVALID_INPUT", "STALE_REQUEST"}

    with pytest.raises(source_copy.SourceCopyError) as stale_revision:
        source_copy.compose(req, source_revisions={"source-a": 2, "source-b": 3})
    assert stale_revision.value.reason == "STALE_REQUEST"


@pytest.mark.parametrize(
    ("quote", "review_reason"),
    [
        ("내일 발송할 예정이에요.", "CONTEXT_DEPENDENT"),
        ("농사를 5년 차로 이어가고 있어요.", "HISTORICAL_CONTEXT"),
        ("제주내일학교 앞 과수원에서 감귤을 길러요.", None),
        ("40년간 감귤을 길러 왔어요.", None),
        ("3대째 감귤 농사를 이어가요.", None),
    ],
)
def test_AC_SRC_10_temporal_review_uses_context_not_substrings(quote, review_reason):
    req = request([candidate("c1", quote)])

    result = source_copy.compose(req, source_revisions=REVISIONS)

    if review_reason:
        assert result["passages"] == []
        assert review_reason in result["reviewQueue"][0]["reasonCodes"]
        assert result["reviewQueue"][0]["value"] == quote
    else:
        assert result["passages"][0]["value"] == quote


def test_AC_SRC_10_input_is_not_mutated():
    req = request([candidate("c1", "저희 농장은 감귤을 길러요.")])
    before = deepcopy(req)

    source_copy.compose(req, source_revisions=REVISIONS)

    assert req == before
