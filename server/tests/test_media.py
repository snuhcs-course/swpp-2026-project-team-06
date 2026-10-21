"""공개 미디어 업로드·조회와 사진 주소 검증(DEV-102)."""

import os
import time
import uuid

import pytest

from app.core.config import get_settings
from app.media import service as media
from tests.test_settings_inquiries import jpeg_with_exif, png

MP4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2" + b"\x00" * 64
DATA_URL = "data:image/jpeg;base64," + "A" * 2000


@pytest.fixture(autouse=True)
def storage(monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "source_storage", "local")
    monkeypatch.setattr(settings, "source_storage_dir", str(tmp_path))
    return tmp_path


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def upload(client, headers, data, name="a.png", mime="image/png"):
    return client.post("/api/media", headers=headers, files={"file": (name, data, mime)})


def test_AC_02_3_farm_photo_upload_saves_url_and_serves_publicly(client, login):
    headers = login("u-kang")
    uploaded = upload(client, headers, png())
    assert uploaded.status_code == 201, uploaded.text
    body = uploaded.json()
    assert body["kind"] == "image" and body["mimeType"] == "image/png"
    assert body["url"].startswith("/api/media/") and body["url"].endswith(".png")

    saved = client.patch("/api/farms/me", headers=headers, json={"photo": body["url"]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["photo"] == body["url"]

    served = client.get(body["url"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert "immutable" in served.headers["cache-control"]
    assert served.headers["x-content-type-options"] == "nosniff"
    assert b"GPS" not in served.content


def test_AC_02_3_farm_photo_accepts_absolute_api_url(client, login):
    url = "https://api.farmclub.kr/api/media/med-0123456789.jpg"
    saved = client.patch("/api/farms/me", headers=login("u-kang"), json={"photo": url})
    assert saved.status_code == 200, saved.text


def test_AC_02_3_farm_photo_data_url_is_400_not_500(client, login):
    saved = client.patch("/api/farms/me", headers=login("u-kang"), json={"photo": DATA_URL})
    assert saved.status_code == 400
    assert saved.json()["code"] == "VALIDATION_ERROR"


def test_upload_strips_jpeg_exif(client, login):
    uploaded = upload(client, login("u-kang"), jpeg_with_exif(), "a.jpg", "image/jpeg")
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["url"].endswith(".jpg")
    assert b"GPS-secret" not in client.get(uploaded.json()["url"]).content


def test_upload_rejects_mismatch_unknown_and_oversized_images(client, login):
    headers = login("u-kang")
    assert upload(client, headers, png(), "a.jpg", "image/jpeg").status_code == 400
    assert upload(client, headers, b"hello", "a.txt", "text/plain").status_code == 400
    assert upload(client, headers, b"", "a.png").status_code == 400
    big = png() + b"\x00" * (10 * 1024 * 1024)
    assert upload(client, headers, big).status_code == 400


def test_upload_allowed_for_pending_farm_only_with_farm(client, login):
    # 승인 전이어도 농가 프로필을 고칠 수 있으므로 농가만 있으면 된다(PATCH /api/farms/me와 같다)
    assert upload(client, login("u-soonja"), png()).status_code == 201
    assert upload(client, login("u-new"), png()).status_code == 403
    assert upload(client, login("u-minji"), png()).status_code == 403
    assert (
        client.post("/api/media", files={"file": ("a.png", png(), "image/png")}).status_code == 401
    )


def test_FQ_05_video_upload_and_limit(client, login, monkeypatch):
    headers = login("u-kang")
    uploaded = upload(client, headers, MP4, "a.mp4", "video/mp4")
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["kind"] == "video"
    assert uploaded.json()["url"].endswith(".mp4")
    assert client.get(uploaded.json()["url"]).headers["content-type"] == "video/mp4"

    monkeypatch.setattr(media, "VIDEO_MAX_BYTES", len(MP4) - 1)
    assert upload(client, headers, MP4, "a.mp4", "video/mp4").status_code == 400


def test_read_unknown_or_wrong_extension_is_404(client, login):
    url = upload(client, login("u-kang"), png()).json()["url"]
    assert client.get(url.replace(".png", ".jpg")).status_code == 404
    assert client.get("/api/media/med-none.png").status_code == 404
    assert client.get("/api/media/noext").status_code == 404


def test_AC_12_10_news_keeps_uploaded_video_and_rejects_data_url(client, login):
    headers = login("u-kang")
    video = upload(client, headers, MP4, "a.mp4", "video/mp4").json()["url"]
    posted = client.post(
        "/api/messaging/news",
        headers=headers | key(),
        json={"body": "수확 영상", "videos": [video], "visibility": "PUBLIC"},
    )
    assert posted.status_code in (200, 201), posted.text
    # 농가 소식 목록은 사진·영상을 한 목록으로 합쳐 보여 준다(messaging/service.py)
    news = client.get("/api/messaging/farms/f-kang/news").json()["items"][0]
    assert video in news["photos"]

    bad = client.post(
        "/api/messaging/news",
        headers=headers | key(),
        json={"body": "x", "photos": [DATA_URL], "visibility": "PUBLIC"},
    )
    assert bad.status_code == 400


def test_product_photos_reject_data_url_and_long_grade(client, login):
    headers = login("u-kang")
    version = client.get("/api/products/mine/p-house", headers=headers).json()["version"]
    photos = client.patch(
        "/api/products/p-house",
        headers=headers | key(),
        json={"version": version, "photos": [DATA_URL]},
    )
    grade = client.patch(
        "/api/products/p-house",
        headers=headers | key(),
        json={"version": version, "grade": "가" * 21},
    )
    assert photos.status_code == 400
    assert grade.status_code == 400


def test_address_fields_longer_than_columns_are_400(client, login):
    added = client.post(
        "/api/auth/me/addresses",
        headers=login("u-minji"),
        json={
            "recipientName": "김민지",
            "recipientPhone": "0" * 33,
            "postalCode": "63000",
            "address": "제주 서귀포시 1",
        },
    )
    assert added.status_code == 400


def test_storage_cleanup_keeps_public_media(client, login, storage, monkeypatch):
    from app.source_analysis import worker

    url = upload(client, login("u-kang"), png()).json()["url"]
    files = [p for p in storage.rglob("*") if p.is_file()]
    assert len(files) == 1
    old = time.time() - 2 * 24 * 3600
    os.utime(files[0], (old, old))

    worker.cleanup()

    assert files[0].exists()
    assert client.get(url).status_code == 200


def test_migrate_inline_moves_data_urls_and_keeps_bad_ones(client, login, capsys):
    import base64

    from sqlalchemy import select

    from app.catalog.models import Product
    from app.core.db import get_sessionmaker
    from app.media import migrate_inline

    good = "data:image/png;base64," + base64.b64encode(png()).decode()
    bad = "data:image/png;base64," + base64.b64encode(b"not an image").decode()
    with get_sessionmaker()() as session, session.begin():
        product = session.scalar(select(Product).where(Product.id == "p-house"))
        product.photos = [good, "/photos/basket.jpg", bad, good]

    assert migrate_inline.main(["--base-url", "https://api.farmclub.kr"]) == 0
    assert "옮김 2개, 형식 오류로 남김 1개" in capsys.readouterr().out
    with get_sessionmaker()() as session:
        assert session.get(Product, "p-house").photos[0] == good

    assert migrate_inline.main(["--base-url", "https://api.farmclub.kr", "--commit"]) == 0
    with get_sessionmaker()() as session:
        photos = session.get(Product, "p-house").photos
    assert photos[0].startswith("https://api.farmclub.kr/api/media/") and photos[0] == photos[3]
    assert photos[1:3] == ["/photos/basket.jpg", bad]
    served = client.get(photos[0].removeprefix("https://api.farmclub.kr"))
    assert served.status_code == 200 and b"GPS" not in served.content

    assert migrate_inline.main([]) == 2
