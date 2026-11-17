"""DEV-341: light private photo previews (AC-SRC-6 copies, AC-SRC-5 ownership).

The lossless PNG stays the analysis/publication source; producers' screens get a display JPEG
(long edge <= 1600px) or a tile thumbnail, cacheable only in their own browser per revision.
"""

from uuid import uuid4

from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.source_analysis.models import Asset, Page
from app.source_analysis.photos import variant_key, variant_keys
from app.source_analysis.storage import Storage
from tests.test_source_analysis import PREFIX, create, source_settings  # noqa: F401
from tests.test_source_public_photo import WORKSPACES, opened, photo_bytes


def add_photo(client, h, batch, data, name="phone.jpg", mime="image/jpeg"):
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    response = client.post(
        f"{PREFIX}/{batch['id']}/sources",
        headers=h,
        data={"batchVersion": current["version"], "common": "true", "originalPhoto": "true"},
        files={"file": (name, data, mime)},
    )
    assert response.status_code == 201, response.text
    return response.json()


def image_url(batch, asset, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{PREFIX}/{batch['id']}/sources/{asset['id']}/pages/1/image" + (
        "?" + query if query else ""
    )


def page_of(asset_id):
    with get_sessionmaker()() as db:
        return db.scalar(select(Page).where(Page.asset_id == asset_id))


def test_AC_SRC_6_DEV_341_display_variant_is_small_jpeg_and_png_stays_for_analysis(client, login):
    h = login("u-kang")
    batch = create(client, h)
    phone = photo_bytes((4032, 3024), "JPEG", quality=92)
    asset = add_photo(client, h, batch, phone)
    assert asset["status"] == "PREPARED"
    version = f"{asset['revision']}.{asset['sanitizationVersion']}"

    original = client.get(image_url(batch, asset), headers=h)
    assert original.status_code == 200
    assert original.headers["content-type"] == "image/png"
    assert original.headers["cache-control"] == "no-store"  # unchanged original contract
    png = opened(original.content)
    assert png.format == "PNG" and png.size == (4032, 3024)

    display = client.get(image_url(batch, asset, variant="display", v=version), headers=h)
    assert display.status_code == 200
    assert display.headers["content-type"] == "image/jpeg"
    image = opened(display.content)
    assert image.format == "JPEG" and image.size == (1600, 1200)
    assert not image.getexif() and "icc_profile" not in image.info
    # The display copy is what the composer cover/editor download instead of the PNG.
    assert len(display.content) * 10 < len(original.content)

    # The analysis/publication source on storage is still the untouched lossless PNG.
    page = page_of(asset["id"])
    assert page.sanitized_key == page.image_key
    assert Storage().get(page.sanitized_key) == original.content
    # Previews were written at upload time, beside the PNG, under derived keys.
    for key in variant_keys(page.sanitized_key):
        assert Storage().get_optional(key) is not None


def test_AC_SRC_6_DEV_341_thumb_variant_fits_attachment_tiles(client, login):
    h = login("u-kang")
    batch = create(client, h)
    asset = add_photo(client, h, batch, photo_bytes((3024, 4032), "JPEG", quality=92))
    display = client.get(image_url(batch, asset, variant="display"), headers=h)
    thumb = client.get(image_url(batch, asset, variant="thumb"), headers=h)
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/jpeg"
    assert opened(thumb.content).size == (480, 640)
    assert len(thumb.content) * 4 < len(display.content)
    # Small photos are never enlarged.
    small = add_photo(client, h, batch, photo_bytes((300, 200), "PNG"), "small.png", "image/png")
    for variant in ("display", "thumb"):
        response = client.get(image_url(batch, small, variant=variant), headers=h)
        assert opened(response.content).size == (300, 200)


