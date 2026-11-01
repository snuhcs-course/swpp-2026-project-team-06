"""DEV-170 local stage-2 evaluation. No calls without explicit provider consent.

Private artifacts stay outside the checkout. stdout and reports contain only metadata.
"""

import argparse
import csv
import json
import math
import os
import time
from collections import Counter
from pathlib import Path
from statistics import median
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy.engine import make_url

from app.ai import source_analysis as extraction_ai
from app.ai import source_refine as refine_ai
from app.ai.source_ocr import OCR_MODEL, OCR_PROMPT
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis import budget, final_score, refinement
from app.source_analysis.preprocess import PREPROCESS_VERSION, PreparationError, parse, scrub
from app.source_analysis.synthetic import CASES, material
from app.source_analysis.text_safety import SAFETY_LISTS_HASH
from app.source_analysis.worker import transcribe_pages, validate_candidates

ROOT = Path(__file__).resolve().parents[3]
SYNTHETIC_GOLD = final_score.VALIDATION_DIR / "source-final-gold-i3-dev-synthetic.json"
LABEL = "MOCK DRY RUN — not a quality result"
FONT = Path("/System/Library/Fonts/AppleSDGothicNeo.ttc")
ERROR_CODES = {
    "PROVIDER_AUTH",
    "PROVIDER_REJECTED",
    "REQUEST_UNCERTAIN",
    "RATE_LIMITED",
    "INVALID_MODEL_OUTPUT",
    "INCOMPLETE_OR_REFUSED",
    "BUDGET_EXCEEDED",
    "CANDIDATES_REJECTED",
    "UNSUPPORTED_MODEL",
    "OCR_FAILED",
}


def source_error_code(exc, stage):
    """Only fixed codes cross into metadata; never serialize exception messages."""
    code = getattr(exc, "code", None)
    if isinstance(code, str) and code in ERROR_CODES:
        return code
    if stage == "ocr":
        return "OCR_FAILED"
    return "PREPROCESS_FAILED" if stage == "preprocess" else "SOURCE_FAILED"


def costs(entries):
    settled = sum(e["costUsd"] for e in entries)
    reserved = sum(e["reservedMicros"] for e in entries) / 1e6
    unsettled = sum(e["reservedMicros"] for e in entries if not e["costKnown"]) / 1e6
    return {
        "costUsd": settled,
        "settledUsd": settled,
        "reservedUsd": reserved,
        "unsettledReservedUsd": unsettled,
    }


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def private_path(path):
    path = path.resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError("Private output must be outside the repository")
    return path


def claim_holdout(gold_path, acknowledged, force=False, rerun_reason=None):
    if not acknowledged:
        raise ValueError("Holdout requires --i-understand-holdout-runs-once")
    if force and (not rerun_reason or not rerun_reason.strip()):
        raise ValueError("--force-rerun requires --rerun-reason")
    marker = gold_path.with_name(gold_path.name + ".run-once.json")
    attempt = int(marker.exists()) + len(list(marker.parent.glob(marker.name + ".*"))) + 1
    if attempt > 1 and not force:
        raise FileExistsError("Holdout attempt already exists")
    # Never erase the previous attempt. Force appends a new attempt beside it.
    target = marker
    if attempt > 1 and force:
        target = marker.with_name(marker.name + "." + str(attempt))
    with target.open("x", encoding="utf-8") as stream:
        os.chmod(target, 0o600)
        json.dump(
            {
                "goldSha256": final_score.sha256(gold_path.read_bytes()),
                "attempt": attempt,
                "rerunReason": rerun_reason.strip() if force else None,
                "startedUnix": time.time(),
            },
            stream,
        )
    return target


def dataset(split, subset, dev_dir, holdout_dir, font=None):
    """Read input material only; gold never feeds the model or mock provider."""
    manifest = read_json(
        final_score.DEV_MANIFEST if split == "development" else final_score.HOLDOUT_LOCK
    )
    cases = manifest["cases"] if split == "development" else manifest["sources"]
    synthetic = {c["id"]: c for c in read_json(CASES)}
    result = []
    for case in cases:
        is_synthetic = case.get("status") == "READY_SYNTHETIC"
        if split == "development" and subset != "all" and (is_synthetic != (subset == "synthetic")):
            continue
        if is_synthetic:
            data, mime, suffix = material(synthetic[case["id"]], font)
        else:
            directory = (dev_dir if split == "development" else holdout_dir) / "safe"
            paths = [directory / (case["id"] + s) for s in (".txt", ".png", ".jpg", ".pdf")]
            paths = [p for p in paths if p.exists()]
            if len(paths) != 1:
                raise ValueError("Missing or ambiguous safe input")
            path = paths[0]
            data, suffix = path.read_bytes(), path.suffix
            mime = {
                ".txt": "text/plain",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".pdf": "application/pdf",
            }[suffix]
        result.append(
            {
                "id": case["id"],
                "format": case["format"],
                "data": data,
                "mime": mime,
                "suffix": suffix,
                "inputSha256": final_score.sha256(data),
                "synthetic": is_synthetic,
            }
        )
    return result


