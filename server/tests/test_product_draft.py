"""DEV-361: a buyer-visible product's changes stay private until '상품에 반영' (apply-all).

FEAT-04·05, R-18 (later periods not cheaper), R-21 (delivery window consent), R-25 (new orders
only), PERIOD_LOCKED. Pending-approval changes need no re-approval; admins see a change history.
"""

from uuid import uuid4

from sqlalchemy import select

from app.catalog.models import CapacityRequest, Product, ProductChangeEvent
from app.core.db import get_sessionmaker
from app.orders.models import Order
from app.source_analysis.models import ProductWorkspace
from tests.test_source_analysis import source_settings  # noqa: F401
from tests.test_source_page_migration import (
    SOURCE,
    apply_latest,
    drafts,
    open_composer,
    set_modules,
)

BASE = "/api/source-analysis/product-workspaces"


def h(login, user="u-kang"):
    return {**login(user), "Idempotency-Key": str(uuid4())}


def workspace(client, login, pid="p-house"):
    return open_composer(client, login, pid)


def put_draft(client, login, pid, version, fields=None, stages=None, headers=None):
    body = {"version": version, "fields": fields or {}}
    if stages is not None:
        body["stages"] = stages
    return client.put(f"{BASE}/{pid}/product-draft", headers=headers or h(login), json=body)


def draft_view(client, login, pid="p-house"):
    response = client.get(f"{BASE}/{pid}/product-draft", headers=login("u-kang"))
    assert response.status_code == 200, response.text
    return response.json()


def apply_all(client, login, pid, version, **extra):
    return client.post(
        f"{BASE}/{pid}/apply-all", headers=h(login), json={"version": version, **extra}
    )


def mine(client, login, pid="p-house"):
    return client.get(f"/api/products/mine/{pid}", headers=login("u-kang")).json()


def stage_inputs(product):
    return [
        {
            "stageId": s["stageId"],
            "startsAt": s["startsAt"],
            "endsAt": s["endsAt"],
            "options": {
                oid: {"price": v["price"], "quantity": v["quantity"]}
                for oid, v in s["options"].items()
            },
        }
        for s in product["stages"]
    ]


def saved(client, login, pid="p-house", fields=None, stages=None):
    row = workspace(client, login, pid)
    response = put_draft(client, login, pid, row["version"], fields, stages)
    assert response.status_code == 200, response.text
    return response.json()


def events(pid):
    with get_sessionmaker()() as db:
        return list(
            db.scalars(select(ProductChangeEvent).where(ProductChangeEvent.product_id == pid))
        )


def test_AC_04_DEV_361_draft_is_hidden_from_buyers_until_apply_all(client, login):
    before = client.get("/api/products/p-house").json()
    view = saved(
        client,
        login,
        fields={
            "name": "하우스 감귤 새 이름",
            "variety": "궁천조생",  # same as the product: not a change
            "expectedBrix": 13.5,
            "info": {"origin": "제주 서귀포시 효돈동"},
        },
    )
    assert view["draft"]["fields"] == {
        "name": "하우스 감귤 새 이름",
        "expectedBrix": 13.5,
        "info": {"origin": "제주 서귀포시 효돈동"},
    }
    assert [c["field"] for c in view["changes"]["now"]] == ["name", "expectedBrix", "info.origin"]
    assert view["changes"]["now"][0] == {
        "field": "name",
        "label": "상품명",
        "before": "하우스 감귤 5kg / 10kg",
        "after": "하우스 감귤 새 이름",
    }
    assert view["conflicts"] == []
    # Buyers and the producer's product still see the old values.
    assert client.get("/api/products/p-house").json() == before
    assert mine(client, login)["name"] == "하우스 감귤 5kg / 10kg"
    opened = workspace(client, login)
    assert opened["hasProductDraft"] is True and "productDraft" not in opened

    applied = apply_all(client, login, "p-house", view["version"])
    assert applied.status_code == 200, applied.text
    body = applied.json()
    assert body["product"]["name"] == "하우스 감귤 새 이름"
    assert body["pageApplied"] is False and body["deliveryWindowProposed"] is False
    detail = client.get("/api/products/p-house").json()
    assert (detail["name"], detail["expectedBrix"], detail["info"]["origin"]) == (
        "하우스 감귤 새 이름",
        13.5,
        "제주 서귀포시 효돈동",
    )
    assert draft_view(client, login)["draft"] is None
    [event] = events("p-house")
    assert (event.product_status, event.actor_user_id, event.page_changed) == (
        "PUBLISHED",
        "u-kang",
        False,
    )
    assert [c["field"] for c in event.changes] == ["name", "expectedBrix", "info.origin"]


