"""Offline quality checks over exact source-copy quotes; no provider calls."""

import importlib.util
from copy import deepcopy
from pathlib import Path

import pytest

from app.source_analysis import voice_polish

ROOT = Path(__file__).resolve().parents[2]
QUALITY_SPEC = importlib.util.spec_from_file_location(
    "source_copy_quality",
    ROOT / "docs/evaluation/i5-text-scoring/source_copy_quality.py",
)
source_copy_quality = importlib.util.module_from_spec(QUALITY_SPEC)
QUALITY_SPEC.loader.exec_module(source_copy_quality)

TARGET = {"id": "target-a", "name": "가상 감귤"}
REVISIONS = {"source-a": 1}


def candidate(candidate_id, quote, *, span=None, field="summary", historical=False):
    return {
        "id": candidate_id,
        "targetId": TARGET["id"],
        "fieldKey": field,
        "value": quote,
        "historical": historical,
        "evidence": [
            {
                "sourceId": "source-a",
                "sourceRevision": 1,
                "page": 1,
                "spanIds": [span or f"span-{candidate_id}"],
                "quote": quote,
            }
        ],
    }


def request(rows, *, module=None):
    module = module or rows[0]["fieldKey"]
    baseline = [
        {
            "module": module,
            "texts": [
                {
                    "id": f"base-{index}",
                    "value": row["value"],
                    "candidateIds": [row["id"]],
                }
                for index, row in enumerate(rows, 1)
            ],
        }
    ]
    return voice_polish.prepare(TARGET, rows, baseline, [], REVISIONS)


def analyze(req):
    return source_copy_quality.analyze(req, source_revisions=REVISIONS)


def test_AC_SRC_10_exact_quote_and_voice_qualifiers_remain_intact_and_unapplied():
    quote = "저희 농장은\n약 12브릭스 정도로 나와요."
    req = request([candidate("c1", quote)])

    result = analyze(req)

    passage = result["passages"][0]
    assert passage["value"] == quote
    assert passage["sourceExact"] is True
    assert passage["semanticAssessment"] == "PENDING"
    assert passage["grammarAssessment"] == "NOT_RUN"
    assert result["grammarAssessment"] == "NOT_RUN"
    assert result["draftModules"][0]["texts"][0]["value"] == quote
    assert result["humanReviewStatus"] == "PENDING"
    assert result["requiresContentReview"] is True
    assert result["adopted"] is False


def test_AC_SRC_10_ocr_split_whitespace_proposal_is_exact_bound_and_never_applied():
    quote = "있습니\n다."
    req = request([candidate("c1", quote)])

    result = analyze(req)

    item = next(q for q in result["editorialQueue"] if "OCR_SPLIT" in q["reasonCodes"])
    finding = next(f for f in item["findings"] if f["code"] == "OCR_SPLIT")
    proposal = finding["proposal"]
    assert proposal["value"] == "있습니다."
    assert proposal["kind"] == "WHITESPACE_ONLY"
    assert proposal["applied"] is False
    assert proposal["beforeSha256"] and proposal["afterSha256"]
    assert result["passages"][0]["value"] == quote
    assert result["draftModules"][0]["texts"][0]["value"] == quote


def test_AC_SRC_10_fragments_and_option_headings_are_not_rewritten_for_missing_punctuation():
    quote = "A상품 3kg"
    req = request([candidate("c1", quote, field="specification")])

    result = analyze(req)

    assert result["passages"][0]["value"] == quote
    assert result["passages"][0]["draftStatus"] == "ELIGIBLE_EXACT"
    assert not any(
        f["code"] == "POSSIBLE_FRAGMENT"
        for queue in result["editorialQueue"]
        for f in queue["findings"]
    )
    assert result["grammarAssessment"] == "NOT_RUN"


def test_AC_SRC_10_possible_fragment_is_flagged_but_never_rewritten():
    quote = "감귤을 수확했지만"
    req = request([candidate("c1", quote)])

    result = analyze(req)

    assert any("POSSIBLE_FRAGMENT" in q["reasonCodes"] for q in result["editorialQueue"])
    assert result["passages"][0]["value"] == quote
    assert result["draftModules"][0]["texts"][0]["value"] == quote
    assert result["grammarAssessment"] == "NOT_RUN"


def test_AC_SRC_10_exact_repetition_is_flagged_without_silent_deletion():
    quote = "과실을 살펴 수확해요."
    req = request(
        [
            candidate("c1", quote, span="span-a"),
            candidate("c2", quote, span="span-b"),
        ]
    )

    result = analyze(req)

    flagged = [q for q in result["editorialQueue"] if "EXACT_REPETITION" in q["reasonCodes"]]
    assert flagged
    assert len(result["passages"]) == 2
    assert [text["value"] for text in result["draftModules"][0]["texts"]] == [quote, quote]
    assert all(q["reviewStatus"] == "PENDING" for q in flagged)


