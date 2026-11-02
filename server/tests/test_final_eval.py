"""AC-SRC-2/3/5/6: stage-2 evaluator, private artifacts, no live calls."""

import copy
import csv
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from openai import APIStatusError
from sqlalchemy import select

from app.ai import source_analysis as ai
from app.ai.source_refine import Refinement, RefineResponse
from app.core.db import get_sessionmaker
from app.source_analysis import budget, final_score
from app.source_analysis import final_eval as ev
from app.source_analysis.models import Spend


def row(text=ai.MOCK_TEXT, sid="case-01", fmt="text"):
    return {
        "id": sid,
        "format": fmt,
        "data": text.encode(),
        "mime": "text/plain",
        "suffix": ".txt",
        "inputSha256": final_score.sha256(text.encode()),
    }


def gold(path, sid="case-01"):
    value = {
        "schemaVersion": 1,
        "split": "development",
        "sources": [
            {
                "id": sid,
                "format": "text",
                "product": "PRIVATE PRODUCT DO NOT REPORT",
                "sentences": [
                    {
                        "section": "intro",
                        "module": "summary",
                        "text": "제주산 감귤입니다.",
                        "facts": [
                            {
                                "id": "f1",
                                "statement": "PRIVATE FACT DO NOT REPORT",
                                "mustContain": ["제주산"],
                                "critical": True,
                            }
                        ],
                    }
                ],
                "forbidden": [],
            }
        ],
    }
    ev.write_json(path, value)
    return path


def setup_output(tmp_path, monkeypatch, text=ai.MOCK_TEXT):
    monkeypatch.setattr(ev, "ROOT", Path("/imaginary/repo"))
    r = row(text)
    calls = ev.Calls("mock", 3)
    result = ev.evaluate_source(r, "mock", "mock-model", calls)
    ev.write_envelope(tmp_path, [r], [result], [])
    gp = gold(tmp_path / "gold.json")
    ev.write_json(
        tmp_path / "metadata.json",
        {"provider": "mock", "model": "mock-model", "sources": [result[1]], "goldFiles": [str(gp)]},
    )
    return result, gp


def test_AC_SRC_2_envelope_scores_validated_stored_stage2(tmp_path, monkeypatch):
    result, gp = setup_output(tmp_path, monkeypatch)
    envelope = final_score.FileEnvelope.model_validate(ev.read_json(tmp_path / "runs.json"))
    source = envelope.sources[0]
    record = final_score.Run.model_validate(ev.read_json(tmp_path / source.outputPath))
    assert record.status == "EVALUATED"
    assert record.modules
    stored = ev.read_json(tmp_path / "case-01.stored.json")
    assert result[0]["modules"] == [
        {"module": m["module"], "texts": [t["value"] for t in m["texts"]]}
        for m in stored["modules"]
    ]
    assert all(t["candidateIds"] for m in stored["modules"] for t in m["texts"])
    report = ev.report(tmp_path, [gp])
    assert report["quality"]["overall"]["factRecall"]["rate"] == 1
    assert report["acceptance"] == "BLOCKED"
    assert (tmp_path / source.safeTextPath).read_text() == ai.MOCK_TEXT


def test_AC_SRC_6_reports_and_stdout_redact_private_text(tmp_path, monkeypatch, capsys):
    _, gp = setup_output(tmp_path, monkeypatch)
    ev.report(tmp_path, [gp])
    outputs = (
        "".join(
            (tmp_path / name).read_text()
            for name in ("report.json", "report.md", "score.json", "score.md")
        )
        + capsys.readouterr().out
    )
    for secret in (ai.MOCK_TEXT, "제주산", "PRIVATE PRODUCT", "PRIVATE FACT", str(tmp_path)):
        assert secret not in outputs
    assert "case-01" in outputs


def test_AC_SRC_2_3_mock_unknown_opt_in_and_real_path(monkeypatch):
    r = row("모델을 호출하지 않는 비공개 입력")
    chunk = {"checksum": r["inputSha256"]}
    with pytest.raises(ai.ExtractionError, match="UNSUPPORTED_MOCK_SOURCE"):
        ai.extract("mock", "mock", chunk, [], [])
    monkeypatch.setattr(ai, "OpenAI", lambda **kw: pytest.fail("No model clients in mock"))
    result = ev.evaluate_source(r, "mock", "mock", ev.Calls("mock", 3))
    assert result[0]["status"] == "EMPTY"
    assert result[1]["stage1Ms"] is not None
    assert result[1]["stage2Ms"] is not None
    assert result[1]["costUsd"] == 0


def test_AC_SRC_3_refinement_rejection_never_reaches_envelope(tmp_path, monkeypatch):
    monkeypatch.setattr(
        ev.refine_ai,
        "refine",
        lambda *a: RefineResponse(
            Refinement.model_validate(
                {
                    "modules": [
                        {
                            "module": "summary",
                            "texts": [{"value": "당도 999브릭스", "candidateIds": ["c-0"]}],
                        }
                    ],
                    "excluded": [],
                }
            ),
            {"mock": True},
            None,
        ),
    )
    r = row()
    result = ev.evaluate_source(r, "mock", "mock", ev.Calls("mock", 3))
    ev.write_envelope(tmp_path, [r], [result], [])
    assert ev.read_json(tmp_path / "case-01.output.json")["modules"] == []
    assert result[1]["rejectedTexts"] == 1
    assert result[1]["emptyReason"] == "ALL_TEXTS_FILTERED"


@pytest.mark.parametrize("limit", [0, -1, float("inf"), float("nan")])
def test_AC_SRC_5_budget_invalid_limits(limit):
    with pytest.raises(ValueError):
        ev.Calls("mock", limit)


def test_AC_SRC_5_budget_blocks_before_provider_or_db(monkeypatch):
    monkeypatch.setattr(budget, "estimate_micros", lambda *a, **kw: 100001)
    monkeypatch.setattr(ev, "get_sessionmaker", lambda: pytest.fail("No DB before guard"))
    calls = ev.Calls("openrouter", 0.1)
    with pytest.raises(ai.ExtractionError, match="BUDGET_EXCEEDED"):
        calls("extract", "model", {}, [], [], lambda: pytest.fail("No paid call"))
    assert calls.entries == []
    assert calls.used == 0


