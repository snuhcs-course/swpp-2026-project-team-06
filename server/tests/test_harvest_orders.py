"""고른 주문 수확 시작(DEV-361, FEAT-17 AC-17-11·AC-17-12).

주문·출하 화면 예약 탭에서 고른 주문을 예약 기간과 상관없이 한 번에 출하 준비로 옮긴다.
"""

from sqlalchemy import func, select, update

from app.admin.models import ManagerEvent
from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.orders.models import Order
from tests.test_harvest_start import STAGE_2, _move_to_stage, _new_reserved
from tests.test_orders import deposit, key, order_body

URL = "/api/orders/producer/harvest-orders"
HALLA_RESERVED = "o-11"  # 시드: 다른 농가(f-halla) p-noji의 예약 완료 주문


def _status() -> dict[str, str]:
    with get_sessionmaker()() as session:
        return {oid: status for oid, status in session.execute(select(Order.id, Order.status))}


def _events() -> list[ManagerEvent]:
    with get_sessionmaker()() as session:
        query = select(ManagerEvent).where(ManagerEvent.event_type == "orders.harvest_started")
        return list(session.scalars(query))


def test_AC_17_11_moves_only_picked_reserved_across_stages(client, login):
    producer, consumer = login("u-kang"), login("u-seojun")
    first = _new_reserved(client, login)
    later = _new_reserved(client, login, optionId="opt-10")
    _move_to_stage(later, STAGE_2)  # 기간이 달라도 함께 옮긴다
    left = _new_reserved(client, login)  # 고르지 않은 예약 완료
    waiting = client.post("/api/orders", headers=consumer | key(), json=order_body()).json()
    assert deposit(client, consumer, waiting["orderId"]).status_code == 200
    before = _status()

    response = client.post(
        URL,
        headers=producer | key(),
        json={"orderIds": [first, later, waiting["orderId"], first]},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["changed"] == 2
    assert set(body["orderIds"]) == {first, later}
    assert body["skipped"] == 1  # 입금 대기는 건너뜀(중복 id는 한 번만 셈)
    after = _status()
    assert after[first] == after[later] == "PREPARING"
    assert after[left] == "RESERVED"
    assert after[waiting["orderId"]] == "AWAITING_DEPOSIT"
    assert {o: s for o, s in after.items() if o not in (first, later)} == {
        o: s for o, s in before.items() if o not in (first, later)
    }
    events = _events()
    assert len(events) == 1
    assert (events[0].target_type, events[0].target_id, events[0].actor_id) == (
        "farm",
        "f-kang",
        "u-kang",
    )
    assert set(events[0].result["orderIds"]) == {first, later}


def test_AC_17_11_skips_order_canceled_before_harvest(client, login):
    producer, consumer = login("u-kang"), login("u-seojun")
    keep = _new_reserved(client, login)
    gone = _new_reserved(client, login)
    canceled = client.post(f"/api/orders/{gone}/cancel", headers=consumer)
    assert canceled.status_code == 200, canceled.text

    response = client.post(URL, headers=producer | key(), json={"orderIds": [keep, gone]})

    assert response.status_code == 200, response.text
    assert response.json() == {"changed": 1, "orderIds": [keep], "skipped": 1}
    assert _status()[gone] == canceled.json()["status"]


def test_AC_17_12_other_farm_order_is_404_and_nothing_changes(client, login, other_farm_headers):
    producer = login("u-kang")
    mine = _new_reserved(client, login)
    before = _status()

    mixed = client.post(URL, headers=producer | key(), json={"orderIds": [mine, HALLA_RESERVED]})
    assert mixed.status_code == 404, mixed.text
    missing = client.post(URL, headers=producer | key(), json={"orderIds": [mine, "o-none"]})
    assert missing.status_code == 404, missing.text
    # 다른 농가가 강 농가 주문을 보낸 경우
    foreign = client.post(URL, headers=other_farm_headers | key(), json={"orderIds": [mine]})
    assert foreign.status_code == 404, foreign.text

    assert _status() == before
    assert _events() == []


def test_AC_17_12_same_key_replays_and_new_key_moves_nothing(client, login):
    producer = login("u-kang")
    order_id = _new_reserved(client, login)
    headers = producer | key()
    body = {"orderIds": [order_id]}

    first = client.post(URL, headers=headers, json=body)
    replay = client.post(URL, headers=headers, json=body)

    assert first.status_code == replay.status_code == 200
    assert replay.json() == first.json() == {"changed": 1, "orderIds": [order_id], "skipped": 0}
    again = client.post(URL, headers=producer | key(), json=body)
    assert again.status_code == 200, again.text
    assert again.json() == {"changed": 0, "orderIds": [], "skipped": 1}
    assert len(_events()) == 1  # 재시도·0건은 감사를 남기지 않는다
    other_body = client.post(URL, headers=headers, json={"orderIds": [order_id, order_id + "x"]})
    assert other_body.status_code == 409, other_body.text  # 같은 키에 다른 내용


def test_AC_17_12_missing_key_and_empty_list_are_400(client, login):
    producer = login("u-kang")
    order_id = _new_reserved(client, login)
    before = _status()

    no_key = client.post(URL, headers=producer, json={"orderIds": [order_id]})
    empty = client.post(URL, headers=producer | key(), json={"orderIds": []})

    assert no_key.status_code == 400, no_key.text
    assert empty.status_code == 400, empty.text
    assert _status() == before


def test_AC_17_11_old_stage_endpoint_still_works(client, login):
    """예전 앱 빌드 호환: 기간 단위 harvest-start도 그대로 돈다."""
    producer = login("u-kang")
    order_id = _new_reserved(client, login)
    response = client.post(
        "/api/orders/producer/harvest-start",
        headers=producer | key(),
        json={"productId": "p-house", "stageId": "st-house-1"},
    )
    assert response.status_code == 200, response.text
    assert order_id in response.json()["orderIds"]


def _move_to_product(order_id: str, product_id: str, stage_id: str, option_id: str) -> None:
    """같은 농가의 다른 상품 예약 완료를 만든다(시드 레드향 1단계는 품절이라 주문을 옮긴다)."""
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(Order)
            .where(Order.id == order_id)
            .values(product_id=product_id, stage_id=stage_id, option_id=option_id)
        )


def test_AC_14_5_todo_and_harvest_count_across_products(client, login):
    """할 일 수와 수확 시작은 상품과 상관없이 농가 전체 예약 완료를 다룬다(DEV-361)."""
    producer = login("u-kang")
    house = _new_reserved(client, login)
    red = _new_reserved(client, login)
    _move_to_product(red, "p-redhyang", "st-redhyang-2", "opt-3")

    def to_harvest() -> int:
        response = client.get("/api/orders/producer/dashboard", headers=producer)
        return response.json()["todo"]["toHarvest"]

    before = to_harvest()
    with get_sessionmaker()() as session:
        farm_reserved = session.scalar(
            select(func.count())
            .select_from(Order)
            .join(Product, Product.id == Order.product_id)
            .where(Product.farm_id == "f-kang", Order.status == "RESERVED")
        )
    assert before == farm_reserved
    assert {"p-house", "p-redhyang"} <= {
        pid
        for pid, st in get_sessionmaker()().execute(select(Order.product_id, Order.status))
        if st == "RESERVED"
    }

    response = client.post(URL, headers=producer | key(), json={"orderIds": [house, red]})

    assert response.status_code == 200, response.text
    assert set(response.json()["orderIds"]) == {house, red}
    assert _status()[red] == "PREPARING"
    assert to_harvest() == before - 2
