"""DEV-463 local-only automatic source-design runner; never imports production settings/DBs."""

import argparse
import copy
import hashlib
import json
import math
import re
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from app.ai import source_design as ai
from app.ai.source_analysis import ExtractionError
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis import budget
from app.source_analysis.final_eval import Calls
from app.source_analysis.models import Spend
from app.source_analysis.preprocess import scrub
from app.source_analysis.source_design import (
    apply_comparison_review,
    comparison_review_images,
    compile_plan,
    make_tiles,
    prepare_raster,
    validate_modules,
)

CAP_MICROS = 5_000_000


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    path.chmod(0o600)


def ledger_snapshot():
    with get_sessionmaker()() as db:
        rows = db.scalar(select(func.count()).select_from(Spend))
        settled = db.scalar(select(func.coalesce(func.sum(Spend.charged_micros), 0)))
        pending = db.scalar(
            select(func.coalesce(func.sum(Spend.reserved_micros), 0)).where(
                Spend.charged_micros.is_(None)
            )
        )
    return {
        "rows": rows,
        "settledMicros": settled,
        "uncertainReservedMicros": pending,
        "remainingMicros": CAP_MICROS - settled - pending,
    }


def validate_local_ledger(cfg):
    url = make_url(cfg.database_url)
    if (
        cfg.app_env != "local"
        or url.host not in {"127.0.0.1", "localhost"}
        or url.database != "farmclub_dev445_eval"
    ):
        raise ValueError("EXISTING_ISOLATED_LOCAL_LEDGER_REQUIRED")


def reservation_payload(value):
    """Count the full new request text/schema; image bytes are reserved separately."""
    if isinstance(value, dict):
        return {k: reservation_payload(v) for k, v in value.items()}
    if isinstance(value, list):
        return [reservation_payload(v) for v in value]
    if isinstance(value, str) and value.startswith("data:image/"):
        return "<image bytes included separately in reservation>"
    return value


def safe_modules(modules):
    result = copy.deepcopy(modules)
    for module in result:
        for text in module.get("texts", []):
            text["value"] = scrub(text["value"])
        # Saved photo URLs are neither visual evidence nor required planner inputs.
        module["photos"] = [{}] if module.get("photos") else []
    return result


def review_diagrams(source, tiles, plan, calls, case_dir):
    """Run the mandatory comparison gate with the same reserved run budget."""
    if not any(region["kind"] == "comparison" for region in plan["regions"]):
        return plan, None
    review_info = {"version": ai.REVIEW_PROMPT_VERSION, "humanReview": "PENDING"}
    try:
        images = comparison_review_images(source, tiles, plan)
        payload = ai.review_request_payload(images, plan)
        write_json(case_dir / "review-request.json", payload)
        write_json(case_dir / "review-images.json", images)
        chunk = {
            "completeReviewRequest": payload,
            "systemPrompt": ai.REVIEW_PROMPT,
            "responseFormatSchema": payload["schema"],
        }
        response = calls(
            "automatic-diagram-review",
            ai.MODEL,
            chunk,
            [],
            [entry["image"] for entry in images],
            lambda: ai.review_comparisons(images, plan),
            output_tokens=ai.REVIEW_MAX_OUTPUT_TOKENS,
        )
        write_json(case_dir / "review-response.json", response.plan)
        reviewed = apply_comparison_review(source, tiles, plan, response.plan)
        review_info.update(
            requestId=response.request_id, usage=response.usage, response=response.plan
        )
    except (ExtractionError, ValueError, KeyError, TypeError) as exc:
        reviewed = copy.deepcopy(plan)
        for region in reviewed["regions"]:
            if region["kind"] == "comparison":
                region["complete"] = False
        review_info.update(
            error=getattr(exc, "code", type(exc).__name__), status="REVIEW_FAILED_DIAGRAMS_WITHHELD"
        )
        write_json(
            case_dir / "review-failure.json",
            {**review_info, "details": getattr(exc, "details", str(exc))},
        )
    reviewed["warnings"] = reviewed["warnings"][-24:]
    return reviewed, review_info