@pytest.mark.parametrize("cost", [None, 0.01])
def test_AC_SRC_5_budget_spend_settlement_and_uncertain_charge(monkeypatch, cost):
    from app.core.config import get_settings

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", True)
    calls = ev.Calls("openrouter", 1)

    def failure():
        raise ai.ExtractionError("REQUEST_UNCERTAIN", usage={} if cost is None else {"cost": cost})

    expected = budget.estimate_micros("openrouter", "google/gemini-3-flash-preview", {}, [], [])
    with pytest.raises(ai.ExtractionError, match="REQUEST_UNCERTAIN"):
        calls("extract", "google/gemini-3-flash-preview", {}, [], [], failure)
    assert calls.used == (expected if cost is None else 10000)
    summary = ev.costs(calls.entries)
    assert summary["reservedUsd"] == expected / 1e6
    assert summary["costUsd"] == summary["settledUsd"] == (0 if cost is None else cost)
    assert summary["unsettledReservedUsd"] == (expected / 1e6 if cost is None else 0)
    with get_sessionmaker()() as db:
        spend = db.scalar(select(Spend).where(Spend.evaluation.is_(True)))
        assert spend.reserved_micros == expected
        assert spend.charged_micros == (None if cost is None else 10000)
    calls.limit = calls.used + expected - 1
    with pytest.raises(ai.ExtractionError, match="BUDGET_EXCEEDED"):
        calls(
            "extract",
            "google/gemini-3-flash-preview",
            {},
            [],
            [],
            lambda: pytest.fail("Cumulative cap must block"),
        )


def test_AC_SRC_5_holdout_once_ack_force_and_failure_retention(tmp_path):
    gp = tmp_path / "gold.json"
    gp.write_text("[]")
    with pytest.raises(ValueError, match="holdout-runs-once"):
        ev.claim_holdout(gp, False)
    with pytest.raises(ValueError, match="rerun-reason"):
        ev.claim_holdout(gp, True, force=True)
    assert list(tmp_path.iterdir()) == [gp]
    marker = ev.claim_holdout(gp, True)
    assert ev.read_json(marker)["attempt"] == 1
    assert ev.read_json(marker)["rerunReason"] is None
    original = marker.read_bytes()
    with pytest.raises(FileExistsError):
        ev.claim_holdout(gp, True)
    forced = ev.claim_holdout(gp, True, force=True, rerun_reason="Synthetic safety regression")
    assert forced != marker
    assert marker.read_bytes() == original
    assert forced.exists()
    assert ev.read_json(forced)["attempt"] == 2
    assert ev.read_json(forced)["rerunReason"] == "Synthetic safety regression"
    third = ev.claim_holdout(gp, True, force=True, rerun_reason="Synthetic third attempt")
    assert ev.read_json(third)["attempt"] == 3


def test_AC_SRC_2_format_aggregation_nearest_rank_and_missing_latency():
    values = []
    for n in range(1, 21):
        values.append(
            {
                "format": "text",
                "status": "EVALUATED",
                "preprocessMs": n,
                "stage1Ms": n * 2,
                "stage2Ms": n * 3,
                "endToEndMs": n * 6,
                "costUsd": 0.01,
                "costKnown": True,
            }
        )
    failed = copy.deepcopy(values[0])
    failed.update(format="pdf", status="FAILED", stage2Ms=None, costKnown=False)
    result = ev.aggregate([*values, failed])
    assert result["text"]["endToEndMs"] == {"observed": 20, "p50": 63, "p95": 114}
    assert result["text"]["stage1Ms"]["p95"] == 38
    assert result["text"]["totalCostUsd"] == pytest.approx(0.2)
    assert result["text"]["meanCostUsd"] == pytest.approx(0.01)
    assert result["pdf"]["stage2Ms"]["p95"] is None
    assert result["pdf"]["costsKnown"] is False
    assert result["image"]["meanCostUsd"] is None


def test_AC_SRC_3_6_worksheet_roundtrip_and_tamper_rejected(tmp_path, monkeypatch):
    setup_output(tmp_path, monkeypatch)
    ev.worksheets(tmp_path)
    path = tmp_path / "audit.csv"
    with path.open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert rows
    rows[0]["supported"] = "false"
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=ev.AUDIT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    ev.import_audit(tmp_path, path)
    saved = (tmp_path / "case-01.output.json").read_bytes()
    assert (
        ev.read_json(tmp_path / "case-01.output.json")["supportJudgments"][0]["supported"] is False
    )
    rows[0]["sentenceSha256"] = "0" * 64
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=ev.AUDIT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    with pytest.raises(ValueError):
        ev.import_audit(tmp_path, path)
    assert (tmp_path / "case-01.output.json").read_bytes() == saved


def test_AC_SRC_3_critical_worksheet_numbers_dates_cultivar_certification(tmp_path):
    texts = ["당도 13Brix", "11월 수확", "한라봉입니다", "GAP 인증", "향이 좋아요"]
    r = row()
    record = {
        "id": r["id"],
        "format": "text",
        "status": "EVALUATED",
        "modules": [{"module": "summary", "texts": texts}],
    }
    ev.write_envelope(tmp_path, [r], [(record, {}, "\n".join(texts), {})], [])
    ev.worksheets(tmp_path)
    with (tmp_path / "audit.csv").open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert [r["critical"] for r in rows] == ["true", "true", "true", "true", "false"]
    with (tmp_path / "critical-audit.csv").open(newline="") as stream:
        critical = list(csv.DictReader(stream))
    assert len(critical) == 4
    assert all(r["critical"] == "true" for r in critical)


def test_AC_SRC_6_private_destination_rejects_checkout():
    with pytest.raises(ValueError):
        ev.private_path(ev.ROOT / "private-output")


def test_AC_SRC_5_nonmock_requires_yes_without_provider_call(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ev, "dataset", lambda *a: [row()])
    monkeypatch.setattr(ev, "load_gold", lambda *a: pytest.fail("No gold needed without consent"))
    assert ev.main(["--provider", "openrouter", "--out", str(tmp_path / "new")]) == 2
    assert '"estimate"' in capsys.readouterr().out
    assert not (tmp_path / "new").exists()


