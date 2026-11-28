"""AC-SRC-2/3/11: exact-facts assembly audits, invented source blocks only."""

from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.ai.source_assembly import AssemblyOutput, audit


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


def text(tid, value, module="summary", flags=()):
    return {
        "id": tid,
        "module": module,
        "value": value,
        "passageIds": ["passage-" + tid],
        "ownerFlags": list(flags),
    }


def row(*texts):
    return {
        "id": "synthetic",
        "format": "text",
        "target": {"id": "target", "name": "합성 감귤"},
        "texts": list(texts),
    }


def output(value="감귤입니다.", ids=("a",), *, module="summary", excluded=(), notes=()):
    return {
        "modules": [
            {
                "module": module,
                "texts": [{"value": value, "textIds": list(ids), "editingNotes": list(notes)}],
            }
        ],
        "excluded": list(excluded),
    }


def exclude(ids, reason="UNSUPPORTED", explanation="확인 필요", support=()):
    return {
        "textIds": list(ids),
        "reason": reason,
        "explanation": explanation,
        "supportedByTextIds": list(support),
    }


def test_AC_SRC_2_exact_paragraph_has_no_numeric_or_wording_warnings():
    value = "감귤은 새콤하며 수량은 미확정입니다."
    result = audit(output(value), row(text("a", value)))
    for key in [
        "missingIds",
        "unknownIds",
        "newNumbers",
        "missingNumbers",
        "newRanges",
        "privateAdded",
        "changedTexts",
    ]:
        assert not result[key]
    assert result["semanticAccuracy"] == result["optionAssociationsPreserved"] == "UNKNOWN"


def test_AC_SRC_2_minimal_grammar_changes_are_visible_not_rejected_or_repaired():
    value = "서늘한 곳에\n보관해 주세 요."
    assembled = "서늘한 곳에 보관해 주세요."
    model_output = output(assembled)
    original = deepcopy(model_output)
    result = audit(model_output, row(text("a", value)))
    assert result["modules"][0]["texts"][0]["value"] == assembled
    assert result["changedTexts"][0]["sourceValue"] == value
    assert result["changedTexts"][0]["meaningPreserved"] == "UNKNOWN"
    assert model_output == original


def test_AC_SRC_2_layout_whitespace_only_is_not_wording_change():
    result = audit(output("서늘한 곳에 보관"), row(text("a", "서늘한 곳에\n보관")))
    assert result["changedTexts"] == []


def test_AC_SRC_11_related_nonadjacent_blocks_merge_and_union_server_flags():
    inputs = row(
        text("a", "선물형 3kg", "composition", ["HISTORICAL", "PRICE"]),
        text("b", "다른 보관 설명"),
        text("c", "수량 : 9~17과", "pieceCount", ["PRICE", "TIMING"]),
    )
    result = audit(
        output(
            "선물형 3kg\n수량 : 9~17과",
            ["a", "c"],
            module="composition",
            notes=["모든 확인을 해제했습니다."],
        ),
        inputs,
    )
    rendered = result["modules"][0]["texts"][0]
    assert rendered["inheritedOwnerFlags"] == ["HISTORICAL", "PRICE", "TIMING"]
    assert rendered["passageIds"] == ["passage-a", "passage-c"]
    assert rendered["editingNotes"] == ["모든 확인을 해제했습니다."]
    assert result["missingIds"] == ["b"]


def test_AC_SRC_3_per_option_quantity_swap_is_unsupported_despite_global_number_coverage():
    inputs = row(
        text("a", "옵션 A : 3kg 12과", "composition"), text("b", "옵션 B : 5kg 20과", "composition")
    )
    assembled = {
        "modules": [
            {
                "module": "composition",
                "texts": [
                    {"value": "옵션 A : 3kg 20과", "textIds": ["a"], "editingNotes": []},
                    {"value": "옵션 B : 5kg 12과", "textIds": ["b"], "editingNotes": []},
                ],
            }
        ],
        "excluded": [],
    }
    result = audit(assembled, inputs)
    assert len(result["newNumbers"]) == 2
    assert result["missingNumbers"] == []
    assert result["newNumbers"][0]["numbers"] == [["20", "과"]]
    assert result["changedTexts"][0]["missingCitedNumbers"] == [["12", "과"]]


def test_AC_SRC_3_missing_numeric_content_not_hidden_by_citing_input_id():
    result = audit(output("가정용 감귤", ["a"]), row(text("a", "가정용 감귤 3kg 30,000원")))
    assert result["missingIds"] == []
    assert result["missingNumbers"] == [["3", "kg"], ["30000", ""]]
    assert result["changedTexts"][0]["missingCitedNumbers"]


def test_AC_SRC_3_new_range_from_separate_supported_endpoints_is_flagged():
    result = audit(output("13.2~13.5Brix"), row(text("a", "13.2Brix 및 13.5Brix")))
    assert result["newRanges"][0]["ranges"] == [["13.2", "13.5"]]


def test_AC_SRC_3_missing_unknown_empty_and_duplicate_references_are_visible():
    inputs = row(text("a", "설명 A"), text("b", "설명 B"))
    result = audit(output("변경된 설명", ["a", "a", "unknown", ""]), inputs)
    assert result["missingIds"] == ["b"]
    assert result["unknownIds"] == ["", "unknown"]
    assert result["emptyReferences"]
    assert result["duplicateIds"][0]["textId"] == "a"
    no_refs = audit(output("새로운 설명", []), inputs)
    assert no_refs["missingIds"] == ["a", "b"]
    assert no_refs["emptyReferences"]


