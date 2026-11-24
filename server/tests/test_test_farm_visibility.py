"""DEV-472 · R-29: 테스트 계정 농가는 테스트 계정에게만 공개 경로에 나온다.

시드에서 강씨네 귤밭(f-kang)의 주인 u-kang은 시드 테스트 계정이고, 한라네(f-halla)의 주인
u-halla는 실사용자다. 테스트가 기본으로 켜 두는 시드 선택 로그인(MOCK_LOGIN_ENABLED)을 끈
운영과 같은 조건에서 본다. 토큰은 issue_token으로 바로 만든다.
"""

import pytest
from sqlalchemy import update

from app.accounts.models import User
from app.core import config
from app.core.db import get_sessionmaker
from app.core.security import issue_token


def bearer(user_id: str, role: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_token(user_id, role)}"}


def set_flags(user_id: str, **values) -> None:
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(User).where(User.id == user_id).values(**values))


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(config.get_settings(), "mock_login_enabled", False)


# 보는 사람: 비로그인, 실사용자 소비자(u-buyer-park), 시드 테스트 소비자(u-minji),
# 운영 검증 표시한 실사용자 소비자(u-buyer-choi)
ANON: dict[str, str] = {}


def viewers():
    set_flags("u-buyer-choi", ops_tester=True)
    return {
        "anon": ANON,
        "real": bearer("u-buyer-park", "CONSUMER"),
        "seed_test": bearer("u-minji", "CONSUMER"),
        "ops_tester": bearer("u-buyer-choi", "CONSUMER"),
    }


def home_ids(client, headers):
    body = client.get("/api/home", headers=headers).json()
    return {c["farmId"] for c in body["farms"]}, {c["farmId"] for c in body["recommended"]}


def list_ids(client, headers, q=None):
    params = {"q": q} if q else {}
    body = client.get("/api/farms", params=params, headers=headers).json()
    return {c["farmId"] for c in body["items"]}


def test_AC_06_10_home_list_and_search_hide_test_farms_from_anon_and_real(client, production):
    v = viewers()
    for name in ("anon", "real"):
        farms, recommended = home_ids(client, v[name])
        assert "f-kang" not in farms, name
        assert "f-kang" not in recommended, name
        assert "f-halla" in farms, name
        assert "f-kang" not in list_ids(client, v[name]), name
        # 농가명·상품명 검색으로도 나오지 않는다
        assert list_ids(client, v[name], "강씨네") == set(), name
        assert "f-kang" not in list_ids(client, v[name], "하우스"), name


def test_AC_06_10_test_viewers_see_test_farms(client, production):
    v = viewers()
    for name in ("seed_test", "ops_tester"):
        farms, recommended = home_ids(client, v[name])
        assert {"f-kang", "f-halla"} <= farms, name
        assert "f-kang" in recommended, name
        assert list_ids(client, v[name], "강씨네") == {"f-kang"}, name


def test_AC_06_10_ops_tester_producer_farm_is_test_farm(client, production):
    set_flags("u-halla", ops_tester=True)
    v = viewers()

    assert "f-halla" not in list_ids(client, v["anon"])
    assert "f-halla" not in list_ids(client, v["real"])
    assert client.get("/api/farms/f-halla").status_code == 404
    assert client.get("/api/products/p-noji").status_code == 404
    assert "f-halla" in list_ids(client, v["seed_test"])
    assert client.get("/api/products/p-noji", headers=v["ops_tester"]).status_code == 200


def test_AC_06_11_farm_detail_and_follow_are_404_for_non_testers(client, production):
    v = viewers()
    for name in ("anon", "real"):
        response = client.get("/api/farms/f-kang", headers=v[name])
        assert response.status_code == 404, name
        assert response.json()["code"] == "NOT_FOUND"
    # 정지 농가와 같은 404: 존재를 드러내지 않는다
    assert client.get("/api/farms/f-kang").json() == client.get("/api/farms/f-nope").json()
    assert client.put("/api/farms/f-kang/follow", headers=v["real"]).status_code in (403, 404)
    assert client.delete("/api/farms/f-kang/follow", headers=v["real"]).status_code == 404

    for name in ("seed_test", "ops_tester"):
        assert client.get("/api/farms/f-kang", headers=v[name]).status_code == 200, name