def test_AC_SRC_5_holdout_missing_ack_never_loads_gold(tmp_path, monkeypatch):
    monkeypatch.setattr(ev, "dataset", lambda *a: [row()])
    monkeypatch.setattr(ev, "load_gold", lambda *a: pytest.fail("No locked gold before ack"))
    assert (
        ev.main(["--split", "holdout", "--provider", "openrouter", "--out", str(tmp_path / "new")])
        == 2
    )


def test_AC_SRC_2_3_human_gate_cannot_pass_incomplete_or_negative_audits():
    quality = {
        "byFormat": {"text": {"sources": 1, "factRecall": {"rate": 1}, "criticalGate": "PASS"}}
    }
    audit = {"text": {"sentences": 1, "reviewed": 0}}
    assert ev.targets(quality, audit, "openrouter")["text"]["result"] == "BLOCKED"
    audit["text"].update(reviewed=1, supported=1, sourcesReviewed=1)
    assert ev.targets(quality, audit, "openrouter")["text"]["result"] == "PASS"
    assert ev.targets(quality, audit, "mock")["text"]["result"] == "BLOCKED"
    audit["text"]["sourceAuditFailures"] = 1
    assert ev.targets(quality, audit, "openrouter")["text"]["result"] == "FAIL"


def test_AC_SRC_2_frozen_inputs_preserve_pdf_bytes_and_refuse_changed_safe(tmp_path):
    r = {**row(), "synthetic": True}
    ev.save_inputs(tmp_path, [r])
    regenerated = {**r, "data": b"different timestamp", "inputSha256": "0" * 64}
    assert ev.frozen_inputs([regenerated], [tmp_path / "inputs.json"])[0]["data"] == r["data"]
    regenerated.update(synthetic=False, inputSha256="0" * 64)
    with pytest.raises(ValueError, match="Safe input changed"):
        ev.frozen_inputs([regenerated], [tmp_path / "inputs.json"])
    (tmp_path / "inputs/case-01.txt").write_bytes(b"changed snapshot")
    with pytest.raises(ValueError, match="Frozen source changed"):
        ev.frozen_inputs([r], [tmp_path / "inputs.json"])


def test_AC_SRC_5_budget_abort_preserves_source_failure(monkeypatch):
    def denied(*a, **kw):
        raise ai.ExtractionError("BUDGET_EXCEEDED")

    calls = ev.Calls("mock", 3)
    monkeypatch.setattr(ev, "transcribe_pages", denied)
    monkeypatch.setattr(ev, "parse", lambda *a: [{"spans": [], "image": ""}])
    r = {**row(), "mime": "image/png"}
    result = ev.evaluate_source(r, "openrouter", "unused", calls)
    assert result[0]["status"] == "FAILED"
    assert result[1]["budgetExceeded"] is True
    assert calls.entries == []


def test_AC_SRC_2_quality_failure_still_writes_complete_report(tmp_path, monkeypatch):
    _, gp = setup_output(tmp_path, monkeypatch, text="아무 사실도 추출하지 않는 입력")
    report = ev.report(tmp_path, [gp])
    assert report["quality"]["overall"]["criticalGate"] == "FAIL"
    assert report["quality"]["overall"]["factRecall"]["rate"] == 0
    assert (tmp_path / "report.json").exists()
    assert report["acceptance"] == "BLOCKED"


def test_AC_SRC_5_budget_abort_does_not_process_remaining_sources(tmp_path, monkeypatch):
    from app.core.config import get_settings

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", cfg.source_evaluation)
    monkeypatch.setattr(cfg, "source_evaluation_budget_usd", cfg.source_evaluation_budget_usd)
    gp = gold(tmp_path / "gold.json")
    value = ev.read_json(gp)
    second = copy.deepcopy(value["sources"][0])
    second["id"] = "case-02"
    value["sources"].append(second)
    ev.write_json(gp, value)
    monkeypatch.setattr(ev, "dataset", lambda *a: [row(), row(sid="case-02")])
    monkeypatch.setattr(ev, "load_gold", lambda *a: ([], [gp]))
    attempted = []

    def denied(self, *a, **kw):
        attempted.append(a[0])
        raise ai.ExtractionError("BUDGET_EXCEEDED")

    monkeypatch.setattr(ev.Calls, "__call__", denied)
    output = tmp_path / "run"
    assert ev.main(["--out", str(output)]) == 1
    assert attempted == ["extract"]
    assert ev.read_json(output / "case-01.output.json")["status"] == "FAILED"
    assert ev.read_json(output / "case-02.output.json")["status"] == "NOT_RUN"
    quality = ev.read_json(output / "score.json")
    assert quality["overall"]["factRecall"] == {"hit": 0, "total": 2, "rate": 0}


def test_AC_SRC_4_shared_product_ocr_keeps_only_safe_verbatim_lines(monkeypatch):
    from types import SimpleNamespace

    from app.source_analysis import worker

    monkeypatch.setattr(worker, "crops", lambda data: ["encoded-crop"])
    monkeypatch.setattr(
        worker,
        "transcribe",
        lambda encoded: SimpleNamespace(
            lines=["GAP 인증", "연락처 010-1234-5678", "[판독불가]", ""], usage={"mock": True}
        ),
    )
    stages = []

    def call(stage, model, chunk, targets, images, fn, output_tokens):
        stages.append(stage)
        assert images == ["encoded-crop"]
        assert model == worker.OCR_MODEL
        return fn()

    chunk = {"pages": [{"number": 1, "spans": []}]}
    ev.transcribe_pages(chunk, {1: b"safe image bytes"}, call)
    assert stages == ["ocr-1-0"]
    assert chunk["pages"][0]["spans"] == [{"id": "vision-gemini-0", "text": "GAP 인증"}]


