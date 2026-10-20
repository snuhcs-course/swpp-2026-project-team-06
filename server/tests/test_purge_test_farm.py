"""DEV-93 운영 테스트 농가 정리 명령."""

import uuid

import pytest
from sqlalchemy import MetaData, func, select, update

from app.accounts.models import User
from app.admin.models import ManagerEvent
from app.admin.purge_test_farm import TEST_MARKER, PurgeRefused, purge
from app.catalog.models import Product
from app.core.db import get_engine, get_sessionmaker
from app.farms.models import Farm
from app.orders.models import Order


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def table_counts() -> dict[str, int]:
    engine = get_engine()
    md = MetaData()
    md.reflect(bind=engine)
    with engine.connect() as conn:
        return {
            t.name: conn.execute(select(func.count()).select_from(t)).scalar_one()
            for t in md.sorted_tables
        }


def orders_of(farm_id: str, *, other: bool = False) -> int:
    cond = Product.farm_id != farm_id if other else Product.farm_id == farm_id
    with get_sessionmaker()() as session:
        return session.scalar(
            select(func.count())
            .select_from(Order)
            .join(Product, Product.id == Order.product_id)
            .where(cond)
        )


def mark_test_farm(farm_id: str) -> None:
    with get_sessionmaker()() as session, session.begin():
        farm = session.get(Farm, farm_id)
        farm.name = f"{farm.name} {TEST_MARKER}"


def make_order_consumers_test_accounts(farm_id: str) -> None:
    with get_sessionmaker()() as session, session.begin():
        consumers = session.scalars(
            select(Order.consumer_id)
            .join(Product, Product.id == Order.product_id)
            .where(Product.farm_id == farm_id)
            .distinct()
        ).all()
        session.execute(update(User).where(User.id.in_(consumers)).values(is_test_account=True))


def test_DEV_93_refuses_farm_without_test_marker():
    before = table_counts()

    with pytest.raises(PurgeRefused, match="표시가 없어요"):
        purge("f-kang", commit=True)

    assert table_counts() == before


def test_DEV_93_refuses_when_a_real_consumer_ordered():
    # 시드 f-kang에는 테스트 계정이 아닌 구매자(u-buyer-*) 주문이 있다.
    mark_test_farm("f-kang")
    before = table_counts()

    with pytest.raises(PurgeRefused, match="실사용자 주문"):
        purge("f-kang", commit=True)

    assert table_counts() == before


def test_DEV_93_dry_run_reports_rows_and_changes_nothing():
    mark_test_farm("f-kang")
    make_order_consumers_test_accounts("f-kang")
    before = table_counts()

    counts = purge("f-kang")

    assert counts["farms"] == 1
    assert counts["products"] > 0 and counts["orders"] > 0
    assert table_counts() == before


def test_DEV_93_commit_removes_the_test_farm_and_keeps_everything_else(client, admin_headers):
    # 운영자 환불로 문자열 참조(감사 이벤트·멱등 기록)도 만든다.
    refund = client.post(
        "/admin/orders/o-40/refund", headers=admin_headers | key(), json={"reason": "테스트"}
    )
    assert refund.status_code == 200, refund.text
    # 다른 농가(f-halla) 주문의 운영자 이벤트는 남아야 한다.
    other = client.post(
        "/admin/orders/o-11/refund", headers=admin_headers | key(), json={"reason": "다른 농가"}
    )
    assert other.status_code == 200, other.text
    mark_test_farm("f-kang")
    make_order_consumers_test_accounts("f-kang")
    assert orders_of("f-kang") > 0
    other_orders = orders_of("f-kang", other=True)
    with get_sessionmaker()() as session:
        producer_is_test = session.get(User, "u-kang").is_test_account

    counts = purge("f-kang", commit=True)

    assert counts["manager_events"] >= 1 and counts["idempotency_records"] >= 1
    assert orders_of("f-kang") == 0
    assert orders_of("f-kang", other=True) == other_orders
    with get_sessionmaker()() as session:
        assert session.get(Farm, "f-kang") is None
        assert session.get(Farm, "f-halla") is not None
        # 시드 테스트 계정 생산자와 소비자 계정은 남는다.
        assert (session.get(User, "u-kang") is not None) == producer_is_test
        assert session.get(User, "u-minji") is not None
        targets = session.scalars(select(ManagerEvent.target_id)).all()
        assert "o-11" in targets and "o-40" not in targets
    assert client.get("/api/products/p-house").status_code == 404
    assert client.get("/api/products/p-noji").status_code == 200
    refunds = client.get("/admin/orders/o-40/refunds", headers=admin_headers)
    assert refunds.status_code in (200, 404)
    assert refunds.status_code == 404 or refunds.json() == []


def test_DEV_93_commit_removes_a_non_test_producer_account(client, admin_headers):
    # 카카오로 만든 검증용 생산자처럼 테스트 계정이 아닌 생산자는 계정도 지운다.
    with get_sessionmaker()() as session, session.begin():
        farm = session.get(Farm, "f-wimi")
        producer_id = farm.producer_id
        session.get(User, producer_id).is_test_account = False
    assert client.post("/admin/producers/f-wimi/approve", headers=admin_headers | key()).is_success
    mark_test_farm("f-wimi")

    counts = purge("f-wimi", commit=True)

    assert counts["users"] == 1
    assert counts["producer_decisions"] >= 1 and counts["manager_events"] >= 1
    with get_sessionmaker()() as session:
        assert session.get(Farm, "f-wimi") is None
        assert session.get(User, producer_id) is None
        assert session.get(User, "u-admin") is not None
