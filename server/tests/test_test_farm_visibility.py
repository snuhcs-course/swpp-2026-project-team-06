"""DEV-472 · R-29: 테스트 계정 농가는 테스트 계정에게만 공개 경로에 나오고 주문된다.

시드에서 강씨네 귤밭(f-kang)의 주인 u-kang은 시드 테스트 계정이고, 한라네(f-halla)의 주인
u-halla는 실사용자다. 실사용자 소비자 u-buyer-park는 시드에서 f-kang을 팔로우하고 대화·주문(o-35)이
있다. 테스트가 기본으로 켜 두는 시드 선택 로그인(MOCK_LOGIN_ENABLED)을 끈 운영과 같은 조건에서
본다. 토큰은 issue_token으로 바로 만든다.
"""

import uuid

import pytest
from sqlalchemy import select, update

from app.accounts.models import User
from app.accounts.schemas import CONSENT_VERSION, REQUIRED_CONSENTS
from app.core import config
from app.core.db import get_sessionmaker
from app.core.security import issue_token
from app.messaging.models import Thread
from app.source_analysis.models import PublicPhoto
from app.source_analysis.storage import Storage
from tests.test_orders import order_body
from tests.test_settings_inquiries import png, upload

FARM_GONE = "찾을 수 없는 농가예요."


def bearer(user_id: str, role: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_token(user_id, role)}"}


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def set_flags(user_id: str, **values) -> None:
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(User).where(User.id == user_id).values(**values))


def thread_id(farm_id: str, consumer_id: str) -> str:
    with get_sessionmaker()() as session:
        return session.scalar(
            select(Thread.id).where(Thread.farm_id == farm_id, Thread.consumer_id == consumer_id)
        )


def onboard(client, user_id: str) -> dict[str, str]:
    """실사용자 소비자의 가입 온보딩(닉네임·연락처·필수 동의)을 마친다."""
    set_flags(user_id, nickname=f"닉{user_id[-3:]}", phone="010-0000-0000")
    headers = bearer(user_id, "CONSUMER")
    consents = [{"kind": kind, "version": CONSENT_VERSION} for kind in REQUIRED_CONSENTS]
    saved = client.post("/api/auth/me/consents", json={"consents": consents}, headers=headers)
    assert saved.status_code == 200, saved.text
    return headers


def producer_consented(client, user_id: str) -> dict[str, str]:
    """실사용자 생산자(u-halla)는 지금 버전 약관 동의가 있어야 생산자 API를 쓴다(DEV-113)."""
    from app.accounts.schemas import REQUIRED_PRODUCER_CONSENTS

    headers = bearer(user_id, "PRODUCER")
    consents = [{"kind": k, "version": CONSENT_VERSION} for k in REQUIRED_PRODUCER_CONSENTS]
    saved = client.post("/api/auth/me/consents", json={"consents": consents}, headers=headers)
    assert saved.status_code == 200, saved.text
    return headers


def seed_env(monkeypatch, on: bool) -> None:
    monkeypatch.setattr(config.get_settings(), "mock_login_enabled", on)


@pytest.fixture
def production(monkeypatch):
    seed_env(monkeypatch, False)


@pytest.fixture
def viewers(client, monkeypatch):
    """보는 사람 넷. 운영 검증 소비자(u-buyer-choi)는 f-kang을 팔로우하고 대화를 연 상태로 만든다.

    실사용자(u-buyer-park)는 온보딩을 마쳐 관문(403)이 아니라 농가 확인(404)에 걸린다.
    """
    set_flags("u-buyer-choi", ops_tester=True)
    real = onboard(client, "u-buyer-park")
    ops = onboard(client, "u-buyer-choi")
    seed_env(monkeypatch, False)
    started = client.post("/api/messaging/chats", headers=ops | key(), json={"farmId": "f-kang"})
    assert started.status_code == 200, started.text
    asked = client.post(
        "/api/messaging/chats/f-kang/messages", headers=ops | key(), json={"text": "안녕하세요"}
    )
    assert asked.status_code == 200, asked.text
    return {
        "anon": {},
        "real": real,
        "seed_test": bearer("u-minji", "CONSUMER"),
        "ops_tester": ops,
    }


