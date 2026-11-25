"""Explicit 47-source downstream comparison on frozen accepted stage-1 candidates.

No OCR/extraction or holdout access. Private checkpoints retain every planned outcome.
Execution requires --execute, a reconciled local ledger, and a new private output path.
"""

import argparse
import copy
import hashlib
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Event

from app.ai import source_refine as legacy_ai
from app.ai.source_analysis import ExtractionError
from app.ai.source_assembly import ASSEMBLY_VERSION, AssemblyOutput, audit
from app.core.config import SOURCE_OPENROUTER_PRICES, get_settings
from app.source_analysis import refinement
from app.source_analysis.block_experiment import ledger_snapshot, write
from app.source_analysis.final_eval import Calls, costs
from app.source_analysis.preprocess import scrub
from app.source_analysis.presentation_plan import admit
from app.source_analysis.presentation_plan import prepare as prepare_presentation
from app.source_analysis.schemas import Extracted
from app.source_analysis.source_presentation import (
    MAX_INPUT_CHARS,
    MAX_INPUT_TEXTS,
    generate,
)
from app.source_analysis.source_presentation import (
    MODEL as PRESENTATION_MODEL,
)
from app.source_analysis.source_preserving import build_plan

VERSION = "pipeline-compare-v1-frozen-stage1"
LEGACY_MODEL = "google/gemini-3-flash-preview"
TRIALS = 2
SOURCE_COUNT = 47
OUTPUT_TOKENS = 8000
CONCURRENCY = 3
CUMULATIVE_CAP_USD = 30
PHASE_CAP_USD = 18
LEDGER_ROWS_FLOOR = 529
LEDGER_USED_FLOOR = 4_656_454
ROOT = Path(__file__).resolve().parents[3]
CODE_PATHS = (
    "server/app/ai/source_refine.py",
    "server/app/ai/source_analysis.py",
    "server/app/ai/source_assembly.py",
    "server/app/core/config.py",
    "server/app/source_analysis/refinement.py",
    "server/app/source_analysis/source_preserving.py",
    "server/app/source_analysis/source_options.py",
    "server/app/source_analysis/source_reflow.py",
    "server/app/source_analysis/presentation_plan.py",
    "server/app/source_analysis/source_presentation.py",
    "server/app/source_analysis/text_safety.py",
    "server/app/source_analysis/text_safety_lists.json",
    "server/app/source_analysis/budget.py",
    "server/app/source_analysis/final_eval.py",
    "server/app/source_analysis/pipeline_compare.py",
)


class FrozenCodeChanged(ValueError):
    pass


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def code_hashes():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in CODE_PATHS}


def check_frozen(expected):
    try:
        changed = code_hashes() != expected
    except OSError as exc:
        raise FrozenCodeChanged("FROZEN_CODE_CHANGED") from exc
    if changed:
        raise FrozenCodeChanged("FROZEN_CODE_CHANGED")


def prepare(data):
    if data.get("version") != 1 or data.get("split") != "development":
        raise ValueError("EXPLICIT_DEVELOPMENT_INPUT_REQUIRED")
    rows = data["sources"]
    if len(rows) != SOURCE_COUNT or len({row["id"] for row in rows}) != SOURCE_COUNT:
        raise ValueError("EXACT_47_SOURCE_SET_REQUIRED")
    if any(row.get("split", "development") != "development" for row in rows):
        raise ValueError("NON_DEVELOPMENT_ROW")
    subsets = [row.get("subset") for row in rows]
    if any(subset is not None for subset in subsets) and (
        subsets.count("public") != 24 or subsets.count("synthetic") != 23
    ):
        raise ValueError("EXPECTED_24_PUBLIC_23_SYNTHETIC")
    for row in rows:
        if not isinstance(row["candidates"], list) or not isinstance(row["sourceVersions"], dict):
            raise ValueError("INVALID_FROZEN_SOURCE")
        identifiers = [candidate["id"] for candidate in row["candidates"]]
        if any(not isinstance(cid, str) or not cid.strip() for cid in identifiers) or len(
            set(identifiers)
        ) != len(identifiers):
            raise ValueError("INVALID_CANDIDATE_IDS")
        target_payload(row)
    return rows


def target_payload(row):
    return {"id": row["target"]["id"], "name": row["target"].get("name", "")}


def candidate_payload(row):
    """Whitelist actual candidate/evidence fields; never forward local gold/annotations."""
    candidates = []
    for candidate in row["candidates"]:
        clean = {key: candidate[key] for key in ("targetId", "fieldKey", "value", "historical")}
        clean["evidence"] = [
            {key: ref[key] for key in ("sourceId", "sourceRevision", "page", "spanIds", "quote")}
            for ref in candidate["evidence"]
        ]
        candidates.append(
            {"id": candidate["id"], **Extracted.model_validate(clean).model_dump(by_alias=True)}
        )
    return candidates


