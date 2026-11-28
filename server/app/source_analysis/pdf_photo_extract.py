"""Bounded offline diagnostic crops. No raw embedded image bytes are exported.

This is deliberately independent of the application, database and AI adapters.
Every exported crop still requires privacy, relevance and publication review.
"""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import io
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

import psutil
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

VERSION = "pdf-photo-v2"
DEFAULT_LIMITS = {
    "pageCap": 20,
    "objectCap": 10_000,
    "imageObjectCap": 200,
    "recursionDepth": 4,
    "candidateCap": 30,
    "maxInputBytes": 100 * 1024**2,
    "maxImagePixels": 40_000_000,
    "maxPagePixels": 8_000_000,
    "maxOutputBytes": 64 * 1024**2,
    "maxElapsedSeconds": 30,
    "maxRssMiB": 512,
    "renderScale": 2,
}


def _limits(values):
    result = DEFAULT_LIMITS.copy()
    if values is not None:
        if not isinstance(values, dict) or values.keys() - result.keys():
            raise ValueError("INVALID_LIMITS")
        for key, value in values.items():
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value <= 0
                or value > result[key]
                or (key not in {"maxElapsedSeconds", "renderScale"} and int(value) != value)
            ):
                raise ValueError("INVALID_LIMITS")
            result[key] = value if key in {"maxElapsedSeconds", "renderScale"} else int(value)
    return result


def _redactions(value):
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError("INVALID_REDACTIONS")
    result = {}
    for page, boxes in value.items():
        if (
            isinstance(page, bool)
            or not isinstance(page, int)
            or page < 1
            or not isinstance(boxes, list)
        ):
            raise ValueError("INVALID_REDACTIONS")
        result[page] = []
        for box in boxes:
            if (
                not isinstance(box, (list, tuple))
                or len(box) != 4
                or any(
                    isinstance(v, bool)
                    or not isinstance(v, (int, float))
                    or not math.isfinite(v)
                    or not 0 <= v <= 1
                    for v in box
                )
                or box[0] >= box[2]
                or box[1] >= box[3]
            ):
                raise ValueError("INVALID_REDACTIONS")
            result[page].append(box)
    return result


def _manifest(data, source_id, revision, sanitization, limits):
    return {
        "schemaVersion": 1,
        "extractorVersion": VERSION,
        "source": {
            "id": source_id,
            "sha256": hashlib.sha256(data).hexdigest(),
            "revision": revision,
            "sanitizationVersion": sanitization,
        },
        "status": "SUCCEEDED",
        "pageCount": 0,
        "processedPages": [],
        "skippedPages": [],
        "limits": limits,
        "occurrences": [],
        "warnings": ["DIAGNOSTIC_ONLY", "PRIVACY_REVIEW_REQUIRED"],
        "errors": [],
        "metrics": {
            "objectsVisited": 0,
            "imageObjectsVisited": 0,
            "decodedImages": 0,
            "candidateCount": 0,
            "elapsedMs": 0,
            "outputBytes": 0,
        },
    }


def _write(manifest, output):
    temporary = output / ".manifest.tmp"
    temporary.write_text(json.dumps(manifest, indent=2) + "\n")
    temporary.replace(output / "manifest.json")


def _bounds(page, obj, width, height):
    bounds = obj.get_bounds()
    if not all(math.isfinite(v) for v in bounds):
        raise ValueError("UNKNOWN_GEOMETRY")
    points = []
    for x in (bounds[0], bounds[2]):
        for y in (bounds[1], bounds[3]):
            dx, dy = ctypes.c_int(), ctypes.c_int()
            if not pdfium.raw.FPDF_PageToDevice(page, 0, 0, width, height, 0, x, y, dx, dy):
                raise ValueError("UNKNOWN_GEOMETRY")
            points.append((dx.value, dy.value))
    left = max(0, min(x for x, _ in points))
    top = max(0, min(y for _, y in points))
    right = min(width, max(x for x, _ in points))
    bottom = min(height, max(y for _, y in points))
    if right <= left or bottom <= top:
        raise ValueError("OUTSIDE_PAGE")
    return [left / width, top / height, right / width, bottom / height]


