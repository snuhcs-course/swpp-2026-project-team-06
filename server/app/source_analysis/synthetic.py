"""Reproducible synthetic material and explicitly opt-in paid evaluation.

Run from server: python -m app.source_analysis.synthetic --output .artifacts/source-eval
Add --live only with configured OPENROUTER_API_KEY. No production DB or source inputs.
"""

import argparse
import base64
import io
import json
import time
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.ai.source_analysis import ExtractionError, extract
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis.budget import reserve, settle
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--font", type=str)
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    cfg = get_settings()
    if cfg.app_env != "local" or not any(
        h in cfg.database_url for h in ("@127.0.0.1:", "@localhost:")
    ):
        raise SystemExit("Synthetic evaluation requires a local database")
    if args.live and not cfg.openrouter_api_key:
        raise SystemExit("OPENROUTER_API_KEY is missing; no paid calls were made")
    cfg.source_evaluation = True
    args.output.mkdir(parents=True, exist_ok=True)
    cases = json.loads(CASES.read_text())
    records = []
    for case in cases:
        data, mime, suffix = material(case, args.font)
        (args.output / (case["id"] + suffix)).write_bytes(data)
        record = {
            "id": case["id"],
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
        if not args.live:
            records.append(record)
            continue
        reservation = None
        try:
            raw = prepare(data, mime)
            pages = []
            images = []
            for number, p in enumerate(raw, 1):
                image = base64.b64decode(p["image"]) if p["image"] else None
                safe, spans = redact(image, p["spans"], p.get("regions", []))
                pages.append({"number": number, "spans": spans})
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
            with get_sessionmaker()() as db:
                reservation = reserve(
                    db,
                    SimpleNamespace(id="eval_" + uuid4().hex, attempt=1),
                    "openrouter",
                    chunk,
                    targets,
                    images,
                )
                db.commit()
            started = time.monotonic()
            response = extract("openrouter", "google/gemini-3.1-flash-lite", chunk, targets, images)
            record["durationMs"] = round((time.monotonic() - started) * 1000)
            record["costUsd"] = response.usage.get("cost")
            with get_sessionmaker()() as db:
                settle(db, reservation, response.usage)
                db.commit()
            result = validate(response.extraction, chunk, {t["id"] for t in targets})
            record["actual"] = [
                {"targetId": c.target_id, "fieldKey": c.field_key, "value": c.value}
                for c in result.candidates
            ]
            record["evidence"] = [c.model_dump(by_alias=True) for c in result.candidates]
            text = "\n".join(c.value for c in result.candidates)
            record["criticalErrors"] = sum(
                word in text for word in case.get("forbidden", [])
            ) + sum(c.field_key in case.get("forbiddenFields", []) for c in result.candidates)
            record["status"] = "REVIEW_REQUIRED" if case.get("manualReview") else "EVALUATED"
        except (ExtractionError, PreparationError) as exc:
            record["status"] = "FAILED"
            record["error"] = str(exc)
            if isinstance(exc, ExtractionError):
                with get_sessionmaker()() as db:
                    settle(db, reservation, exc.usage)
                    db.commit()
            if str(exc) == "BUDGET_EXCEEDED":
                records.append(record)
                break
        records.append(record)
        (args.output / "results.json").write_text(json.dumps(records, ensure_ascii=False, indent=2))
    scored = [r for r in records if r["status"] == "EVALUATED"]
    report = {
        "model": "google/gemini-3.1-flash-lite",
        "live": args.live,
        "metrics": evaluate(scored),
        "cases": records,
        "textGatePassed": len(scored) == 16
        and all(r.get("criticalErrors", 0) == 0 for r in scored)
        and (evaluate(scored)["recall"] or 0) >= 0.95
        and (evaluate(scored)["precision"] or 0) >= 0.95,
        "deploymentGate": "HELD_PENDING_VISUAL_AND_FARMER_REVIEW",
        "totalKnownCostUsd": sum(r["costUsd"] or 0 for r in records),
        "note": ("Mock is not model-quality evidence. "
                 "Visual cases require manual review; deployment remains held."),
    }
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(
        json.dumps(
            {
                "sets": len(records),
                "evaluated": len(scored),
                "textGatePassed": report["textGatePassed"],
                "report": str(args.output / "report.json"),
            }
        )
    )


if __name__ == "__main__":
    main()
