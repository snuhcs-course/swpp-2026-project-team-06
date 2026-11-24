"""Invented prose and layout controls for deterministic source reflow."""

import pytest

from app.source_analysis.source_reflow import reflow_prose


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            "껍질의 빛깔은 고르지 않지만\n6~7월에만 맛볼 수 있는\n새콤한 여름 과일입니다!",
            "껍질의 빛깔은 고르지 않지만 6~7월에만 맛볼 수 있는 새콤한 여름 과일입니다!",
        ),
        (
            "농부는 “천천히 익힌\n과일을 전해요”라고 말합니다.\n향을 즐겨 주세요.",
            "농부는 “천천히 익힌 과일을 전해요”라고 말합니다. 향을 즐겨 주세요.",
        ),
        (
            "상자마다 약 8~10과이며\n크기에 따라 개수는 달라질 수 있습니다.",
            "상자마다 약 8~10과이며 크기에 따라 개수는 달라질 수 있습니다.",
        ),
        (
            "  첫 문장은 여기서  \n  자연스럽게 이어집니다.  ",
            "  첫 문장은 여기서 자연스럽게 이어집니다.  ",
        ),
        ("향이 좋습니\n다.\n천천히 드세요.", "향이 좋습니다. 천천히 드세요."),
        ("밭에서 익힌 과일입니\n다.", "밭에서 익힌 과일입니다."),
        ("당도 높은\n과일을 담았습니다.", "당도 높은 과일을 담았습니다."),
        ("문장이 끝나지 않았습\n니", "문장이 끝나지 않았습\n니"),
        ("처음 문장입니다.\r\n다음 문장입니다.", "처음 문장입니다. 다음 문장입니다."),
    ],
)
def test_AC_SRC_10_layout_only_prose_reflows_without_new_words(source, expected):
    assert reflow_prose(source) == expected


@pytest.mark.parametrize(
    "source",
    [
        "첫 문단입니다.\n\n둘째 문단입니다.",
        "첫 문단입니다.\n \n\n둘째 문단입니다.",
        "첫 문단입니다.\r\n\r\n둘째 문단입니다.",
        "- 과일은 씻어 주세요.\n- 껍질을 벗겨 주세요.",
        "1. 작은 과일\n2. 큰 과일",
        "① 작은 과일\n② 큰 과일",
        "A) 작은 과일\nB) 큰 과일",
        "1)\n자연스럽게 익힌 과일입니다.",
        "(1) 작은 과일\n(2) 큰 과일",
        "12~14\n15~18",
        "8~10과 (크기에 따라)\n12~15과 (크기에 따라)",
        "중량: 3kg\n개수: 약 9개\n포장: 종이 상자",
        "평균 과일 수: 약 9개\n포장 방식: 완충재 사용",
        "중량 3kg\n과수 8~10과\n당도 12브릭스",
        "180~220g 내외\n8~10과\n12~14브릭스",
        "옵션 1: 알뜰형\n크기가 다양한 과일을 담았습니다.",
        "알뜰 꾸러미 3kg\n크기가 다양한 과일을 담았습니다.",
        "알뜰형3kg\n크기가 다양한 과일을 담았습니다.",
        "3kg / 8~10과 / 종이상자\n5kg / 12~15과 / 종이상자",
        "3kg, 8~10과\n5kg, 12~15과",
        "선물 세트\n색이 고른 과일을 담았습니다.",
        "중량 | 개수 | 포장\n3kg | 약 9개 | 종이 상자",
        "중량\t개수\n3kg\t약 9개",
        "중량  개수\n3kg  약 9개",
    ],
)
def test_AC_SRC_10_structural_rows_and_explicit_paragraphs_preserve_layout(source):
    assert reflow_prose(source) == source


