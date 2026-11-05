"""수확 시작 = 출하 준비 시작(DEV-231, FEAT-17 AC-17-3·AC-17-11·AC-17-12, FEAT-14 할 일)."""

from datetime import date

from sqlalchemy import select, update

from app.admin.models import ManagerEvent
from app.catalog.models import Stage
from app.core.db import get_sessionmaker
from app.orders.models import Order
from tests.test_orders import deposit, key, order_body, reserve

URL = "/api/orders/producer/harvest-start"
STAGE_1, STAGE_2 = "st-house-1", "st-house-2"


def _statuses(product_id: str = "p-house") -> dict[str, tuple[str, str]]:
    """주문 id → (기간, 상태)."""
    with get_sessionmaker()() as session:
        rows = session.execute(
            select(Order.id, Order.stage_id, Order.status).where(Order.product_id == product_id)
        )
        return {oid: (sid, status) for oid, sid, status in rows}


def _move_to_stage(order_id: str, stage_id: str) -> None:
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(Order).where(Order.id == order_id).values(stage_id=stage_id))


def _set_stage_dates(stage_id: str, starts: str, ends: str) -> None:
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Stage)
            .where(Stage.id == stage_id)
            .values(starts_at=date.fromisoformat(starts), ends_at=date.fromisoformat(ends))
        )


def _events() -> list[ManagerEvent]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(ManagerEvent).where(ManagerEvent.event_type == "orders.harvest_started")
            )
        )


def _new_reserved(client, login, **body) -> str:
    consumer = login("u-seojun")
    created = client.post("/api/orders", headers=consumer | key(), json=order_body(**body))
    assert created.status_code == 200, created.text
    reserve(client, consumer, created.json()["orderId"], login=login)
    return created.json()["orderId"]


