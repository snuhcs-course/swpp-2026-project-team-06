"""DEV-339: period history metadata and write guards use the same order history."""

from copy import deepcopy

import pytest

from app.catalog.models import StageAllocation
from app.core.db import get_sessionmaker
from app.orders.models import Order
from tests.test_catalog import _period_fixture, _period_inputs, key


@pytest.mark.parametrize("status", ["PREPARING", "CANCELED"])
def test_DEV339_DEV489_history_blocks_period_deletion_with_zero_reserved(client, login, status):
    headers = login("u-kang")
    pid, initial = _period_fixture(client, headers)
    stage_id = initial["stages"][0]["stageId"]
    # Reuse an independently seeded order, retaining the original order snapshot.
    # A canceled order has no current reserved quantity but remains period history.
    with get_sessionmaker()() as db, db.begin():
        order = db.get(Order, "o-42")
        order.product_id = pid
        order.stage_id = stage_id
        order.status = status
        db.get(StageAllocation, (stage_id, "opt-5")).reserved_count = 0

    before = client.get(f"/api/products/mine/{pid}", headers=headers).json()
    assert before["stages"][0]["hasOrders"] is True
    assert before["stages"][1]["hasOrders"] is False
    assert before["stages"][0]["options"]["opt-5"]["reservedCount"] == 0

    # DEV-489: deleting a period with order history is still refused.
    deleted_period = deepcopy(_period_inputs(before))[1:]
    refused = client.put(
        f"/api/products/{pid}/stages",
        headers=headers | key(),
        json={"version": before["version"], "stages": deleted_period},
    )
    assert refused.status_code == 409, refused.text
    assert refused.json()["details"]["reason"] == "PERIOD_LOCKED"
    after = client.get(f"/api/products/mine/{pid}", headers=headers).json()
    assert after["version"] == before["version"]
    assert after["stages"] == before["stages"]


@pytest.mark.parametrize("status", ["PREPARING", "CANCELED"])
def test_DEV489_period_with_order_history_redates_and_keeps_orders(client, login, status):
    headers = login("u-kang")
    pid, initial = _period_fixture(client, headers)
    stage_id = initial["stages"][0]["stageId"]
    with get_sessionmaker()() as db, db.begin():
        order = db.get(Order, "o-42")
        order.product_id = pid
        order.stage_id = stage_id
        order.status = status
        snapshot = (order.unit_price, order.unit_weight_grams, order.quantity)

    before = client.get(f"/api/products/mine/{pid}", headers=headers).json()
    assert before["stages"][0]["hasOrders"] is True
    changed_dates = deepcopy(_period_inputs(before))
    changed_dates[0]["startsAt"] = "2026-10-11"
    saved = client.put(
        f"/api/products/{pid}/stages",
        headers=headers | key(),
        json={"version": before["version"], "stages": changed_dates},
    )
    assert saved.status_code == 200, saved.text
    first = saved.json()["stages"][0]
    assert first["stageId"] == stage_id
    assert first["startsAt"] == "2026-10-11"
    with get_sessionmaker()() as db:
        order = db.get(Order, "o-42")
        assert order.stage_id == stage_id
        assert (order.unit_price, order.unit_weight_grams, order.quantity) == snapshot
