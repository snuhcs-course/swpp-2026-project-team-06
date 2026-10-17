"""Reproducible synthetic material and explicitly opt-in paid evaluation.

Run from server: python -m app.source_analysis.synthetic --output .artifacts/source-eval
Add --live only with configured OPENROUTER_API_KEY. No production DB or source inputs.
"""

import argparse
import base64
import hashlib
import io
import json
import time
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.ai.source_analysis import ExtractionError, extract
from app.core.config import SOURCE_OPENROUTER_PRICES, get_settings
from app.core.db import get_sessionmaker
from app.source_analysis.budget import reserve, settle
from app.source_analysis.coverage import audit_coverage
from app.source_analysis.evaluate import evaluate
from app.source_analysis.preprocess import PreparationError, prepare, redact
from app.source_analysis.worker import validate

CASES = Path(__file__).resolve().parents[2] / "tests/fixtures/source-analysis/cases.json"


def material(case, font_path=None):
    if case["kind"] not in ("image", "pdf"):
        return case["text"].encode(), "text/plain", ".txt"
    image = Image.new("RGB", (1000, 700), "white")
    font = ImageFont.truetype(font_path, 44) if font_path else ImageFont.load_default(size=36)
    ImageDraw.Draw(image).multiline_text(
        (60, 80), case["text"], fill="black", font=font, spacing=30
    )
    output = io.BytesIO()
    if case["kind"] == "image":
        image = image.rotate(90, expand=True).filter(ImageFilter.GaussianBlur(0.7))
        image.save(output, "PNG")
        return output.getvalue(), "image/png", ".png"
    image.save(output, "PDF", resolution=120)
    return output.getvalue(), "application/pdf", ".pdf"


