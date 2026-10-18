"""FEAT-06 홈·농가·팔로우, FEAT-15 농가 공개 소식."""

from sqlalchemy import update

from app.ai import service as ai
from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.core.detail import DetailContent, TextDetailBlock


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


def test_AC_02_4_farm_page_shows_products_and_detail_fallback(client, login):
    body = client.get("/api/farms/f-kang", headers=login("u-minji")).json()

    assert body["isFollowing"] is True
    assert body["followerCount"] == 128
    assert [p["productId"] for p in body["products"]] == ["p-house", "p-redhyang"]
    assert "latestNews" not in body
    assert "detailContent" not in body
    assert body["intro"].startswith("3대째")
    assert body["shareUrl"] == "http://testserver/s/farms/f-kang"


def test_AC_02_4_and_03_4_farm_detail_save_empty_and_draft_without_save(client, login):
    headers = login("u-kang")
    draft = client.post(
        "/api/farms/me/detail-draft",
        headers=headers,
        json={
            "inputText": "10월 12일 3만원 무료배송으로 만나요. 정성껏 돌본 이야기예요.",
            "photos": ["/photos/farmer.jpg"],
        },
    )

    assert draft.status_code == 200, draft.text
    assert draft.json()["mode"] == "mock"
    text = " ".join(
        block.get("body", "") for block in draft.json()["content"]["blocks"]
    )
    assert "3만원" not in text
    assert "10월" not in text
    assert "무료배송" not in text
    assert "detailContent" not in client.get("/api/farms/f-kang").json()

    saved = client.patch(
        "/api/farms/me", headers=headers, json={"detailContent": {"blocks": []}}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["detailContent"] == {"blocks": []}
    assert client.get("/api/farms/f-kang").json()["detailContent"] == {"blocks": []}


def test_AC_03_4_farm_detail_validation_and_authorization(client, login):
    duplicate = {
        "blocks": [
            {"id": "same", "type": "text", "title": "소개", "body": "내용"},
            {"id": "same", "type": "image", "uri": "/photos/a.jpg", "alt": "사진"},
        ]
    }
    response = client.patch(
        "/api/farms/me", headers=login("u-kang"), json={"detailContent": duplicate}
    )
    null_snake_case = client.patch(
        "/api/farms/me", headers=login("u-kang"), json={"detail_content": None}
    )
    assert response.status_code == 400
    assert null_snake_case.status_code == 400

    unapproved = client.post(
        "/api/farms/me/detail-draft",
        headers=login("u-misook"),
        json={"inputText": "농가 소개", "photos": []},
    )
    assert unapproved.status_code == 403


def test_AC_03_4_valid_ai_detail_is_returned_without_save(client, login, monkeypatch):
    generated = DetailContent(
        blocks=[
            TextDetailBlock(
                id="ai-story", type="text", title="농가 이야기", body="등록 정보로 만든 소개예요."
            )
        ]
    )
    monkeypatch.setattr(ai.get_settings(), "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai, "_call_detail_claude", lambda payload: generated)

    response = client.post(
        "/api/farms/me/detail-draft",
        headers=login("u-kang"),
        json={"inputText": "농가 이야기", "photos": []},
    )

    assert response.status_code == 200
    assert response.json() == {"content": generated.model_dump(by_alias=True), "mode": "ai"}
    assert "detailContent" not in client.get("/api/farms/f-kang").json()


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


def test_DEV_68_producer_registers_deposit_account(client, login):
    headers = login("u-kang")
    mine = client.get("/api/farms/me", headers=headers).json()
    assert mine["bankName"] == "제주은행" and mine["accountHolder"] == "강영수"

    partial = client.patch("/api/farms/me", headers=headers, json={"bankName": "농협"})
    assert partial.status_code == 400
    bad_number = client.patch(
        "/api/farms/me",
        headers=headers,
        json={"bankName": "농협", "accountNumber": "12-ab", "accountHolder": "강영수"},
    )
    assert bad_number.status_code == 400

    saved = client.patch(
        "/api/farms/me",
        headers=headers,
        json={"bankName": "농협", "accountNumber": "302-0123-4567-89", "accountHolder": "강영수"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["accountNumber"] == "302-0123-4567-89"
    # 공개 농가 페이지에는 계좌가 없다
    public = client.get("/api/farms/f-kang").json()
    assert "accountNumber" not in public and "bankName" not in public


def test_DEV_68_initial_capacity_request_needs_account(client, login):
    from sqlalchemy import update

    from app.core.db import get_sessionmaker
    from app.farms.models import Farm

    headers = login("u-kang")
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Farm).where(Farm.id == "f-kang").values(account_number=None))
    mine = client.get("/api/products/mine", headers=headers).json()
    items = mine["items"] if isinstance(mine, dict) else mine
    draft = next(
        p for p in items if p["status"] in ("DRAFT", "REJECTED") and p["approvedSupplyGrams"] == 0
    )
    product = client.get(f"/api/products/mine/{draft['productId']}", headers=headers).json()
    response = client.post(
        f"/api/products/{draft['productId']}/capacity-requests",
        headers=headers | {"Idempotency-Key": "dev68-no-account"},
        json={"requestedTotalGrams": 100_000, "version": product["version"]},
    )
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "NO_FARM_ACCOUNT"
