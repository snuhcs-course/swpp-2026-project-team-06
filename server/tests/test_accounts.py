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
