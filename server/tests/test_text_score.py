"""AC-SRC-2/3/5/10/11: bounded offline evaluator regressions."""

import copy

import pytest

from app.source_analysis import final_score as legacy
from app.source_analysis import text_score
from app.source_analysis.corpus_score import canonical_bytes, sha256


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


def inputs(reference="감귤 4kg 한 상자입니다.", output=None, *, safe=None, critical=True):
    gold = {
        "schemaVersion": 1,
        "split": "development",
        "sources": [
            {
                "id": "example",
                "format": "text",
                "product": "가상 감귤",
                "sentences": [
                    {
                        "section": legacy.MODULE_SECTIONS["composition"],
                        "module": "composition",
                        "text": reference,
                        "facts": [
                            {
                                "id": "f1",
                                "statement": reference,
                                "mustContain": ["감귤"],
                                "critical": critical,
                            }
                        ],
                    }
                ],
                "forbidden": [],
            }
        ],
    }
    runs = [
        {
            "id": "example",
            "format": "text",
            "modules": [
                {
                    "module": "composition",
                    "texts": [reference] if output is None else output,
                }
            ],
        }
    ]
    return gold, runs, {"example": reference if safe is None else safe}


def run(*args, **kwargs):
    return text_score.score(*inputs(*args, **kwargs))


@pytest.mark.parametrize(
    "output", ["감귤 4kg 한 상자입니다.", "감귤 4 kg 1상자입니다.", "감귤 4000g 한 상자입니다."]
)
def test_AC_SRC_2_mechanical_equivalents(output):
    report = run(output=[output])
    assert report["overall"]["correctness"]["rate"] == 1
    assert report["overall"]["semanticPreservation"]["rate"] == 1
    assert report["acceptance"] == "PASS"


def test_AC_SRC_2_range_and_decimal_equivalence():
    assert (
        run(reference="감귤 3.5kg 한 상자입니다.", output=["감귤 3500g 한 상자입니다."])[
            "acceptance"
        ]
        == "PASS"
    )
    assert (
        run(reference="감귤은 2~4개월 보관해요.", output=["감귤은 2-4개월 보관해요."])["acceptance"]
        == "PASS"
    )


@pytest.mark.parametrize(
    ("reference", "output"),
    [
        ("감귤에는 씨가 없어요.", "감귤에는 씨가 있어요."),
        ("감귤 예상 당도는 9브릭스예요.", "감귤 실측 당도는 9브릭스예요."),
        ("감귤 표본 평균 당도는 9브릭스예요.", "모든 감귤의 당도는 9브릭스예요."),
        ("감귤은 약 24개예요.", "감귤은 정확히 24개예요."),
        ("2024년 감귤 수확분은 4kg 상자였어요.", "현재 감귤 수확분은 4kg 상자예요."),
        ("감귤 4kg 한 상자입니다.", "감귤 4g 한 상자입니다."),
    ],
)
def test_AC_SRC_3_near_negative_conflicts(reference, output):
    report = run(reference=reference, output=[output])
    assert report["overall"]["unsupported"] >= 1
    assert report["overall"]["semanticPreservation"]["hit"] == 0
    assert report["acceptance"] == "FAIL"


@pytest.mark.parametrize(
    ("safe", "output"),
    [
        ("A상품은 4kg이고 B상품은 6kg이에요.", "A상품은 6kg이고 B상품은 4kg이에요."),
        ("4kg 상자는 24개이고 6kg 상자는 36개예요.", "4kg 상자는 36개이고 6kg 상자는 24개예요."),
        (
            "A표본 당도는 9브릭스이고 B표본 당도는 11브릭스예요.",
            "A표본 당도는 11브릭스이고 B표본 당도는 9브릭스예요.",
        ),
    ],
)
def test_AC_SRC_3_source_union_cannot_support_wrong_relation(safe, output):
    report = run(safe=safe, output=[output])
    assert report["overall"]["correctness"]["hit"] == 0
    assert report["overall"]["unsupported"] == 1


