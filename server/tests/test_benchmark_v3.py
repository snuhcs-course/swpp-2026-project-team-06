"""DEV-452 source-copy benchmark v3 scorer. Invented examples only; no gold or farm text."""

from app.source_analysis.benchmark_v3 import aggregate, fact_label, score_case, setup_inputs


def fact(fid, words, critical=False, statement=""):
    return {"id": fid, "mustContain": words, "critical": critical, "statement": statement}


def passage(value, status="READY", pending=False, **extra):
    return {
        "value": value,
        "originalValue": value,
        "status": status,
        "reviewPending": pending,
        **extra,
    }


def test_AC_SRC_10_fact_labels_follow_settings_and_past_sale_rules():
    option = {"module": "composition", "text": ""}
    assert fact_label(fact("a", ["5kg"]), option) == "settings"
    assert fact_label(fact("b", ["12월"]), {"module": "delivery", "text": ""}) == "settings"
    assert fact_label(fact("c", ["5kg", "20~25과"]), option) == "page"
    # PM 11/28: a harvest season in the story and a fruit-size spec stay page text.
    assert (
        fact_label(fact("h", ["12월", "2월"]), {"module": "productionProcess", "text": ""})
        == "page"
    )
    assert fact_label(fact("z", ["500g"]), {"module": "specification", "text": ""}) == "page"
    assert fact_label(fact("d", ["껍질이 얇"])) == "page"
    assert fact_label(fact("e", ["종료"], statement="판매가 올해 종료되었습니다")) == "removed"


def test_AC_SRC_10_setup_inputs_take_box_options_and_delivery_months():
    gold = {
        "sentences": [
            {"module": "composition", "facts": [fact("a", ["3kg", "5kg"]), fact("b", ["200g"])]},
            {"module": "delivery", "facts": [fact("c", ["12월"])]},
            {"module": "taste", "facts": [fact("d", ["10kg"])]},
        ]
    }
    setup = setup_inputs(gold)
    # 200g is a fruit, not a box; a weight outside the option lines is not an option.
    assert setup["input_weights"] == (3.0, 5.0)
    assert setup["input_labels"] == ("3kg", "5kg")
    assert setup["input_months"] == (12,) and setup["input_prices"] is True


def test_AC_SRC_10_scores_completeness_views_removals_and_forbidden():
    gold = {
        "sentences": [
            {"module": "taste", "facts": [fact("t", ["껍질이 얇"], critical=True)]},
            {"module": "composition", "facts": [fact("w", ["5kg"])]},
            {"module": "storage", "facts": [fact("s", ["서늘한 곳"])]},
            {
                "module": "farmStory",
                "facts": [fact("e", ["종료"], statement="판매가 종료되었습니다")],
            },
        ],
        "forbidden": [{"kind": "platform", "text": "스마트스토어"}],
    }
    plan = {
        "modules": [
            {"module": "taste", "texts": [{"value": "껍질이 얇아요. 스마트스토어에서도 팔아요."}]}
        ],
        "passages": [
            passage("껍질이 얇아요."),
            # A page fact removed by a rule: available to the owner, not on the page.
            passage("서늘한 곳에 두세요.", status="EXCLUDED"),
            passage("판매가 종료되었습니다", status="EXCLUDED"),
        ],
    }
    setup = {
        "input_prices": True,
        "input_weights": (5.0,),
        "input_labels": ("5kg",),
        "input_months": (),
    }
    scores = score_case(
        gold,
        plan,
        setup,
        source_text="껍질이 얇아요. 스마트스토어에서도 팔아요. 서늘한 곳에 두세요.",
    )
    assert scores["facts"] == 3 and scores["on_page"] == 2 and scores["available"] == 3
    assert scores["critical_facts"] == 1 and scores["critical_on_page"] == 1
    assert scores["wrong_removals"] == 1 and scores["missed_removals"] == 0
    assert scores["forbidden_unasked"] == 1 and scores["forbidden_platform"] == 1
    assert scores["untraceable"] == 0 and scores["unsupported_numbers"] == 0
    # The same forbidden text under an owner question is not counted.
    plan["passages"][0] = passage("껍질이 얇아요. 스마트스토어에서도 팔아요.", pending=True)
    assert score_case(gold, plan, setup)["forbidden_unasked"] == 0
    totals = aggregate([("text", scores)])["total"]
    assert totals["available_rate"] == 1.0 and totals["on_page_rate"] == round(2 / 3, 4)


def test_AC_SRC_10_untraceable_sentences_and_unsupported_numbers_are_counted():
    gold = {"sentences": []}
    plan = {
        "modules": [
            {"module": "taste", "texts": [{"value": "당도가 13브릭스예요. 새로 쓴 문장이에요."}]}
        ]
    }
    setup = {"input_prices": True, "input_weights": (), "input_labels": (), "input_months": ()}
    scores = score_case(gold, plan, setup, source_text="당도가 12브릭스예요.")
    assert scores["sentences"] == 2 and scores["untraceable"] == 2
    assert scores["unsupported_numbers"] == 1


def test_AC_SRC_10_only_serious_claims_and_real_leaks_count_as_forbidden():
    from app.source_analysis.benchmark_v3 import forbidden_counted

    assert not forbidden_counted({"kind": "health", "text": "건강한 과일입니다."})
    assert forbidden_counted({"kind": "health", "text": "감기 예방에 좋아요."})
    assert not forbidden_counted({"kind": "unsupported", "text": "우리 마을 감귤이 으뜸입니다."})
    assert forbidden_counted({"kind": "unsupported", "text": "세계 최고 당도를 100% 보장합니다."})
    assert not forbidden_counted({"kind": "pii", "text": "농부 [개인명 가림]입니다."})
    assert not forbidden_counted({"kind": "platform", "text": "x", "counted": False})
    assert forbidden_counted({"kind": "other_product", "text": "비트칩"})


def test_AC_SRC_10_a_past_price_note_is_labelled_removed():
    note = {"module": "historicalSales", "text": "지난해 판매 기록: 감귤 5kg 20000원 행사."}
    assert fact_label(fact("h", ["지난해 판매 기록"]), note) == "removed"
    # Gold may keep the note without its amount; the farm's selling story stays on the page.
    no_amount = {
        "module": "historicalSales",
        "text": "지난해 판매 기록: 감귤 5kg 행사이며 현재 가격이 아닙니다.",
    }
    assert fact_label(fact("h2", ["현재 가격이 아닙니다"]), no_amount) == "removed"
    story = {"module": "historicalSales", "text": "15년 전 온라인 오픈 마켓에서 감귤을 판매했고"}
    assert fact_label(fact("s", ["15년 전"]), story) == "page"