HIDDEN_TO = ("anon", "real")
SHOWN_TO = ("seed_test", "ops_tester")


# ---- 목록·검색·추천 (AC-06-10) ----


def home_ids(client, headers):
    body = client.get("/api/home", headers=headers).json()
    return {c["farmId"] for c in body["farms"]}, {c["farmId"] for c in body["recommended"]}


def list_ids(client, headers, q=None):
    params = {"q": q} if q else {}
    body = client.get("/api/farms", params=params, headers=headers).json()
    return {c["farmId"] for c in body["items"]}


@pytest.mark.parametrize("name", HIDDEN_TO)
def test_AC_06_10_home_list_and_search_hide_test_farms(client, viewers, name):
    farms, recommended = home_ids(client, viewers[name])
    assert "f-kang" not in farms and "f-kang" not in recommended
    assert "f-halla" in farms
    assert "f-kang" not in list_ids(client, viewers[name])
    assert list_ids(client, viewers[name], "강씨네") == set()
    assert "f-kang" not in list_ids(client, viewers[name], "하우스")


@pytest.mark.parametrize("name", SHOWN_TO)
def test_AC_06_10_test_viewers_see_test_farms(client, viewers, name):
    farms, recommended = home_ids(client, viewers[name])
    assert {"f-kang", "f-halla"} <= farms
    assert "f-kang" in recommended
    assert list_ids(client, viewers[name], "강씨네") == {"f-kang"}


def test_AC_06_10_home_hero_caption_hides_test_farm_name(client, viewers):
    """히어로 문구는 히어로 상품(p-house, 강씨네 귤밭)의 이름이다."""
    for name in HIDDEN_TO:
        hero = client.get("/api/home", headers=viewers[name]).json()["hero"]
        assert hero["productId"] is None and hero["caption"] == "", name
        assert hero["title"] and hero["photo"], name
    for name in SHOWN_TO:
        hero = client.get("/api/home", headers=viewers[name]).json()["hero"]
        assert hero["productId"] == "p-house" and "강씨네" in hero["caption"], name


def test_AC_06_10_ops_tester_producer_farm_is_test_farm(client, viewers):
    set_flags("u-halla", ops_tester=True)
    for name in HIDDEN_TO:
        assert "f-halla" not in list_ids(client, viewers[name]), name
        assert client.get("/api/farms/f-halla", headers=viewers[name]).status_code == 404
        assert client.get("/api/products/p-noji", headers=viewers[name]).status_code == 404
    for name in SHOWN_TO:
        assert "f-halla" in list_ids(client, viewers[name]), name
        assert client.get("/api/products/p-noji", headers=viewers[name]).status_code == 200

    # 그 생산자 본인의 생산자 앱은 그대로, 공유 링크만 비운다(누구에게나 404인 링크라서)
    producer = producer_consented(client, "u-halla")
    mine = client.get("/api/farms/me", headers=producer)
    assert mine.status_code == 200
    assert mine.json()["status"] == "APPROVED" and mine.json().get("shareUrl") is None
    assert client.get("/api/products/mine", headers=producer).status_code == 200


