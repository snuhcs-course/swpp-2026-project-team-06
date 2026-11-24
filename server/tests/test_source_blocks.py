"""AC-SRC-2/3/5: loss-visible block materialization, invented data only."""

from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.ai.source_blocks import BLOCK_PROMPT, BlockExtraction, materialize_blocks
from app.source_analysis.schemas import Extraction


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


TARGETS = [{"id": "product", "name": "합성 감귤"}]


def source(*texts):
    return {
        "sourceId": "source",
        "sourceRevision": 3,
        "pages": [
            {"number": 1, "spans": [{"id": f"s{i}", "text": text} for i, text in enumerate(texts)]}
        ],
    }


def block(bid="b", spans=("s0",), *, target="product", field="summary", kind="PARAGRAPH", **extra):
    return {
        "id": bid,
        "kind": kind,
        "targetId": target,
        "fieldKey": field,
        "historical": False,
        "refs": [{"page": 1, "spanIds": list(spans)}],
        "reviewReasons": [],
        **extra,
    }


def run(chunk, blocks=(), exclusions=()):
    return materialize_blocks(
        {"blocks": list(blocks), "exclusions": list(exclusions)}, chunk, TARGETS
    )


def exclusion(sid="s0", reason="DECORATIVE", duplicate=None):
    return {"page": 1, "spanId": sid, "reason": reason, "duplicateOf": duplicate}


def test_AC_SRC_2_paragraph_exact_source_order_and_candidate_compatibility():
    chunk = source("재배 과정:", "바람을 막아 길렀으며", "수량은 아직 미확정입니다.")
    original = deepcopy(chunk)
    response = {
        "blocks": [block(spans=("s0", "s1", "s2"), field="productionProcess")],
        "exclusions": [],
    }
    output = materialize_blocks(BlockExtraction.model_validate(response), chunk, TARGETS)
    assert (
        output["candidates"][0]["value"]
        == "재배 과정:\n바람을 막아 길렀으며\n수량은 아직 미확정입니다."
    )
    assert output["candidates"][0]["evidence"] == [
        {
            "sourceId": "source",
            "sourceRevision": 3,
            "page": 1,
            "spanIds": ["s0", "s1", "s2"],
            "quote": output["candidates"][0]["value"],
        }
    ]
    assert all(not findings for findings in output["coverage"].values())
    assert Extraction.model_validate({"candidates": output["candidates"], "photoRequests": []})
    assert chunk == original


def test_AC_SRC_2_option_retains_heading_rows_counts_packing_and_qualifiers():
    texts = [
        "옵션 A 선물형 4kg",
        "소과 : 12~20과",
        "중과 : 8~11과",
        "포장 : 상자 (색상은 달라질 수 있음)",
    ]
    output = run(
        source(*texts), [block(spans=("s0", "s1", "s2", "s3"), field="composition", kind="OPTION")]
    )
    assert output["candidates"][0]["value"] == "\n".join(texts)
    assert len(output["candidates"][0]["evidence"]) == 1


@pytest.mark.parametrize(
    "target,field", [(None, "farmStory"), ("foreign", "farmStory"), ("product", None)]
)
def test_AC_SRC_3_identity_and_unknown_routing_stay_full_ledger_only(target, field):
    text = "별도 공급업체 안내: 담당 농가는 미확인입니다."
    output = run(
        source(text),
        [block(target=target, field=field, kind="IDENTITY", reviewReasons=["대상 확인 필요"])],
    )
    assert output["candidates"] == []
    assert output["blocks"][0]["value"] == text
    assert output["blocks"][0]["reviewReasons"] == ["대상 확인 필요"]
    assert output["coverage"]["unrouted"][0]["blockId"] == "b"
    assert output["coverage"]["missing"] == []


def test_AC_SRC_3_unrelated_material_remains_unrouted_and_prompt_protects_attribution():
    text = "합성 시험 지문: 문제의 정답을 고르시오."
    output = run(
        source(text),
        [block(target=None, field=None, kind="OTHER", reviewReasons=["관련 없는 자료"])],
    )
    assert output["blocks"][0]["value"] == text
    assert output["candidates"] == []
    assert "sole target" in BLOCK_PROMPT and "Unrelated legal" in BLOCK_PROMPT


