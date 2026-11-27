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
    assert routed["passages"][0]["module"] == "summary"
    assert routed["passages"][0]["includedInDraft"] is True
    assert routed["passages"][0]["reviewPending"] is True
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
def test_AC_SRC_10_volatile_claims_are_in_private_draft_and_flagged_for_owner(quote, reason):
    passage = plan([candidate("c1", quote)])["passages"][0]
    assert passage["status"] == "PENDING"
    assert passage["includedInDraft"] is True
    assert passage["reviewPending"] is True
    assert passage["reviewExplanations"]
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
    assert passage["includedInDraft"] is True
    assert passage["reviewPending"] is True
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
    assert edited["includedInDraft"] is True
    assert edited["reviewPending"] is False
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


def test_AC_SRC_10_keep_requires_owner_note_and_relative_claim_can_be_acknowledged():
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
    acknowledged = plan(
        [relative],
        decisions=[
            {
                "bindingHash": relative_passage["bindingHash"],
                "action": "KEEP",
                "note": "농가가 현재 기준 시점을 확인",
            }
        ],
    )["passages"][0]
    assert acknowledged["includedInDraft"] is True
    assert acknowledged["reviewPending"] is False
    assert acknowledged["value"] == relative["evidence"][0]["quote"]
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


@pytest.mark.parametrize(
    "quote",
    [
        "당도가 좋지만",
        "당도는 좋습니\n다.",
        "올해 수확한 감귤입니다.",
        "가격은 5,000원입니다.",
        "감기를 치료하는 감귤입니다.",
        "세계 최고의 감귤입니다.",
    ],
)
def test_AC_SRC_2_7_10_full_flagged_text_is_in_private_modules(quote):
    result = plan([candidate("c1", quote)])
    passage = result["passages"][0]
    assert passage["includedInDraft"] is True
    assert passage["reviewPending"] is True
    expected = "당도는 좋습니다." if quote == "당도는 좋습니\n다." else quote
    assert result["modules"][0]["texts"][0]["value"] == expected
    assert passage["value"] == passage["originalValue"] == quote
    assert result["summary"]["includedInDraft"] == 1
    assert result["summary"]["reviewPending"] == 1


def test_AC_SRC_10_marketing_warning_can_be_acknowledged_with_explanation():
    item = candidate("c1", "세계 최고의 감귤입니다.")
    passage = plan([item])["passages"][0]
    with pytest.raises(SourcePlanError):
        plan([item], decisions=[{"bindingHash": passage["bindingHash"], "action": "KEEP"}])
    reviewed = plan(
        [item],
        decisions=[
            {
                "bindingHash": passage["bindingHash"],
                "action": "KEEP",
                "note": "농가가 홍보 표현 확인",
            }
        ],
    )["passages"][0]
    assert reviewed["includedInDraft"] is True
    assert reviewed["reviewPending"] is False
    assert reviewed["reasonCodes"]["SAFETY"] == ["EXAGGERATION"]


def test_AC_SRC_3_overflow_is_preserved_in_full_for_review_without_silent_truncation():
    result = plan([candidate("a", "가" * 2000), candidate("b", "나" * 1500)])
    passage = result["passages"][1]
    assert passage["value"] == "나" * 1500
    assert passage["includedInDraft"] is False
    assert passage["reviewPending"] is True
    assert "FIELD_LIMIT" in passage["reasonCodes"]["PLACEMENT"]
    assert passage["reviewExplanations"]


def test_AC_SRC_7_private_value_is_not_reintroduced_into_private_draft():
    result = plan([candidate("a", "연락처 010-1234-5678")])
    passage = result["passages"][0]
    assert "PRIVATE_VALUE" in passage["reasonCodes"]["SAFETY"]
    assert passage["includedInDraft"] is False
    assert result["modules"] == []


@pytest.mark.parametrize(
    "quote", ["가격은 5,000원입니다.", "환불은 어렵습니다.", "고객센터로 문의해 주세요."]
)
def test_AC_SRC_10_price_and_policy_can_be_acknowledged_without_changing_settings(quote):
    item = candidate("c1", quote)
    passage = plan([item])["passages"][0]
    with pytest.raises(SourcePlanError, match="redacted"):
        plan([item], decisions=[{"bindingHash": passage["bindingHash"], "action": "KEEP"}])
    result = plan(
        [item],
        decisions=[
            {
                "bindingHash": passage["bindingHash"],
                "action": "KEEP",
                "note": "현재 판매 설정과 내용 일치 확인",
            }
        ],
    )
    assert result["passages"][0]["reviewPending"] is False
    assert result["modules"][0]["texts"][0]["value"] == quote
    assert set(result) >= {"modules", "passages"}
    assert not {"price", "shippingFee", "saleSettings"}.intersection(result)


