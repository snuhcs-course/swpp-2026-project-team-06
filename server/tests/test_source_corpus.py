"""AC-SRC-1/2/3/5/6/8: independent offline protocol regressions; no provider calls."""

import copy
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

from app.source_analysis.corpus_score import (
    canonical_bytes,
    normalize,
    score,
    sha256,
    validate_manifest,
    value_hash,
)

MANIFEST = Path(__file__).resolve().parents[2] / "docs/spec/validation/source-corpus-i3-v1.json"
PROTOCOL = MANIFEST.with_suffix(".md")
MANIFEST_SHA256 = "95a75ca765ccf66c559dc0fc24ed41b2a0c268d2a8aca7206bdec8e2fc41cd6d"


def candidate(value="감귤 5kg", field="composition", target="product-a"):
    return {"targetId": target, "fieldKey": field, "value": value}


def protocol(values=None, fmt="text", split="development"):
    values = [candidate()] if values is None else values
    case = {
        "id": "case-a",
        "split": split,
        "format": fmt,
        "purpose": "extraction",
        "usedForPromptIteration": split == "development",
        "safeInputSha256": "a" * 64,
        "sourceSpans": [{"id": "gold-1", "safeInputMapping": "VERIFIED_WHITESPACE_ONLY"}],
        "expected": [
            {
                "targetId": c["targetId"],
                "fieldKey": c["fieldKey"],
                "exactSha256": value_hash(c["value"], "exact"),
                "normalizedSha256": value_hash(c["value"], "normalized"),
                "sourceSpanIds": ["gold-1"],
            }
            for c in values
        ],
    }
    if fmt == "pdf":
        case["pdfOrigin"] = "original"
    manifest = {
        "version": "source-corpus-i3-v1",
        "normalization": "source-normalization-v1",
        "holdout": {
            "status": "LOCKED" if split == "holdout" else "BLOCKED",
            "ids": ["case-a"] if split == "holdout" else [],
        },
        "cases": [case],
    }
    return manifest


def run(actual=None, status="EVALUATED", rejected=None):
    actual = [candidate()] if actual is None else actual
    rejected = [] if rejected is None else rejected
    return {
        "id": "case-a",
        "safeInputSha256": "a" * 64,
        "status": status,
        "actual": actual,
        "rejected": rejected,
        "criticalAudit": {
            "complete": True,
            "reviewer": "reviewer-1",
            "candidates": [
                {
                    "candidateSha256": sha256(canonical_bytes(c)),
                    "categories": ["numeric"],
                    "supported": True,
                    "sourceSpanIds": ["gold-1"],
                }
                for c in actual + rejected
            ],
        },
    }


def test_AC_SRC_2_frozen_inventory_hash_and_gold():
    data = MANIFEST.read_bytes()
    assert sha256(data) == MANIFEST_SHA256
    assert sha256(data) in PROTOCOL.read_text()
    manifest = json.loads(data)
    validate_manifest(manifest)
    assert manifest["createdDate"] == "2026-10-31"
    assert manifest["priorManifest"]["sha256"] == (
        "097dbcef182bbdb57d6b2857fca8bf0e36a208327ba660bd6efe11d7138b462b"
    )
    cases = manifest["cases"]
    assert len(cases) == 32 and all(c["goldExists"] for c in cases)
    extraction = [c for c in cases if c["purpose"] == "extraction"]
    assert Counter(c["format"] for c in extraction) == {
        "text": 19,
        "image": 6,
        "long_image": 1,
        "pdf": 4,
    }
    assert len(manifest["cohorts"]["syntheticExtraction"]) == 18
    assert set(manifest["cohorts"]["visionReusedSubset"]) < set(manifest["cohorts"]["real"])
    assert all(c["split"] == "development" for c in cases)
    assert sum(c["i2Split"] == "holdout" for c in cases) == 4
    assert sum(len(c["expected"]) for c in cases) == 53
    assert {c["id"]: c["pdfOrigin"] for c in cases if c["format"] == "pdf"} == {
        "farm-father": "crop",
        "farm-jun": "crop",
        "oasis-storage": "image_to_pdf",
        "20-pdf-table": "image_to_pdf",
    }
    # Sensitive values/quotes are content-addressed, never embedded in the freeze.
    assert all("value" not in g for c in cases for g in c["expected"])
    assert all("quote" not in s for c in cases for s in c["sourceSpans"])


