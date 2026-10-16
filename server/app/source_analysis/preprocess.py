"""Bounded local parsing; subprocess output is private and never logged."""

import base64
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from functools import lru_cache
from pathlib import Path

import psutil
from PIL import Image, ImageDraw, ImageOps

from app.core.config import get_settings

Image.MAX_IMAGE_PIXELS = 40_000_000


class PreparationError(Exception):
    pass


PII = re.compile(
    r"(?:\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b|"
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|"
    r"\b\d{2,6}[- ]\d{2,6}[- ]\d{3,8}\b|"
    r"\b\d{10,}\b|"
    r"(?:성명|성함|담당자|대표자?|예금주|수취인|연락처|주소|계좌)\s*[:：]?[^\n]+|"
    r"[가-힣]+(?:로|길)\s*\d+[^\n]*|"
    r"[가-힣]+(?:읍|면|동|리)\s*\d+[^\n]*)"
)


def scrub(text):
    return PII.sub("[가림]", text)


def identify(data, filename):
    suffix = Path(filename).suffix.lower()
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if (
        len(data) > 12
        and data[4:8] == b"ftyp"
        and data[8:12] in (b"heic", b"heix", b"hevc", b"hevx", b"mif1")
    ):
        return "image/heic"
    if suffix == ".txt":
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise PreparationError("INVALID_UTF8") from exc
        if "\x00" in text or not text.strip():
            raise PreparationError("INVALID_TEXT")
        return "text/plain"
    raise PreparationError("UNSUPPORTED_FILE")


def _png(image):
    out = io.BytesIO()
    image.convert("RGB").save(out, "PNG")
    return out.getvalue()


def redact(image_data, spans, regions=(), ids=()):
    removed = set(ids)
    boxes = list(regions)
    safe = []
    for span in spans:
        box = span["box"]
        overlap = any(
            box[0] < r[2] and box[2] > r[0] and box[1] < r[3] and box[3] > r[1] for r in regions
        )
        text = scrub(span["text"])
        if span["id"] in removed or overlap:
            text = "[가림]"
        if text != span["text"]:
            boxes.append(box)
        safe.append({**span, "text": text})
    if not image_data:
        return None, safe
    with Image.open(io.BytesIO(image_data)) as raw:
        image = raw.convert("RGB")
        draw = ImageDraw.Draw(image)
        for x1, y1, x2, y2 in boxes:
            draw.rectangle(
                (
                    int(x1 * image.width),
                    int(y1 * image.height),
                    int(x2 * image.width + 1),
                    int(y2 * image.height + 1),
                ),
                fill="black",
            )
        return _png(image), safe


@lru_cache(maxsize=1)
def _ocr_engine():
    settings = get_settings()
    directory = Path(settings.source_ocr_model_dir)
    # Models must be provisioned offline with a manifest; no automatic download.
    if not settings.source_ocr_model_dir or not (directory / "manifest.json").exists():
        raise PreparationError("OCR_NOT_CONFIGURED")
    manifest_bytes = (directory / "manifest.json").read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest() != settings.source_ocr_model_sha256:
        raise PreparationError("OCR_MODEL_MISMATCH")
    manifest = json.loads(manifest_bytes)
    required = {
        f"{kind}/inference.{ext}" for kind in ("det", "rec") for ext in ("pdmodel", "pdiparams")
    }
    if not required.issubset(manifest["files"]):
        raise PreparationError("OCR_MODEL_MISMATCH")
    for name, digest in manifest["files"].items():
        path = (directory / name).resolve()
        if (
            directory.resolve() not in path.parents
            or hashlib.sha256(path.read_bytes()).hexdigest() != digest
        ):
            raise PreparationError("OCR_MODEL_MISMATCH")
    from paddleocr import PaddleOCR

    engine = PaddleOCR(
        lang="korean",
        use_gpu=False,
        show_log=False,
        use_angle_cls=False,
        det_model_dir=str(directory / "det"),
        rec_model_dir=str(directory / "rec"),
        cls_model_dir=str(directory / "det"),
        enable_mkldnn=False,
    )
    return engine


def _ocr(image):
    import numpy as np

    result = _ocr_engine().ocr(np.asarray(image), cls=False)
    spans = []
    for index, line in enumerate((result or [[]])[0] or []):
        points, (text, score) = line
        if score < 0.60:
            raise PreparationError("OCR_UNCERTAIN")
        xs, ys = zip(*points, strict=True)
        spans.append(
            {
                "id": f"s{index}",
                "text": text,
                "box": [
                    max(0, min(xs) / image.width),
                    max(0, min(ys) / image.height),
                    min(1, max(xs) / image.width),
                    min(1, max(ys) / image.height),
                ],
            }
        )
    return spans


