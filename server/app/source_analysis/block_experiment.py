"""Opt-in block-first development comparison; no deployed-worker policy change."""

import argparse
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from app.ai.source_analysis import ExtractionError, extract
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis.final_eval import Calls, costs
from app.source_analysis.models import Spend
from app.source_analysis.preprocess import scrub
from app.source_analysis.schemas import Extraction
from app.source_analysis.source_preserving import build_plan
from app.source_analysis.worker import validate_candidates

MODELS = ("google/gemini-3.1-flash-lite", "openai/gpt-6.1-sol", "openai/gpt-6.2-astra")
GLOBAL_CAP_MICROS = 30_000_000
TRIALS = 2
OUTPUT_TOKENS = 8000


def digest(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    path.chmod(0o600)


def prepare(data):
    if data.get("split") != "development" or data.get("version") != 1:
        raise ValueError("DEVELOPMENT_INPUT_REQUIRED")
    rows = data["sources"]
    if not rows or len({r["id"] for r in rows}) != len(rows):
        raise ValueError("INVALID_SOURCE_SET")
    for row in rows:
        chunk = row["chunk"]
        if chunk["sourceId"] != row["id"] or chunk["sourceRevision"] < 1:
            raise ValueError("SOURCE_BINDING")
        ids = [(p["number"], s["id"]) for p in chunk["pages"] for s in p["spans"]]
        if len(ids) != len(set(ids)):
            raise ValueError("DUPLICATE_SOURCE_SPAN")
        values = [s["text"] for p in chunk["pages"] for s in p["spans"]]
        if any(scrub(s) != s for s in values) or scrub(row["target"].get("name", "")) != row[
            "target"
        ].get("name", ""):
            raise ValueError("UNSCRUBBED_INPUT")
        if not values:
            raise ValueError("EMPTY_SOURCE")
    return rows


def ledger_snapshot():
    cfg = get_settings()
    url = make_url(cfg.database_url)
    if (
        cfg.app_env != "local"
        or url.host not in {"127.0.0.1", "localhost"}
        or url.database != "farmclub_dev445_eval"
    ):
        raise ValueError("EXISTING_LOCAL_EVALUATION_LEDGER_REQUIRED")
    with get_sessionmaker()() as db:
        settled = db.scalar(select(func.coalesce(func.sum(Spend.charged_micros), 0)))
        pending = db.scalar(
            select(func.coalesce(func.sum(Spend.reserved_micros), 0)).where(
                Spend.charged_micros.is_(None)
            )
        )
        return {
            "rows": db.scalar(select(func.count()).select_from(Spend)),
            "settledMicros": settled,
            "uncertainReservedMicros": pending,
            "remainingMicros": GLOBAL_CAP_MICROS - settled - pending,
        }


def convert_result(materialized, chunk, target):
    """Audit after legacy evidence checks too; rejected blocks are never credited as output."""
    extraction = Extraction.model_validate(
        {"candidates": materialized["candidates"], "photoRequests": []}
    )
    accepted, diagnostics = validate_candidates(
        extraction, chunk, {target["id"]}, allow_historical_fields=True
    )
    candidates = [
        {"id": f"block-{i}", **c.model_dump(by_alias=True)}
        for i, c in enumerate(accepted.candidates)
    ]
    plan = build_plan(
        target,
        candidates,
        source_versions={
            chunk["sourceId"]: {"revision": chunk["sourceRevision"], "sanitizationVersion": 0}
        },
    )
    accepted_refs = {
        (e.page, sid) for c in accepted.candidates for e in c.evidence for sid in e.span_ids
    }
    return {
        "materialized": materialized,
        "validation": diagnostics,
        "acceptedCandidates": candidates,
        "plan": plan,
        "acceptedSourceSpans": len(accepted_refs),
    }


def run(args):
    from app.ai.source_blocks import (
        BLOCK_PROMPT,
        BLOCK_VERSION,
        BlockExtraction,
        materialize_blocks,
    )

    data = json.loads(args.input.read_text())
    sources = prepare(data)
    out = args.out.resolve()
    if out.exists() or out.is_relative_to(Path(__file__).resolve().parents[3]):
        raise ValueError("NEW_PRIVATE_OUTPUT_OUTSIDE_CHECKOUT_REQUIRED")
    cfg = get_settings()
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = GLOBAL_CAP_MICROS / 1e6
    cfg.source_max_output_tokens = OUTPUT_TOKENS
    before = ledger_snapshot()
    if (
        before["rows"] < 495
        or before["settledMicros"] + before["uncertainReservedMicros"] < 2_503_702
    ):
        raise ValueError("UNRECONCILED_LEDGER")
    allowance = min(10_000_000, before["remainingMicros"])
    if allowance <= 0:
        raise ValueError("BUDGET_EXCEEDED")
    if args.execute:
        from dotenv import dotenv_values

        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
        if not cfg.openrouter_api_key:
            raise ValueError("MISSING_PROVIDER_KEY")
    out.mkdir(mode=0o700, parents=True)
    write(out / "inputs.json", data)
    write(
        out / "protocol.json",
        {
            "version": BLOCK_VERSION,
            "models": MODELS,
            "trialCount": TRIALS,
            "concurrency": 3,
            "inputSha256": digest(data),
            "promptSha256": hashlib.sha256(BLOCK_PROMPT.encode()).hexdigest(),
            "schemaSha256": digest(BlockExtraction.model_json_schema()),
            "maxPhaseUsd": allowance / 1e6,
            "outputTokens": OUTPUT_TOKENS,
            "goldSentToModels": False,
            "sameFrozenOCRBothArms": True,
            "productionDefaultChanged": False,
            "execute": args.execute,
            "ledgerBefore": before,
        },
    )
    calls = Calls("openrouter", allowance / 1e6)
    jobs = []
    work = []
    for trial in range(1, TRIALS + 1):
        for index, row in enumerate(sources):
            for model in MODELS if (index + trial) % 2 == 0 else reversed(MODELS):
                job = {
                    "trial": trial,
                    "id": row["id"],
                    "format": row["format"],
                    "model": model,
                    "status": "PLANNED",
                    "inputSha256": digest({"source": row["chunk"], "targets": [row["target"]]}),
                }
                jobs.append(job)
                work.append((job, row))

    def execute(work_item):
        job, row = work_item
        model = job["model"]
        if not args.execute:
            return job
        try:
            response = calls(
                "block-first",
                model,
                {
                    **row["chunk"],
                    "blockPrompt": BLOCK_PROMPT,
                    "blockSchema": BlockExtraction.model_json_schema(),
                },
                [row["target"]],
                [],
                lambda: extract(
                    "openrouter",
                    model,
                    row["chunk"],
                    [row["target"]],
                    [],
                    prompt=BLOCK_PROMPT,
                    output_model=BlockExtraction,
                    reasoning_effort="medium" if model.startswith("openai/") else None,
                ),
                output_tokens=OUTPUT_TOKENS,
            )
            job.update(
                raw=response.extraction.model_dump(by_alias=True),
                usage=response.usage,
                requestId=response.request_id,
            )
            materialized = materialize_blocks(response.extraction, row["chunk"], [row["target"]])
            job.update(convert_result(materialized, row["chunk"], row["target"]))
            coverage = materialized["coverage"]
            job["status"] = (
                "EVALUATED"
                if not any(
                    coverage.get(k)
                    for k in ("missing", "repeated", "invalid", "conversionRejected")
                )
                and not job["validation"]["rejectedCount"]
                else "COVERAGE_OR_VALIDATION_FAILED"
            )
        except ExtractionError as exc:
            job.update(status="FAILED", error=exc.code)
        except ValueError:
            job.update(status="FAILED", error="BLOCK_MATERIALIZATION_FAILED")
        return job

    # Calls serializes reservations and settlements; only independent model work overlaps.
    # Persist each completed result separately so an interrupted peer cannot erase it.
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [(executor.submit(execute, item), item[0]) for item in work]
        for future, _ in futures:
            job = future.result()
            write(
                out
                / (
                    str(job["trial"])
                    + "-"
                    + job["id"]
                    + "-"
                    + job["model"].replace("/", "_")
                    + ".json"
                ),
                job,
            )
            write(
                out / "jobs.json",
                [j for _, j in futures if j is job or j.get("status") != "PLANNED"],
            )
            write(out / "calls.json", calls.entries)
            print(json.dumps({k: job[k] for k in ("trial", "id", "model", "status")}), flush=True)
    write(out / "jobs.json", jobs)
    after = ledger_snapshot()
    write(out / "ledger-after.json", after)
    write(
        out / "summary.json",
        {
            "jobs": [
                {
                    k: v
                    for k, v in j.items()
                    if k in {"id", "format", "model", "status", "error", "acceptedSourceSpans"}
                }
                for j in jobs
            ],
            "costs": costs(calls.entries),
            "ledgerAfter": after,
        },
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if args.execute and not args.env_file:
        parser.error("--execute requires --env-file")
    os.umask(0o077)
    run(args)


if __name__ == "__main__":
    main()
