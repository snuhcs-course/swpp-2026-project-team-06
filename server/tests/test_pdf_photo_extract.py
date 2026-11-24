"""Invented PDFs only; no producer data."""

import hashlib
import json
import subprocess
import sys

import pytest
from PIL import Image

from app.source_analysis.pdf_photo_extract import extract_pdf


def pdf_bytes(
    *,
    image=True,
    duplicates=False,
    rotation=0,
    cover=False,
    clip=False,
    full_page=False,
    tiny=False,
    form=False,
    annotation=False,
    pages=1,
    offset=False,
    crop_box=False,
):
    size = 32 if tiny else 100
    pixels = bytes([255, 0, 0]) * size * size
    placement = "200 0 0 200 0 0" if full_page else "100 0 0 100 50 50"
    if offset:
        placement = "50 0 0 100 10 20"
    content = f"q {placement} cm /Im0 Do Q\n" if image else ""
    if clip:
        content = f"q 50 50 50 100 re W n {placement} cm /Im0 Do Q\n"
    if duplicates:
        content += f"q {placement} cm /Im0 Do Q\n"
    if cover:
        content += "0 0 0 rg 50 50 100 100 re f\n"
    if form:
        content = "q /Fm0 Do Q\n"
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b""]
    kids = []
    for _ in range(pages):
        page_id = len(objects) + 1
        kids.append(f"{page_id} 0 R")
        objects.append(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Rotate {rotation} "
                + ("/CropBox [25 25 175 175] " if crop_box else "")
                + f"/Resources << /XObject << /Im0 {3 + pages * 2} 0 R "
                f"/Fm0 {4 + pages * 2} 0 R >> >> "
                f"/Contents {page_id + 1} 0 R "
                + (f"/Annots [{5 + pages * 2} 0 R] " if annotation else "")
                + ">>"
            ).encode()
        )
        encoded = content.encode()
        objects.append(f"<< /Length {len(encoded)} >>\nstream\n".encode() + encoded + b"endstream")
    objects[1] = f"<< /Type /Pages /Count {pages} /Kids [{' '.join(kids)}] >>".encode()
    objects.append(
        (
            f"<< /Type /XObject /Subtype /Image /Width {size} /Height {size} "
            f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Length {len(pixels)} >>\nstream\n"
        ).encode()
        + pixels
        + b"\nendstream"
    )
    form_content = b"q 100 0 0 100 50 50 cm /Im0 Do Q"
    objects.append(
        (
            f"<< /Type /XObject /Subtype /Form /BBox [0 0 200 200] "
            f"/Resources << /XObject << /Im0 {3 + pages * 2} 0 R >> >> "
            f"/Length {len(form_content)} >>\nstream\n"
        ).encode()
        + form_content
        + b"\nendstream"
    )
    objects.append(
        (
            f"<< /Type /Annot /Subtype /Square /Rect [50 50 150 150] /F 4 "
            f"/AP << /N {6 + pages * 2} 0 R >> >>"
        ).encode()
    )
    overlay = b"0 0 0 rg 0 0 100 100 re f"
    objects.append(
        (
            f"<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] "
            f"/Length {len(overlay)} >>\nstream\n"
        ).encode()
        + overlay
        + b"\nendstream"
    )
    result = bytearray(b"%PDF-1.7\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(result)
    result.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        result.extend(f"{offset:010} 00000 n \n".encode())
    result.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(result)


def exported(result, output):
    return Image.open(output / result["occurrences"][0]["imagePath"]).convert("RGB")


@pytest.mark.parametrize(
    "kwargs,redactions",
    [({"cover": True}, None), ({}, {1: [[0.25, 0.25, 0.75, 0.75]]}), ({"annotation": True}, None)],
)
def test_AC_SRC_2_5_11_visible_cover_redaction_annotation(tmp_path, kwargs, redactions):
    result = extract_pdf(pdf_bytes(**kwargs), tmp_path, redactions=redactions)
    assert exported(result, tmp_path).getpixel((50, 50)) == (0, 0, 0)
    assert result["occurrences"][0]["status"] == "REVIEW_REQUIRED"


@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
def test_AC_SRC_2_rotation_clipping_no_upscale(tmp_path, rotation):
    result = extract_pdf(pdf_bytes(rotation=rotation, clip=True), tmp_path)
    entry = result["occurrences"][0]
    image = exported(result, tmp_path)
    assert entry["bounds"] == [0.25, 0.25, 0.75, 0.75]
    assert max(image.size) <= 100
    assert (255, 0, 0) in set(image.get_flattened_data()) and (255, 255, 255) in set(
        image.get_flattened_data()
    )
    assert (
        entry["pixelSha256"]
        == hashlib.sha256((tmp_path / entry["imagePath"]).read_bytes()).hexdigest()
    )


def test_AC_SRC_2_duplicates_stable_ids(tmp_path):
    data = pdf_bytes(duplicates=True)
    first = extract_pdf(data, tmp_path / "one")
    second = extract_pdf(data, tmp_path / "two")
    a, b = first["occurrences"]
    assert a["id"] != b["id"] and b["duplicateOf"] == a["id"]
    assert a["imagePath"] == b["imagePath"]
    assert len(list((tmp_path / "one").glob("*.png"))) == 1
    assert [x["id"] for x in first["occurrences"]] == [x["id"] for x in second["occurrences"]]
    revised = extract_pdf(data, tmp_path / "revision", source_revision=2)
    assert revised["occurrences"][0]["id"] != a["id"]


@pytest.mark.parametrize(
    "kwargs,reason,status",
    [
        ({"tiny": True}, "TINY", "FILTERED"),
        ({"full_page": True}, "COMPOSITE_PAGE", "UNSUPPORTED"),
        ({"form": True}, "FORM_GEOMETRY", "UNSUPPORTED"),
    ],
)
def test_AC_SRC_5_conservative_unsupported_filtered(tmp_path, kwargs, reason, status):
    result = extract_pdf(pdf_bytes(**kwargs), tmp_path)
    entry = result["occurrences"][0]
    assert entry["status"] == status and reason in entry["reasonCodes"]
    assert entry["imagePath"] is None and list(tmp_path.glob("*.png")) == []
    assert result["metrics"]["objectsVisited"] >= 1


def test_AC_SRC_5_empty_malformed(tmp_path):
    empty = extract_pdf(pdf_bytes(image=False), tmp_path / "empty")
    assert empty["status"] == "SUCCEEDED" and empty["occurrences"] == []
    bad = extract_pdf(b"not a PDF", tmp_path / "bad")
    assert bad["status"] == "FAILED" and bad["errors"] == ["INVALID_PDF"]


@pytest.mark.parametrize(
    "limits,code",
    [
        ({"candidateCap": 1}, "CANDIDATE_LIMIT"),
        ({"objectCap": 1}, "OBJECT_LIMIT"),
        ({"maxOutputBytes": 1}, "OUTPUT_BYTES_LIMIT"),
        ({"maxImagePixels": 1}, "IMAGE_PIXELS_LIMIT"),
        ({"maxInputBytes": 1}, "INPUT_BYTES_LIMIT"),
    ],
)
def test_AC_SRC_5_caps_retain_diagnostics(tmp_path, limits, code):
    result = extract_pdf(pdf_bytes(duplicates=True), tmp_path, limits=limits)
    assert code in result["warnings"] + result["errors"]
    assert result["status"] in {"PARTIAL", "FAILED"}
    assert (tmp_path / "manifest.json").exists()
    assert result["metrics"]["outputBytes"] <= result["limits"]["maxOutputBytes"]


def test_AC_SRC_5_page_pixel_cap(tmp_path):
    result = extract_pdf(
        pdf_bytes(pages=2), tmp_path, limits={"pageCap": 1, "maxPagePixels": 10_000}
    )
    assert result["processedPages"] == [1] and result["skippedPages"] == [2]
    assert "PAGE_LIMIT" in result["warnings"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"source_id": "../unsafe"},
        {"source_revision": True},
        {"redactions": {1: [[0, 0, 2, 1]]}},
        {"redactions": {"1": []}},
        {"limits": {"pageCap": 21}},
        {"limits": {"renderScale": float("nan")}},
    ],
)
def test_AC_SRC_5_validation_closed(tmp_path, kwargs):
    with pytest.raises(ValueError):
        extract_pdf(pdf_bytes(), tmp_path, **kwargs)
    assert not list(tmp_path.iterdir())