@pytest.mark.parametrize(
    "quote",
    [
        "최고의 감귤입니다.",
        "최상의 맛을 전합니다.",
        "으뜸인 감귤입니다.",
        "맛좋은 감귤을 드세요.",
        "맛있는 감귤을 만나보세요.",
        "최고급 감귤입니다.",
    ],
)
def test_AC_SRC_10_ordinary_promotional_copy_needs_no_promotion_review(quote):
    passage = plan([candidate("c1", quote)])["passages"][0]
    assert passage["reasonCodes"]["SAFETY"] == []
    assert passage["status"] == "READY"
    assert passage["includedInDraft"] is True


@pytest.mark.parametrize(
    "quote",
    [
        "세계 최고의 감귤입니다.",
        "전 세계 1위 감귤입니다.",
        "맛을 100% 보장합니다.",
        "무조건 만족을 보장합니다.",
    ],
)
def test_AC_SRC_10_extreme_promotional_claims_still_require_review(quote):
    passage = plan([candidate("c1", quote)])["passages"][0]
    assert "EXAGGERATION" in passage["reasonCodes"]["SAFETY"]
    assert passage["reviewPending"] is True


def continuation_candidate(first="표면을 살펴보듯이", second="포장을 열어 확인해 주세요."):
    item = candidate("joined", first, span_id="vision-gemini-1")
    item["evidence"][0]["page"] = 6
    item["evidence"].append(
        {
            **item["evidence"][0],
            "spanIds": ["vision-gemini-2"],
            "quote": second,
        }
    )
    return item


def test_AC_SRC_10_source_adjacent_continuation_assembles_without_rewriting_evidence():
    item = continuation_candidate()
    result = plan([item])
    left, right = result["passages"]
    row = result["modules"][0]["texts"][0]
    assert len(result["modules"][0]["texts"]) == 1
    assert row["value"] == "표면을 살펴보듯이 포장을 열어 확인해 주세요."
    assert row["passageIds"] == [left["id"], right["id"]]
    assert row["candidateIds"] == ["joined"]
    assert row["assembly"]["type"] == "SOURCE_ADJACENT_CONTINUATION"
    for index, passage in enumerate(result["passages"]):
        assert passage["value"] == item["evidence"][index]["quote"]
        assert passage["originalValue"] == passage["value"]
        assert passage["sourceExact"] is True
        assert passage["evidence"] == [item["evidence"][index]]
        assert passage["autoRepair"]["passageIds"] == row["passageIds"]
        assert passage["status"] == "READY"
        assert passage["includedInDraft"] is True
        assert passage["bindingHash"]
    assert left["autoRepair"]["clearedReasonCodes"] == ["POSSIBLE_FRAGMENT"]
    assert right["autoRepair"]["clearedReasonCodes"] == []
    assert result["summary"]["inputEvidence"] == result["summary"]["passages"] == 2
    assert result["summary"]["includedInDraft"] == 2
    assert {r["passageId"] for r in result["accounting"]} == set(row["passageIds"])


