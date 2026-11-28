"""Invented, source-bound presentation admission; no DB or provider calls."""

from copy import deepcopy

import pytest

from app.ai.source_assembly import AssemblyOutput
from app.source_analysis.presentation_plan import admit, content_hash, prepare
from app.source_analysis.source_preserving import build_plan

TARGET = {"id": "target-test", "name": "산들 감귤"}
VERSIONS = {"source-test": {"revision": 1, "sanitizationVersion": 2}}


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


def candidate(cid, text, module="summary", *, historical=False):
    return {
        "id": cid,
        "targetId": TARGET["id"],
        "fieldKey": module,
        "value": text,
        "historical": historical,
        "evidence": [
            {
                "sourceId": "source-test",
                "sourceRevision": 1,
                "page": 1,
                "spanIds": [f"line-{cid}"],
                "quote": text,
            }
        ],
    }


def base_plan(items=None, *, decisions=()):
    if items is None:
        items = [
            candidate("one", "제주에서 키운 감귤입니다."),
            candidate("two", "껍질이 얇습니다.", "taste"),
        ]
    return build_plan(TARGET, items, source_versions=VERSIONS, decisions=decisions)


def output_for(base, *, groups=None, exclusions=None):
    row = prepare(base, TARGET)
    if groups is None:
        modules = {}
        for text in row["texts"]:
            modules.setdefault(text["module"], []).append(
                {
                    "value": text["value"],
                    "textIds": [text["id"]],
                    "editingNotes": [],
                }
            )
        values = [{"module": key, "texts": texts} for key, texts in modules.items()]
    else:
        values = groups
    return AssemblyOutput.model_validate({"modules": values, "excluded": exclusions or []})


def rendered(plan):
    return "\n".join(text["value"] for module in plan["modules"] for text in module["texts"])


def test_AC_SRC_2_prepare_has_complete_input_and_source_flag_bindings():
    base = base_plan(
        [
            candidate("one", "지난해 4kg 상품입니다.", historical=True),
            candidate("two", "껍질이 얇습니다."),
        ]
    )
    row = prepare(base, TARGET)
    assert row["target"] == TARGET
    assert len(row["texts"]) == sum(len(m["texts"]) for m in base["modules"])
    assert len({t["id"] for t in row["texts"]}) == len(row["texts"])
    expected = {p["id"] for p in base["passages"] if p["includedInDraft"]}
    assert {pid for t in row["texts"] for pid in t["passageIds"]} == expected
    assert any("DATED_OR_HISTORICAL" in t["ownerFlags"] for t in row["texts"])


def test_AC_SRC_2_admission_is_a_copy_and_preserves_original_review_evidence():
    base = base_plan()
    original = deepcopy(base)
    result = admit(base, TARGET, output_for(base))
    assert base == original
    assert result is not base
    assert result["passages"] == original["passages"]
    assert result["accounting"] == original["accounting"]
    assert result["requiresContentReview"] is True
    assert result["semanticAccuracyEstablished"] is False
    assert rendered(result) == rendered(base)


@pytest.mark.parametrize("mutation", ["missing", "unknown", "repeated", "exclude"])
def test_AC_SRC_3_bad_id_accounting_falls_back_without_dropping_input(mutation):
    base = base_plan()
    raw = output_for(base).model_dump(by_alias=True)
    first = raw["modules"][0]["texts"][0]
    if mutation == "missing":
        raw["modules"][0]["texts"].clear()
    elif mutation == "unknown":
        first["textIds"] = ["not-an-input-id"]
    elif mutation == "repeated":
        raw["modules"][0]["texts"].append(deepcopy(first))
    else:
        raw["modules"][0]["texts"].clear()
        raw["excluded"] = [
            {
                "textIds": first["textIds"],
                "reason": "UNSUPPORTED",
                "explanation": "모델 판단",
                "supportedByTextIds": [],
            }
        ]
    result = admit(base, TARGET, AssemblyOutput.model_validate(raw))
    assert result["modules"] == base["modules"]
    assert result["presentation"]["status"] == "FALLBACK"
    assert result["passages"] == base["passages"]


@pytest.mark.parametrize(
    "source,changed",
    [
        ("왁싱은 하지 않습니다.", "왁싱을 합니다."),
        ("농부가 방에 있습니다.", "농부 가방에 있습니다."),
        ("약 8~12과이며 크기에 따라 다를 수 있습니다.", "8~12과입니다."),
        ("개수는 확인되지 않았습니다.", "개수는 충분합니다."),
        ("다른 지역보다 늦게 익을 수 있습니다.", "다른 지역보다 빨리 익습니다."),
    ],
)
def test_AC_SRC_10_semantic_rewrite_uses_baseline_wording(source, changed):
    base = base_plan([candidate("one", source)])
    raw = output_for(base).model_dump(by_alias=True)
    raw["modules"][0]["texts"][0]["value"] = changed
    result = admit(base, TARGET, AssemblyOutput.model_validate(raw))
    assert rendered(result) == source
    assert result["presentation"]["baselineWordingRetained"] >= 1
    assert result["passages"] == base["passages"]