def group_result(rows):
    metrics = evaluate(rows)
    return {
        **metrics,
        "failed": sum(r["status"] == "FAILED" for r in rows),
        "evaluated": sum(r["status"] == "EVALUATED" for r in rows),
        "passed": bool(rows)
        and all(r["status"] == "EVALUATED" for r in rows)
        and all(r.get("criticalErrors", 0) == 0 for r in rows)
        and (metrics["recall"] or 0) >= 0.95
        and (metrics["precision"] or 0) >= 0.95,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--font", type=str)
    parser.add_argument("--cases", type=Path, default=CASES)
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--key-prompt", action="store_true")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    cfg = get_settings()
    model = cfg.source_analysis_model
    if args.live and model not in SOURCE_OPENROUTER_PRICES:
        raise SystemExit("Evaluation requires a budget-qualified OpenRouter model")
    if cfg.app_env != "local" or not any(
        h in cfg.database_url for h in ("@127.0.0.1:", "@localhost:")
    ):
        raise SystemExit("Synthetic evaluation requires a local database")
    if args.live and args.key_prompt:
        from getpass import getpass

        cfg.openrouter_api_key = getpass("OpenRouter key (not stored): ")
    if args.live and not cfg.openrouter_api_key:
        raise SystemExit("OPENROUTER_API_KEY is missing; no paid calls were made")
    cfg.source_evaluation = True
    args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
    args.output.chmod(0o700)
    cases = json.loads(args.cases.read_text())
    if args.only:
        cases = [c for c in cases if c["id"] in args.only]
    records = []
    for case in cases:
        if "file" in case:
            path = args.cases.parent / case["file"]
            data, mime, suffix = path.read_bytes(), case["mime"], path.suffix
            if hashlib.sha256(data).hexdigest() != case["sha256"]:
                raise SystemExit(f"Source changed: {case['id']}")
        else:
            data, mime, suffix = material(case, args.font)
        (args.output / (case["id"] + suffix)).write_bytes(data)
        record = {
            "id": case["id"],
            "kind": case["kind"],
            "split": case.get("split", "development"),
            "sourceUrl": case.get("url"),
            "status": "NOT_RUN",
            "expected": [],
            "actual": [],
            "durationMs": None,
            "costUsd": None,
            "manualReview": case.get("manualReview", False),
        }
        target = None if case.get("ambiguous") else "synthetic-product"
        record["expected"] = [
            {"targetId": target, "fieldKey": f, "value": v} for f, v, q in case["expected"]
        ]
        if case["kind"] in ("duplicate", "empty"):
            record["status"] = "API_CONTRACT_CASE"
            records.append(record)
            continue
        if not args.live and not args.prepare_only:
            records.append(record)
            continue
        reservation = None
        settled = False
        diagnostic = {}
        try:
            raw = prepare(data, mime)
            diagnostic["preparation"] = [{k: v for k, v in p.items() if k != "image"} for p in raw]
            pages = []
            images = []
            for number, p in enumerate(raw, 1):
                image = base64.b64decode(p["image"]) if p["image"] else None
                safe, spans = redact(image, p["spans"], p.get("regions", []))
                pages.append({"number": number, "spans": spans})
                if safe:
                    (args.output / f"{case['id']}-page-{number}.png").write_bytes(safe)
                if case.get("visual") and safe:
                    images.append(base64.b64encode(safe).decode())
            chunk = {
                "sourceId": case["id"],
                "sourceRevision": 1,
                "checksum": "synthetic",
                "pages": pages,
            }
            targets = [{"id": "synthetic-product"}] + (
                [{"id": "synthetic-other"}] if case.get("ambiguous") else []
            )
            diagnostic["safeInput"] = chunk
            if args.prepare_only:
                record["status"] = "PREPARED"
                records.append(record)
                (args.output / (case["id"] + "-diagnostic.json")).write_text(
                    json.dumps(diagnostic, ensure_ascii=False, indent=2)
                )
                continue
            with get_sessionmaker()() as db:
                reservation = reserve(
                    db,
                    SimpleNamespace(id="eval_" + uuid4().hex, attempt=1),
                    "openrouter",
                    model,
                    chunk,
                    targets,
                    images,
                )
                db.commit()
            started = time.monotonic()
            response = extract("openrouter", model, chunk, targets, images)
            record["durationMs"] = round((time.monotonic() - started) * 1000)
            record["costUsd"] = response.usage.get("cost")
            diagnostic["usage"] = response.usage
            diagnostic["requestId"] = response.request_id
            with get_sessionmaker()() as db:
                settle(db, reservation, response.usage)
                db.commit()
            settled = True
            diagnostic["response"] = response.extraction.model_dump(by_alias=True)
            result = validate(response.extraction, chunk, {t["id"] for t in targets})
            diagnostic["coverageAudit"] = audit_coverage(result, chunk)
            record["actual"] = [
                {"targetId": c.target_id, "fieldKey": c.field_key, "value": c.value}
                for c in result.candidates
            ]
            record["evidence"] = [c.model_dump(by_alias=True) for c in result.candidates]
            text = "\n".join(c.value for c in result.candidates)
            record["criticalErrors"] = sum(
                word in text for word in case.get("forbidden", [])
            ) + sum(c.field_key in case.get("forbiddenFields", []) for c in result.candidates)
            record["status"] = "EVALUATED"
        except (ExtractionError, PreparationError) as exc:
            record["status"] = "FAILED"
            record["error"] = str(exc)
            diagnostic["error"] = {"code": str(exc), "details": getattr(exc, "details", {})}
            if isinstance(exc, ExtractionError) and not settled:
                diagnostic["usage"] = exc.usage
                diagnostic["requestId"] = exc.request_id
                with get_sessionmaker()() as db:
                    settle(db, reservation, exc.usage)
                    db.commit()
        (args.output / (case["id"] + "-diagnostic.json")).write_text(
            json.dumps(diagnostic, ensure_ascii=False, indent=2)
        )
        records.append(record)
        (args.output / "results.json").write_text(json.dumps(records, ensure_ascii=False, indent=2))
    scored = [r for r in records if r["status"] != "API_CONTRACT_CASE"]

    groups = {
        kind: group_result([r for r in scored if r["kind"] == kind])
        for kind in {r["kind"] for r in scored}
    }
    report = {
        "model": model,
        "live": args.live,
        "metrics": evaluate(scored),
        "byFormat": groups,
        "bySplit": {
            split: group_result([r for r in scored if r["split"] == split])
            for split in {r["split"] for r in scored}
        },
        "cases": records,
        "textGatePassed": groups.get("text", {}).get("passed", False),
        "qualityGatePassed": bool(groups) and all(g["passed"] for g in groups.values()),
        "deploymentGate": (
            "HELD_PENDING_FARMER_REVIEW"
            if groups and all(g["passed"] for g in groups.values())
            else "HELD_PENDING_QUALITY_AND_FARMER_REVIEW"
        ),
        "totalKnownCostUsd": sum(r["costUsd"] or 0 for r in records),
        "note": "Failures and empty results count toward recall. Exact-match grading. "
        "Public source validation does not replace farmer acceptance.",
    }
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(
        json.dumps(
            {
                "sets": len(records),
                "evaluated": sum(r["status"] == "EVALUATED" for r in scored),
                "textGatePassed": report["textGatePassed"],
                "report": str(args.output / "report.json"),
            }
        )
    )


if __name__ == "__main__":
    main()