# ---- 경로 × 보는 사람 (AC-06-11, AC-07-12, AC-15-15) ----
# (이름, 메서드, 경로, 본문, 로그인 필요, 숨김일 때 메시지 — None이면 없는 자원과 같은 404만 본다)
ROUTES = [
    ("farm_detail", "GET", "/api/farms/f-kang", None, False, FARM_GONE),
    ("product_detail", "GET", "/api/products/p-house", None, False, "판매 중이 아닌 상품이에요."),
    ("farm_news", "GET", "/api/messaging/farms/f-kang/news", None, False, FARM_GONE),
    (
        "room_read",
        "GET",
        "/api/messaging/rooms/f-kang/messages",
        None,
        False,
        "지금은 이 농가의 소식방을 열 수 없어요.",
    ),
    ("follow", "PUT", "/api/farms/f-kang/follow", None, True, FARM_GONE),
    ("unfollow", "DELETE", "/api/farms/f-kang/follow", None, True, FARM_GONE),
    ("chat_start", "POST", "/api/messaging/chats", {"farmId": "f-kang"}, True, FARM_GONE),
    ("chat_page", "GET", "/api/messaging/chats/f-kang/messages", None, True, FARM_GONE),
    (
        "chat_send",
        "POST",
        "/api/messaging/chats/f-kang/messages",
        {"text": "언제 보내 주세요?"},
        True,
        FARM_GONE,
    ),
    ("chat_read", "PUT", "/api/messaging/chats/f-kang/read", "LAST_CHAT", True, FARM_GONE),
    ("chat_report", "POST", "/api/messaging/chats/f-kang/messages/m-x/report", None, True, None),
    (
        "room_send",
        "POST",
        "/api/messaging/rooms/f-kang/messages",
        {"text": "응원해요"},
        True,
        "지금은 이 농가의 소식방을 열 수 없어요.",
    ),
    (
        "room_mark_read",
        "PUT",
        "/api/messaging/rooms/f-kang/read",
        {"lastReadMessageId": "n-2"},
        True,
        "지금은 이 농가의 소식방을 열 수 없어요.",
    ),
    ("like", "PUT", "/api/messaging/news/n-2/reaction", None, True, "볼 수 없는 소식이에요."),
    ("unlike", "DELETE", "/api/messaging/news/n-2/reaction", None, True, "볼 수 없는 소식이에요."),
    ("order", "POST", "/api/orders", "ORDER", True, "판매 중이 아닌 상품이에요."),
]


def call(client, method, path, body, headers):
    if body == "ORDER":
        body = order_body(recipientName="박구매")
    if body == "LAST_CHAT":
        page = client.get("/api/messaging/chats/f-kang/messages", headers=headers).json()
        items = page.get("items") or []
        body = {"lastReadMessageId": items[0]["messageId"] if items else "m-x"}
    kwargs = {"headers": headers | (key() if method != "GET" else {})}
    if body is not None:
        kwargs["json"] = body
    return client.request(method, path, **kwargs)


@pytest.mark.parametrize("name", HIDDEN_TO)
@pytest.mark.parametrize("route", ROUTES, ids=[r[0] for r in ROUTES])
def test_AC_06_11_routes_answer_404_to_non_testers(client, viewers, route, name):
    label, method, path, body, needs_login, message = route
    response = call(client, method, path, body, viewers[name])
    if needs_login and name == "anon":
        # 로그인이 필요한 경로는 농가 확인 전에 권한 관문(401)에서 멈춘다
        assert response.status_code == 401, (label, response.text)
        return
    assert response.status_code == 404, (label, response.text)
    if message is not None:
        assert response.json()["message"] == message, label


@pytest.mark.parametrize("name", SHOWN_TO)
@pytest.mark.parametrize(
    "route",
    [r for r in ROUTES if r[0] != "chat_report"],
    ids=[r[0] for r in ROUTES if r[0] != "chat_report"],
)
def test_AC_06_11_routes_work_for_test_accounts(client, viewers, route, name):
    label, method, path, body, _, _ = route
    response = call(client, method, path, body, viewers[name])
    assert response.status_code == 200 or response.status_code == 204, (label, response.text)


def test_AC_06_11_hidden_answer_matches_missing_resource(client, viewers):
    """숨김은 없는 자원과 같은 응답이라 존재를 드러내지 않는다."""
    assert client.get("/api/farms/f-kang").json() == client.get("/api/farms/f-nope").json()
    real = viewers["real"]
    hidden = client.post("/api/orders", headers=real | key(), json=order_body())
    missing = client.post("/api/orders", headers=real | key(), json=order_body(productId="p-nope"))
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()


