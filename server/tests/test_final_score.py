"""AC-SRC-2/3/5/6: offline final text, denominator integrity and privacy."""

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.source_analysis import final_score
from app.source_analysis.corpus_score import canonical_bytes, normalize, sha256
from app.source_analysis.final_score import (
    CULTIVARS,
    FORBIDDEN_WORDS,
    LOCAL_GOLD_SHA256,
    PHONE_RE,
    Gold,
    LocalGold,
    compact,
    contains,
    load_local_gold,
    main,
    markdown,
    score,
    sensitive_tokens,
    split_sentences,
)

ROOT = Path(__file__).resolve().parents[2]
VALIDATION = ROOT / "docs/spec/validation"
TEXT = "감귤 3kg 한 상자입니다."


def gold(*, text=TEXT, tokens=None, section="composition", module="composition", critical=True):
    return {
        "schemaVersion": 1,
        "split": "holdout",
        "sources": [
            {
                "id": "holdout-01",
                "format": "text",
                "product": "비공개 상품명",
                "sentences": [
                    {
                        "section": section,
                        "module": module,
                        "text": text,
                        "where": "비공개 위치",
                        "facts": [
                            {
                                "id": "f1",
                                "statement": "비공개 사실",
                                "mustContain": tokens or ["감귤", "3kg"],
                                "critical": critical,
                            }
                        ],
                    }
                ],
                "forbidden": [],
            }
        ],
    }


def run(text=TEXT, *, module="composition", status="EVALUATED"):
    return {
        "id": "holdout-01",
        "format": "text",
        "status": status,
        "modules": [{"module": module, "texts": [text]}],
    }


def result(g=None, r=None, safe=TEXT):
    return score(g or gold(), [run() if r is None else r], {"holdout-01": safe})


def test_AC_SRC_2_fact_hit_and_section_aggregates():
    report = result()
    for bucket in [report["overall"], report["byFormat"]["text"], report["sources"][0]]:
        assert bucket["factRecall"] == {"hit": 1, "total": 1, "rate": 1.0}
        assert bucket["criticalFactRecall"]["rate"] == 1
        assert bucket["bySection"]["composition"]["factRecall"]["hit"] == 1
        assert bucket["criticalGate"] == "PASS"
    assert report["byFormat"]["pdf"]["factRecall"]["rate"] is None
    assert report["byFormat"]["pdf"]["criticalGate"] == "N/A"


def test_AC_SRC_3_partial_token_miss():
    report = result(r=run("감귤 한 상자입니다."))["overall"]
    assert report["factRecall"]["hit"] == 0
    assert report["criticalGate"] == "FAIL"


def test_AC_SRC_3_misplacement_and_same_section_different_module():
    report = result(r=run(module="storage"))["overall"]
    assert report["misplacement"] == {"hit": 1, "total": 1, "rate": 1.0}
    assert report["factRecall"]["hit"] == 0
    assert result(r=run(module="pieceCount"))["overall"]["factRecall"]["hit"] == 1
    r = run()
    r["modules"].append({"module": "storage", "texts": [TEXT]})
    assert result(r=r)["overall"]["misplacement"]["hit"] == 0


def test_AC_SRC_3_tokens_split_across_other_sections_are_not_misplacement():
    r = run("감귤", module="storage")
    r["modules"].append({"module": "delivery", "texts": ["3kg"]})
    assert result(r=r)["overall"]["misplacement"]["hit"] == 0


@pytest.mark.parametrize("text", ["32,000원", "₩35,000", "3만 원", "3 만 원"])
def test_AC_03_2_money_violation(text):
    report = result(r=run(text), safe=text)["overall"]
    assert report["forbidden"]["price"] == 1
    assert report["criticalGate"] == "FAIL"


@pytest.mark.parametrize("text", ["3kg", "12과", "13~14 브릭스", "2004년", "1-3일", "24시간"])
def test_AC_03_2_non_money_numbers_allowed(text):
    g = gold(text=text, tokens=[text])
    report = result(g=g, r=run(text), safe=text)["overall"]
    assert report["forbiddenViolations"] == 0
    assert report["unsupportedTokens"] == 0
    assert report["criticalGate"] == "PASS"