@pytest.mark.parametrize(
    "change",
    [
        "page",
        "source",
        "reverse",
        "gap",
        "prefix",
        "overlap",
        "decision",
        "full_sentence",
        "heading",
        "option",
        "numeric_option",
        "topic",
        "missing",
        "comma",
    ],
)
def test_AC_SRC_10_ambiguous_boundaries_never_auto_join(change):
    item = continuation_candidate()
    items, versions, decisions = [item], dict(VERSIONS), []
    if change == "page":
        item["evidence"][1]["page"] = 7
    elif change == "source":
        item["evidence"][1]["sourceId"] = "source-2"
        versions["source-2"] = VERSIONS["source-1"]
    elif change == "reverse":
        item["evidence"].reverse()
    elif change == "gap":
        item["evidence"][1]["spanIds"] = ["vision-gemini-3"]
    elif change == "prefix":
        item["evidence"][1]["spanIds"] = ["other-2"]
    elif change == "overlap":
        other = candidate("ambiguous", "다른 인용문입니다.")
        other["evidence"] = [{**item["evidence"][1], "quote": "다른 인용문입니다."}]
        items.append(other)
    elif change == "decision":
        original = plan(items)
        decisions = [{"bindingHash": original["passages"][1]["bindingHash"], "action": "KEEP"}]
    elif change == "full_sentence":
        item["evidence"][0]["quote"] = "과육을 드세요."
    elif change == "heading":
        item["evidence"][1]["quote"] = "먹는 방법"
    elif change == "option":
        item["evidence"][1]["quote"] = "옵션 2: 중과를 선택해 주세요."
    elif change == "numeric_option":
        item["evidence"][1]["quote"] = "2kg 가정용 감귤입니다."
    elif change == "topic":
        item["evidence"][1]["quote"] = "보관은 서늘한 곳에 해 주세요."
    elif change == "missing":
        item["evidence"].pop()
    elif change == "comma":
        item["evidence"][0]["quote"] = "과육을 드세요,"
    result = plan(items, versions=versions, decisions=decisions)
    assert all("assembly" not in row for module in result["modules"] for row in module["texts"])
    assert all("autoRepair" not in passage for passage in result["passages"])
    if change != "full_sentence":
        fragment = next(
            p for p in result["passages"] if "POSSIBLE_FRAGMENT" in p["reasonCodes"]["COPY_EDIT"]
        )
        assert fragment["reviewPending"] is True
        assert any("없는 뒷문장" in text for text in fragment["reviewExplanations"])


def test_AC_SRC_10_join_clears_only_fragment_and_preserves_other_reviews():
    item = continuation_candidate(first="올해 표면을 살펴보듯이")
    result = plan([item])
    left = result["passages"][0]
    assert "autoRepair" in left
    assert "POSSIBLE_FRAGMENT" not in left["reasonCodes"]["COPY_EDIT"]
    assert "RELATIVE_TIME" in left["reasonCodes"]["OWNER_CONFIRMATION"]
    assert left["reviewPending"] is True


def test_AC_SRC_10_overflow_does_not_claim_a_fragment_was_repaired():
    item = continuation_candidate(first="가" * 2990 + " 배출하듯이")
    result = plan([item])
    assert result["modules"] == []
    left = result["passages"][0]
    assert "POSSIBLE_FRAGMENT" in left["reasonCodes"]["COPY_EDIT"]
    assert "autoRepair" not in left
    assert left["includedInDraft"] is False


def test_AC_SRC_10_cross_candidate_module_continuation_preserves_original_provenance():
    left = candidate(
        "appearance",
        "쉽게 상자를 열 수 있습니다.\n겉면이 고르지 않지만",
        field="appearanceFaq",
    )
    left["evidence"][0].update(page=10, spanIds=["vision-gemini-2", "vision-gemini-3"])
    right = candidate("taste", "6~7월에만 만날 수 있는\n산뜻한 과일입니다!", field="taste")
    right["evidence"][0].update(page=10, spanIds=["vision-gemini-4", "vision-gemini-5"])
    # Candidate order is taxonomy order; numeric source span order is separate.
    result = plan([right, left])
    assert len(result["modules"]) == 1
    module = result["modules"][0]
    assert module["module"] == "summary"
    assert len(module["texts"]) == 1
    row = module["texts"][0]
    assert row["value"] == (
        "쉽게 상자를 열 수 있습니다. 겉면이 고르지 않지만 6~7월에만 만날 수 있는 산뜻한 과일입니다!"
    )
    assert row["candidateIds"] == ["appearance", "taste"]
    by_cid = {p["candidateIds"][0]: p for p in result["passages"]}
    assert by_cid["taste"]["module"] == "taste"
    assert by_cid["appearance"]["module"] == "appearanceFaq"
    assert row["passageIds"] == [by_cid["appearance"]["id"], by_cid["taste"]["id"]]
    assert all(p["autoRepair"]["module"] == "summary" for p in result["passages"])
    assert by_cid["appearance"]["status"] == "PENDING"
    assert all("CONTINUATION_CONTEXT" in p["reasonCodes"]["COPY_EDIT"] for p in result["passages"])
    assert row["assembly"]["contextReviewRequired"] is True
    assert "SEASON_OR_AVAILABILITY" in by_cid["taste"]["reasonCodes"]["OWNER_CONFIRMATION"]
    assert by_cid["taste"]["reviewPending"] is True
    assert result["summary"]["inputEvidence"] == result["summary"]["includedInDraft"] == 2