def test_AC_06_11_real_consumer_history_matches_suspended_farm(client, viewers):
    headers = viewers["real"]

    following = client.get("/api/farms/following", headers=headers).json()["items"]
    assert "f-kang" not in {f["farmId"] for f in following}
    chats = client.get("/api/messaging/chats", headers=headers).json()["items"]
    assert "f-kang" not in {c.get("farmId") for c in chats}
    rooms = client.get("/api/messaging/rooms", headers=headers).json()["items"]
    assert "f-kang" not in {r["farmId"] for r in rooms}
    news = client.get("/api/messaging/news", headers=headers).json()["items"]
    assert all(n["farmId"] != "f-kang" for n in news)

    # 주문 기록·지난 문의는 그대로 보이고, 새 주문 문의는 정지 농가처럼 404
    orders = client.get("/api/orders", headers=headers).json()["items"]
    assert "o-35" in {o["orderId"] for o in orders}
    assert client.get("/api/orders/o-35", headers=headers).status_code == 200
    assert client.get("/api/orders/o-35/inquiries", headers=headers).status_code == 200
    inquiry = client.post(
        "/api/orders/o-35/inquiries",
        headers=headers | key(),
        json={"type": "DAMAGE", "text": "받은 상자가 찌그러졌어요"},
    )
    assert inquiry.status_code == 404
    assert inquiry.json()["message"] == "지금은 이 농가에 문의할 수 없어요."


def test_AC_06_11_same_history_is_listed_in_seed_environment(client, viewers, monkeypatch):
    """위 검사가 빈 목록을 보고 통과한 것이 아님을 확인한다: 거르지 않으면 f-kang이 있다."""
    seed_env(monkeypatch, True)
    headers = viewers["real"]
    following = client.get("/api/farms/following", headers=headers).json()["items"]
    assert "f-kang" in {f["farmId"] for f in following}
    chats = client.get("/api/messaging/chats", headers=headers).json()["items"]
    assert "f-kang" in {c.get("farmId") for c in chats}
    rooms = client.get("/api/messaging/rooms", headers=headers).json()["items"]
    assert "f-kang" in {r["farmId"] for r in rooms}


def test_AC_06_11_chat_attachment_of_hidden_farm(client, monkeypatch):
    """대화에 보낸 사진: 일반 소비자는 404, 테스트 소비자는 그대로 본다."""
    real = onboard(client, "u-buyer-park")
    tester = bearer("u-minji", "CONSUMER")
    sent = {}
    for name, headers, consumer in (("real", real, "u-buyer-park"), ("test", tester, "u-minji")):
        photo = upload(client, headers, png(), threadId=thread_id("f-kang", consumer))
        assert photo.status_code == 200, photo.text
        aid = photo.json()["attachmentId"]
        message = client.post(
            "/api/messaging/chats/f-kang/messages",
            headers=headers | key(),
            json={"text": "사진이에요", "attachmentIds": [aid]},
        )
        assert message.status_code == 200, message.text
        sent[name] = aid
    seed_env(monkeypatch, False)

    hidden = client.get(f"/api/messaging/attachments/{sent['real']}", headers=real)
    missing = client.get("/api/messaging/attachments/att-nope", headers=real)
    assert hidden.status_code == 404 and hidden.json() == missing.json()
    shown = client.get(f"/api/messaging/attachments/{sent['test']}", headers=tester)
    assert shown.status_code == 200


def test_AC_15_15_room_reply_photo_of_hidden_farm(client, monkeypatch):
    """소식방 비공개 답장 사진(DEV-467): 올리기·보기 모두 일반 소비자 404, 테스트 소비자 그대로."""
    real = onboard(client, "u-buyer-park")
    tester = bearer("u-minji", "CONSUMER")
    sent = {}
    for name, headers in (("real", real), ("test", tester)):
        photo = upload(client, headers, png(), roomFarmId="f-kang")
        assert photo.status_code == 200, photo.text
        aid = photo.json()["attachmentId"]
        reply = client.post(
            "/api/messaging/rooms/f-kang/messages",
            headers=headers | key(),
            json={"text": "", "broadcastId": "n-1", "attachmentIds": [aid]},
        )
        assert reply.status_code == 200, reply.text
        sent[name] = aid
    seed_env(monkeypatch, False)

    hidden = client.get(f"/api/messaging/attachments/{sent['real']}", headers=real)
    missing = client.get("/api/messaging/attachments/att-nope", headers=real)
    assert hidden.status_code == 404 and hidden.json() == missing.json()
    assert (
        client.get(f"/api/messaging/attachments/{sent['test']}", headers=tester).status_code == 200
    )
    # 농가 생산자(테스트 계정)는 자기 소식방 답장 사진을 그대로 본다
    producer = bearer("u-kang", "PRODUCER")
    assert (
        client.get(f"/api/messaging/attachments/{sent['real']}", headers=producer).status_code
        == 200
    )

    blocked = upload(client, real, png(), roomFarmId="f-kang")
    assert blocked.status_code == 404
    assert blocked.json()["message"] == "지금은 이 농가의 소식방을 열 수 없어요."
    assert upload(client, tester, png(), roomFarmId="f-kang").status_code == 200


