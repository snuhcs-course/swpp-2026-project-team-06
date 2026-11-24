"""Invented PDFs only; no producer data."""

import hashlib
import json
import subprocess
import sys

import psutil
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
    text_objects=0,
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
    content = "BT /F1 8 Tf 1 0 0 1 1 1 Tm (x) Tj ET\n" * text_objects + content
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
                f"/Fm0 {4 + pages * 2} 0 R >> "
                "/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> "
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


@pytest.mark.parametrize(
    "payload",
    [
        '{"1": [[0, 0, 1, 1]], "01": []}',
        '{"1": [[0, 0, 1, 1]], "1": []}',
        '{"1": [[0, 0, 2, 1]]}',
        "[]",
        "{invalid",
    ],
)
def test_AC_SRC_5_cli_bad_redactions_never_export(tmp_path, payload):
    source = tmp_path / "invented.pdf"
    source.write_bytes(pdf_bytes())
    masks = tmp_path / "masks.json"
    masks.write_text(payload)
    output = tmp_path / "output"
    run = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.source_analysis.pdf_photo_extract",
            str(source),
            "--output",
            str(output),
            "--redactions",
            str(masks),
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    manifest = json.loads((output / "manifest.json").read_text())
    assert run.returncode == 1 and manifest["errors"] == ["INVALID_REDACTIONS"]
    assert manifest["source"]["sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert list(output.glob("*.png")) == []


def test_AC_SRC_5_cli_integer_float_caps(tmp_path):
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
            json.dumps(
                {
                    "maxInputBytes": float(source.stat().st_size + 1),
                    "pageCap": 1.0,
                }
            ),
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    manifest = json.loads((output / "manifest.json").read_text())
    assert run.returncode == 0 and manifest["status"] == "SUCCEEDED"
    assert type(manifest["limits"]["maxInputBytes"]) is int
    assert type(manifest["limits"]["pageCap"]) is int


@pytest.mark.parametrize("failure", [PermissionError("denied"), psutil.AccessDenied()])
@pytest.mark.parametrize("stage", ["children", "constructor"])
def test_AC_SRC_5_monitor_failure_kills_and_waits_child(
    tmp_path, monkeypatch, capsys, failure, stage
):
    from app.source_analysis import pdf_photo_extract as extractor

    source = tmp_path / "invented.pdf"
    source.write_bytes(pdf_bytes())
    output = tmp_path / "output"

    class Child:
        pid = 123
        returncode = None
        killed = False
        waited = False

        def poll(self):
            return self.returncode

        def kill(self):
            self.killed = True
            self.returncode = -9

        def wait(self):
            self.waited = True
            return self.returncode

    class Monitor:
        def memory_info(self):
            return type("Memory", (), {"rss": 100})()

        def children(self, recursive):
            raise failure

    child = Child()
    monkeypatch.setattr(extractor.subprocess, "Popen", lambda *a, **k: child)

    def make_monitor(pid):
        if stage == "constructor":
            raise failure
        return Monitor()

    monkeypatch.setattr(extractor.psutil, "Process", make_monitor)
    assert extractor.main([str(source), "--output", str(output)]) == 1
    manifest = json.loads((output / "manifest.json").read_text())
    assert child.killed and child.waited
    assert manifest["errors"] == ["MONITOR_FAILED"]
    assert manifest["source"]["sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert "invented" not in capsys.readouterr().out


def test_AC_SRC_2_source_change_preserves_worker_hash_and_fails(tmp_path, monkeypatch):
    from app.source_analysis import pdf_photo_extract as extractor

    source = tmp_path / "invented.pdf"
    source.write_bytes(pdf_bytes())
    changed = pdf_bytes(cover=True)
    output = tmp_path / "output"

    class Child:
        pid = 123
        returncode = 0

        def poll(self):
            return 0

        def wait(self):
            return 0

    def spawn(*args, **kwargs):
        extract_pdf(changed, output)
        return Child()

    monkeypatch.setattr(extractor.subprocess, "Popen", spawn)
    monkeypatch.setattr(extractor.psutil, "Process", lambda pid: object())
    assert extractor.main([str(source), "--output", str(output)]) == 1
    manifest = json.loads((output / "manifest.json").read_text())
    assert manifest["errors"] == ["SOURCE_CHANGED"]
    assert manifest["source"]["sha256"] == hashlib.sha256(changed).hexdigest()


def test_AC_SRC_5_cli_output_reservation_rejects_loser_without_rewrite(tmp_path, monkeypatch):
    from app.source_analysis import pdf_photo_extract as extractor

    source = tmp_path / "invented.pdf"
    data = pdf_bytes()
    source.write_bytes(data)
    output = tmp_path / "output"
    invocation = [str(source), "--output", str(output)]
    claim = tmp_path / ".output.pdf-photo-cli.lock"

    class Child:
        pid = 123
        returncode = 0

        def poll(self):
            return 0

        def wait(self):
            return 0

    def spawn(*args, **kwargs):
        assert claim.exists() and not output.exists()
        # Deterministically enter a second CLI before the winner creates output.
        with pytest.raises(SystemExit) as rejected:
            extractor.main(invocation)
        assert rejected.value.code == 2
        assert claim.exists() and not output.exists()
        extract_pdf(data, output)
        return Child()

    monkeypatch.setattr(extractor.subprocess, "Popen", spawn)
    monkeypatch.setattr(extractor.psutil, "Process", lambda pid: object())
    assert extractor.main(invocation) == 0
    assert not claim.exists()
    manifest = json.loads((output / "manifest.json").read_text())
    assert manifest["status"] == "SUCCEEDED" and manifest["errors"] == []


def test_AC_SRC_5_cli_never_removes_another_owners_claim(tmp_path):
    from app.source_analysis.pdf_photo_extract import main

    source = tmp_path / "invented.pdf"
    source.write_bytes(pdf_bytes())
    output = tmp_path / "output"
    claim = tmp_path / ".output.pdf-photo-cli.lock"
    claim.write_text("other owner")
    with pytest.raises(SystemExit):
        main([str(source), "--output", str(output)])
    assert claim.read_text() == "other owner"
    assert not output.exists()


def test_AC_SRC_5_v2_text_traversal_does_not_exhaust_image_budget(tmp_path):
    result = extract_pdf(pdf_bytes(text_objects=250, pages=2), tmp_path)
    assert result["extractorVersion"] == "pdf-photo-v2"
    assert result["limits"]["objectCap"] == 10_000
    assert result["limits"]["imageObjectCap"] == 200
    assert result["metrics"]["objectsVisited"] == 502
    assert result["metrics"]["imageObjectsVisited"] == 2
    assert result["processedPages"] == [1, 2] and result["skippedPages"] == []
    assert result["status"] == "SUCCEEDED"
    assert [entry["status"] for entry in result["occurrences"]] == ["REVIEW_REQUIRED"] * 2


@pytest.mark.parametrize(
    "kwargs,expected",
    [
        ({"tiny": True}, "FILTERED"),
        ({"form": True}, "UNSUPPORTED"),
        ({}, "REVIEW_REQUIRED"),
    ],
)
def test_AC_SRC_5_v2_independent_image_cap_before_filters(tmp_path, kwargs, expected):
    result = extract_pdf(
        pdf_bytes(pages=2, duplicates=True, **kwargs), tmp_path, limits={"imageObjectCap": 1}
    )
    assert result["metrics"]["imageObjectsVisited"] == 1
    assert result["metrics"]["objectsVisited"] == 1
    assert result["status"] == "PARTIAL"
    assert result["skippedPages"] == [2]
    assert "IMAGE_OBJECT_LIMIT" in result["warnings"]
    assert "OBJECT_LIMIT" not in result["warnings"]
    assert len(result["occurrences"]) == 1
    assert result["occurrences"][0]["status"] == expected


def test_AC_SRC_5_v2_traversal_cap_distinct_from_image_cap(tmp_path):
    result = extract_pdf(pdf_bytes(text_objects=250, pages=2), tmp_path, limits={"objectCap": 10})
    assert result["status"] == "PARTIAL"
    assert result["metrics"]["objectsVisited"] == 10
    assert result["metrics"]["imageObjectsVisited"] == 0
    assert result["skippedPages"] == [2]
    assert "OBJECT_LIMIT" in result["warnings"]
    assert "IMAGE_OBJECT_LIMIT" not in result["warnings"]
    assert result["occurrences"] == []


def test_AC_SRC_5_v2_exact_image_budget_is_reported_partial(tmp_path):
    result = extract_pdf(pdf_bytes(), tmp_path, limits={"imageObjectCap": 1.0})
    assert result["status"] == "PARTIAL"
    assert "IMAGE_OBJECT_LIMIT" in result["warnings"]
    assert type(result["limits"]["imageObjectCap"]) is int