@pytest.mark.parametrize(
    "left,right",
    [
        ("감귤\n 5 KG", "감귤 5kg"),
        ("감귤 5.00킬로그램", "감귤 5kg"),
        ("평균 12.0 °Bx", "평균 12브릭스"),
        ("감귤 한 상자", "감귤 1상자"),
        ("‘감귤’ ( 제주 )", "'감귤'(제주)"),
        ("3-5 kg", "3-5kg"),
        ("3~5 kg", "3~5kg"),
        ("3-5.00 KG", "3-5kg"),
        ("3~5.00 KG", "3~5kg"),
        ("감귤 , 사과", "감귤,사과"),
    ],
)
def test_AC_SRC_3_normalization_equivalent(left, right):
    assert normalize(left) == normalize(right)


@pytest.mark.parametrize(
    "left,right",
    [
        ("10월 중순~11월 중순", "10월 중순-11월 중순"),
        ("예상 12브릭스", "실측 12브릭스"),
        ("감귤 5kg", "감귤 5000g"),
        ("유기농 미인증", "유기농 인증"),
        ("한라봉", "1라봉"),
        ("감귤 5kg", "감굴 5kg"),
        ("수량 미확인", "수량 20개"),
        ("1,050g", "1,50g"),
        ("1, 050g", "1,050g"),
        ("1, 050g", "1, 50g"),
        ("1 , 050g", "1 , 50g"),
        ("3-5 kg", "3~5 kg"),
        ("3-5 kg", "3 5 kg"),
        ("1,000g", "1,0g"),
        ("+2브릭스", "2브릭스"),
        ("-0브릭스", "0브릭스"),
    ],
)
def test_AC_SRC_3_normalization_preserves_facts(left, right):
    assert normalize(left) != normalize(right)


@pytest.mark.parametrize(
    "value,expected",
    [
        ("3-5 kg", "3-5kg"),
        ("3~5 kg", "3~5kg"),
        ("1, 050g", "1, 050g"),
        ("1 , 050g", "1 , 050g"),
        ("1,050g", "1,050g"),
    ],
)
def test_AC_SRC_3_normalization_range_and_numeric_comma_outputs(value, expected):
    assert normalize(value) == expected


@pytest.mark.parametrize("fmt", ["text", "image", "long_image", "pdf"])
def test_AC_SRC_2_format_and_field_precision_recall(fmt):
    result = score(protocol(fmt=fmt), [run()], "development")
    assert result["status"] == "PASS"
    assert result["independentEvaluation"] is False
    metrics = result["exact"]["byFormatField"][fmt]["composition"]
    assert metrics == {"tp": 1, "fp": 0, "fn": 0, "precision": 1, "recall": 1}
    assert result["exact"]["byField"]["storage"]["precision"] is None


@pytest.mark.parametrize("correct_count,verdict", [(20, "PASS"), (18, "FAIL")])
def test_AC_SRC_2_DEV_152_combined_image_gate_keeps_separate_diagnostics(correct_count, verdict):
    values = [candidate(f"감귤 {n}kg") for n in range(1, correct_count + 1)]
    manifest = protocol(values, fmt="image")
    long_case = protocol(fmt="long_image")["cases"][0]
    long_case["id"] = "case-long"
    manifest["cases"].append(long_case)
    long_run = run([candidate("감귤 999kg")])
    long_run["id"] = "case-long"
    result = score(manifest, [run(values), long_run], "development")
    assert result["status"] == verdict
    assert result["exact"]["byFormat"]["image"]["precision"] == 1
    assert result["exact"]["byFormat"]["long_image"]["precision"] == 0
    assert result["exact"]["byFormatGroup"]["image"] == {
        "tp": correct_count,
        "fp": 1,
        "fn": 1,
        "precision": correct_count / (correct_count + 1),
        "recall": correct_count / (correct_count + 1),
    }
    assert result["caseCounts"]["byFormatGroup"]["image"] == 2


@pytest.mark.parametrize("origin", ["original", "crop", "image_to_pdf", "web_print"])
def test_AC_SRC_2_DEV_152_pdf_origin_diagnostics(origin):
    manifest = protocol(fmt="pdf")
    manifest["cases"][0]["pdfOrigin"] = origin
    result = score(manifest, [run()], "development")
    assert result["status"] == "PASS"
    for mode in ("exact", "normalized"):
        assert result[mode]["byPdfOrigin"][origin] == result[mode]["byFormatGroup"]["pdf"]
        assert sum(m["tp"] for m in result[mode]["byPdfOrigin"].values()) == 1
    assert result["caseCounts"]["byPdfOrigin"][origin] == 1


