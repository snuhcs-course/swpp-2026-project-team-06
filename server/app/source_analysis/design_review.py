"""DEV-463 explicit, budgeted local diagram review of a prior automatic plan."""

import argparse
import copy
import hashlib
import json
from pathlib import Path

from app.ai import source_design as ai
from app.ai.source_analysis import ExtractionError
from app.core.config import get_settings
from app.source_analysis import budget
from app.source_analysis.design_preview import ledger_snapshot, validate_local_ledger, write_json
from app.source_analysis.final_eval import Calls
from app.source_analysis.source_design import (
    apply_comparison_review,
    comparison_review_images,
    compile_plan,
    make_tiles,
    prepare_raster,
    validate_modules,
)


def run(args):
    if not 0 < args.max_usd <= 1:
        raise ValueError("INVALID_NEW_SLICE_LIMIT")
    manifest = json.loads(args.manifest.read_text())
    if len(manifest["sources"]) != 1:
        raise ValueError("ONE_SOURCE_REVIEW_REQUIRED")
    item = manifest["sources"][0]
    if item["sha256"] != item["privacyReviewedSha256"]:
        raise ValueError("SOURCE_PRIVACY_APPROVAL_REQUIRED")
    validate_modules(item["modules"])
    data = Path(item["path"]).read_bytes()
    if hashlib.sha256(data).hexdigest() != item["sha256"]:
        raise ValueError("SOURCE_CHANGED")
    source = prepare_raster(data, item["id"])
    parent_protocol = json.loads((args.parent_run / "protocol.json").read_text())
    parent_fixture = json.loads((args.parent_run / item["id"] / "fixture.json").read_text())
    if parent_fixture["provenance"]["sourceSha256"] != item["sha256"]:
        raise ValueError("PARENT_SOURCE_CHANGED")
    if parent_fixture["content"]["modules"] != item["modules"]:
        raise ValueError("SAVED_MODULES_CHANGED")
    parent_plan_bytes = (args.parent_run / item["id"] / "response.json").read_bytes()
    plan = json.loads(parent_plan_bytes)
    tiles = make_tiles(source, profile=parent_protocol["preparationProfile"])
    images = comparison_review_images(source, tiles, plan)
    if not images:
        raise ValueError("NO_COMPARISON_TO_REVIEW")
    payload = ai.review_request_payload(images, plan)
    chunk = {
        "completeReviewRequest": payload,
        "systemPrompt": ai.REVIEW_PROMPT,
        "responseFormatSchema": payload["schema"],
    }
    encoded = [image["image"] for image in images]
    estimate = budget.estimate_micros(
        "openrouter", ai.MODEL, chunk, [], encoded, output_tokens=ai.REVIEW_MAX_OUTPUT_TOKENS
    )
    cfg = get_settings()
    validate_local_ledger(cfg)
    before = ledger_snapshot()
    baseline = json.loads(args.ledger_baseline.read_text())
    if (
        before["rows"] < baseline["rows"]
        or before["settledMicros"] + before["uncertainReservedMicros"]
        < baseline["settledMicros"] + baseline["uncertainReservedMicros"]
    ):
        raise ValueError("HISTORICAL_LEDGER_BASELINE_NOT_RECONCILED")
    if estimate > min(int(args.max_usd * 1e6), before["remainingMicros"]):
        raise ValueError("REVIEW_RESERVATION_EXCEEDS_REMAINING_SLICE")
    out = args.out.resolve()
    checkout = Path(__file__).resolve().parents[3]
    if out.is_relative_to(checkout) or out.exists():
        raise ValueError("NEW_PRIVATE_OUTPUT_REQUIRED")
    out.mkdir(parents=True, mode=0o700)
    case = out / item["id"]
    case.mkdir(mode=0o700)
    write_json(out / "ledger-before.json", before)
    write_json(case / "review-request.json", payload)
    write_json(case / "review-images.json", images)
    write_json(
        out / "protocol.json",
        {
            "version": ai.REVIEW_PROMPT_VERSION,
            "model": ai.MODEL,
            "preparationProfile": parent_protocol["preparationProfile"],
            "parentPlanSha256": hashlib.sha256(parent_plan_bytes).hexdigest(),
            "parentProtocol": parent_protocol,
            "manualRegionHintsSupplied": False,
            "reviewReservationMicros": estimate,
            "newRunCapUsd": args.max_usd,
            "cumulativeCapUsd": 5,
            "execute": args.execute,
            "humanReview": "PENDING",
            "sourceCodeSha256": {
                str(p.relative_to(checkout)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in [
                    Path(__file__),
                    Path(ai.__file__),
                    Path(compile_plan.__code__.co_filename),
                ]
            },
        },
    )
    record = {
        "sourceId": item["id"],
        "status": "DRY_REVIEW_NO_PROVIDER_CALL",
        "estimatedReservationMicros": estimate,
        "images": len(images),
    }
    if not args.execute:
        write_json(out / "records.json", [record])
        print(json.dumps(record))
        return
    if args.env_file:
        from dotenv import dotenv_values

        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
    if not cfg.openrouter_api_key:
        raise ValueError("MISSING_PROVIDER_KEY")
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = 5
    calls = Calls("openrouter", min(args.max_usd, before["remainingMicros"] / 1e6))
    review_response = None
    try:
        try:
            response = calls(
                "automatic-diagram-review",
                ai.MODEL,
                chunk,
                [],
                encoded,
                lambda: ai.review_comparisons(images, plan),
                output_tokens=ai.REVIEW_MAX_OUTPUT_TOKENS,
            )
            review_response = response.plan
            write_json(case / "review-response.json", review_response)
            reviewed = apply_comparison_review(source, tiles, plan, review_response)
            record["diagramReviewStatus"] = (
                "REVIEW_INVALID_DIAGRAMS_WITHHELD"
                if "COMPARISON_REVIEW_INVALID_OR_MISSING_ABSTAINED" in reviewed["warnings"]
                else "AUTOMATIC_REVIEW_COMPLETED_PENDING_HUMAN"
            )
        except (ExtractionError, ValueError, KeyError, TypeError) as exc:
            reviewed = copy.deepcopy(plan)
            for region in reviewed["regions"]:
                if region["kind"] == "comparison":
                    region["complete"] = False
            record["diagramReviewStatus"] = "REVIEW_FAILED_DIAGRAMS_WITHHELD"
            write_json(
                case / "review-failure.json",
                {
                    "error": getattr(exc, "code", type(exc).__name__),
                    "details": getattr(exc, "details", str(exc)),
                },
            )
        write_json(case / "response.json", reviewed)
        fixture = compile_plan(source, tiles, item["modules"], reviewed, case / "assets")
        fixture["provenance"].update(
            sourceInput="ORIGINAL_RASTER_NO_CURATED_COORDINATES_OR_LAYOUT",
            parentPlanSha256=hashlib.sha256(parent_plan_bytes).hexdigest(),
            diagramReview={
                "version": ai.REVIEW_PROMPT_VERSION,
                "status": record["diagramReviewStatus"],
                "response": review_response,
            },
            planningRequestId=parent_fixture["provenance"].get("requestId"),
            planningUsage=parent_fixture["provenance"].get("usage"),
        )
        write_json(case / "fixture.json", fixture)
        record.update(
            status="COMPILED_REQUIRES_TYPESCRIPT_VALIDATION", media=len(fixture["design"]["media"])
        )
    except Exception as exc:
        record.update(status="UNEXPECTED_FAILURE", error=type(exc).__name__)
        raise
    finally:
        write_json(out / "calls.json", calls.entries)
        write_json(out / "records.json", [record])
        write_json(out / "ledger-after.json", ledger_snapshot())
    print(json.dumps({"output": str(out), "records": [record]}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["manifest", "parent-run", "ledger-baseline", "out"]:
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--max-usd", type=float, required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--execute", action="store_true")
    run(parser.parse_args())


if __name__ == "__main__":
    main()