@pytest.mark.parametrize(
    "text,kind",
    [
        ("010-0000-0000", "phone"),
        ("01000000000", "phone"),
        ("02 000 0000", "phone"),
        ("+82-10-0000-0000", "phone"),
        ("test@example.invalid", "email"),
        ("1588-0000", "phone"),
    ],
)
def test_AC_SRC_6_phone_email(text, kind):
    report = result(r=run(TEXT + " " + text), safe=TEXT + text)["overall"]
    assert report["forbidden"][kind] == 1
    assert report["criticalGate"] == "FAIL"


@pytest.mark.parametrize(
    "kind",
    [
        "price",
        "pii",
        "ui",
        "watermark",
        "other_product",
        "unsupported",
        "platform",
        "health",
        "other",
    ],
)
def test_AC_SRC_6_forbidden_distinctive_text(kind):
    g = gold()
    g["sources"][0]["forbidden"] = [{"kind": kind, "text": "워터마크: 가상표식"}]
    report = result(g=g, r=run(TEXT + " 가상 표식"), safe=TEXT + " 가상표식")["overall"]
    assert report["forbidden"][f"gold_{kind}"] == 1
    assert report["criticalGate"] == "FAIL"


@pytest.mark.parametrize(
    "extra,kind",
    [
        ("5kg", "number"),
        ("12과", "number"),
        ("5ml", "number"),
        ("한라봉", "cultivar"),
        ("GAP", "certification"),
        ("HACCP", "certification"),
        ("무농약", "certification"),
        ("유기농", "certification"),
        ("친환경", "certification"),
        ("인증", "certification"),
    ],
)
def test_AC_SRC_3_unsupported_sensitive_tokens(extra, kind):
    report = result(r=run(TEXT + " " + extra))["overall"]
    assert report["unsupported"][kind] >= 1
    assert report["criticalGate"] == "FAIL"
    assert report["precisionProxy"]["hit"] == 1  # first safe sentence remains supported


def test_AC_SRC_3_numeric_token_boundaries_and_units():
    g = gold(text="3kg", tokens=["3kg"])
    # Gold substring recall can match inside 13kg; unsupported tokens must still catch this.
    report = result(g=g, r=run("13kg"), safe="3kg")["overall"]
    assert report["unsupported"]["number"] == 1
    assert report["criticalGate"] == "FAIL"
    assert result(g=g, r=run("3킬로그램"), safe="3kg")["overall"]["unsupportedTokens"] == 0
    assert result(g=g, r=run("3g"), safe="3kg")["overall"]["unsupportedTokens"] == 1


def test_AC_SRC_3_custom_cultivar_and_deduplication():
    r = run(TEXT + " 신품종가상 신품종가상 5kg 5kg")
    report = score(gold(), [r], {"holdout-01": TEXT}, cultivar_words=(*CULTIVARS, "신품종가상"))[
        "overall"
    ]
    assert report["unsupported"] == {"number": 1, "cultivar": 1, "certification": 0}


@pytest.mark.parametrize("status", ["FAILED", "EMPTY", "REJECTED", "NOT_RUN"])
def test_AC_SRC_5_failed_run_denominators_and_residual_safety(status):
    report = result(r=run(TEXT + " 32,000원", status=status))["overall"]
    assert report["factRecall"] == {"hit": 0, "total": 1, "rate": 0.0}
    assert report["criticalFactRecall"]["total"] == 1
    assert report["failedRuns"] == 1
    assert report["forbiddenViolations"] == 1


def test_AC_SRC_5_missing_empty_and_micro_aggregation():
    g = gold()
    second = copy.deepcopy(g["sources"][0])
    second.update(id="holdout-02", format="pdf")
    g["sources"].append(second)
    report = score(g, [run()], {"holdout-01": TEXT, "holdout-02": TEXT})
    assert report["overall"]["factRecall"] == {"hit": 1, "total": 2, "rate": 0.5}
    assert report["overall"]["failedRuns"] == 1
    assert report["byFormat"]["pdf"]["factRecall"]["total"] == 1
    assert result(r=run("  \n"))["overall"]["factRecall"]["hit"] == 0


def test_AC_SRC_2_normalization_reuses_frozen_function():
    assert compact("‘감귤’ 3.0 KG 한 상자") == compact("'감귤' 3kg 1상자")
    assert compact("13~14 브릭스") != compact("13-14 브릭스")
    text = "감귤 3킬로그램 한 상자입니다."
    assert result(r=run(text))["overall"]["factRecall"]["hit"] == 1
    assert compact("감귤") == compact("감귤")
    assert normalize("3 KG") == "3kg"