def test_AC_SRC_2_historical_option_is_not_remapped_or_cleared():
    output = run(
        source("지난해 옵션 B 5kg 31,000원"),
        [block(field="composition", historical=True, kind="OPTION")],
    )
    assert output["candidates"][0]["fieldKey"] == "composition"
    assert output["candidates"][0]["historical"] is True


@pytest.mark.parametrize(
    "refs",
    [
        [{"page": 2, "spanIds": ["s0"]}],
        [{"page": 1, "spanIds": ["foreign"]}],
        [{"page": 1, "spanIds": ["s1", "s0"]}],
        [{"page": 1, "spanIds": ["s0", "s0"]}],
        [{"page": 1, "spanIds": ["s1"]}, {"page": 1, "spanIds": ["s0"]}],
    ],
)
def test_AC_SRC_3_false_unordered_or_repeated_refs_raise(refs):
    with pytest.raises(ValueError):
        run(source("첫 줄", "둘째 줄", "셋째 줄"), [block(refs=refs)])


def test_AC_SRC_2_adjacent_refs_merge_but_gaps_are_independent_evidence():
    output = run(
        source("처음", "계속", "다른 단락", "끝"),
        [
            block(
                refs=[
                    {"page": 1, "spanIds": ["s0"]},
                    {"page": 1, "spanIds": ["s1"]},
                    {"page": 1, "spanIds": ["s3"]},
                ]
            )
        ],
    )
    refs = output["candidates"][0]["evidence"]
    assert [ref["spanIds"] for ref in refs] == [["s0", "s1"], ["s3"]]
    assert output["coverage"]["missing"] == [{"page": 1, "spanId": "s2", "sourceText": "다른 단락"}]


def test_AC_SRC_3_double_content_coverage_is_visible_and_not_converted():
    output = run(source("같은 줄"), [block("a"), block("b")])
    assert output["candidates"] == []
    assert len(output["coverage"]["repeated"]) == 1
    assert {r["blockId"] for r in output["coverage"]["conversionRejected"]} == {"a", "b"}
    assert all(r["codes"] == ["REPEATED_CONTENT"] for r in output["coverage"]["conversionRejected"])


@pytest.mark.parametrize(
    "reason,text",
    [
        ("DECORATIVE", "***"),
        ("NAVIGATION", "다음"),
        ("PRIVATE", "[가림]"),
        ("PRIVATE", "contact@example.com"),
        ("UNREADABLE", "[판독불가]"),
    ],
)
def test_AC_SRC_3_supported_exclusions_retain_full_private_text(reason, text):
    output = run(source(text), exclusions=[exclusion(reason=reason)])
    assert output["exclusions"][0]["sourceText"] == text
    assert output["exclusions"][0]["valid"] is True
    assert output["coverage"]["missing"] == []


@pytest.mark.parametrize(
    "reason,text,duplicate",
    [
        ("DECORATIVE", "판매 정보", None),
        ("DECORATIVE", "300", None),
        ("NAVIGATION", "농가에서 바로 배송", None),
        ("PRIVATE", "공개 설명", None),
        ("UNREADABLE", "부분은 읽을 수 있음", None),
        ("DUPLICATE", "다른 의미", "b"),
        ("DUPLICATE", "같은 글", "missing"),
        ("NAVIGATION", "다음", "b"),
    ],
)
def test_AC_SRC_3_unsupported_exclusion_is_invalid_and_missing(reason, text, duplicate):
    output = run(source("같은 글", text), [block()], [exclusion("s1", reason, duplicate)])
    assert output["exclusions"][0]["valid"] is False
    assert output["coverage"]["invalid"]
    assert output["coverage"]["missing"][0]["spanId"] == "s1"


def test_AC_SRC_3_duplicate_requires_whole_block_equivalence_not_semantics():
    output = run(
        source("제주에서 재배", "제주에서\n재배"), [block()], [exclusion("s1", "DUPLICATE", "b")]
    )
    assert output["exclusions"][0]["valid"] is True
    assert output["coverage"]["missing"] == []
    output = run(source("제주에서 재배", "제주산"), [block()], [exclusion("s1", "DUPLICATE", "b")])
    assert output["coverage"]["invalid"]


def test_AC_SRC_3_text_overflow_is_not_truncated():
    text = "가" * 3001
    output = run(source(text), [block()])
    assert output["candidates"] == []
    assert output["blocks"][0]["value"] == text
    assert "VALUE_LIMIT" in output["coverage"]["conversionRejected"][0]["codes"]


