"""DEV-328: published product photos are display-size JPEG with short public caching.

Access rule (AC-SRC-6/9) is unchanged: only photos referenced by a published product are served.
"""

import io
from copy import deepcopy
from uuid import uuid4

import pytest
from PIL import Image

from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Draft, Page, PublicPhoto
from app.source_analysis.storage import Storage
from tests.test_source_analysis import source_settings  # noqa: F401
from tests.test_source_integration import apply, saved

WORKSPACES = "/api/source-analysis/product-workspaces"


def photo_bytes(size, fmt="PNG", **save):
    """Camera-like content (gradient + noise) so encoders cannot cheat on flat colour."""
    w, h = size
    noise = Image.effect_noise((w, h), 48)
    gradient = Image.linear_gradient("L").resize((w, h))
    image = Image.merge("RGB", [noise, gradient, gradient.transpose(Image.Transpose.ROTATE_180)])
    out = io.BytesIO()
    image.save(out, fmt, **save)
    return out.getvalue()


def opened(data):
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def publish_with_photo(client, h, data):
    """Publish p-house with `data` as the first module photo (prepared sanitized page)."""
    b, d = saved(client, h)
    with get_sessionmaker()() as db:
        key = Storage().put(data)
        source = Asset(
            batch_id=b["id"],
            checksum="image",
            storage_key=key,
            filename="original.png",
            mime="image/png",
            size=len(data),
            target_ids=[b["targets"][0]["id"]],
            common=False,
            original_photo=True,
            status="PREPARED",
            page_count=1,
        )
        db.add(source)
        db.flush()
        db.add(
            Page(
                asset_id=source.id,
                revision=1,
                number=1,
                spans=[],
                redacted_spans=[],
                image_key=key,
                sanitized_key=key,
                redactions=[],
            )
        )
        draft = db.get(Draft, d["id"])
        snap = deepcopy(draft.snapshot)
        snap["previewModules"][0]["photoAssetIds"] = [source.id]
        snap["sourceVersions"][source.id] = {"revision": 1, "sanitizationVersion": 0}
        draft.snapshot = snap
        db.commit()
    result = apply(client, h, b, d)
    assert result.status_code == 200, result.text
    return result.json()["moduleDetail"]["modules"][0]["photos"][0]["uri"]


def set_status(status):
    with get_sessionmaker()() as db:
        db.get(Product, "p-house").status = status
        db.commit()


def test_AC_SRC_6_published_photo_is_display_size_jpeg(client, login):
    original = photo_bytes((3200, 2400))
    uri = publish_with_photo(client, login("u-kang"), original)
    response = client.get(uri)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    image = opened(response.content)
    assert image.format == "JPEG" and image.size == (1600, 1200)
    assert image.info.get("progressive") and not image.getexif()
    assert "icc_profile" not in image.info and "exif" not in image.info
    assert len(response.content) * 4 < len(original)
    # The representative cover becomes product.photo, which every consumer list fetches.
    cover = client.get(client.get("/api/products/p-house").json()["photo"])
    assert cover.status_code == 200 and cover.headers["content-type"] == "image/jpeg"


def test_AC_SRC_6_small_published_photo_is_not_upscaled(client, login):
    uri = publish_with_photo(client, login("u-kang"), photo_bytes((640, 900)))
    assert opened(client.get(uri).content).size == (640, 900)


def test_AC_SRC_9_published_photo_short_cache_and_etag(client, login):
    uri = publish_with_photo(client, login("u-kang"), photo_bytes((800, 600)))
    first = client.get(uri)
    assert first.headers["cache-control"] == "private, max-age=300"
    assert first.headers.get_list("x-content-type-options") == ["nosniff"]
    tag = first.headers["etag"]
    assert tag.startswith('"') and "/" not in tag  # never the private storage key
    again = client.get(uri, headers={"If-None-Match": tag})
    assert again.status_code == 304 and again.content == b""
    assert again.headers["etag"] == tag
    assert again.headers["cache-control"] == "private, max-age=300"
    assert client.get(uri, headers={"If-None-Match": f'W/{tag}, "x"'}).status_code == 304
    assert client.get(uri, headers={"If-None-Match": '"other"'}).status_code == 200
    # Revalidation still runs the access rule: an unpublished product never gets a 304.
    set_status("DRAFT")
    assert client.get(uri).status_code == 404
    assert client.get(uri, headers={"If-None-Match": tag}).status_code == 404
    assert client.get(uri, headers={"If-None-Match": "*"}).status_code == 404


