"""AC-SRC-2/3/11: option organization preserves source rows and provenance."""

from copy import deepcopy

import pytest

from app.source_analysis.source_options import assemble_options


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


HEADER = "01 가정용 감귤 3kg"


def passage(pid, body=None, *, module="composition", spans=None, heading=HEADER, **extra):
    value = heading if body is None else heading + "\n" + body
    return {
        "id": pid,
        "module": module,
        "value": value,
        "originalValue": value,
        "candidateIds": ["candidate-" + pid],
        "status": "PENDING",
        "decision": None,
        "sourceId": "source",
        "sourceRevision": 2,
        "sanitizationVersion": 3,
        "includedInDraft": True,
        "sourceExact": True,
        "evidence": [
            {
                "sourceId": "source",
                "sourceRevision": 2,
                "page": 1,
                "spanIds": spans or (["line-10"] if body is None else ["line-10", "line-11"]),
                "quote": value,
            }
        ],
        **extra,
    }


def test_AC_SRC_2_option_heading_once_source_order_and_qualifiers_preserved():
    header = passage("header")
    size = passage("size", "크기 : 중소과 (크기는 다를 수 있음)", module="specification")
    count = passage("count", "수 량 : 9~17과", module="pieceCount", spans=["line-10", "line-12"])
    packing = passage("pack", "포 장 : 벌크포장", spans=["line-10", "line-13"])
    inputs = [packing, count, header, size]
    original = deepcopy(inputs)
    groups = assemble_options(inputs)
    assert len(groups) == 1
    block = groups[0]
    assert block["module"] == "composition"
    assert block["text"]["value"] == HEADER + (
        "\n크기 : 중소과 (크기는 다를 수 있음)\n수 량 : 9~17과\n포 장 : 벌크포장"
    )
    assert block["text"]["passageIds"] == ["header", "size", "count", "pack"]
    assert block["text"]["candidateIds"] == [
        "candidate-" + p for p in ["header", "size", "count", "pack"]
    ]
    assert block["text"]["assembly"]["type"] == "SOURCE_OPTION_BLOCK"
    assert block["text"]["assembly"]["headingSpanId"] == "line-10"
    assert block["parts"][0] is header
    assert inputs == original


def test_AC_SRC_2_distinct_rows_can_prove_shared_heading_without_standalone():
    first = passage("size", "크기 : 소과")
    second = passage("pack", "포장 : 종이상자", spans=["line-10", "line-12"])
    assert assemble_options([first]) == []
    assert assemble_options([first, second])[0]["text"]["value"] == (
        HEADER + "\n크기 : 소과\n포장 : 종이상자"
    )


@pytest.mark.parametrize("heading", ["옵션 A: 가정용", "선택 2 선물형", "구성 3: 실속형"])
def test_AC_SRC_2_explicit_option_labels_do_not_require_weight(heading):
    assert (
        len(
            assemble_options(
                [passage("h", heading=heading), passage("b", "포장 : 상자", heading=heading)]
            )
        )
        == 1
    )


@pytest.mark.parametrize("heading", ["3kg", "3 kg", "크기 안내", "01 가정용 감귤"])
def test_AC_SRC_3_weight_or_unlabeled_heading_is_not_option_proof(heading):
    assert (
        assemble_options([passage("h", heading=heading), passage("b", "9~17과", heading=heading)])
        == []
    )


@pytest.mark.parametrize(
    "change", ["source", "revision", "page", "heading_span", "heading", "target", "sanitization"]
)
def test_AC_SRC_3_different_option_scope_never_merges(change):
    header, body = passage("h"), passage("b", "포장 : 상자")
    ref = body["evidence"][0]
    if change == "source":
        body["sourceId"] = ref["sourceId"] = "other"
    elif change == "revision":
        body["sourceRevision"] = ref["sourceRevision"] = 3
    elif change == "page":
        ref["page"] = 2
    elif change == "heading_span":
        ref["spanIds"] = ["line-20", "line-21"]
    elif change == "heading":
        body = passage("b", "포장 : 상자", heading="02 선물형 감귤 3kg")
    elif change == "target":
        body["targetId"] = "other-product"
    elif change == "sanitization":
        body["sanitizationVersion"] = 4
    assert assemble_options([header, body]) == []


@pytest.mark.parametrize(
    "change",
    [
        "EDIT",
        "OMIT",
        "TRANSFER_TO_SETTINGS",
        "ACCEPT_REPAIR",
        "excluded",
        "changed",
        "quote",
        "one_span",
        "order",
        "unknown_order",
        "field",
        "hidden",
    ],
)
def test_AC_SRC_3_missing_proof_or_manual_changes_are_not_regrouped(change):
    header, body = passage("h"), passage("b", "포장 : 상자")
    if change in {"EDIT", "OMIT", "TRANSFER_TO_SETTINGS", "ACCEPT_REPAIR"}:
        body["decision"] = {"action": change}
    elif change == "excluded":
        body["status"] = "EXCLUDED"
    elif change == "changed":
        body["value"] += " 수정"
    elif change == "quote":
        body["evidence"][0]["quote"] = "다른 원문"
    elif change == "one_span":
        body["evidence"][0]["spanIds"] = ["line-10"]
    elif change == "order":
        body["evidence"][0]["spanIds"] = ["line-10", "line-9"]
    elif change == "unknown_order":
        body["evidence"][0]["spanIds"] = ["line-10", "unknown"]
    elif change == "field":
        body["module"] = "farmStory"
    elif change == "hidden":
        body["includedInDraft"] = False
    assert assemble_options([header, body]) == []


