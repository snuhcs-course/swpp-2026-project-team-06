"""DEV-339: period history metadata and write guards use the same order history."""

from copy import deepcopy

import pytest

from app.catalog.models import StageAllocation
from app.core.db import get_sessionmaker
from app.orders.models import Order
from tests.test_catalog import _period_fixture, _period_inputs, key


@pytest.mark.parametrize("status", ["PREPARING", "CANCELED"])
def test_DEV339_historical_order_locks_period_even_with_zero_reserved_boxes(client, login, status):
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

    changed_dates = deepcopy(_period_inputs(before))
    changed_dates[0]["startsAt"] = "2026-10-11"
    deleted_period = deepcopy(_period_inputs(before))[1:]
    for stages in (changed_dates, deleted_period):
        refused = client.put(
            f"/api/products/{pid}/stages",
            headers=headers | key(),
            json={"version": before["version"], "stages": stages},
        )
        assert refused.status_code == 409, refused.text
        assert refused.json()["details"]["reason"] == "PERIOD_LOCKED"
        after = client.get(f"/api/products/mine/{pid}", headers=headers).json()
        assert after["version"] == before["version"]
        assert after["stages"] == before["stages"]
