"""FEAT-06 홈·농가·팔로우, FEAT-15 농가 공개 소식."""

from datetime import date

import pytest
from sqlalchemy import update

from app.ai import service as ai
from app.catalog.models import Product, Stage, StageAllocation
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

    # 예약 가능: 하우스 감귤(10/12) → 효돈(10/16) → 노지(10/25). 레드향은 이번 기간 품절이라
    # 예약 가능 상품 뒤에 남는다(AC-07-3, DEV-327).
    assert [c["productId"] for c in recommended] == ["p-house", "p-hyodon", "p-noji", "p-redhyang"]
    assert recommended[0]["dDay"] == 5
    assert recommended[0]["currentPrice"] == 29000
    assert recommended[0]["nextPrice"] == 33000
    assert recommended[0]["reservedCount"] == 37
    assert recommended[-1]["availability"] == "PERIOD_SOLD_OUT"
    assert recommended[-1]["soldOut"] is True


def test_AC_06_5_home_without_products_on_sale(client):
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Product).values(status="CLOSED"))

    body = client.get("/api/home").json()

    assert body["recommended"] == []
    assert body["hero"]["productId"] is None
    assert len(body["farms"]) == 4


def _set_product(product_id: str, **values) -> None:
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Product).where(Product.id == product_id).values(**values))


def _set_stages(product_id: str, starts_at: date, ends_at: date) -> None:
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Stage)
            .where(Stage.product_id == product_id)
            .values(starts_at=starts_at, ends_at=ends_at)
        )


def _farm(body: dict, farm_id: str) -> dict:
    return next(f for f in body["farms"] if f["farmId"] == farm_id)


def test_AC_07_3_paused_product_leaves_home_and_farm_featured(client):
    _set_product("p-house", sales_paused=True)

    body = client.get("/api/home").json()

    # R-27: 중지 상품은 홈 추천·히어로·농가 대표에서 빠진다. 품절(레드향)은 남는다(DEV-327).
    assert [c["productId"] for c in body["recommended"]] == ["p-hyodon", "p-noji", "p-redhyang"]
    assert body["hero"]["productId"] is None
    # 강씨네는 예약 가능 상품이 없어 이번 기간 품절인 레드향이 대표가 된다.
    assert _farm(body, "f-kang")["featured"]["productId"] == "p-redhyang"
    assert _farm(body, "f-kang")["featured"]["availability"] == "PERIOD_SOLD_OUT"


@pytest.mark.parametrize(
    ("change", "availability"),
    [
        (lambda: _set_stages("p-hyodon", date(2026, 12, 1), date(2026, 12, 31)), "NOT_OPEN"),
        (lambda: _set_stages("p-hyodon", date(2026, 9, 1), date(2026, 9, 30)), "ENDED"),
        (lambda: _set_product("p-hyodon", sales_paused=True), "PAUSED"),
    ],
)
def test_AC_07_3_paused_not_open_and_ended_still_leave_home_and_featured(
    client, change, availability
):
    change()

    assert client.get("/api/products/p-hyodon").json()["availability"] == availability
    body = client.get("/api/home").json()

    # DEV-327은 품절만 남긴다. 중지·예약 시작 전·예약 종료는 지금처럼 빠진다.
    assert "p-hyodon" not in [c["productId"] for c in body["recommended"]]
    assert _farm(body, "f-hyodon")["featured"] is None
    farms = client.get("/api/farms").json()["items"]
    assert next(f for f in farms if f["farmId"] == "f-hyodon")["featured"] is None


def test_AC_07_3_sold_out_stays_on_home_after_available(client):
    _set_product("p-house", sales_limit_grams=0)

    body = client.get("/api/home").json()

    # 예약 가능(효돈 10/16 → 노지 10/25) 뒤에 품절(하우스 10/12 총 한도 소진 → 레드향 기간 품절)
    recommended = body["recommended"]
    assert [c["productId"] for c in recommended] == ["p-hyodon", "p-noji", "p-house", "p-redhyang"]
    assert [c["availability"] for c in recommended] == [
        "AVAILABLE",
        "AVAILABLE",
        "TOTAL_SOLD_OUT",
        "PERIOD_SOLD_OUT",
    ]
    assert [c["soldOut"] for c in recommended] == [False, False, True, True]


def test_AC_07_3_hero_skips_sold_out_product(client):
    _set_product("p-house", sales_limit_grams=0)

    body = client.get("/api/home").json()

    # 히어로 상품(p-house)이 품절이면 추천에는 남아도 히어로 링크는 비운다.
    assert "p-house" in [c["productId"] for c in body["recommended"]]
    assert body["hero"]["productId"] is None