def test_AC_SRC_3_same_numeric_set_cannot_swap_option_relationships():
    source = "선물용 4kg 9~16과 42,000원\n가정용 7kg 20~30과 59,000원"
    base = base_plan([candidate("one", source, "composition")])
    raw = output_for(base).model_dump(by_alias=True)
    raw["modules"][0]["texts"][0]["value"] = (
        "선물용 4kg 20~30과 59,000원\n가정용 7kg 9~16과 42,000원"
    )
    result = admit(base, TARGET, AssemblyOutput.model_validate(raw))
    assert rendered(result) == source
    assert result["presentation"]["baselineWordingRetained"] >= 1
    assert result["passages"] == base["passages"]


def test_AC_SRC_10_numeric_unit_spacing_is_allowed_without_losing_source_flags():
    base = base_plan([candidate("one", "평균 13브릭 스 이상의 단맛입니다.")])
    raw = output_for(base).model_dump(by_alias=True)
    raw["modules"][0]["texts"][0]["value"] = "평균 13브릭스 이상의 단맛입니다."
    result = admit(base, TARGET, AssemblyOutput.model_validate(raw))
    assert rendered(result) == "평균 13브릭스 이상의 단맛입니다."
    assert result["passages"] == base["passages"]


def test_AC_SRC_10_nonadjacent_related_blocks_can_group_without_claiming_intervening_text():
    base = base_plan(
        [
            candidate("a", "바람을 맞고 자랐습니다."),
            candidate("b", "껍질이 얇습니다.", "appearanceFaq"),
            candidate("c", "수확 후 골라 담습니다.", "productionProcess"),
        ]
    )
    texts = prepare(base, TARGET)["texts"]
    by_value = {t["value"]: t for t in texts}
    first, middle, last = [
        by_value[value]
        for value in ["바람을 맞고 자랐습니다.", "껍질이 얇습니다.", "수확 후 골라 담습니다."]
    ]
    groups = [
        {
            "module": "productionProcess",
            "texts": [
                {
                    "value": first["value"] + " " + last["value"],
                    "textIds": [first["id"], last["id"]],
                    "editingNotes": [],
                }
            ],
        },
        {
            "module": "appearanceFaq",
            "texts": [{"value": middle["value"], "textIds": [middle["id"]], "editingNotes": []}],
        },
    ]
    result = admit(base, TARGET, output_for(base, groups=groups))
    merged = next(m for m in result["modules"] if m["module"] == "productionProcess")["texts"]
    assert any(t["value"] == first["value"] + " " + last["value"] for t in merged)
    assert result["passages"] == base["passages"]
    assert result["planHash"] != base["planHash"]
    assert result["presentation"]["status"] == "APPLIED"


def test_AC_SRC_10_historical_narrative_cannot_reverse_original_order_or_module():
    base = base_plan(
        [
            candidate("a", "당시 온라인 판매를 시작했습니다.", "farmStory", historical=True),
            candidate("b", "그 인연이 지금까지 이어집니다.", "farmStory", historical=True),
        ]
    )
    texts = prepare(base, TARGET)["texts"]
    groups = [
        {
            "module": "summary",
            "texts": [
                {
                    "value": " ".join(t["value"] for t in reversed(texts)),
                    "textIds": [t["id"] for t in reversed(texts)],
                    "editingNotes": [],
                }
            ],
        }
    ]
    result = admit(base, TARGET, output_for(base, groups=groups))
    assert {m["module"] for m in result["modules"]} == {"farmStory"}
    value = rendered(result)
    assert value.index("당시 온라인 판매를 시작했습니다.") < value.index(
        "그 인연이 지금까지 이어집니다."
    )
    assert result["passages"] == base["passages"]


def test_AC_SRC_11_hash_ignores_acknowledgment_but_tracks_words_module_and_source_binding():
    base = base_plan([candidate("a", "지난해 수확한 감귤입니다.", historical=True)])
    digest = content_hash(base, TARGET)
    acknowledged = deepcopy(base)
    p = acknowledged["passages"][0]
    p["decision"] = {"action": "KEEP", "note": "현재성 확인"}
    p["status"], p["reviewPending"] = "READY", False
    assert content_hash(acknowledged, TARGET) == digest
    for mutation in ["wording", "module", "binding"]:
        changed = deepcopy(base)
        if mutation == "wording":
            changed["modules"][0]["texts"][0]["value"] = "다른 문구입니다."
        elif mutation == "module":
            changed["modules"][0]["module"] = "taste"
        else:
            changed["passages"][0]["bindingHash"] = "new-source-binding"
        assert content_hash(changed, TARGET) != digest