def test_AC_SRC_1_2_refine_receives_single_target_and_common_in_source_order(monkeypatch):
    extract = ai.extract
    refine = ev.refine_ai.refine
    seen = []

    def with_common(*args, **kwargs):
        result = extract(*args, **kwargs)
        result.extraction.candidates[0].target_id = None
        result.extraction.candidates.reverse()
        return result

    def capture(mode, model, target, candidates):
        seen.extend(candidates)
        return refine(mode, model, target, candidates)

    monkeypatch.setattr(ai, "extract", with_common)
    monkeypatch.setattr(ev.refine_ai, "refine", capture)
    result = ev.evaluate_source(row(), "mock", "mock", ev.Calls("mock", 3))
    assert len(result[3]["candidates"]) == 3
    assert len(seen) == 3
    assert [c["targetId"] for c in seen] == [None, "eval-target", "eval-target"]
    assert [c["fieldKey"] for c in seen] == ["name", "summary", "storage"]
    assert result[0]["status"] == "EVALUATED"
    assert [m["module"] for m in result[3]["modules"]] == ["summary", "storage"]
    assert {"candidateIds": [seen[0]["id"]], "reason": "unsupported"} in (
        result[3]["stage2Diagnostics"]["excluded"]
    )
    assert {cid for m in result[3]["modules"] for t in m["texts"] for cid in t["candidateIds"]} == {
        c["id"] for c in seen[1:]
    }


@pytest.mark.parametrize("status", [401, 403, 400, 500])
@pytest.mark.parametrize("stage", ["extract", "refine", "ocr"])
@pytest.mark.parametrize("mode", ["openrouter", "openai"])
def test_AC_SRC_5_6_adapters_redact_provider_errors(monkeypatch, status, stage, mode):
    from app.ai import source_ocr

    if stage == "ocr" and mode == "openai":
        # Product OCR always uses OpenRouter, independently of the extraction model.
        mode = "openrouter"
    closed = []

    def fail(**kwargs):
        raise APIStatusError(
            "PRIVATE PROVIDER MESSAGE",
            response=httpx.Response(status, request=httpx.Request("POST", "https://local.invalid")),
            body={"error": "PRIVATE PROVIDER BODY"},
        )

    fake = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=fail)),
        responses=SimpleNamespace(parse=fail),
        close=lambda: closed.append(True),
    )
    monkeypatch.setattr(ai, "OpenAI", lambda **kwargs: fake)
    monkeypatch.setattr(source_ocr, "OpenAI", lambda **kwargs: fake)
    model = "google/gemini-3-flash-preview" if mode == "openrouter" else "gpt-6.1-sol"
    with pytest.raises(ai.ExtractionError) as error:
        if stage == "extract":
            ai.extract(mode, model, {"pages": []}, [], [])
        elif stage == "refine":
            ev.refine_ai.refine(mode, model, {"id": "target"}, [{"id": "c0"}])
        else:
            source_ocr.transcribe("local-fixture")
    expected = (
        "PROVIDER_AUTH"
        if status in {401, 403}
        else "REQUEST_UNCERTAIN"
        if status >= 500
        else "PROVIDER_REJECTED"
    )
    assert error.value.code == expected
    assert str(error.value) == expected
    assert error.value.usage == {}
    assert closed == [True]


@pytest.mark.parametrize(
    ("stage", "code", "expected"),
    [
        ("extract", "PROVIDER_AUTH", "PROVIDER_AUTH"),
        ("extract", "PROVIDER_REJECTED", "PROVIDER_REJECTED"),
        ("extract", "INVALID_MODEL_OUTPUT", "INVALID_MODEL_OUTPUT"),
        ("extract", "PRIVATE SOURCE TEXT", "SOURCE_FAILED"),
        ("ocr", "INVALID_OCR", "OCR_FAILED"),
        ("ocr", "PROVIDER_AUTH", "PROVIDER_AUTH"),
        ("refine", "INVALID_MODEL_OUTPUT", "INVALID_MODEL_OUTPUT"),
    ],
)
def test_AC_SRC_5_6_source_error_metadata_uses_only_fixed_codes(monkeypatch, stage, code, expected):
    def fail(*args, **kwargs):
        raise ai.ExtractionError(code)

    r = row()
    if stage == "ocr":
        r["mime"] = "image/png"
        monkeypatch.setattr(ev, "parse", lambda *a: [{"spans": [], "image": ""}])
        monkeypatch.setattr(ev, "transcribe_pages", fail)
    else:
        monkeypatch.setattr(ai if stage == "extract" else ev.refine_ai, stage, fail)
    result = ev.evaluate_source(
        r, "openrouter" if stage == "ocr" else "mock", "mock", ev.Calls("mock", 3)
    )
    assert result[0]["status"] == result[1]["status"] == "FAILED"
    assert result[1]["errorCode"] == expected
    assert "PRIVATE SOURCE TEXT" not in json.dumps(result[1])


@pytest.mark.parametrize("stage", ["extract", "ocr", "refine"])
def test_AC_SRC_5_auth_aborts_run_preserving_all_denominators(tmp_path, monkeypatch, capsys, stage):
    from app.core.config import get_settings

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", cfg.source_evaluation)
    monkeypatch.setattr(cfg, "source_evaluation_budget_usd", cfg.source_evaluation_budget_usd)
    gp = gold(tmp_path / "gold.json")
    value = ev.read_json(gp)
    second = copy.deepcopy(value["sources"][0])
    second["id"] = "case-02"
    value["sources"].append(second)
    ev.write_json(gp, value)
    rows = [row(), row(sid="case-02")]
    if stage == "ocr":
        from app.source_analysis import preprocess

        rows[0]["mime"] = "image/png"
        monkeypatch.setattr(ev, "estimate", lambda *a: {})
        monkeypatch.setattr(preprocess, "_ocr_engine", lambda: None)
        monkeypatch.setattr(ev, "parse", lambda *a: [{"spans": [], "image": ""}])

        def ocr(chunk, images, calls):
            calls("ocr-1-0", "mock", {}, [], [], lambda: None)

        monkeypatch.setattr(ev, "transcribe_pages", ocr)
    monkeypatch.setattr(ev, "dataset", lambda *a: rows)
    monkeypatch.setattr(ev, "load_gold", lambda *a: ([], [gp]))
    attempted = []
    original = ev.Calls.__call__

    def call(self, name, *args, **kwargs):
        attempted.append(name)
        if name.startswith(stage):
            raise ai.ExtractionError("PROVIDER_AUTH")
        return original(self, name, *args, **kwargs)

    monkeypatch.setattr(ev.Calls, "__call__", call)
    out = tmp_path / "run"
    args = ["--out", str(out)]
    if stage == "ocr":
        args += ["--provider", "openrouter", "--yes"]
    assert ev.main(args) == 1
    assert attempted == (
        ["extract", "refine"] if stage == "refine" else ["ocr-1-0" if stage == "ocr" else "extract"]
    )
    metadata = ev.read_json(out / "metadata.json")
    assert metadata["sources"][0]["errorCode"] == metadata["abortCode"] == "PROVIDER_AUTH"
    assert metadata["sources"][1]["errorCode"] == "RUN_ABORTED_PROVIDER_AUTH"
    assert ev.read_json(out / "case-02.output.json")["status"] == "NOT_RUN"
    assert ev.read_json(out / "score.json")["overall"]["factRecall"] == {
        "hit": 0,
        "total": 2,
        "rate": 0,
    }
    printed = json.loads(capsys.readouterr().out.splitlines()[-1])
    assert printed["costUsd"] == printed["settledUsd"] == printed["unsettledReservedUsd"] == 0