def test_AC_SRC_3_exact_duplicate_exclusion_requires_retained_support():
    inputs = row(text("a", "감귤 설명입니다."), text("b", "감귤 설명입니다."))
    result = audit(
        output(
            "감귤 설명입니다.", ["a"], excluded=[exclude(["b"], "DUPLICATE", "동일 문장", ["a"])]
        ),
        inputs,
    )
    assert not result["missingIds"]
    assert not result["unexplainedExclusions"]
    bad = audit(
        {"modules": [], "excluded": [exclude(["a", "b"], "DUPLICATE", "서로 중복", ["a", "b"])]},
        inputs,
    )
    assert bad["unexplainedExclusions"][0]["codes"] == ["DUPLICATE_NOT_EXACTLY_SUPPORTED"]


def test_AC_SRC_3_similarity_or_word_overlap_does_not_prove_duplicate():
    inputs = row(text("a", "새콤하며 보관 기간은 미정입니다."), text("b", "새콤합니다."))
    result = audit(
        output("새콤합니다.", ["b"], excluded=[exclude(["a"], "DUPLICATE", "비슷한 말", ["b"])]),
        inputs,
    )
    assert result["unexplainedExclusions"]


@pytest.mark.parametrize(
    "reason,code",
    [
        ("OTHER_PRODUCT", "HUMAN_ATTRIBUTION_REVIEW_REQUIRED"),
        ("UNSUPPORTED", "HUMAN_SUPPORT_REVIEW_REQUIRED"),
    ],
)
def test_AC_SRC_3_semantic_exclusion_is_explicit_human_unknown(reason, code):
    inputs = row(text("a", "감귤 설명"))
    result = audit(
        {"modules": [], "excluded": [exclude(["a"], reason, "모델 설명", ["a"])]}, inputs
    )
    assert not result["missingIds"]
    assert result["unexplainedExclusions"][0]["codes"] == [code]
    assert result["excluded"][0]["explanation"] == "모델 설명"


def test_AC_SRC_3_empty_exclusion_explanation_and_unknown_support_remain_auditable():
    result = audit(
        output("감귤 설명", ["a"], excluded=[exclude(["b"], "DUPLICATE", "", ["foreign"])]),
        row(text("a", "감귤 설명"), text("b", "감귤 설명")),
    )
    assert result["unknownIds"] == ["foreign"]
    assert "MISSING_EXPLANATION" in result["unexplainedExclusions"][0]["codes"]


def test_AC_SRC_3_added_private_info_flagged_and_output_preserved():
    value = "감귤 설명 문의 fixture@example.com"
    result = audit(output(value), row(text("a", "감귤 설명")))
    assert result["privateAdded"][0]["redactedValue"] == "감귤 설명 문의 [가림]"
    assert result["modules"][0]["texts"][0]["value"] == value


def test_AC_SRC_3_private_exclusion_must_have_source_support():
    result = audit(
        {"modules": [], "excluded": [exclude(["a"], "PRIVATE", "연락처")]},
        row(text("a", "문의 fixture@example.com")),
    )
    assert not result["unexplainedExclusions"]
    result = audit(
        {"modules": [], "excluded": [exclude(["a"], "PRIVATE", "모델 판단")]},
        row(text("a", "가격은 30,000원")),
    )
    assert result["unexplainedExclusions"][0]["codes"] == ["PRIVATE_NOT_SUPPORTED"]
    assert result["missingNumbers"] == [["30000", ""]]


@pytest.mark.parametrize("bad_module", ["name", "historicalSales", "packagePhoto", "other"])
def test_AC_SRC_3_only_actual_text_modules_are_allowed(bad_module):
    with pytest.raises(ValidationError):
        AssemblyOutput.model_validate(output(module=bad_module))


def test_AC_SRC_3_schema_caps_value_and_forbids_model_ownerflag_override():
    for bad in [output("가" * 6001), output()]:
        if len(bad["modules"][0]["texts"][0]["value"]) < 6001:
            bad["modules"][0]["texts"][0]["ownerFlags"] = []
        with pytest.raises(ValidationError):
            AssemblyOutput.model_validate(bad)


def test_AC_SRC_3_input_ids_must_be_nonempty_unique():
    for inputs in [row(text("", "설명")), row(text("a", "설명"), text("a", "다른 설명"))]:
        with pytest.raises(ValueError):
            audit(output(), inputs)


def test_AC_SRC_11_excluding_text_cannot_erase_inherited_owner_flags():
    inputs = row(text("a", "지난해 30,000원", flags=["PRICE", "HISTORICAL"]))
    result = audit({"modules": [], "excluded": [exclude(["a"])]}, inputs)
    assert result["excluded"][0]["inheritedOwnerFlags"] == ["PRICE", "HISTORICAL"]
    assert result["excluded"][0]["passageIds"] == ["passage-a"]
    assert result["missingNumbers"] == [["30000", ""]]


def test_AC_SRC_3_nonnumeric_polarity_loss_is_changed_wording_with_unknown_meaning():
    result = audit(output("농약을 사용했습니다."), row(text("a", "농약을 사용하지 않았습니다.")))
    assert result["changedTexts"]
    assert not result["newNumbers"]
    assert result["nonnumericMeaningPreserved"] == "UNKNOWN"