def test_AC_SRC_10_repeated_sentence_across_distinct_passages_flags_both_and_keeps_both():
    repeated = "저희 농장은 감귤을 정성껏 살펴요."
    quotes = [
        repeated + " 과실을 상자에 담아요.",
        repeated + " 아침마다 밭을 살펴요.",
    ]
    req = request(
        [candidate("c1", quotes[0], span="span-a"), candidate("c2", quotes[1], span="span-b")]
    )

    result = analyze(req)

    flagged = [q for q in result["editorialQueue"] if "EXACT_REPETITION" in q["reasonCodes"]]
    assert {q["passageId"] for q in flagged} == {p["id"] for p in result["passages"]}
    assert [text["value"] for text in result["draftModules"][0]["texts"]] == quotes


@pytest.mark.parametrize(
    ("quote", "reason"),
    [
        ("내년 이맘쯤 수확할 예정이에요.", "RELATIVE_TIME"),
        ("설 선물세트로 딱! 준비했어요.", "SEASON_OR_AVAILABILITY"),
        ("그날 그날 수확해서 보내드립니다.", "DISPATCH_OR_DELIVERY"),
        ("2025년 10월에 수확했어요.", "DATED_OR_HISTORICAL"),
        ("지난해 첫 수확을 시작했어요.", "DATED_OR_HISTORICAL"),
        ("제주내일학교 앞에서 감귤을 길러요.", None),
        ("내년이맘쯤에 다시 만나요.", "RELATIVE_TIME"),
    ],
)
def test_AC_SRC_10_owner_review_uses_contextual_patterns(quote, reason):
    req = request([candidate("c1", quote, historical=reason == "DATED_OR_HISTORICAL")])

    result = analyze(req)

    if reason:
        owner_item = next(q for q in result["ownerQueue"] if reason in q["reasonCodes"])
        assert owner_item["reviewStatus"] == "PENDING"
        assert owner_item["binding"]["quoteSha256"]
        assert quote in [p["value"] for p in result["passages"]]
    else:
        assert result["passages"][0]["value"] == quote
        assert not any("RELATIVE_TIME" in q["reasonCodes"] for q in result["ownerQueue"])


@pytest.mark.parametrize(
    ("quote", "reason"),
    [
        ("가격은 3만원이에요.", "PRICE_OR_FEE"),
        ("계좌로 입금해 주세요.", "PAYMENT_OR_RETURN_TERMS"),
        ("제철에만 판매하며 재고가 있어요.", "SEASON_OR_AVAILABILITY"),
        ("수확 후 당일 발송해요.", "DISPATCH_OR_DELIVERY"),
    ],
)
def test_AC_SRC_10_owner_review_categories_are_separate_and_pending(quote, reason):
    req = request([candidate("c1", quote)])

    result = analyze(req)

    assert any(reason in q["reasonCodes"] for q in result["ownerQueue"])
    assert all(q["reviewStatus"] == "PENDING" for q in result["ownerQueue"])
    assert result["humanReviewStatus"] == "PENDING"


def test_AC_SRC_10_price_owner_confirmation_cannot_override_safety_or_enter_body():
    quote = "가격은 3만원이에요."
    req = request([candidate("c1", quote)])

    result = analyze(req)

    assert any("PRICE_OR_FEE" in q["reasonCodes"] for q in result["ownerQueue"])
    assert any("MONEY_AMOUNT" in q["reasonCodes"] for q in result["safetyQueue"])
    assert result["draftModules"] == []
    assert result["passages"][0]["draftStatus"] == "REVIEW_REQUIRED"
    assert {"OWNER_CONFIRMATION", "SAFETY"}.issubset(result["passages"][0]["queueKinds"])


def test_AC_SRC_10_stale_or_tampered_request_fails_and_analysis_does_not_mutate_input():
    req = request([candidate("c1", "감귤을 정성껏 수확해요.")])
    before = deepcopy(req)

    result = analyze(req)

    assert result["requestSha256"] == req["requestSha256"]
    assert req == before
    changed = deepcopy(req)
    changed["candidates"][0]["evidence"][0]["quote"] = "변경된 원문이에요."
    with pytest.raises(source_copy_quality.QualityError) as stale_request:
        analyze(changed)
    assert stale_request.value.reason in {"INVALID_INPUT", "STALE_REQUEST"}
    with pytest.raises(source_copy_quality.QualityError) as stale_revision:
        source_copy_quality.analyze(req, source_revisions={"source-a": 2})
    assert stale_revision.value.reason == "STALE_REQUEST"


def test_AC_SRC_10_heuristic_flags_do_not_claim_grammar_or_semantic_pass():
    req = request([candidate("c1", "있습니\n다.")])

    result = analyze(req)

    assert result["editorialQueue"]
    assert result["grammarAssessment"] == "NOT_RUN"
    assert result["passages"][0]["semanticAssessment"] == "PENDING"
    assert result["humanReviewStatus"] == "PENDING"
    assert result["adopted"] is False
    assert all(
        finding["confidence"] in {"HEURISTIC", "EXACT"}
        for queue in (
            result["editorialQueue"]
            + result["ownerQueue"]
            + result["placementQueue"]
            + result["safetyQueue"]
        )
        for finding in queue["findings"]
    )
