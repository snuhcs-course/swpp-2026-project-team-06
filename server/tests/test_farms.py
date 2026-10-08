"""FEAT-06 홈·농가·팔로우, FEAT-15 농가 공개 소식."""

from sqlalchemy import update

from app.catalog.models import Product
from app.core.db import get_sessionmaker


def test_home_has_hero_recommended_and_farm_cards(client):
    body = client.get("/api/home").json()

    assert body["hero"]["productId"] == "p-house"
    assert "news" not in body
    assert {f["farmId"] for f in body["farms"]} == {"f-kang", "f-halla", "f-hyodon", "f-namwon"}
    assert body["farms"][-1]["farmId"] == "f-namwon"
    assert body["farms"][-1]["featured"] is None


def test_AC_06_4_recommended_sorted_by_soonest_deadline(client):
    recommended = client.get("/api/home").json()["recommended"]

    # 레드향은 이번 단계 품절이라 빠진다. 하우스 감귤(10/12) → 효돈(10/16) → 노지(10/25)
    assert [c["productId"] for c in recommended] == ["p-house", "p-hyodon", "p-noji"]
    assert recommended[0]["dDay"] == 5
    assert recommended[0]["currentPrice"] == 29000
    assert recommended[0]["nextPrice"] == 33000
    assert recommended[0]["reservedCount"] == 37


def test_AC_06_5_home_without_products_on_sale(client):
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Product).values(status="CLOSED"))

    body = client.get("/api/home").json()

    assert body["recommended"] == []
    assert body["hero"]["productId"] is None
    assert len(body["farms"]) == 4


def test_farm_page_shows_products_and_latest_public_news(client, login):
    body = client.get("/api/farms/f-kang", headers=login("u-minji")).json()

    assert body["isFollowing"] is True
    assert body["followerCount"] == 128
    assert [p["productId"] for p in body["products"]] == ["p-house", "p-redhyang"]
    assert body["latestNews"]["broadcastId"] == "n-2"
    assert body["latestNews"]["myReaction"] is True
    assert body["shareUrl"] == "/s/farms/f-kang"


def test_AC_19_2_unapproved_farm_is_not_found(client):
    for farm_id in ("f-wimi", "f-reject", "f-stop", "f-none"):
        response = client.get(f"/api/farms/{farm_id}")
        assert response.status_code == 404
        assert response.json()["code"] == "NOT_FOUND"


def test_AC_06_3_follow_and_unfollow(client, login):
    headers = login("u-seojun")

    on = client.put("/api/farms/f-halla/follow", headers=headers)
    again = client.put("/api/farms/f-halla/follow", headers=headers)
    page = client.get("/api/farms/f-halla", headers=headers).json()
    off = client.delete("/api/farms/f-halla/follow", headers=headers)

    assert on.json() == {"following": True, "followerCount": 87}
    assert again.json() == {"following": True, "followerCount": 87}
    assert page["isFollowing"] is True
    assert off.json() == {"following": False, "followerCount": 86}


def test_follow_requires_consumer(client, login):
    assert client.put("/api/farms/f-kang/follow").status_code == 401
    response = client.put("/api/farms/f-kang/follow", headers=login("u-kang"))
    assert response.json()["details"]["reason"] == "WRONG_APP"


def test_AC_15_1_farm_news_only_public(client):
    body = client.get("/api/messaging/farms/f-kang/news").json()

    assert [n["broadcastId"] for n in body["items"]] == ["n-2"]
    assert body["items"][0]["reactionCount"] == 128
    assert body["items"][0]["myReaction"] is False
    assert body["nextCursor"] is None


def test_farm_news_pagination(client):
    first = client.get("/api/messaging/farms/f-kang/news", params={"limit": 1}).json()
    assert len(first["items"]) == 1

    bad = client.get("/api/messaging/farms/f-kang/news", params={"limit": 51})
    assert bad.status_code == 400
    assert bad.json()["code"] == "VALIDATION_ERROR"


def test_public_pages_ignore_stale_token(client):
    response = client.get("/api/farms/f-kang", headers={"Authorization": "Bearer expired"})

    assert response.status_code == 200
    assert response.json()["isFollowing"] is False