@pytest.mark.parametrize(
    "output",
    [
        ["감귤 4kg 한 상자입니다.", "씨가 없어요."],
        ["감귤 4kg 한 상자이며 씨가 없어요."],
    ],
)
def test_AC_SRC_3_extra_nonnumeric_claim_is_unknown(output):
    report = run(output=output)
    assert report["overall"]["unknownSentences"] == 1
    assert report["acceptance"] != "PASS"


def test_AC_SRC_2_descriptor_omission_before_writer():
    report = run(
        reference="감귤은 얇은 껍질과 진한 향이 특징이에요.", output=["감귤은 특징이 있어요."]
    )
    assert report["overall"]["semanticPreservation"]["hit"] == 0
    assert report["overall"]["unknownFacts"] == 1


def test_AC_SRC_2_arbitrary_paraphrase_stays_unknown():
    report = run(
        reference="감귤은 서늘한 곳에 보관하세요.", output=["감귤은 시원한 장소에 보관하세요."]
    )
    assert report["overall"]["unknownSentences"] == 1


def test_AC_SRC_5_pagewide_placement_and_repetition():
    gold, records, safe = inputs()
    records[0]["modules"][0]["module"] = "storage"
    report = text_score.score(gold, records, safe)
    assert report["overall"]["semanticPreservation"]["hit"] == 1
    assert report["overall"]["placement"]["misplaced"]["hit"] == 1
    report = text_score.score(gold, records, safe, placement_rules={"example": {"f1": ["storage"]}})
    assert report["overall"]["placement"]["permitted"]["hit"] == 1
    report = run(output=["감귤 4kg 한 상자입니다."] * 2)
    assert report["overall"]["semanticPreservation"]["hit"] == 1
    assert report["overall"]["repetition"]["hit"] == 1


def test_AC_SRC_3_contradiction_added_vetoes_preservation():
    report = run(
        reference="감귤에는 씨가 없어요.", output=["감귤에는 씨가 없어요.", "감귤에는 씨가 있어요."]
    )
    assert report["sources"][0]["facts"][0]["status"] == "CONTRADICTED"


def test_AC_SRC_3_legacy_negative_judgment_veto():
    gold, records, safe = inputs()
    sentence = legacy.split_sentences(records[0]["modules"][0]["texts"][0])[0]
    records[0]["supportJudgments"] = [
        {"sentenceIndex": 0, "sentenceSha256": sha256(sentence.encode()), "supported": False}
    ]
    report = text_score.score(gold, records, safe)
    assert report["legacy"] == legacy.score(gold, records, safe)
    assert report["overall"]["unsupported"] == 1


def test_AC_SRC_3_hash_bound_review_and_stale_rejection():
    gold, records, safe = inputs(output=["시원한 장소에 보관하세요."])
    sentence = legacy.split_sentences(records[0]["modules"][0]["texts"][0])[0]
    judgment = {
        "sentenceIndex": 0,
        "sentenceSha256": sha256(sentence.encode()),
        "safeTextSha256": sha256(safe["example"].encode()),
        "goldSha256": sha256(
            canonical_bytes(legacy.Source.model_validate(gold["sources"][0]).model_dump())
        ),
        "supported": True,
    }
    report = text_score.score(gold, records, safe, semantic_judgments={"example": [judgment]})
    assert report["overall"]["reviewCoverage"]["hit"] == 1
    assert report["overall"]["correctness"]["hit"] == 1
    judgment["safeTextSha256"] = "0" * 64
    with pytest.raises(ValueError, match="redacted"):
        text_score.score(gold, records, safe, semantic_judgments={"example": [judgment]})