def test_AC_SRC_2_precision_proxy_source_support_and_bound_human_judgment():
    r = run("감귤 3kg입니다. 서늘한 곳에 보관합니다. 부드럽게 소개합니다.")
    sentence = split_sentences(r["modules"][0]["texts"][0])[2]
    r["supportJudgments"] = [
        {"sentenceIndex": 2, "sentenceSha256": sha256(sentence.encode()), "supported": True}
    ]
    report = result(r=r, safe=TEXT + " 서늘한 곳에 보관합니다.")["overall"]
    assert report["precisionProxy"] == {"hit": 3, "total": 3, "rate": 1.0}
    r["supportJudgments"][0]["sentenceSha256"] = "0" * 64
    with pytest.raises(ValueError, match="redacted"):
        result(r=r)


def test_AC_SRC_6_human_judgment_cannot_hide_unsafe_sentence():
    r = run("한라봉 32,000원")
    r["supportJudgments"] = [
        {
            "sentenceIndex": 0,
            "sentenceSha256": sha256("한라봉 32,000원".encode()),
            "supported": True,
        }
    ]
    assert result(r=r)["overall"]["precisionProxy"]["hit"] == 0


@pytest.mark.parametrize("change", ["tokens", "module", "duplicate", "unsafe", "blank"])
def test_AC_SRC_2_gold_validation(change):
    g = gold()
    sentence = g["sources"][0]["sentences"][0]
    if change == "tokens":
        sentence["facts"][0]["mustContain"] = ["5kg"]
    elif change == "module":
        sentence["module"] = "storage"
    elif change == "duplicate":
        sentence["facts"].append(copy.deepcopy(sentence["facts"][0]))
    elif change == "unsafe":
        sentence["text"] += " 32,000원"
    else:
        sentence["facts"][0]["mustContain"] = [" "]
    with pytest.raises(ValueError, match="redacted"):
        result(g=g)


@pytest.mark.parametrize("change", ["unknown", "format", "duplicate", "safe", "module"])
def test_AC_SRC_2_invalid_run_or_source_mapping(change):
    r, safe = run(), {"holdout-01": TEXT}
    records = [r]
    if change == "unknown":
        r["id"] = "unknown"
    elif change == "format":
        r["format"] = "pdf"
    elif change == "duplicate":
        records.append(r)
    elif change == "safe":
        safe = {}
    else:
        r["modules"][0]["module"] = "unknown"
    with pytest.raises(ValueError, match="redacted"):
        score(gold(), records, safe)


def test_AC_SRC_6_holdout_report_redaction():
    g = gold()
    g["sources"][0]["forbidden"] = [{"kind": "watermark", "text": "비공개표식"}]
    report = result(g=g, r=run(TEXT + " 비공개표식 비공개출력"), safe=TEXT + " 비공개원문")
    serialized = json.dumps(report, ensure_ascii=False) + markdown(report)
    for secret in [
        TEXT,
        "비공개 상품명",
        "비공개 위치",
        "비공개 사실",
        "비공개표식",
        "비공개출력",
        "비공개원문",
    ]:
        assert secret not in serialized
    assert report["sources"][0]["id"] == "holdout-01"
    assert report["sources"][0]["goldSha256"] == sha256(canonical_bytes(g["sources"][0]))


def test_AC_SRC_6_cli_envelope_redaction_and_exit_codes(tmp_path, capsys):
    def write(name, data):
        path = tmp_path / name
        path.write_text(json.dumps(data, ensure_ascii=False))
        return str(path)

    holdout_path = write("holdout-gold.json", gold())
    development = gold()
    development["split"] = "development"
    gold_path = write("gold.json", development)
    write("output.json", run())
    (tmp_path / "safe.txt").write_text(TEXT)
    envelope = {
        "schemaVersion": 1,
        "sources": [{"id": "holdout-01", "safeTextPath": "safe.txt", "outputPath": "output.json"}],
    }
    runs_path = write("runs.json", envelope)
    argv = [
        "--gold",
        gold_path,
        "--runs",
        runs_path,
        "--report",
        str(tmp_path / "report.json"),
        "--markdown",
        str(tmp_path / "report.md"),
    ]
    # holdout은 --gold로 받지 않는다(SHA·lock 고정 경로만).
    assert main([*argv[:1], holdout_path, *argv[2:]]) == 2
    assert main(argv) == 0
    assert TEXT not in capsys.readouterr().out
    assert TEXT not in (tmp_path / "report.json").read_text()
    envelope["sources"][0].pop("outputPath")
    write("runs.json", envelope)
    assert main(argv) == 1
    envelope["sources"][0]["safeTextPath"] = "비공개경로-secret.txt"
    write("runs.json", envelope)
    assert main(argv) == 2
    assert "비공개경로" not in capsys.readouterr().out
    write(
        "runs.json",
        {"schemaVersion": 1, "sources": [{"id": "holdout-01", "safeTextPath": "safe.txt"}]},
    )
    argv[-1] = gold_path
    assert main(argv) == 2
    assert json.loads(Path(gold_path).read_text()) == development