def legacy_payload(row):
    selected, limits = refinement.limit_candidates(candidate_payload(row))
    # Match the legacy production worker's masking before its stage-2 call.
    safe = [
        {
            **candidate,
            "value": scrub(candidate["value"]),
            "evidence": [{**ref, "quote": scrub(ref["quote"])} for ref in candidate["evidence"]],
        }
        for candidate in selected
    ]
    target = target_payload(row)
    safe_target = {**target, "name": scrub(target["name"])}
    limits["privacyMaskingChanged"] = safe != selected or safe_target != target
    return {"target": safe_target, "candidates": safe}, selected, limits


def record(row, modules=(), *, failed=False):
    return {
        "id": row["id"],
        "format": row["format"],
        "status": "FAILED" if failed else "EVALUATED",
        "modules": [
            {
                "module": module["module"],
                "texts": [
                    text["value"] if isinstance(text, dict) else text for text in module["texts"]
                ],
            }
            for module in modules
        ],
    }


def baseline(row):
    try:
        plan = build_plan(
            target_payload(row),
            candidate_payload(row),
            source_versions=row["sourceVersions"],
            target_count=1,
        )
        return {
            "id": row["id"],
            "status": "EVALUATED",
            "plan": plan,
            "record": record(row, plan["modules"]),
            "inputSha256": digest(
                {
                    "target": target_payload(row),
                    "candidates": candidate_payload(row),
                    "sourceVersions": row["sourceVersions"],
                }
            ),
        }
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        return {
            "id": row["id"],
            "status": "FAILED",
            "error": "BASELINE_BUILD_FAILED",
            "errorType": type(exc).__name__,
            "record": record(row, failed=True),
        }


def declare_jobs(rows):
    return [
        {
            "id": row["id"],
            "format": row["format"],
            "arm": arm,
            "trial": trial,
            "model": LEGACY_MODEL if arm == "A" else PRESENTATION_MODEL,
            "status": "PLANNED",
            "generationStatus": "PLANNED",
            "generationFailed": False,
            "generationSkipped": False,
            "record": record(row, failed=True),
            "rawRecord": record(row, failed=True),
        }
        for trial in range(1, TRIALS + 1)
        for row in rows
        for arm in ("A", "C")
    ]


def _fallback(job, row, base, reason, *, generation_failed=True):
    job.update(
        status="EVALUATED" if base["status"] == "EVALUATED" else "FAILED",
        generationStatus="FAILED" if generation_failed else "SKIPPED",
        fallbackReason=reason,
        presentation={"status": "FALLBACK", "reason": reason},
        record=copy.deepcopy(base["record"]),
        rawRecord=copy.deepcopy(job.get("rawRecord", record(row, failed=True))),
        generationFailed=generation_failed,
        generationSkipped=not generation_failed,
    )
    return job