@pytest.mark.parametrize("origin", [None, "unknown"])
def test_AC_SRC_2_pdf_origin_required(origin):
    manifest = protocol(fmt="pdf")
    if origin is None:
        manifest["cases"][0].pop("pdfOrigin")
    else:
        manifest["cases"][0]["pdfOrigin"] = origin
    with pytest.raises(ValueError, match="PDF origin"):
        validate_manifest(manifest)


def test_AC_SRC_3_DEV_152_applied_page_audit_is_blocked_without_workflow_evidence():
    result = score(protocol(), [run()], "development")
    audit = result["appliedPageAudit"]
    assert audit["status"] == "BLOCKED"
    assert audit["reason"] and audit["owner"] and audit["nextAction"]
    assert "offline extraction only" in result["note"]


def test_AC_SRC_1_wrong_target_wrong_field_and_duplicate_predictions():
    actual = [candidate(), candidate(), candidate(target=None), candidate(field="storage")]
    result = score(protocol(), [run(actual)], "development")
    assert result["exact"]["overall"] == {
        "tp": 1,
        "fp": 3,
        "fn": 0,
        "precision": 0.25,
        "recall": 1,
    }
    result = score(protocol(), [run([candidate(target="product-b")])], "development")
    assert result["exact"]["overall"]["fn"] == 1


def test_AC_SRC_2_exact_primary_and_normalized_diagnostic():
    result = score(protocol(), [run([candidate("감귤 5.00 KG")])], "development")
    assert result["exact"]["overall"]["tp"] == 0
    assert result["normalized"]["overall"]["tp"] == 1
    assert result["status"] == "FAIL"


@pytest.mark.parametrize("status", ["FAILED", "EMPTY", "REJECTED", "NOT_RUN"])
def test_AC_SRC_5_failures_empty_rejected_keep_gold_denominator(status):
    result = score(protocol(), [run([], status)], "development")
    assert result["exact"]["overall"]["recall"] == 0
    assert result["exact"]["overall"]["precision"] is None
    assert result["byStatus"][status] == 1
    assert result["status"] == ("BLOCKED" if status == "NOT_RUN" else "FAIL")


def test_AC_SRC_5_missing_runs_and_rejected_candidates():
    missing = score(protocol(), [], "development")
    assert missing["status"] == "BLOCKED" and missing["byStatus"]["NOT_RUN"] == 1
    partial = score(protocol(), [run([], "PARTIAL", [candidate()])], "development")
    assert partial["exact"]["overall"] == {
        "tp": 0,
        "fp": 1,
        "fn": 1,
        "precision": 0,
        "recall": 0,
    }
    failed = score(protocol(), [run(status="FAILED")], "development")
    assert failed["exact"]["overall"]["tp"] == 0


def test_AC_SRC_3_empty_gold_hallucination_and_safe_abstention():
    result = score(protocol([]), [run()], "development")
    assert result["exact"]["overall"]["fp"] == 1
    assert result["exact"]["overall"]["recall"] is None
    result = score(protocol([]), [run([])], "development")
    assert result["exact"]["overall"]["precision"] is None
    assert result["status"] == "BLOCKED"
    assert result["undefinedMetrics"] == {
        "text": {
            "precision": "N/A: denominator is zero",
            "recall": "N/A: denominator is zero",
        }
    }
    assert result["evidenceSupport"]["overall"] == {"supported": 0, "total": 0, "rate": None}


@pytest.mark.parametrize(
    "category", ["numeric", "date", "cultivar", "certification", "qualityEvidence"]
)
def test_AC_SRC_3_unsupported_critical_claim_fails_even_rejected(category):
    record = run([], "REJECTED", [candidate()])
    entry = record["criticalAudit"]["candidates"][0]
    entry.update(categories=[category], supported=False, sourceSpanIds=[])
    result = score(protocol(), [record], "development")
    assert result["criticalAudit"] == {"status": "FAIL", "unsupported": 1}
    assert result["status"] == "FAIL"