def extract_pdf(
    data: bytes,
    output_dir: Path,
    *,
    source_id="source",
    source_revision=1,
    sanitization_version=1,
    redactions=None,
    limits=None,
) -> dict:
    """Export visible page crops to an exclusive empty directory; return private manifest.

    Direct callers get cooperative time limits. Use the CLI for hard wall/RSS limits.
    Forms are recorded as unsupported because their nested image transforms/clips
    are not safely attributable by this prototype. The rendered crop includes all
    visible overlays, not just its image object.
    """
    caps = _limits(limits)
    masks = _redactions(redactions)
    if not isinstance(data, bytes):
        raise ValueError("INVALID_INPUT")
    if not isinstance(source_id, str) or not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", source_id
    ):
        raise ValueError("INVALID_SOURCE_ID")
    for version in (source_revision, sanitization_version):
        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise ValueError("INVALID_VERSION")
    output = Path(output_dir)
    if output.is_symlink() or (output.exists() and (not output.is_dir() or any(output.iterdir()))):
        raise ValueError("OUTPUT_NOT_EMPTY")
    output.mkdir(parents=True, exist_ok=True)
    # Acquire a filesystem claim after the empty-directory check, closing the
    # simultaneous-call race without overwriting an existing extraction.
    claim = output / ".extract.lock"
    try:
        claim.touch(exist_ok=False)
    except FileExistsError as exc:
        raise ValueError("OUTPUT_NOT_EMPTY") from exc
    started = time.monotonic()
    manifest = _manifest(data, source_id, source_revision, sanitization_version, caps)
    metrics = manifest["metrics"]
    duplicates = {}

    def checkpoint():
        metrics["elapsedMs"] = round((time.monotonic() - started) * 1000)
        _write(manifest, output)

    def warn(code):
        if code not in manifest["warnings"]:
            manifest["warnings"].append(code)
        manifest["status"] = "PARTIAL"

    def exhausted_budget():
        if metrics["objectsVisited"] >= caps["objectCap"]:
            return "OBJECT_LIMIT"
        if metrics["imageObjectsVisited"] >= caps["imageObjectCap"]:
            return "IMAGE_OBJECT_LIMIT"
        if time.monotonic() - started >= caps["maxElapsedSeconds"]:
            return "TIME_LIMIT"
        return None

    checkpoint()
    document = None
    try:
        if len(data) > caps["maxInputBytes"]:
            raise ValueError("INPUT_BYTES_LIMIT")
        document = pdfium.PdfDocument(data)
        manifest["pageCount"] = len(document)
        if any(page > len(document) for page in masks):
            raise ValueError("INVALID_REDACTION_PAGE")
        for page_index in range(len(document)):
            number = page_index + 1
            if page_index >= caps["pageCap"]:
                warn("PAGE_LIMIT")
                manifest["skippedPages"].append(number)
                continue
            budget = exhausted_budget()
            if budget:
                warn(budget)
                manifest["skippedPages"].append(number)
                continue
            page = document[page_index]
            rendered = None
            try:
                pw, ph = page.get_size()
                if not all(math.isfinite(v) and v > 0 for v in (pw, ph)):
                    raise ValueError("INVALID_PAGE_GEOMETRY")
                scale = min(caps["renderScale"], math.sqrt(caps["maxPagePixels"] / (pw * ph)))
                rw, rh = math.ceil(pw * scale), math.ceil(ph * scale)
                while rw * rh > caps["maxPagePixels"]:
                    scale *= 0.999
                    rw, rh = math.ceil(pw * scale), math.ceil(ph * scale)
                for object_index, obj in enumerate(page.get_objects(max_depth=1)):
                    budget = exhausted_budget()
                    if budget:
                        warn(budget)
                        break
                    metrics["objectsVisited"] += 1
                    if obj.type not in (
                        pdfium.raw.FPDF_PAGEOBJ_IMAGE,
                        pdfium.raw.FPDF_PAGEOBJ_FORM,
                    ):
                        continue
                    metrics["imageObjectsVisited"] += 1
                    bounds = None
                    try:
                        bounds = _bounds(page, obj, rw, rh)
                    except Exception:
                        pass
                    identity = [
                        manifest["source"]["sha256"],
                        source_revision,
                        sanitization_version,
                        number,
                        str(object_index),
                        bounds,
                        VERSION,
                    ]
                    occurrence = {
                        "id": hashlib.sha256(
                            json.dumps(identity, sort_keys=True).encode()
                        ).hexdigest(),
                        "page": number,
                        "bounds": bounds,
                        "nativeWidth": 0,
                        "nativeHeight": 0,
                        "width": 0,
                        "height": 0,
                        "status": "UNSUPPORTED",
                        "reasonCodes": [],
                        "imagePath": None,
                        "pixelSha256": None,
                        "duplicateOf": None,
                        "sourceObjectType": "native_image"
                        if obj.type == pdfium.raw.FPDF_PAGEOBJ_IMAGE
                        else "composite",
                    }
                    manifest["occurrences"].append(occurrence)
                    try:
                        if obj.type == pdfium.raw.FPDF_PAGEOBJ_FORM:
                            occurrence["reasonCodes"] = ["FORM_GEOMETRY"]
                            continue
                        nw, nh = obj.get_px_size()
                        occurrence.update(nativeWidth=nw, nativeHeight=nh)
                        if not bounds:
                            occurrence["reasonCodes"] = ["UNKNOWN_GEOMETRY"]
                        elif nw * nh > caps["maxImagePixels"]:
                            occurrence["reasonCodes"] = ["IMAGE_PIXELS_LIMIT"]
                            warn("IMAGE_PIXELS_LIMIT")
                        elif min(nw, nh) < 64:
                            occurrence.update(status="FILTERED", reasonCodes=["TINY"])
                        elif (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) >= 0.85:
                            occurrence["reasonCodes"] = ["COMPOSITE_PAGE"]
                        elif metrics["candidateCount"] >= caps["candidateCap"]:
                            occurrence["reasonCodes"] = ["CANDIDATE_LIMIT"]
                            warn("CANDIDATE_LIMIT")
                        elif time.monotonic() - started >= caps["maxElapsedSeconds"]:
                            occurrence["reasonCodes"] = ["TIME_LIMIT"]
                            warn("TIME_LIMIT")
                        else:
                            metrics["candidateCount"] += 1
                            if rendered is None:
                                bitmap = page.render(scale=scale, draw_annots=True)
                                try:
                                    rendered = bitmap.to_pil().convert("RGB")
                                finally:
                                    bitmap.close()
                                draw = ImageDraw.Draw(rendered)
                                for box in masks.get(number, []):
                                    draw.rectangle(
                                        (
                                            math.floor(box[0] * rw),
                                            math.floor(box[1] * rh),
                                            math.ceil(box[2] * rw),
                                            math.ceil(box[3] * rh),
                                        ),
                                        fill="black",
                                    )
                            box = (
                                round(bounds[0] * rw),
                                round(bounds[1] * rh),
                                round(bounds[2] * rw),
                                round(bounds[3] * rh),
                            )
                            crop = rendered.crop(box)
                            # Cap both oriented edge lengths and total native pixels.
                            factor = min(
                                1,
                                min(nw, nh) / min(crop.size),
                                max(nw, nh) / max(crop.size),
                                math.sqrt(nw * nh / (crop.width * crop.height)),
                            )
                            if factor < 1:
                                crop = crop.resize(
                                    (
                                        max(1, math.floor(crop.width * factor)),
                                        max(1, math.floor(crop.height * factor)),
                                    ),
                                    Image.Resampling.LANCZOS,
                                )
                            buffer = io.BytesIO()
                            crop.save(buffer, format="PNG")
                            payload = buffer.getvalue()
                            metrics["decodedImages"] += 1
                            digest = hashlib.sha256(payload).hexdigest()
                            prior = duplicates.get(digest)
                            if (
                                prior is None
                                and metrics["outputBytes"] + len(payload) > caps["maxOutputBytes"]
                            ):
                                occurrence["reasonCodes"] = ["OUTPUT_BYTES_LIMIT"]
                                warn("OUTPUT_BYTES_LIMIT")
                                continue
                            path = prior[1] if prior else f"photo-{digest}.png"
                            if prior is None:
                                with (output / path).open("xb") as stream:
                                    stream.write(payload)
                                metrics["outputBytes"] += len(payload)
                                duplicates[digest] = (occurrence["id"], path)
                            occurrence.update(
                                status="REVIEW_REQUIRED",
                                reasonCodes=["PRIVACY_REVIEW_REQUIRED"],
                                width=crop.width,
                                height=crop.height,
                                imagePath=path,
                                pixelSha256=digest,
                                duplicateOf=prior[0] if prior else None,
                            )
                    except Exception:
                        occurrence.update(status="ERROR", reasonCodes=["CANDIDATE_FAILED"])
                        warn("CANDIDATE_FAILED")
                    finally:
                        checkpoint()
                # Reaching a declared cap is itself partial, even if the final
                # inspected object happens to be the last one in this page.
                if metrics["objectsVisited"] >= caps["objectCap"]:
                    warn("OBJECT_LIMIT")
                if metrics["imageObjectsVisited"] >= caps["imageObjectCap"]:
                    warn("IMAGE_OBJECT_LIMIT")
                manifest["processedPages"].append(number)
            except Exception:
                manifest["skippedPages"].append(number)
                warn("PAGE_FAILED")
            finally:
                if rendered is not None:
                    rendered.close()
                page.close()
                checkpoint()
    except Exception as exc:
        manifest["status"] = "FAILED"
        manifest["errors"].append(str(exc) if isinstance(exc, ValueError) else "INVALID_PDF")
        manifest["skippedPages"] = [
            p for p in range(1, manifest["pageCount"] + 1) if p not in manifest["processedPages"]
        ]
    finally:
        if document is not None:
            document.close()
        checkpoint()
        claim.unlink()
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-id", default="source")
    parser.add_argument("--limits", type=json.loads, default={})
    parser.add_argument("--redactions", type=Path)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    caps = _limits(args.limits)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", args.source_id):
        parser.error("INVALID_SOURCE_ID")
    if not args.input.is_file():
        parser.error("INPUT_NOT_REGULAR_FILE")
    if args.output.is_symlink() or (
        args.output.exists() and (not args.output.is_dir() or any(args.output.iterdir()))
    ):
        parser.error("OUTPUT_NOT_EMPTY")
    if args.worker:
        if args.input.stat().st_size > caps["maxInputBytes"]:
            manifest = _manifest(b"", args.source_id, 1, 1, caps)
            manifest.update(status="FAILED", errors=["INPUT_BYTES_LIMIT"])
            manifest["source"]["sha256"] = None
            args.output.mkdir(parents=True, exist_ok=True)
            _write(manifest, args.output)
        else:
            with args.input.open("rb") as source:
                data = source.read(caps["maxInputBytes"] + 1)
            redactions = None
            if args.redactions:
                try:

                    def unique_object(pairs):
                        value = {}
                        for key, item in pairs:
                            if key in value:
                                raise ValueError("INVALID_REDACTIONS")
                            value[key] = item
                        return value

                    raw_masks = json.loads(
                        args.redactions.read_text(), object_pairs_hook=unique_object
                    )
                    if not isinstance(raw_masks, dict) or any(
                        not re.fullmatch(r"[1-9][0-9]*", key) for key in raw_masks
                    ):
                        raise ValueError("INVALID_REDACTIONS")
                    redactions = _redactions({int(k): v for k, v in raw_masks.items()})
                except (OSError, ValueError, TypeError):
                    manifest = _manifest(data, args.source_id, 1, 1, caps)
                    manifest.update(status="FAILED", errors=["INVALID_REDACTIONS"])
                    args.output.mkdir(parents=True, exist_ok=True)
                    _write(manifest, args.output)
                    return 0
            extract_pdf(
                data, args.output, source_id=args.source_id, redactions=redactions, limits=caps
            )
        return 0
    # Reserve at the parent level as well: a losing CLI must never inspect or
    # rewrite the winning worker's output. Keep the claim beside the empty output
    # so the worker can use the public extraction API without bypassing its check.
    claim = args.output.with_name(f".{args.output.name}.pdf-photo-cli.lock")
    claim.parent.mkdir(parents=True, exist_ok=True)
    try:
        claim.touch(exist_ok=False)
    except FileExistsError:
        parser.error("OUTPUT_IN_USE")
    try:
        # A different owner may have completed after our initial empty check but
        # before this claim was acquired. Never read or rewrite that owner's output.
        if args.output.is_symlink() or (
            args.output.exists() and (not args.output.is_dir() or any(args.output.iterdir()))
        ):
            parser.error("OUTPUT_NOT_EMPTY")
        return _run_cli_worker(args, caps, argv)
    finally:
        claim.unlink()