def test_DEV_361_photos_draft_reports_the_cover_change_without_uris(client, login):
    product = mine(client, login)
    flipped = list(reversed(product["photos"]))
    view = saved(client, login, fields={"photos": flipped})
    assert view["changes"]["now"] == [
        {"field": "photos", "label": "사진", "before": "2장", "after": "2장 · 대표사진 바뀜"}
    ]
    assert client.get("/api/products/p-house").json()["photo"] == product["photos"][0]
    assert apply_all(client, login, "p-house", view["version"]).status_code == 200
    assert client.get("/api/products/p-house").json()["photo"] == flipped[0]
    assert "/" not in str(events("p-house")[0].changes)  # no photo address in the history


def test_DEV_361_save_replaces_the_draft_and_discard_clears_it(client, login):
    view = saved(client, login, fields={"name": "임시 이름", "grade": "상"})
    again = put_draft(client, login, "p-house", view["version"], {"grade": "상"})
    assert again.status_code == 200
    assert again.json()["draft"]["fields"] == {"grade": "상"}
    same = put_draft(client, login, "p-house", again.json()["version"], {"grade": "특"})
    assert same.json()["draft"] is None  # equal to the product: nothing to apply
    stale = put_draft(client, login, "p-house", view["version"], {"grade": "상"})
    assert stale.status_code == 409
    assert stale.json()["details"]["reason"] == "VERSION_MISMATCH"
    kept = put_draft(client, login, "p-house", same.json()["version"], {"grade": "상"}).json()
    dropped = client.delete(
        f"{BASE}/p-house/product-draft?version={kept['version']}", headers=login("u-kang")
    )
    assert dropped.status_code == 200 and dropped.json()["draft"] is None
    nothing = apply_all(client, login, "p-house", dropped.json()["version"])
    assert nothing.status_code == 400


def test_DEV_361_draft_shape_is_validated_on_save(client, login):
    row = workspace(client, login)
    for fields in (
        {"name": None},
        {"maxQuantityPerOrder": 5},  # sales settings stay immediate
        {"options": [{"label": "3kg", "weightKg": 3}]},  # a new option needs its own id
        {"photos": ["javascript:alert(1)"]},
        {"info": {"origin": None}},
        {"shipping_fee": None},  # snake_case names are read too
    ):
        response = put_draft(client, login, "p-house", row["version"], fields)
        assert response.status_code == 400, fields


def test_DEV_361_pre_sale_product_keeps_direct_save(client, login):
    row = workspace(client, login, "p-hallabong")
    refused = put_draft(client, login, "p-hallabong", row["version"], {"name": "새 이름"})
    assert refused.status_code == 409
    assert refused.json()["details"]["reason"] == "INVALID_TRANSITION"
    assert apply_all(client, login, "p-hallabong", row["version"]).status_code == 409
    product = mine(client, login, "p-hallabong")
    patched = client.patch(
        "/api/products/p-hallabong",
        headers=h(login),
        json={"version": product["version"], "name": "바로 저장"},
    )
    assert patched.status_code == 200 and patched.json()["name"] == "바로 저장"


def test_DEV_361_closed_product_stays_non_editable(client, login):
    row = workspace(client, login, "p-josaeng")
    refused = put_draft(client, login, "p-josaeng", row["version"], {"name": "새 이름"})
    assert refused.status_code == 409
    assert refused.json()["details"]["reason"] == "INVALID_TRANSITION"
    with get_sessionmaker()() as db:  # a draft left from before the product closed
        db.get(ProductWorkspace, "p-josaeng").product_draft = {
            "values": {"name": "새 이름"},
            "base": {"name": db.get(Product, "p-josaeng").name},
            "savedAt": "2026-10-06T10:00:00+09:00",
        }
        db.commit()
    closed = apply_all(client, login, "p-josaeng", row["version"])
    assert closed.status_code == 409
    assert closed.json()["details"]["reason"] == "INVALID_TRANSITION"


def test_AC_05_R_25_price_and_boxes_reach_new_orders_only(client, login):
    product = mine(client, login)
    stages = stage_inputs(product)
    stages[1]["options"]["opt-5"] = {"price": 34000, "quantity": 70}
    view = saved(client, login, stages=stages)
    [entry] = view["changes"]["newOrders"]
    assert entry["field"] == "stages" and "34,000원·70박스" in entry["after"]
    assert view["changes"]["now"] == [] and view["changes"]["consent"] == []
    assert mine(client, login)["stages"][1]["options"]["opt-5"]["price"] == 33000
    assert apply_all(client, login, "p-house", view["version"]).status_code == 200
    detail = client.get("/api/products/p-house").json()
    assert detail["stages"][1]["options"]["opt-5"] == {
        "price": 34000,
        "quantity": 70,
        "reservedCount": 0,
    }
    with get_sessionmaker()() as db:
        assert db.get(Order, "o-42").unit_price == 29000  # the paid order keeps its price