def frozen_inputs(rows, manifests):
    if not manifests:
        return rows
    snapshots = {}
    for manifest in manifests:
        for source in read_json(manifest)["sources"]:
            sid = source["id"]
            if sid in snapshots:
                raise ValueError("Duplicate frozen source")
            data = (manifest.parent / source["inputPath"]).read_bytes()
            if final_score.sha256(data) != source["inputSha256"]:
                raise ValueError("Frozen source changed")
            snapshots[sid] = {**source, "data": data}
    if set(snapshots) != {r["id"] for r in rows}:
        raise ValueError("Frozen source IDs differ")
    for row in rows:
        snapshot = snapshots[row["id"]]
        if row["format"] != snapshot["format"] or row["mime"] != snapshot["mime"]:
            raise ValueError("Frozen source format differs")
        if not row["synthetic"] and row["inputSha256"] != snapshot["inputSha256"]:
            raise ValueError("Safe input changed since freeze")
        row.update(data=snapshot["data"], inputSha256=snapshot["inputSha256"])
    return rows


def save_inputs(out, rows):
    directory = out / "inputs"
    directory.mkdir(mode=0o700)
    sources = []
    for row in rows:
        name = row["id"] + row["suffix"]
        (directory / name).write_bytes(row["data"])
        (directory / name).chmod(0o600)
        sources.append(
            {
                **{k: row[k] for k in ("id", "format", "mime", "inputSha256")},
                "inputPath": "inputs/" + name,
            }
        )
    write_json(out / "inputs.json", {"sources": sources})


def load_gold(split, subset, dev_dir, holdout_dir, rows):
    golds, references, gold_files = [], [], []
    if split == "development" and subset != "public":
        if (
            final_score.sha256(SYNTHETIC_GOLD.read_bytes())
            != read_json(final_score.DEV_MANIFEST)["goldFileSha256"]
        ):
            raise ValueError("Synthetic gold changed")
        golds.append(final_score.Gold.model_validate(read_json(SYNTHETIC_GOLD)))
        gold_files.append(SYNTHETIC_GOLD)
    if split == "holdout" or subset != "synthetic":
        path = (
            holdout_dir / "final-gold-v1.1.json"
            if split == "holdout"
            else dev_dir / "final-gold-dev-public.json"
        )
        ref = final_score.LocalGold(
            path=str(path),
            split=split,
            lockPath=str(holdout_dir / "final-gold-v1.1.lock.json") if split == "holdout" else None,
        )
        golds.append(final_score.load_local_gold(ref, ROOT, {r["id"]: r["format"] for r in rows}))
        references.append(ref.model_dump())
    combined = {
        "schemaVersion": 1,
        "split": split,
        "sources": [s.model_dump() for g in golds for s in g.sources],
    }
    final_score.Gold.model_validate(combined)
    return references, gold_files


def estimate(rows, provider, model):
    """Planning estimate, NOT a quote: 4k input/2k output per page and refine.

    Raster page count is approximated by conservative 720px tiles (PDF: physical pages).
    Actual reservations use UTF-8/image bounds in budget.py before every call.
    """
    from io import BytesIO

    from PIL import Image

    pages = tiles = 0
    for row in rows:
        if row["mime"] == "application/pdf":
            import pypdfium2 as pdfium

            with pdfium.PdfDocument(row["data"]) as doc:
                pages += len(doc)
                tiles += sum(
                    math.ceil(doc[i].get_height() * 200 / 72 / 720) for i in range(len(doc))
                )
        elif row["mime"].startswith("image/"):
            pages += 1
            with Image.open(BytesIO(row["data"])) as image:
                tiles += math.ceil(image.height / 720)
        else:
            pages += max(1, math.ceil(len(row["data"]) / 20000))
    # Existing configured price caps, not fetched prices. Include vision OCR for OpenRouter.
    from app.core.config import SOURCE_OPENROUTER_PRICES

    inp, out = SOURCE_OPENROUTER_PRICES[model] if provider == "openrouter" else (2, 10)
    ocr_in, ocr_out = SOURCE_OPENROUTER_PRICES[OCR_MODEL]
    planned = (pages + len(rows)) * (4000 * inp + 2000 * out) + (
        tiles * (4000 * ocr_in + 2048 * ocr_out) if provider == "openrouter" else 0
    )
    return {
        "sources": len(rows),
        "estimatedExtractionCalls": pages,
        "estimatedRefinementCalls": len(rows),
        "estimatedOcrCalls": tiles if provider == "openrouter" else 0,
        "estimatedUsd": round(planned / 1e6, 6),
    }


