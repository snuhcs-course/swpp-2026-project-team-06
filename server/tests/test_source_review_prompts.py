"""DEV-485: informative owner questions, not blanket price/shipping warnings."""

import pytest

from app.source_analysis.review_prompts import prompts_for


def reasons(*codes, kind="OWNER_CONFIRMATION"):
    result = {k: [] for k in ("COPY_EDIT", "OWNER_CONFIRMATION", "PLACEMENT", "SAFETY")}
    result[kind] = list(codes)
    return result


@pytest.mark.parametrize(
    "value", ["농사를 시작한 지 8년차인 대표입니다.", "8년 전 이 마을로 이사 왔어요."]
)
def test_AC_SRC_10_DEV485_experience_questions_identify_reference_year(value):
    prompts = prompts_for(value, reasons("RELATIVE_TIME", "DATED_OR_HISTORICAL"))
    assert len(prompts) == 1
    p = prompts[0]
    assert "8년" in p["question"] and "기준" in p["question"]
    assert p["severity"] == "check"
    assert "?" in p["question"]
    assert "가격" not in str(prompts) and "배송" not in str(prompts)


def test_AC_SRC_10_DEV485_price_prompt_quotes_the_amount_and_keeps_settings_separate():
    p = prompts_for("한 상자 28,000원", reasons("PRICE_OR_FEE", "MONEY_AMOUNT"))[0]
    assert "28,000원" in p["question"]
    assert "판매 설정" in p["detail"]
    assert p["severity"] == "warning"
    assert p["confirmation"]


@pytest.mark.parametrize("code", ["PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"])
def test_AC_SRC_10_DEV485_serious_restrictions_are_explicit_and_require_fixing(code):
    p = prompts_for("가상 문구", reasons(code, kind="SAFETY"))[0]
    assert p["severity"] == "critical"
    assert "수정" in p["detail"] or "고치" in p["detail"]


def test_AC_SRC_10_DEV485_fragment_question_points_to_actual_unfinished_words():
    p = prompts_for("겉은 조금 거칠지만", reasons("POSSIBLE_FRAGMENT", kind="COPY_EDIT"))[0]
    assert "거칠지만" in p["question"]
    assert "빠졌나요" in p["question"]
    assert p["severity"] == "warning"