def test_AC_SRC_6_DEV_341_preview_cache_follows_revision_and_etag(client, login):
    h = login("u-kang")
    batch = create(client, h)
    asset = add_photo(client, h, batch, photo_bytes((800, 600), "JPEG"))
    current = f"{asset['revision']}.{asset['sanitizationVersion']}"
    fresh = client.get(image_url(batch, asset, variant="display", v=current), headers=h)
    assert fresh.headers["cache-control"] == "private, max-age=86400"
    assert "authorization" in fresh.headers["vary"].lower()
    tag = fresh.headers["etag"]
    assert tag.startswith('"') and "/" not in tag  # never the private storage key
    # Without (or with an old) revision the browser must revalidate.
    stale = client.get(image_url(batch, asset, variant="display", v="0.0"), headers=h)
    assert stale.status_code == 200 and stale.headers["cache-control"] == "private, no-cache"
    again = client.get(
        image_url(batch, asset, variant="display"), headers={**h, "If-None-Match": tag}
    )
    assert again.status_code == 304 and again.content == b""
    # Revalidation still checks the login and ownership before any 304.
    revalidate = {"If-None-Match": tag}
    assert (
        client.get(image_url(batch, asset, variant="display"), headers=revalidate).status_code
        == 401
    )
    minji = {**login("u-minji"), **revalidate}
    assert client.get(image_url(batch, asset, variant="display"), headers=minji).status_code == 403


def test_AC_SRC_5_DEV_341_preview_requires_owner_and_never_previews_unredacted(client, login):
    h = login("u-kang")
    batch = create(client, h)
    asset = add_photo(client, h, batch, photo_bytes((640, 480), "JPEG"))
    url = image_url(batch, asset, variant="display")
    assert client.get(url).status_code == 401
    assert client.get(url, headers=login("u-minji")).status_code == 403
    unredacted = client.get(image_url(batch, asset, variant="thumb", sanitized="false"), headers=h)
    assert unredacted.status_code == 400  # invalid(): never a preview of the raw page
    assert client.get(image_url(batch, asset, variant="huge"), headers=h).status_code == 400


def test_DEV_341_missing_preview_is_rebuilt_from_png(client, login):
    h = login("u-kang")
    batch = create(client, h)
    asset = add_photo(client, h, batch, photo_bytes((2000, 1500), "JPEG"))
    page = page_of(asset["id"])
    store = Storage()
    store.delete(variant_key(page.sanitized_key, "display"))  # e.g. uploaded before DEV-341
    response = client.get(image_url(batch, asset, variant="display"), headers=h)
    assert response.status_code == 200 and opened(response.content).size == (1600, 1200)
    assert store.get_optional(variant_key(page.sanitized_key, "display")) == response.content


def test_DEV_341_cleanup_keeps_live_previews_and_deletes_removed_ones(client, login, monkeypatch):
    import os
    import time

    from app.source_analysis import worker

    h = login("u-kang")
    batch = create(client, h)
    asset = add_photo(client, h, batch, photo_bytes((900, 600), "JPEG"))
    page = page_of(asset["id"])
    store = Storage()
    keys = [page.sanitized_key, *variant_keys(page.sanitized_key)]
    old = time.time() - 3 * 24 * 3600
    for key in keys:  # older than the 24h orphan window
        os.utime(store.path(key), (old, old))
    worker.cleanup()
    assert all(store.get_optional(k) is not None for k in keys)
    removed = client.delete(
        f"{PREFIX}/{batch['id']}/sources/{asset['id']}?version={asset['revision']}", headers=h
    )
    assert removed.status_code == 202, removed.text
    worker.cleanup()
    assert all(store.get_optional(k) is None for k in keys)
    with get_sessionmaker()() as db:
        assert db.get(Asset, asset["id"]).status == "DELETED"


def test_AC_SRC_11_DEV_341_workspace_photo_is_cacheable_for_its_owner(client, login):
    h = login("u-kang")
    client.post(
        WORKSPACES, headers={**h, "Idempotency-Key": str(uuid4())}, json={"productId": "p-house"}
    )
    added = client.post(
        WORKSPACES + "/p-house/photos",
        headers=h,
        files={"file": ("phone.jpg", photo_bytes((1600, 1200), "JPEG"), "image/jpeg")},
    )
    assert added.status_code == 201, added.text
    url = f"{WORKSPACES}/p-house/photos/{added.json()['uri'].rsplit('/', 1)[1]}"
    first = client.get(url, headers=h)
    assert first.headers["cache-control"] == "private, max-age=86400"
    assert "authorization" in first.headers["vary"].lower()
    assert client.get(url, headers={**h, "If-None-Match": first.headers["etag"]}).status_code == 304
    assert client.get(url, headers={"If-None-Match": first.headers["etag"]}).status_code == 401