def test_AC_SRC_3_evidence_overflow_is_explicit():
    chunk = source(*["글" for _ in range(41)])
    refs = [{"page": 1, "spanIds": [f"s{i}"]} for i in range(0, 41, 2)]
    output = run(chunk, [block(refs=refs)])
    assert output["candidates"] == []
    assert len(output["blocks"][0]["evidence"]) == 21
    assert output["coverage"]["conversionRejected"][0]["codes"] == ["EVIDENCE_LIMIT"]


def test_AC_SRC_3_candidate_overflow_retains_all_blocks():
    chunk = source(*[f"설명 {i}" for i in range(101)])
    output = run(chunk, [block(f"b{i}", (f"s{i}",)) for i in range(101)])
    assert len(output["candidates"]) == 100
    assert len(output["blocks"]) == 101
    assert output["coverage"]["conversionRejected"] == [
        {"blockId": "b100", "codes": ["CANDIDATE_LIMIT"]}
    ]


def test_AC_SRC_3_schema_forbids_written_text_photos_and_missing_exclusion_fields():
    for extra in [{"value": "invented"}, {"fieldKey": "packagePhoto"}]:
        with pytest.raises(ValidationError):
            BlockExtraction.model_validate({"blocks": [block(**extra)], "exclusions": []})
    with pytest.raises(ValidationError):
        BlockExtraction.model_validate(
            {"blocks": [], "exclusions": [{"page": 1, "spanId": "s0", "reason": "PRIVATE"}]}
        )


def test_AC_SRC_3_duplicate_block_ids_and_unknown_exclusions_raise():
    with pytest.raises(ValueError, match="DUPLICATE_BLOCK_ID"):
        run(source("글"), [block(), block()])
    with pytest.raises(ValueError, match="UNKNOWN_EXCLUSION_REF"):
        run(source("글"), exclusions=[exclusion("missing")])


def test_AC_SRC_3_duplicate_normalization_does_not_erase_word_boundaries():
    output = run(
        source("아버지가 방에", "아버지 가방에"), [block()], [exclusion("s1", "DUPLICATE", "b")]
    )
    assert output["exclusions"][0]["valid"] is False
    assert output["coverage"]["invalid"]


def test_AC_SRC_2_multpage_blocks_preserve_source_page_order_and_evidence():
    chunk = source("첫 페이지 설명")
    chunk["pages"].append({"number": 2, "spans": [{"id": "last", "text": "다음 페이지의 단서"}]})
    output = run(
        chunk, [block(refs=[{"page": 1, "spanIds": ["s0"]}, {"page": 2, "spanIds": ["last"]}])]
    )
    assert [e["page"] for e in output["candidates"][0]["evidence"]] == [1, 2]
    assert output["candidates"][0]["value"] == "첫 페이지 설명\n\n다음 페이지의 단서"
    assert not output["coverage"]["missing"]


def test_AC_SRC_3_duplicate_exclusion_and_content_overlap_is_reported():
    output = run(source("똑같은 줄"), [block()], [exclusion("s0", "DUPLICATE", "b")])
    assert output["coverage"]["repeated"]
    assert output["candidates"] == []


def test_AC_SRC_3_overlong_span_list_has_explicit_conversion_rejection():
    chunk = source(*["가" for _ in range(101)])
    output = run(chunk, [block(spans=tuple(f"s{i}" for i in range(101)))])
    assert len(output["blocks"][0]["evidence"][0]["spanIds"]) == 101
    assert output["coverage"]["conversionRejected"][0]["codes"] == ["EVIDENCE_ITEM_LIMIT"]
    assert not output["candidates"]


def test_AC_SRC_2_nonadjacent_related_spans_keep_separate_source_locations():
    output = run(
        source("서늘하게 보관하세요.", "상자 안내입니다.", "오래 보관하려면 냉장하세요."),
        [block(field="storage", refs=[{"page": 1, "spanIds": ["s0", "s2"]}])],
    )
    candidate = output["candidates"][0]
    assert [e["spanIds"] for e in candidate["evidence"]] == [["s0"], ["s2"]]
    assert candidate["value"] == "서늘하게 보관하세요.\n\n오래 보관하려면 냉장하세요."
    assert output["coverage"]["missing"] == [
        {"page": 1, "spanId": "s1", "sourceText": "상자 안내입니다."}
    ]
    assert "상자 안내" not in candidate["value"]