def test_AC_05_R_18_later_period_cheaper_is_refused_on_apply(client, login):
    stages = stage_inputs(mine(client, login))
    stages[2]["options"]["opt-5"]["price"] = 30000  # cheaper than period 2 (33,000)
    view = saved(client, login, fields={"name": "같이 바꿀 이름"}, stages=stages)
    refused = apply_all(client, login, "p-house", view["version"])
    assert refused.status_code == 400
    assert "stages.2.opt-5.price" in refused.json()["details"]["fields"]
    # One transaction: neither the name nor the stages changed, and the draft is still there.
    assert mine(client, login)["name"] == "하우스 감귤 5kg / 10kg"
    assert mine(client, login)["stages"][2]["options"]["opt-5"]["price"] == 36000
    assert draft_view(client, login)["draft"] is not None
    assert events("p-house") == []


def test_AC_05_period_with_orders_is_locked_on_apply(client, login):
    stages = stage_inputs(mine(client, login))
    stages[0]["endsAt"] = "2026-10-11"  # period 1 has o-42
    view = saved(client, login, stages=stages)
    locked = apply_all(client, login, "p-house", view["version"])
    assert locked.status_code == 409
    assert locked.json()["details"]["reason"] == "PERIOD_LOCKED"


def test_AC_04_R_21_delivery_window_change_asks_for_consent(client, login):
    window = {"start": "2026-11-12", "end": "2026-11-22"}
    with get_sessionmaker()() as db:
        people = len(
            set(
                db.scalars(
                    select(Order.consumer_id).where(
                        Order.product_id == "p-house",
                        Order.status.in_(("AWAITING_DEPOSIT", "RESERVED", "PREPARING")),
                    )
                )
            )
        )
    assert people > 1  # the seed's house orders: one person counts once
    view = saved(client, login, fields={"deliveryWindow": window})
    assert view["reservedCount"] == people
    [entry] = view["changes"]["consent"]
    assert entry == {
        "field": "deliveryWindow",
        "label": "받는 시기",
        "before": "2026-11-10 ~ 2026-11-20",
        "after": "2026-11-12 ~ 2026-11-22",
    }
    asked = apply_all(client, login, "p-house", view["version"])
    assert asked.status_code == 409
    details = asked.json()["details"]
    assert (details["reason"], details["reservedCount"]) == ("DELIVERY_CONSENT_REQUIRED", people)
    with get_sessionmaker()() as db:
        assert db.get(Order, "o-42").proposed_delivery_start is None
    stale = apply_all(  # more people reserved since the producer looked
        client,
        login,
        "p-house",
        view["version"],
        confirmDeliveryChange=True,
        confirmedReservedCount=people - 1,
    )
    assert stale.status_code == 409
    assert stale.json()["details"]["reservedCount"] == people
    applied = apply_all(
        client,
        login,
        "p-house",
        view["version"],
        confirmDeliveryChange=True,
        confirmedReservedCount=people,
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["deliveryWindowProposed"] is True
    with get_sessionmaker()() as db:
        order = db.get(Order, "o-42")
        assert (str(order.proposed_delivery_start), str(order.delivery_start)) == (
            "2026-11-12",
            "2026-11-10",  # the order keeps its window until the buyer agrees
        )
    [event] = events("p-house")
    assert (event.delivery_window_proposed, event.reserved_count) == (True, people)


def test_AC_04_R_21_delivery_window_without_reservations_needs_no_consent(client, login):
    window = {"start": "2027-01-12", "end": "2027-01-22"}
    view = saved(client, login, "p-cheonggyeon", fields={"deliveryWindow": window})
    assert view["reservedCount"] == 0 and view["changes"]["consent"] == []
    assert [c["field"] for c in view["changes"]["newOrders"]] == ["deliveryWindow"]
    assert apply_all(client, login, "p-cheonggyeon", view["version"]).status_code == 200


def test_AC_04_delivery_window_must_stay_after_the_last_period(client, login):
    window = {"start": "2026-11-08", "end": "2026-11-20"}  # period 3 ends 11-09
    view = saved(client, login, fields={"deliveryWindow": window})
    refused = apply_all(client, login, "p-house", view["version"], confirmDeliveryChange=True)
    assert refused.status_code == 400
    assert "deliveryWindow" in refused.json()["details"]["fields"]


def test_AC_05_new_option_with_its_prices_applies_together(client, login):
    product = mine(client, login)
    options = [
        {k: o[k] for k in ("optionId", "label", "weightKg", "note")} for o in product["options"]
    ]
    options.append({"optionId": "opt-3", "label": "3kg", "weightKg": 3, "note": None})
    alone = saved(client, login, fields={"options": options})
    missing = apply_all(client, login, "p-house", alone["version"])
    assert missing.status_code == 400  # a new option without period prices
    stages = stage_inputs(product)
    for i, price in enumerate((19000, 21000, 23000)):
        stages[i]["options"]["opt-3"] = {"price": price, "quantity": 10}
    view = put_draft(client, login, "p-house", alone["version"], {"options": options}, stages)
    assert view.status_code == 200, view.text
    groups = view.json()["changes"]
    assert [c["field"] for c in groups["now"]] == ["options"]  # labels show on orders at once
    assert [c["field"] for c in groups["newOrders"]] == ["stages"]
    applied = apply_all(client, login, "p-house", view.json()["version"])
    assert applied.status_code == 200, applied.text
    detail = client.get("/api/products/p-house").json()
    assert [o["optionId"] for o in detail["options"]] == ["opt-5", "opt-10", "opt-3"]
    assert detail["stages"][0]["options"]["opt-3"]["price"] == 19000


def test_DEV_361_field_changed_elsewhere_is_a_conflict_but_settings_are_not(client, login):
    view = saved(client, login, fields={"name": "초안 이름", "grade": "상"})
    product = mine(client, login)
    settings = client.put(
        "/api/products/p-house/sales-settings",
        headers=h(login),
        json={
            "salesLimitGrams": product["salesLimitGrams"],
            "maxQuantityPerOrder": 4,
            "salesPaused": False,
            "version": product["version"],
        },
    )
    assert settings.status_code == 200, settings.text  # bumps product.version only
    assert draft_view(client, login)["conflicts"] == []
    product = mine(client, login)
    patched = client.patch(  # an older app build edits the product directly
        "/api/products/p-house",
        headers=h(login),
        json={"version": product["version"], "name": "다른 곳 이름"},
    )
    assert patched.status_code == 200
    assert draft_view(client, login)["conflicts"] == ["name"]
    refused = apply_all(client, login, "p-house", view["version"])
    assert refused.status_code == 409
    details = refused.json()["details"]
    assert (details["reason"], details["fields"]) == ("PRODUCT_CHANGED", ["name"])
    # Saving the field again keeps its original base, so the conflict stays until confirmed.
    again = put_draft(
        client, login, "p-house", view["version"], {"name": "초안 이름", "grade": "상"}
    )
    assert again.json()["conflicts"] == ["name"]
    confirmed = client.put(
        f"{BASE}/p-house/product-draft",
        headers=h(login),
        json={
            "version": again.json()["version"],
            "fields": {"name": "초안 이름", "grade": "상"},
            "rebase": ["name"],
        },
    )
    assert confirmed.status_code == 200 and confirmed.json()["conflicts"] == []
    unknown = client.put(
        f"{BASE}/p-house/product-draft",
        headers=h(login),
        json={"version": confirmed.json()["version"], "fields": {}, "rebase": ["nmae"]},
    )
    assert unknown.status_code == 400  # a misspelt field never silently keeps the conflict
    assert apply_all(client, login, "p-house", confirmed.json()["version"]).status_code == 200
    assert (mine(client, login)["name"], mine(client, login)["grade"]) == ("초안 이름", "상")


def test_DEV_361_dropping_a_conflicting_field_keeps_the_other_change(client, login):
    view = saved(client, login, fields={"name": "초안 이름", "grade": "상"})
    product = mine(client, login)
    client.patch(
        "/api/products/p-house",
        headers=h(login),
        json={"version": product["version"], "name": "다른 곳 이름"},
    )
    dropped = put_draft(client, login, "p-house", view["version"], {"grade": "상"})
    assert dropped.json()["conflicts"] == []
    assert apply_all(client, login, "p-house", dropped.json()["version"]).status_code == 200
    assert mine(client, login)["name"] == "다른 곳 이름"


def test_DEV_361_same_change_made_elsewhere_is_not_a_conflict(client, login):
    view = saved(client, login, fields={"grade": "상"})
    product = mine(client, login)
    client.patch(
        "/api/products/p-house",
        headers=h(login),
        json={"version": product["version"], "grade": "상"},
    )
    applied = apply_all(client, login, "p-house", view["version"])
    assert applied.status_code == 200
    assert applied.json()["changes"]["now"] == [] and applied.json()["changeId"] is None
    assert events("p-house") == []  # nothing left to change: no history line


def test_DEV_361_pending_approval_change_needs_no_reapproval_and_is_recorded(
    client, login, admin_headers
):
    stages = stage_inputs(mine(client, login, "p-cheonggyeon"))
    stages[0]["options"]["opt-5"]["price"] = 28000
    view = saved(client, login, "p-cheonggyeon", fields={"name": "청견 새 이름"}, stages=stages)
    applied = apply_all(client, login, "p-cheonggyeon", view["version"])
    assert applied.status_code == 200, applied.text
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-cheonggyeon")
        request = db.get(CapacityRequest, "capacity-p-cheonggyeon")
        assert (product.status, product.name) == ("PENDING_APPROVAL", "청견 새 이름")
        assert (request.status, request.version) == ("PENDING", 1)  # same request, not reset
    # Direct edits stay refused while pending (older clients see the same rule as before).
    refused = client.patch(
        "/api/products/p-cheonggyeon",
        headers=h(login),
        json={"version": applied.json()["productVersion"], "name": "직접"},
    )
    assert refused.status_code == 409

    history = client.get("/admin/products/p-cheonggyeon/changes", headers=admin_headers)
    assert history.status_code == 200, history.text
    [event] = history.json()
    assert event["productStatus"] == "PENDING_APPROVAL"
    assert event["actorUserId"] == "u-kang"
    assert [(c["field"], c["before"], c["after"]) for c in event["changes"]] == [
        ("name", "청견 5kg", "청견 새 이름"),
        ("stages", "10.15~11.15 5kg 27,000원·50박스", "10.15~11.15 5kg 28,000원·50박스"),
    ]
    listed = client.get("/admin/capacity-requests?kind=all", headers=admin_headers).json()
    row = next(r for r in listed if r["requestId"] == "capacity-p-cheonggyeon")
    assert row["changesSinceRequest"] == 1
    assert row["productName"] == "청견 새 이름"
    approved = client.post(
        "/admin/products/p-cheonggyeon/capacity-requests/capacity-p-cheonggyeon/approve",
        headers=admin_headers | {"Idempotency-Key": str(uuid4())},
        json={"version": 1},
    )
    assert approved.status_code == 200, approved.text
    assert client.get("/api/products/p-cheonggyeon").json()["name"] == "청견 새 이름"


def test_DEV_361_change_history_is_admin_only(client, login, admin_headers):
    assert client.get("/admin/products/p-house/changes").status_code == 401
    producer = client.get("/admin/products/p-house/changes", headers=login("u-kang"))
    assert producer.status_code == 403
    assert client.get("/admin/products/p-none/changes", headers=admin_headers).status_code == 404
    assert client.get("/admin/products/p-house/changes", headers=admin_headers).json() == []


def test_DEV_361_other_farm_cannot_read_or_apply_the_draft(client, login, other_farm_headers):
    view = saved(client, login, fields={"name": "남의 초안"})
    assert (
        client.get(f"{BASE}/p-house/product-draft", headers=other_farm_headers).status_code == 404
    )
    other = client.post(
        f"{BASE}/p-house/apply-all",
        headers=other_farm_headers | {"Idempotency-Key": str(uuid4())},
        json={"version": view["version"]},
    )
    assert other.status_code == 404
    assert mine(client, login)["name"] == "하우스 감귤 5kg / 10kg"


def test_DEV_361_apply_all_replays_the_same_response(client, login):
    view = saved(client, login, fields={"grade": "상"})
    headers = h(login)
    first = client.post(
        f"{BASE}/p-house/apply-all", headers=headers, json={"version": view["version"]}
    )
    second = client.post(
        f"{BASE}/p-house/apply-all", headers=headers, json={"version": view["version"]}
    )
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(events("p-house")) == 1


def page_draft(client, login, row):
    draft = drafts(client, login, row["batchId"])[0]
    return {"draftId": draft["id"], "draftVersion": draft["version"]}


def test_AC_SRC_9_DEV_361_page_and_product_apply_together(client, login):
    set_modules()
    row = workspace(client, login)
    save_page(row, ["hero", "taste"])  # the size photo module is switched off
    page = page_draft(client, login, row)
    view = put_draft(client, login, "p-house", row["version"], {"name": "페이지와 함께"}).json()
    applied = apply_all(client, login, "p-house", view["version"], page=page)
    assert applied.status_code == 200, applied.text
    assert applied.json()["pageApplied"] is True
    assert [c["field"] for c in applied.json()["changes"]["now"]] == ["name", "page"]
    with get_sessionmaker()() as db:
        product = db.get(Product, "p-house")
        assert product.name == "페이지와 함께"
        assert [m["id"] for m in product.module_detail["modules"]] == ["hero", "taste"]
    [event] = events("p-house")
    assert event.page_changed is True


def test_AC_SRC_9_DEV_361_failed_page_apply_rolls_back_the_product(client, login):
    set_modules()
    row = workspace(client, login)
    page = {**page_draft(client, login, row), "draftVersion": 99}
    view = put_draft(client, login, "p-house", row["version"], {"name": "롤백될 이름"}).json()
    failed = apply_all(client, login, "p-house", view["version"], page=page)
    assert failed.status_code == 409
    assert mine(client, login)["name"] == "하우스 감귤 5kg / 10kg"
    assert draft_view(client, login)["draft"]["fields"] == {"name": "롤백될 이름"}
    assert events("p-house") == []


def test_AC_SRC_9_DEV_361_untouched_page_apply_is_no_change(client, login):
    set_modules()
    row = workspace(client, login)  # the page migrated as it is
    applied = apply_all(
        client, login, "p-house", row["version"], page=page_draft(client, login, row)
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["pageApplied"] is True
    assert applied.json()["changes"]["now"] == [] and applied.json()["changeId"] is None
    assert events("p-house") == []


def test_AC_SRC_9_DEV_361_page_only_apply_is_recorded(client, login):
    set_modules()
    row = workspace(client, login, "p-house")
    save_page(row, ["hero", "taste"])
    applied = apply_all(
        client, login, "p-house", row["version"], page=page_draft(client, login, row)
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["changes"]["now"] == [
        {"field": "page", "label": "판매페이지", "before": None, "after": None}
    ]
    assert events("p-house")[0].changes == applied.json()["changes"]["now"]


def test_AC_SRC_9_DEV_361_page_cover_must_match_the_drafted_first_photo(client, login):
    set_modules()
    row = workspace(client, login)
    flipped = list(reversed(mine(client, login)["photos"]))  # the page keeps the current cover
    view = put_draft(client, login, "p-house", row["version"], {"photos": flipped}).json()
    page = page_draft(client, login, row)
    refused = apply_all(client, login, "p-house", view["version"], page=page)
    assert refused.status_code == 409
    assert refused.json()["details"]["reason"] == "PHOTO_CHANGED"
    assert mine(client, login)["photos"] == list(reversed(flipped))  # nothing applied
    assert events("p-house") == []
    # Without the page the drafted order applies on its own.
    assert apply_all(client, login, "p-house", view["version"]).status_code == 200
    assert mine(client, login)["photos"] == flipped


def test_DEV_361_draft_left_from_review_applies_after_rejection(client, login, admin_headers):
    view = saved(client, login, "p-cheonggyeon", fields={"name": "심사 중 고친 이름"})
    rejected = client.post(
        "/admin/products/p-cheonggyeon/capacity-requests/capacity-p-cheonggyeon/reject",
        headers=admin_headers | {"Idempotency-Key": str(uuid4())},
        json={"version": 1, "reason": "사진을 더 올려 주세요"},
    )
    assert rejected.status_code == 200, rejected.text
    left = draft_view(client, login, "p-cheonggyeon")
    assert (left["productStatus"], left["draft"]["fields"]) == (
        "REJECTED",
        {"name": "심사 중 고친 이름"},
    )
    more = put_draft(client, login, "p-cheonggyeon", view["version"], {"name": "또"})
    assert more.status_code == 409  # before sale: edit the product directly
    applied = apply_all(client, login, "p-cheonggyeon", view["version"])
    assert applied.status_code == 200, applied.text
    product = mine(client, login, "p-cheonggyeon")
    assert (product["status"], product["name"]) == ("DRAFT", "심사 중 고친 이름")
    assert draft_view(client, login, "p-cheonggyeon")["draft"] is None
    assert apply_all(client, login, "p-cheonggyeon", applied.json()["version"]).status_code == 409


def pick_cover(client, login, row, uri):
    """Choose a referenced page photo as the composer cover and re-save the draft."""
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    story = next(s for s in batch["sources"] if s["productPhoto"]["uri"] == uri)
    picked = client.put(
        f"{SOURCE}/{row['batchId']}/representative",
        headers=login("u-kang"),
        json={"version": batch["version"], "targetIds": [row["targetId"]], "assetId": story["id"]},
    )
    assert picked.status_code == 200, picked.text
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        b = db.get(Batch, row["batchId"])
        service.save_drafts(
            db,
            b,
            DraftSave(
                review_version=b.review_version,
                targets=[
                    DraftTarget(
                        target_id=row["targetId"], enabled_module_ids=["hero", "taste", "sizePhoto"]
                    )
                ],
            ),
            editor=True,
        )
        db.commit()


def test_AC_SRC_9_DEV_361_existing_photo_as_cover_needs_the_drafted_order(client, login):
    set_modules()
    row = workspace(client, login)
    pick_cover(client, login, row, "/photos/tangerine-box.jpg")  # a story photo the page uses
    old = mine(client, login)["photos"]
    view = put_draft(client, login, "p-house", row["version"], {"photos": old[::-1]}).json()
    page = page_draft(client, login, row)
    refused = apply_all(client, login, "p-house", view["version"], page=page)
    assert refused.status_code == 409
    assert refused.json()["details"]["reason"] == "PHOTO_CHANGED"
    wanted = ["/photos/tangerine-box.jpg", *old]
    view = put_draft(client, login, "p-house", view["version"], {"photos": wanted}).json()
    applied = apply_all(client, login, "p-house", view["version"], page=page)
    assert applied.status_code == 200, applied.text
    assert mine(client, login)["photos"] == wanted
    assert applied.json()["changes"]["now"][0]["after"] == "3장 · 대표사진 바뀜"


def test_AC_SRC_9_DEV_361_stale_composer_cover_never_replaces_a_cover_changed_elsewhere(
    client, login
):
    set_modules()
    row = workspace(client, login)  # the composer cover is the product cover now
    product = mine(client, login)
    flipped = product["photos"][::-1]
    patched = client.patch(  # an older app build changes the cover directly
        "/api/products/p-house",
        headers=h(login),
        json={"version": product["version"], "photos": flipped},
    )
    assert patched.status_code == 200
    page = page_draft(client, login, row)
    refused = apply_all(client, login, "p-house", row["version"], page=page)
    assert refused.status_code == 409
    assert refused.json()["details"]["reason"] == "PHOTO_CHANGED"
    assert mine(client, login)["photos"] == flipped


def save_page(row, modules):
    from app.source_analysis import service
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import DraftSave, DraftTarget

    with get_sessionmaker()() as db:
        b = db.get(Batch, row["batchId"])
        service.save_drafts(
            db,
            b,
            DraftSave(
                review_version=b.review_version,
                targets=[DraftTarget(target_id=row["targetId"], enabled_module_ids=modules)],
            ),
            editor=True,
        )
        db.commit()


def test_DEV_361_page_applied_alone_through_older_endpoints_is_recorded(client, login):
    set_modules()
    row = workspace(client, login)
    assert apply_latest(client, login, row).status_code == 200
    assert events("p-house") == []  # the untouched migrated page: nothing changed
    for pid in ("p-house", "p-cheonggyeon", "p-hallabong"):
        set_modules(pid=pid)
        row = workspace(client, login, pid)
        save_page(row, ["hero", "taste"])  # the size photo module is switched off
        assert apply_latest(client, login, row, pid).status_code == 200
    assert [e.changes for e in events("p-house")] == [[PAGE]]
    [pending] = events("p-cheonggyeon")
    assert (pending.product_status, pending.page_changed, pending.actor_user_id) == (
        "PENDING_APPROVAL",
        True,
        "u-kang",
    )
    assert events("p-hallabong") == []  # before sale: not buyer-visible


PAGE = {"field": "page", "label": "판매페이지", "before": None, "after": None}


def uploaded_cover(client, login, row):
    """A photo uploaded in the composer (not a referenced one), chosen as the cover and saved."""
    from app.source_analysis.models import Asset, Page
    from app.source_analysis.storage import Storage
    from tests.test_source_public_photo import photo_bytes

    data = photo_bytes((64, 48))
    with get_sessionmaker()() as db:
        key = Storage().put(data)
        asset = Asset(
            batch_id=row["batchId"],
            checksum="upload",
            storage_key=key,
            filename="new.png",
            mime="image/png",
            size=len(data),
            target_ids=[row["targetId"]],
            common=False,
            original_photo=True,
            status="PREPARED",
            page_count=1,
        )
        db.add(asset)
        db.flush()
        db.add(
            Page(
                asset_id=asset.id,
                revision=1,
                number=1,
                spans=[],
                redacted_spans=[],
                image_key=key,
                sanitized_key=key,
                redactions=[],
            )
        )
        db.commit()
        asset_id = asset.id
    batch = client.get(f"{SOURCE}/{row['batchId']}", headers=login("u-kang")).json()
    picked = client.put(
        f"{SOURCE}/{row['batchId']}/representative",
        headers=login("u-kang"),
        json={"version": batch["version"], "targetIds": [row["targetId"]], "assetId": asset_id},
    )
    assert picked.status_code == 200, picked.text
    save_page(row, ["hero", "taste", "sizePhoto"])


def test_AC_SRC_9_DEV_361_uploaded_cover_is_copied_once_and_never_replaces_a_later_cover(
    client, login
):
    set_modules()
    row = workspace(client, login)
    before = mine(client, login)["photos"]
    uploaded_cover(client, login, row)
    first = apply_all(client, login, "p-house", row["version"], page=page_draft(client, login, row))
    assert first.status_code == 200, first.text
    photos = mine(client, login)["photos"]
    assert photos[1:] == before and photos[0].startswith("/api/source-media/")
    # Applying the page again with the same composer cover adds no second copy.
    row = workspace(client, login)
    save_page(row, ["hero", "taste"])
    again = apply_all(client, login, "p-house", row["version"], page=page_draft(client, login, row))
    assert again.status_code == 200, again.text
    assert mine(client, login)["photos"] == photos
    assert [c["field"] for c in again.json()["changes"]["now"]] == ["page"]
    # A cover changed elsewhere since stays: the stale composer cover does not come back.
    product = mine(client, login)
    flipped = product["photos"][::-1]
    patched = client.patch(
        "/api/products/p-house",
        headers=h(login),
        json={"version": product["version"], "photos": flipped},
    )
    assert patched.status_code == 200, patched.text
    row = workspace(client, login)
    save_page(row, ["hero", "taste", "sizePhoto"])
    kept = apply_all(client, login, "p-house", row["version"], page=page_draft(client, login, row))
    assert kept.status_code == 200, kept.text
    assert mine(client, login)["photos"] == flipped


# DEV-361 PM 11/18: at most 10 photos, cover included (1 + 9), checked by the server too.
TEN = [f"/photos/cap-{i}.jpg" for i in range(10)]


def set_photos(pid, photos):
    with get_sessionmaker()() as db:
        db.get(Product, pid).photos = list(photos)
        db.commit()


def test_DEV_361_product_patch_and_draft_take_at_most_ten_photos(client, login):
    from app.catalog.schemas import PHOTO_LIMIT_MESSAGE

    version = mine(client, login)["version"]
    eleven = client.patch(
        "/api/products/p-house",
        headers=h(login),
        json={"version": version, "photos": [*TEN, "/photos/cap-10.jpg"]},
    )
    assert eleven.status_code == 400, eleven.text
    assert eleven.json()["details"]["fields"]["photos"] == PHOTO_LIMIT_MESSAGE
    assert mine(client, login)["photos"] != TEN
    ten = client.patch(
        "/api/products/p-house", headers=h(login), json={"version": version, "photos": TEN}
    )
    assert ten.status_code == 200, ten.text
    assert mine(client, login)["photos"] == TEN

    row = workspace(client, login)
    drafted = put_draft(client, login, "p-house", row["version"], {"photos": [*TEN, TEN[0]]})
    assert drafted.status_code == 400, drafted.text
    assert drafted.json()["details"]["fields"]["fields.photos"] == PHOTO_LIMIT_MESSAGE
    assert (
        put_draft(client, login, "p-house", row["version"], {"photos": TEN[:9]}).status_code == 200
    )


def test_DEV_361_a_new_cover_never_pushes_the_product_past_ten_photos(client, login):
    from app.source_analysis.publish import PHOTO_CAP_MESSAGE

    set_modules()
    set_photos("p-house", TEN)
    row = workspace(client, login)
    uploaded_cover(client, login, row)
    full = apply_all(client, login, "p-house", row["version"], page=page_draft(client, login, row))
    assert full.status_code == 400, full.text
    assert full.json()["details"]["fields"]["photos"] == PHOTO_CAP_MESSAGE
    assert mine(client, login)["photos"] == TEN  # nothing applied, no photo dropped

    # With nine photos the new cover goes first and the product ends with ten.
    view = put_draft(client, login, "p-house", row["version"], {"photos": TEN[:9]}).json()
    applied = apply_all(
        client, login, "p-house", view["version"], page=page_draft(client, login, row)
    )
    assert applied.status_code == 200, applied.text
    photos = mine(client, login)["photos"]
    assert (
        len(photos) == 10 and photos[1:] == TEN[:9] and photos[0].startswith("/api/source-media/")
    )