class Calls:
    """Run-local ceiling plus the existing global/evaluation Spend ledger."""

    def __init__(self, provider, max_usd):
        if not math.isfinite(max_usd) or max_usd <= 0:
            raise ValueError("Invalid --max-usd")
        self.provider = provider
        self.limit = math.floor(max_usd * 1e6)
        self.used = 0
        self.entries = []

    def __call__(self, stage, model, chunk, targets, images, fn, output_tokens=None):
        amount = (
            0
            if self.provider == "mock"
            else budget.estimate_micros(
                self.provider, model, chunk, targets, images, output_tokens=output_tokens
            )
        )
        if self.used + amount > self.limit:
            raise extraction_ai.ExtractionError("BUDGET_EXCEEDED")
        reservation = None
        if self.provider != "mock":
            with get_sessionmaker()() as db:
                reservation = budget.reserve(
                    db,
                    SimpleNamespace(id="eval-" + uuid4().hex, attempt=1),
                    self.provider,
                    model,
                    chunk,
                    targets,
                    images,
                    stage=stage,
                    output_tokens=output_tokens,
                )
                db.commit()
        self.used += amount
        started = time.perf_counter()
        usage, request_id = {}, None
        try:
            response = fn()
            usage, request_id = response.usage, response.request_id
            return response
        except extraction_ai.ExtractionError as exc:
            usage, request_id = exc.usage, exc.request_id
            raise
        finally:
            cost = usage.get("cost")
            known = (
                isinstance(cost, (int, float))
                and not isinstance(cost, bool)
                and math.isfinite(cost)
                and cost >= 0
            )
            settled = math.ceil(cost * 1e6) if known else 0
            # Pending reservations still consume the ceiling, but are not settled spend.
            self.used += (settled if known else amount) - amount
            if reservation:
                with get_sessionmaker()() as db:
                    budget.settle(db, reservation, usage)
                    db.commit()
            # Token usage and request IDs are local-only; publish summaries below.
            self.entries.append(
                {
                    "stage": stage,
                    "model": model,
                    "usage": usage,
                    "requestId": request_id,
                    "reservedMicros": amount,
                    "costUsd": settled / 1e6,
                    "costKnown": known or self.provider == "mock",
                    "latencyMs": (time.perf_counter() - started) * 1000,
                }
            )