def test_AC_17_11_harvest_start_moves_only_that_stage_reserved(client, login):
    producer, consumer = login("u-kang"), login("u-seojun")
    mine = _new_reserved(client, login)
    later = _new_reserved(client, login, optionId="opt-10")
    _move_to_stage(later, STAGE_2)  # 다른 기간의 예약 완료
    waiting = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    assert deposit(client, consumer, waiting["orderId"]).status_code == 200  # 입금 대기
    before, noji = _statuses(), _statuses("p-noji")
    expected = {o for o, (sid, st) in before.items() if sid == STAGE_1 and st == "RESERVED"}
    assert mine in expected and later not in expected

    response = client.post(
        URL, headers=producer | key(), json={"productId": "p-house", "stageId": STAGE_1}
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["changed"] == len(expected)
    assert body["stageId"] == STAGE_1
    assert set(body["orderIds"]) == expected
    after = _statuses()
    for oid, (_sid, status) in before.items():
        if oid in expected:
            assert after[oid][1] == "PREPARING", oid
        else:
            assert after[oid][1] == status, oid  # 다른 기간·입금 대기·환불·취소는 그대로
    assert after[later][1] == "RESERVED"
    assert after[waiting["orderId"]][1] == "AWAITING_DEPOSIT"
    assert _statuses("p-noji") == noji  # 다른 상품은 그대로


def test_AC_17_11_consumer_sees_preparing_and_can_still_cancel(client, login):
    producer, consumer = login("u-kang"), login("u-seojun")
    order_id = _new_reserved(client, login)
    started = client.post(
        URL, headers=producer | key(), json={"productId": "p-house", "stageId": STAGE_1}
    )
    assert started.status_code == 200, started.text
    detail = client.get(f"/api/orders/{order_id}", headers=consumer).json()
    assert detail["status"] == "PREPARING"
    canceled = client.post(f"/api/orders/{order_id}/cancel", headers=consumer)
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["status"] == "REFUNDED"


def test_AC_17_11_harvested_orders_ship(client, login):
    producer, consumer = login("u-kang"), login("u-seojun")
    order_id = _new_reserved(client, login)
    client.post(URL, headers=producer | key(), json={"productId": "p-house", "stageId": STAGE_1})
    shipped = client.post(
        f"/api/orders/{order_id}/ship",
        headers=producer,
        json={"carrier": "CJ", "trackingNumber": "6012-3456-7890"},
    )
    assert shipped.status_code == 200, shipped.text
    assert client.get(f"/api/orders/{order_id}", headers=consumer).json()["status"] == "SHIPPED"


def test_AC_17_12_other_farm_and_foreign_stage_404(client, login, other_farm_headers):
    producer = login("u-kang")
    before = _statuses()
    other = client.post(
        URL, headers=other_farm_headers | key(), json={"productId": "p-house", "stageId": STAGE_1}
    )
    assert other.status_code == 404, other.text
    foreign = client.post(
        URL, headers=producer | key(), json={"productId": "p-house", "stageId": "st-noji-1"}
    )
    assert foreign.status_code == 404, foreign.text
    missing = client.post(
        URL, headers=producer | key(), json={"productId": "p-house", "stageId": "st-none"}
    )
    assert missing.status_code == 404, missing.text
    assert _statuses() == before
    assert _events() == []


def test_AC_17_12_missing_key_400(client, login):
    before = _statuses()
    response = client.post(
        URL, headers=login("u-kang"), json={"productId": "p-house", "stageId": STAGE_1}
    )
    assert response.status_code == 400, response.text
    assert _statuses() == before


def test_AC_17_12_same_key_replay_no_duplicate_and_zero_is_200(client, login):
    producer = login("u-kang")
    _new_reserved(client, login)
    headers = producer | key()
    body = {"productId": "p-house", "stageId": STAGE_1}
    first = client.post(URL, headers=headers, json=body)
    replay = client.post(URL, headers=headers, json=body)
    assert first.status_code == replay.status_code == 200
    assert replay.json() == first.json()
    assert first.json()["changed"] > 0
    again = client.post(URL, headers=producer | key(), json=body)
    assert again.status_code == 200, again.text
    assert again.json() == {"changed": 0, "stageId": STAGE_1, "orderIds": []}
    events = _events()
    assert len(events) == 1
    event = events[0]
    assert (event.target_type, event.target_id) == ("stage", STAGE_1)
    assert event.actor_id == "u-kang"
    assert set(event.result["orderIds"]) == set(first.json()["orderIds"])
    assert event.result["changed"] == first.json()["changed"]


def test_AC_17_12_without_stage_moves_whole_product(client, login):
    producer = login("u-kang")
    later = _new_reserved(client, login)
    _move_to_stage(later, STAGE_2)
    before = _statuses()
    expected = {o for o, (_, st) in before.items() if st == "RESERVED"}
    response = client.post(URL, headers=producer | key(), json={"productId": "p-house"})
    assert response.status_code == 200, response.text
    assert set(response.json()["orderIds"]) == expected
    assert response.json()["stageId"] is None
    assert _statuses()[later][1] == "PREPARING"


def test_AC_17_3_listing_does_not_change_reserved(client, login):
    producer = login("u-kang")
    before = _statuses()
    assert client.get("/api/orders/producer?status=RESERVED", headers=producer).status_code == 200
    assert client.get("/api/orders/producer/dashboard", headers=producer).status_code == 200
    assert client.get("/api/products/mine/p-house", headers=producer).status_code == 200
    assert _statuses() == before


def test_AC_17_11_my_product_stage_counts_and_started(client, login):
    producer, consumer = login("u-kang"), login("u-seojun")
    waiting = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    deposit(client, consumer, waiting["orderId"])
    statuses = _statuses()
    reserved = sum(1 for sid, st in statuses.values() if sid == STAGE_1 and st == "RESERVED")
    awaiting = sum(
        1 for sid, st in statuses.values() if sid == STAGE_1 and st == "AWAITING_DEPOSIT"
    )
    preparing = sum(1 for sid, st in statuses.values() if sid == STAGE_1 and st == "PREPARING")

    def stage(sid):
        product = client.get("/api/products/mine/p-house", headers=producer).json()
        return next(s for s in product["stages"] if s["stageId"] == sid)

    first = stage(STAGE_1)
    assert first["reservedOrderCount"] == reserved > 0
    assert first["awaitingOrderCount"] == awaiting >= 1
    assert first["preparingOrderCount"] == preparing
    assert stage(STAGE_2)["harvestStarted"] is False
    assert stage(STAGE_2)["reservedOrderCount"] == 0

    client.post(URL, headers=producer | key(), json={"productId": "p-house", "stageId": STAGE_1})
    done = stage(STAGE_1)
    assert done["reservedOrderCount"] == 0
    assert done["preparingOrderCount"] == preparing + reserved
    assert done["harvestStarted"] is True
    assert stage(STAGE_2)["harvestStarted"] is False


def test_AC_14_5_harvest_todo_counts_closed_stages_only(client, login):
    producer = login("u-kang")
    reserved = sum(
        1 for sid, st in _statuses().values() if sid == STAGE_1 and st == "RESERVED"
    )
    assert reserved > 0

    def todo():
        return client.get("/api/orders/producer/dashboard", headers=producer).json()["todo"]

    # 테스트 기준일 2026-10-07(KST). 1단계는 10-12까지라 아직 열림
    opened = todo()
    target = next(t for t in opened["harvestTargets"] if t["stageId"] == STAGE_1)
    assert (target["count"], target["closed"], target["productId"]) == (reserved, False, "p-house")
    assert target["stageName"] == "1단계"
    closed_before = sum(t["count"] for t in opened["harvestTargets"] if t["closed"])
    assert opened["toHarvest"] == closed_before

    _set_stage_dates(STAGE_1, "2026-09-20", "2026-10-07")  # 오늘 끝나는 기간은 아직 열림
    assert next(t for t in todo()["harvestTargets"] if t["stageId"] == STAGE_1)["closed"] is False

    _set_stage_dates(STAGE_1, "2026-09-20", "2026-10-06")  # 어제 끝남
    closed = todo()
    assert next(t for t in closed["harvestTargets"] if t["stageId"] == STAGE_1)["closed"] is True
    assert closed["toHarvest"] == closed_before + reserved

    client.post(URL, headers=producer | key(), json={"productId": "p-house", "stageId": STAGE_1})
    after = todo()
    assert all(t["stageId"] != STAGE_1 for t in after["harvestTargets"])
    assert after["toHarvest"] == closed_before