def test_AC_SRC_5_unknown_cost_is_reserved_in_metadata_and_report(monkeypatch, tmp_path):
    from app.core.config import get_settings

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", True)
    calls = ev.Calls("openrouter", 1)
    calls(
        "extract",
        "google/gemini-3-flash-preview",
        {},
        [],
        [],
        lambda: SimpleNamespace(usage={}, request_id=None),
    )
    entry = calls.entries[0]
    assert entry["costUsd"] == 0
    assert not entry["costKnown"]
    assert calls.used == entry["reservedMicros"] > 0
    _, gp = setup_output(tmp_path, monkeypatch)
    metadata = ev.read_json(tmp_path / "metadata.json")
    metadata["sources"][0].update(**ev.costs(calls.entries), costKnown=False)
    ev.write_json(tmp_path / "metadata.json", metadata)
    report = ev.report(tmp_path, [gp])
    stats = report["performanceByFormat"]["text"]
    assert stats["totalCostUsd"] == stats["totalSettledUsd"] == 0
    assert stats["totalReservedUsd"] == stats["totalUnsettledReservedUsd"] == calls.used / 1e6
    assert not stats["costsKnown"]
    assert "Unsettled reserved USD" in (tmp_path / "report.md").read_text()


def test_AC_SRC_5_first_auth_failure_prints_pending_reservation_as_unspent(
    tmp_path, monkeypatch, capsys
):
    from app.core.config import get_settings

    cfg = get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", cfg.source_evaluation)
    monkeypatch.setattr(cfg, "source_evaluation_budget_usd", cfg.source_evaluation_budget_usd)
    gp = gold(tmp_path / "gold.json")
    value = ev.read_json(gp)
    second = copy.deepcopy(value["sources"][0])
    second["id"] = "case-02"
    value["sources"].append(second)
    ev.write_json(gp, value)
    monkeypatch.setattr(ev, "dataset", lambda *a: [row(), row(sid="case-02")])
    monkeypatch.setattr(ev, "load_gold", lambda *a: ([], [gp]))
    attempted = []

    def unauthorized(*args, **kwargs):
        attempted.append(True)
        raise ai.ExtractionError("PROVIDER_AUTH")

    monkeypatch.setattr(ai, "extract", unauthorized)
    out = tmp_path / "run"
    assert ev.main(["--provider", "openrouter", "--yes", "--out", str(out)]) == 1
    assert attempted == [True]
    printed = json.loads(capsys.readouterr().out.splitlines()[-1])
    assert printed["costUsd"] == printed["settledUsd"] == 0
    assert printed["reservedUsd"] == printed["unsettledReservedUsd"] > 0
    metadata = ev.read_json(out / "metadata.json")
    assert metadata["reservedUsd"] == printed["reservedUsd"]
    assert metadata["sources"][0]["costKnown"] is False
    assert metadata["sources"][1]["status"] == "NOT_RUN"
    with get_sessionmaker()() as db:
        spends = list(db.scalars(select(Spend)))
        assert len(spends) == 1
        assert spends[0].charged_micros is None
        assert spends[0].reserved_micros / 1e6 == printed["reservedUsd"]


@pytest.mark.parametrize("stage", ["preprocess", "ocr"])
def test_AC_SRC_5_6_preparation_failures_are_redacted_per_source(monkeypatch, stage):
    def failure(*args):
        raise ev.PreparationError("PRIVATE PARSER MESSAGE")

    r = row()
    if stage == "preprocess":
        monkeypatch.setattr(ev, "parse", failure)
    else:
        r["mime"] = "image/png"
        monkeypatch.setattr(ev, "parse", lambda *a: [{"spans": [], "image": ""}])
        monkeypatch.setattr(ev, "transcribe_pages", failure)
    result = ev.evaluate_source(r, "openrouter", "unused", ev.Calls("mock", 3))
    assert result[0]["status"] == "FAILED"
    assert result[1]["errorCode"] == ("OCR_FAILED" if stage == "ocr" else "PREPROCESS_FAILED")
    assert "PRIVATE PARSER MESSAGE" not in json.dumps(result)


@pytest.mark.parametrize(
    "extra", [[], ["--estimate-only"], ["--force-rerun", "--rerun-reason", "Synthetic reason"]]
)
def test_AC_SRC_5_holdout_mock_refused_before_inputs_or_marker(tmp_path, monkeypatch, extra):
    monkeypatch.setattr(ev, "dataset", lambda *a: pytest.fail("No holdout input access"))
    monkeypatch.setattr(ev, "claim_holdout", lambda *a: pytest.fail("No attempt consumed"))
    assert (
        ev.main(
            [
                "--split",
                "holdout",
                "--provider",
                "mock",
                "--i-understand-holdout-runs-once",
                "--out",
                str(tmp_path / "run"),
                *extra,
            ]
        )
        == 2
    )
    assert not (tmp_path / "run").exists()


