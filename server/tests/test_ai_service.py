"""DEV-31 AI grounding and provider adapter regressions."""

from types import SimpleNamespace

import anthropic

from app.ai import grounding
from app.ai import service as ai
from app.ai.schemas import DraftExtraction, Evidence


def test_P02_AC_03_1_korean_units_and_field_grounding():
    grounded = grounding.ground_draft(
        "하우스 감귤 5키로, 당도 12.5브릭스, 배송은 12월 11일~20일입니다.",
        DraftExtraction(
            name="하우스 감귤 5KG",
            variety="궁천조생",
            options=["5kg", "10kg"],
            expected_brix=12.5,
            grade="특상",
            delivery_window="12월 11일~20일",
            description="하우스 감귤 5킬로그램, 당도 13브릭스입니다.",
        ),
    )

    assert grounded.name == "하우스 감귤 5KG"
    assert grounded.options == ["5kg"]
    assert grounded.expected_brix == 12.5
    assert grounded.delivery_window == "12월 11일~20일"
    assert grounded.variety is None
    assert grounded.grade is None
    assert grounded.description is None


def test_P02_AC_03_2_name_description_reject_price_reservation_and_contacts():
    source = "노지 감귤 5키로 예약 기간은 10월입니다. 문의 010-1234-5678"
    grounded = grounding.ground_draft(
        source,
        DraftExtraction(
            name="노지 감귤 5kg 3만원",
            description="예약 기간은 10월이며 계좌 110-123-456789로 입금하세요.",
            options=["5킬로"],
        ),
    )

    assert grounded.name is None
    assert grounded.description is None
    assert grounded.options == ["5킬로"]


def test_C06_AC_13_1_precise_delivery_intent_and_reservation_policy():
    evidence = Evidence(
        product_id="p-1",
        delivery_window=("2026-12-11", "2026-12-20"),
    )
    policy_evidence = Evidence(reservation_shipping_policy="예약 순서대로 12월 중순에 출하해요.")

    harvest = ai.answer_question("언제 수확해요?", evidence)
    delivery = ai.answer_question("배송은 언제예요?", evidence)
    policy = ai.answer_question("예약 상품은 언제 출하해요?", policy_evidence)

    assert harvest.action == "HANDOFF"
    assert delivery.action == "ANSWER"
    assert delivery.source_refs == ["product:p-1"]
    assert policy.action == "ANSWER"
    assert policy.source_refs == ["farm:reservationShippingPolicy"]


def test_C06_AC_13_3_model_fact_normalization_and_expected_label():
    evidence = Evidence(product_id="p-1", expected_brix=12.5)
    _, sources = grounding.evidence_payload(evidence, ai.strip_personal_info)

    assert grounding.validate_model_answer(
        "예상 당도는 12.5브릭스예요.", ["product:p-1"], sources, evidence
    )
    assert not grounding.validate_model_answer(
        "당도는 12.5브릭스예요.", ["product:p-1"], sources, evidence
    )
    assert not grounding.validate_model_answer(
        "예상 당도는 13브릭스예요.", ["product:p-1"], sources, evidence
    )


def test_C06_korean_dates_prices_and_vague_periods_are_grounded():
    evidence = Evidence(
        product_id="p-1",
        shipping_fee=3000,
        delivery_window=("2026-12-11", "2026-12-20"),
    )
    _, sources = grounding.evidence_payload(evidence, ai.strip_personal_info)

    assert grounding.validate_model_answer(
        "12월 중순에 받을 예정이에요.", ["product:p-1"], sources, evidence
    )
    assert not grounding.validate_model_answer(
        "12월 하순에 받을 예정이에요.", ["product:p-1"], sources, evidence
    )
    assert not grounding.validate_model_answer(
        "배송비는 3,000원이에요.", ["product:p-1"], sources, evidence
    )
    ambiguous = Evidence(
        faqs=[
            {"question": "첫 일정", "answer": "2026-12-20"},
            {"question": "다음 일정", "answer": "2027-12-20"},
        ]
    )
    _, ambiguous_sources = grounding.evidence_payload(ambiguous, ai.strip_personal_info)
    assert not grounding.validate_model_answer(
        "12월 20일이에요.", ["farm:faq"], ambiguous_sources, ambiguous
    )


def test_C06_AC_13_8_model_rejects_unknown_refs_and_farmer_voice():
    evidence = Evidence(faqs=[{"question": "수확 방식", "answer": "필요할 때 수확해요."}])
    _, sources = grounding.evidence_payload(evidence, ai.strip_personal_info)

    assert not grounding.validate_model_answer(
        "저희가 직접 수확해요.", ["farm:faq"], sources, evidence
    )
    assert not grounding.validate_model_answer(
        "저희 농장은 신선한 최고급 감귤만 보내요.", ["farm:faq"], sources, evidence
    )
    assert not grounding.validate_model_answer(
        "필요할 때 수확해요.", ["ai:evidence"], sources, evidence
    )


def test_C06_model_payload_sanitizes_copies_without_mutating_local_values():
    evidence = Evidence(
        product_id="p-1",
        product_name="감귤 문의 010-1234-5678",
        faqs=[{"question": "저희 농장 위치는?", "answer": "제주시 애월읍 해안로 123"}],
        handoff_topics=["010-9876-5432 연락 요청"],
    )

    payload, _ = grounding.evidence_payload(evidence, ai.strip_personal_info)

    assert "010-1234-5678" not in str(payload)
    assert "해안로 123" not in str(payload)
    assert evidence.faqs[0]["answer"] == "제주시 애월읍 해안로 123"
    assert evidence.handoff_topics == ["010-9876-5432 연락 요청"]


def test_shared_client_disables_retries(monkeypatch):
    captured = {}

    def fake_anthropic(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(anthropic, "Anthropic", fake_anthropic)

    ai._client(8)

    assert captured["timeout"] == 8
    assert captured["max_retries"] == 0


def test_provider_paths_use_20_20_8_second_timeouts(monkeypatch):
    timeouts = []

    class Messages:
        def create(self, *, system, **kwargs):
            if "상품 정보를" in system:
                raw = '{"name":"감귤"}'
            elif "상세를" in system:
                raw = '{"blocks":[]}'
            else:
                raw = (
                    '{"action":"ANSWER","answer":"선물 포장 가능합니다.",'
                    '"reason":"FAQ","sourceRefs":["farm:faq"]}'
                )
            return SimpleNamespace(content=[SimpleNamespace(type="text", text=raw)])

    def fake_client(timeout):
        timeouts.append(timeout)
        return SimpleNamespace(messages=Messages())

    monkeypatch.setattr(ai, "_client", fake_client)
    monkeypatch.setattr(ai.get_settings(), "ai_draft_timeout_seconds", 20)
    monkeypatch.setattr(ai.get_settings(), "ai_answer_timeout_seconds", 8)

    ai._call_claude("감귤")
    ai._call_detail_claude({"name": "감귤"})
    result = ai._claude_answer(
        "선물 포장 되나요?",
        Evidence(faqs=[{"question": "선물 포장 되나요?", "answer": "선물 포장 가능합니다."}]),
    )

    assert timeouts == [20, 20, 8]
    assert result is not None and result.action == "ANSWER"
