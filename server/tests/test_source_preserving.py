"""Deterministic contracts for source-first copy planning."""

import pytest

from app.source_analysis.source_preserving import SourcePlanError, build_plan

TARGET = {"id": "target-1", "name": "제주 감귤"}
VERSIONS = {"source-1": {"revision": 3, "sanitizationVersion": 2}}


def candidate(
    cid, quote, *, value="model paraphrase", field="summary", target_id="target-1", **extra
):
    span_id = extra.pop("span_id", f"span-{cid}")
    return {
        "id": cid,
        "targetId": target_id,
        "fieldKey": field,
        "value": value,
        "historical": extra.pop("historical", False),
        "evidence": [
            {
                "sourceId": "source-1",
                "sourceRevision": 3,
                "page": 1,
                "spanIds": [span_id],
                "quote": quote,
            }
        ],
        **extra,
    }


def plan(candidates, *, versions=VERSIONS, decisions=(), target=TARGET, target_count=1):
    return build_plan(
        target,
        candidates,
        source_versions=versions,
        target_count=target_count,
        decisions=decisions,
    )


def test_AC_SRC_2_plan_uses_exact_evidence_and_accounts_for_everything():
    original = "제주에서 재배한 감귤입니다."
    candidates = [
        candidate("c1", original),
        candidate("c2", "다른 농가의 문구", target_id="target-2"),
    ]
    result = plan(candidates)
    passage = result["passages"][0]
    assert passage["value"] == original
    assert passage["originalValue"] == original
    assert passage["sourceExact"] is True
    assert passage["evidence"][0]["quote"] == original
    assert passage["candidateIds"] == ["c1"]
    assert any(
        row["candidateId"] == "c2" and row["disposition"] == "EXCLUDED"
        for row in result["accounting"]
    )
    assert len(result["accounting"]) == result["summary"]["inputEvidence"]
    assert result["summary"]["inputCandidates"] == len(candidates)
    assert result["semanticAccuracyEstablished"] is False
    assert result["grammarAssessment"] == "NOT_RUN"


def test_AC_SRC_3_exact_quote_dedup_keeps_candidate_attribution_and_module_ambiguity():
    quote = "감귤은 서늘한 곳에 보관해 주세요."
    result = plan([candidate("a", quote, span_id="same"), candidate("b", quote, span_id="same")])
    assert len(result["passages"]) == 1
    passage = result["passages"][0]
    assert set(passage["candidateIds"]) == {"a", "b"}
    assert passage["module"] == "summary"
    assert len([row for row in result["accounting"] if row["passageId"] == passage["id"]]) == 2

    routed = plan(
        [
            candidate("a", quote, span_id="same"),
            candidate("b", quote, field="storage", span_id="same"),
        ]
    )
    assert len(routed["passages"]) == 1
    assert routed["passages"][0]["module"] is None
    assert "AMBIGUOUS_MODULE_ROUTING" in routed["passages"][0]["reasonCodes"]["PLACEMENT"]
    assert routed["passages"][0]["status"] == "PENDING"


@pytest.mark.parametrize(
    ("quote", "reason"),
    [
        ("가격은 5,000원입니다.", "PRICE_OR_FEE"),
        ("올해 수확한 감귤입니다.", "RELATIVE_TIME"),
        ("작년부터 재배했습니다.", "DATED_OR_HISTORICAL"),
        ("11월부터 판매합니다.", "SEASON_OR_AVAILABILITY"),
        ("월요일에 발송합니다.", "DISPATCH_OR_DELIVERY"),
        ("환불은 어렵습니다.", "PAYMENT_OR_RETURN_TERMS"),
    ],
)
def test_AC_SRC_10_volatile_or_conditional_claims_are_held_for_owner(quote, reason):
    passage = plan([candidate("c1", quote)])["passages"][0]
    expected = "BLOCKED" if reason in {"PRICE_OR_FEE", "PAYMENT_OR_RETURN_TERMS"} else "PENDING"
    assert passage["status"] == expected
    assert reason in passage["reasonCodes"]["OWNER_CONFIRMATION"]
    assert "OWNER_CONFIRMATION" in passage["queueKinds"]