def test_AC_SRC_2_fact_review_is_bound_to_entire_output():
    gold, records, safe = inputs(output=["상자 하나에 감귤 사 킬로그램을 담아요."])
    sentences = legacy.split_sentences(records[0]["modules"][0]["texts"][0])
    sj = {
        "sentenceIndex": 0,
        "sentenceSha256": sha256(sentences[0].encode()),
        "safeTextSha256": sha256(safe["example"].encode()),
        "goldSha256": sha256(
            canonical_bytes(legacy.Source.model_validate(gold["sources"][0]).model_dump())
        ),
        "supported": True,
    }
    fj = {
        "factId": "f1",
        "preserved": True,
        "outputSentenceIndices": [0],
        "safeTextSha256": sha256(safe["example"].encode()),
        "goldSha256": sha256(
            canonical_bytes(legacy.Source.model_validate(gold["sources"][0]).model_dump())
        ),
        "outputSha256": sha256(canonical_bytes(sentences)),
    }
    report = text_score.score(
        gold, records, safe, semantic_judgments={"example": [sj]}, fact_judgments={"example": [fj]}
    )
    assert report["acceptance"] == "PASS"
    records[0]["modules"][0]["texts"].append("추가 문장")
    with pytest.raises(ValueError, match="redacted"):
        text_score.score(gold, records, safe, fact_judgments={"example": [fj]})


def test_AC_SRC_11_correct_empty_requires_explicit_contract():
    gold, records, safe = inputs(output=[])
    gold["sources"][0]["sentences"] = []
    assert text_score.score(gold, records, safe)["acceptance"] == "FAIL"
    assert (
        text_score.score(gold, records, safe, correct_empty_ids=["example"])["acceptance"] == "PASS"
    )
    records[0]["status"] = "FAILED"
    assert (
        text_score.score(gold, records, safe, correct_empty_ids=["example"])["acceptance"] == "FAIL"
    )


@pytest.mark.parametrize("status", ["FAILED", "REJECTED", "NOT_RUN", "EMPTY"])
def test_AC_SRC_11_failed_run_still_audits_output(status):
    gold, records, safe = inputs(output=["감귤 7kg 한 상자입니다."])
    records[0]["status"] = status
    report = text_score.score(gold, records, safe)
    assert report["overall"]["processing"]["failed"] == 1
    assert report["overall"]["unsupported"] == 1
    assert report["overall"]["semanticPreservation"]["hit"] == 0


def test_AC_SRC_10_per_format_threshold_cannot_hide_small_bad_stratum():
    gold, records, safe = inputs(critical=False)
    for i in range(25):
        source = copy.deepcopy(gold["sources"][0])
        source["id"] = f"other{i}"
        gold["sources"].append(source)
        record = copy.deepcopy(records[0])
        record["id"] = source["id"]
        records.append(record)
        safe[source["id"]] = safe["example"]
    gold["sources"][0]["format"] = "pdf"
    records[0]["format"] = "pdf"
    records[0]["modules"][0]["texts"] = ["확인되지 않은 설명"]
    report = text_score.score(gold, records, safe)
    assert report["overall"]["semanticPreservation"]["rate"] > 0.95
    assert report["byFormat"]["pdf"]["acceptance"] != "PASS"
    assert report["acceptance"] != "PASS"


def test_AC_SRC_10_reports_are_text_free_and_legacy_unchanged():
    gold, records, safe = inputs()
    before = copy.deepcopy((gold, records, safe))
    report = text_score.score(gold, records, safe)
    assert (gold, records, safe) == before
    assert report["legacy"] == legacy.score(gold, records, safe)
    assert "감귤" not in str(report)


def test_AC_SRC_3_exact_other_product_source_clause_is_not_support():
    report = run(safe="감귤 4kg 한 상자입니다. B상품은 6kg이에요.", output=["B상품은 6kg이에요."])
    assert report["overall"]["correctness"]["hit"] == 0
    assert report["acceptance"] != "PASS"


def test_AC_SRC_3_unrelated_positive_and_negative_facts_do_not_conflict():
    gold, records, safe = inputs(reference="감귤에는 씨가 없어요.")
    extra = copy.deepcopy(gold["sources"][0]["sentences"][0])
    extra["text"] = "감귤 껍질에는 점이 있어요."
    extra["facts"][0].update(id="f2", statement=extra["text"])
    gold["sources"][0]["sentences"].append(extra)
    records[0]["modules"][0]["texts"].append(extra["text"])
    safe["example"] += " " + extra["text"]
    report = text_score.score(gold, records, safe)
    assert report["overall"]["semanticPreservation"]["hit"] == 2
    assert report["acceptance"] == "PASS"