def test_AC_06_11_test_consumers_keep_uat_flow(client, production):
    """시드 테스트 소비자끼리는 보기·팔로우·대화·주문이 그대로다."""
    headers = bearer("u-seojun", "CONSUMER")

    assert client.delete("/api/farms/f-kang/follow", headers=headers).status_code == 200
    assert client.put("/api/farms/f-kang/follow", headers=headers).status_code == 200
    following = client.get("/api/farms/following", headers=headers).json()["items"]
    assert "f-kang" in {f["farmId"] for f in following}
    chats = client.get("/api/messaging/chats", headers=headers).json()["items"]
    assert "f-kang" in {c.get("farmId") for c in chats}
    order = client.post("/api/orders", headers=headers | key(), json=order_body())
    assert order.status_code == 200, order.text
    assert client.get(f"/api/orders/{order.json()['orderId']}", headers=headers).status_code == 200


def test_AC_06_11_owner_producer_app_unchanged(client, production):
    producer = bearer("u-kang", "PRODUCER")

    mine = client.get("/api/farms/me", headers=producer)
    assert mine.status_code == 200
    assert mine.json()["status"] == "APPROVED"
    # 공유 페이지는 로그인 없이 열려 테스트 농가는 누구에게나 404다. 그런 링크는 주지 않는다
    assert mine.json().get("shareUrl") is None
    assert client.get("/api/products/mine", headers=producer).status_code == 200
    assert client.get("/api/messaging/producer/chats", headers=producer).status_code == 200
    assert client.get("/api/orders/producer/dashboard", headers=producer).status_code == 200
    # 주인은 테스트 계정이라 소비자 공개 화면에서도 자기 농가를 본다
    assert client.get("/api/farms/f-kang", headers=producer).status_code == 200
    # 실사용자 농가의 공유 링크는 그대로
    halla = client.get("/api/farms/me", headers=producer_consented(client, "u-halla")).json()
    assert halla["shareUrl"].endswith("/s/farms/f-halla")


def test_AC_07_12_public_photo_follows_approval_only(client, production):
    """공개 사진은 <img>가 인증 헤더를 보내지 않아 보는 사람을 모른다. 승인 상태만 본다(의도)."""
    from app.catalog.models import Product

    with get_sessionmaker()() as db:
        photo = PublicPhoto(product_id="p-house", storage_key=Storage().put(png()))
        db.add(photo)
        db.flush()
        product = db.get(Product, "p-house")
        product.photos = [f"/api/source-media/{photo.id}", *product.photos]
        uri = product.photos[0]
        db.commit()
    assert client.get("/api/products/p-house").status_code == 404
    assert client.get(uri).status_code == 200


def test_AC_19_4_share_page_of_test_farm_is_404(client, production):
    hidden = client.get("/s/farms/f-kang")
    assert hidden.status_code == 404
    assert "강씨네" not in hidden.text
    assert client.get("/s/farms/f-halla").status_code == 200


# ---- 거르지 않는 환경 (R-29) ----


def test_R_29_local_seed_login_environment_shows_demo_farms(client):
    """로컬이면서 시드 선택 로그인이 켜진 환경(pytest·데모·Playwright)은 거르지 않는다."""
    settings = config.get_settings()
    assert settings.app_env == "local" and settings.mock_login_enabled is True
    farms, _ = home_ids(client, {})
    assert "f-kang" in farms
    assert client.get("/api/products/p-house").status_code == 200
    assert client.get("/api/farms/me", headers=bearer("u-kang", "PRODUCER")).json()["shareUrl"]


