"""Explicit same-facts Astra page assembly experiment; saved development text only."""

import argparse
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from app.ai.source_analysis import ExtractionError, extract
from app.core.config import get_settings
from app.source_analysis.block_experiment import ledger_snapshot, write
from app.source_analysis.final_eval import Calls, costs
from app.source_analysis.preprocess import scrub

MODEL = "openai/gpt-6.2-astra"
TRIALS = 2
OUTPUT_TOKENS = 8000


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def payload(row):
    """Only fixed baseline text/labels/flag codes, never source/gold/previous outputs."""
    texts = [
        {key: text[key] for key in ("id", "module", "value", "ownerFlags")} for text in row["texts"]
    ]
    return {"target": {k: row["target"][k] for k in ("id", "name")}, "texts": texts}


def prepare(data):
    if data.get("version") != 1 or data.get("split") != "development":
        raise ValueError("FROZEN_DEVELOPMENT_BASELINE_REQUIRED")
    sources = data["sources"]
    if len(sources) != 4 or len({s["id"] for s in sources}) != 4:
        raise ValueError("EXACT_FOUR_SOURCE_BASELINE_REQUIRED")
    if sum(len(s["texts"]) for s in sources) != 106:
        raise ValueError("FROZEN_106_BLOCK_BASELINE_REQUIRED")
    for row in sources:
        if not row["texts"] or len({t["id"] for t in row["texts"]}) != len(row["texts"]):
            raise ValueError("INVALID_TEXT_BINDING")
        if digest(row["baselineRecord"]) != row["baselineRecordSha256"]:
            raise ValueError("BASELINE_CHANGED")
        modules = [
            {
                "module": module["module"],
                "texts": [t["value"] for t in row["texts"] if t["module"] == module["module"]],
            }
            for module in row["baselineRecord"]["modules"]
        ]
        if modules != row["baselineRecord"]["modules"]:
            raise ValueError("BASELINE_TEXT_CHANGED")
        wire = payload(row)
        values = [t["value"] for t in wire["texts"]] + [wire["target"].get("name", "")]
        if any(scrub(v) != v for v in values):
            raise ValueError("UNSCRUBBED_INPUT")
    return sources


def run(args):
    from app.ai.source_assembly import ASSEMBLY_VERSION, PROMPT, AssemblyOutput, audit

    data = json.loads(args.input.read_text())
    sources = prepare(data)
    out = args.out.resolve()
    if out.exists() or out.is_relative_to(Path(__file__).resolve().parents[3]):
        raise ValueError("NEW_PRIVATE_OUTPUT_REQUIRED")
    cfg = get_settings()
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = 30
    cfg.source_max_output_tokens = OUTPUT_TOKENS
    before = ledger_snapshot()
    if (
        before["rows"] < 521
        or before["settledMicros"] + before["uncertainReservedMicros"] < 4_062_179
    ):
        raise ValueError("UNRECONCILED_LEDGER")
    if args.execute:
        from dotenv import dotenv_values

        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
        if not cfg.openrouter_api_key:
            raise ValueError("MISSING_PROVIDER_KEY")
    out.mkdir(mode=0o700, parents=True)
    write(out / "input.json", data)
    protocol = {
        "version": ASSEMBLY_VERSION,
        "model": MODEL,
        "reasoning": "medium",
        "trials": TRIALS,
        "inputSha256": digest(data),
        "promptSha256": hashlib.sha256(PROMPT.encode()).hexdigest(),
        "schemaSha256": digest(AssemblyOutput.model_json_schema()),
        "baselineFacts": "87/94",
        "baselineCritical": "35/38",
        "maxPhaseUsd": 5,
        "cumulativeCapUsd": 30,
        "OCRCalls": 0,
        "extractionCalls": 0,
        "goldSentToModel": False,
        "execute": args.execute,
        "ledgerBefore": before,
        "noAutomaticRetries": True,
        "productionDefaultChanged": False,
    }
    write(out / "protocol.json", protocol)
    calls = Calls("openrouter", min(5, before["remainingMicros"] / 1e6))
    work = []
    for trial in range(1, TRIALS + 1):
        for row in sources:
            wire = payload(row)
            job = {
                "trial": trial,
                "id": row["id"],
                "format": row["format"],
                "model": MODEL,
                "status": "PLANNED",
                "requestSha256": digest(wire),
                "baselineRecordSha256": row["baselineRecordSha256"],
            }
            work.append((job, row, wire))

    def execute(item):
        job, row, wire = item
        if not args.execute:
            return job
        try:
            response = calls(
                "same-facts-assembly",
                MODEL,
                {"payload": wire, "prompt": PROMPT, "schema": AssemblyOutput.model_json_schema()},
                [],
                [],
                lambda: extract(
                    "openrouter",
                    MODEL,
                    wire,
                    [],
                    [],
                    prompt=PROMPT,
                    output_model=AssemblyOutput,
                    reasoning_effort="medium",
                ),
                output_tokens=OUTPUT_TOKENS,
            )
            job.update(
                raw=response.extraction.model_dump(by_alias=True),
                usage=response.usage,
                requestId=response.request_id,
            )
            job["audit"] = audit(response.extraction, row)
            job["record"] = {
                "id": row["id"],
                "format": row["format"],
                "status": "EVALUATED",
                "modules": [
                    {"module": m["module"], "texts": [t["value"] for t in m["texts"]]}
                    for m in job["raw"]["modules"]
                ],
            }
            job["status"] = "EVALUATED_REQUIRES_REVIEW"
        except ExtractionError as exc:
            job.update(status="FAILED", error=exc.code)
        except ValueError:
            job.update(status="FAILED", error="ASSEMBLY_OUTPUT_INVALID")
        return job

    jobs = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(execute, item) for item in work]
        for future in as_completed(futures):
            job = future.result()
            jobs.append(job)
            write(out / (str(job["trial"]) + "-" + job["id"] + ".json"), job)
            write(out / "jobs.json", jobs)
            write(out / "calls.json", calls.entries)
            print(json.dumps({k: job[k] for k in ("trial", "id", "status")}), flush=True)
    write(out / "ledger-after.json", ledger_snapshot())
    write(
        out / "summary.json",
        {
            "jobs": [{k: j[k] for k in ("trial", "id", "status")} for j in jobs],
            "costs": costs(calls.entries),
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