def execute_job(job, row, base, calls, frozen, stop=None):
    """One arm/source/trial; never retry or replace a failed legacy model output."""
    started = time.perf_counter()
    response = None
    try:
        if stop is not None and stop.is_set():
            raise FrozenCodeChanged("FROZEN_CODE_CHANGED")
        check_frozen(frozen)
        if job["arm"] == "A":
            wire, selected, limits = legacy_payload(row)
            job.update(
                inputSha256=digest(wire), inputCandidateCount=len(row["candidates"]), **limits
            )
            if not selected:
                job.update(
                    status="EVALUATED",
                    generationStatus="SKIPPED",
                    generationSkipped=True,
                    skippedReason=limits["emptyReason"] or "NO_CANDIDATES",
                    record=record(row),
                    rawRecord=record(row),
                    generationFailed=False,
                    diagnostics=limits,
                )
                return job
            response = calls(
                "compare-A-legacy",
                LEGACY_MODEL,
                {
                    "prompt": legacy_ai.PROMPT,
                    "payload": wire,
                    "schema": legacy_ai.Refinement.model_json_schema(),
                },
                [],
                [],
                lambda: legacy_ai.refine(
                    "openrouter", LEGACY_MODEL, wire["target"], wire["candidates"]
                ),
                output_tokens=OUTPUT_TOKENS,
            )
            job.update(
                raw=response.refinement.model_dump(by_alias=True),
                usage=response.usage,
                requestId=response.request_id,
            )
            job["rawRecord"] = record(row, job["raw"]["modules"])
            check_frozen(frozen)
            modules, diagnostics = refinement.validate(
                response.refinement,
                selected,
                wire["target"]["id"],
                target_count=1,
                target_name=wire["target"]["name"],
            )
            diagnostics["excluded"].extend(
                {"candidateIds": [candidate["id"]], "reason": "unused"}
                for candidate in candidate_payload(row)[len(selected) :]
            )
            diagnostics.update(limits)
            diagnostics["emptyReason"] = limits["emptyReason"] or refinement.empty_reason(
                selected, wire["target"]["id"], modules, target_count=1
            )
            job.update(
                status="EVALUATED",
                generationStatus="EVALUATED",
                generationFailed=False,
                modules=modules,
                diagnostics=diagnostics,
                record=record(row, modules),
            )
        else:
            if base["status"] != "EVALUATED":
                job.update(
                    status="FAILED",
                    generationStatus="SKIPPED",
                    generationSkipped=True,
                    error="BASELINE_BUILD_FAILED",
                    record=record(row, failed=True),
                )
                return job
            target = target_payload(row)
            plan = base["plan"]
            prepared = prepare_presentation(plan, target)
            job.update(inputSha256=digest(prepared), inputTextCount=len(prepared["texts"]))
            if not prepared["texts"]:
                return _fallback(job, row, base, "NO_TEXT", generation_failed=False)
            if (
                len(prepared["texts"]) > MAX_INPUT_TEXTS
                or sum(len(t["value"]) for t in prepared["texts"]) > MAX_INPUT_CHARS
            ):
                return _fallback(
                    job, row, base, "PRESENTATION_INPUT_LIMIT", generation_failed=False
                )
            if (
                any(scrub(t["value"]) != t["value"] for t in prepared["texts"])
                or scrub(target["name"]) != target["name"]
            ):
                return _fallback(job, row, base, "PRIVACY_CHANGED", generation_failed=False)
            from app.ai.source_assembly import PROMPT

            wire = {
                "target": target,
                "texts": [
                    {key: text[key] for key in ("id", "module", "value", "ownerFlags")}
                    for text in prepared["texts"]
                ],
            }
            response = calls(
                "compare-C-presentation",
                PRESENTATION_MODEL,
                {"prompt": PROMPT, "payload": wire, "schema": AssemblyOutput.model_json_schema()},
                [],
                [],
                lambda: generate("openrouter", prepared),
                output_tokens=OUTPUT_TOKENS,
            )
            job.update(
                raw=response.extraction.model_dump(by_alias=True),
                usage=response.usage,
                requestId=response.request_id,
            )
            job["rawRecord"] = record(row, job["raw"]["modules"])
            check_frozen(frozen)
            admitted = admit(plan, target, response.extraction)
            job.update(
                status="EVALUATED",
                generationStatus="EVALUATED",
                generationFailed=False,
                audit=audit(response.extraction, prepared),
                presentation=admitted["presentation"],
                plan=admitted,
                record=record(row, admitted["modules"]),
            )
            if admitted["presentation"]["status"] == "FALLBACK":
                job["fallbackReason"] = admitted["presentation"].get("reason")
    except Exception as exc:
        if isinstance(exc, FrozenCodeChanged):
            if stop is not None:
                stop.set()
            reason = "FROZEN_CODE_CHANGED"
        else:
            reason = exc.code if isinstance(exc, ExtractionError) else "PIPELINE_FAILED"
        job.update(error=reason)
        if isinstance(exc, ExtractionError):
            job.update(usage=exc.usage, requestId=exc.request_id)
        if job["arm"] == "C":
            _fallback(job, row, base, reason)
        else:
            job.update(
                status="FAILED",
                generationStatus="FAILED",
                generationFailed=True,
                record=record(row, failed=True),
            )
    finally:
        job["latencyMs"] = (time.perf_counter() - started) * 1000
    return job


def call_entries(calls):
    if hasattr(calls, "lock"):
        with calls.lock:
            return copy.deepcopy(calls.entries)
    return copy.deepcopy(calls.entries)


def ledger_gate(before):
    used = before["settledMicros"] + before["uncertainReservedMicros"]
    if before["rows"] < LEDGER_ROWS_FLOOR or used < LEDGER_USED_FLOOR:
        raise ValueError("UNRECONCILED_LEDGER")
    remaining = min(before["remainingMicros"], CUMULATIVE_CAP_USD * 1_000_000 - used)
    if remaining <= 0:
        raise ValueError("BUDGET_EXCEEDED")
    return min(PHASE_CAP_USD, remaining / 1_000_000)