def qr_regions(image):
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise PreparationError("IMAGE_PRIVACY_NOT_CONFIGURED") from exc
    found, points = cv2.QRCodeDetector().detectMulti(np.asarray(image))
    if not found:
        return []
    return [
        [
            max(0, float(p[:, 0].min()) / image.width),
            max(0, float(p[:, 1].min()) / image.height),
            min(1, float(p[:, 0].max()) / image.width),
            min(1, float(p[:, 1].max()) / image.height),
        ]
        for p in points
    ]


def parse(data, mime):
    if mime == "text/plain":
        text = data.decode("utf-8-sig")
        if len(text) > 30_000:
            raise PreparationError("TEXT_LIMIT")
        # Split long lines so individual evidence is bounded.
        lines = [
            line[i : i + 1500]
            for line in text.splitlines()
            for i in range(0, len(line), 1500)
            if line[i : i + 1500].strip()
        ]
        spans = [{"id": f"s{i}", "text": line, "box": [0, 0, 1, 1]} for i, line in enumerate(lines)]
        return [{"spans": spans, "image": None}]
    images = []
    if mime == "application/pdf":
        import pypdfium2 as pdfium

        try:
            with pdfium.PdfDocument(data) as pdf:
                if not 1 <= len(pdf) <= 20:
                    raise PreparationError("PDF_PAGE_LIMIT")
                for index in range(len(pdf)):
                    page = pdf[index]
                    width, height = page.get_size()
                    scale = min(200 / 72, (8_000_000 / (width * height)) ** 0.5)
                    image = page.render(scale=scale).to_pil().convert("RGB")
                    textpage = page.get_textpage()
                    text = textpage.get_text_range()
                    # PDF text boxes are conservative: privacy candidates mask the page.
                    lines = [
                        line[start : start + 1500]
                        for line in text.splitlines()
                        for start in range(0, len(line), 1500)
                        if line[start : start + 1500].strip()
                    ]
                    spans = [
                        {"id": f"s{i}", "text": line, "box": [0, 0, 1, 1]}
                        for i, line in enumerate(lines)
                    ]
                    images.append((image, spans or None))
        except PreparationError:
            raise
        except Exception as exc:
            raise PreparationError("INVALID_OR_ENCRYPTED_PDF") from exc
    else:
        from pillow_heif import register_heif_opener

        register_heif_opener()
        try:
            with Image.open(io.BytesIO(data)) as raw:
                if raw.width * raw.height > 40_000_000 or getattr(raw, "n_frames", 1) != 1:
                    raise PreparationError("IMAGE_LIMIT")
                raw.load()
                image = ImageOps.exif_transpose(raw).convert("RGB")
                image.thumbnail((2800, 2800))
                images.append((image, None))
        except PreparationError:
            raise
        except Exception as exc:
            raise PreparationError("INVALID_IMAGE") from exc
    output = []
    for image, spans in images:
        ocr_spans = _ocr(image)
        if spans is not None:
            spans = [{**s, "id": "pdf-" + s["id"]} for s in spans] + ocr_spans
        else:
            spans = ocr_spans
        # QR/barcode-bearing images require manual full-region redaction review.
        # Every image is reviewed in real mode; no confidence-only auto-approval.
        output.append(
            {
                "spans": spans,
                "image": base64.b64encode(_png(image)).decode(),
                "regions": qr_regions(image),
            }
        )
    return output


def prepare(data, mime):
    settings = get_settings()
    with tempfile.TemporaryDirectory(prefix="farmclub-source-") as temp:
        root = Path(temp)
        (root / "input").write_bytes(data)
        process = subprocess.Popen(
            [sys.executable, "-m", "app.source_analysis.preprocess", str(root), mime],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        started = time.monotonic()
        try:
            while process.poll() is None:
                if time.monotonic() - started > settings.source_parser_timeout:
                    raise PreparationError("PARSER_TIMEOUT")
                try:
                    parent = psutil.Process(process.pid)
                    total = sum(
                        p.memory_info().rss for p in [parent, *parent.children(recursive=True)]
                    )
                    if total > settings.source_parser_memory_mb * 1024 * 1024:
                        raise PreparationError("PARSER_MEMORY_LIMIT")
                except psutil.NoSuchProcess:
                    pass
                time.sleep(0.1)
            result = json.loads((root / "output").read_text(encoding="utf-8"))
            if "error" in result:
                raise PreparationError(result["error"])
            return result["pages"]
        finally:
            if process.poll() is None:
                try:
                    for child in psutil.Process(process.pid).children(recursive=True):
                        child.kill()
                except psutil.NoSuchProcess:
                    pass
                process.kill()
            process.wait()


if __name__ == "__main__":
    root = Path(sys.argv[1])
    try:
        result = {"pages": parse((root / "input").read_bytes(), sys.argv[2])}
    except PreparationError as exc:
        result = {"error": str(exc)}
    except Exception:
        result = {"error": "PARSER_FAILED"}
    (root / "output").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