def test_AC_SRC_11_partial_is_not_completion_pass():
    gold, records, safe = inputs()
    records[0]["status"] = "PARTIAL"
    assert text_score.score(gold, records, safe)["acceptance"] == "UNKNOWN"


def test_AC_SRC_3_ocr_newline_cannot_drop_attached_sample_qualifier():
    report = run(
        reference="감귤 당도 12브릭스입니다.",
        safe="표본 평균\n감귤 당도 12브릭스입니다.",
        output=["감귤 당도 12브릭스입니다."],
    )
    assert report["overall"]["correctness"]["hit"] == 0
    assert report["acceptance"] != "PASS"


def test_AC_SRC_2_shared_range_unit_conversion():
    assert text_score.mechanical("1~2kg") == text_score.mechanical("1000~2000g")


def test_AC_SRC_3_exact_bare_number_fragment_keeps_ocr_context_unknown():
    gold, records, safe = inputs()
    sentence = gold["sources"][0]["sentences"][0]
    sentence["text"] = "12브릭스입니다."
    sentence["facts"][0].update(statement=sentence["text"], mustContain=["12브릭스"])
    records[0]["modules"][0]["texts"] = [sentence["text"]]
    safe["example"] = "표본 평균\n12브릭스입니다."
    report = text_score.score(gold, records, safe)
    assert report["acceptance"] != "PASS"
    assert report["overall"]["correctness"]["hit"] == 0


def test_AC_SRC_2_distinct_measurements_keep_independent_qualifiers():
    gold, records, safe = inputs(reference="감귤 예상 당도는 9브릭스예요.")
    extra = copy.deepcopy(gold["sources"][0]["sentences"][0])
    extra["text"] = "감귤 실측 당도는 11브릭스예요."
    extra["facts"][0].update(id="f2", statement=extra["text"])
    gold["sources"][0]["sentences"].append(extra)
    records[0]["modules"][0]["texts"].append(extra["text"])
    safe["example"] += " " + extra["text"]
    report = text_score.score(gold, records, safe)
    assert report["overall"]["semanticPreservation"]["hit"] == 2


def test_AC_SRC_2_complete_grounded_reference_preserves_fragment_facts():
    gold, records, safe = inputs(reference="감귤 4kg 벌크 포장입니다.")
    fact = gold["sources"][0]["sentences"][0]["facts"][0]
    fact.update(statement="벌크 포장", mustContain=["벌크", "포장"])
    report = text_score.score(gold, records, safe)
    assert report["overall"]["semanticPreservation"]["hit"] == 1
    assert report["acceptance"] == "PASS"


def test_AC_SRC_2_lexical_diagnostic_remains_useful_without_semantic_proof():
    gold, records, safe = inputs(
        reference="감귤 4kg 벌크 포장입니다.", safe="상품 중량 4kg. 포장 방식 벌크."
    )
    fact = gold["sources"][0]["sentences"][0]["facts"][0]
    fact.update(statement="벌크 포장", mustContain=["벌크", "포장"])
    report = text_score.score(gold, records, safe)
    metrics = report["overall"]
    assert metrics["lexicalDiagnostics"]["pagewideFactRecall"]["hit"] == 1
    assert metrics["lexicalDiagnostics"]["fullReferenceMatch"]["hit"] == 1
    assert metrics["semanticPreservation"]["hit"] == 0
    assert metrics["semanticPreservation"]["upperBound"] == 1
    assert metrics["semanticDecisionCoverage"]["rate"] == 0
    assert report["acceptance"] == "UNKNOWN"


def test_AC_SRC_2_multi_sentence_reference_diagnostic_is_pagewide():
    gold, records, safe = inputs(reference="감귤은 벌크 포장입니다. 감귤 중량은 4kg입니다.")
    fact = gold["sources"][0]["sentences"][0]["facts"][0]
    fact.update(statement="벌크 포장", mustContain=["벌크", "포장"])
    report = text_score.score(gold, records, safe)
    assert report["overall"]["lexicalDiagnostics"]["fullReferenceMatch"]["rate"] == 1


