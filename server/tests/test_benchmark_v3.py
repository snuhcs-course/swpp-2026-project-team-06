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
    assert fact_label(fact("a", ["5kg"])) == "settings"
    assert fact_label(fact("b", ["12월"])) == "settings"
    assert fact_label(fact("c", ["5kg", "20~25과"])) == "page"
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