def test_AC_SRC_11_presentation_overflow_returns_complete_baseline():
    base = base_plan([candidate("a", "가" * 1600, "summary"), candidate("b", "나" * 1600, "taste")])
    texts = prepare(base, TARGET)["texts"]
    groups = [
        {
            "module": "summary",
            "texts": [
                {
                    "value": " ".join(t["value"] for t in texts),
                    "textIds": [t["id"] for t in texts],
                    "editingNotes": [],
                }
            ],
        }
    ]
    result = admit(base, TARGET, output_for(base, groups=groups))
    assert result["modules"] == base["modules"]
    assert result["presentation"]["status"] == "FALLBACK"
    assert result["passages"] == base["passages"]


def test_AC_SRC_11_actual_keep_acknowledgment_reuses_content_without_clearing_flags():
    items = [candidate("a", "지난해 4kg 상자입니다.", historical=True)]
    base = base_plan(items)
    acknowledged = base_plan(
        items,
        decisions=[
            {
                "bindingHash": base["passages"][0]["bindingHash"],
                "action": "KEEP",
                "note": "생산자가 원문 시점을 확인했습니다.",
            }
        ],
    )
    assert content_hash(acknowledged, TARGET) == content_hash(base, TARGET)
    result = admit(acknowledged, TARGET, output_for(base))
    text = result["modules"][0]["texts"][0]
    assert "DATED_OR_HISTORICAL" in text["inheritedOwnerFlags"]
    assert result["passages"] == acknowledged["passages"]
    assert result["passages"][0]["decision"]["action"] == "KEEP"


def test_AC_SRC_5_grouped_presentation_inherits_union_of_all_original_reviews():
    base = base_plan(
        [
            candidate("a", "올해 발송하는 상품입니다.", "delivery"),
            candidate("b", "도서 지역 배송비는 4,000원입니다.", "delivery"),
        ]
    )
    texts = prepare(base, TARGET)["texts"]
    groups = [
        {
            "module": "delivery",
            "texts": [
                {
                    "value": " ".join(t["value"] for t in texts),
                    "textIds": [t["id"] for t in texts],
                    "editingNotes": [],
                }
            ],
        }
    ]
    result = admit(base, TARGET, output_for(base, groups=groups))
    text = result["modules"][0]["texts"][0]
    assert set(text["inheritedOwnerFlags"]) == {f for t in texts for f in t["ownerFlags"]}
    assert set(text["inheritedOwnerFlags"]) >= {
        "RELATIVE_TIME",
        "PRICE_OR_FEE",
        "MONEY_AMOUNT",
        "DISPATCH_OR_DELIVERY",
    }
    assert result["passages"] == base["passages"]
    assert result["summary"]["reviewPending"] == base["summary"]["reviewPending"]


@pytest.mark.parametrize("single_text", [True, False])
def test_AC_SRC_11_grouping_cannot_exceed_save_field_candidate_limit(single_text):
    base = base_plan(
        [
            candidate(f"entry-{i}", f"합성 설명 {i}입니다.", "summary" if i < 51 else "taste")
            for i in range(102)
        ]
    )
    row = prepare(base, TARGET)
    assert all(
        len({cid for t in m["texts"] for cid in t["candidateIds"]}) <= 100 for m in base["modules"]
    )
    texts = (
        [
            {
                "value": "\n\n".join(t["value"] for t in row["texts"]),
                "textIds": [t["id"] for t in row["texts"]],
                "editingNotes": [],
            }
        ]
        if single_text
        else [{"value": t["value"], "textIds": [t["id"]], "editingNotes": []} for t in row["texts"]]
    )
    result = admit(base, TARGET, output_for(base, groups=[{"module": "summary", "texts": texts}]))
    assert result["presentation"]["status"] == "FALLBACK"
    assert result["modules"] == base["modules"]
    assert result["passages"] == base["passages"]
    from app.source_analysis.refinement import fields
    from app.source_analysis.schemas import FieldReview

    for key, field in fields(result["modules"]).items():
        FieldReview.model_validate(
            {
                "targetId": TARGET["id"],
                "fieldKey": key,
                "value": field["value"],
                "state": "UNREVIEWED",
                "provenance": "REFINED",
                "candidateIds": field["candidateIds"],
                "photoAssetIds": [],
                "illustrationId": None,
            }
        )