@pytest.mark.parametrize("reason", [None, "", "   "])
def test_AC_SRC_5_force_requires_nonempty_reason_before_inputs(tmp_path, monkeypatch, reason):
    monkeypatch.setattr(ev, "dataset", lambda *a: pytest.fail("No input access"))
    args = ["--force-rerun", "--out", str(tmp_path / "run")]
    if reason is not None:
        args += ["--rerun-reason", reason]
    assert ev.main(args) == 2
    assert not (tmp_path / "run").exists()


def test_AC_SRC_5_holdout_attempt_and_reason_match_metadata(tmp_path, monkeypatch):
    cfg = ev.get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", cfg.source_evaluation)
    monkeypatch.setattr(cfg, "source_evaluation_budget_usd", cfg.source_evaluation_budget_usd)
    gp = gold(tmp_path / "final-gold-v1.1.json")
    ev.claim_holdout(gp, True)
    monkeypatch.setattr(ev, "dataset", lambda *a: [row()])
    monkeypatch.setattr(ev, "load_gold", lambda *a: ([], [gp]))
    monkeypatch.setattr(ev, "worksheets", lambda *a: None)
    monkeypatch.setattr(ev, "report", lambda *a: None)
    original = ev.evaluate_source
    monkeypatch.setattr(
        ev, "evaluate_source", lambda r, *a: original(r, "mock", "mock", ev.Calls("mock", 3))
    )
    out = tmp_path / "run"
    assert (
        ev.main(
            [
                "--split",
                "holdout",
                "--provider",
                "openrouter",
                "--yes",
                "--i-understand-holdout-runs-once",
                "--force-rerun",
                "--rerun-reason",
                "Synthetic safety regression",
                "--holdout-dir",
                str(tmp_path),
                "--out",
                str(out),
            ]
        )
        == 0
    )
    metadata = ev.read_json(out / "metadata.json")
    marker = ev.read_json(gp.with_name(gp.name + ".run-once.json.2"))
    assert metadata["holdoutAttempt"] == marker["attempt"] == 2
    assert metadata["rerunReason"] == marker["rerunReason"] == "Synthetic safety regression"


def test_AC_SRC_5_6_unexpected_source_failure_keeps_spend_and_continues(
    tmp_path, monkeypatch, capsys
):
    cfg = ev.get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", cfg.source_evaluation)
    monkeypatch.setattr(cfg, "source_evaluation_budget_usd", cfg.source_evaluation_budget_usd)
    gp = gold(tmp_path / "gold.json")
    g = ev.read_json(gp)
    g["sources"].append({**copy.deepcopy(g["sources"][0]), "id": "case-02"})
    ev.write_json(gp, g)
    monkeypatch.setattr(ev, "load_gold", lambda *a: ([], [gp]))
    attempted = []
    original = ai.extract

    def extract(*args, **kwargs):
        attempted.append(True)
        if len(attempted) == 1:
            raise LookupError("SYNTHETIC_EXCEPTION_CONTENT")
        return original("mock", *args[1:], **kwargs)

    monkeypatch.setattr(ai, "extract", extract)
    # The second source is intentionally empty, so no refinement provider call is needed.
    monkeypatch.setattr(ev, "dataset", lambda *a: [row(), row("Synthetic empty", sid="case-02")])
    out = tmp_path / "run"
    assert ev.main(["--provider", "openrouter", "--yes", "--out", str(out)]) == 0
    metadata = ev.read_json(out / "metadata.json")
    assert len(attempted) == 2
    assert metadata["sources"][0]["errorCode"] == "SOURCE_FAILED"
    assert metadata["sources"][1]["status"] == "EMPTY"
    assert metadata["unsettledReservedUsd"] > 0
    assert len(ev.read_json(out / "runs.json")["sources"]) == 2
    with get_sessionmaker()() as db:
        spends = list(db.scalars(select(Spend)))
        assert len(spends) == 2
        assert spends[0].charged_micros is None
    assert (
        "SYNTHETIC_EXCEPTION_CONTENT"
        not in (out / "metadata.json").read_text() + capsys.readouterr().out
    )


@pytest.mark.parametrize("error", [LookupError, KeyboardInterrupt])
def test_AC_SRC_5_6_run_abort_writes_partial_artifacts_in_finally(
    tmp_path, monkeypatch, capsys, error
):
    cfg = ev.get_settings()
    monkeypatch.setattr(cfg, "source_evaluation", cfg.source_evaluation)
    monkeypatch.setattr(cfg, "source_evaluation_budget_usd", cfg.source_evaluation_budget_usd)
    gp = gold(tmp_path / "gold.json")
    monkeypatch.setattr(ev, "dataset", lambda *a: [row(), row(sid="case-02")])
    monkeypatch.setattr(ev, "load_gold", lambda *a: ([], [gp]))
    original = ev.evaluate_source

    def evaluate(r, *args):
        if r["id"] == "case-02":
            raise error("SYNTHETIC_ABORT_CONTENT")
        return original(r, *args)

    monkeypatch.setattr(ev, "evaluate_source", evaluate)
    monkeypatch.setattr(
        ai,
        "extract",
        lambda *a, **kw: SimpleNamespace(
            extraction=ai.Extraction(candidates=[], photo_requests=[]),
            usage={"cost": 0.001},
            request_id=None,
        ),
    )
    out = tmp_path / "run"
    args = ["--provider", "openrouter", "--yes", "--out", str(out)]
    if error is KeyboardInterrupt:
        with pytest.raises(KeyboardInterrupt):
            ev.main(args)
    else:
        assert ev.main(args) == 2
    metadata = ev.read_json(out / "metadata.json")
    assert metadata["abortCode"] == "RUN_FAILED"
    assert len(metadata["sources"]) == 1
    assert metadata["settledUsd"] == 0.001
    assert len(ev.read_json(out / "runs.json")["sources"]) == 1
    with get_sessionmaker()() as db:
        spends = list(db.scalars(select(Spend)))
        assert len(spends) == 1
        assert spends[0].charged_micros == 1000
    assert (
        "SYNTHETIC_ABORT_CONTENT"
        not in (out / "metadata.json").read_text() + capsys.readouterr().out
    )