def evaluate_source(row, provider, model, calls):
    started = time.perf_counter()
    first_entry = len(calls.entries)
    metric = {k: row[k] for k in ("id", "format", "inputSha256")}
    metric.update(status="FAILED", errorCode=None, stage1Ms=None, stage2Ms=None, preprocessMs=None)
    record = {"id": row["id"], "format": row["format"], "status": "FAILED", "modules": []}
    candidates, stored, safe_text = [], [], ""
    stage2_usage, stage2_diagnostics, stage1_diagnostics = {}, {}, []
    stage = "preprocess"
    try:
        # Same parser function as the bounded product subprocess; safe frozen inputs only.
        pages = parse(row["data"], row["mime"])
        metric["preprocessMs"] = (time.perf_counter() - started) * 1000
        target = {"id": "eval-target"}
        chunk = {
            "sourceId": row["id"],
            "sourceRevision": 1,
            "checksum": row["inputSha256"],
            "pages": [],
        }
        stage1 = time.perf_counter()
        rejected = 0
        for number, page in enumerate(pages, 1):
            spans = [{**s, "text": scrub(s["text"])} for s in page["spans"]]
            one = {**chunk, "pages": [{"number": number, "spans": spans}]}
            if provider == "openrouter" and row["mime"] != "text/plain":
                import base64

                stage = "ocr"
                transcribe_pages(one, {number: base64.b64decode(page["image"])}, calls)
            chunk["pages"].extend(one["pages"])
            # Match the product's per-page / 20k text chunks.
            groups, group, size = [], [], 0
            for span in one["pages"][0]["spans"]:
                if size + len(span["text"]) > 20000 and group and provider != "openrouter":
                    groups.append(group)
                    group, size = [], 0
                group.append(span)
                size += len(span["text"])
            groups.append(group)
            for group in groups:
                stage = "extract"
                part = {**one, "pages": [{"number": number, "spans": group}]}
                response = calls(
                    "extract",
                    model,
                    part,
                    [target],
                    [],
                    lambda part=part: extraction_ai.extract(
                        provider, model, part, [target], [], mock_empty=True
                    ),
                )
                accepted, diagnostics = validate_candidates(
                    response.extraction, part, {target["id"]}
                )
                stage1_diagnostics.append(diagnostics)
                rejected += diagnostics["rejectedCount"]
                for c in accepted.candidates:
                    value = {"id": "c-" + str(len(candidates)), **c.model_dump(by_alias=True)}
                    if not any(
                        all(
                            value[k] == old[k]
                            for k in ("targetId", "fieldKey", "value", "historical", "evidence")
                        )
                        for old in candidates
                    ):
                        candidates.append(value)
        metric["stage1Ms"] = (time.perf_counter() - stage1) * 1000
        safe_text = "\n".join(s["text"] for p in chunk["pages"] for s in p["spans"])
        metric["rejectedCandidates"] = rejected
        # The actual worker queues stage 2 only after all extraction items succeeded.
        if rejected:
            raise extraction_ai.ExtractionError("CANDIDATES_REJECTED")
        stage2 = time.perf_counter()
        stage = "refine"
        # Match refinement.current_candidates: only this target, in evidence source order.
        selected = [c for c in candidates if c["targetId"] == target["id"]]
        positions = {
            (p["number"], s["id"]): (index, s["text"])
            for p in chunk["pages"]
            for index, s in enumerate(p["spans"])
        }

        def source_order(candidate):
            evidence = candidate["evidence"][0]
            position, text = min(
                (
                    positions[(evidence["page"], sid)]
                    for sid in evidence["spanIds"]
                    if (evidence["page"], sid) in positions
                ),
                default=(0, ""),
            )
            return evidence["page"], position, text.find(evidence["quote"]), candidate["id"]

        selected.sort(key=source_order)
        mode = provider if selected else "mock"  # Same empty-input optimization as product.
        if provider == "mock":
            response = calls(
                "refine",
                model,
                {},
                [target],
                [],
                lambda: refine_ai.refine("mock", model, target, selected),
            )
        elif mode == "mock":
            response = refine_ai.refine("mock", model, target, selected)
        else:
            safe = [
                {
                    **c,
                    "value": scrub(c["value"]),
                    "evidence": [{**e, "quote": scrub(e["quote"])} for e in c["evidence"]],
                }
                for c in selected
            ]
            response = calls(
                "refine",
                model,
                {"prompt": refine_ai.PROMPT, "candidates": safe},
                [target],
                [],
                lambda: refine_ai.refine(provider, model, target, safe),
            )
        stage2_usage = response.usage
        stored, diagnostics = refinement.validate(response.refinement, selected, target["id"])
        stage2_diagnostics = diagnostics
        metric["stage2Ms"] = (time.perf_counter() - stage2) * 1000
        record.update(
            status="EVALUATED" if stored else "EMPTY",
            modules=[
                {"module": m["module"], "texts": [t["value"] for t in m["texts"]]} for m in stored
            ],
        )
        metric["rejectedTexts"] = diagnostics["rejectedCount"]
        metric["status"] = record["status"]
    except Exception as exc:
        # Never serialize exception messages, Pydantic input, provider payloads or private paths.
        metric["status"] = "FAILED"
        metric["errorCode"] = (
            source_error_code(exc, stage)
            if isinstance(exc, (extraction_ai.ExtractionError, PreparationError))
            else "SOURCE_FAILED"
        )
        if isinstance(exc, extraction_ai.ExtractionError) and exc.code == "BUDGET_EXCEEDED":
            metric["budgetExceeded"] = True
    finally:
        if "chunk" in locals():
            safe_text = "\n".join(s["text"] for p in chunk["pages"] for s in p["spans"])
        if "stage2" in locals() and metric["stage2Ms"] is None:
            metric["stage2Ms"] = (time.perf_counter() - stage2) * 1000
        entries = calls.entries[first_entry:]
        metric.update(
            endToEndMs=(time.perf_counter() - started) * 1000,
            **costs(entries),
            costKnown=all(e["costKnown"] for e in entries),
            calls=len(entries),
        )
        if metric["stage1Ms"] is None and metric["preprocessMs"] is not None:
            metric["stage1Ms"] = (time.perf_counter() - stage1) * 1000
    return (
        record,
        metric,
        safe_text,
        {
            "modules": stored,
            "stage2Usage": stage2_usage,
            "stage1Diagnostics": stage1_diagnostics,
            "stage2Diagnostics": stage2_diagnostics,
            "candidates": candidates,
            "calls": calls.entries[first_entry:],
        },
    )


def aggregate(metrics):
    result = {}
    for fmt in final_score.FORMATS:
        rows = [r for r in metrics if r["format"] == fmt]
        group = {"sources": len(rows), "statuses": dict(Counter(r["status"] for r in rows))}
        for key in ("preprocessMs", "stage1Ms", "stage2Ms", "endToEndMs"):
            values = sorted(r[key] for r in rows if r[key] is not None)
            group[key] = {
                "observed": len(values),
                "p50": median(values) if values else None,
                "p95": values[math.ceil(0.95 * len(values)) - 1] if values else None,
            }
        total = sum(r["costUsd"] for r in rows)
        group.update(
            totalCostUsd=total,
            totalSettledUsd=total,
            totalReservedUsd=sum(r.get("reservedUsd", 0) for r in rows),
            totalUnsettledReservedUsd=sum(r.get("unsettledReservedUsd", 0) for r in rows),
            meanCostUsd=total / len(rows) if rows else None,
            costsKnown=all(r["costKnown"] for r in rows),
        )
        result[fmt] = group
    return result


