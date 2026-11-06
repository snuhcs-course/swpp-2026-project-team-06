"""AC_13_1: shipping consistency is about claims, not omitted detail."""

import pytest

from app.ai import service as ai
from app.ai.schemas import Evidence

QUESTION = "배송비는 얼마인가요?"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


@pytest.fixture(autouse=True)
def forbid_model_provider(monkeypatch):
    calls = []

    def raising_provider(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("AC_13_1 shipping rules must not invoke a model provider")

    monkeypatch.setattr(ai, "_client", raising_provider)
    yield
    assert not calls, "AC_13_1 attempted to invoke a model provider"


@pytest.mark.parametrize(
    "fee_type,base_fee,remote_fee,faq_answer,expected_action",
    [
        pytest.param("FREE", 0, 5000, "무료배송입니다.", "ANSWER", id="free-remote-omitted"),
        pytest.param(
            "FREE", 0, 5000, "기본 배송비는 0원입니다.", "ANSWER", id="zero-remote-omitted"
        ),
        pytest.param(
            "FREE",
            0,
            5000,
            "기본 배송은 무료이며 산간 추가 배송비는 5,000원입니다.",
            "ANSWER",
            id="free-same-remote",
        ),
        pytest.param(
            "FREE",
            0,
            5000,
            "기본 배송은 무료이며 산간 추가 배송비는 5000원입니다.",
            "ANSWER",
            id="free-same-remote-no-comma",
        ),
        pytest.param(
            "FREE",
            0,
            5000,
            "기본 배송은 무료이며 산간 추가 배송비는 3,000원입니다.",
            "HANDOFF",
            id="free-conflicting-remote",
        ),
        pytest.param(
            "FREE",
            0,
            5000,
            "기본 배송비는 0원이며 산간 추가 배송비는 3000원입니다.",
            "HANDOFF",
            id="zero-conflicting-remote",
        ),
        pytest.param(
            "PAID", 3500, 5000, "배송비는 별도입니다.", "ANSWER", id="paid-unspecified-separate-fee"
        ),
        pytest.param(
            "PAID", 3500, 5000, "배송비가 발생합니다.", "ANSWER", id="paid-unspecified-fee-required"
        ),
        pytest.param(
            "PAID",
            3500,
            5000,
            "기본 배송비는 3,500원입니다.",
            "ANSWER",
            id="paid-same-comma-amount",
        ),
        pytest.param(
            "PAID", 3500, 5000, "기본 배송비는 3500원입니다.", "ANSWER", id="paid-same-plain-amount"
        ),
        pytest.param("PAID", 3500, 5000, "무료배송입니다.", "HANDOFF", id="paid-versus-free"),
        pytest.param("FREE", 0, 5000, "배송비가 발생합니다.", "HANDOFF", id="free-versus-paid"),
        pytest.param(
            "PAID",
            3500,
            5000,
            "기본 배송비는 3,000원입니다.",
            "HANDOFF",
            id="different-explicit-base-fee",
        ),
        pytest.param(
            "PAID",
            3500,
            5000,
            "기본 배송비는 3,500원이 아닙니다.",
            "HANDOFF",
            id="negated-current-fee-comma",
        ),
        pytest.param(
            "PAID",
            3500,
            5000,
            "기본 배송비는 3500원이 아닙니다.",
            "HANDOFF",
            id="negated-current-fee-plain",
        ),
        pytest.param(
            "PAID",
            3000,
            5000,
            "기본 배송비는 3500원이 아니라 3000원입니다.",
            "ANSWER",
            id="correction-agrees-plain",
        ),
        pytest.param(
            "PAID",
            3000,
            5000,
            "기본 배송비는 3,500원이 아니라 3,000원입니다.",
            "ANSWER",
            id="correction-agrees-comma",
        ),
        pytest.param(
            "PAID",
            3500,
            5000,
            "기본 배송비는 3500원이 아니라 3000원입니다.",
            "HANDOFF",
            id="correction-disagrees",
        ),
    ],
)
def test_AC_13_1_shipping_claim_consistency(
    fee_type, base_fee, remote_fee, faq_answer, expected_action
):
    evidence = Evidence(
        product_id="p-shipping-consistency",
        shipping_fee_type=fee_type,
        shipping_fee=base_fee,
        remote_area_fee=remote_fee,
        faqs=[{"question": QUESTION, "answer": faq_answer}],
    )

    result = ai.answer_question(QUESTION, evidence)

    assert result.action == expected_action


def test_AC_13_1_free_claim_and_explicit_paid_base_fee_are_contradictory():
    evidence = Evidence(
        product_id="p-shipping-consistency",
        shipping_fee_type="FREE",
        shipping_fee=0,
        remote_area_fee=5000,
        faqs=[
            {
                "question": QUESTION,
                "answer": "무료배송입니다. 기본 운임은 3000원입니다.",
            }
        ],
    )

    result = ai.answer_question(QUESTION, evidence)

    assert result.action == "HANDOFF"


def test_AC_13_1_negated_measured_brix_does_not_negate_expected_brix():
    question = "당도는 몇 브릭스인가요?"
    evidence = Evidence(
        product_id="p-brix",
        expected_brix=12,
        faqs=[
            {
                "question": question,
                "answer": "실측 당도는 12Brix가 아니며 예상 당도는 12Brix입니다.",
            }
        ],
    )

    result = ai.answer_question(question, evidence)

    assert result.action == "ANSWER"


@pytest.mark.parametrize(
    "faq_answer,expected_action",
    [
        pytest.param(
            "무료배송입니다. 택배 요금은 3000원입니다.",
            "HANDOFF",
            id="free-versus-explicit-courier-fee",
        ),
        pytest.param(
            "무료배송입니다. 주문금액 50000원 이상인 경우에만 무료배송입니다.",
            "HANDOFF",
            id="free-versus-minimum-order-condition",
        ),
        pytest.param(
            "무료배송이며 산간지역인 경우 추가 운임은 5000원입니다.",
            "ANSWER",
            id="free-with-matching-conditional-remote-fee",
        ),
    ],
)
def test_AC_13_1_free_shipping_fee_and_condition_regressions(faq_answer, expected_action):
    evidence = Evidence(
        product_id="p-shipping-consistency",
        shipping_fee_type="FREE",
        shipping_fee=0,
        remote_area_fee=5000,
        faqs=[{"question": QUESTION, "answer": faq_answer}],
    )

    result = ai.answer_question(QUESTION, evidence)

    assert result.action == expected_action
