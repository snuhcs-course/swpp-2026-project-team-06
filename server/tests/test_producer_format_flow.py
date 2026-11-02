"""DEV-171 visual-format API fallback; no successful mock extraction is fabricated.

Like test_source_visual_quality, replace only OCR recognition with fixture spans.
Decode/tiling/PDF rendering, upload hashes, extraction rejection, editor and apply
remain real. Browser evidence and visual extraction quality are separate gates.
"""

import hashlib
import io

import pytest
from PIL import Image

# 이미지·PDF 전처리의 QR 가림은 OCR extra의 OpenCV가 필요하다. CI 기본 설치에는 없다.
pytest.importorskip("cv2")

from app.ai.source_analysis import MOCK_SHA, MOCK_TEXT
from app.core.db import get_sessionmaker
from app.source_analysis import preprocess, worker
from app.source_analysis.models import Asset
from app.source_analysis.synthetic import material
from tests.test_source_analysis import (
    PREFIX,
    create,
    drain,
    key,
    source_settings,  # noqa: F401
    start,
)
from tests.test_source_editor import body_for
from tests.test_source_integration import apply


@pytest.mark.parametrize("kind", ["image", "long-image", "pdf"])
def test_AC_SRC_1_5_6_7_9_11_visual_failure_manual_recovery_and_private_source(
    client, login, monkeypatch, other_farm_headers, kind
):
    data, mime, suffix = material({"kind": "pdf" if kind == "pdf" else "image", "text": MOCK_TEXT})
    if kind == "long-image":
        image = Image.new("RGB", (900, 6000), "white")
        with Image.open(io.BytesIO(data)) as tile:
            image.paste(tile, (0, 0))
        output = io.BytesIO()
        image.save(output, "PNG")
        data = output.getvalue()
    h = login("u-kang")
    b = create(client, h)
    initial = client.get("/api/products/p-house")
    assert initial.status_code == 200, initial.text
    before = initial.json().get("moduleDetail")
    response = client.post(
        f"{PREFIX}/{b['id']}/sources",
        headers=h,
        data={"batchVersion": b["version"], "common": "true"},
        files={"file": (f"fixture-{kind}{suffix}", data, mime)},
    )
    assert response.status_code == 201, response.text
    source = response.json()
    assert source["mime"] == mime and not source["originalPhoto"]
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        assert asset.checksum == hashlib.sha256(data).hexdigest() != MOCK_SHA
        storage_key = asset.storage_key

    # Reuse the visual-quality tests' OCR seam, leaving checksum validation intact.
    def ocr(image):
        return [
            {
                "id": f"s{i}",
                "text": text,
                "confidence": 0.99,
                "box": [0.1, 0.1 + i * 0.15, 0.9, 0.2 + i * 0.15],
            }
            for i, text in enumerate(MOCK_TEXT.splitlines())
        ]

    monkeypatch.setattr(preprocess, "_ocr", ocr)
    monkeypatch.setattr(preprocess, "_orientation_angles", lambda _: (0,))
    # Run real parse in-process so the OCR seam crosses no subprocess boundary.
    monkeypatch.setattr(worker, "prepare", preprocess.parse)
    run = start(client, h, b["id"])
    drain()
    base = f"{PREFIX}/{b['id']}"
    status = client.get(f"{base}/runs/{run['id']}", headers=h).json()
    assert status["mode"] == "mock" and status["status"] == "FAILED", status
    failed = [i for i in status["items"] if i["status"] == "FAILED"]
    assert len(failed) == 1 and failed[0]["error"] == "UNSUPPORTED_MOCK_SOURCE"
    assert client.get(f"{base}/review", headers=h).json()["candidates"] == []
    page = client.get(f"{base}/sources/{source['id']}/pages/1", headers=h)
    assert page.status_code == 200 and page.json()["hasImage"]
    assert any(s["text"] == "제주산 감귤입니다." for s in page.json()["spans"])

    def privacy():
        for asset in client.get(base, headers=h).json()["sources"]:
            url = f"{base}/sources/{asset['id']}"
            for tail in (
                "/content",
                "/text",
                "/pages/1",
                "/pages/1/image",
                "/pages/1/image?sanitized=false",
            ):
                assert client.get(url + tail).status_code == 401
                assert client.get(url + tail, headers=login("u-minji")).status_code == 403
                assert client.get(url + tail, headers=other_farm_headers).status_code == 404
        raw = client.get(f"{base}/sources/{source['id']}/content", headers=h)
        assert raw.status_code == 200 and raw.content == data
        assert raw.headers["cache-control"] == "no-store"
        assert raw.headers["x-content-type-options"] == "nosniff"
        image = client.get(f"{base}/sources/{source['id']}/pages/1/image", headers=h)
        assert image.status_code == 200 and image.headers["cache-control"] == "no-store"
        assert image.headers.get_list("x-content-type-options") == ["nosniff"]
        for path in (f"/api/media/{storage_key}", f"/.artifacts/private-sources/{storage_key}"):
            assert client.get(path).status_code == 404

    privacy()
    manual = f"T12 {kind} 생산자가 확인한 소개"
    storage = f"T12 {kind} 서늘하게 보관해 주세요."
    body = body_for(client, h, b)
    for field in body["fields"]:
        if field["fieldKey"] in ("summary", "storage"):
            field.update(
                value=manual if field["fieldKey"] == "summary" else storage,
                state="CONFIRMED",
                provenance="PRODUCER",
                candidateIds=[],
            )
    body["targets"][0]["hiddenSectionIds"] = ["storage"]

    def save(payload):
        result = client.put(f"{base}/editor", headers=key(h), json=payload)
        assert result.status_code == 200, result.text
        return result.json()["drafts"][0]

    hidden = save(body)
    assert "storage" not in [m["id"] for m in hidden["snapshot"]["previewModules"]]
    reopened = client.get(f"{base}/drafts/{hidden['id']}", headers=h)
    assert reopened.status_code == 200 and reopened.json() == hidden
    assert reopened.json()["snapshot"]["hiddenSectionIds"] == ["storage"]
    restored = body_for(client, h, b)
    assert next(f for f in restored["fields"] if f["fieldKey"] == "storage")["value"] == storage
    draft = save(restored)
    assert [m["id"] for m in draft["snapshot"]["previewModules"]] == ["summary", "storage"]
    again = start(client, h, b["id"])
    drain()
    assert client.get(f"{base}/runs/{again['id']}", headers=h).json()["status"] == "FAILED"
    preserved = body_for(client, h, b)
    assert next(f for f in preserved["fields"] if f["fieldKey"] == "summary")["value"] == manual
    assert next(f for f in preserved["fields"] if f["fieldKey"] == "storage")["value"] == storage
    draft = save(preserved)
    assert client.get("/api/products/p-house").json().get("moduleDetail") == before
    result = apply(client, h, b, draft)
    assert result.status_code == 200, result.text
    expected = [
        {"id": "summary", "texts": [{"fieldKey": "summary", "value": manual}]},
        {"id": "storage", "texts": [{"fieldKey": "storage", "value": storage}]},
    ]
    public = client.get("/api/products/p-house")
    assert public.status_code == 200
    assert [
        {"id": m["id"], "texts": m["texts"]} for m in public.json()["moduleDetail"]["modules"]
    ] == expected
    assert storage_key not in public.text and "/source-analysis/" not in public.text
    privacy()
