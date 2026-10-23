"""FEAT-01 Mock 로그인·계정 분리, FEAT-08 저장 배송지."""

from unittest.mock import ANY

from app.accounts.schemas import CONSENT_VERSION
from app.core import config


def test_test_accounts_are_per_app(client):
    consumer = client.get("/api/auth/test-accounts", params={"app": "consumer"}).json()
    producer = client.get("/api/auth/test-accounts", params={"app": "producer"}).json()

    assert [a["userId"] for a in consumer] == ["u-minji", "u-seojun"]
    assert {a["role"] for a in consumer} == {"CONSUMER"}
    assert [a["userId"] for a in producer] == ["u-kang", "u-misook", "u-new", "u-soonja", "u-taeho"]
    assert [a["farmStatus"] for a in producer] == [
        "APPROVED",
        "PENDING",
        "NONE",
        "REJECTED",
        "SUSPENDED",
    ]


def test_AC_01_1_login_returns_token_and_user(client):
    response = client.post("/api/auth/test-login", json={"userId": "u-minji", "app": "consumer"})

    assert response.status_code == 200
    body = response.json()
    assert body["accessToken"]
    assert body["user"] == {
        "userId": "u-minji",
        "name": "김민지",
        "role": "CONSUMER",
        "isTestAccount": True,
        "farmId": None,
        "farmStatus": "NONE",
        "suspendReason": None,
        "nickname": None,
        "email": None,
        "phone": "",
        "needsOnboarding": False,
        "consentRequired": False,
    }


def test_AC_01_4_unknown_user_is_rejected(client):
    response = client.post("/api/auth/test-login", json={"userId": "u-nobody", "app": "consumer"})

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_AC_01_4_non_test_account_cannot_log_in(client):
    response = client.post("/api/auth/test-login", json={"userId": "u-admin", "app": "consumer"})

    assert response.status_code == 404


def test_AC_01_5_mock_login_off_returns_404(client, monkeypatch):
    monkeypatch.setattr(config.get_settings(), "mock_login_enabled", False)

    accounts = client.get("/api/auth/test-accounts", params={"app": "consumer"})
    login = client.post("/api/auth/test-login", json={"userId": "u-minji", "app": "consumer"})

    assert accounts.status_code == 404
    assert login.status_code == 404


def test_AC_01_6_wrong_app_login_is_403(client):
    response = client.post("/api/auth/test-login", json={"userId": "u-kang", "app": "consumer"})

    assert response.status_code == 403
    assert response.json()["details"] == {"reason": "WRONG_APP"}


def test_AC_01_6_producer_token_on_consumer_api_is_403(client, login):
    response = client.get("/api/auth/me/addresses", headers=login("u-kang"))

    assert response.status_code == 403
    assert response.json()["details"]["reason"] == "WRONG_APP"


def test_me_shows_producer_farm_status(client, login):
    body = client.get("/api/auth/me", headers=login("u-taeho")).json()

    assert body["farmId"] == "f-stop"
    assert body["farmStatus"] == "SUSPENDED"
    assert body["suspendReason"]