def write_envelope(out, rows, results, references):
    sources = []
    for row, (record, _metric, safe, stored) in zip(rows, results, strict=True):
        sid = row["id"]
        (out / f"{sid}.safe.txt").write_text(safe, encoding="utf-8")
        (out / f"{sid}.safe.txt").chmod(0o600)
        write_json(out / f"{sid}.output.json", record)
        write_json(out / f"{sid}.stored.json", stored)
        sources.append(
            {
                "id": sid,
                "format": row["format"],
                "safeTextPath": f"{sid}.safe.txt",
                "outputPath": f"{sid}.output.json",
            }
        )
    envelope = {"schemaVersion": 1, "sources": sources, "gold": references}
    final_score.FileEnvelope.model_validate(envelope)
    write_json(out / "runs.json", envelope)


def sentences(record):
    return [
        s for m in record["modules"] for t in m["texts"] for s in final_score.split_sentences(t)
    ]


AUDIT_COLUMNS = ["id", "sentenceIndex", "sentenceSha256", "critical", "sentence", "supported"]
SOURCE_COLUMNS = [
    "id",
    "acceptedEvidenceSupported",
    "missingCriticalBlankOrFlagged",
    "conflictingCriticalBlankOrFlagged",
    "appliedPageUnsupportedCriticalCount",
]


