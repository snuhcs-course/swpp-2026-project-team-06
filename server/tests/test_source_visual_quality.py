"""DEV-58 / AC-SRC-5,8,10: visual evidence and evaluation regressions."""

import io
from types import SimpleNamespace

import pytest
from PIL import Image

from app.ai.source_analysis import ExtractionError
from app.core.db import get_sessionmaker
from app.source_analysis import preprocess as p
from app.source_analysis.models import Asset, Candidate
from app.source_analysis.schemas import Extraction
from app.source_analysis.worker import validate
from tests.test_source_analysis import (
    PREFIX,  # noqa: F401
    create,
    drain,
    source_settings,  # noqa: F401
    start,
    upload,
)


def test_AC_SRC_8_orientation_prefers_readable_horizontal_lines(monkeypatch):
    def ocr(image):
        return [
            {
                "text": "감귤 5kg",
                "confidence": 0.99,
                "box": [0, 0, 0.9, 0.2] if image.width > image.height else [0, 0, 0.2, 0.9],
            }
        ]

    monkeypatch.setattr(p, "_ocr", ocr)
    monkeypatch.setattr(p, "_orientation_angles", lambda image: (90, 270))
    image, angle = p._upright(Image.new("RGB", (100, 200)))
    assert image.size == (200, 100)
    assert angle == 90


def test_AC_SRC_8_lines_join_words_despite_baseline_jitter_and_keep_columns():
    spans = [
        {"text": "5kg", "box": [0.2, 0.1, 0.3, 0.2], "confidence": 0.99},
        {"text": "감귤", "box": [0.05, 0.105, 0.15, 0.2], "confidence": 0.99},
        {"text": "다른상품", "box": [0.7, 0.1, 0.9, 0.2], "confidence": 0.99},
    ]
    lines = p._lines(spans)
    assert {s["text"] for s in lines} == {"감귤 5kg", "다른상품"}


def test_AC_SRC_8_long_image_keeps_native_reading_resolution(monkeypatch):
    seen = []

    def ocr(image):
        seen.append(image.size)
        return [{"id": "s0", "text": "감귤 5kg", "confidence": 0.99, "box": [0.1, 0.1, 0.8, 0.2]}]

    monkeypatch.setattr(p, "_ocr", ocr)
    spans = p._tiled_ocr(Image.new("RGB", (900, 6000)))
    assert len(seen) == 8 and seen[0] == (900, 960)
    assert len(spans) == 8
    assert all(0 <= n <= 1 for s in spans for n in s["box"])
    assert len({s["id"] for s in spans}) == len(spans)


def test_AC_SRC_8_pdf_native_boxes_exclude_hidden_crop_text():
    # PDF coordinates use bottom-left origin; only two glyphs are inside the crop.
    chars = "XAB"
    boxes = [(0, 0, 5, 10), (20, 30, 25, 40), (25, 30, 30, 40)]
    text = SimpleNamespace(
        count_chars=lambda: 3,
        get_text_range=lambda i, n: chars[i],
        get_charbox=lambda i: boxes[i],
        close=lambda: None,
    )
    page = SimpleNamespace(
        get_size=lambda: (30, 30),
        get_bbox=lambda: (10, 20, 40, 50),
        get_rotation=lambda: 0,
        get_textpage=lambda: text,
    )
    spans = p._pdf_spans(page)
    assert spans[0]["text"] == "AB"
    assert spans[0]["box"] == pytest.approx([1 / 3, 1 / 3, 2 / 3, 2 / 3])


def test_AC_SRC_5_pdf_contact_redaction_preserves_product_pixels():
    out = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(out, "PNG")
    safe, spans = p.redact(
        out.getvalue(),
        [
            {"id": "contact", "text": "연락처: 010-1234-5678", "box": [0.1, 0.1, 0.9, 0.2]},
            {"id": "product", "text": "감귤 5kg", "box": [0.1, 0.5, 0.9, 0.7]},
        ],
    )
    assert spans[0]["text"] == "[가림]"
    image = Image.open(io.BytesIO(safe))
    assert image.getpixel((50, 15)) == (0, 0, 0)
    assert image.getpixel((50, 60)) == (255, 255, 255)


def test_AC_SRC_8_quote_mismatch_has_diagnostics_without_relaxing_validation():
    chunk = {
        "sourceId": "s",
        "sourceRevision": 1,
        "pages": [{"number": 1, "spans": [{"id": "a", "text": "감귤 5kg"}]}],
    }
    extraction = Extraction.model_validate(
        {
            "candidates": [
                {
                    "targetId": "t",
                    "fieldKey": "composition",
                    "value": "감귤 5kg",
                    "historical": False,
                    "evidence": [
                        {
                            "sourceId": "s",
                            "sourceRevision": 1,
                            "page": 1,
                            "spanIds": ["a"],
                            "quote": "감귤 | 5kg",
                        }
                    ],
                }
            ],
            "photoRequests": [],
        }
    )
    with pytest.raises(ExtractionError) as error:
        validate(extraction, chunk, {"t"})
    assert str(error.value) == "INVALID_EVIDENCE"
    assert error.value.details == {"candidate": 0, "reason": "QUOTE_NOT_VERBATIM"}


