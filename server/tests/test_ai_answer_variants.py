"""DEV-265: everyday phrasings get rule answers; M-07 look-alikes still go to the producer."""

import pytest

from app.ai import service as ai
from app.ai.schemas import Evidence

PAID = Evidence(
    product_id="p-1",
    shipping_fee_type="PAID",
    shipping_fee=3500,
    remote_area_fee=5000,
    delivery_window=("2026-11-10", "2026-11-14"),
    measured_brix=12.4,
    reservation_shipping_policy="예약 상품은 예약 기간 종료 후 순차 출하합니다.",
)


@pytest.mark.parametrize(
    "question",
    [
        "택배비 빼주시면 안 돼요?",
        "배송비 좀 빼 주세요",
        "13브릭스 이상 보장되나요?",
        "많이 셔요?",
        "안 셔요?",
        "맛있어요?",
        "달고 맛있어요?",
        "달아요?",
        "너무 달아요",
        "덜 달아요",
    ],
)
def test_M_07_haggling_guarantee_and_taste_are_always_handed_off(question):
    result = ai.answer_question(question, PAID)

    assert result.action == "HANDOFF", (question, result)


@pytest.mark.parametrize("question", ["언제 와요?", "주문하면 며칠 걸려요?", "언제쯤 보내주셔요?"])
def test_AC_13_1_everyday_delivery_phrasings_use_the_delivery_window(question):
    result = ai._rule_answer(question, PAID)

    assert result is not None and result.action == "ANSWER", (question, result)
    assert result.answer == "2026-11-10 ~ 2026-11-14에 받을 예정이에요."
    assert result.source_refs == ["product:p-1"]


@pytest.mark.parametrize(
    "question",
    ["다음 예약 언제 오픈해요?", "입금 언제 보내면 돼요?", "입금 언제 보내드리면 돼요?"],
)
def test_AC_13_1_when_questions_about_other_things_are_not_answered_with_the_delivery_window(
    question,
):
    """PR #591 리뷰: 받는 시기 질문이 아니면 배송 기간으로 답하지 않는다."""
    result = ai._rule_answer(question, PAID)

    assert result is None or "받을 예정" not in (result.answer or ""), (question, result)


@pytest.mark.parametrize("question", ["언제 오나요?", "언제쯤 올까요?", "언제 보내요?"])
def test_AC_13_1_more_everyday_delivery_phrasings_use_the_delivery_window(question):
    result = ai._rule_answer(question, PAID)

    assert result is not None and result.answer == "2026-11-10 ~ 2026-11-14에 받을 예정이에요.", (
        question,
        result,
    )


def test_AC_13_1_order_window_answers_my_order_question():
    ev = PAID.model_copy(
        update={"order_id": "o-1", "order_delivery_window": ("2026-11-12", "2026-11-15")}
    )

    result = ai._rule_answer("제 귤 언제 와요?", ev)

    assert result is not None and result.action == "ANSWER"
    assert "2026-11-12" in result.answer and result.source_refs == ["order:o-1"]


def test_AC_13_1_reservation_question_uses_policy_not_a_false_conflict():
    """예약 출하 원칙(숫자 없음)과 배송 기간(숫자)은 다른 사실이다. 충돌로 넘기지 않는다."""
    result = ai._rule_answer("예약하면 언제 출하돼요?", PAID)

    assert result is not None and result.action == "ANSWER", result
    assert result.source_refs == ["farm:reservationShippingPolicy"]


def test_M_05_reservation_question_with_own_order_uses_the_order_window():
    """본인 주문 사실이 농가 원칙보다 먼저다: 주문 배송 기간으로 답한다."""
    ev = PAID.model_copy(
        update={"order_id": "o-1", "order_delivery_window": ("2026-11-12", "2026-11-15")}
    )

    result = ai._rule_answer("예약한 제 귤 언제 배송돼요?", ev)

    assert result is not None and result.action == "ANSWER", result
    assert result.source_refs == ["order:o-1"]


def test_AC_13_1_extra_cost_request_is_not_answered_with_the_fee():
    result = ai._rule_answer("추가 비용 없이 두 박스 묶어 보내주실 수 있나요?", PAID)

    assert result is None or "배송비" not in (result.answer or "")


def test_AC_13_2_reservation_policy_conflicting_with_faq_is_still_handed_off():
    ev = PAID.model_copy(
        update={"faqs": [{"question": "예약하면 언제 출하돼요?", "answer": "주문 즉시 출하해요."}]}
    )

    result = ai._rule_answer("예약하면 언제 출하돼요?", ev)

    assert result is not None and result.reason == ai.CONFLICT_REASON


@pytest.mark.parametrize(
    ("fee_type", "expected"),
    [
        ("FREE", "무료배송이에요. 도서산간은 추가 운임 5,000원이 붙어요."),
        ("PAID", "배송비는 3,500원이에요. 도서산간은 추가 운임 5,000원이 붙어요."),
    ],
)
def test_AC_13_1_remote_area_surcharge_question_is_answered_by_the_fee_rule(fee_type, expected):
    ev = PAID.model_copy(update={"shipping_fee_type": fee_type})

    result = ai._rule_answer("도서산간은 추가 비용 있어요?", ev)

    assert result is not None and result.answer == expected


def test_AC_13_1_plain_fee_answer_is_unchanged():
    result = ai._rule_answer("배송비 얼마예요?", PAID)

    assert result is not None and result.answer == "배송비는 3,500원이에요."


def test_AC_13_3_how_sweet_is_answered_with_registered_brix_only():
    """PM 11/15: '얼마나 달아요?'는 등록 당도로 답하고 맛 판단을 붙이지 않는다."""
    measured = ai._rule_answer("얼마나 달아요?", PAID)
    expected = ai._rule_answer("얼마나 달아요?", Evidence(product_id="p-1", expected_brix=11.8))

    assert measured is not None and measured.answer == "등록된 실측 당도는 12.4Brix예요."
    assert expected is not None and "예상" in expected.answer


def test_AC_13_8_how_sweet_without_registered_brix_is_handed_off():
    result = ai.answer_question("얼마나 달아요?", Evidence(product_id="p-1"))

    assert result.action == "HANDOFF"
