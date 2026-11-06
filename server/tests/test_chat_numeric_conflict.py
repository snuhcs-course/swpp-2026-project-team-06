"""Specification tests: contradictory shipping evidence must reach a human."""

import pytest

from app.ai import service as ai
from app.ai.schemas import Evidence

QUESTION = "배송비는 얼마예요?"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


@pytest.fixture(autouse=True)
def forbid_model_provider(monkeypatch):
    """These evidence decisions must complete without contacting a provider."""
    calls = []

    def raising_provider(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("Shipping evidence tests must not call the model provider")

    monkeypatch.setattr(ai, "_client", raising_provider)
    yield
    assert not calls, "Shipping evidence decision attempted to contact the model provider"


def test_paid_product_and_free_shipping_faq_are_handed_off():
    evidence = Evidence(
        product_id="p-shipping",
        shipping_fee_type="PAID",
        shipping_fee=3500,
        faqs=[{"question": QUESTION, "answer": "무료배송이에요"}],
    )

    result = ai.answer_question(QUESTION, evidence)

    assert result.action == "HANDOFF"


def test_free_product_and_fee_required_faq_are_handed_off_even_with_remote_fee():
    evidence = Evidence(
        product_id="p-shipping",
        shipping_fee_type="FREE",
        shipping_fee=0,
        remote_area_fee=5000,
        faqs=[{"question": QUESTION, "answer": "배송비가 발생해요"}],
    )

    result = ai.answer_question(QUESTION, evidence)

    assert result.action == "HANDOFF"


@pytest.mark.parametrize("fee_text", ["3500원", "3,500원"])
def test_equivalent_product_and_faq_shipping_amounts_remain_answerable(fee_text):
    evidence = Evidence(
        product_id="p-shipping",
        shipping_fee_type="PAID",
        shipping_fee=3500,
        faqs=[{"question": QUESTION, "answer": f"배송비는 {fee_text}이에요."}],
    )

    result = ai.answer_question(QUESTION, evidence)

    assert result.action == "ANSWER"


@pytest.mark.parametrize("reverse_faq_order", [False, True])
def test_paid_and_free_shipping_faqs_are_handed_off_regardless_of_faq_order(reverse_faq_order):
    faqs = [
        {"question": QUESTION, "answer": "배송비는 3,500원이에요."},
        {"question": QUESTION, "answer": "무료배송이에요"},
    ]
    if reverse_faq_order:
        faqs.reverse()

    result = ai.answer_question(QUESTION, Evidence(faqs=faqs))

    assert result.action == "HANDOFF"