def t23_case(case_id):
    from app.source_analysis.synthetic import CASES

    return next(c for c in ev.read_json(CASES) if c["id"] == case_id)


@pytest.mark.parametrize("provider", ["mock", "openrouter", "openai"])
def test_AC_SRC_2_5_long_plain_text_chunks_for_every_provider(monkeypatch, provider):
    from app.source_analysis.preprocess import TEXT_CHUNK_CHARS

    case = t23_case("21-long-text")
    seen = []
    original = ai.extract

    def local_extract(mode, model, chunk, targets, images, **kwargs):
        seen.append(chunk)
        return original("mock", model, chunk, targets, images, mock_empty=True)

    monkeypatch.setattr(ai, "extract", local_extract)
    original_refine = ev.refine_ai.refine
    monkeypatch.setattr(
        ev.refine_ai,
        "refine",
        lambda mode, model, target, candidates: original_refine("mock", model, target, candidates),
    )

    # Calls wrapper is local: a provider name must never cause network/budget activity here.
    def calls(stage, model, chunk, targets, images, fn):
        return fn()

    calls.entries = []
    result = ev.evaluate_source(row(case["text"]), provider, "fixture", calls)
    assert result[0]["status"] == "EVALUATED", result[1]
    assert len(seen) >= 3
    assert all(
        sum(len(s["text"]) for p in c["pages"] for s in p["spans"]) <= TEXT_CHUNK_CHARS
        for c in seen
    )
    assert {c["fieldKey"] for c in result[3]["candidates"]} == {
        "composition",
        "storage",
        "productionProcess",
    }
    assert len({c["id"] for c in result[3]["candidates"]}) == 3


def test_AC_SRC_2_3_partial_rejection_reaches_refine_and_never_draft():
    case = t23_case("23-partial-validation")
    result = ev.evaluate_source(row(case["text"]), "mock", "fixture", ev.Calls("mock", 3))
    assert result[0]["status"] == "EVALUATED", result[1]
    assert result[1]["rejectedCandidates"] == 1
    assert result[1]["calls"] == 2
    assert len(result[3]["candidates"]) == 2
    assert "잘못된 인용 후보" not in json.dumps(result[0], ensure_ascii=False)


def test_AC_SRC_3_5_all_rejected_never_refines(monkeypatch):
    original = ai.extract

    def invalid(*args, **kwargs):
        response = original(*args, **kwargs)
        for candidate in response.extraction.candidates:
            candidate.evidence[0].quote = "합성 원문에 없는 인용"
        return response

    monkeypatch.setattr(ai, "extract", invalid)
    result = ev.evaluate_source(row(), "mock", "fixture", ev.Calls("mock", 3))
    assert result[0]["status"] == "FAILED"
    assert result[1]["errorCode"] == "CANDIDATES_REJECTED"
    assert result[1]["calls"] == 1
    assert result[0]["modules"] == []


@pytest.mark.parametrize(
    "text,reason",
    [
        ("", "NO_SAFE_TEXT"),
        ("목차와 구분선만 있는 합성 안내", "NO_CANDIDATES"),
        ("연락처: 010-0000-0000", "NO_SAFE_TEXT"),
    ],
)
def test_AC_SRC_5_8_empty_has_diagnostic(text, reason):
    result = ev.evaluate_source(row(text), "mock", "fixture", ev.Calls("mock", 3))
    assert result[0]["status"] == "EMPTY"
    assert result[1]["emptyReason"] == reason
    assert result[3]["stage2Diagnostics"]["emptyReason"] is None


def test_AC_SRC_2_8_synthetic_pdf_25_pages_runner_records_skips(monkeypatch):
    from app.source_analysis import preprocess
    from app.source_analysis.synthetic import material

    case = t23_case("22-pdf-25-pages")
    data, mime, suffix = material(case)
    monkeypatch.setattr(preprocess, "_upright", lambda image: (image, 0))
    monkeypatch.setattr(
        preprocess,
        "_tiled_ocr",
        lambda image: [{"id": "s0", "text": "합성 구성: 감귤 7kg입니다.", "box": [0, 0, 1, 1]}],
    )
    monkeypatch.setattr(preprocess, "qr_regions", lambda image: [])
    r = {
        "id": case["id"],
        "format": "pdf",
        "data": data,
        "mime": mime,
        "suffix": suffix,
        "inputSha256": final_score.sha256(data),
    }
    result = ev.evaluate_source(r, "mock", "fixture", ev.Calls("mock", 3))
    assert result[0]["status"] == "EVALUATED", result[1]
    assert result[1]["pagesAnalysed"] == 20 and result[1]["pagesSkipped"] == 5
    assert result[1]["calls"] == 21  # Twenty page extractions plus one target refinement.
    assert result[0]["modules"] == [{"module": "composition", "texts": ["감귤 7kg입니다."]}]


def test_AC_SRC_2_synthetic_subset_includes_t23_and_checks_input_definition(monkeypatch, tmp_path):
    rows = ev.dataset("development", "synthetic", tmp_path, tmp_path)
    assert len(rows) == 23
    assert {"21-long-text", "22-pdf-25-pages", "23-partial-validation"} <= {r["id"] for r in rows}
    manifest = ev.read_json(final_score.DEV_MANIFEST)
    next(c for c in manifest["cases"] if c["id"] == "23-partial-validation")[
        "inputDefinitionSha256"
    ] = "0" * 64
    path = tmp_path / "dev-manifest.json"
    ev.write_json(path, manifest)
    monkeypatch.setattr(final_score, "DEV_MANIFEST", path)
    with pytest.raises(ValueError, match="Synthetic input definition changed"):
        ev.dataset("development", "synthetic", tmp_path, tmp_path)


