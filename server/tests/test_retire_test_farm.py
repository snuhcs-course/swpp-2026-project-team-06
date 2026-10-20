"""DEV-93 운영 테스트 농가 숨김 명령."""

import uuid

import pytest
from sqlalchemy import select, update

from app.accounts.models import User
from app.admin.retire_test_farm import RETIRE_REASON, RetireRefused, restore, retire
from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.farms.models import Farm
from app.orders.models import Order

ORDER = {
    "productId": "p-house",
    "optionId": "opt-5",
    "quantity": 1,
    "recipientName": "이서준",
    "recipientPhone": "010-3456-7890",
    "postalCode": "48094",
    "address": "부산 해운대구 해운대로 570",
    "consents": {
        "deliveryWindow": True,
        "delayRefund": True,
        "shortage": True,
        "cancelPolicy": True,
    },
    "consentVersion": "2026-10-06",
}


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def farm_state(farm_id: str) -> tuple[str, str | None]:
    with get_sessionmaker()() as session:
        farm = session.get(Farm, farm_id)
        return farm.approval_status, farm.suspend_reason


def make_order_consumers_test_accounts(farm_id: str) -> None:
    # 시드 f-kang에는 테스트 계정이 아닌 구매자(u-buyer-*) 주문이 있다.
    with get_sessionmaker()() as session, session.begin():
        consumers = session.scalars(
            select(Order.consumer_id)
            .join(Product, Product.id == Order.product_id)
            .where(Product.farm_id == farm_id)
            .distinct()
        ).all()
        session.execute(update(User).where(User.id.in_(consumers)).values(is_test_account=True))


def test_DEV_93_refuses_when_a_real_consumer_ordered():
    with pytest.raises(RetireRefused, match="실사용자 주문"):
        retire("f-kang", commit=True)

    assert farm_state("f-kang") == ("APPROVED", None)


def test_DEV_93_refuses_unknown_or_unapproved_farm():
    with pytest.raises(RetireRefused, match="농가가 없어요"):
        retire("f-unknown", commit=True)
    with pytest.raises(RetireRefused, match="승인된 농가가 아니라"):
        retire("f-wimi", commit=True)

    assert farm_state("f-wimi")[0] == "PENDING"


def test_DEV_93_dry_run_changes_nothing():
    make_order_consumers_test_accounts("f-kang")

    farm = retire("f-kang")

    assert farm.name and farm.approval_status == "APPROVED"
    assert farm_state("f-kang") == ("APPROVED", None)


def test_DEV_93_retired_farm_is_hidden_everywhere(client, login):
    make_order_consumers_test_accounts("f-kang")
    link = client.get("/api/farms/me", headers=login("u-kang")).json()["shareUrl"]
    assert client.get("/api/farms/f-kang").status_code == 200
    assert client.get("/api/products/p-house").status_code == 200
    assert client.get(link).status_code == 200

    retire("f-kang", commit=True)

    assert farm_state("f-kang") == ("SUSPENDED", RETIRE_REASON)
    home = client.get("/api/home").json()
    assert "f-kang" not in {f["farmId"] for f in home["farms"]}
    assert "p-house" not in {c["productId"] for c in home["recommended"]}
    assert "f-kang" not in {f["farmId"] for f in client.get("/api/farms").json()["items"]}
    assert client.get("/api/farms/f-kang").status_code == 404
    assert client.get("/api/products/p-house").status_code == 404
    assert client.get(link).status_code == 404
    order = client.post("/api/orders", headers=login("u-seojun") | key(), json=ORDER)
    assert order.status_code == 404
    # 다른 농가와 행은 그대로다.
    assert client.get("/api/farms/f-halla").status_code == 200
    assert client.get("/api/products/p-noji").status_code == 200
    with get_sessionmaker()() as session:
        assert session.get(Product, "p-house").status == "PUBLISHED"


def test_DEV_93_restore_reopens_only_farms_this_command_hid(client):
    make_order_consumers_test_accounts("f-kang")
    retire("f-kang", commit=True)

    restore("f-kang")
    assert farm_state("f-kang")[0] == "SUSPENDED"
    restore("f-kang", commit=True)

    assert farm_state("f-kang") == ("APPROVED", None)
    assert client.get("/api/farms/f-kang").status_code == 200
    # 제재로 정지된 농가는 풀지 않는다.
    with pytest.raises(RetireRefused, match="이 명령으로 숨긴 농가가 아니에요"):
        restore("f-stop", commit=True)
    assert farm_state("f-stop")[0] == "SUSPENDED"