def run(args):
    from app.ai.source_assembly import PROMPT

    data = json.loads(args.input.read_text())
    rows = prepare(data)
    out = args.out.resolve()
    if out.exists() or out.is_relative_to(ROOT):
        raise ValueError("NEW_PRIVATE_OUTPUT_OUTSIDE_CHECKOUT_REQUIRED")
    cfg = get_settings()
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = CUMULATIVE_CAP_USD
    cfg.source_max_output_tokens = OUTPUT_TOKENS
    before = ledger_snapshot()
    allowance = ledger_gate(before)
    if args.execute:
        from dotenv import dotenv_values

        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
        if not cfg.openrouter_api_key:
            raise ValueError("MISSING_PROVIDER_KEY")
    frozen = code_hashes()
    baselines = [baseline(row) for row in rows]
    jobs = declare_jobs(rows)
    out.mkdir(mode=0o700, parents=True)
    (out / "jobs").mkdir(mode=0o700)
    write(out / "input.json", data)
    write(out / "baselines.json", baselines)
    protocol = {
        "version": VERSION,
        "inputSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "codeHashes": frozen,
        "legacyPromptVersion": legacy_ai.PROMPT_VERSION,
        "legacyPromptSha256": hashlib.sha256(legacy_ai.PROMPT.encode()).hexdigest(),
        "legacySchemaSha256": digest(legacy_ai.Refinement.model_json_schema()),
        "presentationVersion": ASSEMBLY_VERSION,
        "presentationPromptSha256": hashlib.sha256(PROMPT.encode()).hexdigest(),
        "presentationSchemaSha256": digest(AssemblyOutput.model_json_schema()),
        "models": {"A": LEGACY_MODEL, "C": PRESENTATION_MODEL},
        "prices": {
            name: SOURCE_OPENROUTER_PRICES[name] for name in (LEGACY_MODEL, PRESENTATION_MODEL)
        },
        "priceInterpretation": "configured provider price ceilings, not a live market quote",
        "arms": {
            "A": "legacy Gemini writer + legacy final guards",
            "B": "deterministic full accepted source baseline",
            "C": "B + Astra medium + production admission/fallback",
        },
        "trialsPerPaidArm": TRIALS,
        "sources": SOURCE_COUNT,
        "plannedJobs": len(jobs),
        "concurrency": CONCURRENCY,
        "outputTokens": OUTPUT_TOKENS,
        "maxPhaseUsd": allowance,
        "cumulativeCapUsd": CUMULATIVE_CAP_USD,
        "ledgerBefore": before,
        "execute": args.execute,
        "OCRCalls": 0,
        "extractionCalls": 0,
        "noAutomaticRetries": True,
        "goldSentToModels": False,
        "sameFrozenStage1AllArms": True,
        "providerPreviewRevisionDriftPossible": True,
        "CFailuresUseExplicitProductionBaselineFallback": True,
    }
    write(out / "protocol.json", protocol)
    write(out / "jobs.json", jobs)
    calls = Calls("openrouter", allowance)
    if args.execute:
        by_id = {row["id"]: row for row in rows}
        base_by_id = {base["id"]: base for base in baselines}
        stop = Event()
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
            futures = {
                executor.submit(
                    execute_job,
                    copy.deepcopy(job),
                    by_id[job["id"]],
                    base_by_id[job["id"]],
                    calls,
                    frozen,
                    stop,
                ): index
                for index, job in enumerate(jobs)
            }
            for future in as_completed(futures):
                index = futures[future]
                jobs[index] = future.result()
                name = f"{jobs[index]['arm']}-{jobs[index]['trial']}-{index:03d}.json"
                write(out / "jobs" / name, jobs[index])
                write(out / "jobs.json", jobs)
                write(out / "calls.json", call_entries(calls))
                print(
                    json.dumps(
                        {
                            key: jobs[index][key]
                            for key in ("id", "arm", "trial", "status", "generationStatus")
                        }
                    ),
                    flush=True,
                )
    after = ledger_snapshot()
    write(out / "ledger-after.json", after)
    write(out / "calls.json", call_entries(calls))
    write(
        out / "summary.json",
        {
            "version": VERSION,
            "jobs": [
                {
                    key: job.get(key)
                    for key in (
                        "id",
                        "format",
                        "arm",
                        "trial",
                        "status",
                        "generationStatus",
                        "error",
                        "fallbackReason",
                        "latencyMs",
                    )
                }
                for job in jobs
            ],
            "costs": costs(call_entries(calls)),
            "ledgerAfter": after,
            "codeUnchanged": code_hashes() == frozen,
            "execute": args.execute,
        },
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--env-file", type=Path)
    args = parser.parse_args()
    if args.execute and not args.env_file:
        parser.error("--execute requires --env-file")
    os.umask(0o077)
    run(args)


if __name__ == "__main__":
    main()