def test_AC_SRC_5_parser_upgrade_invalidates_old_candidates(client, login):
    headers = login("u-kang")
    batch = create(client, headers)
    source = upload(client, headers, batch)
    start(client, headers, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        asset.preprocess_version = None
        asset.privacy_approved = True
        db.commit()
    start(client, headers, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        assert asset.revision == 2
        assert asset.preprocess_version == p.PREPROCESS_VERSION
        assert asset.privacy_approved
        from sqlalchemy import select

        candidates = list(db.scalars(select(Candidate).where(Candidate.batch_id == batch["id"])))
        assert sum(c.outdated for c in candidates) == 3
        assert sum(not c.outdated for c in candidates) == 3
    response = client.get(f"{PREFIX}/{batch['id']}/review", headers=headers)
    assert response.status_code == 200


def test_AC_SRC_5_old_queued_work_cannot_reuse_previous_privacy_geometry(client, login):
    from app.source_analysis import worker

    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch)
    start(client, h, batch["id"])
    assert worker.run_once()  # text and required cover preparation; extraction remains queued
    assert worker.run_once()
    with get_sessionmaker()() as db:
        db.get(Asset, source["id"]).preprocess_version = None
        db.commit()
    drain()
    with get_sessionmaker()() as db:
        from sqlalchemy import select

        from app.source_analysis.models import Item

        items = list(db.scalars(select(Item).where(Item.asset_id == source["id"])))
        assert any(i.status == "FAILED" and i.error == "PARSER_CHANGED" for i in items)
        assert not list(db.scalars(select(Candidate).where(Candidate.batch_id == batch["id"])))


def test_AC_SRC_8_layout_whitespace_recovers_original_quote_but_not_changed_facts():
    from app.source_analysis.worker import canonical_quote

    assert canonical_quote("감귤 5kg 배송 미정", "감귤 5kg\n배송 미정") == "감귤 5kg\n배송 미정"
    assert canonical_quote("감귤 6kg", "감귤 5kg") is None
    assert canonical_quote("감귤 | 5kg", "감귤 5kg") is None
    assert canonical_quote(" ", "감귤 5kg") is None


def test_AC_SRC_8_rapid_output_is_json_safe_and_recognition_is_reenabled(monkeypatch):
    import json

    import numpy as np

    calls = []

    def engine(image, **flags):
        calls.append(flags)
        return SimpleNamespace(
            boxes=np.array([[[0, 0], [80, 0], [80, 20], [0, 20]]], dtype=np.float32),
            txts=["감귤 5kg"],
            scores=[np.float32(0.98)],
        )

    monkeypatch.setattr(p, "_ocr_engine", lambda: engine)
    image = Image.new("RGB", (100, 100))
    assert p._orientation_angles(image) == (0, 180)
    spans = p._ocr(image)
    assert calls[0]["use_rec"] is False and calls[1]["use_rec"] is True
    assert json.loads(json.dumps(spans))[0]["text"] == "감귤 5kg"


def test_AC_SRC_10_failed_and_empty_visual_results_remain_in_quality_gate():
    from app.source_analysis.synthetic import group_result

    fact = {"targetId": "t", "fieldKey": "composition", "value": "감귤 5kg"}
    good = {"status": "EVALUATED", "expected": [fact], "actual": [fact]}
    failed = {"status": "FAILED", "expected": [fact], "actual": []}
    empty = {"status": "EVALUATED", "expected": [fact], "actual": []}
    result = group_result([good, failed, empty])
    assert result["recall"] == 1 / 3 and result["failed"] == 1
    assert result["evaluated"] == 2 and not result["passed"]
    assert group_result([good])["passed"]
    assert not group_result([{**good, "criticalErrors": 1}])["passed"]


@pytest.mark.parametrize("damage", ["missing", "tampered", "engine"])
def test_AC_SRC_5_ocr_models_are_verified_before_loading(tmp_path, monkeypatch, damage):
    import hashlib
    import json

    for name in ("det.onnx", "rec.onnx", "keys.txt"):
        (tmp_path / name).write_bytes(b"verified")
    manifest = {
        "engine": "rapidocr-3.10.0",
        "files": {
            name: hashlib.sha256(b"verified").hexdigest()
            for name in ("det.onnx", "rec.onnx", "keys.txt")
        },
    }
    if damage == "engine":
        manifest["engine"] = "other"
    data = json.dumps(manifest).encode()
    (tmp_path / "manifest.json").write_bytes(data)
    if damage == "missing":
        (tmp_path / "rec.onnx").unlink()
    elif damage == "tampered":
        (tmp_path / "rec.onnx").write_bytes(b"changed")
    monkeypatch.setattr(
        p,
        "get_settings",
        lambda: SimpleNamespace(
            source_ocr_model_dir=str(tmp_path),
            source_ocr_model_sha256=hashlib.sha256(data).hexdigest(),
        ),
    )
    p._ocr_engine.cache_clear()
    with pytest.raises(p.PreparationError, match="OCR_MODEL_MISMATCH"):
        p._ocr_engine()
    p._ocr_engine.cache_clear()


def test_AC_SRC_8_strip_overlap_keeps_one_complete_line(monkeypatch):
    count = 0

    def ocr(image):
        nonlocal count
        count += 1
        # Same physical text at y=850; the second reading contains an OCR typo.
        y = 850 if count == 1 else 18
        return [
            {
                "id": "s0",
                "text": "감귤 5kg" if count == 1 else "감굴 5kg",
                "confidence": 0.99 if count == 1 else 0.8,
                "box": [0.1, y / image.height, 0.8, (y + 30) / image.height],
            }
        ]

    monkeypatch.setattr(p, "_ocr", ocr)
    spans = p._tiled_ocr(Image.new("RGB", (1200, 1100)))
    assert len(spans) == 1 and spans[0]["text"] == "감귤 5kg"