def test_AC_SRC_10_cross_module_continuation_is_not_relocated_after_explicit_decision():
    item = continuation_candidate()
    left = {**item, "fieldKey": "appearanceFaq", "evidence": item["evidence"][:1]}
    right = {**item, "id": "right", "fieldKey": "taste", "evidence": item["evidence"][1:]}
    original = plan([left, right])
    decided = plan(
        [left, right],
        decisions=[
            {
                "bindingHash": original["passages"][1]["bindingHash"],
                "action": "EDIT",
                "value": "생산자가 직접 쓴 맛 설명입니다.",
                "note": "직접 편집",
            }
        ],
    )
    assert len(decided["modules"]) == 2
    assert all("assembly" not in row for m in decided["modules"] for row in m["texts"])
    assert decided["passages"][0]["reviewPending"] is True


def test_AC_SRC_10_reversed_recorded_span_ids_do_not_establish_continuation_order():
    item = continuation_candidate()
    item["evidence"][0]["spanIds"] = ["vision-gemini-2", "vision-gemini-1"]
    item["evidence"][1]["spanIds"] = ["vision-gemini-3"]
    result = plan([item])
    assert len(result["modules"][0]["texts"]) == 2
    assert "POSSIBLE_FRAGMENT" in result["passages"][0]["reasonCodes"]["COPY_EDIT"]
    assert "autoRepair" not in result["passages"][0]


def test_AC_SRC_10_unrelated_cross_field_adjacent_copy_requires_context_review():
    left = candidate("appearance", "껍질이 얇지만", field="appearanceFaq", span_id="vision-1")
    right = candidate("farm", "농장 이름은 푸른들입니다.", field="farmStory", span_id="vision-2")
    result = plan([left, right])
    row = result["modules"][0]["texts"][0]
    assert row["value"] == "껍질이 얇지만 농장 이름은 푸른들입니다."
    assert row["assembly"]["contextReviewRequired"] is True
    for passage in result["passages"]:
        assert "CONTINUATION_CONTEXT" in passage["reasonCodes"]["COPY_EDIT"]
        assert passage["reviewPending"] is True
        assert passage["status"] == "PENDING"
        assert any("서로 다른 추출 항목" in reason for reason in passage["reviewExplanations"])
        assert all("없는 뒷문장" not in reason for reason in passage["reviewExplanations"])


def test_AC_SRC_10_same_candidate_assembly_has_no_cross_context_warning():
    result = plan([continuation_candidate()])
    assert result["modules"][0]["texts"][0]["assembly"]["contextReviewRequired"] is False
    assert all(p["reviewPending"] is False for p in result["passages"])


def test_AC_SRC_2_option_blocks_group_properties_once_and_keep_global_notes():
    header = "01 실속형 감귤 4kg"
    values = [
        ("head", header, "composition", ["option-1"]),
        ("size", header + "\n사이즈 : 중소과", "specification", ["option-1", "option-2"]),
        ("count", header + "\n수량 : 9~20과", "pieceCount", ["option-1", "option-3"]),
        ("pack", header + "\n포장 : 벌크포장", "delivery", ["option-1", "option-4"]),
        ("note", "과실 크기는 참고용입니다.", "specification", ["option-5"]),
    ]
    candidates = []
    for cid, quote, field, spans in values:
        row = candidate(cid, quote, field=field)
        row["evidence"][0]["spanIds"] = spans
        candidates.append(row)
    result = plan(candidates)
    modules = {m["module"]: m["texts"] for m in result["modules"]}
    assert modules["composition"][0]["value"] == (
        header + "\n사이즈 : 중소과\n수량 : 9~20과\n포장 : 벌크포장"
    )
    assert len(modules["composition"]) == 1
    assert modules["specification"][0]["value"] == "과실 크기는 참고용입니다."
    assert "pieceCount" not in modules and "delivery" not in modules
    assert len(modules["composition"][0]["passageIds"]) == 4
    assert sum(t["value"].count(header) for m in result["modules"] for t in m["texts"]) == 1
    assert result["summary"]["includedInDraft"] == 5
    assert len(result["accounting"]) == 5
    assert all(p["value"] == p["originalValue"] for p in result["passages"])