def test_AC_SRC_11_keep_and_independent_size_count_rows_are_preserved():
    header = passage("h", decision={"action": "KEEP"})
    small = passage("small", "소과 : 12~20과", spans=["line-10", "line-11"])
    medium = passage("medium", "중과 : 8~11과", spans=["line-10", "line-12"])
    note = passage(
        "note",
        "농산물의 특성상 크기가 다를 수 있습니다.",
        heading="크기 안내",
        spans=["line-30", "line-31"],
    )
    block = assemble_options([header, medium, note, small])[0]
    assert block["text"]["value"] == HEADER + "\n소과 : 12~20과\n중과 : 8~11과"
    assert block["parts"] == [header, small, medium]
    assert "note" not in block["text"]["passageIds"]


def test_AC_SRC_3_overlapping_or_interleaved_body_spans_are_ambiguous():
    header = passage("h")
    first = passage("first", "크기 : 소과\n수량 : 12~20과", spans=["line-10", "line-11", "line-13"])
    second = passage("second", "포장 : 상자", spans=["line-10", "line-12"])
    assert assemble_options([header, first, second]) == []
    second["evidence"][0]["spanIds"] = ["line-10", "line-13"]
    assert assemble_options([header, first, second]) == []


def test_AC_SRC_2_repeated_identical_heading_at_different_source_positions_stays_separate():
    first = [passage("h1"), passage("b1", "수량 : 12~20과")]
    second = [
        passage("h2", spans=["line-20"]),
        passage("b2", "수량 : 8~11과", spans=["line-20", "line-21"]),
    ]
    groups = assemble_options(first + second)
    assert len(groups) == 2
    assert [g["text"]["passageIds"] for g in groups] == [["h1", "b1"], ["h2", "b2"]]
    assert [g["text"]["value"] for g in groups] == [
        HEADER + "\n수량 : 12~20과",
        HEADER + "\n수량 : 8~11과",
    ]


def test_AC_SRC_3_conflicting_literal_headers_for_same_span_are_not_proof():
    rows = [passage("h1"), passage("b1", "포장 : 상자")]
    rows += [
        passage("h2", heading="02 선물형 감귤 3kg"),
        passage(
            "b2", "포장 : 개별포장", heading="02 선물형 감귤 3kg", spans=["line-10", "line-12"]
        ),
    ]
    assert assemble_options(rows) == []


@pytest.mark.parametrize("heading", ["실속 포장 4kg", "선물 상자 5kg", "Home pack 2.5kg"])
def test_AC_SRC_2_named_weight_options_include_delivery_packing(heading):
    header = passage("h", heading=heading)
    size = passage("size", "크기 : 중과", heading=heading)
    packing = passage(
        "pack",
        "포장 : 종이상자 (완충재 포함)",
        heading=heading,
        module="delivery",
        spans=["line-10", "line-12"],
    )
    block = assemble_options([packing, header, size])[0]
    assert block["text"]["value"] == heading + "\n크기 : 중과\n포장 : 종이상자 (완충재 포함)"
    assert block["parts"] == [header, size, packing]


@pytest.mark.parametrize(
    "heading",
    [
        "총 3kg",
        "전체 3kg",
        "합계 3kg",
        "중량 3kg",
        "무게 3kg",
        "전체 중량 3kg",
        "감귤입니다. 3kg",
        "설명! 3kg",
        "가" * 61 + " 3kg",
    ],
)
def test_AC_SRC_3_generic_totals_and_sentences_are_not_named_options(heading):
    assert (
        assemble_options(
            [passage("h", heading=heading), passage("b", "포장 : 상자", heading=heading)]
        )
        == []
    )


def test_AC_SRC_2_named_weight_suboption_rows_keep_independent_body_lines():
    heading = "선물 포장 4kg"
    rows = [
        passage("h", heading=heading),
        passage(
            "small",
            "소과 2kg\n수량 : 12~20과",
            heading=heading,
            spans=["line-10", "line-11", "line-12"],
        ),
        passage(
            "medium",
            "중과 2kg\n수량 : 8~11과",
            heading=heading,
            spans=["line-10", "line-13", "line-14"],
        ),
    ]
    block = assemble_options(rows)[0]
    assert block["text"]["value"] == heading + "\n소과 2kg\n수량 : 12~20과\n중과 2kg\n수량 : 8~11과"
    assert block["text"]["passageIds"] == ["h", "small", "medium"]
