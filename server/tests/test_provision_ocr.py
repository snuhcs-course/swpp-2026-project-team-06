import hashlib
import http.client
import json
import urllib.error

import pytest

from app.source_analysis import provision_ocr

MANIFEST = json.loads(
    (provision_ocr.Path(provision_ocr.__file__).with_name("ocr-manifest.json")).read_text()
)


def fake_manifest(monkeypatch, tmp_path, files):
    manifest = {
        "files": {name: hashlib.sha256(body).hexdigest() for name, body in files.items()},
        "sources": {name: provision_ocr.UPSTREAM + name for name in files},
    }
    module_dir = tmp_path / "module"
    module_dir.mkdir()
    (module_dir / "ocr-manifest.json").write_text(json.dumps(manifest))
    monkeypatch.setattr(provision_ocr, "__file__", str(module_dir / "provision_ocr.py"))
    return manifest


def serve(monkeypatch, responses):
    calls = []

    def fetch(url):
        calls.append(url)
        reply = responses[url]
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(provision_ocr, "fetch", fetch)
    return calls


def http_500(url):
    return urllib.error.HTTPError(url, 500, "Internal Server Error", None, None)


def test_DEV189_manifest_sources_are_upstream_and_unchanged():
    assert MANIFEST["sources"] and all(
        url.startswith(provision_ocr.UPSTREAM) for url in MANIFEST["sources"].values()
    )
    # Production SOURCE_OCR_MODEL_SHA256 pins these bytes (server/README.md).
    manifest_bytes = provision_ocr.Path(provision_ocr.__file__).with_name("ocr-manifest.json")
    assert (
        hashlib.sha256(manifest_bytes.read_bytes()).hexdigest()
        == "9f64ef4f9d20e41cb506a6015af66d4b0da3939b23286f89a0ff32f98d122049"
    )


def test_DEV189_mirror_is_used_first(monkeypatch, tmp_path):
    fake_manifest(monkeypatch, tmp_path, {"det.onnx": b"det"})
    calls = serve(monkeypatch, {provision_ocr.MIRROR + "det.onnx": b"det"})
    provision_ocr.provision(tmp_path / "out")
    assert calls == [provision_ocr.MIRROR + "det.onnx"]
    assert (tmp_path / "out" / "det.onnx").read_bytes() == b"det"
    assert (tmp_path / "out" / "manifest.json").exists()


def test_DEV189_upstream_fallback_when_mirror_fails(monkeypatch, tmp_path):
    fake_manifest(monkeypatch, tmp_path, {"rec.onnx": b"rec"})
    mirror = provision_ocr.MIRROR + "rec.onnx"
    upstream = provision_ocr.UPSTREAM + "rec.onnx"
    calls = serve(monkeypatch, {mirror: http_500(mirror), upstream: b"rec"})
    provision_ocr.provision(tmp_path / "out")
    assert calls == [mirror, upstream]
    assert (tmp_path / "out" / "rec.onnx").read_bytes() == b"rec"


def test_DEV189_upstream_fallback_when_mirror_drops_mid_read(monkeypatch, tmp_path):
    fake_manifest(monkeypatch, tmp_path, {"det.onnx": b"det"})
    mirror = provision_ocr.MIRROR + "det.onnx"
    upstream = provision_ocr.UPSTREAM + "det.onnx"
    calls = serve(monkeypatch, {mirror: http.client.IncompleteRead(b""), upstream: b"det"})
    provision_ocr.provision(tmp_path / "out")
    assert calls == [mirror, upstream]
    assert (tmp_path / "out" / "det.onnx").read_bytes() == b"det"


def test_DEV189_upstream_fallback_when_connection_resets(monkeypatch, tmp_path):
    fake_manifest(monkeypatch, tmp_path, {"det.onnx": b"det"})
    mirror = provision_ocr.MIRROR + "det.onnx"
    upstream = provision_ocr.UPSTREAM + "det.onnx"
    calls = serve(monkeypatch, {mirror: ConnectionResetError("reset"), upstream: b"det"})
    provision_ocr.provision(tmp_path / "out")
    assert calls == [mirror, upstream]


def test_DEV189_mirror_with_wrong_hash_falls_back(monkeypatch, tmp_path):
    fake_manifest(monkeypatch, tmp_path, {"keys.txt": b"keys"})
    mirror = provision_ocr.MIRROR + "keys.txt"
    upstream = provision_ocr.UPSTREAM + "keys.txt"
    serve(monkeypatch, {mirror: b"tampered", upstream: b"keys"})
    provision_ocr.provision(tmp_path / "out")
    assert (tmp_path / "out" / "keys.txt").read_bytes() == b"keys"


def test_DEV189_fails_when_no_source_matches_hash(monkeypatch, tmp_path):
    fake_manifest(monkeypatch, tmp_path, {"det.onnx": b"det"})
    mirror = provision_ocr.MIRROR + "det.onnx"
    upstream = provision_ocr.UPSTREAM + "det.onnx"
    serve(monkeypatch, {mirror: b"bad", upstream: http_500(upstream)})
    with pytest.raises(ValueError):
        provision_ocr.provision(tmp_path / "out")
    assert not (tmp_path / "out" / "det.onnx").exists()


def test_DEV189_untrusted_manifest_source_is_rejected(monkeypatch, tmp_path):
    manifest = fake_manifest(monkeypatch, tmp_path, {"det.onnx": b"det"})
    manifest["sources"]["det.onnx"] = "https://example.com/det.onnx"
    (tmp_path / "module" / "ocr-manifest.json").write_text(json.dumps(manifest))
    serve(monkeypatch, {})
    with pytest.raises(ValueError, match="Untrusted"):
        provision_ocr.provision(tmp_path / "out")