def test_AC_SRC_10_prose_around_structural_rows_can_still_reflow():
    source = (
        "천천히 익혀서\n향이 좋습니다.\n중량: 3kg\n크기는 다르지만\n모두 같은 밭에서 자랐습니다."
    )
    assert reflow_prose(source) == (
        "천천히 익혀서 향이 좋습니다.\n중량: 3kg\n크기는 다르지만 모두 같은 밭에서 자랐습니다."
    )


def test_AC_SRC_10_reflow_preserves_explicit_blank_paragraphs_between_wrapped_prose():
    source = "첫 문장이\n이어집니다.\n\n\n다른 문단도\n이어집니다."
    assert reflow_prose(source) == "첫 문장이 이어집니다.\n\n\n다른 문단도 이어집니다."


def test_AC_SRC_10_explicit_option_layout_is_unchanged_even_for_polite_split():
    source = "옵션 1\n자연스럽게 익힌\n과일입니\n다."
    assert reflow_prose(source, preserve_layout=True) == source


@pytest.mark.parametrize(
    "source", ["", "한 문장입니다.", "\n", "\n\n", "앞\n뒤", "규격: 3kg\n약 9개"]
)
def test_AC_SRC_10_reflow_is_idempotent(source):
    once = reflow_prose(source)
    assert reflow_prose(once) == once


def test_AC_SRC_10_long_document_preserves_every_paragraph_and_numeric_condition():
    source = "\n\n".join(
        f"구역 {i}에서 자랐고\n상자마다 {i + 1}개가 담길 수 있습니다." for i in range(2000)
    )
    expected = "\n\n".join(
        f"구역 {i}에서 자랐고 상자마다 {i + 1}개가 담길 수 있습니다." for i in range(2000)
    )
    result = reflow_prose(source)
    assert result == expected
    assert result.count("\n\n") == 1999
    assert reflow_prose(result) == result


def test_sentence_starting_with_choice_word_is_still_prose():
    assert reflow_prose("선택해 주셔서\n감사합니다.") == "선택해 주셔서 감사합니다."
    assert reflow_prose("구성되어 있는\n상품입니다.") == "구성되어 있는 상품입니다."


@pytest.mark.parametrize(
    ("source", "rendered", "expected"),
    [
        ("올해 수확한\n과일입니다.", "올해 수확한 과일입니다.", True),
        ("정성으로 키웠습니\n다.", "정성으로 키웠습니다.", True),
        ("1\n2kg", "12kg", False),
        (
            "옵션 A 4kg\n수량 : 9~20과",
            "옵션 A 4kg\n사이즈 : 중소과\n수량 : 9~20과\n포장 : 상자",
            True,
        ),
        ("옵션 A 4kg\n수량 : 9~20과", "옵션 A 4kg\n수량 : 5과\n\n옵션 B 8kg\n수량 : 9~20과", False),
    ],
)
def test_original_wording_detection_survives_source_layout(source, rendered, expected):
    from app.source_analysis.source_reflow import contains_source_wording

    assert contains_source_wording(source, rendered) is expected


@pytest.mark.parametrize("action", ["OMIT", "EDIT", "ACCEPT_REPAIR"])
def test_AC_SRC_7_stale_reflowed_source_cannot_publish_after_owner_change(monkeypatch, action):
    from types import SimpleNamespace

    from app.core.errors import ApiError
    from app.source_analysis import source_copy_service as service

    p = {
        "reviewPending": False,
        "originalValue": "올해 수확한\n과일입니다.",
        "value": "다른 설명입니다.",
        "decision": {"action": action},
    }
    monkeypatch.setattr(service, "plan", lambda *a: {"passages": [p]})
    batch = SimpleNamespace(source_copy_enabled=True, targets=[{"id": "t", "name": "과일"}])
    with pytest.raises(ApiError) as exc:
        service.validate_publication(None, batch, "t", ["올해 수확한 과일입니다."])
    assert exc.value.status == 409
    assert exc.value.details["reason"] == "SOURCE_REVIEW_CHANGED"
