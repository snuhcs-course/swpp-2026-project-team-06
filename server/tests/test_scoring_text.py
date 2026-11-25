"""AC-SRC-2/3: bounded scorer-v2 formatting controls, invented data only."""

import pytest


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


def test_AC_SRC_3_brix_spacing_normalizes_before_sensitive_number_scan():
    from app.source_analysis.scoring_text import sensitive_tokens

    assert sensitive_tokens("당도 12브릭 스") == sensitive_tokens("당도 12브릭스")
    assert (
        sensitive_tokens("당도 12브릭스")["number"] != sensitive_tokens("당도 14브릭스")["number"]
    )


@pytest.mark.parametrize(
    "text,tokens",
    [
        ("포장합니다.\n1~2개 더 넣습니다.", ["1~2개"]),
        ("박스 0.5kg\nSince1966", ["0.5kg", "Since1966"]),
        (["박스 0.5kg", "Since1966"], ["0.5kg", "Since1966"]),
    ],
)
def test_AC_SRC_2_paragraph_boundaries_do_not_glue_numbers_or_units(text, tokens):
    from app.source_analysis.scoring_text import selector_contains

    assert selector_contains(tokens, text)


@pytest.mark.parametrize(
    "text,tokens",
    [
        ("감귤 14kg", ["4kg"]),
        ("무게 3.5kg", ["5kg"]),
        ("상자 0.5kg\nSince1966", ["0.5kgSince1966"]),
        ("선물 설명\n\n별도 문장", ["설명별도"]),
        ("0.5kga", ["0.5kg"]),
    ],
)
def test_AC_SRC_3_near_neighbor_boundaries_remain_distinct(text, tokens):
    from app.source_analysis.scoring_text import selector_contains

    assert not selector_contains(tokens, text)


def test_AC_SRC_3_context_typos_are_not_global_equivalences():
    from app.source_analysis.scoring_text import mechanical

    assert mechanical("비닐펙") != mechanical("비닐팩")
    assert mechanical("닫은 체") != mechanical("닫은 채")


@pytest.mark.parametrize("value", ["13.2\n13.5", "13.2 13.5"])
def test_AC_SRC_3_independent_decimal_values_do_not_glue_or_make_range(value):
    from app.source_analysis.scoring_text import selector_contains, sensitive_tokens

    assert selector_contains(["13.2", "13.5"], value)
    assert not selector_contains(["13.2~13.5"], value)
    assert sensitive_tokens(value)["number"] == {"13.2", "13.5"}


@pytest.mark.parametrize("value", ["1\n2", "1 2", "1\n2kg"])
def test_AC_SRC_3_independent_integer_lines_are_not_digit_repair(value):
    from app.source_analysis.scoring_text import selector_contains, sensitive_tokens

    assert not selector_contains(["12"], value)
    assert "12" not in sensitive_tokens(value)["number"]


@pytest.mark.parametrize(
    "value,selector", [("6\n7월", "6~7월"), ("1~5월", "1~4월"), ("-4kg", "4kg")]
)
def test_AC_SRC_3_ranges_and_signs_do_not_expand(value, selector):
    from app.source_analysis.scoring_text import selector_contains

    assert not selector_contains([selector], value)


@pytest.mark.parametrize(
    "original,alternative,safe",
    [
        (["3일 이내"], ["3일"], "3일 이내 도착합니다."),
        (["개수 미확인"], ["개수"], "개수 미확인입니다."),
        (["최대4kg"], ["4kg"], "최대4kg입니다."),
        (["약4kg"], ["4kg"], "약4kg입니다."),
        (["12브릭스 이상"], ["12브릭스 이하"], "12브릭스 이하입니다."),
        (["A옵션", "4kg"], ["B옵션", "4kg"], "A옵션3kg B옵션4kg"),
        (["4kg"], ["14kg"], "14kg입니다."),
        (["씨가없습니다"], ["씨가있습니다"], "씨가있습니다."),
    ],
)
def test_AC_SRC_3_alias_cannot_drop_limits_unknowns_or_change_scope(original, alternative, safe):
    from app.source_analysis.scoring_text import validate_selector_aliases

    with pytest.raises(ValueError):
        validate_selector_aliases(original, [alternative], safe)


@pytest.mark.parametrize(
    "value,tokens",
    [
        ("주 생산 시기는 12월-2월입니다.", ["12월", "2월"]),
        ("10월 중순-11월 중순에 수확합니다.", ["10월 중순", "11월 중순"]),
        ("3kg-4kg 상자입니다.", ["3kg", "4kg"]),
    ],
)
def test_AC_SRC_2_explicit_compatible_unit_range_endpoints_are_not_negative(value, tokens):
    from app.source_analysis.scoring_text import selector_contains, sensitive_tokens

    assert selector_contains(tokens, value)
    assert sensitive_tokens(value) == sensitive_tokens(value.replace("-", "~"))


@pytest.mark.parametrize(
    "value,selector",
    [
        ("-4kg", "4kg"),
        ("-4", "4"),
        ("다른 값13.2 -13.5", "13.5"),
        ("별도3kg\n-4kg", "4kg"),
        ("12월-3월", "2월"),
        ("12월--2월", "2월"),
        ("12월-2일", "2일"),
        ("112월-2월", "12월"),
    ],
)
def test_AC_SRC_3_range_fix_does_not_waive_standalone_sign_or_wrong_endpoint(value, selector):
    from app.source_analysis.scoring_text import selector_contains

    assert not selector_contains([selector], value)


def test_AC_SRC_2_inline_sentence_period_does_not_turn_years_into_decimal_suffix():
    from app.source_analysis.scoring_text import selector_contains

    assert selector_contains(["50년"], "since1966 서귀포. 50년 동안 전통 방식으로 재배했습니다.")


@pytest.mark.parametrize(
    "value,selector",
    [
        ("서귀포. 0.5kg", "5kg"),
        ("서귀포. 0.5", "5"),
        ("당도 13.2브릭스", "13.5브릭스"),
        ("재배 150년", "50년"),
    ],
)
def test_AC_SRC_3_inline_boundary_fix_preserves_decimals_and_numeric_neighbors(value, selector):
    from app.source_analysis.scoring_text import selector_contains

    assert not selector_contains([selector], value)