@pytest.mark.parametrize("change", ["statement", "product", "critical", "sourceId"])
def test_AC_SRC_3_fact_review_rejects_changed_gold_context(change):
    gold, records, safe = inputs()
    sentences = legacy.split_sentences(records[0]["modules"][0]["texts"][0])
    judgment = {
        "factId": "f1",
        "preserved": True,
        "outputSentenceIndices": [0],
        "safeTextSha256": sha256(safe["example"].encode()),
        "outputSha256": sha256(canonical_bytes(sentences)),
        "goldSha256": sha256(
            canonical_bytes(legacy.Source.model_validate(gold["sources"][0]).model_dump())
        ),
    }
    sid = "example"
    if change == "statement":
        gold["sources"][0]["sentences"][0]["facts"][0]["statement"] = "변경된 사실"
    elif change == "product":
        gold["sources"][0]["product"] = "다른 상품"
    elif change == "critical":
        gold["sources"][0]["sentences"][0]["facts"][0]["critical"] = False
    else:
        sid = "other"
        gold["sources"][0]["id"] = sid
        records[0]["id"] = sid
        safe[sid] = safe.pop("example")
    with pytest.raises(ValueError, match="redacted"):
        text_score.score(gold, records, safe, fact_judgments={sid: [judgment]})


def test_AC_SRC_3_sentence_review_rejects_changed_product_context():
    gold, records, safe = inputs()
    sentence = legacy.split_sentences(records[0]["modules"][0]["texts"][0])[0]
    judgment = {
        "sentenceIndex": 0,
        "sentenceSha256": sha256(sentence.encode()),
        "safeTextSha256": sha256(safe["example"].encode()),
        "supported": True,
        "goldSha256": sha256(
            canonical_bytes(legacy.Source.model_validate(gold["sources"][0]).model_dump())
        ),
    }
    gold["sources"][0]["product"] = "다른 상품"
    with pytest.raises(ValueError, match="redacted"):
        text_score.score(gold, records, safe, semantic_judgments={"example": [judgment]})


@pytest.mark.parametrize(
    ("safe", "reference"),
    [
        ("작년 표본 측정 결과입니다. 감귤 당도는 12브릭스입니다.", "감귤 당도는 12브릭스입니다."),
        ("다음은 B상품 정보입니다. 감귤은 4kg 상자입니다.", "감귤은 4kg 상자입니다."),
    ],
)
def test_AC_SRC_3_preceding_scope_heading_cannot_be_dropped(safe, reference):
    report = run(reference=reference, safe=safe, output=[reference])
    assert report["overall"]["correctness"]["hit"] == 0
    assert report["overall"]["correctness"]["upperBound"] == 1
    assert report["acceptance"] == "UNKNOWN"


def test_AC_SRC_10_invalid_input_errors_never_expose_private_payload():
    gold, records, safe = inputs()
    sentinel = "private-synthetic-payload-must-stay-redacted"
    gold["schemaVersion"] = sentinel
    with pytest.raises(ValueError, match="Invalid text-score input") as error:
        text_score.score(gold, records, safe)
    assert sentinel not in str(error.value)


@pytest.mark.parametrize("weight", ["2kg", "3kg", "5kg", "9kg"])
def test_AC_SRC_3_exact_alternative_option_not_conflict_or_automatic_support(weight):
    safe = "\n".join(f"0{i} 실속형 감귤 {w}" for i, w in enumerate(["2kg", "3kg", "5kg", "9kg"], 1))
    output = f"실속형 감귤 {weight}"
    report = run(reference="실속형 감귤 2kg입니다.", safe=safe, output=[output])
    row = report["sources"][0]
    assert row["sentences"][0]["status"] == "UNKNOWN"
    assert row["facts"][0]["status"] == "UNKNOWN"
    assert report["acceptance"] == "UNKNOWN"
    assert report["overall"]["unsupported"] == 0
    assert report["overall"]["correctness"]["hit"] == 0


