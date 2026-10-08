"""FEAT-01 Mock 로그인·계정 분리, FEAT-08 저장 배송지."""

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