def test_R_29_production_filters_even_with_seed_login_on(client, monkeypatch):
    """운영(APP_ENV=production)은 UAT 때 MOCK_LOGIN_ENABLED를 켜도(DEV-305) 거른다."""
    monkeypatch.setattr(config.get_settings(), "app_env", "production")
    assert config.get_settings().mock_login_enabled is True
    farms, _ = home_ids(client, {})
    assert "f-kang" not in farms
    assert client.get("/api/products/p-house").status_code == 404
    assert (
        client.get("/api/products/p-house", headers=bearer("u-minji", "CONSUMER")).status_code
        == 200
    )


# ---- 상품별 숨김(DEV-479)과 테스트 농가 숨김(R-29)의 조합 ----


def product_version(product_id: str) -> int:
    from app.catalog.models import Product

    with get_sessionmaker()() as session:
        return session.get(Product, product_id).version


def set_hidden(client, admin_headers, product_id: str, hidden: bool):
    response = client.post(
        f"/admin/products/{product_id}/visibility",
        headers=admin_headers | key(),
        json={"isHidden": hidden, "version": product_version(product_id), "reason": "조합 시험"},
    )
    assert response.status_code == 200, response.text


def card_ids(client, headers):
    body = client.get("/api/home", headers=headers).json()
    products = {c["productId"] for c in body["recommended"]}
    detail_products = set()
    for farm_id in ("f-kang", "f-halla"):
        page = client.get(f"/api/farms/{farm_id}", headers=headers)
        if page.status_code == 200:
            detail_products |= {p["productId"] for p in page.json()["products"]}
    return products | detail_products


@pytest.mark.parametrize("name", HIDDEN_TO + SHOWN_TO)
def test_AC_07_12_product_hidden_by_operator_stays_hidden_for_every_viewer(
    client, viewers, admin_headers, name
):
    """숨긴 상품은 누구에게도(테스트 계정 포함), 테스트 농가 상품은 테스트 계정에게만."""
    set_hidden(client, admin_headers, "p-noji", True)  # 실사용자 농가(f-halla)의 상품
    set_hidden(client, admin_headers, "p-house", True)  # 테스트 농가(f-kang)의 상품
    headers = viewers[name]

    for product_id in ("p-noji", "p-house"):
        assert client.get(f"/api/products/{product_id}", headers=headers).status_code == 404
    shown = card_ids(client, headers)
    assert "p-noji" not in shown and "p-house" not in shown
    if name != "anon":
        for product_id in ("p-noji", "p-house"):
            order = client.post(
                "/api/orders", headers=headers | key(), json=order_body(productId=product_id)
            )
            assert order.status_code == 404, (product_id, order.text)
    # 농가 자체는 상품 숨김과 무관하게 R-29대로 보인다
    expected = 200 if name in SHOWN_TO else 404
    assert client.get("/api/farms/f-kang", headers=headers).status_code == expected
    assert client.get("/api/farms/f-halla", headers=headers).status_code == 200


def test_AC_07_12_restoring_a_test_farm_product_keeps_it_hidden_from_regular_users(
    client, viewers, admin_headers
):
    """운영자가 상품을 다시 공개해도 테스트 농가 상품은 테스트 계정에게만 돌아온다."""
    set_hidden(client, admin_headers, "p-house", True)
    set_hidden(client, admin_headers, "p-house", False)
    for name in HIDDEN_TO:
        assert client.get("/api/products/p-house", headers=viewers[name]).status_code == 404
        assert "p-house" not in card_ids(client, viewers[name])
    for name in SHOWN_TO:
        assert client.get("/api/products/p-house", headers=viewers[name]).status_code == 200
        assert "p-house" in card_ids(client, viewers[name])
    # 테스트 농가가 아닌 상품을 숨겼다 다시 공개하면 누구에게나 돌아온다
    set_hidden(client, admin_headers, "p-noji", True)
    set_hidden(client, admin_headers, "p-noji", False)
    for name in HIDDEN_TO + SHOWN_TO:
        assert client.get("/api/products/p-noji", headers=viewers[name]).status_code == 200