def test_AC_SRC_7_safety_hold_cannot_be_overridden_by_owner_decision():
    result = plan([candidate("c1", "감기를 치료하는 감귤입니다.")])
    passage = result["passages"][0]
    assert passage["status"] == "BLOCKED"
    assert passage["reasonCodes"]["SAFETY"]
    with pytest.raises(SourcePlanError):
        plan(
            [candidate("c1", "감기를 치료하는 감귤입니다.")],
            decisions=[{"bindingHash": passage["bindingHash"], "action": "KEEP"}],
        )


def test_AC_SRC_2_options_and_numeric_ranges_stay_as_source_worded():
    quote = "당도는 12~14브릭스이며 크기는 소과 또는 중과입니다."
    passage = plan([candidate("c1", quote)])["passages"][0]
    assert passage["value"] == quote
    assert passage["originalValue"] == quote
    assert passage["status"] == "READY"


def test_AC_SRC_7_health_claim_in_candidate_value_blocks_benign_quote():
    passage = plan([candidate("c1", "감귤을 재배합니다.", value="면역력을 높이는 감귤")])[
        "passages"
    ][0]
    assert passage["status"] == "BLOCKED"
    assert "HEALTH_CLAIM" in passage["reasonCodes"]["SAFETY"]


def test_AC_SRC_3_common_taste_claim_requires_explicit_placement_edit():
    item = candidate("c1", "산미가 적고 달콤합니다.", target_id=None)
    passage = plan([item], target_count=2)["passages"][0]
    assert passage["status"] == "PENDING"
    assert "COMMON_SCOPE_UNCONFIRMED" in passage["reasonCodes"]["PLACEMENT"]
    with pytest.raises(SourcePlanError):
        plan(
            [item],
            target_count=2,
            decisions=[{"bindingHash": passage["bindingHash"], "action": "KEEP"}],
        )
    edited = plan(
        [item],
        target_count=2,
        decisions=[
            {
                "bindingHash": passage["bindingHash"],
                "action": "EDIT",
                "value": "이 농가의 감귤은 산미가 적고 달콤합니다.",
                "note": "농가가 대상 상품의 맛으로 확인",
            }
        ],
    )["passages"][0]
    assert edited["status"] == "READY"
    assert edited["sourceExact"] is False


def test_AC_SRC_3_allowed_common_farm_story_cannot_be_replaced_with_taste_by_keep():
    item = candidate(
        "c1",
        "농가가 감귤을 재배해 온 이야기를 전합니다.",
        field="historicalSales",
        target_id=None,
        historical=True,
    )
    passage = plan([item], target_count=1)["passages"][0]
    assert passage["module"] == "farmStory"
    assert "COMMON_SCOPE_UNCONFIRMED" not in passage["reasonCodes"]["PLACEMENT"]
    with pytest.raises(SourcePlanError):
        plan(
            [item],
            target_count=1,
            decisions=[
                {
                    "bindingHash": passage["bindingHash"],
                    "action": "KEEP",
                    "note": "농가가 확인",
                    "module": "taste",
                }
            ],
        )


def test_AC_SRC_3_other_target_evidence_remains_accounted():
    item = candidate(
        "c1",
        "문구 1",
        target_id="target-2",
        evidence=[
            {
                "sourceId": "source-1",
                "sourceRevision": 3,
                "page": 1,
                "spanIds": ["span-1"],
                "quote": "다른 대상의 첫 문구",
            },
            {
                "sourceId": "source-1",
                "sourceRevision": 3,
                "page": 1,
                "spanIds": ["span-2"],
                "quote": "다른 대상의 두 번째 문구",
            },
        ],
    )
    result = plan([item], target_count=2)
    assert result["passages"] == []
    assert len(result["accounting"]) == 2
    assert all(row["disposition"] == "EXCLUDED" for row in result["accounting"])
    assert result["summary"]["inputEvidence"] == 2


def test_AC_SRC_3_overflow_passage_does_not_consume_room_for_later_fitting_text():
    long_one = "가" * 2000
    long_two = "나" * 1500
    short = "다" * 100
    result = plan(
        [
            candidate("c1", long_one),
            candidate("c2", long_two),
            candidate("c3", short),
        ]
    )
    by_candidate = {p["candidateIds"][0]: p for p in result["passages"]}
    assert by_candidate["c1"]["status"] == "READY"
    assert by_candidate["c2"]["status"] == "PENDING"
    assert "FIELD_LIMIT" in by_candidate["c2"]["reasonCodes"]["PLACEMENT"]
    assert by_candidate["c3"]["status"] == "READY"
    summary = next(m for m in result["modules"] if m["module"] == "summary")
    assert [t["candidateIds"] for t in summary["texts"]] == [["c1"], ["c3"]]


