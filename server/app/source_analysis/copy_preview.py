"""Local-only, opt-in source-grounded writing experiment (DEV-450)."""

import argparse
import copy
import fcntl
import hashlib
import json
import math
import os
import re
from pathlib import Path

from app.ai import source_copy as ai
from app.ai.source_analysis import ExtractionError
from app.core.config import get_settings
from app.source_analysis import budget
from app.source_analysis.design_preview import ledger_snapshot, validate_local_ledger, write_json
from app.source_analysis.final_eval import Calls
from app.source_analysis.source_copy import compile_copy, validate_draft, validate_ledger

# Original, reconciled local experiment checkpoint. A later invocation must not
# reset the copy allowance by supplying a newer snapshot. Aggregate costs only.
COPY_BASELINE = {"rows": 431, "settledMicros": 1_337_918, "uncertainReservedMicros": 828_496}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def request_chunk(payload):
    # _call sends the prompt as system text and serializes the complete payload,
    # and additionally sends the schema as response_format. Reserve all copies.
    return {
        "completeRequest": payload,
        "systemPrompt": payload["prompt"],
        "responseFormatSchema": payload["schema"],
    }


def load_inputs(manifest_path):
    manifest = json.loads(manifest_path.read_text())
    if set(manifest) != {"sources"} or not 1 <= len(manifest["sources"]) <= 4:
        raise ValueError("INVALID_COPY_MANIFEST")
    result, ids = [], set()
    for item in manifest["sources"]:
        if (
            set(item) != {"id", "fixture", "ledger"}
            or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", item["id"])
            or item["id"] in ids
        ):
            raise ValueError("INVALID_OR_DUPLICATE_COPY_SOURCE")
        ids.add(item["id"])
        fixture_path = Path(item["fixture"]).resolve()
        fixture_bytes = fixture_path.read_bytes()
        fixture = json.loads(fixture_bytes)
        ledger = json.loads(Path(item["ledger"]).read_text())
        if ledger["inputFixtureSha256"] != digest(fixture_bytes):
            raise ValueError("INPUT_FIXTURE_HASH_MISMATCH")
        if ledger["sourceId"] != item["id"]:
            raise ValueError("MANIFEST_SOURCE_MISMATCH")
        validate_ledger(ledger, fixture)
        asset_bytes = []
        for asset in fixture["localAssets"]:
            name = asset["name"]
            if not re.fullmatch(r"[a-zA-Z0-9_-]+\.png", name):
                raise ValueError("INVALID_COPY_ASSET_NAME")
            data = Path(asset["path"]).read_bytes()
            if digest(data) != asset["sha256"]:
                raise ValueError("COPY_ASSET_HASH_MISMATCH")
            asset_bytes.append((name, data))
        result.append((item, fixture, ledger, asset_bytes))
    return result