def test_AC_SRC_5_option_blocks_preserve_member_owner_confirmation():
    header = "옵션 A 4kg"
    rows = [candidate("head", header, field="composition", span_id="option-1")]
    row = candidate("term", header + "\n2027년 12월 수확", field="specification")
    row["evidence"][0]["spanIds"] = ["option-1", "option-2"]
    rows.append(row)
    result = plan(rows)
    assert len(result["modules"]) == 1
    assert result["modules"][0]["module"] == "composition"
    assert result["summary"]["reviewPending"] == 1
    conditional = next(p for p in result["passages"] if p["candidateIds"] == ["term"])
    assert conditional["includedInDraft"] and conditional["reviewPending"]
    assert "DATED_OR_HISTORICAL" in conditional["reasonCodes"]["OWNER_CONFIRMATION"]


def test_AC_SRC_11_option_group_never_overrides_explicit_owner_placement():
    head = candidate("head", "옵션 A 4kg", field="composition", span_id="option-1")
    body = candidate("body", "옵션 A 4kg\n포장 : 상자", field="composition")
    body["evidence"][0]["spanIds"] = ["option-1", "option-2"]
    initial = plan([head, body])
    passage = next(p for p in initial["passages"] if p["candidateIds"] == ["body"])
    decided = plan(
        [head, body],
        decisions=[
            {
                "bindingHash": passage["bindingHash"],
                "action": "KEEP",
                "module": "delivery",
                "note": "Owner selected a separate shipping section.",
            }
        ],
    )
    modules = {m["module"]: m["texts"] for m in decided["modules"]}
    assert modules["delivery"][0]["value"] == body["evidence"][0]["quote"]
    assert modules["composition"][0]["value"] == head["evidence"][0]["quote"]
    assert not any(
        t.get("assembly", {}).get("type") == "SOURCE_OPTION_BLOCK"
        for m in decided["modules"]
        for t in m["texts"]
    )


def test_AC_SRC_2_source_layout_wraps_reflow_without_changing_evidence():
    original = "겉면이 고르지 않지만 6~7월에만 만날 수 있는\n산뜻한 과일입니다!"
    result = plan([candidate("one", original, field="appearanceFaq")])
    text = result["modules"][0]["texts"][0]
    assert text["value"] == original.replace("\n", " ")
    assert text["layout"]["operation"] == "PROSE_REFLOW"
    passage = result["passages"][0]
    assert (
        passage["value"] == passage["originalValue"] == passage["evidence"][0]["quote"] == original
    )
    assert passage["reviewPending"]


def test_AC_SRC_11_layout_version_change_keeps_source_review_bindings(monkeypatch):
    from app.source_analysis import source_preserving as engine

    rows = [candidate("one", "올해\n판매합니다.")]
    before = plan(rows)
    decision = {
        "bindingHash": before["passages"][0]["bindingHash"],
        "action": "KEEP",
        "note": "Owner checked the current year.",
    }
    monkeypatch.setattr(engine, "LAYOUT_VERSION", "next-layout")
    after = plan(rows, decisions=[decision])
    assert before["planHash"] != after["planHash"]
    assert before["passages"][0]["bindingHash"] == after["passages"][0]["bindingHash"]
    assert not after["passages"][0]["reviewPending"]


def test_AC_SRC_11_owner_edited_line_layout_remains_authoritative():
    rows = [candidate("one", "처음 문장입니다.")]
    original = plan(rows)["passages"][0]
    value = "직접 작성한 첫 줄입니다.\n직접 작성한 둘째 줄입니다."
    result = plan(
        rows,
        decisions=[
            {
                "bindingHash": original["bindingHash"],
                "action": "EDIT",
                "value": value,
                "note": "Owner chose this layout.",
            }
        ],
    )
    assert result["modules"][0]["texts"][0]["value"] == value
    assert "layout" not in result["modules"][0]["texts"][0]


def paragraph_candidate(lines, *, field="farmStory", prefix="s", start=1):
    item = candidate(
        "paragraph", lines[0], value=" ".join(lines), field=field, span_id=f"{prefix}{start}"
    )
    item["evidence"] = [
        {**item["evidence"][0], "spanIds": [f"{prefix}{start + i}"], "quote": line}
        for i, line in enumerate(lines)
    ]
    return item


