"""DEV-31 AI grounding and provider adapter regressions."""

import json
from types import SimpleNamespace

import anthropic

from app.ai import grounding
from app.ai import service as ai
from app.ai.schemas import DraftExtraction, Evidence


def test_P02_AC_03_1_korean_units_and_field_grounding():
    grounded = grounding.ground_draft(
        "하우스 감귤 5.0키로, 당도 12.5브릭스, 배송은 12월 11일~20일입니다.",
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


def test_P02_AC_03_1_weight_options_match_exact_values_not_substrings():
    grounded = grounding.ground_draft(
        "하우스 감귤 15키로 박스", DraftExtraction(options=["5kg", "15kg", "15 KG"])
    )

    assert grounded.options == ["15kg", "15 KG"]


def test_P02_AC_03_1_brix_matches_exact_value_not_substring():
    source = "당도 12브릭스, 12.5 brix 선별"

    assert grounding.ground_draft(source, DraftExtraction(expected_brix=2.0)).expected_brix is None
    assert grounding.ground_draft(source, DraftExtraction(expected_brix=2.5)).expected_brix is None
    assert grounding.ground_draft(source, DraftExtraction(expected_brix=12)).expected_brix == 12
    assert grounding.ground_draft(source, DraftExtraction(expected_brix=12.5)).expected_brix == 12.5


def test_P02_AC_03_1_brix_ignores_numbers_with_other_units_after_brix_word():
    source = "당도 12브릭스 5키로 박스, Brix 13 선별, 당도 높은 3박스"

    assert grounding.ground_draft(source, DraftExtraction(expected_brix=5)).expected_brix is None
    assert grounding.ground_draft(source, DraftExtraction(expected_brix=3)).expected_brix is None
    assert grounding.ground_draft(source, DraftExtraction(expected_brix=13)).expected_brix == 13


def test_P02_AC_03_1_delivery_window_uses_only_delivery_clauses():
    source = "수확은 12월 1일에 하고, 배송은 12월 15일~20일이에요."

    harvest = grounding.ground_draft(source, DraftExtraction(delivery_window="12월 1일"))
    delivery = grounding.ground_draft(source, DraftExtraction(delivery_window="12월 15일~20일"))

    assert harvest.delivery_window is None
    assert delivery.delivery_window == "12월 15일~20일"


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


# DEV-47: Railway에서 Claude가 ANSWER로 낸 비답변(내부 테스트 A-10).
# 근거가 없으면 전달한다(FEAT-13 정상 흐름 3).
RAILWAY_NON_ANSWERS = [
    "죄송하지만, 제공된 정보에 원산지가 명시되어 있지 않습니다. 상품명은 '하우스 감귤'이고, "
    "당도(Brix) 등의 품질 정보는 있으나 원산지 정보는 확인할 수 없습니다.",
    "죄송하지만, 제공된 등록 정보에 원산지 데이터가 없어서 정확히 안내해드릴 수 없습니다. "
    "판매자에게 직접 확인해주시기 바랍니다.",
    "죄송하지만, 제공된 제품 정보에 원산지에 대한 내용이 없어 답변드릴 수 없습니다. "
    "자세한 원산지 정보는 판매자에게 직접 문의해주시기 바랍니다.",
    "해당 상품은 5kg 또는 10kg 두 가지 용량으로 제공됩니다. "
    "더 자세한 크기 정보(예: 박스 규격)는 근거에 없습니다.",
]


def test_C06_FEAT_13_model_non_answers_are_detected():
    for answer in RAILWAY_NON_ANSWERS:
        assert grounding.is_non_answer(answer), answer
    for answer in [
        "하우스 감귤 5kg / 10kg입니다.",
        "선물 포장 가능합니다.",
        "무료배송이에요. 도서산간은 추가 운임 3,000원이 붙어요.",
        "예상 당도는 12Brix이고 실측값은 아직 없어요.",
        "12월 15일 ~ 12월 20일에 받을 예정이에요.",
    ]:
        assert not grounding.is_non_answer(answer), answer


def _fake_claude_answering(monkeypatch, answer):
    """보낸 근거의 첫 sourceRef를 인용해 ANSWER를 돌려주는 가짜 Claude."""

    class Messages:
        def create(self, *, messages, **kwargs):
            content = messages[0]["content"]
            payload = json.loads(content[len("근거: ") : content.index("\n질문: ")])
            ref = payload["evidence"][0]["sourceRef"]
            raw = json.dumps(
                {"action": "ANSWER", "answer": answer, "reason": "근거", "sourceRefs": [ref]},
                ensure_ascii=False,
            )
            return SimpleNamespace(content=[SimpleNamespace(type="text", text=raw)])

    monkeypatch.setattr(ai, "_client", lambda timeout: SimpleNamespace(messages=Messages()))


def test_C06_FEAT_13_model_non_answer_becomes_handoff(monkeypatch):
    evidence = Evidence(
        product_id="p-house", product_name="하우스 감귤 5kg / 10kg", measured_brix=11.8
    )

    for answer in RAILWAY_NON_ANSWERS:
        _fake_claude_answering(monkeypatch, answer)
        result = ai._claude_answer("원산지가 어디예요?", evidence)
        assert result is not None and result.action == "HANDOFF", answer
        assert result.answer is None

    _fake_claude_answering(monkeypatch, "하우스 감귤 5kg / 10kg입니다.")
    result = ai._claude_answer("이 상품 이름이 정확히 뭐예요?", evidence)
    assert result is not None and result.action == "ANSWER"
