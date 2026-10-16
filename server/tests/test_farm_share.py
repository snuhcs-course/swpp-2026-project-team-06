"""FEAT-19 / P04: real public share URL, previews, and approval visibility."""

from html.parser import HTMLParser

from app.core.db import get_sessionmaker
from app.farms.models import Farm


class Metadata(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.meta = {}
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[attrs.get("property", attrs.get("http-equiv"))] = attrs.get("content")
        if tag == "a":
            self.links.append(attrs.get("href"))


def test_AC_19_1_3_absolute_share_url_and_public_metadata(client, login):
    headers = login("u-kang")
    mine = client.get("/api/farms/me", headers=headers).json()
    public = client.get("/api/farms/f-kang").json()
    patched = client.patch("/api/farms/me", headers=headers, json={"intro": "새 소개"}).json()
    assert mine["shareUrl"] == public["shareUrl"] == patched["shareUrl"]
    assert public["shareUrl"] == "http://testserver/s/farms/f-kang"
    response = client.get(public["shareUrl"])
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    metadata = Metadata(response.text)
    assert metadata.meta["og:title"] == "강씨네 귤밭"
    assert metadata.meta["og:description"] == "새 소개"
    assert metadata.meta["og:image"].startswith("http://localhost:8081/")
    assert metadata.meta["og:url"] == mine["shareUrl"]
    assert metadata.meta["refresh"] == "0;url=http://localhost:8081/farms/f-kang"


def test_AC_19_2_revoked_and_unknown_links_hide_farm_metadata(client, login):
    link = client.get("/api/farms/me", headers=login("u-kang")).json()["shareUrl"]
    assert client.get(link).status_code == 200
    with get_sessionmaker()() as session, session.begin():
        session.get(Farm, "f-kang").approval_status = "SUSPENDED"
    for farm_id in ("f-kang", "f-wimi", "f-reject", "f-stop", "f-none"):
        response = client.get(f"/s/farms/{farm_id}")
        assert response.status_code == 404
        assert response.headers["cache-control"] == "no-store"
        assert "찾을 수 없는 농가" in response.text
        assert "강씨네" not in response.text
        metadata = Metadata(response.text)
        assert "og:title" not in metadata.meta
        assert metadata.links == ["http://localhost:8081/farms"]
    assert client.get("/api/farms/me", headers=login("u-kang")).json()["shareUrl"] is None


def test_AC_19_3_share_metadata_escapes_text_and_omits_non_http_images(client):
    name = '\"><script>alert(1)</script>'
    with get_sessionmaker()() as session, session.begin():
        farm = session.get(Farm, "f-kang")
        farm.name = name
        farm.intro = '<img src=x onerror="alert(2)">'
        farm.photo = "javascript:alert(3)"
    response = client.get("/s/farms/f-kang")
    assert response.status_code == 200
    assert "<script>" not in response.text
    assert "<img src=x" not in response.text
    metadata = Metadata(response.text)
    assert metadata.meta["og:title"] == name
    assert "og:image" not in metadata.meta