@pytest.mark.parametrize("subset", ["public", "all"])
def test_AC_SRC_2_6_retired_public_sources_load_v2_gold_without_holdout_access(
    tmp_path, monkeypatch, subset
):
    manifest = ev.read_json(final_score.DEV_MANIFEST)
    private = [c for c in manifest["cases"] if c["status"] == "LOCAL_PRIVATE"]
    template = ev.read_json(gold(tmp_path / "invented-gold.json"))["sources"][0]
    sources = []
    safe = tmp_path / "safe"
    safe.mkdir()
    for case in private:
        source = copy.deepcopy(template)
        source.pop("format")  # Private gold gets formats from the pinned manifest.
        source["id"] = case["id"]
        sources.append(source)
        # Dataset selection does not parse material; these are invented bytes only.
        suffix = {"text": ".txt", "image": ".png", "long_image": ".png", "pdf": ".pdf"}[
            case["format"]
        ]
        (safe / (case["id"] + suffix)).write_bytes(b"Invented safe input")
    path = tmp_path / "final-gold-dev-public-v2.json"
    ev.write_json(path, sources)
    monkeypatch.setitem(
        final_score.LOCAL_GOLD_SHA256, "development", final_score.sha256(path.read_bytes())
    )
    holdout_dir = tmp_path / "holdout-must-not-be-read"
    rows = ev.dataset("development", subset, tmp_path, holdout_dir)
    assert len(rows) == (24 if subset == "public" else 47)
    assert sum(not r["synthetic"] for r in rows) == 24
    references, gold_files = ev.load_gold("development", subset, tmp_path, holdout_dir, rows)
    assert references == [{"path": str(path), "split": "development", "lockPath": None}]
    assert gold_files == ([] if subset == "public" else [ev.SYNTHETIC_GOLD])
    loaded = final_score.load_local_gold(
        final_score.LocalGold.model_validate(references[0]), ev.ROOT,
        {r["id"]: r["format"] for r in rows},
    )
    assert loaded.split == "development" and len(loaded.sources) == 24
    assert not holdout_dir.exists()
    # File tampering still fails the pinned-hash guard.
    path.write_bytes(path.read_bytes() + b" ")
    with pytest.raises(ValueError, match="redacted"):
        ev.load_gold("development", subset, tmp_path, holdout_dir, rows)


def test_AC_SRC_5_8_oversized_refine_input_has_distinct_reason(monkeypatch):
    monkeypatch.setattr(ev.refinement, "MAX_REFINE_CHARS", 1)
    result = ev.evaluate_source(row(), "mock", "fixture", ev.Calls("mock", 3))
    assert result[0]["status"] == "EMPTY"
    assert result[1]["emptyReason"] == "REFINE_INPUT_LIMIT"
    assert result[1]["candidatesAnalysed"] == 0
    assert result[1]["candidatesSkipped"] > 0
    assert result[3]["stage2Diagnostics"]["emptyReason"] == "REFINE_INPUT_LIMIT"


@pytest.mark.parametrize("characters,calls", [(3999, 1), (4000, 1), (4001, 2), (8000, 2)])
@pytest.mark.parametrize("character", ["가", "a"])
def test_AC_SRC_2_5_text_estimate_counts_decoded_characters(characters, calls, character):
    estimate = ev.estimate([row(character * characters)], "mock", "fixture")
    assert estimate["estimatedExtractionCalls"] == calls
    assert estimate["estimatedRefinementCalls"] == 1
    assert estimate["estimatedOcrCalls"] == 0


def test_AC_SRC_1_2_3_common_farm_mock_reuses_locked_synthetic_gold(tmp_path, monkeypatch):
    rows = ev.dataset("development", "synthetic", tmp_path, tmp_path)
    # Existing development hashes and gold rules must still validate without modification.
    _, gold_files = ev.load_gold("development", "synthetic", tmp_path, tmp_path, rows)
    assert gold_files == [ev.SYNTHETIC_GOLD]
    case = next(r for r in rows if r["id"] == "13-common-farm")
    original = ev.refinement.includes_target
    selected = []

    def track(candidate_target_id, target_id, target_count):
        selected.append((candidate_target_id, target_id, target_count))
        return original(candidate_target_id, target_id, target_count)

    monkeypatch.setattr(ev.refinement, "includes_target", track)
    result = ev.evaluate_source(case, "mock", "fixture", ev.Calls("mock", 3))
    record, metric, safe_text, stored = result
    assert record["status"] == "EVALUATED", metric
    assert metric["calls"] == 2 and metric["costUsd"] == 0
    assert metric["emptyReason"] is None
    assert (None, "eval-target", 1) in selected  # Calls the product selection function.
    assert len(stored["candidates"]) == 1 and stored["candidates"][0]["targetId"] is None
    assert stored["modules"][0]["module"] == "farmStory"
    assert stored["modules"][0]["texts"][0]["candidateIds"] == [stored["candidates"][0]["id"]]
    source_gold = next(
        s for s in ev.read_json(ev.SYNTHETIC_GOLD)["sources"] if s["id"] == case["id"]
    )
    final_text = "\n".join(record["modules"][0]["texts"])
    for sentence in source_gold["sentences"]:
        assert sentence["text"] in safe_text and sentence["text"] in final_text
        for fact in sentence["facts"]:
            assert all(token in final_text for token in fact["mustContain"])
    score = final_score.score(
        {"schemaVersion": 1, "split": "development", "sources": [source_gold]},
        [record], {case["id"]: safe_text},
    )
    assert score["overall"]["factRecall"] == {"hit": 1, "total": 1, "rate": 1.0}
    assert not any(score["sources"][0]["forbidden"].values())
    assert not any(score["sources"][0]["unsupported"].values())


def test_AC_SRC_1_3_5_8_common_product_fields_stay_filtered_in_mock_eval(monkeypatch):
    original = ai.extract

    def common_composition(*args, **kwargs):
        response = original(*args, **kwargs)
        for candidate in response.extraction.candidates:
            candidate.target_id = None
            candidate.field_key = "composition"
        return response

    monkeypatch.setattr(ai, "extract", common_composition)
    result = ev.evaluate_source(row(), "mock", "fixture", ev.Calls("mock", 3))
    assert result[0]["status"] == "EMPTY"
    assert result[1]["candidatesAnalysed"] > 0
    assert result[1]["emptyReason"] == "ALL_TEXTS_FILTERED"
    assert result[3]["modules"] == []