def run(args):
    # Serialize the entire slice, including read/reserve/settle and failure paths.
    # This is a local experiment runner, never a production worker.
    fd = os.open(
        "/private/tmp/farmclub-dev450-copy.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600
    )
    with os.fdopen(fd, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError("COPY_SLICE_ALREADY_RUNNING") from exc
        return _run_locked(args)


def _run_locked(args):
    if not math.isfinite(args.max_usd) or not 0 < args.max_usd <= 0.25:
        raise ValueError("COPY_SLICE_LIMIT_AT_MOST_QUARTER_USD")
    out = args.out.resolve()
    checkout = Path(__file__).resolve().parents[3]
    if out.exists() or out.is_relative_to(checkout):
        raise ValueError("NEW_PRIVATE_OUTPUT_OUTSIDE_CHECKOUT_REQUIRED")
    inputs = load_inputs(args.manifest)
    cfg = get_settings()
    validate_local_ledger(cfg)
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = 5
    before = ledger_snapshot()
    baseline = json.loads(args.ledger_baseline.read_text())
    if {k: baseline.get(k) for k in COPY_BASELINE} != COPY_BASELINE:
        raise ValueError("ORIGINAL_COPY_BASELINE_REQUIRED")

    def total(row):
        return row["settledMicros"] + row["uncertainReservedMicros"]

    if before["rows"] < baseline["rows"] or total(before) < total(baseline):
        raise ValueError("HISTORICAL_LEDGER_NOT_RECONCILED")
    # The supplied baseline is the original copy-slice start, including failures;
    # repeated CLI invocations do not each acquire a fresh $0.25 allowance.
    allowance = min(
        math.floor(args.max_usd * 1e6) - (total(before) - total(baseline)),
        before["remainingMicros"],
    )
    if allowance <= 0:
        raise ExtractionError("BUDGET_EXCEEDED")
    if args.execute and args.env_file:
        from dotenv import dotenv_values

        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
    if args.execute and not cfg.openrouter_api_key:
        raise ValueError("MISSING_PROVIDER_KEY")
    calls = Calls("openrouter", allowance / 1e6)
    out.mkdir(mode=0o700, parents=True)
    write_json(out / "ledger-before.json", before)
    write_json(
        out / "protocol.json",
        {
            "version": ai.PROMPT_VERSION,
            "criticVersion": ai.CRITIC_PROMPT_VERSION,
            "model": ai.MODEL,
            "execute": args.execute,
            "sourceInput": "ASSISTANT_AUDITED_CLAIMS_ONLY_NO_UNRESTRICTED_OCR",
            "humanReview": "PENDING",
            "imagesAndLayout": "FROZEN",
            "cumulativeCapUsd": 5,
            "copySliceCapUsd": args.max_usd,
            "sliceBaseline": baseline,
            "availableReservationMicros": allowance,
            "sourceCode": {
                str(p.relative_to(checkout)): digest(p.read_bytes())
                for p in [
                    Path(__file__),
                    Path(ai.__file__),
                    Path(compile_copy.__code__.co_filename),
                ]
            },
        },
    )
    records = []
    for item, fixture, ledger, assets in inputs:
        case_dir = out / item["id"]
        case_dir.mkdir(mode=0o700)
        write_json(case_dir / "baseline-fixture.json", fixture)
        write_json(case_dir / "source-ledger.json", ledger)
        payload = ai.writer_payload(ledger)
        chunk = request_chunk(payload)
        record = {
            "sourceId": item["id"],
            "humanReview": "PENDING",
            "estimatedWriterReservationMicros": budget.estimate_micros(
                "openrouter", ai.MODEL, chunk, [], [], output_tokens=ai.MAX_OUTPUT_TOKENS
            ),
        }
        records.append(record)
        write_json(case_dir / "writer-request.json", payload)
        if not args.execute:
            record["status"] = "DRY_RUN_NO_PROVIDER_CALL"
            continue
        try:
            response = calls(
                "source-copy-write",
                ai.MODEL,
                chunk,
                [],
                [],
                lambda led=ledger: ai.edit(led),
                output_tokens=ai.MAX_OUTPUT_TOKENS,
            )
            write_json(case_dir / "writer-response.json", response.plan)
            validate_draft(ledger, response.plan)
            critique = ai.critic_payload(ledger, response.plan)
            write_json(case_dir / "critic-request.json", critique)
            review = calls(
                "source-copy-check",
                ai.MODEL,
                request_chunk(critique),
                [],
                [],
                lambda led=ledger, draft=response.plan: ai.check(led, draft),
                output_tokens=ai.CRITIC_MAX_OUTPUT_TOKENS,
            )
            write_json(case_dir / "critic-response.json", review.plan)
            compiled = compile_copy(fixture, ledger, response.plan, review.plan)
            if (
                compiled["design"] != fixture["design"]
                or compiled["localAssets"] != fixture["localAssets"]
            ):
                raise ValueError("COPY_CHANGED_VISUALS")
            # Keep compiler output for exact immutability audit; relocate only local
            # filesystem pointers in the portable preview fixture, never media URIs.
            write_json(case_dir / "compiled-fixture.json", compiled)
            portable = copy.deepcopy(compiled)
            asset_dir = case_dir / "assets"
            asset_dir.mkdir(mode=0o700)
            for name, data in assets:
                dest = asset_dir / name
                dest.write_bytes(data)
                dest.chmod(0o600)
            for asset in portable["localAssets"]:
                asset["path"] = str(asset_dir / asset["name"])
            portable["provenance"]["sourceCopy"]["writerRequestId"] = response.request_id
            portable["provenance"]["sourceCopy"]["criticRequestId"] = review.request_id
            write_json(case_dir / "fixture.json", portable)
            record.update(status="COMPILED_REQUIRES_TYPESCRIPT_VALIDATION", media=len(assets))
        except ExtractionError as exc:
            record.update(status="NEEDS_REVIEW", error=exc.code, requestId=exc.request_id)
            write_json(case_dir / "failure.json", {**record, "details": exc.details})
            if exc.code in {"REQUEST_UNCERTAIN", "BUDGET_EXCEEDED"}:
                break
        except (ValueError, KeyError, TypeError) as exc:
            record.update(status="NEEDS_REVIEW", error=type(exc).__name__)
            write_json(case_dir / "failure.json", {**record, "details": str(exc)})
        except Exception as exc:
            record.update(status="UNEXPECTED_FAILURE", error=type(exc).__name__)
            write_json(case_dir / "failure.json", record)
            raise
        finally:
            write_json(out / "calls.json", calls.entries)
            write_json(out / "records.json", records)
            write_json(out / "ledger-after.json", ledger_snapshot())
    write_json(out / "records.json", records)
    print(json.dumps({"output": str(out), "records": records, "calls": len(calls.entries)}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--ledger-baseline", type=Path, required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--max-usd", type=float, default=0.25)
    parser.add_argument("--execute", action="store_true")
    run(parser.parse_args())


if __name__ == "__main__":
    main()
