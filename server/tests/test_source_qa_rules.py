"""DEV-452 QA 11/28: rules found by running the whole combined flow on real farm material.

Synthetic sentences only; they reproduce the shapes seen in the material (no farm text).
"""

from app.source_analysis.review_prompts import prompts_for
from app.source_analysis.source_preserving import build_plan, weight_conflict


def _cand(cid, quote, field):
    return {
        "id": cid,
        "targetId": "t",
        "fieldKey": field,
        "value": quote,
        "historical": False,
        "evidence": [
            {"sourceId": "s", "sourceRevision": 1, "page": 1, "spanIds": [cid], "quote": quote}
        ],
    }


def _plan(rows, **inputs):
    plan = build_plan(
        {"id": "t", "name": "황금향"},
        [_cand(f"c{i}", quote, field) for i, (quote, field) in enumerate(rows)],
        source_versions={"s": {"revision": 1, "sanitizationVersion": 1}},
        **inputs,
    )
    return {p["originalValue"]: p for p in plan["passages"]}


def test_AC_SRC_10_a_material_box_size_the_sale_options_do_not_have_stays_off_the_page():
    assert weight_conflict("3kg, 5kg, 10kg", (3.0, 5.0))
    assert not weight_conflict("황금향 3kg", (3.0, 5.0))
    assert not weight_conflict("3kg, 5kg", (3.0, 5.0))
    by = _plan(
        [("3kg, 5kg, 10kg", "composition"), ("황금향 5kg", "composition")],
        input_weights=(3.0, 5.0),
        input_labels=("3kg", "5kg"),
    )
    assert by["3kg, 5kg, 10kg"]["inputPreferred"] == "WEIGHT"
    assert by["3kg, 5kg, 10kg"]["status"] == "EXCLUDED"
    assert by["황금향 5kg"]["includedInDraft"]


def test_AC_SRC_3_a_past_sale_closing_notice_starts_off_the_page():
    rows = [
        ("판매가 올해 종료되었습니다", "farmStory"),
        ("내년에도 좋은 상품으로 찾아뵙겠습니다.", "farmStory"),
        ("조기 품절될 수 있어요.", "delivery"),
        ("껍질이 얇아요.", "taste"),
    ]
    by = _plan(rows)
    for ended in rows[:2]:
        passage = by[ended[0]]
        assert passage["status"] == "EXCLUDED" and not passage["includedInDraft"]
        assert "SALE_ENDED" in passage["reasonCodes"]["OWNER_CONFIRMATION"]
    # A current scarcity note is not a past sale's notice.
    assert "SALE_ENDED" not in by["조기 품절될 수 있어요."]["reasonCodes"]["OWNER_CONFIRMATION"]
    assert by["껍질이 얇아요."]["includedInDraft"]
    [prompt] = [
        q
        for q in prompts_for("판매가 올해 종료되었습니다", {"OWNER_CONFIRMATION": ["SALE_ENDED"]})
        if q["code"] == "SALE_ENDED"
    ]
    assert "지난 판매" in prompt["question"]


def test_AC_SRC_3_another_sellers_brand_introduction_asks_the_owner():
    by = _plan(
        [
            ("이곳은 청년들이 만든 유통 브랜드입니다", "summary"),
            ("청년 MD가 직접 엄선합니다.", "summary"),
            ("저희 농장 귤은 하나하나 엄선합니다.", "summary"),
        ]
    )
    brand = by["이곳은 청년들이 만든 유통 브랜드입니다"]
    assert "OTHER_SELLER" in brand["reasonCodes"]["OWNER_CONFIRMATION"]
    assert by["청년 MD가 직접 엄선합니다."]["reviewPending"]
    assert not by["저희 농장 귤은 하나하나 엄선합니다."]["reviewPending"]
    questions = [q["question"] for q in prompts_for("x", {"OWNER_CONFIRMATION": ["OTHER_SELLER"]})]
    assert any("다른 판매처" in q for q in questions)


def test_AC_SRC_10_an_order_time_shipping_promise_follows_the_delivery_window():
    rows = [
        ("오전 6시 이전 입금 주문건은 당일 발송이 원칙입니다.", "delivery"),
        ("금요일 오후 주문건은 월요일에 발송됩니다.", "delivery"),
        ("발송 후 1~3일 안에 받으실 수 있습니다.", "delivery"),
    ]
    by = _plan(rows, input_months=(12,))
    for promise in rows[:2]:
        assert by[promise[0]]["inputPreferred"] == "SEASON"
        assert by[promise[0]]["status"] == "EXCLUDED"
    # Transit time after shipping does not contradict a pre-order; it is only checked.
    transit = by["발송 후 1~3일 안에 받으실 수 있습니다."]
    assert transit["status"] != "EXCLUDED" and "inputPreferred" not in transit
    # Without a delivery window there is nothing to prefer; the sentence is only checked.
    assert "inputPreferred" not in _plan(rows[:1])[rows[0][0]]


def test_AC_SRC_3_a_liability_line_is_a_terms_question_not_a_shipping_one():
    line = "수령 후 잘못된 보관으로 생긴 문제는 책임지지 않습니다."
    owner = _plan([(line, "storage")])[line]["reasonCodes"]["OWNER_CONFIRMATION"]
    assert "PAYMENT_OR_RETURN_TERMS" in owner
    assert "DISPATCH_OR_DELIVERY" not in owner


def test_AC_SRC_3_a_sentence_read_twice_is_kept_once_without_a_question():
    line = "해마다 겨울이면 부모님 일손을 도와 드렸습니다."
    plan = build_plan(
        {"id": "t", "name": "카라향"},
        [
            _cand("a", line, "farmStory"),
            _cand("b", line, "farmStory"),
            _cand("c", "껍질이 얇아요.", "taste"),
        ],
        source_versions={"s": {"revision": 1, "sanitizationVersion": 1}},
    )
    first, second = [p for p in plan["passages"] if p["originalValue"] == line]
    assert first["includedInDraft"] and not first["reviewPending"]
    assert "EXACT_REPETITION" not in first["reasonCodes"]["COPY_EDIT"]
    assert second["status"] == "EXCLUDED" and second["duplicateOf"] == first["id"]
    assert not second["reviewPending"]


def test_AC_SRC_3_time_questions_use_the_right_particle():
    def question(value):
        return prompts_for(value, {"OWNER_CONFIRMATION": ["RELATIVE_TIME"]})[0]["question"]

    assert question("조만간 꽃이 핍니다.").startswith("‘조만간’은 ")
    assert question("올해도 맛있어요.").startswith("‘올해’는 ")


def test_AC_SRC_10_a_short_shipping_fee_line_follows_the_sale_settings():
    rows = [
        ("무료배송", "delivery"),
        ("배송 택배(주문 시 결제)", "delivery"),
        (
            "수확 다음 날 정성껏 포장해서 보내드리며 전국 무료배송으로 받아 보실 수 있어요.",
            "delivery",
        ),
    ]
    by = _plan(rows, input_prices=True)
    for fee in rows[:2]:
        assert by[fee[0]]["inputPreferred"] == "PRICE" and by[fee[0]]["status"] == "EXCLUDED"
    # A longer sentence says more than the fee; it stays and is only checked.
    assert by[rows[2][0]]["status"] != "EXCLUDED"
    # Without sale settings the line is kept and only checked.
    assert "inputPreferred" not in _plan(rows[:1])["무료배송"]
