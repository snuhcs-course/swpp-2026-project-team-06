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
PREPROCESS_VERSION = "source-parser-v3"


class PreparationError(Exception):
    pass


PII = re.compile(
    r"(?:\b0(?:2|[3-6][1-5]|70|80|1[016789])[- .)]*\d{3,4}[- .]?\d{4}\b|"
    r"\b1[568]\d{2}[- .]\d{4}\b|"
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|"
    r"\b\d{2,6}[- ]\d{2,6}[- ]\d{3,8}\b|"
    r"\b\d{10,}\b|"
    r"(?:^|\n)[ \t]*(?:성명|성함|담당자|대표자|예금주|수취인|연락\s*처|주\s*소|계좌)"
    r"\s*[:：]?[^\n]+|"
    r"(?:^|\n)[ \t]*대표[ \t]*[:：][^\n]+|"
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
    try:
        manifest = json.loads(manifest_bytes)
        required = {"det.onnx", "rec.onnx", "keys.txt"}
        if manifest["engine"] != "rapidocr-3.10.0" or set(manifest["files"]) != required:
            raise PreparationError("OCR_MODEL_MISMATCH")
        for name, digest in manifest["files"].items():
            path = (directory / name).resolve()
            if (
                directory.resolve() not in path.parents
                or hashlib.sha256(path.read_bytes()).hexdigest() != digest
            ):
                raise PreparationError("OCR_MODEL_MISMATCH")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise PreparationError("OCR_MODEL_MISMATCH") from exc
    from rapidocr import ModelType, OCRVersion, RapidOCR

    return RapidOCR(
        params={
            "Global.use_cls": False,
            "Global.log_level": "error",
            "Global.max_side_len": 2800,
            "Det.model_path": str(directory / "det.onnx"),
            "Det.ocr_version": OCRVersion.PPOCRV5,
            "Det.model_type": ModelType.MOBILE,
            "Det.limit_type": "max",
            "Det.limit_side_len": 960,
            "Rec.model_path": str(directory / "rec.onnx"),
            "Rec.rec_keys_path": str(directory / "keys.txt"),
            "Rec.lang_type": "korean",
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.rec_batch_num": 1,
            "EngineConfig.onnxruntime.intra_op_num_threads": 2,
            "EngineConfig.onnxruntime.inter_op_num_threads": 1,
        }
    )


def _ocr(image):
    import numpy as np

    result = _ocr_engine()(np.asarray(image), use_det=True, use_rec=True, use_cls=False)
    if result.boxes is None or result.txts is None:
        return []
    spans = []
    for index, (points, text, score) in enumerate(
        zip(result.boxes, result.txts, result.scores, strict=True)
    ):
        xs, ys = zip(*points, strict=True)
        spans.append(
            {
                "id": f"s{index}",
                "text": text,
                "confidence": float(score),
                "box": [
                    max(0, float(min(xs)) / image.width),
                    max(0, float(min(ys)) / image.height),
                    min(1, float(max(xs)) / image.width),
                    min(1, float(max(ys)) / image.height),
                ],
            }
        )
    return spans


def _orientation_score(spans, width, height):
    return sum(
        len(s["text"].strip())
        * s["confidence"] ** 3
        * (
            1
            if (s["box"][2] - s["box"][0]) * width >= (s["box"][3] - s["box"][1]) * height
            else 0.1
        )
        for s in spans
        if s["confidence"] >= 0.6
    )


def _orientation_angles(image):
    import numpy as np

    engine = _ocr_engine()
    boxes = engine(np.asarray(image), use_rec=False, use_cls=False).boxes
    if boxes is None or not len(boxes):
        return (0,)
    # Restrict recognition to the two plausible orientations before scoring text.
    horizontal = sum(
        float(b[:, 0].max() - b[:, 0].min()) >= float(b[:, 1].max() - b[:, 1].min()) for b in boxes
    )
    return (0, 180) if horizontal >= len(boxes) / 2 else (90, 270)


def _upright(image):
    # Use a bounded orientation probe; recognition keeps the full reading resolution.
    probe = image.copy()
    probe.thumbnail((960, 960))
    choices = []
    for angle in _orientation_angles(probe):
        rotated = probe.rotate(angle, expand=True)
        choices.append((angle, _orientation_score(_ocr(rotated), *rotated.size)))
    angle = max(choices, key=lambda pair: pair[1])[0]
    return image.rotate(angle, expand=True), angle


def _intersection(a, b):
    area = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    smallest = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return area / smallest if smallest > 0 else 0


def _lines(spans, aspect=1):
    """Group baselines first, then split wide columns; detection order is unstable."""
    rows = []
    for span in sorted(spans, key=lambda s: (s["box"][1], s["box"][0])):
        box = span["box"]
        row = next(
            (
                r
                for r in rows
                if any(
                    min(box[3], s["box"][3]) - max(box[1], s["box"][1])
                    > 0.6 * min(box[3] - box[1], s["box"][3] - s["box"][1])
                    for s in r
                )
            ),
            None,
        )
        if row is None:
            rows.append([span])
        else:
            row.append(span)
    groups = []
    for row in rows:
        group = []
        for span in sorted(row, key=lambda s: s["box"][0]):
            if group:
                box, last = span["box"], group[-1]["box"]
                height = min(box[3] - box[1], last[3] - last[1])
                if box[0] - last[2] > height * aspect * 2:
                    groups.append(group)
                    group = []
            group.append(span)
        groups.append(group)
    return [
        {
            "id": f"s{i}",
            "text": " ".join(s["text"] for s in group),
            "confidence": min(s["confidence"] for s in group),
            "box": [
                min(s["box"][0] for s in group),
                min(s["box"][1] for s in group),
                max(s["box"][2] for s in group),
                max(s["box"][3] for s in group),
            ],
        }
        for i, group in enumerate(groups)
    ]


def _tiled_ocr(image):
    # Keep one page/coordinate system for privacy review even when OCR uses tiles.
    spans = []
    edge, step = 960, 832
    # Full-width strips avoid cutting Korean sentences at horizontal tile seams.
    working = image.copy()
    if working.width > 2800:
        working = working.resize((2800, round(working.height * 2800 / working.width)))
    if (working.height + step - 1) // step > 40:
        raise PreparationError("IMAGE_LIMIT")
    for y in range(0, max(1, working.height - edge + step), step):
        tile = working.crop((0, y, working.width, min(y + edge, working.height)))
        for s in _ocr(tile):
            left, top, right, bottom = s["box"]
            s["box"] = [
                left,
                (y + top * tile.height) / working.height,
                right,
                (y + bottom * tile.height) / working.height,
            ]
            duplicate = next(
                (old for old in spans if _intersection(old["box"], s["box"]) > 0.8), None
            )
            if duplicate is None:
                spans.append(s)
            else:

                def quality(span):
                    box = span["box"]
                    return (box[2] - box[0]) * (box[3] - box[1]) * span["confidence"]

                if quality(s) > quality(duplicate):
                    duplicate.update(s)

    return _lines(spans, image.height / image.width)


def _pdf_spans(page):
    """Use character boxes in PDF coordinates, not a full-page privacy rectangle."""
    width, height = page.get_size()
    left, bottom, right, top = page.get_bbox()
    rotation = page.get_rotation()

    def normalized(box):
        def point(x, y):
            if rotation == 90:
                return (y - bottom) / width, (x - left) / height
            if rotation == 180:
                return (right - x) / width, (y - bottom) / height
            if rotation == 270:
                return (top - y) / width, (right - x) / height
            return (x - left) / width, (top - y) / height

        pts = [point(x, y) for x in (box[0], box[2]) for y in (box[1], box[3])]
        return [
            max(0, min(x for x, y in pts)),
            max(0, min(y for x, y in pts)),
            min(1, max(x for x, y in pts)),
            min(1, max(y for x, y in pts)),
        ]

    result, current = [], []

    def flush():
        if current:
            text = "".join(c[0] for c in current).strip()
            boxes = [c[1] for c in current if c[1] is not None]
            if text and boxes:
                result.append(
                    {
                        "id": f"pdf-s{len(result)}",
                        "text": text,
                        "box": [
                            min(b[0] for b in boxes),
                            min(b[1] for b in boxes),
                            max(b[2] for b in boxes),
                            max(b[3] for b in boxes),
                        ],
                    }
                )
            current.clear()

    textpage = page.get_textpage()
    try:
        for i in range(textpage.count_chars()):
            char = textpage.get_text_range(i, 1)
            if char in ("\r", "\n") or len(current) >= 1500:
                flush()
            if char not in ("\r", "\n"):
                box = textpage.get_charbox(i) if char.strip() else None
                if box is not None:
                    box = normalized(box)
                    if box[0] >= box[2] or box[1] >= box[3]:
                        flush()
                        continue
                current.append((char, box))
        flush()
    finally:
        textpage.close()
    return result


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
                    spans = _pdf_spans(page)
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
                images.append((image, None))
        except PreparationError:
            raise
        except Exception as exc:
            raise PreparationError("INVALID_IMAGE") from exc
    output = []
    for image, spans in images:
        angle = 0
        if spans is None:
            image, angle = _upright(image)
        ocr_spans = _tiled_ocr(image)
        if spans is not None:
            # Native text is authoritative where it covers the same visible text.
            ocr_spans = [
                s
                for s in ocr_spans
                if not any(_intersection(s["box"], p["box"]) > 0.6 for p in spans)
            ]
            spans = spans + ocr_spans
        else:
            spans = ocr_spans
        uncertain = [s["box"] for s in spans if s.get("confidence", 1) < 0.6]
        if spans and len(uncertain) == len(spans):
            raise PreparationError("OCR_UNCERTAIN")
        # Uncertain OCR is never forwarded as a fact, including in the image.
        # The original remains available for the producer's local privacy review.
        output.append(
            {
                "spans": spans,
                "image": base64.b64encode(_png(image)).decode(),
                "regions": qr_regions(image) + uncertain,
                "rotation": angle,
                "preprocessVersion": PREPROCESS_VERSION,
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
            if process.returncode != 0 or not (root / "output").exists():
                raise PreparationError("PARSER_FAILED")
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
