"""회원 탈퇴(DEV-94, AC-01-20). 개인정보는 지우고 법정 보존 거래 기록·동의 기록은 남긴다."""

import uuid

from sqlalchemy import func, select

from app.accounts.models import ShippingAddress, User, UserConsent
from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.farms.models import Farm, Follow
from app.messaging.models import Thread, ThreadMessage
from app.orders.models import Order
from tests.test_accounts import (
    PRODUCER_REDIRECT,
    _agree_producer,
    _finish_onboarding,
    _kakao_consumer,
    _kakao_on,
)
from tests.test_orders import order_body


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def _db():
    return get_sessionmaker()()


def _follower_count(farm_id: str) -> int:
    with _db() as db:
        return db.get(Farm, farm_id).follower_count


def test_AC_01_20_consumer_withdrawal_erases_personal_data_and_keeps_records(client, monkeypatch):
    _kakao_on(monkeypatch)
    user, headers = _kakao_consumer(client)
    _finish_onboarding(client, headers)
    uid = user["userId"]
    address = {
        "recipientName": "김민지",
        "recipientPhone": "010-2345-6789",
        "postalCode": "06236",
        "address": "서울 강남구 테헤란로 1",
    }
    assert client.post("/api/auth/me/addresses", json=address, headers=headers).status_code == 200
    before = _follower_count("f-kang")
    assert client.put("/api/farms/f-kang/follow", headers=headers).status_code == 200
    assert _follower_count("f-kang") == before + 1
    started = client.post(
        "/api/messaging/chats", json={"farmId": "f-kang"}, headers=headers | key()
    )
    assert started.status_code == 200, started.text
    sent = client.post(
        "/api/messaging/chats/f-kang/messages",
        json={"text": "귤 언제 와요?"},
        headers=headers | key(),
    )
    assert sent.status_code == 200, sent.text
    # 끝난 주문(취소)은 거래 기록으로 남는다
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    client.post(f"/api/orders/{order['orderId']}/deposit", headers=headers | key(), json={})
    assert client.post(f"/api/orders/{order['orderId']}/cancel", headers=headers).status_code == 200

    response = client.post("/api/auth/me/withdraw", headers=headers)
    assert response.status_code == 204, response.text
    # 이 토큰은 더 쓸 수 없다
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    with _db() as db:
        row = db.get(User, uid)
        assert row.deleted_at is not None
        assert (row.name, row.nickname, row.phone, row.email, row.kakao_id) == (
            "",
            None,
            "",
            None,
            None,
        )
        assert db.scalar(select(func.count()).where(ShippingAddress.user_id == uid)) == 0
        assert db.scalar(select(func.count()).where(Follow.consumer_id == uid)) == 0
        thread = db.scalar(select(Thread).where(Thread.consumer_id == uid))
        bodies = list(
            db.scalars(
                select(ThreadMessage.body).where(
                    ThreadMessage.thread_id == thread.id, ThreadMessage.sender_type == "CONSUMER"
                )
            )
        )
        assert bodies == ["탈퇴한 회원의 메시지예요."]
        # 주문(받는 사람 정보 포함)과 동의 기록은 남는다
        kept = db.get(Order, order["orderId"])
        assert kept.recipient_name == "이서준"
        assert db.scalar(select(func.count()).where(UserConsent.user_id == uid)) >= 3
    assert _follower_count("f-kang") == before

    # 같은 카카오로 다시 오면 지난 기록과 연결되지 않는 새 사용자다
    again, _ = _kakao_consumer(client)
    assert again["userId"] != uid
    assert again["needsOnboarding"] is True


def test_AC_01_20_open_orders_block_withdrawal(client, monkeypatch):
    _kakao_on(monkeypatch)
    user, headers = _kakao_consumer(client)
    _finish_onboarding(client, headers)
    order = client.post("/api/orders", headers=headers | key(), json=order_body()).json()
    client.post(f"/api/orders/{order['orderId']}/deposit", headers=headers | key(), json={})

    response = client.post("/api/auth/me/withdraw", headers=headers)
    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "WITHDRAW_BLOCKED"
    assert response.json()["details"]["orderNos"] == [order["orderNo"]]
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["nickname"] == "귤러버"


def test_AC_01_20_operator_accounts_cannot_withdraw(client, admin_headers):
    response = client.post("/api/auth/me/withdraw", headers=admin_headers)
    assert response.status_code == 403
    assert client.get("/api/auth/me", headers=admin_headers).status_code == 200


def test_AC_01_20_test_accounts_cannot_withdraw(client, login):
    response = client.post("/api/auth/me/withdraw", headers=login("u-minji"))
    assert response.status_code == 403
    assert response.json()["details"]["reason"] == "TEST_ACCOUNT"
    assert client.get("/api/auth/me", headers=login("u-minji")).status_code == 200


def test_AC_01_20_producer_withdrawal_hides_farm_and_erases_account(client, monkeypatch):
    _kakao_on(monkeypatch, fetch=("kakao-2002", "farm@example.com"))
    body = client.post(
        "/api/auth/kakao", json={"code": "abc", "redirectUri": PRODUCER_REDIRECT, "app": "producer"}
    ).json()
    headers = {"Authorization": f"Bearer {body['accessToken']}"}
    _agree_producer(client, headers)
    applied = client.post(
        "/api/auth/producer-application",
        headers=headers,
        json={
            "ownerName": "김새농",
            "farmName": "탈퇴 농장",
            "region": "제주 서귀포시",
            "mainItems": "감귤",
            "phone": "010-9876-5432",
        },
    )
    assert applied.status_code == 200, applied.text
    farm_id = applied.json()["farmId"]

    assert client.post("/api/auth/me/withdraw", headers=headers).status_code == 204
    with _db() as db:
        farm = db.get(Farm, farm_id)
        assert farm.approval_status == "SUSPENDED"
        assert farm.suspend_reason == "농가가 탈퇴했어요"
        assert (farm.bank_name, farm.account_number, farm.account_holder) == (None, None, None)
        assert farm.contact_phone == ""
        owner = db.get(User, farm.producer_id)
        assert owner.deleted_at is not None and owner.kakao_id is None and owner.name == ""
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    # 소비자 화면에서 사라진다
    assert client.get(f"/api/farms/{farm_id}").status_code == 404


def test_AC_01_20_producer_with_open_orders_cannot_withdraw(client, login):
    """승인 농가에 끝나지 않은 주문이 있으면 생산자는 탈퇴할 수 없다(D5)."""
    consumer = login("u-seojun")
    order = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    client.post(f"/api/orders/{order['orderId']}/deposit", headers=consumer | key(), json={})
    with _db() as db:
        product_id = db.get(Order, order["orderId"]).product_id
        producer_id = db.scalar(
            select(Farm.producer_id)
            .join(Product, Product.farm_id == Farm.id)
            .where(Product.id == product_id)
        )
        # 시드 생산자는 테스트 계정이라 실계정처럼 바꿔 본다
        db.get(User, producer_id).is_test_account = False
        db.commit()
    from app.core.security import issue_token

    headers = {"Authorization": f"Bearer {issue_token(producer_id, 'PRODUCER')}"}
    response = client.post("/api/auth/me/withdraw", headers=headers)
    assert response.status_code == 409
    assert order["orderNo"] in response.json()["details"]["orderNos"]