def worksheets(out):
    envelope = read_json(out / "runs.json")
    with (out / "audit.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=AUDIT_COLUMNS)
        writer.writeheader()
        for source in envelope["sources"]:
            record = read_json(out / source["outputPath"])
            for index, sentence in enumerate(sentences(record)):
                critical = any(final_score.sensitive_tokens(sentence).values())
                writer.writerow(
                    {
                        "id": source["id"],
                        "sentenceIndex": index,
                        "sentenceSha256": final_score.sha256(sentence.encode()),
                        "critical": str(critical).lower(),
                        "sentence": sentence,
                        "supported": "",
                    }
                )
    with (out / "audit.csv").open(encoding="utf-8", newline="") as stream:
        critical_rows = [row for row in csv.DictReader(stream) if row["critical"] == "true"]
    with (out / "critical-audit.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=AUDIT_COLUMNS)
        writer.writeheader()
        writer.writerows(critical_rows)
    with (out / "source-audit.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=SOURCE_COLUMNS)
        writer.writeheader()
        writer.writerows({"id": s["id"]} for s in envelope["sources"])


def import_audit(out, audit_path):
    envelope = read_json(out / "runs.json")
    records = {s["id"]: read_json(out / s["outputPath"]) for s in envelope["sources"]}
    seen = set()
    with audit_path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            record = records[row["id"]]
            index = int(row["sentenceIndex"])
            text = sentences(record)[index]
            key = row["id"], index
            if key in seen or row["sentenceSha256"] != final_score.sha256(text.encode()):
                raise ValueError("Invalid audit hash or duplicate")
            seen.add(key)
            answer = row["supported"].strip().lower()
            if answer not in ("", "true", "false"):
                raise ValueError("Use true, false, or blank in audit")
            judgments = record.setdefault("supportJudgments", [])
            judgments[:] = [j for j in judgments if j["sentenceIndex"] != index]
            if answer:
                judgments.append(
                    {
                        "sentenceIndex": index,
                        "sentenceSha256": row["sentenceSha256"],
                        "supported": answer == "true",
                    }
                )
    # Validate all rows before modifying any output.
    for record in records.values():
        final_score.Run.model_validate(record)
    for source in envelope["sources"]:
        write_json(out / source["outputPath"], records[source["id"]])


def audit_summary(out, source_audit=None):
    envelope = read_json(out / "runs.json")
    source_rows = {}
    if source_audit:
        with source_audit.open(encoding="utf-8", newline="") as stream:
            for row in csv.DictReader(stream):
                if row["id"] in source_rows or row["id"] not in {
                    s["id"] for s in envelope["sources"]
                }:
                    raise ValueError("Invalid source audit ID")
                for k in SOURCE_COLUMNS[1:4]:
                    if row[k] not in ("", "true", "false"):
                        raise ValueError("Invalid source audit judgment")
                if row[SOURCE_COLUMNS[4]] and not row[SOURCE_COLUMNS[4]].isdigit():
                    raise ValueError("Invalid applied-page count")
                source_rows[row["id"]] = row
    result = {}
    for fmt in final_score.FORMATS:
        counts = Counter()
        for source in envelope["sources"]:
            if source["format"] != fmt:
                continue
            record = final_score.Run.model_validate(read_json(out / source["outputPath"]))
            judgments = {j.sentenceIndex: j.supported for j in record.supportJudgments}
            texts = sentences(record.model_dump())
            counts.update(
                sentences=len(texts),
                reviewed=len(judgments),
                supported=sum(judgments.values()),
                unsupported=sum(not v for v in judgments.values()),
                criticalSentences=sum(any(final_score.sensitive_tokens(t).values()) for t in texts),
            )
            row = source_rows.get(source["id"], {})
            complete = all(row.get(k, "") for k in SOURCE_COLUMNS[1:])
            counts["sourcesReviewed"] += int(complete)
            for key in SOURCE_COLUMNS[1:4]:
                counts[key + "Reviewed"] += int(bool(row.get(key)))
                counts[key + "Passed"] += int(row.get(key) == "true")
            counts["sourceAuditFailures"] += int(
                any(row.get(k) == "false" for k in SOURCE_COLUMNS[1:4])
            )
            counts["appliedUnsupportedCritical"] += int(row.get(SOURCE_COLUMNS[4]) or 0)
        result[fmt] = dict(counts)
    return result


def report(out, gold_files, source_audit=None):
    # Invoke the pinned scorer CLI, including its private-gold/lock validation and redaction.
    args = [
        "--runs",
        str(out / "runs.json"),
        "--report",
        str(out / "score.json"),
        "--markdown",
        str(out / "score.md"),
    ]
    if gold_files:
        args += ["--gold", *map(str, gold_files)]
    # main prints only its safe count table. Keep runner stdout machine-readable.
    import contextlib
    import io

    with contextlib.redirect_stdout(io.StringIO()):
        if final_score.main(args) == 2:
            raise ValueError("Scorer rejected input")
    scored, metadata = read_json(out / "score.json"), read_json(out / "metadata.json")
    audits = audit_summary(out, source_audit)
    result = {
        "label": LABEL if metadata["provider"] == "mock" else "LIVE — see human audit status",
        "config": {k: v for k, v in metadata.items() if k != "goldFiles"},
        "quality": scored,
        "performanceByFormat": aggregate(metadata["sources"]),
        "auditByFormat": audits,
        "acceptance": "BLOCKED — live measurement and human audit required",
    }
    result["targetsByFormat"] = targets(scored, audits, metadata["provider"])
    gates = [r["result"] for r in result["targetsByFormat"].values() if r["sources"]]
    result["acceptance"] = (
        "FAIL" if "FAIL" in gates else "BLOCKED" if "BLOCKED" in gates else "PASS"
    )
    write_json(out / "report.json", result)
    (out / "report.md").write_text(render(result), encoding="utf-8")
    return result


def targets(scored, audits, provider):
    result = {}
    for fmt, quality in scored["byFormat"].items():
        audit = audits[fmt]
        n = quality["sources"]
        total = audit.get("sentences", 0)
        reviewed = audit.get("reviewed", 0)
        precision = audit.get("supported", 0) / total if total and total == reviewed else None
        complete = audit.get("sourcesReviewed", 0) == n and reviewed == total
        recall = quality["factRecall"]["rate"]
        failed = (
            quality["criticalGate"] == "FAIL"
            or audit.get("unsupported", 0)
            or audit.get("sourceAuditFailures", 0)
            or audit.get("appliedUnsupportedCritical", 0)
            or (recall is not None and recall < 0.95)
            or (precision is not None and precision < 0.95)
        )
        gate = (
            "N/A"
            if not n
            else "BLOCKED"
            if provider == "mock"
            else "FAIL"
            if failed
            else "BLOCKED"
            if not complete or precision is None or recall is None
            else "PASS"
        )
        result[fmt] = {
            "sources": n,
            "manualPrecision": precision,
            "factRecall": recall,
            "humanAuditComplete": complete,
            "result": gate,
        }
    return result


def render(result):
    lines = [
        f"# DEV-170 · {result['label']}",
        "",
        "Precision is a sentence support proxy; recall is final-text mustContain fact recall.",
        "",
        final_score.markdown(result["quality"]),
        "| Format | N | E2E p50 ms | E2E p95 ms | Settled USD | Mean settled USD | "
        "Reserved USD | Unsettled reserved USD | Cost known |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    config = result["config"]
    lines[2:2] = [
        "Config: "
        + json.dumps(
            {
                k: config[k]
                for k in (
                    "split",
                    "subset",
                    "provider",
                    "model",
                    "stage1PromptVersion",
                    "stage2PromptVersion",
                    "preprocessVersion",
                    "ocrModel",
                    "ocrManifestSha256",
                    "maxUsd",
                )
                if k in config
            },
            ensure_ascii=False,
        ),
        "",
    ]
    for fmt, row in result["performanceByFormat"].items():
        lines.append(
            f"| {fmt} | {row['sources']} | {row['endToEndMs']['p50']} | "
            f"{row['endToEndMs']['p95']} | {row['totalCostUsd']} | "
            f"{row['meanCostUsd']} | {row['totalReservedUsd']} | "
            f"{row['totalUnsettledReservedUsd']} | {row['costsKnown']} |"
        )
    lines += [
        "",
        "| Format | Critical sentences | Reviewed sentences | Supported | Unsupported | "
        "Sources audited |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for fmt, a in result["auditByFormat"].items():
        lines.append(
            f"| {fmt} | {a.get('criticalSentences', 0)} | {a.get('reviewed', 0)} | "
            f"{a.get('supported', 0)} | {a.get('unsupported', 0)} | {a.get('sourcesReviewed', 0)} |"
        )
    lines += [
        "",
        "| Format | Human precision | Fact recall | Human audit complete | Target result |",
        "|---|---:|---:|---|---|",
    ]
    for fmt, target in result["targetsByFormat"].items():
        lines.append(
            f"| {fmt} | {target['manualPrecision']} | {target['factRecall']} | "
            f"{target['humanAuditComplete']} | {target['result']} |"
        )
    lines += [
        "",
        "Targets: P/R ≥95% per format; applied unsupported critical facts 0; "
        "accepted evidence 100%;",
        "absent/conflicting critical facts blank or flagged. Result: " + result["acceptance"],
        "",
        "Limitations: mock empty responses cannot measure quality. "
        "Regex/token proxy is not semantic precision.",
        "Cultivar lexicon/date detection (numbers) can miss claims. "
        "Audit every output sentence and original page.",
        "No product is applied by this runner; "
        "applied-page safety requires source-audit.csv confirmation.",
        "Missing, rejected, failed and empty outputs remain in scorer denominators.",
        "costUsd/settledUsd contain only provider-settled cost. Reserved USD is the gross "
        "reservation total; unsettled reservations still consume the budget ceiling.",
        "In-process parser uses the product parse function; excludes queue/DB/storage overhead.",
        "",
        (
            "Live results: PENDING."
            if config["provider"] == "mock"
            else "Live results: recorded; audit gate " + result["acceptance"]
        ),
        "Run development first, freeze decisions, then locked holdout once.",
        "Keep every miss; do not tune on holdout. Use audit.csv and source-audit.csv locally.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=["development", "holdout"], default="development")
    parser.add_argument("--subset", choices=["all", "synthetic", "public"], default="all")
    parser.add_argument("--provider", choices=["mock", "openrouter", "openai"], default="mock")
    parser.add_argument("--model")
    parser.add_argument("--max-usd", type=float, default=3.0)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--dev-dir", type=Path, default=ROOT.parent / "source-dev-i3-private")
    parser.add_argument(
        "--holdout-dir", type=Path, default=ROOT.parent / "source-holdout-i3-private"
    )
    parser.add_argument("--font", type=str, default=str(FONT) if FONT.exists() else None)
    parser.add_argument("--inputs-from", type=Path, nargs="+", default=[])
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--estimate-only", action="store_true")
    parser.add_argument("--i-understand-holdout-runs-once", action="store_true")
    parser.add_argument("--force-rerun", action="store_true")
    parser.add_argument("--rerun-reason")
    parser.add_argument(
        "--rescore", action="store_true", help="Offline only; no model calls or new holdout attempt"
    )
    parser.add_argument("--audit-csv", type=Path)
    parser.add_argument("--source-audit-csv", type=Path)
    args = parser.parse_args(argv)
    try:
        out = private_path(args.out)
        dev_dir, holdout_dir = args.dev_dir.resolve(), args.holdout_dir.resolve()
        if args.rescore:
            metadata = read_json(out / "metadata.json")
            if args.audit_csv:
                import_audit(out, args.audit_csv)
            report(out, [Path(p) for p in metadata["goldFiles"]], args.source_audit_csv)
            print(json.dumps({"rescored": len(metadata["sources"])}))
            return 0
        if args.audit_csv or args.source_audit_csv:
            raise ValueError("Audit import requires --rescore")
        if args.split == "holdout" and args.provider == "mock":
            raise ValueError("Holdout requires a non-mock provider")
        if args.force_rerun and (not args.rerun_reason or not args.rerun_reason.strip()):
            raise ValueError("--force-rerun requires --rerun-reason")
        if args.rerun_reason and not args.force_rerun:
            raise ValueError("--rerun-reason requires --force-rerun")
        model = args.model or (
            "gpt-6.1-sol" if args.provider == "openai" else "google/gemini-3-flash-preview"
        )
        if args.provider == "openai" and model != "gpt-6.1-sol":
            raise ValueError("OpenAI model must match existing budget price caps")
        calls = Calls(args.provider, args.max_usd)
        rows = dataset(args.split, args.subset, dev_dir, holdout_dir, args.font)
        rows = frozen_inputs(rows, args.inputs_from)
        planned = estimate(rows, args.provider if args.provider != "mock" else "openrouter", model)
        print(
            json.dumps(
                {
                    "estimate": planned,
                    "maxUsd": args.max_usd,
                    "note": "Planning assumption; per-call reservations enforce limit",
                }
            ),
            flush=True,
        )
        if args.estimate_only:
            return 0
        if args.split == "holdout" and not args.i_understand_holdout_runs_once:
            raise ValueError("Holdout requires --i-understand-holdout-runs-once")
        if args.provider != "mock" and not args.yes:
            raise ValueError("Non-mock calls require --yes; estimate printed above")
        cfg = get_settings()
        url = make_url(cfg.database_url)
        if args.provider != "mock" and (
            cfg.app_env != "local" or url.host not in ("127.0.0.1", "localhost")
        ):
            raise ValueError("Paid evaluation requires a scratch local database")
        references, gold_files = load_gold(args.split, args.subset, dev_dir, holdout_dir, rows)
        # Preflight OCR before spending or consuming the holdout attempt. No network provisioning.
        if any(r["mime"] != "text/plain" for r in rows):
            from app.source_analysis.preprocess import _ocr_engine

            _ocr_engine()
        out.mkdir(parents=True, mode=0o700, exist_ok=False)
        out.chmod(0o700)
        holdout_attempt = None
        if args.split == "holdout":
            marker = claim_holdout(
                holdout_dir / "final-gold-v1.1.json",
                args.i_understand_holdout_runs_once,
                args.force_rerun,
                args.rerun_reason,
            )
            holdout_attempt = read_json(marker)
        results = []
        aborted = None
        completed = False
        try:
            save_inputs(out, rows)
            cfg.source_evaluation = True
            cfg.source_evaluation_budget_usd = min(args.max_usd, cfg.source_budget_usd)
            for row in rows:
                if aborted:
                    metric = {k: row[k] for k in ("id", "format", "inputSha256")}
                    metric.update(
                        status="NOT_RUN",
                        errorCode="RUN_ABORTED_" + aborted,
                        stage1Ms=None,
                        stage2Ms=None,
                        preprocessMs=None,
                        endToEndMs=None,
                        costUsd=0,
                        settledUsd=0,
                        reservedUsd=0,
                        unsettledReservedUsd=0,
                        costKnown=True,
                        calls=0,
                    )
                    results.append(
                        (
                            {
                                "id": row["id"],
                                "format": row["format"],
                                "status": "NOT_RUN",
                                "modules": [],
                            },
                            metric,
                            "",
                            {},
                        )
                    )
                else:
                    result = evaluate_source(row, args.provider, model, calls)
                    results.append(result)
                    if result[1].get("errorCode") in {"BUDGET_EXCEEDED", "PROVIDER_AUTH"}:
                        aborted = result[1]["errorCode"]
            completed = True
        finally:
            if not completed:
                aborted = "RUN_FAILED"
            metadata = {
                "holdoutAttempt": holdout_attempt["attempt"] if holdout_attempt else None,
                "rerunReason": holdout_attempt["rerunReason"] if holdout_attempt else None,
                "split": args.split,
                "subset": args.subset,
                "provider": args.provider,
                "model": model,
                "mockPolicy": "fixture-or-empty-v1" if args.provider == "mock" else None,
                "stage1PromptVersion": extraction_ai.PROMPT_VERSION,
                "stage1PromptSha256": final_score.sha256(extraction_ai.PROMPT.encode()),
                "stage2PromptVersion": refine_ai.PROMPT_VERSION,
                "stage2PromptSha256": final_score.sha256(refine_ai.PROMPT.encode()),
                "safetyListsSha256": SAFETY_LISTS_HASH,
                "preprocessVersion": PREPROCESS_VERSION,
                "ocrModel": OCR_MODEL if args.provider == "openrouter" else "rapidocr-3.10.0",
                "ocrPromptSha256": final_score.sha256(OCR_PROMPT.encode()),
                "ocrManifestSha256": cfg.source_ocr_model_sha256,
                "maxUsd": args.max_usd,
                "estimate": planned,
                "goldFiles": list(map(str, gold_files)),
                "sources": [r[1] for r in results],
                **costs(calls.entries),
                "abortCode": aborted,
            }
            write_json(out / "metadata.json", metadata)
            write_envelope(out, rows[: len(results)], results, references)
        worksheets(out)
        report(out, gold_files)
        print(
            json.dumps(
                {
                    "sources": len(rows),
                    "statuses": dict(Counter(r[0]["status"] for r in results)),
                    "calls": len(calls.entries),
                    **costs(calls.entries),
                }
            )
        )
        return 1 if aborted else 0
    except Exception:
        print("Evaluation refused or failed (details redacted); inspect configuration locally")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