def test_AC_SRC_10_DEV484_plain_text_source_candidate_is_one_readable_paragraph():
    lines = [
        "푸른뜰은 청년들이 만든 농장입니다.",
        "가족이 함께 먹을 수 있는 과일을",
        "직접 살펴보고 정성껏 고릅니다.",
    ]
    item = paragraph_candidate(lines)
    result = plan([item])
    assert [t["value"] for m in result["modules"] for t in m["texts"]] == [" ".join(lines)]
    assert [p["originalValue"] for p in result["passages"]] == lines
    assert result["summary"]["includedInDraft"] == 3
    assert len(result["accounting"]) == 3


def test_AC_SRC_10_DEV484_cross_field_sentence_bridges_a_source_proven_middle_clause():
    left = candidate("appearance", "겉은 조금 거칠지만", field="appearanceFaq", span_id="s1")
    right = paragraph_candidate(
        ["6~7월에만 만날 수 있는", "산뜻한 여름 과일입니다!"], field="taste", start=2
    )
    result = plan([right, left])
    assert len(result["modules"]) == 1
    assert result["modules"][0]["module"] == "summary"
    texts = result["modules"][0]["texts"]
    assert len(texts) == 1
    assert texts[0]["value"] == "겉은 조금 거칠지만 6~7월에만 만날 수 있는 산뜻한 여름 과일입니다!"
    assert len(texts[0]["passageIds"]) == 3
    assert all(p["includedInDraft"] for p in result["passages"])
    assert all("CONTINUATION_CONTEXT" in p["reasonCodes"]["COPY_EDIT"] for p in result["passages"])
    assert all(p["status"] == "PENDING" for p in result["passages"])


@pytest.mark.parametrize(
    "change",
    [
        "paraphrase",
        "gap",
        "prefix",
        "page",
        "reverse",
        "blank_paragraph",
        "heading",
        "explicit_decision",
    ],
)
def test_AC_SRC_10_DEV484_ambiguous_candidate_paragraph_stays_separate(change):
    item = paragraph_candidate(["직접 농장을 살펴보고", "과일을 정성껏 고릅니다."])
    decisions = []
    if change == "paraphrase":
        item["value"] = "A model paraphrase is not a source unit."
    elif change == "gap":
        item["evidence"][1]["spanIds"] = ["s3"]
    elif change == "prefix":
        item["evidence"][1]["spanIds"] = ["another2"]
    elif change == "page":
        item["evidence"][1]["page"] = 2
    elif change == "reverse":
        item["evidence"].reverse()
    elif change == "blank_paragraph":
        item["value"] = "\n\n".join(e["quote"] for e in item["evidence"])
    elif change == "heading":
        item["evidence"][1]["quote"] = "배송 안내"
        item["value"] = " ".join(e["quote"] for e in item["evidence"])
    elif change == "explicit_decision":
        initial = plan([item])
        decisions = [
            {
                "bindingHash": initial["passages"][0]["bindingHash"],
                "action": "EDIT",
                "value": "내가 작성한 독립 문장입니다.",
                "note": "직접 검토했어요",
            }
        ]
    result = plan([item], decisions=decisions)
    assert sum(len(m["texts"]) for m in result["modules"]) == 2
    assert result["summary"]["includedInDraft"] == 2


def test_AC_SRC_10_DEV484_separate_photo_captions_are_not_merged_into_one_paragraph():
    items = [
        candidate(f"caption-{i}", line, value=line, field="delivery", span_id=f"s{i}")
        for i, line in enumerate(
            ["개별 포장 사진입니다.", "가정용 포장 사진입니다.", "선물용 포장 사진입니다."]
        )
    ]
    result = plan(items)
    assert len(result["modules"][0]["texts"]) == 3
    assert [t["value"] for t in result["modules"][0]["texts"]] == [i["value"] for i in items]


def test_AC_SRC_10_DEV484_missing_punctuation_does_not_create_a_run_on_paragraph():
    item = paragraph_candidate(
        [
            "청년들이 함께 일하는 농장입니다",
            "가족이 함께 먹을 수 있는 과일을",
            "직접 살펴보고 고릅니다.",
        ]
    )
    result = plan([item])
    assert [t["value"] for m in result["modules"] for t in m["texts"]] == [
        "청년들이 함께 일하는 농장입니다",
        "가족이 함께 먹을 수 있는 과일을 직접 살펴보고 고릅니다.",
    ]