def test_AC_SRC_3_missing_incomplete_stale_or_unlocated_audit_blocks():
    for change in ("absent", "incomplete", "stale", "bad_span", "missing_categories"):
        record = run()
        if change == "absent":
            record.pop("criticalAudit")
        elif change == "incomplete":
            record["criticalAudit"]["candidates"] = []
        elif change == "stale":
            record["actual"][0]["value"] = "다른 값"
        elif change == "missing_categories":
            record["criticalAudit"]["candidates"][0].pop("categories")
        else:
            record["criticalAudit"]["candidates"][0]["sourceSpanIds"] = ["unknown"]
        assert score(protocol(), [record], "development")["status"] == "BLOCKED"


def test_AC_SRC_3_incomplete_audit_cannot_hide_known_unsupported_fact():
    record = run([candidate(), candidate("감귤 10kg")])
    record["criticalAudit"]["complete"] = False
    record["criticalAudit"]["candidates"][0]["supported"] = False
    record["criticalAudit"]["candidates"].pop()
    result = score(protocol(), [record], "development")
    assert result["status"] == "FAIL"
    assert result["criticalAudit"]["unsupported"] == 1


@pytest.mark.parametrize(
    "review",
    [
        None,
        [],
        {"candidates": [None]},
        {"candidates": ["PRIVATE_AUDIT"]},
        {"candidates": [{}, None]},
    ],
)
def test_AC_SRC_3_malformed_audit_cli_fails_without_score_or_traceback(tmp_path, review):
    manifest = protocol()
    record = run()
    record["criticalAudit"] = review
    with pytest.raises(ValueError, match="Invalid .*audit"):
        score(manifest, [record], "development")
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_bytes(canonical_bytes(manifest))
    runs_path = tmp_path / "runs.json"
    runs_path.write_bytes(canonical_bytes([record]))
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.source_analysis.corpus_score",
            str(manifest_path),
            str(runs_path),
            "--manifest-sha256",
            sha256(manifest_path.read_bytes()),
            "--split",
            "development",
        ],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 1 and not completed.stdout
    assert completed.stderr.strip() == "Invalid scoring input; no score produced"


def test_AC_SRC_2_unverified_gold_locations_block_pass():
    manifest = protocol()
    manifest["cases"][0]["sourceSpans"][0]["safeInputMapping"] = "BLOCKED_NEEDS_SOURCE_REVIEW"
    result = score(manifest, [run()], "development")
    assert result["exact"]["overall"]["precision"] == 1
    assert result["status"] == "BLOCKED" and result["unmappedGoldSpans"] == 1


def test_AC_SRC_2_holdout_cannot_be_empty_or_contaminated():
    manifest = json.loads(MANIFEST.read_text())
    assert score(manifest, [])["status"] == "BLOCKED"
    manifest["holdout"]["status"] = "LOCKED"
    with pytest.raises(ValueError, match="empty holdout"):
        validate_manifest(manifest)
    manifest = protocol(split="holdout")
    assert score(manifest, [run()])["status"] == "PASS"
    manifest["cases"][0]["usedForPromptIteration"] = True
    with pytest.raises(ValueError, match="contamination"):
        validate_manifest(manifest)


@pytest.mark.parametrize("change", ["duplicate", "unknown", "split", "checksum", "field", "status"])
def test_AC_SRC_2_invalid_runs_cannot_silently_change_population(change):
    records = [run()]
    if change == "duplicate":
        records.append(copy.deepcopy(records[0]))
    elif change == "unknown":
        records[0]["id"] = "unknown"
    elif change == "checksum":
        records[0]["safeInputSha256"] = "b" * 64
    elif change == "field":
        records[0]["actual"][0]["fieldKey"] = "price"
    elif change == "status":
        records[0]["status"] = "SUCCESS"
    with pytest.raises(ValueError):
        score(protocol(), records, "holdout" if change == "split" else "development")


def test_AC_SRC_6_cli_hash_pin_and_blocked_exit_without_private_output(tmp_path):
    runs = tmp_path / "runs.json"
    runs.write_text("[]")
    command = [
        sys.executable,
        "-m",
        "app.source_analysis.corpus_score",
        str(MANIFEST),
        str(runs),
        "--manifest-sha256",
        sha256(MANIFEST.read_bytes()),
    ]
    completed = subprocess.run(
        command, cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True
    )
    assert completed.returncode == 2
    report = json.loads(completed.stdout)
    assert report["status"] == "BLOCKED" and report["cases"] == 0
    command[-1] = "0" * 64
    completed = subprocess.run(
        command, cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True
    )
    assert completed.returncode != 0 and not completed.stdout
    assert "Manifest digest mismatch" in completed.stderr