def test_AC_SRC_6_cli_subprocess_invalid_gold_never_leaks(tmp_path):
    private = "SECRET_GOLD_TEXT_MARKER"
    path = tmp_path / "gold.json"
    path.write_text(json.dumps({"secret": private}))
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.source_analysis.final_score",
            "--gold",
            str(path),
            "--runs",
            str(path),
            "--report",
            str(tmp_path / "out.json"),
            "--markdown",
            str(tmp_path / "out.md"),
        ],
        cwd=ROOT / "server",
        text=True,
        capture_output=True,
        check=False,
    )
    assert completed.returncode == 2
    assert private not in completed.stdout + completed.stderr
    assert not completed.stderr


def test_AC_SRC_2_synthetic_gold_schema_manifest_and_self_score():
    gold_path = VALIDATION / "source-final-gold-i3-dev-synthetic.json"
    g = json.loads(gold_path.read_text())
    assert Gold.model_validate(g)
    assert (
        json.loads((VALIDATION / "source-final-gold.schema.json").read_text())
        == Gold.model_json_schema()
    )
    manifest = json.loads((VALIDATION / "source-final-dev-manifest.json").read_text())
    corpus = json.loads((VALIDATION / "source-corpus-i3-v1.json").read_text())
    fixtures = json.loads((ROOT / "server/tests/fixtures/source-analysis/cases.json").read_text())
    assert manifest["goldFileSha256"] == sha256(gold_path.read_bytes())
    assert len(g["sources"]) == 20
    assert {s["id"] for s in g["sources"]} == {
        c["id"] for c in corpus["cases"] if c["origin"] == "synthetic"
    }
    private = [c for c in manifest["cases"] if c["status"] == "LOCAL_PRIVATE"]
    assert len(private) == 12
    assert all(c["goldSha256"] == LOCAL_GOLD_SHA256["development"] for c in private)
    assert not {c["id"] for c in private} & {s["id"] for s in g["sources"]}
    assert {c["id"] for c in manifest["cases"]} == {c["id"] for c in corpus["cases"]}
    for source in g["sources"]:
        c = next(c for c in manifest["cases"] if c["id"] == source["id"])
        assert c["goldSha256"] == sha256(canonical_bytes(source))
        text = "\n".join(s["text"] for s in source["sentences"])
        # Self-score checks section and safety consistency, not model performance.
        report = score(
            {**g, "sources": [source]},
            [
                {
                    "id": source["id"],
                    "format": source["format"],
                    "modules": [
                        {"module": s["module"], "texts": [s["text"]]} for s in source["sentences"]
                    ],
                }
            ],
            {source["id"]: next(c["text"] for c in fixtures if c["id"] == source["id"])},
        )
        row = report["overall"]
        assert row["factRecall"]["hit"] == row["factRecall"]["total"]
        assert row["forbiddenViolations"] == 0
        assert row["unsupportedTokens"] == 0
        assert row["criticalGate"] == ("PASS" if text else "FAIL")
    assert sum(len(s["sentences"]) for s in g["sources"]) == 18
    assert sum(len(t["facts"]) for s in g["sources"] for t in s["sentences"]) == 24
    for case_id in ("09-support",):
        source = next(s for s in g["sources"] if s["id"] == case_id)
        assert source["sentences"] == []
        assert source["forbidden"] and all(f["kind"] == "platform" for f in source["forbidden"])
    delivery = next(s for s in g["sources"] if s["id"] == "06-delivery")
    assert delivery["sentences"][0]["section"] == "packing"
    assert delivery["sentences"][0]["module"] == "delivery"
    assert delivery["sentences"][0]["text"] == "수확 후 순차 출고해요."
    assert {f["text"] for f in delivery["forbidden"]} == {
        "익일 도착",
        "다음 날 도착",
        "도착일은 확정하지 않습니다",
    }
    pdf = next(s for s in g["sources"] if s["id"] == "20-pdf-table")
    assert {f["text"] for f in pdf["forbidden"]} == {"배송일"}
    weight = next(s for s in g["sources"] if s["id"] == "02-weight")
    assert weight["sentences"][0]["text"] == "감귤 5kg 한 상자입니다."