def _run_cli_worker(args, caps, argv):
    command = [
        sys.executable,
        "-m",
        "app.source_analysis.pdf_photo_extract",
        *sys.argv[1:],
        "--worker",
    ]
    if argv is not None:
        command = [sys.executable, "-m", "app.source_analysis.pdf_photo_extract", *argv, "--worker"]
    # Hash accepted input before the worker starts, preserving identity even when
    # the monitor kills a worker during PDFium startup. Never read oversized input.
    source_digest = None
    if args.input.stat().st_size <= caps["maxInputBytes"]:
        digest = hashlib.sha256()
        with args.input.open("rb") as source:
            remaining = caps["maxInputBytes"] + 1
            while remaining:
                chunk = source.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                digest.update(chunk)
                remaining -= len(chunk)
        if remaining:
            source_digest = digest.hexdigest()
    started = time.monotonic()
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    reason = None
    try:
        monitor = psutil.Process(process.pid)
    except (psutil.Error, OSError):
        reason = "MONITOR_FAILED"
        try:
            process.kill()
        except ProcessLookupError:
            pass
    while reason is None and process.poll() is None:
        try:
            rss = monitor.memory_info().rss + sum(
                p.memory_info().rss for p in monitor.children(recursive=True)
            )
            if rss > caps["maxRssMiB"] * 1024**2:
                reason = "RSS_LIMIT"
            elif time.monotonic() - started > caps["maxElapsedSeconds"]:
                reason = "TIME_LIMIT"
            if reason:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                break
        except psutil.NoSuchProcess:
            # A descendant can exit during the RSS sum; keep monitoring the worker.
            continue
        except (psutil.Error, OSError):
            reason = "MONITOR_FAILED"
            try:
                process.kill()
            except ProcessLookupError:
                pass
            break
        time.sleep(0.02)
    process.wait()
    manifest_path = args.output / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        manifest = _manifest(b"", args.source_id, 1, 1, caps)
        manifest["source"]["sha256"] = source_digest
    # Never relabel completed worker output with a hash from a different read.
    # The file may have changed between parent preflight and the worker snapshot.
    if (
        source_digest is not None
        and manifest["source"]["sha256"] is not None
        and manifest["source"]["sha256"] != source_digest
    ):
        manifest["status"] = "FAILED"
        manifest["errors"].append("SOURCE_CHANGED")
    if reason or process.returncode:
        manifest["status"] = "FAILED"
        manifest["errors"].append(reason or "WORKER_FAILED")
        manifest["skippedPages"] = [
            p for p in range(1, manifest["pageCount"] + 1) if p not in manifest["processedPages"]
        ]
        _write(manifest, args.output)
    manifest["metrics"]["elapsedMs"] = round((time.monotonic() - started) * 1000)
    _write(manifest, args.output)
    print(
        json.dumps(
            {
                "status": manifest["status"],
                "occurrences": len(manifest["occurrences"]),
                "candidates": manifest["metrics"]["candidateCount"],
            }
        )
    )
    return 1 if manifest["status"] == "FAILED" else 0


if __name__ == "__main__":
    raise SystemExit(main())