def test_AC_SRC_3_complete_supported_options_do_not_contradict_each_other():
    gold, records, safe = inputs(reference="감귤 2kg 한 상자입니다.")
    second = copy.deepcopy(gold["sources"][0]["sentences"][0])
    second["text"] = "감귤 3kg 한 상자입니다."
    second["facts"][0].update(id="f2", statement=second["text"])
    gold["sources"][0]["sentences"].append(second)
    records[0]["modules"][0]["texts"].append(second["text"])
    safe["example"] += " " + second["text"]
    report = text_score.score(gold, records, safe)
    assert report["overall"]["semanticPreservation"]["hit"] == 2
    assert report["acceptance"] == "PASS"


@pytest.mark.parametrize(
    "output",
    [
        "껍질을 벗기고 먹다 보면 간혹 씨가 있는 경우도 있습니다.",
        "외모가 울퉁불퉁 덜 예쁠 수 있으나 껍질을 쉽게 벗길 수 있습니다.",
    ],
)
def test_AC_SRC_3_unrelated_negative_season_or_appearance_cannot_reverse_property(output):
    safe = "감귤이 없는 시즌입니다. 껍질이 예쁘지 않습니다."
    report = run(reference="감귤 4kg 한 상자입니다.", safe=safe, output=[output])
    assert report["sources"][0]["sentences"][0]["status"] == "UNKNOWN"
    assert report["overall"]["unsupported"] == 0
    assert report["acceptance"] == "UNKNOWN"


def test_AC_SRC_3_exact_option_fragment_cannot_bypass_preceding_scope_heading():
    safe = "작년 A상품 정보입니다.\n01 감귤 2kg입니다.\n02 감귤 3kg입니다."
    report = run(reference="감귤 2kg입니다.", safe=safe, output=["감귤 2kg입니다."])
    assert report["overall"]["correctness"]["hit"] == 0
    assert report["acceptance"] != "PASS"


@pytest.mark.parametrize(
    "ordinal,weight", [("01", "2kg"), ("02", "3kg"), ("03", "5kg"), ("04", "9kg")]
)
def test_AC_SRC_3_literal_numbered_option_keeps_ordinal_without_cross_option_conflict(
    ordinal, weight
):
    safe = "\n".join(f"0{i} 실속형 감귤 {w}" for i, w in enumerate(["2kg", "3kg", "5kg", "9kg"], 1))
    output = f"{ordinal} 실속형 감귤 {weight}"
    report = run(reference="감귤 2kg 한 상자입니다.", safe=safe, output=[output])
    assert report["sources"][0]["sentences"][0]["status"] == "UNKNOWN"
    assert report["overall"]["unsupported"] == 0
    assert report["overall"]["correctness"]["hit"] == 0
    assert report["acceptance"] == "UNKNOWN"


@pytest.mark.parametrize("output", ["01 감귤 3kg", "02 감귤 2kg", "1번 감귤 3kg"])
def test_AC_SRC_3_option_ordinals_are_not_globally_removed_to_rescue_swapped_values(output):
    safe = "01 감귤 2kg\n02 감귤 3kg\n1번 감귤 2kg"
    report = run(reference="감귤 2kg 한 상자입니다.", safe=safe, output=[output])
    assert report["sources"][0]["sentences"][0]["status"] == "UNSUPPORTED"
    assert report["acceptance"] == "FAIL"


def test_AC_SRC_2_v2_pagewide_paragraph_numeric_boundary_has_per_fact_diagnostic():
    gold, records, safe = inputs(
        reference="추가 과수 1~2개입니다.", output=["포장합니다.", "1~2개 더 넣습니다."]
    )
    gold["sources"][0]["sentences"][0]["facts"][0]["mustContain"] = ["1~2개"]
    report = text_score.score(gold, records, safe)
    assert report["overall"]["lexicalDiagnostics"]["pagewideFactRecall"]["hit"] == 1
    assert report["sources"][0]["facts"][0]["pageWideSelectorHit"] is True


def test_AC_SRC_3_v2_corrected_brix_number_diagnostic_leaves_legacy_raw_immutable():
    gold, records, safe = inputs(reference="당도 12브릭 스입니다.", output=["당도 12브릭스입니다."])
    gold["sources"][0]["sentences"][0]["facts"][0]["mustContain"] = ["당도"]
    report = text_score.score(gold, records, safe)
    assert report["sources"][0]["numericDiagnostics"]["normalizedUnsupportedNumbers"] == 0
    assert report["legacy"] == legacy.score(gold, records, safe)