def test_AC_SRC_3_noncritical_miss_is_reported_without_critical_failure():
    report = result(g=gold(critical=False), r=run("새로운 소개입니다."), safe="새로운 소개입니다.")[
        "overall"
    ]
    assert report["factRecall"] == {"hit": 0, "total": 1, "rate": 0.0}
    assert report["criticalFactRecall"]["rate"] is None
    assert report["criticalGate"] == "PASS"


@pytest.mark.parametrize(
    "module,section",
    [("name", "intro"), ("historicalSales", "farm"), ("productionProcess", "production")],
)
def test_AC_SRC_3_final_text_section_aliases(module, section):
    g = gold(module=module, section=section)
    assert result(g=g, r=run(module=module))["overall"]["factRecall"]["hit"] == 1


def test_AC_SRC_2_all_four_formats_and_micro_denominators():
    g = gold()
    g["sources"] = []
    runs, safe = [], {}
    for fmt in ("text", "image", "long_image", "pdf"):
        source = copy.deepcopy(gold()["sources"][0])
        source.update(id=f"case-{fmt}", format=fmt)
        g["sources"].append(source)
        safe[source["id"]] = TEXT
        runs.append({**run(), "id": source["id"], "format": fmt})
    report = score(g, runs, safe)
    assert report["overall"]["factRecall"]["total"] == 4
    assert all(b["factRecall"]["rate"] == 1 for b in report["byFormat"].values())
    assert report["overall"]["bySection"]["composition"]["factRecall"]["total"] == 4


def test_AC_SRC_5_empty_gold_is_na_and_zero_fact_run_still_audited():
    report = score({"schemaVersion": 1, "split": "holdout", "sources": []}, [], {})
    assert report["overall"]["criticalGate"] == "N/A"
    assert report["overall"]["factRecall"]["rate"] is None
    g = gold()
    g["sources"][0]["sentences"] = []
    assert result(g=g, r=run("₩35,000"))["overall"]["criticalGate"] == "FAIL"


def test_AC_SRC_2_decimal_sentence_boundaries():
    assert split_sentences("당도 13.5브릭스입니다. 두 번째 문장!\n세 번째?") == [
        "당도 13.5브릭스입니다",
        "두 번째 문장!",
        "세 번째?",
    ]


@pytest.mark.parametrize("word,number", [("한", 1), ("두", 2), ("세", 3), ("네", 4)])
@pytest.mark.parametrize("unit", ["개", "상자", "박스"])
@pytest.mark.parametrize("ending", ["입니다.", "를 담았습니다.", "이며", "는", "."])
def test_AC_SRC_2_native_counts_match_with_korean_endings(word, number, unit, ending):
    text = f"감귤 {word} {unit}{ending}"
    assert contains([f"{word} {unit}"], text)
    assert contains([f"{number}{unit}"], text)
    assert contains([f"{word} {unit}"], f"감귤 {number}{unit}{ending}")
    assert sensitive_tokens(text)["number"] == {f"{number}{unit}"}


def test_AC_SRC_3_reverse_count_does_not_invent_unsupported_number():
    report = result(
        g=gold(tokens=["감귤", "한 상자"]),
        r=run("감귤 3kg 한 상자."),
        safe="감귤 3kg 한 상자입니다.",
    )["overall"]
    assert report["factRecall"]["rate"] == 1
    assert report["unsupportedTokens"] == 0
    assert report["criticalGate"] == "PASS"


def test_AC_SRC_2_verbatim_token_must_also_match_normalized_gold():
    # Raw inclusion alone succeeds, but the standalone token loses its context.
    g = gold(text="감귤 한 상자입니다.", tokens=["한"])
    assert "한" in g["sources"][0]["sentences"][0]["text"]
    with pytest.raises(ValueError, match="normalized gold"):
        Gold.model_validate(g)
    with pytest.raises(ValueError, match="redacted"):
        result(g=g)