def test_AC_SRC_11_DEV_341_workspace_upload_rejects_strangers_before_decoding(
    client, login, monkeypatch
):
    from app.source_analysis import photos

    h = login("u-kang")
    client.post(
        WORKSPACES, headers={**h, "Idempotency-Key": str(uuid4())}, json={"productId": "p-house"}
    )
    calls = []
    real = photos.public_photo
    monkeypatch.setattr(photos, "public_photo", lambda data: calls.append(1) or real(data))
    data = photo_bytes((400, 300), "JPEG")
    # A product without a workspace and another farm's product are refused without encoding.
    assert (
        client.post(
            WORKSPACES + "/p-other/photos", headers=h, files={"file": ("a.jpg", data, "image/jpeg")}
        ).status_code
        == 404
    )
    assert calls == []
    ok = client.post(
        WORKSPACES + "/p-house/photos", headers=h, files={"file": ("a.jpg", data, "image/jpeg")}
    )
    assert ok.status_code == 201 and calls == [1]


def test_AC_SRC_11_DEV_341_workspace_upload_encodes_before_taking_the_product_lock(
    client, login, monkeypatch
):
    from app.source_analysis import photos
    from app.source_analysis import workspace as w

    h = login("u-kang")
    client.post(
        WORKSPACES, headers={**h, "Idempotency-Key": str(uuid4())}, json={"productId": "p-house"}
    )
    order = []
    real_encode, real_owned = photos.public_photo, w.owned
    monkeypatch.setattr(
        photos, "public_photo", lambda data: order.append("encode") or real_encode(data)
    )
    monkeypatch.setattr(w, "owned", lambda *a: order.append("lock") or real_owned(*a))
    data = photo_bytes((400, 300), "JPEG")
    ok = client.post(
        WORKSPACES + "/p-house/photos", headers=h, files={"file": ("a.jpg", data, "image/jpeg")}
    )
    assert ok.status_code == 201, ok.text
    assert order == ["encode", "lock"]


def test_AC_SRC_11_DEV_341_workspace_upload_needs_an_open_workspace(client, login, monkeypatch):
    from app.source_analysis import photos

    calls = []
    monkeypatch.setattr(photos, "public_photo", lambda data: calls.append(1))
    response = client.post(
        WORKSPACES + "/p-house/photos",
        headers=login("u-kang"),
        files={"file": ("a.jpg", photo_bytes((40, 30), "JPEG"), "image/jpeg")},
    )
    assert response.status_code == 400 and "productId" in response.text
    assert calls == []


def test_AC_SRC_6_DEV_341_display_size_matches_the_dev_328_public_photo_sizes():
    """Display/public copies keep the old `thumbnail((1600, 1600))` sizes (no 1599px edges)."""
    import io

    from PIL import Image

    from app.source_analysis.photos import public_photo

    for size in [(4000, 3001), (3001, 4000), (4032, 3024), (1601, 999), (1600, 1200), (900, 700)]:
        expected = Image.new("RGB", size)
        expected.thumbnail((1600, 1600))
        data = io.BytesIO()
        Image.new("RGB", size, "orange").save(data, "PNG")
        assert opened(public_photo(data.getvalue())).size == expected.size, size


def test_DEV_341_middleware_keeps_only_the_exact_preview_cache_values():
    from starlette.applications import Starlette
    from starlette.responses import Response
    from starlette.routing import Route
    from starlette.testclient import TestClient

    from app.source_analysis.caching import PREVIEW_CACHE, PREVIEW_REVALIDATE
    from app.source_analysis.middleware import SourceRequestMiddleware

    def route(request):
        return Response(b"x", headers={"Cache-Control": request.query_params["cc"]})

    app = SourceRequestMiddleware(Starlette(routes=[Route("/api/source-analysis/x", route)]))
    with TestClient(app) as test:
        for value, expected in [
            (PREVIEW_CACHE, PREVIEW_CACHE),
            (PREVIEW_REVALIDATE, PREVIEW_REVALIDATE),
            ("private, max-age=31536000", "no-store"),
            ("public, max-age=60", "no-store"),
        ]:
            got = test.get("/api/source-analysis/x", params={"cc": value})
            assert got.headers["cache-control"] == expected, value