def selector_sidecar(gold, safe):
    return {
        "example": {
            "sourceSha256": sha256(canonical_bytes(gold["sources"][0])),
            "safeTextSha256": sha256(safe["example"].encode()),
            "facts": {
                "f1": {
                    "selectorAliases": [["비닐펙", "실온", "후숙"]],
                    "reason": "Invented source-specific spelling review",
                    "sourceRef": "line1",
                }
            },
        }
    }


def alias_inputs():
    gold, records, safe = inputs(
        reference="비닐팩에 담아 실온에서 후숙합니다.",
        output=["비닐펙에 담아 실온에서 후숙합니다."],
        safe="비닐펙에 담아 실온에서 후숙합니다.",
    )
    gold["sources"][0]["sentences"][0]["facts"][0]["mustContain"] = ["비닐팩", "실온", "후숙"]
    return gold, records, safe


def test_AC_SRC_2_v2_optional_alias_layer_is_lexical_only_and_source_scoped():
    gold, records, safe = alias_inputs()
    aliases = selector_sidecar(gold, safe)
    other = copy.deepcopy(gold["sources"][0])
    other["id"] = "other"
    gold["sources"].append(other)
    records.append({**copy.deepcopy(records[0]), "id": "other"})
    safe["other"] = safe["example"]
    primary = text_score.score(gold, records, safe)
    reviewed = text_score.score(gold, records, safe, selector_aliases=aliases)
    assert primary["overall"]["lexicalDiagnostics"]["pagewideFactRecall"]["hit"] == 0
    assert reviewed["overall"]["lexicalDiagnostics"]["pagewideFactRecall"]["hit"] == 1
    assert reviewed["sources"][0]["facts"][0]["selectorAliasHit"] is True
    assert reviewed["sources"][1]["facts"][0]["selectorAliasHit"] is False
    assert reviewed["overall"]["semanticPreservation"]["hit"] == 0
    assert reviewed["overall"]["correctness"]["hit"] == 0


@pytest.mark.parametrize(
    "mutation", ["sourceHash", "safeHash", "factId", "sourceId", "metadata", "unsupportedPhrase"]
)
def test_AC_SRC_3_v2_alias_bindings_fail_closed(mutation):
    gold, records, safe = alias_inputs()
    aliases = selector_sidecar(gold, safe)
    if mutation == "sourceHash":
        aliases["example"]["sourceSha256"] = "0" * 64
    elif mutation == "safeHash":
        aliases["example"]["safeTextSha256"] = "0" * 64
    elif mutation == "factId":
        aliases["example"]["facts"]["foreign"] = aliases["example"]["facts"].pop("f1")
    elif mutation == "sourceId":
        aliases["foreign"] = aliases.pop("example")
    elif mutation == "metadata":
        aliases["example"]["facts"]["f1"]["reason"] = 1
    elif mutation == "unsupportedPhrase":
        aliases["example"]["facts"]["f1"]["selectorAliases"] = [["없는 문장"]]
    with pytest.raises(ValueError, match="Invalid text-score input"):
        text_score.score(gold, records, safe, selector_aliases=aliases)


def test_AC_SRC_2_v2_pagewide_layout_invariant_for_raw_or_sentence_split_text():
    raw = "서귀포에서 재배합니다. 50년 동안 전통 방식으로 길렀습니다."
    gold, records, safe = inputs(
        reference="50년 동안 전통 방식으로 길렀습니다.", output=[raw], safe=raw
    )
    gold["sources"][0]["sentences"][0]["facts"][0]["mustContain"] = ["50년"]
    first = text_score.score(gold, records, safe)
    records[0]["modules"][0]["texts"] = legacy.split_sentences(raw)
    second = text_score.score(gold, records, safe)
    assert first["sources"][0]["facts"][0]["pageWideSelectorHit"] is True
    assert first["overall"]["lexicalDiagnostics"] == second["overall"]["lexicalDiagnostics"]