@pytest.mark.parametrize("unit", ["Large", "large", "medium", "grams", "brixmeter", "kgBox"])
def test_AC_SRC_3_unit_prefix_does_not_match_english_word(unit):
    assert sensitive_tokens(f"3 {unit}")["number"] == {"3"}


@pytest.mark.parametrize(
    "left,right", [("1,000g", "1000g"), ("1,000.0g", "1000g"), ("12,345kg", "12345kg")]
)
def test_AC_SRC_3_thousands_separators_are_symmetric(left, right):
    assert compact(left) == compact(right)
    assert sensitive_tokens(left) == sensitive_tokens(right)
    for output, safe in [(left, right), (right, left)]:
        report = result(g=gold(text=safe, tokens=[safe]), r=run(output), safe=safe)["overall"]
        assert report["factRecall"]["hit"] == 1
        assert report["unsupportedTokens"] == 0
        assert report["criticalGate"] == "PASS"
    assert compact("1, 000g") != compact("1000g")


@pytest.mark.parametrize(
    "kind,word", [(kind, w) for kind, words in FORBIDDEN_WORDS.items() for w in words]
)
def test_AC_SRC_6_health_platform_words_fail_even_with_source_and_human_support(kind, word):
    text = TEXT + " " + word.replace(" ", "  ")
    r = run(text)
    sentences = split_sentences(text)
    r["supportJudgments"] = [
        {"sentenceIndex": i, "sentenceSha256": sha256(s.encode()), "supported": True}
        for i, s in enumerate(sentences)
    ]
    report = result(r=r, safe=text)["overall"]
    assert report["forbidden"][kind] == 1
    assert report["forbiddenViolations"] == 1
    assert report["precisionProxy"]["hit"] < report["precisionProxy"]["total"]
    assert report["criticalGate"] == "FAIL"


def test_AC_SRC_6_neutral_healthy_growing_is_allowed():
    text = "건강하게 키운 감귤입니다."
    report = result(g=gold(text=text, tokens=["건강하게 키운"]), r=run(text), safe=text)["overall"]
    assert report["forbiddenViolations"] == 0
    assert report["criticalGate"] == "PASS"


def test_AC_SRC_5_contract_and_extraction_counts_keep_overall_failures():
    g = gold()
    contract = copy.deepcopy(g["sources"][0])
    contract.update(id="contract-01", sentences=[])
    g["sources"].append(contract)
    report = score(g, [run()], {"holdout-01": TEXT, "contract-01": ""})
    assert [r["caseType"] for r in report["sources"]] == ["extraction", "contract"]
    assert report["overall"]["contractCases"] == 1
    assert report["overall"]["extractionCases"] == 1
    assert report["overall"]["criticalGate"] == "FAIL"
    assert report["byCaseType"]["extraction"]["criticalGate"] == "PASS"
    assert report["byCaseType"]["contract"]["criticalGate"] == "FAIL"
    assert report["byCaseType"]["contract"]["factRecall"]["rate"] is None
    assert "| contract |" in markdown(report)


@pytest.mark.parametrize("split", ["development", "holdout"])
def test_AC_SRC_6_local_list_gold_envelope_hash_lock_and_missing_where(
    tmp_path, monkeypatch, capsys, split
):
    source = copy.deepcopy(gold()["sources"][0])
    source.pop("format")
    source["sentences"][0].pop("where")
    gold_path = tmp_path / "local-gold.json"
    gold_path.write_text(json.dumps([source], ensure_ascii=False))
    digest = sha256(gold_path.read_bytes())
    monkeypatch.setitem(LOCAL_GOLD_SHA256, split, digest)
    lock = tmp_path / "lock.json"
    lock.write_text(json.dumps({"sha256": digest}))
    # 형식은 레포의 잠금 기록(holdout lock·dev manifest)과 대조한다.
    pins = tmp_path / "pins.json"
    pins.write_text(
        json.dumps(
            {
                "sources": [{"id": "holdout-01", "format": "text"}],
                "cases": [{"id": "holdout-01", "format": "text", "status": "LOCAL_PRIVATE"}],
            }
        )
    )
    monkeypatch.setattr(final_score, "HOLDOUT_LOCK", pins)
    monkeypatch.setattr(final_score, "DEV_MANIFEST", pins)
    reference = LocalGold(path="local-gold.json", split=split, lockPath="lock.json")
    with pytest.raises(ValueError, match="redacted"):
        load_local_gold(reference, tmp_path, {"holdout-01": "pdf"})
    loaded = load_local_gold(reference, tmp_path, {"holdout-01": "text"})
    assert loaded.sources[0].sentences[0].where is None
    assert loaded.split == split
    (tmp_path / "safe.txt").write_text(TEXT)
    (tmp_path / "output.json").write_text(json.dumps(run()))
    envelope = {
        "schemaVersion": 1,
        "gold": [reference.model_dump()],
        "sources": [
            {
                "id": "holdout-01",
                "format": "text",
                "safeTextPath": "safe.txt",
                "outputPath": "output.json",
            }
        ],
    }
    runs = tmp_path / "runs.json"
    runs.write_text(json.dumps(envelope))
    argv = [
        "--runs",
        str(runs),
        "--report",
        str(tmp_path / "report.json"),
        "--markdown",
        str(tmp_path / "report.md"),
    ]
    assert main(argv) == 0
    assert TEXT not in capsys.readouterr().out
    # Both private gold and lock files are protected against report overwrites.
    for destination in [gold_path, lock]:
        assert main([*argv[:-1], str(destination)]) == 2
    lock.write_text(json.dumps({"sha256": "0" * 64}))
    assert main(argv) == 2
    lock.write_text(json.dumps({"sha256": digest}))
    gold_path.write_text(gold_path.read_text() + "\n")
    assert main(argv) == 2
    output = capsys.readouterr().out
    assert TEXT not in output
    assert source["product"] not in output