def test_AC_07_3_recommended_limit_keeps_available_first(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "home_recommend_limit", 3)

    recommended = client.get("/api/home").json()["recommended"]

    # 상위 N은 거른 뒤 자른다. 예약 가능 상품이 N개면 품절 상품은 밀려난다.
    assert [c["productId"] for c in recommended] == ["p-house", "p-hyodon", "p-noji"]


def test_AC_07_3_farm_featured_falls_back_to_sold_out_with_availability(client):
    _set_product("p-house", sales_limit_grams=0)

    body = client.get("/api/home").json()

    # 강씨네: 예약 가능 상품이 없으면 마감 임박순 첫 품절 상품(하우스 10/12)이 대표다.
    kang = _farm(body, "f-kang")["featured"]
    assert kang == {
        "productId": "p-house",
        "name": kang["name"],
        "currentPrice": 29000,
        "dDay": 5,
        "availability": "TOTAL_SOLD_OUT",
    }
    # 예약 가능 대표에도 availability가 실린다.
    assert _farm(body, "f-hyodon")["featured"]["availability"] == "AVAILABLE"


def test_AC_07_3_farm_featured_prefers_available_over_sooner_sold_out(client):
    # 하우스(10/12)는 총 한도 소진, 레드향(10/31)은 이번 기간 물량을 열어 예약 가능으로.
    _set_product("p-house", sales_limit_grams=0)
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(StageAllocation)
            .where(StageAllocation.stage_id == "st-redhyang-1")
            .values(quantity=10, reserved_count=0)
        )
    assert client.get("/api/products/p-redhyang").json()["availability"] == "AVAILABLE"

    kang = _farm(client.get("/api/home").json(), "f-kang")["featured"]

    # 마감이 더 이른 품절 상품보다 예약 가능 상품이 대표다.
    assert kang["productId"] == "p-redhyang"
    assert kang["availability"] == "AVAILABLE"


def test_AC_06_1_farms_with_sold_out_featured_sort_after_available(client):
    # 효돈(10/16)이 총 한도 소진이 되면 노지(10/25)만 파는 한라보다 아래, 대표 없는 남원보다 위.
    _set_product("p-hyodon", sales_limit_grams=0)

    farms = client.get("/api/farms").json()["items"]

    assert [f["farmId"] for f in farms] == ["f-kang", "f-halla", "f-hyodon", "f-namwon"]
    assert farms[2]["featured"]["productId"] == "p-hyodon"
    assert farms[2]["featured"]["availability"] == "TOTAL_SOLD_OUT"
    assert farms[3]["featured"] is None
    home = client.get("/api/home").json()
    assert [f["farmId"] for f in home["farms"]] == [f["farmId"] for f in farms]


def test_AC_07_3_paused_product_stays_on_farm_page(client):
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Product).where(Product.id == "p-house").values(sales_paused=True))

    products = client.get("/api/farms/f-kang").json()["products"]

    # R-27·AC-04-6: 중지 상품은 공개 화면에 남되 예약할 수 없게 보인다.
    house = next(p for p in products if p["productId"] == "p-house")
    assert house["availability"] == "PAUSED"
    assert house["soldOut"] is True
    assert house["nextStageStartsAt"] is None


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
    text = " ".join(block.get("body", "") for block in draft.json()["content"]["blocks"])
    assert "3만원" not in text
    assert "10월" not in text
    assert "무료배송" not in text
    assert "detailContent" not in client.get("/api/farms/f-kang").json()

    saved = client.patch("/api/farms/me", headers=headers, json={"detailContent": {"blocks": []}})
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

    assert on.json() == {
        "following": True,
        "followerCount": 87,
        "firstFollow": True,
        "fanNumber": 2,
    }
    assert again.json() == {
        "following": True,
        "followerCount": 87,
        "firstFollow": False,
        "fanNumber": 2,
    }
    assert page["isFollowing"] is True
    assert off.json() == {
        "following": False,
        "followerCount": 86,
        "firstFollow": False,
        "fanNumber": 2,
    }


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


# ---- 농가 목록·검색, 팔로우 목록 (DEV-60) ----


