"""DEV-450 wording-only experiment on four frozen reviewed drafts; opt-in, private."""

import argparse
import copy
import fcntl
import hashlib
import importlib.util
import json
import math
import os
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))

from app.ai import source_polish as ai
from app.ai.source_analysis import ExtractionError
from app.core.config import get_settings
from app.source_analysis import budget, text_score
from app.source_analysis import voice_polish as core
from app.source_analysis.final_eval import Calls
from app.source_analysis.final_score import Gold, Run

_SPEC = importlib.util.spec_from_file_location(
    "dev451_voice_runner_helpers", Path(__file__).with_name("passage_compare.py")
)
_helpers = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_helpers)
write_json = _helpers.write_json
request_envelope = _helpers.request_envelope
validate_local_ledger = _helpers.validate_local_ledger
ledger_snapshot = _helpers.ledger_snapshot

VERSION = "reviewed-voice-comparison-v1"
MODEL = "google/gemini-3-flash-preview"
OUTPUT_TOKENS = 8000
TRIALS = (1, 2)
PHASE_BASELINE = {
    "rows": 486,
    "settledMicros": 1_638_684,
    "uncertainReservedMicros": 828_496,
}
PHASE_CAP_MICROS = 750_000
GLOBAL_CAP_MICROS = 5_000_000
REVIEWED_SELECTION_SHA = (
    "b4db09923c55727ee77ee495348c9f880b97e1bcf9f862d53746d638fa2e45f2"
)
REVIEWED_BASELINE_HASHES = {
    "h3-image-03": "bc2a0277d575164a096ea8a04c62348ea5f61dcb8bcc81beeb3ed9a30ffc331c",
    "h3-pdf-02": "49e91a06ca9c6f8561e1bcd82b024f3bf093c3cda579c3c2b419db13a711fce0",
    "h3-text-03": "09c7eef93724f46ebc7732be3ef4cecaf6bdf4bd49455e9635eb00dd6fdc666e",
    "h3-long_image-01": "37ef3a6b222f8421caf5c5f6f544cccd4150ca2326bacaab889a8290bb6826c8",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def value_hash(value):
    return digest(canonical(value).encode())


def prepare(data):
    """Pure per-case preflight; all four rows remain even when one is ineligible."""
    try:
        if (
            type(data) is not dict
            or data["version"] != 1
            or data["purpose"] != "VOICE_POLISH_ONLY_EXACT_FOUR_REVIEWED_BASELINES"
            or data["baselineVersion"] != "source-refine-v11-routing"
            or data["baselineTrial"] != 1
            or data["baselineArm"] != "baseline"
            or data["hashes"]["focusedSelectionFileSha256"] != REVIEWED_SELECTION_SHA
        ):
            raise ValueError
        parsed = Gold.model_validate(data["gold"])
        ids = {s.id for s in parsed.sources}
        if (
            parsed.split != "development"
            or ids != set(REVIEWED_BASELINE_HASHES)
            or type(data["cases"]) is not list
            or len(data["cases"]) != 4
            or {c["id"] for c in data["cases"]} != ids
            or type(data["safeTexts"]) is not dict
            or set(data["safeTexts"]) != ids
            or any(type(t) is not str for t in data["safeTexts"].values())
        ):
            raise ValueError
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ValueError("INVALID_REVIEWED_VOICE_COHORT") from None
    sources = []
    gold_by = {s["id"]: s for s in data["gold"]["sources"]}
    for case in data["cases"]:
        sid = case["id"]
        result = {
            "id": sid,
            "format": gold_by[sid]["format"],
            "eligible": False,
            "baselineRecord": copy.deepcopy(case.get("baselineRecord", {})),
        }
        try:
            record = Run.model_validate(case["baselineRecord"])
            if (
                record.id != sid
                or record.format != result["format"]
                or value_hash(case["baselineRecord"]) != REVIEWED_BASELINE_HASHES[sid]
            ):
                raise ValueError("REVIEWED_BASELINE_MISMATCH")
            plain = [
                {"module": m["module"], "texts": [t["value"] for t in m["texts"]]}
                for m in case["baselineModules"]
            ]
            if plain != case["baselineRecord"]["modules"]:
                raise ValueError("BASELINE_MODULE_OR_TEXT_CHANGED")
            checks = {
                "baselineRecordSha256": case["baselineRecord"],
                "baselineModulesSha256": case["baselineModules"],
                "acceptedCandidatesSha256": case["acceptedCandidates"],
                "goldSourceSha256": gold_by[sid],
                "voiceExcerptsSha256": case["voiceExcerpts"],
            }
            if any(
                case["hashes"][key] != value_hash(value)
                for key, value in checks.items()
            ):
                raise ValueError("VOICE_INPUT_HASH_MISMATCH")
            candidates = case["acceptedCandidates"]
            if (
                len({c["id"] for c in candidates}) != len(candidates)
                or set(case["acceptedCandidateIds"]) != {c["id"] for c in candidates}
                or any(e["sourceId"] != sid for c in candidates for e in c["evidence"])
                or set(case["sourceRevisions"]) != {sid}
            ):
                raise ValueError("INVALID_ACCEPTED_SOURCE_BOUNDARY")
            cited = {
                cid
                for module in case["baselineModules"]
                for text in module["texts"]
                for cid in text["candidateIds"]
            }
            writer_candidates = [c for c in candidates if c["id"] in cited]
            request = core.prepare(
                case["target"],
                writer_candidates,
                case["baselineModules"],
                case["voiceExcerpts"],
                case["sourceRevisions"],
            )
            payload = ai.polish_payload(request)
            ai._privacy(payload)
            envelope = request_envelope(
                ai.POLISH_PROMPT, payload, ai.polish_schema(request)
            )
            result.update(
                eligible=True,
                request=request,
                writerEnvelope=envelope,
                writerRequestSha256=value_hash(envelope),
                writerRequestUtf8Bytes=len(canonical(envelope).encode()),
                sourceRevisions=copy.deepcopy(case["sourceRevisions"]),
                knownBaselineIssues=copy.deepcopy(case.get("knownBaselineIssues", [])),
            )
        except core.PolishError as exc:
            result["error"] = exc.reason
        except ExtractionError as exc:
            result["error"] = exc.code
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            allowed = {
                "REVIEWED_BASELINE_MISMATCH",
                "BASELINE_MODULE_OR_TEXT_CHANGED",
                "VOICE_INPUT_HASH_MISMATCH",
                "INVALID_ACCEPTED_SOURCE_BOUNDARY",
            }
            result["error"] = (
                str(exc) if str(exc) in allowed else "VOICE_PREFLIGHT_REJECTED"
            )
        sources.append(result)
    return sources


def available_micros(snapshot, phase_cap_usd=0.75):
    if not math.isfinite(phase_cap_usd) or not 0 < phase_cap_usd <= 0.75:
        raise ValueError("PHASE_CAP_AT_MOST_0_75_USD")
    if any(type(snapshot.get(k)) is not int or snapshot[k] < 0 for k in PHASE_BASELINE):
        raise ValueError("INVALID_LEDGER_SNAPSHOT")
    used = snapshot["settledMicros"] + snapshot["uncertainReservedMicros"]
    original = (
        PHASE_BASELINE["settledMicros"] + PHASE_BASELINE["uncertainReservedMicros"]
    )
    if snapshot["rows"] < PHASE_BASELINE["rows"] or used < original:
        raise ValueError("HISTORICAL_LEDGER_NOT_RECONCILED")
    return max(
        0,
        min(
            math.floor(phase_cap_usd * 1e6) - (used - original),
            GLOBAL_CAP_MICROS - used,
        ),
    )


def code_hashes():
    paths = [
        Path(__file__),
        Path(_helpers.__file__),
        Path(ai.__file__),
        Path(core.__file__),
        Path(text_score.__file__),
        ROOT / "server/app/ai/source_refine.py",
        ROOT / "server/app/source_analysis/refinement.py",
        ROOT / "server/app/source_analysis/text_safety.py",
        ROOT / "server/app/source_analysis/text_safety_lists.json",
        ROOT / "server/app/source_analysis/budget.py",
        ROOT / "server/app/source_analysis/final_eval.py",
    ]
    return {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in paths}


def _record(job, modules=None, status="FAILED"):
    return {
        "id": job["sourceId"],
        "format": job["format"],
        "status": status,
        "modules": [
            {"module": m["module"], "texts": [t["value"] for t in m["texts"]]}
            for m in (modules or [])
        ],
    }


def _error(exc):
    details = getattr(exc, "details", None)
    reason = details.get("reason") if type(details) is dict else None
    return {
        "code": exc.code,
        "reason": reason if type(reason) is str and reason in core.REASONS else None,
        "usage": exc.usage,
        "requestId": exc.request_id,
        "rawParsedOutput": "UNAVAILABLE_ON_ADAPTER_VALIDATION_OR_TRANSPORT_ERROR",
    }


def _reports(data, jobs, sources):
    baseline = [s["baselineRecord"] for s in sources]
    reports = []
    for trial in TRIALS:
        for arm, records in [
            ("reviewed-v11-baseline", baseline),
            ("voice-polish", [j["record"] for j in jobs if j["trial"] == trial]),
        ]:
            reports.append(
                {
                    "trial": trial,
                    "arm": arm,
                    "records": records,
                    "report": text_score.score(
                        data["gold"], records, data["safeTexts"]
                    ),
                }
            )
    return reports


def run(args):
    fd = os.open(
        "/private/tmp/farmclub-dev450-voice.lock",
        os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
        0o600,
    )
    with os.fdopen(fd, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("VOICE_PHASE_ALREADY_RUNNING") from None
        return _run_locked(args)


def _run_locked(args):
    out = args.out.resolve()
    if out.exists() or out.is_relative_to(ROOT):
        raise ValueError("NEW_PRIVATE_OUTPUT_OUTSIDE_CHECKOUT_REQUIRED")
    raw = args.input.read_bytes()
    data = json.loads(raw)
    sources = prepare(data)
    cfg = get_settings()
    validate_local_ledger(cfg)
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = 5
    cfg.source_max_output_tokens = OUTPUT_TOKENS
    before = ledger_snapshot()
    cap = getattr(args, "max_phase_usd", 0.75)
    allowance = available_micros(before, cap)
    if args.execute and getattr(args, "env_file", None):
        from dotenv import dotenv_values

        cfg.openrouter_api_key = (
            dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
        )
    if (
        args.execute
        and any(s["eligible"] for s in sources)
        and not cfg.openrouter_api_key
    ):
        raise ValueError("MISSING_PROVIDER_KEY")
    frozen = code_hashes()
    jobs = []
    for trial in TRIALS:
        for source in sources:
            job = {
                "index": len(jobs),
                "sourceId": source["id"],
                "format": source["format"],
                "trial": trial,
                "writerStatus": "PLANNED" if source["eligible"] else "PREFLIGHT_FAILED",
                "criticStatus": "WAITING_FOR_VALID_WRITER",
                "preflightError": source.get("error"),
            }
            job["record"] = _record(
                job, status="NOT_RUN" if source["eligible"] else "FAILED"
            )
            if source["eligible"]:
                job["estimatedWriterReservationMicros"] = budget.estimate_micros(
                    "openrouter",
                    MODEL,
                    {"completeProviderRequest": source["writerEnvelope"]},
                    [],
                    [],
                    output_tokens=OUTPUT_TOKENS,
                )
            jobs.append(job)
    out.mkdir(mode=0o700, parents=True)
    with (out / "input.json").open("xb") as handle:
        (out / "input.json").chmod(0o600)
        handle.write(raw)
    write_json(out / "preflight.json", sources)
    write_json(out / "ledger-before.json", before)
    protocol = {
        "version": VERSION,
        "purpose": "VOICE_ONLY_EXPERIMENT_NOT_HUMAN_ACCEPTANCE",
        "model": MODEL,
        "provider": "openrouter",
        "maxOutputTokens": OUTPUT_TOKENS,
        "writerVersion": core.VERSION,
        "criticVersion": core.CRITIC_VERSION,
        "inputSha256": digest(raw),
        "codeSha256": frozen,
        "trials": list(TRIALS),
        "sourceIds": [s["id"] for s in sources],
        "eligibleSources": sum(s["eligible"] for s in sources),
        "phaseBaseline": PHASE_BASELINE,
        "phaseCapUsd": cap,
        "globalCapUsd": 5,
        "availableReservationMicros": allowance,
        "writerOnlyReservationMicros": sum(
            j.get("estimatedWriterReservationMicros", 0) for j in jobs
        ),
        "maximumCalls": 16,
        "criticCostBound": "DYNAMIC_AFTER_VALID_WRITER_BEFORE_RESERVATION",
        "criticRule": "COMPLETE_WRITER_ONLY; FAIL_OR_UNKNOWN_RETAINED_NOT_PUBLISHED",
        "rawParsedFailureCapture": "UNAVAILABLE_WITH_CURRENT_ADAPTER; FIXED_ERROR_REASON_RETAINED",
        "reviewBoundary": "FOUR_ORIGINAL_REVIEWED_BASELINES; NO_APPROVAL_TRANSFER_TO_NEW_OUTPUT",
        "baselineIssues": "PRESERVED_UNCHANGED; NO_REVIEW_ADJUSTED_BASELINE",
        "providerBoundary": "BASELINE_CITED_CANDIDATES_AND_BOUNDED_STYLE_ONLY; NO_RAW_OCR_OR_GOLD",
        "requiresContentReview": True,
        "execute": args.execute,
    }
    write_json(out / "protocol.json", protocol)
    write_json(out / "planned-jobs.json", jobs)
    for source in sources:
        case_dir = out / source["id"]
        case_dir.mkdir(mode=0o700)
        if source["eligible"]:
            write_json(case_dir / "writer-request.json", source["writerEnvelope"])
            write_json(case_dir / "writer-internal-request.json", source["request"])
    if not args.execute:
        result = {
            "status": "DRY_RUN_NO_PROVIDER_CALL",
            "protocol": protocol,
            "jobs": jobs,
            "providerCalls": 0,
        }
        write_json(out / "dry-run.json", result)
        return result
    calls = Calls("openrouter", allowance / 1e6) if allowance else None
    stopped = None if allowance else "BUDGET_EXCEEDED"
    by_id = {s["id"]: s for s in sources}
    for job in jobs:
        if job["writerStatus"] == "PREFLIGHT_FAILED":
            job["criticStatus"] = "NOT_RUN_PREFLIGHT"
            continue
        if stopped:
            job.update(writerStatus="NOT_RUN", criticStatus="NOT_RUN", error=stopped)
            continue
        source = by_id[job["sourceId"]]
        case_dir = out / source["id"]
        stem = f"trial{job['trial']}"

        def invoke(stage, envelope, fn, case_dir=case_dir, stem=stem):
            nonlocal stopped
            if code_hashes() != frozen or cfg.source_max_output_tokens != OUTPUT_TOKENS:
                raise ValueError("FROZEN_PROTOCOL_CHANGED")
            estimate = budget.estimate_micros(
                "openrouter",
                MODEL,
                {"completeProviderRequest": envelope},
                [],
                [],
                output_tokens=OUTPUT_TOKENS,
            )
            if estimate > available_micros(ledger_snapshot(), cap):
                stopped = "BUDGET_EXCEEDED"
                raise ExtractionError("BUDGET_EXCEEDED")
            count = len(calls.entries)
            try:
                return calls(
                    "voice-" + stage,
                    MODEL,
                    {"completeProviderRequest": envelope},
                    [],
                    [],
                    fn,
                    output_tokens=OUTPUT_TOKENS,
                )
            except ExtractionError as exc:
                if exc.code in {"REQUEST_UNCERTAIN", "BUDGET_EXCEEDED"}:
                    stopped = exc.code
                raise
            finally:
                if (
                    len(calls.entries) > count
                    and calls.entries[-1].get("costKnown") is not True
                ):
                    stopped = stopped or "UNSETTLED_CALL"
                write_json(
                    case_dir / (stem + "-" + stage + "-calls.json"),
                    {
                        "calls": calls.entries,
                        "ledger": ledger_snapshot(),
                        "stopped": stopped,
                    },
                )

        try:

            def writer_call(source=source):
                value = ai.polish(
                    "openrouter",
                    MODEL,
                    source["request"],
                    source_revisions=source["sourceRevisions"],
                )
                return SimpleNamespace(
                    plan=value, usage=value["usage"], request_id=value["requestId"]
                )

            response = invoke("writer", source["writerEnvelope"], writer_call)
            draft = response.plan
            write_json(case_dir / (stem + "-writer-result.json"), draft)
            job.update(
                writerStatus=draft["status"], writerRequestId=response.request_id
            )
            job["record"] = _record(
                job, draft["modules"], "PARTIAL" if draft["modules"] else "FAILED"
            )
            if draft["status"] != "COMPLETE":
                job["criticStatus"] = "NOT_RUN_WRITER_INCOMPLETE"
                continue
            if stopped:
                job.update(criticStatus="NOT_RUN", error=stopped)
                continue
            critic_request = core.prepare_critic(source["request"], draft)
            payload = ai.critic_payload(critic_request)
            ai._privacy(payload)
            envelope = request_envelope(
                ai.CRITIC_PROMPT, payload, ai.critic_schema(critic_request)
            )
            write_json(
                case_dir / (stem + "-critic-internal-request.json"), critic_request
            )
            write_json(case_dir / (stem + "-critic-request.json"), envelope)
            job["criticRequestSha256"] = value_hash(envelope)

            def critic_call(critic_request=critic_request):
                value = ai.critique("openrouter", MODEL, critic_request)
                return SimpleNamespace(
                    plan=value, usage=value["usage"], request_id=value["requestId"]
                )

            response = invoke("critic", envelope, critic_call)
            review = response.plan
            write_json(case_dir / (stem + "-critic-result.json"), review)
            job.update(
                criticStatus=review["status"], criticRequestId=response.request_id
            )
            if review["status"] == "PASS":
                job["record"]["status"] = "EVALUATED"
        except ExtractionError as exc:
            stage = "writer" if job["writerStatus"] == "PLANNED" else "critic"
            job[stage + "Status"] = "FAILED"
            job["error"] = exc.code
            if stage == "writer":
                job["record"] = _record(job)
                job["criticStatus"] = "NOT_RUN_WRITER_FAILED"
            write_json(case_dir / (stem + "-" + stage + "-failure.json"), _error(exc))
        except Exception as exc:  # noqa: BLE001 - fail closed; never expose SDK/private exception text
            stage = "writer" if job["writerStatus"] == "PLANNED" else "critic"
            job[stage + "Status"] = "FAILED"
            job["error"] = type(exc).__name__
            stopped = stopped or "UNEXPECTED_FAILURE"
            write_json(
                case_dir / (stem + "-" + stage + "-failure.json"),
                {"errorType": type(exc).__name__, "rawParsedOutput": "UNAVAILABLE"},
            )
        finally:
            write_json(
                out / f"checkpoint-{job['index']:02d}.json",
                {
                    "jobs": jobs,
                    "calls": calls.entries,
                    "ledger": ledger_snapshot(),
                    "stopped": stopped,
                },
            )
    result = {
        "version": VERSION,
        "purpose": protocol["purpose"],
        "protocol": protocol,
        "jobs": jobs,
        "arms": _reports(data, jobs, sources),
        "calls": calls.entries if calls else [],
        "providerCalls": len(calls.entries) if calls else 0,
        "stopped": stopped,
        "requiresContentReview": True,
        "humanAcceptance": "NOT_ESTABLISHED",
        "publishable": False,
    }
    write_json(out / "result.json", result)
    write_json(out / "ledger-after.json", ledger_snapshot())
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--max-phase-usd", type=float, default=0.75)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    result = run(args)
    print(
        json.dumps(
            {
                "output": str(args.out),
                "providerCalls": result["providerCalls"],
                "status": result.get("status", "RECORDED"),
                "eligibleSources": result["protocol"]["eligibleSources"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