def test_me_requires_token(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_AC_01_3_pending_and_rejected_producers_can_read_application(client, login):
    pending = client.get("/api/auth/producer-application", headers=login("u-misook"))
    rejected = client.get("/api/auth/producer-application", headers=login("u-soonja"))

    assert pending.status_code == 200
    assert pending.json() == {
        "farmId": "f-wimi",
        "ownerName": "오미숙",
        "farmName": "위미 감귤농장",
        "region": "제주 서귀포시 남원읍",
        "mainItems": "노지 감귤, 레드향",
        "phone": "010-4321-8765",
        "status": "PENDING",
        "rejectReason": None,
        "submittedAt": "2026-10-07T01:00:00Z",
        "decidedAt": None,
    }
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "REJECTED"
    assert rejected.json()["rejectReason"].startswith("적어 주신 번호로")
    assert rejected.json()["decidedAt"] == "2026-10-06T01:00:00Z"


def test_AC_01_3_application_requires_producer_account_and_existing_application(client, login):
    consumer = client.get("/api/auth/producer-application", headers=login("u-minji"))
    missing = client.get("/api/auth/producer-application", headers=login("u-new"))

    assert consumer.status_code == 403
    assert consumer.json()["details"] == {"reason": "WRONG_APP"}
    assert missing.status_code == 404
    assert missing.json()["message"] == "신청 내역이 없어요."


def test_AC_01_7_new_producer_can_submit_application(client, login):
    headers = login("u-new")
    response = client.post(
        "/api/auth/producer-application",
        headers=headers,
        json={
            "ownerName": "김새농",
            "farmName": "새 농장",
            "region": "제주 제주시",
            "mainItems": "감귤",
            "phone": "010-9876-5432",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["farmId"].startswith("f-")
    assert body["status"] == "PENDING"
    assert body["rejectReason"] is None
    assert client.get("/api/auth/producer-application", headers=headers).json() == body
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["name"] == "김새농"
    assert me["farmId"] == body["farmId"]
    assert me["farmStatus"] == "PENDING"


def test_AC_01_7_rejected_producer_can_reapply_with_same_farm(client, login):
    headers = login("u-soonja")
    response = client.post(
        "/api/auth/producer-application",
        headers=headers,
        json={
            "ownerName": "박순자",
            "farmName": "하례 새 귤밭",
            "region": "제주 서귀포시 남원읍",
            "mainItems": "노지 감귤, 한라봉",
            "phone": "010-1111-2222",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "farmId": "f-reject",
        "ownerName": "박순자",
        "farmName": "하례 새 귤밭",
        "region": "제주 서귀포시 남원읍",
        "mainItems": "노지 감귤, 한라봉",
        "phone": "010-1111-2222",
        "status": "PENDING",
        "rejectReason": None,
        "submittedAt": "2026-10-07T01:00:00Z",
        "decidedAt": None,
    }


def test_AC_01_7_application_validates_fields_and_transition(client, login):
    invalid = client.post(
        "/api/auth/producer-application",
        headers=login("u-new"),
        json={"ownerName": "", "farmName": "", "region": "", "mainItems": "", "phone": "123"},
    )
    duplicate = client.post(
        "/api/auth/producer-application",
        headers=login("u-misook"),
        json={
            "ownerName": "오미숙",
            "farmName": "위미 감귤농장",
            "region": "제주 서귀포시 남원읍",
            "mainItems": "노지 감귤",
            "phone": "010-4321-8765",
        },
    )

    assert invalid.status_code == 400
    assert set(invalid.json()["details"]["fields"]) == {
        "ownerName",
        "farmName",
        "region",
        "mainItems",
        "phone",
    }
    assert duplicate.status_code == 409
    assert duplicate.json()["details"] == {"reason": "INVALID_TRANSITION"}


def test_invalid_token_is_401(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401


def test_AC_08_5_saved_addresses_listed_default_first(client, login):
    addresses = client.get("/api/auth/me/addresses", headers=login("u-minji")).json()

    assert [a["addressId"] for a in addresses] == ["a-1", "a-2"]
    assert addresses[0]["isDefault"] is True


def test_add_address_validates_and_becomes_default(client, login):
    headers = login("u-seojun")
    bad = client.post("/api/auth/me/addresses", headers=headers, json={"recipientName": ""})
    good = client.post(
        "/api/auth/me/addresses",
        headers=headers,
        json={
            "recipientName": "이서준",
            "recipientPhone": "010-3456-7890",
            "postalCode": "48094",
            "address": "부산 해운대구 해운대로 570",
            "addressDetail": "1203호",
        },
    )

    assert bad.status_code == 400
    assert set(bad.json()["details"]["fields"]) == {"recipientName", "recipientPhone", "address"}
    assert good.status_code == 200
    assert good.json()["isDefault"] is True


# ---- 카카오 로그인 (FEAT-01 I2, ADR 0003·0010, DEV-32) ----

CONSUMER_REDIRECT = "http://localhost:8081/auth/kakao"
PRODUCER_REDIRECT = "http://localhost:8082/auth/kakao"


def _kakao_on(monkeypatch, fetch=("kakao-1001", "minji@example.com"), **extra):
    from app.accounts import service

    monkeypatch.setattr(config.get_settings(), "kakao_rest_api_key", "test-rest-key")
    profile = service.KakaoProfile(kakao_id=fetch[0], email=fetch[1], **extra)
    monkeypatch.setattr(service, "_kakao_fetch", lambda code, redirect_uri: profile)


CONSENTS = [
    {"kind": "TERMS", "version": CONSENT_VERSION},
    {"kind": "PRIVACY", "version": CONSENT_VERSION},
    {"kind": "AGE14", "version": CONSENT_VERSION},
    {"kind": "MARKETING", "version": CONSENT_VERSION, "agreed": False},
]
PRODUCER_CONSENTS = [
    {"kind": "TERMS", "version": CONSENT_VERSION},
    {"kind": "PRIVACY", "version": CONSENT_VERSION},
]
PROFILE = {"nickname": "귤러버", "name": "김민지", "phone": "010-2345-6789"}


def _kakao(client, app: str = "consumer") -> tuple[dict, dict]:
    """카카오 로그인. 새 사용자면 필수 약관에 동의해 가입한다(DEV-132)."""
    redirect = CONSUMER_REDIRECT if app == "consumer" else PRODUCER_REDIRECT
    body = client.post(
        "/api/auth/kakao", json={"code": "abc", "redirectUri": redirect, "app": app}
    ).json()
    if body.get("signup"):
        consents = CONSENTS if app == "consumer" else PRODUCER_CONSENTS
        signed = client.post(
            "/api/auth/kakao/signup",
            json={"signupToken": body["signup"]["signupToken"], "consents": consents},
        )
        assert signed.status_code == 200, signed.text
        body = signed.json()
    return body["user"], {"Authorization": f"Bearer {body['accessToken']}"}


def _kakao_consumer(client) -> tuple[dict, dict]:
    return _kakao(client, "consumer")


def _agree_producer(client, headers) -> None:
    saved = client.post(
        "/api/auth/me/consents", json={"consents": PRODUCER_CONSENTS}, headers=headers
    )
    assert saved.status_code == 200, saved.text


def _finish_onboarding(client, headers) -> dict:
    saved = client.post("/api/auth/me/consents", json={"consents": CONSENTS}, headers=headers)
    assert saved.status_code == 200, saved.text
    me = client.patch("/api/auth/me", json=PROFILE, headers=headers)
    assert me.status_code == 200, me.text
    return me.json()


def _kakao_users(kakao_id: str) -> list[tuple[str, str]]:
    from sqlalchemy import select

    from app.accounts.models import User
    from app.core.db import get_sessionmaker

    with get_sessionmaker()() as session:
        rows = session.scalars(select(User).where(User.kakao_id == kakao_id)).all()
        return [(u.id, u.role) for u in rows]


def test_kakao_config_reports_enabled_state(client, monkeypatch):
    # 로컬 .env에 키가 있어도 "꺼짐"부터 확인한다
    monkeypatch.setattr(config.get_settings(), "kakao_rest_api_key", "")
    off = client.get("/api/auth/kakao/config").json()
    assert off == {"enabled": False, "clientId": None, "redirectPath": "/auth/kakao"}

    monkeypatch.setattr(config.get_settings(), "kakao_rest_api_key", "test-rest-key")
    on = client.get("/api/auth/kakao/config").json()
    assert on == {"enabled": True, "clientId": "test-rest-key", "redirectPath": "/auth/kakao"}


def test_AC_01_8_first_kakao_login_creates_consumer_account(client, monkeypatch):
    _kakao_on(monkeypatch)

    response = client.post(
        "/api/auth/kakao", json={"code": "abc", "redirectUri": CONSUMER_REDIRECT, "app": "consumer"}
    )
    assert response.status_code == 200, response.text
    # 첫 로그인은 계정 없이 가입 토큰만 받는다. 필수 약관에 동의해야 계정이 생긴다(DEV-132)
    assert response.json()["accessToken"] is None
    assert response.json()["signup"]["email"] == "minji@example.com"
    assert _kakao_users("kakao-1001") == []
    response = client.post(
        "/api/auth/kakao/signup",
        json={"signupToken": response.json()["signup"]["signupToken"], "consents": CONSENTS},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["accessToken"]
    # 카카오에서는 이메일만 받고, 식별은 카카오 회원번호로 한다. 이름·닉네임·연락처는 온보딩에서
    assert body["user"]["email"] == "minji@example.com"
    assert body["user"]["name"] == ""
    assert body["user"]["nickname"] is None
    assert body["user"]["phone"] == ""
    assert body["user"]["needsOnboarding"] is True
    assert body["user"]["role"] == "CONSUMER"
    assert body["user"]["isTestAccount"] is False
    assert body["user"]["farmStatus"] == "NONE"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['accessToken']}"})
    assert me.status_code == 200
    assert me.json()["userId"] == body["user"]["userId"]
    assert _kakao_users("kakao-1001") == [(body["user"]["userId"], "CONSUMER")]


def test_AC_01_9_same_kakao_account_logs_into_same_user(client, monkeypatch):
    _kakao_on(monkeypatch)
    payload = {"code": "abc", "redirectUri": CONSUMER_REDIRECT, "app": "consumer"}

    first = _kakao(client)[0]["userId"]
    second = client.post("/api/auth/kakao", json=payload).json()["user"]["userId"]

    assert first == second
    assert len(_kakao_users("kakao-1001")) == 1


def test_AC_01_10_same_kakao_id_gets_separate_producer_account(client, monkeypatch):
    _kakao_on(monkeypatch)

    consumer = _kakao(client, "consumer")[0]
    producer = _kakao(client, "producer")[0]

    assert consumer["userId"] != producer["userId"]
    assert producer["role"] == "PRODUCER"
    assert producer["farmStatus"] == "NONE"
    assert sorted(role for _, role in _kakao_users("kakao-1001")) == ["CONSUMER", "PRODUCER"]


def test_AC_01_16_kakao_producer_signs_up_through_application(client, monkeypatch):
    """생산자 앱 카카오 로그인(DEV-74): 처음이면 농가 없는 생산자 계정 → 가입 신청 → 확인 중.

    생산자는 소비자 온보딩을 거치지 않고, 가입 신청의 대표자 이름이 계정 이름이 된다.
    """
    _kakao_on(monkeypatch)
    # 새 생산자도 약관·개인정보에 동의해야 계정이 생긴다(AC-01-18·19)
    user, headers = _kakao(client, "producer")
    assert user["role"] == "PRODUCER"
    assert user["farmStatus"] == "NONE"
    assert user["needsOnboarding"] is False
    assert user["consentRequired"] is False
    assert user["name"] == "카카오 사용자"

    applied = client.post(
        "/api/auth/producer-application",
        headers=headers,
        json={
            "ownerName": "김새농",
            "farmName": "카카오 농장",
            "region": "제주 서귀포시",
            "mainItems": "감귤",
            "phone": "010-9876-5432",
        },
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["status"] == "PENDING"
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["farmStatus"] == "PENDING"
    assert me["name"] == "김새농"

    # 다시 카카오로 들어와도 같은 생산자 계정(확인 중)
    again = client.post(
        "/api/auth/kakao", json={"code": "def", "redirectUri": PRODUCER_REDIRECT, "app": "producer"}
    ).json()["user"]
    assert again["userId"] == user["userId"]
    assert again["farmStatus"] == "PENDING"


def test_kakao_login_off_returns_404(client, monkeypatch):
    monkeypatch.setattr(config.get_settings(), "kakao_rest_api_key", "")
    response = client.post(
        "/api/auth/kakao", json={"code": "abc", "redirectUri": CONSUMER_REDIRECT, "app": "consumer"}
    )

    assert response.status_code == 404


def test_kakao_login_rejects_unknown_redirect_origin(client, monkeypatch):
    _kakao_on(monkeypatch)

    response = client.post(
        "/api/auth/kakao",
        json={"code": "abc", "redirectUri": "https://evil.example/auth/kakao", "app": "consumer"},
    )

    assert response.status_code == 400
    assert "redirectUri" in response.json()["details"]["fields"]
    # 다른 앱의 복귀 주소로 받은 코드도 거절한다(앱·주소 짝 맞춤)
    crossed = client.post(
        "/api/auth/kakao",
        json={"code": "abc", "redirectUri": PRODUCER_REDIRECT, "app": "consumer"},
    )
    assert crossed.status_code == 400
    assert _kakao_users("kakao-1001") == []


def test_kakao_exchange_failure_creates_no_account(client, monkeypatch):
    from app.accounts import service

    monkeypatch.setattr(config.get_settings(), "kakao_rest_api_key", "test-rest-key")

    def _boom(code, redirect_uri):
        raise service.KakaoError("token exchange failed: 401")

    monkeypatch.setattr(service, "_kakao_fetch", _boom)

    response = client.post(
        "/api/auth/kakao", json={"code": "bad", "redirectUri": CONSUMER_REDIRECT, "app": "consumer"}
    )

    assert response.status_code == 400
    assert _kakao_users("kakao-1001") == []


def test_kakao_name_phone_prefill_only_empty_fields(client, monkeypatch):
    """2단계(비즈 앱 심사 뒤): 카카오 이름·전화번호는 빈 칸에만 채우고 고친 값은 덮지 않는다."""
    _kakao_on(monkeypatch, name="김민지", phone="+82 10-2345-6789")
    user, headers = _kakao_consumer(client)
    assert user["name"] == "김민지"
    assert user["phone"] == "010-2345-6789"
    assert user["needsOnboarding"] is True  # 닉네임·동의가 아직 없다

    client.patch(
        "/api/auth/me", json={"name": "민지 김", "phone": "010-1111-2222"}, headers=headers
    )
    again, _ = _kakao_consumer(client)
    assert again["name"] == "민지 김"
    assert again["phone"] == "010-1111-2222"


def test_AC_01_12_onboarding_required_before_order_follow_chat(client, monkeypatch):
    _kakao_on(monkeypatch)
    user, headers = _kakao_consumer(client)
    assert user["needsOnboarding"] is True

    order = client.post(
        "/api/orders",
        json={
            "productId": "p-house",
            "optionId": "opt-5",
            "quantity": 1,
            "recipientName": "김민지",
            "recipientPhone": "010-2345-6789",
            "postalCode": "06236",
            "address": "서울 강남구 테헤란로 1",
            "consents": {
                "deliveryWindow": True,
                "delayRefund": True,
                "shortage": True,
                "cancelPolicy": True,
                "thirdParty": True,
            },
            "consentVersion": "1.0",
        },
        headers={**headers, "Idempotency-Key": "onb-1"},
    )
    assert order.status_code == 403
    assert order.json()["details"]["reason"] == "ONBOARDING_REQUIRED"
    follow = client.put("/api/farms/f-kang/follow", headers=headers)
    assert follow.status_code == 403
    assert follow.json()["details"]["reason"] == "ONBOARDING_REQUIRED"
    # 둘러보기·내 정보·배송지는 온보딩 전에도 된다
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.get("/api/auth/me/addresses", headers=headers).status_code == 200

    me = _finish_onboarding(client, headers)
    assert me["needsOnboarding"] is False
    assert me["nickname"] == "귤러버"
    assert client.put("/api/farms/f-kang/follow", headers=headers).status_code == 200


def test_AC_01_12_onboarding_validates_fields_and_required_consents(client, monkeypatch):
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)

    bad = client.patch(
        "/api/auth/me",
        json={"nickname": "귤", "name": "김", "phone": "02-123-4567"},
        headers=headers,
    )
    assert bad.status_code == 400
    assert set(bad.json()["details"]["fields"]) == {"nickname", "name", "phone"}

    # 필수 동의 중 하나(만 14세)를 거두면 다시 온보딩이 남는다
    withdrawn = [{"kind": "AGE14", "version": CONSENT_VERSION, "agreed": False}]
    client.post("/api/auth/me/consents", json={"consents": withdrawn}, headers=headers)
    me = client.patch("/api/auth/me", json=PROFILE, headers=headers).json()
    assert me["needsOnboarding"] is True
    client.post(
        "/api/auth/me/consents",
        json={"consents": [{"kind": "AGE14", "version": CONSENT_VERSION}]},
        headers=headers,
    )
    assert client.get("/api/auth/me", headers=headers).json()["needsOnboarding"] is False


def test_AC_01_13_returning_kakao_user_skips_onboarding(client, monkeypatch):
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)
    _finish_onboarding(client, headers)

    again, _ = _kakao_consumer(client)
    assert again["needsOnboarding"] is False
    assert again["nickname"] == "귤러버"
    assert len(_kakao_users("kakao-1001")) == 1


def test_AC_01_14_consents_record_version_and_time(client, monkeypatch):
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)
    saved = client.post("/api/auth/me/consents", json={"consents": CONSENTS}, headers=headers)
    assert saved.status_code == 200
    rows = {c["kind"]: c for c in saved.json()}
    assert set(rows) == {"TERMS", "PRIVACY", "AGE14", "MARKETING"}
    assert rows["TERMS"]["version"] == CONSENT_VERSION
    assert rows["TERMS"]["agreedAt"].startswith("2026-10-07")
    assert rows["MARKETING"]["agreed"] is False

    # 다시 동의하면 항목마다 한 줄만 남고 버전·시각이 바뀐다
    client.post(
        "/api/auth/me/consents",
        json={"consents": [{"kind": "MARKETING", "version": "2026-11-01", "agreed": True}]},
        headers=headers,
    )
    listed = {c["kind"]: c for c in client.get("/api/auth/me/consents", headers=headers).json()}
    assert len(listed) == 4
    assert listed["MARKETING"] == {**listed["MARKETING"], "version": "2026-11-01", "agreed": True}


def test_test_accounts_and_producers_never_need_onboarding(client, login):
    assert client.get("/api/auth/me", headers=login("u-minji")).json()["needsOnboarding"] is False
    assert client.get("/api/auth/me", headers=login("u-kang")).json()["needsOnboarding"] is False
    # 온보딩 API는 소비자 계정만
    assert client.patch("/api/auth/me", json=PROFILE, headers=login("u-kang")).status_code == 403


def test_AC_01_12_every_farm_facing_write_is_gated(client, monkeypatch):
    """좋아요·채팅 시작·채팅 보내기·소식방 답장도 온보딩 전에는 403(서비스 안의 검사 포함)."""
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)
    calls = [
        ("put", "/api/messaging/news/n-1/reaction", None),
        ("post", "/api/messaging/chats", {"farmId": "f-kang"}),
        ("post", "/api/messaging/chats/f-kang/messages", {"text": "안녕하세요"}),
        ("post", "/api/messaging/rooms/f-kang/messages", {"text": "잘 받았어요"}),
    ]
    for i, (method, url, body) in enumerate(calls):
        kwargs = {"headers": {**headers, "Idempotency-Key": f"gate-{i}"}}
        if body is not None:
            kwargs["json"] = body
        response = getattr(client, method)(url, **kwargs)
        assert response.status_code == 403, (url, response.text)
        assert response.json()["details"]["reason"] == "ONBOARDING_REQUIRED", url


def test_nickname_is_what_farms_see(client, login, monkeypatch):
    """농가가 보는 소비자 이름은 닉네임이고 실명은 나가지 않는다(R-15)."""
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)
    _finish_onboarding(client, headers)
    assert client.put("/api/farms/f-kang/follow", headers=headers).status_code == 200
    started = client.post(
        "/api/messaging/chats",
        json={"farmId": "f-kang"},
        headers={**headers, "Idempotency-Key": "nick-start"},
    )
    assert started.status_code == 200, started.text
    sent = client.post(
        "/api/messaging/chats/f-kang/messages",
        json={"text": "언제 보내 주세요?"},
        headers={**headers, "Idempotency-Key": "nick-send"},
    )
    assert sent.status_code == 200, sent.text

    chats = client.get("/api/messaging/producer/chats", headers=login("u-kang")).json()["items"]
    names = [c["consumerName"] for c in chats]
    assert "귤러버" in names
    assert PROFILE["name"] not in str(chats)
    assert PROFILE["phone"] not in str(chats)


def test_AC_01_15_order_save_address_skips_when_book_is_full(client, login):
    from app.accounts.service import ADDRESS_LIMIT
    from tests.test_orders import order_body

    headers = login("u-seojun")
    have = len(client.get("/api/auth/me/addresses", headers=headers).json())
    for i in range(ADDRESS_LIMIT - have):
        added = client.post("/api/auth/me/addresses", json=_address_body(i), headers=headers)
        assert added.status_code == 200
    order = client.post(
        "/api/orders",
        json=order_body(saveAddress=True, address="제주 서귀포시 새주소 1"),
        headers={**headers, "Idempotency-Key": "full-book"},
    )
    assert order.status_code == 200, order.text
    assert len(client.get("/api/auth/me/addresses", headers=headers).json()) == ADDRESS_LIMIT


# ---- 배송지 수정·삭제·50개 제한 (SCR-17 하위, 사용자 결정 10/18) ----


def _address_body(i: int) -> dict:
    return {
        "recipientName": "김민지",
        "recipientPhone": "010-2345-6789",
        "postalCode": "06236",
        "address": f"서울 강남구 테헤란로 {i}",
        "addressDetail": f"{i}호",
    }


def test_AC_01_15_address_update_and_delete_with_default_succession(client, login):
    headers = login("u-minji")
    patched = client.patch(
        "/api/auth/me/addresses/a-2",
        json={"addressDetail": "202호", "label": "회사", "isDefault": True},
        headers=headers,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["addressDetail"] == "202호"
    assert patched.json()["label"] == "회사"
    assert patched.json()["isDefault"] is True
    listed = client.get("/api/auth/me/addresses", headers=headers).json()
    assert [a["isDefault"] for a in listed] == [True, False]
    assert listed[0]["addressId"] == "a-2"

    bad = client.patch(
        "/api/auth/me/addresses/a-2", json={"recipientPhone": "1234"}, headers=headers
    )
    assert bad.status_code == 400

    # 다른 사람 배송지는 보이지 않는다
    assert client.delete("/api/auth/me/addresses/a-1", headers=login("u-seojun")).status_code == 404

    # 기본 배송지를 지우면 가장 최근 배송지가 기본이 된다
    newest = client.post("/api/auth/me/addresses", json=_address_body(3), headers=headers).json()
    assert client.delete("/api/auth/me/addresses/a-2", headers=headers).status_code == 204
    after = client.get("/api/auth/me/addresses", headers=headers).json()
    assert [a["addressId"] for a in after if a["isDefault"]] == [newest["addressId"]]
    assert "a-2" not in [a["addressId"] for a in after]


def test_AC_01_15_addresses_capped_at_50_per_account(client, login):
    from app.accounts.service import ADDRESS_LIMIT

    headers = login("u-seojun")
    have = len(client.get("/api/auth/me/addresses", headers=headers).json())
    for i in range(ADDRESS_LIMIT - have):
        added = client.post("/api/auth/me/addresses", json=_address_body(i), headers=headers)
        assert added.status_code == 200, added.text
    over = client.post("/api/auth/me/addresses", json=_address_body(999), headers=headers)
    assert over.status_code == 409
    assert over.json()["details"]["reason"] == "ADDRESS_LIMIT"
    assert over.json()["details"]["limit"] == ADDRESS_LIMIT
    listed = client.get("/api/auth/me/addresses", headers=headers).json()
    assert len(listed) == ADDRESS_LIMIT
    # 하나 지우면 다시 저장된다
    client.delete(f"/api/auth/me/addresses/{listed[-1]['addressId']}", headers=headers)
    again = client.post("/api/auth/me/addresses", json=_address_body(1000), headers=headers)
    assert again.status_code == 200


def test_AC_01_17_existing_consumer_must_agree_to_new_terms_version(client, monkeypatch):
    """약관·처리방침 버전이 바뀌면(DEV-113) 가입한 소비자도 다시 동의해야 주문·팔로우를 한다."""
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)
    old = [{**c, "version": "2026-10-18"} for c in CONSENTS]
    client.post("/api/auth/me/consents", json={"consents": old}, headers=headers)
    me = client.patch("/api/auth/me", json=PROFILE, headers=headers).json()
    assert me["needsOnboarding"] is True
    assert me["consentRequired"] is True
    follow = client.put("/api/farms/f-kang/follow", headers=headers)
    assert follow.status_code == 403
    assert follow.json()["details"]["reason"] == "ONBOARDING_REQUIRED"

    # 선택 항목(알림)은 다시 동의하지 않아도 된다
    required = [c for c in CONSENTS if c["kind"] != "MARKETING"]
    client.post("/api/auth/me/consents", json={"consents": required}, headers=headers)
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["needsOnboarding"] is False
    assert me["consentRequired"] is False
    assert client.put("/api/farms/f-kang/follow", headers=headers).status_code == 200


def test_AC_01_18_producer_must_agree_before_using_the_producer_app(client, monkeypatch, login):
    """생산자는 지금 버전의 약관·개인정보에 동의해야 가입 신청·농가 API를 쓴다(DEV-113)."""
    _kakao_on(monkeypatch)
    _, headers = _kakao(client, "producer")
    application = {
        "ownerName": "김새농",
        "farmName": "카카오 농장",
        "region": "제주 서귀포시",
        "mainItems": "감귤",
        "phone": "010-9876-5432",
    }
    # 가입 뒤 약관 버전이 바뀐 것처럼 옛 버전으로 돌리면 생산자 API가 막힌다
    client.post(
        "/api/auth/me/consents",
        json={"consents": [{**c, "version": "2026-10-18"} for c in PRODUCER_CONSENTS]},
        headers=headers,
    )
    assert client.get("/api/auth/me", headers=headers).json()["consentRequired"] is True
    blocked = client.post("/api/auth/producer-application", headers=headers, json=application)
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "CONSENT_REQUIRED"
    # 내 정보·동의 API는 동의 전에도 된다
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    _agree_producer(client, headers)
    assert client.get("/api/auth/me", headers=headers).json()["consentRequired"] is False
    applied = client.post("/api/auth/producer-application", headers=headers, json=application)
    assert applied.status_code == 200, applied.text

    # 시드 테스트 계정은 동의 검사에서 빠진다
    assert client.get("/api/auth/me", headers=login("u-kang")).json()["consentRequired"] is False
    assert client.get("/api/auth/me", headers=login("u-minji")).json()["consentRequired"] is False


def test_AC_01_19_no_account_until_required_consents(client, monkeypatch):
    """카카오 새 사용자는 필수 약관에 동의해야 계정이 생긴다(DEV-132). 떠나면 남지 않는다."""
    import jwt

    from app.core.security import issue_signup_token

    _kakao_on(monkeypatch)
    for app, consents in (("consumer", CONSENTS), ("producer", PRODUCER_CONSENTS)):
        redirect = CONSUMER_REDIRECT if app == "consumer" else PRODUCER_REDIRECT
        body = client.post(
            "/api/auth/kakao", json={"code": "abc", "redirectUri": redirect, "app": app}
        ).json()
        assert body["accessToken"] is None and body["user"] is None
        token = body["signup"]["signupToken"]
        assert _kakao_users("kakao-1001") == ([] if app == "consumer" else [(ANY, "CONSUMER")])

        def signup(t, c):
            return client.post("/api/auth/kakao/signup", json={"signupToken": t, "consents": c})

        # 필수 하나라도 빠지거나 옛 버전이면 400, 계정 없음
        missing = signup(token, [c for c in consents if c["kind"] != "PRIVACY"])
        assert missing.status_code == 400
        assert "consents" in missing.json()["details"]["fields"]
        old = signup(token, [{**c, "version": "2026-10-18"} for c in consents])
        assert old.status_code == 400
        # 위조·만료·다른 종류 토큰은 400
        forged = jwt.encode(
            {"typ": "kakao_signup", "kid": "kakao-1001", "role": "CONSUMER", "exp": 9999999999},
            "wrong-secret-of-32-bytes-or-longer",
            algorithm="HS256",
        )
        assert signup(forged, consents).json()["details"]["fields"] == {
            "signupToken": "가입 요청이 만료됐어요"
        }
        expired = issue_signup_token({"kid": "kakao-1001", "role": "CONSUMER"})
        payload = jwt.decode(expired, options={"verify_signature": False})
        from app.core.config import get_settings

        stale = jwt.encode(
            {**payload, "exp": payload["iat"] - 1}, get_settings().jwt_secret, algorithm="HS256"
        )
        assert signup(stale, consents).status_code == 400
        roles = sorted(r for _, r in _kakao_users("kakao-1001"))
        assert roles == ([] if app == "consumer" else ["CONSUMER"])

        ok = signup(token, consents)
        assert ok.status_code == 200, ok.text
        headers = {"Authorization": f"Bearer {ok.json()['accessToken']}"}
        kinds = {c["kind"] for c in client.get("/api/auth/me/consents", headers=headers).json()}
        assert {c["kind"] for c in consents} <= kinds
        # 같은 토큰을 다시 보내도 계정은 하나
        assert signup(token, consents).json()["user"]["userId"] == ok.json()["user"]["userId"]
    assert sorted(r for _, r in _kakao_users("kakao-1001")) == ["CONSUMER", "PRODUCER"]