@pytest.mark.parametrize(
    "fmt,group", [("text", "text"), ("image", "image"), ("long_image", "image"), ("pdf", "pdf")]
)
@pytest.mark.parametrize("supported,verdict", [(True, "PASS"), (False, "FAIL")])
def test_AC_SRC_2_DEV_152_all_accepted_facts_require_evidence(fmt, group, supported, verdict):
    ordinary = candidate("서늘한 곳에 보관", field="storage")
    record = run([ordinary])
    record["criticalAudit"]["candidates"][0].update(categories=[], supported=supported)
    result = score(protocol([ordinary], fmt=fmt), [record], "development")
    assert result["status"] == verdict
    expected = {"supported": int(supported), "total": 1, "rate": int(supported)}
    assert result["evidenceSupport"]["overall"] == expected
    assert result["evidenceSupport"]["byFormatGroup"][group] == expected
    assert result["criticalAudit"] == {"status": "PASS", "unsupported": 0}


@pytest.mark.parametrize(
    "missing", ["entry", "supported", "sourceSpanIds", "unknown_span", "empty_spans"]
)
def test_AC_SRC_2_DEV_152_ordinary_fact_missing_evidence_blocks(missing):
    ordinary = candidate("서늘한 곳에 보관", field="storage")
    record = run([ordinary])
    entries = record["criticalAudit"]["candidates"]
    entries[0]["categories"] = []
    if missing == "entry":
        entries.clear()
    elif missing == "unknown_span":
        entries[0]["sourceSpanIds"] = ["not-gold"]
    elif missing == "empty_spans":
        entries[0]["sourceSpanIds"] = []
    else:
        entries[0].pop(missing)
    result = score(protocol([ordinary]), [record], "development")
    assert result["status"] == "BLOCKED"
    assert result["evidenceSupport"]["overall"] == {"supported": 0, "total": 1, "rate": 0}


def test_AC_SRC_2_DEV_152_evidence_rate_aggregates_groups_excludes_rejected():
    manifest = protocol([candidate(), candidate("감귤 10kg")])
    image_case = protocol(fmt="long_image")["cases"][0]
    image_case["id"] = "case-image"
    manifest["cases"].append(image_case)
    text_run = run([candidate(), candidate("감귤 10kg")], rejected=[candidate("광고 문구")])
    text_run["criticalAudit"]["candidates"][1].update(categories=[], supported=False)
    text_run["criticalAudit"]["candidates"][2] = {
        "candidateSha256": sha256(canonical_bytes(text_run["rejected"][0])),
        "categories": [],
    }
    image_run = run()
    image_run["id"] = "case-image"
    result = score(manifest, [text_run, image_run], "development")
    assert result["status"] == "FAIL"
    assert result["evidenceSupport"] == {
        "overall": {"supported": 2, "total": 3, "rate": 2 / 3},
        "byFormatGroup": {
            "text": {"supported": 1, "total": 2, "rate": 0.5},
            "image": {"supported": 1, "total": 1, "rate": 1},
            "pdf": {"supported": 0, "total": 0, "rate": None},
        },
    }


def test_AC_SRC_2_DEV_152_missing_audit_cannot_hide_unsupported_ordinary_fact():
    record = run([candidate(), candidate("감귤 10kg")])
    record["criticalAudit"]["complete"] = False
    record["criticalAudit"]["candidates"][0].update(categories=[], supported=False)
    record["criticalAudit"]["candidates"].pop()
    assert score(protocol(), [record], "development")["status"] == "FAIL"


def test_AC_SRC_2_DEV_152_zero_denominator_group_blocks_with_reason():
    manifest = protocol()
    empty_case = protocol([], fmt="image")["cases"][0]
    empty_case["id"] = "case-empty"
    manifest["cases"].append(empty_case)
    empty_run = run([])
    empty_run["id"] = "case-empty"
    result = score(manifest, [run(), empty_run], "development")
    assert result["status"] == "BLOCKED"
    assert result["exact"]["byFormatGroup"]["text"]["precision"] == 1
    assert result["exact"]["byFormatGroup"]["image"]["precision"] is None
    assert result["undefinedMetrics"] == {
        "image": {
            "precision": "N/A: denominator is zero",
            "recall": "N/A: denominator is zero",
        }
    }