def test_AC_SRC_6_private_gold_requires_pinned_hash_format_and_holdout_lock(tmp_path, monkeypatch):
    source = copy.deepcopy(gold()["sources"][0])
    source.pop("format")
    path = tmp_path / "gold.json"
    path.write_text(json.dumps([source]))
    reference = LocalGold(path="gold.json", split="holdout")
    with pytest.raises(ValueError, match="redacted"):
        load_local_gold(reference, tmp_path, {"holdout-01": "text"})
    monkeypatch.setitem(LOCAL_GOLD_SHA256, "holdout", sha256(path.read_bytes()))
    with pytest.raises(ValueError, match="redacted"):
        load_local_gold(reference, tmp_path, {"holdout-01": "text"})
    reference = reference.model_copy(update={"lockPath": "lock.json"})
    (tmp_path / "lock.json").write_text(json.dumps({"sha256": sha256(path.read_bytes())}))
    with pytest.raises(ValueError, match="redacted"):
        load_local_gold(reference, tmp_path, {})


def test_AC_SRC_6_validation_json_excludes_holdout_payloads_except_metadata_lock():
    def check(value):
        if isinstance(value, dict):
            assert value.get("split") != "holdout"
            for v in value.values():
                check(v)
        elif isinstance(value, list):
            for v in value:
                check(v)
        elif isinstance(value, str):
            assert "h3-" not in value

    # 최종 문구 정답 파일만 본다. 이전 기록(source-visual-* 등)의 split 값은 고치지 않는다.
    lock_path = VALIDATION / "source-final-holdout-i3-lock.json"
    # 평가 보고서(source-final-eval-*)는 holdout id·상태·집계만, 문장 필드는 없어야 한다.
    text_keys = {"text", "value", "sentences", "statement", "mustContain", "quote", "forbidden"}

    def no_text(value):
        if isinstance(value, dict):
            for key, v in value.items():
                if key in text_keys:
                    assert not isinstance(v, str)
                    assert not (isinstance(v, list) and any(isinstance(x, (str, dict)) for x in v))
                no_text(v)
        elif isinstance(value, list):
            for v in value:
                no_text(v)

    no_text({"formats": {"text": 21, "image": 6}, "text": {"rows": 3}})
    for key in text_keys:
        no_text({key: 0})
        no_text({key: []})
        for payload in (
            "SYNTHETIC_CONTENT",
            ["SYNTHETIC_CONTENT"],
            [{"id": "synthetic"}],
            [0, "SYNTHETIC_CONTENT"],
            {"nested": {"quote": "SYNTHETIC_CONTENT"}},
        ):
            with pytest.raises(AssertionError):
                no_text({"nested": [{key: payload}]})

    for path in VALIDATION.rglob("source-final-*.json"):
        if path.name.startswith("source-final-eval-"):
            no_text(json.loads(path.read_text()))
        elif path != lock_path:
            check(json.loads(path.read_text()))
    lock = json.loads(lock_path.read_text())
    assert set(lock) == {"name", "sha256", "sources", "totalSentences", "totalFacts", "policy"}
    assert lock["name"] == "source-holdout-i3-final-v1.1"
    assert lock["sha256"] == LOCAL_GOLD_SHA256["holdout"]
    assert lock["totalSentences"] == 146 and lock["totalFacts"] == 261
    assert lock["policy"] == "local only, never tune on it, run once after DEV-186 (T11/T23)"
    assert lock["sources"] == [
        {"id": f"h3-{fmt}-{i:02}", "format": fmt}
        for fmt in ("text", "image", "long_image", "pdf")
        for i in range(1, 4)
    ]