def run(args):
    if not math.isfinite(args.max_usd) or not 0 < args.max_usd <= 1:
        raise ValueError("NEW_EXPERIMENT_LIMIT_MUST_BE_AT_MOST_ONE_USD")
    out = args.out.resolve()
    checkout = Path(__file__).resolve().parents[3]
    if out.is_relative_to(checkout) or out.exists():
        raise ValueError("NEW_PRIVATE_OUTPUT_OUTSIDE_CHECKOUT_REQUIRED")
    manifest = json.loads(args.manifest.read_text())
    if set(manifest) != {"sources"} or not 1 <= len(manifest["sources"]) <= 4:
        raise ValueError("INVALID_SOURCE_MANIFEST")
    # Validate every source before creating files or incurring any charge.
    inputs = []
    ids = set()
    for item in manifest["sources"]:
        if set(item) != {"id", "path", "sha256", "privacyReviewedSha256", "modules"}:
            raise ValueError("INVALID_SOURCE_ENTRY")
        if (
            not isinstance(item["id"], str)
            or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}", item["id"])
            or item["id"] in ids
            or item["sha256"] != item["privacyReviewedSha256"]
        ):
            raise ValueError("DUPLICATE_OR_UNREVIEWED_SOURCE")
        ids.add(item["id"])
        validate_modules(item["modules"])
        data = Path(item["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise ValueError("SOURCE_HASH_MISMATCH")
        prepared = prepare_raster(data, item["id"])
        tiles = make_tiles(prepared, profile=getattr(args, "profile", "standard"))
        request_modules = safe_modules(item["modules"])
        payload = ai.request_payload(tiles, request_modules)
        inputs.append((item, prepared, tiles, request_modules, payload))
    cfg = get_settings()
    validate_local_ledger(cfg)
    # Only the preexisting provider key may be loaded; never import a deployment DB URL.
    if args.env_file and args.execute:
        from dotenv import dotenv_values

        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = 5
    before = ledger_snapshot()
    baseline = json.loads(args.ledger_baseline.read_text())
    if (
        before["rows"] < baseline["rows"]
        or before["settledMicros"] + before["uncertainReservedMicros"]
        < baseline["settledMicros"] + baseline["uncertainReservedMicros"]
    ):
        raise ValueError("HISTORICAL_LEDGER_BASELINE_NOT_RECONCILED")
    if before["remainingMicros"] <= 0:
        raise ExtractionError("BUDGET_EXCEEDED")
    limit = min(args.max_usd, before["remainingMicros"] / 1e6)
    calls = Calls("openrouter", limit)
    out.mkdir(parents=True, mode=0o700)
    write_json(out / "ledger-before.json", before)
    protocol = {
        "version": ai.PROMPT_VERSION,
        "model": ai.MODEL,
        "sourceInput": "ORIGINAL_PRIVACY_REVIEWED_RASTER_AND_FROZEN_MODULES_ONLY",
        "manualRegionHintsSupplied": False,
        "palette": "BOUNDED_CITRUS_WARM_NOT_AUTOMATIC_COLOR_GENERATION",
        "copyRewritten": False,
        "preparationProfile": getattr(args, "profile", "standard"),
        "providerTimeoutSeconds": getattr(ai, "TIMEOUT_SECONDS", 90),
        "cumulativeCapUsd": 5,
        "newRunCapUsd": limit,
        "execute": args.execute,
        "humanReview": "PENDING",
        "sourceCode": {
            str(p.relative_to(checkout)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [Path(__file__), Path(ai.__file__), Path(compile_plan.__code__.co_filename)]
        },
    }
    write_json(out / "protocol.json", protocol)
    records = []
    for item, prepared, tiles, request_modules, payload in inputs:
        case_dir = out / item["id"]
        case_dir.mkdir(mode=0o700)
        images = [t["image"] for t in tiles]
        chunk = {
            "completeDesignRequest": reservation_payload(payload),
            "systemPrompt": ai.PROMPT,
            "responseFormatSchema": ai.provider_schema(),
        }
        estimate = budget.estimate_micros(
            "openrouter", ai.MODEL, chunk, [], images, output_tokens=ai.MAX_OUTPUT_TOKENS
        )
        record = {
            "sourceId": item["id"],
            "sourceSha256": item["sha256"],
            "tiles": len(tiles),
            "encodedImageBytes": sum(map(len, images)),
            "estimatedReservationMicros": estimate,
            "humanReview": "PENDING",
        }
        records.append(record)
        write_json(case_dir / "request.json", payload)
        write_json(
            case_dir / "tiles.json", [{k: v for k, v in t.items() if k != "image"} for t in tiles]
        )
        if not args.execute:
            record["status"] = "DRY_RUN_NO_PROVIDER_CALL"
            continue
        if not cfg.openrouter_api_key:
            raise ValueError("MISSING_PROVIDER_KEY")
        try:
            response = calls(
                "automatic-source-design",
                ai.MODEL,
                chunk,
                [],
                images,
                lambda ts=tiles, ms=request_modules: ai.analyze(ts, ms),
                output_tokens=ai.MAX_OUTPUT_TOKENS,
            )
            write_json(case_dir / "planning-response.json", response.plan)
            final_plan, review_info = review_diagrams(
                prepared, tiles, response.plan, calls, case_dir
            )
            write_json(case_dir / "response.json", final_plan)
            fixture = compile_plan(
                prepared, tiles, item["modules"], final_plan, case_dir / "assets"
            )
            fixture["provenance"].update(
                requestId=response.request_id,
                usage=response.usage,
                diagramReview=review_info,
                sourceInput="ORIGINAL_RASTER_NO_CURATED_COORDINATES_OR_LAYOUT",
            )
            write_json(case_dir / "fixture.json", fixture)
            record.update(
                status="COMPILED_REQUIRES_TYPESCRIPT_VALIDATION",
                media=len(fixture["design"]["media"]),
            )
            if review_info and review_info.get("error") in {"REQUEST_UNCERTAIN", "BUDGET_EXCEEDED"}:
                break
        except ExtractionError as exc:
            record.update(status="FAILED", error=exc.code, requestId=exc.request_id)
            write_json(
                case_dir / "failure.json", {**record, "usage": exc.usage, "details": exc.details}
            )
            # Do not automatically retry or send another source after uncertain spend.
            if exc.code in {"REQUEST_UNCERTAIN", "BUDGET_EXCEEDED"}:
                break
        except (ValueError, TypeError, KeyError) as exc:
            record.update(status="INVALID_PLAN", error=type(exc).__name__)
            write_json(case_dir / "failure.json", {**record, "details": str(exc)})
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
    parser.add_argument("--max-usd", type=float, default=1)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--profile", choices=["standard", "compact"], default="standard")
    run(parser.parse_args())


if __name__ == "__main__":
    main()