def test_AC_06_11_real_consumer_history_with_test_farm_matches_suspended_farm(client, production):
    """u-buyer-park(실사용자)는 시드에서 f-kang을 팔로우하고 대화·주문(o-35)이 있다."""
    headers = bearer("u-buyer-park", "CONSUMER")

    following = client.get("/api/farms/following", headers=headers).json()["items"]
    assert "f-kang" not in {f["farmId"] for f in following}
    chats = client.get("/api/messaging/chats", headers=headers).json()["items"]
    assert "f-kang" not in {c.get("farmId") for c in chats}
    rooms = client.get("/api/messaging/rooms", headers=headers).json()["items"]
    assert "f-kang" not in {r["farmId"] for r in rooms}
    news = client.get("/api/messaging/news", headers=headers).json()["items"]
    assert all(n["farmId"] != "f-kang" for n in news)
    assert client.get("/api/messaging/chats/f-kang/messages", headers=headers).status_code == 404

    # 주문 기록은 그대로 보인다(보수적으로, 주문 모듈은 바꾸지 않음)
    orders = client.get("/api/orders", headers=headers).json()["items"]
    assert "o-35" in {o["orderId"] for o in orders}
    assert client.get("/api/orders/o-35", headers=headers).status_code == 200


def test_AC_06_11_test_consumers_keep_uat_flow(client, production):
    """시드 테스트 소비자끼리는 보기·팔로우·대화가 그대로다."""
    headers = bearer("u-seojun", "CONSUMER")

    assert client.delete("/api/farms/f-kang/follow", headers=headers).status_code == 200
    assert client.put("/api/farms/f-kang/follow", headers=headers).status_code == 200
    following = client.get("/api/farms/following", headers=headers).json()["items"]
    assert "f-kang" in {f["farmId"] for f in following}
    chats = client.get("/api/messaging/chats", headers=headers).json()["items"]
    assert "f-kang" in {c.get("farmId") for c in chats}
    assert client.get("/api/messaging/chats/f-kang/messages", headers=headers).status_code == 200
    assert client.get("/api/products/p-house", headers=headers).status_code == 200


def test_AC_06_11_owner_producer_app_unchanged(client, production):
    producer = bearer("u-kang", "PRODUCER")

    mine = client.get("/api/farms/me", headers=producer)
    assert mine.status_code == 200
    assert mine.json()["status"] == "APPROVED"
    assert client.get("/api/products/mine", headers=producer).status_code == 200
    assert client.get("/api/messaging/producer/chats", headers=producer).status_code == 200
    # 주인은 테스트 계정이라 소비자 공개 화면에서도 자기 농가를 본다
    assert client.get("/api/farms/f-kang", headers=producer).status_code == 200


def test_AC_07_11_product_detail_is_404_for_non_testers(client, production):
    v = viewers()
    for name in ("anon", "real"):
        response = client.get("/api/products/p-house", headers=v[name])
        assert response.status_code == 404, name
    assert client.get("/api/products/p-noji").status_code == 200
    for name in ("seed_test", "ops_tester"):
        assert client.get("/api/products/p-house", headers=v[name]).status_code == 200, name


def test_AC_15_12_news_and_room_of_test_farm_are_hidden(client, production):
    v = viewers()
    for name in ("anon", "real"):
        assert client.get("/api/messaging/farms/f-kang/news", headers=v[name]).status_code == 404
        room = client.get("/api/messaging/rooms/f-kang/messages", headers=v[name])
        assert room.status_code == 404, name
    # 좋아요 해제(소비자 역할만 필요)도 없는 소식으로 본다
    assert client.delete("/api/messaging/news/n-2/reaction", headers=v["real"]).status_code == 404
    for name in ("seed_test", "ops_tester"):
        news = client.get("/api/messaging/farms/f-kang/news", headers=v[name])
        assert news.status_code == 200, name
        assert [n["broadcastId"] for n in news.json()["items"]] == ["n-2"]


def test_AC_19_4_share_page_of_test_farm_is_404(client, production):
    hidden = client.get("/s/farms/f-kang")
    assert hidden.status_code == 404
    assert "강씨네" not in hidden.text
    assert client.get("/s/farms/f-halla").status_code == 200


def test_R_29_seed_login_environment_shows_demo_farms(client):
    """시드 선택 로그인이 켜진 로컬·데모·CI는 데모 농가 주인부터 테스트 계정이라 숨기지 않는다."""
    assert config.get_settings().mock_login_enabled is True
    farms, _ = home_ids(client, ANON)
    assert "f-kang" in farms
    assert client.get("/api/products/p-house").status_code == 200