def test_AC_SRC_6_brix_unit_matches_regardless_of_neighbors():
    assert contains(["13~14", "브릭스"], "당도 13~14 브릭스입니다.")
    assert contains(["13.5Brix"], "13.2Brix, 13.5Brix가 나왔습니다.")
    assert contains(["12Brix"], "평균 12°Bx 이상")


def test_AC_SRC_6_gold_rejects_forbidden_words_and_self_forbidden_text():
    g = gold()
    g["sources"][0]["sentences"][0]["text"] += " 교환 가능합니다."
    with pytest.raises(ValidationError):
        Gold.model_validate(g)
    g = gold()
    token = g["sources"][0]["sentences"][0]["facts"][0]["mustContain"][0]
    g["sources"][0]["forbidden"] = [{"kind": "ui", "text": token}]
    with pytest.raises(ValidationError):
        Gold.model_validate(g)


def test_AC_SRC_6_list_markers_and_ranges_are_not_numbers_or_phones():
    tokens = sensitive_tokens("1. 감귤 3kg 한 상자입니다.")["number"]
    assert "1" not in tokens
    assert not PHONE_RE.search("1500-2000g 사이")
    assert not PHONE_RE.search("해발 1600-1800m")
    assert PHONE_RE.search("대표번호 1588-1234")


@pytest.mark.parametrize(
    "text",
    [
        "010-1234-5678과 이메일",
        "010-1234-5678 개인 휴대폰",
        "02-123-4567 상자 문의",
        "010-1234-5678 gmail.com",
        "1588-1234 mail",
        "고객센터 1588-1234 원하시는 시간",
        "1588-1234 개인 상담",
        "문의 1644-1234 상자 관련",
        "0505-123-4567",
        "010 - 1234 - 5678",
        "(010)1234-5678",
    ],
)
def test_AC_SRC_6_real_phone_numbers_are_still_detected(text):
    assert PHONE_RE.search(text)


def test_AC_SRC_6_korean_count_words_do_not_touch_months_or_persons():
    assert "1개월" not in compact("한 개월")
    assert "1개인" not in compact("한 개인 농가")
    assert "1개" in compact("한 개")


def test_AC_SRC_6_forbidden_text_is_matched_per_output_text_not_across_boundaries():
    g = gold()
    g["sources"][0]["forbidden"] = [{"kind": "other_product", "text": "비공개끝비공개시작"}]
    r = run()
    r["modules"] = [
        {"module": "composition", "texts": [r["modules"][0]["texts"][0] + " 비공개끝"]},
        {"module": "taste", "texts": ["비공개시작 맛"]},
    ]
    report = score(g, [r], {"holdout-01": TEXT})["overall"]
    assert report["forbidden"].get("gold_other_product", 0) == 0


def test_AC_SRC_6_regex_violations_do_not_cross_output_text_boundaries():
    r = run()
    r["modules"] = [
        {"module": "composition", "texts": [r["modules"][0]["texts"][0] + " 5"]},
        {"module": "taste", "texts": ["원하시는 맛"]},
    ]
    report = score(gold(), [r], {"holdout-01": TEXT + " 5"})["overall"]
    assert report["forbidden"]["price"] == 0


@pytest.mark.parametrize("text", ["080-123-4567", "1588–1234", "1588 - 1234"])
def test_AC_SRC_6_toll_free_and_dash_variants_are_phones(text):
    assert PHONE_RE.search(text)


def test_AC_SRC_6_scorer_reads_the_shared_product_safety_lists():
    from app.source_analysis.text_safety import MONEY, SAFETY_LISTS

    assert final_score.MONEY_RE is MONEY
    assert FORBIDDEN_WORDS == {k: tuple(SAFETY_LISTS[k]) for k in ("health", "platform")}