def test_AC_SRC_10_ocr_whitespace_repair_is_proposed_and_only_applied_by_decision():
    quote = "당도는 좋습니\n다."
    original = plan([candidate("c1", quote)])["passages"][0]
    assert original["repairValue"] == "당도는 좋습니다."
    assert original["value"] == quote
    assert original["status"] == "PENDING"
    result = plan(
        [candidate("c1", quote)],
        decisions=[{"bindingHash": original["bindingHash"], "action": "ACCEPT_REPAIR"}],
    )
    repaired = result["passages"][0]
    assert repaired["value"] == "당도는 좋습니다."
    assert repaired["originalValue"] == quote
    assert repaired["sourceExact"] is False
    assert repaired["status"] == "READY"


def test_AC_SRC_10_unrelated_candidate_keeps_existing_source_binding():
    original = candidate("c1", "제주 감귤입니다.")
    first = plan([original])
    added = plan([original, candidate("c2", "보관은 서늘한 곳에서 해 주세요.", field="storage")])
    assert first["planHash"] != added["planHash"]
    assert first["passages"][0]["bindingHash"] == added["passages"][0]["bindingHash"]


def test_AC_SRC_10_source_version_change_invalidates_plan_binding_and_old_decision():
    item = candidate("c1", "제주 감귤입니다.")
    old = plan([item])
    new_versions = {"source-1": {"revision": 4, "sanitizationVersion": 2}}
    changed = {**item, "evidence": [{**item["evidence"][0], "sourceRevision": 4}]}
    current = plan([changed], versions=new_versions)
    assert old["planHash"] != current["planHash"]
    assert old["passages"][0]["bindingHash"] != current["passages"][0]["bindingHash"]
    with pytest.raises(SourcePlanError):
        plan(
            [changed],
            versions=new_versions,
            decisions=[{"bindingHash": old["passages"][0]["bindingHash"], "action": "OMIT"}],
        )


def test_AC_SRC_10_keep_requires_owner_note_and_relative_claim_requires_edit():
    item = candidate("c1", "월요일에 감귤을 발송합니다.")
    held = plan([item])["passages"][0]
    with pytest.raises(SourcePlanError):
        plan([item], decisions=[{"bindingHash": held["bindingHash"], "action": "KEEP"}])
    kept = plan(
        [item],
        decisions=[{"bindingHash": held["bindingHash"], "action": "KEEP", "note": "농가 확인"}],
    )
    assert kept["passages"][0]["status"] == "READY"
    assert kept["passages"][0]["value"] == item["evidence"][0]["quote"]

    relative = candidate("c3", "올해 감귤을 수확했습니다.")
    relative_passage = plan([relative])["passages"][0]
    with pytest.raises(SourcePlanError):
        plan(
            [relative],
            decisions=[
                {
                    "bindingHash": relative_passage["bindingHash"],
                    "action": "KEEP",
                    "note": "농가 확인",
                }
            ],
        )
    absolute = "2026년 감귤을 수확했습니다."
    edited_relative = plan(
        [relative],
        decisions=[
            {
                "bindingHash": relative_passage["bindingHash"],
                "action": "EDIT",
                "value": absolute,
                "note": "농가가 기준 연도를 확인",
            }
        ],
    )["passages"][0]
    assert edited_relative["value"] == absolute
    assert edited_relative["status"] == "READY"

    fragment = candidate("c2", "당도가 좋습니다,", field="summary")
    waiting = plan([fragment])["passages"][0]
    edited = "당도가 좋습니다."
    result = plan(
        [fragment],
        decisions=[
            {
                "bindingHash": waiting["bindingHash"],
                "action": "EDIT",
                "value": edited,
                "note": "농가가 절대형 문구로 확인",
            }
        ],
    )["passages"][0]
    assert result["value"] == edited
    assert result["sourceExact"] is False
    assert result["status"] == "READY"