def test_AC_SRC_9_unreferenced_or_unknown_photo_is_not_served(client):
    with get_sessionmaker()() as db:
        photo = PublicPhoto(product_id="p-house", storage_key=Storage().put(photo_bytes((40, 30))))
        db.add(photo)
        db.commit()
        pid = photo.id
    assert client.get(f"/api/source-media/{pid}").status_code == 404
    assert client.get(f"/api/source-media/{pid}", headers={"If-None-Match": "*"}).status_code == 404
    assert client.get("/api/source-media/does-not-exist").status_code == 404


def test_AC_SRC_6_legacy_png_photo_keeps_png_type(client):
    legacy = photo_bytes((300, 200))
    with get_sessionmaker()() as db:
        photo = PublicPhoto(product_id="p-house", storage_key=Storage().put(legacy))
        db.add(photo)
        db.flush()
        product = db.get(Product, "p-house")
        product.photos = [f"/api/source-media/{photo.id}", *product.photos]
        uri = product.photos[0]
        db.commit()
    response = client.get(uri)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png" and response.content == legacy


def test_AC_SRC_11_workspace_upload_is_oriented_display_size_jpeg(client, login):
    h = login("u-kang")
    client.post(
        WORKSPACES, headers={**h, "Idempotency-Key": str(uuid4())}, json={"productId": "p-house"}
    )
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees on display
    exif[0x010F] = "Camera maker"
    upload = photo_bytes((2400, 1800), "JPEG", quality=95, exif=exif.tobytes())
    added = client.post(
        WORKSPACES + "/p-house/photos",
        headers=h,
        files={"file": ("phone.jpg", upload, "image/jpeg")},
    )
    assert added.status_code == 201, added.text
    photo_id = added.json()["uri"].rsplit("/", 1)[1]
    preview = client.get(f"{WORKSPACES}/p-house/photos/{photo_id}", headers=h)
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/jpeg"
    assert preview.headers["cache-control"] == "no-store"  # private until applied
    image = opened(preview.content)
    assert image.size == (1200, 1600) and not image.getexif()


@pytest.fixture
def stored_photos():
    store = Storage()
    png, jpeg = photo_bytes((2000, 1500)), photo_bytes((400, 300), "JPEG")
    with get_sessionmaker()() as db:
        rows = [
            PublicPhoto(product_id="p-house", storage_key=store.put(png)),
            PublicPhoto(product_id="p-house", storage_key=store.put(jpeg)),
        ]
        db.add_all(rows)
        db.commit()
        return [(r.id, r.storage_key) for r in rows], len(png)


def test_recompress_photos_dry_run_changes_nothing(stored_photos):
    from app.source_analysis.recompress_photos import recompress

    (png_id, png_key), (jpeg_id, jpeg_key) = stored_photos[0]
    with get_sessionmaker()() as db:
        result = recompress(db, Storage(), commit=False)
    assert [c[0] for c in result.converted] == [png_id]
    assert result.skipped >= 1 and not result.failed
    assert result.before == stored_photos[1] and result.after * 4 < result.before
    with get_sessionmaker()() as db:
        assert db.get(PublicPhoto, png_id).storage_key == png_key
        assert db.get(PublicPhoto, jpeg_id).storage_key == jpeg_key
    assert Storage().get(png_key)[:4] == b"\x89PNG"


def test_recompress_photos_commit_replaces_png_and_is_rerunnable(stored_photos):
    from app.source_analysis.recompress_photos import recompress

    (png_id, png_key), (jpeg_id, jpeg_key) = stored_photos[0]
    with get_sessionmaker()() as db:
        converted = recompress(db, Storage(), commit=True).converted
        assert [(c[0], c[1]) for c in converted] == [(png_id, png_key)]
    with get_sessionmaker()() as db:
        new_key = db.get(PublicPhoto, png_id).storage_key
        assert db.get(PublicPhoto, jpeg_id).storage_key == jpeg_key
    assert new_key != png_key
    image = opened(Storage().get(new_key))
    assert image.format == "JPEG" and image.size == (1600, 1200)
    # 예전 키는 바로 지우지 않는다(worker cleanup이 참조 없는 키를 지움)
    assert Storage().get(png_key)[:4] == b"\x89PNG"
    with get_sessionmaker()() as db:
        assert recompress(db, Storage(), commit=True).converted == []


def test_recompress_photos_rejects_unknown_arguments():
    from app.source_analysis.recompress_photos import main

    with pytest.raises(SystemExit):
        main(["--comit"])


def test_recompress_photos_commit_requires_backup_confirmation():
    from app.source_analysis.recompress_photos import main

    with pytest.raises(SystemExit) as exc:
        main(["--commit"])
    assert "--backup-done" in str(exc.value)