def test_AC_SRC_5_output_exclusive(tmp_path):
    (tmp_path / "private.txt").write_text("preserve")
    with pytest.raises(ValueError, match="OUTPUT_NOT_EMPTY"):
        extract_pdf(pdf_bytes(), tmp_path)
    assert (tmp_path / "private.txt").read_text() == "preserve"


def test_AC_SRC_5_cli_hard_limits(tmp_path):
    source = tmp_path / "invented.pdf"
    source.write_bytes(pdf_bytes())
    for key, value, expected in [
        ("maxElapsedSeconds", 30, "SUCCEEDED"),
        ("maxElapsedSeconds", 0.001, "TIME_LIMIT"),
        ("maxRssMiB", 1, "RSS_LIMIT"),
    ]:
        output = tmp_path / f"{key}-{value}"
        run = subprocess.run(
            [
                sys.executable,
                "-m",
                "app.source_analysis.pdf_photo_extract",
                str(source),
                "--output",
                str(output),
                "--limits",
                json.dumps({key: value}),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        manifest = json.loads((output / "manifest.json").read_text())
        if expected == "SUCCEEDED":
            assert run.returncode == 0 and manifest["status"] == expected
        else:
            assert run.returncode == 1 and expected in manifest["errors"]
        assert manifest["source"]["sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
        assert str(source) not in run.stdout and "imagePath" not in run.stdout


@pytest.mark.parametrize(
    "rotation,expected",
    [
        (0, [0.05, 0.4, 0.3, 0.9]),
        (90, [0.1, 0.05, 0.6, 0.3]),
        (180, [0.7, 0.1, 0.95, 0.6]),
        (270, [0.4, 0.7, 0.9, 0.95]),
    ],
)
def test_AC_SRC_2_asymmetric_rotated_geometry(tmp_path, rotation, expected):
    result = extract_pdf(pdf_bytes(offset=True, rotation=rotation), tmp_path)
    assert result["occurrences"][0]["bounds"] == expected
    assert result["occurrences"][0]["status"] == "REVIEW_REQUIRED"


def test_AC_SRC_2_crop_box_geometry(tmp_path):
    result = extract_pdf(pdf_bytes(crop_box=True), tmp_path)
    assert result["occurrences"][0]["bounds"] == pytest.approx([1 / 6, 1 / 6, 5 / 6, 5 / 6])
    assert exported(result, tmp_path).getpixel((50, 50)) == (255, 0, 0)


def test_AC_SRC_5_cli_oversized_input_is_rejected_before_decode(tmp_path):
    source = tmp_path / "invented.pdf"
    source.write_bytes(pdf_bytes())
    output = tmp_path / "output"
    run = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.source_analysis.pdf_photo_extract",
            str(source),
            "--output",
            str(output),
            "--limits",
            json.dumps({"maxInputBytes": 1}),
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    manifest = json.loads((output / "manifest.json").read_text())
    assert run.returncode == 1
    assert manifest["errors"] == ["INPUT_BYTES_LIMIT"]
    assert manifest["source"]["sha256"] is None
    assert list(output.glob("*.png")) == []