def test_AC_SRC_10_DEV485_acknowledging_the_whole_unit_keeps_the_readable_paragraph():
    item = paragraph_candidate(["대표가 정성껏 고른 과일을", "가족과 함께 드셔 보세요."])
    initial = plan([item])
    choices = [
        {
            "bindingHash": p["bindingHash"],
            "action": "KEEP",
            "module": "farmStory",
            "note": "원문과 문맥을 확인했어요.",
        }
        for p in initial["passages"]
    ]
    result = plan([item], decisions=choices)
    assert [t["value"] for m in result["modules"] for t in m["texts"]] == [
        "대표가 정성껏 고른 과일을 가족과 함께 드셔 보세요."
    ]
    assert all(not p["reviewPending"] for p in result["passages"])
    assert all(p["autoRepair"]["ownerConfirmed"] for p in result["passages"])
    assert all(p["assemblyAcknowledged"] for p in result["passages"])


def test_AC_SRC_10_DEV485_acknowledgment_cannot_keep_a_restricted_health_claim():
    item = paragraph_candidate(
        ["가상의 과일은 질병을 치료하지만", "일상 과일로 소개합니다."], field="summary"
    )
    initial = plan([item])
    choices = [
        {
            "bindingHash": p["bindingHash"],
            "action": "KEEP",
            "module": "summary",
            "note": "확인했어요.",
        }
        for p in initial["passages"]
    ]
    with pytest.raises(SourcePlanError, match="Invalid source-preserving plan"):
        plan([item], decisions=choices)


def _page_candidate(cid, quote, field, span, page=4, source_id="source-1"):
    item = candidate(cid, quote, field=field, span_id=span)
    item["evidence"][0]["page"] = page
    item["evidence"][0]["sourceId"] = source_id
    return item


def test_AC_SRC_10_DEV452_fragment_in_specification_joins_continuation_in_taste():
    left = _page_candidate("frag", "껍질이 쉽게 벗겨지고,", "specification", "vision-gemini-7")
    right = _page_candidate("rest", "과육은 촉촉합니다.", "taste", "vision-gemini-8")
    result = plan([left, right])
    by_cid = {p["candidateIds"][0]: p for p in result["passages"]}
    assert by_cid["frag"]["module"] == "taste"
    texts = [t for m in result["modules"] for t in m["texts"]]
    assert [t["value"] for t in texts] == ["껍질이 쉽게 벗겨지고, 과육은 촉촉합니다."]
    assert texts[0]["candidateIds"] == ["frag", "rest"]
    assert "POSSIBLE_FRAGMENT" not in by_cid["frag"]["reasonCodes"]["COPY_EDIT"]


def test_AC_SRC_10_DEV452_fragment_is_not_joined_across_pages_or_sources():
    left = _page_candidate("frag", "껍질이 쉽게 벗겨지고,", "specification", "vision-gemini-7")
    other_page = _page_candidate("rest", "과육은 촉촉합니다.", "taste", "vision-gemini-8", page=5)
    result = plan([left, other_page])
    by_cid = {p["candidateIds"][0]: p for p in result["passages"]}
    assert by_cid["frag"]["module"] == "specification"
    assert "POSSIBLE_FRAGMENT" in by_cid["frag"]["reasonCodes"]["COPY_EDIT"]

    versions = {**VERSIONS, "source-2": {"revision": 3, "sanitizationVersion": 2}}
    other_source = _page_candidate(
        "rest", "과육은 촉촉합니다.", "taste", "vision-gemini-8", source_id="source-2"
    )
    result = plan([left, other_source], versions=versions)
    by_cid = {p["candidateIds"][0]: p for p in result["passages"]}
    assert by_cid["frag"]["module"] == "specification"


def test_AC_SRC_10_DEV452_fragment_is_not_joined_to_non_consecutive_span():
    left = _page_candidate("frag", "껍질이 쉽게 벗겨지고,", "specification", "vision-gemini-7")
    far = _page_candidate("rest", "과육은 촉촉합니다.", "taste", "vision-gemini-9")
    by_cid = {p["candidateIds"][0]: p for p in plan([left, far])["passages"]}
    assert by_cid["frag"]["module"] == "specification"