def test_AC_06_3_following_list_shows_followed_farms_newest_first(client, login):
    headers = login("u-seojun")
    before = client.get("/api/farms/following", headers=headers).json()
    client.put("/api/farms/f-halla/follow", headers=headers)
    client.put("/api/farms/f-kang/follow", headers=headers)

    page = client.get("/api/farms/following", headers=headers).json()

    ids = [f["farmId"] for f in page["items"]]
    # 테스트는 고정 시각이라 created_at이 같다 → 농가 ID 순. 두 농가가 맨 위에 온다
    assert sorted(ids[:2]) == ["f-halla", "f-kang"]
    assert set(ids) >= set(f["farmId"] for f in before["items"])
    assert set(page["items"][0]) == {"farmId", "name", "region", "photo", "followerCount"}
    assert page["nextCursor"] is None

    client.delete("/api/farms/f-halla/follow", headers=headers)
    after = [
        f["farmId"] for f in client.get("/api/farms/following", headers=headers).json()["items"]
    ]
    assert "f-halla" not in after


def test_following_list_pages_with_cursor(client, login):
    headers = login("u-seojun")
    for farm_id in ("f-halla", "f-kang"):
        client.put(f"/api/farms/{farm_id}/follow", headers=headers)

    first = client.get("/api/farms/following", params={"limit": 1}, headers=headers).json()
    assert len(first["items"]) == 1 and first["nextCursor"]
    second = client.get(
        "/api/farms/following", params={"limit": 1, "cursor": first["nextCursor"]}, headers=headers
    ).json()
    assert len(second["items"]) == 1
    assert second["items"][0]["farmId"] != first["items"][0]["farmId"]


def test_following_list_requires_consumer(client, login):
    assert client.get("/api/farms/following").status_code == 401
    response = client.get("/api/farms/following", headers=login("u-kang"))
    assert response.status_code == 403
    assert response.json()["details"]["reason"] == "WRONG_APP"


def test_AC_06_1_farm_list_sorted_by_soonest_deadline_and_searchable(client):
    page = client.get("/api/farms").json()

    cards = page["items"]
    assert cards and all(
        set(c) >= {"farmId", "name", "region", "followerCount", "featured"} for c in cards
    )
    home = client.get("/api/home").json()
    assert [c["farmId"] for c in cards][: len(home["farms"])] == [
        c["farmId"] for c in home["farms"]
    ]
    with_featured = [c for c in cards if c["featured"]]
    assert [c["featured"]["dDay"] for c in with_featured] == sorted(
        c["featured"]["dDay"] for c in with_featured
    )
    assert all(c["featured"] is None for c in cards[len(with_featured) :])

    by_name = client.get("/api/farms", params={"q": " 강씨네 "}).json()["items"]
    assert [c["farmId"] for c in by_name] == ["f-kang"]
    by_region = client.get("/api/farms", params={"q": "제주"}).json()["items"]
    assert len(by_region) >= 2
    none = client.get("/api/farms", params={"q": "없는농가zzz"}).json()
    assert none == {"items": [], "nextCursor": None}


def test_AC_06_2_search_matches_variety_of_products_on_sale(client):
    # 품종만 궁천조생이고 농가명·주 품목·상품명에는 없다(p-house·p-hyodon, DEV-217)
    found = client.get("/api/farms", params={"q": "궁천조생"}).json()["items"]
    assert [c["farmId"] for c in found] == ["f-kang", "f-hyodon"]
    assert all("variety" not in c["featured"] for c in found)
    partial = client.get("/api/farms", params={"q": "온주"}).json()["items"]
    assert [c["farmId"] for c in partial] == ["f-halla"]

    # 판매 일시 중지 상품은 공개 화면에 남으므로(R-27) 품종으로 계속 찾는다
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Product).where(Product.id == "p-noji").values(sales_paused=True))
    paused = client.get("/api/farms", params={"q": "온주"}).json()["items"]
    assert [c["farmId"] for c in paused] == ["f-halla"]


def test_AC_06_2_search_ignores_variety_of_products_not_on_sale(client):
    # 강씨네의 반려(천혜향)·승인 대기(청견)·초안(한라봉) 상품 품종으로는 찾지 않는다
    for q in ["천혜향", "청견", "한라봉"]:
        assert client.get("/api/farms", params={"q": q}).json()["items"] == [], q

    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Product).where(Product.id == "p-cheonggyeon").values(status="PUBLISHED")
        )
        session.execute(update(Product).where(Product.id == "p-noji").values(status="CLOSED"))
    # 게시되면 찾고, 판매가 끝나면(CLOSED) 품종으로 더는 찾지 않는다
    published = client.get("/api/farms", params={"q": "청견"}).json()["items"]
    assert [c["farmId"] for c in published] == ["f-kang"]
    assert client.get("/api/farms", params={"q": "온주"}).json()["items"] == []


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
