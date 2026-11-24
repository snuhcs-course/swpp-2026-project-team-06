"""DEV-479 standalone admin visibility: public HTTP behavior, written from spec."""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select, text

from app.admin.models import ManagerEvent
from app.catalog.models import Product, StageAllocation, StagePrice
from app.core.db import get_sessionmaker
from app.farms.models import Farm
from app.orders.models import Order, Payment, Refund
from tests.test_orders import order_body

PRODUCT = "p-house"
URL = f"/admin/products/{PRODUCT}/visibility"
REASON = "합성 테스트 상품만 잠시 숨기는 사유"


def _key():
    return {"Idempotency-Key": str(uuid4())}


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def _rows(model):
    with get_sessionmaker()() as db:
        table = model.__table__
        return deepcopy(
            [
                dict(row)
                for row in db.execute(select(table).order_by(*table.primary_key.columns)).mappings()
            ]
        )


def _product():
    return next(row for row in _rows(Product) if row["id"] == PRODUCT)


def _unchanged_records():
    return {
        model.__tablename__: _rows(model)
        for model in (
            Farm,
            Order,
            Payment,
            Refund,
            StageAllocation,
            StagePrice,
        )
    }


def _success_events():
    return [
        row
        for row in _rows(ManagerEvent)
        if row["target_id"] == PRODUCT
        and row["event_type"] in {"product.hide", "product.restore"}
        and row["status"] == "SUCCEEDED"
    ]


def _visibility(client, admin_headers, hidden=True, version=None, request_key=None, **overrides):
    body = {
        "isHidden": hidden,
        "version": _product()["version"] if version is None else version,
        "reason": REASON,
        **overrides,
    }
    return client.post(URL, headers=admin_headers | (request_key or _key()), json=body)


def _product_ids(value):
    if isinstance(value, dict):
        return ({value["productId"]} if value.get("productId") else set()).union(
            *(_product_ids(child) for child in value.values())
        )
    if isinstance(value, list):
        return set().union(*(_product_ids(child) for child in value))
    return set()


def test_AC_23_13_14_hide_restore_preserve_product_farm_orders_and_record_private_audit(
    client, admin_headers
):
    with get_sessionmaker()() as db, db.begin():
        product = db.get(Product, PRODUCT)
        assert product.is_hidden is False
        product.updated_at = datetime(2020, 1, 1, tzinfo=UTC)
    original = _product()
    siblings = [row for row in _rows(Product) if row["id"] != PRODUCT]
    preserved = _unchanged_records()
    previous_audit_ids = {row["id"] for row in _success_events()}
    previous_audits = len(previous_audit_ids)
    same_key = _key()
    hidden = _ok(
        _visibility(client, admin_headers, version=original["version"], request_key=same_key)
    )
    assert hidden == {"productId": PRODUCT, "isHidden": True, "version": original["version"] + 1}
    assert (
        _ok(_visibility(client, admin_headers, version=original["version"], request_key=same_key))
        == hidden
    )
    changed = _product()
    assert changed["updated_at"] > original["updated_at"]
    assert changed["is_hidden"] is True
    assert changed["status"] == "PUBLISHED"
    assert {
        k: v for k, v in changed.items() if k not in {"is_hidden", "version", "updated_at"}
    } == {k: v for k, v in original.items() if k not in {"is_hidden", "version", "updated_at"}}
    assert [row for row in _rows(Product) if row["id"] != PRODUCT] == siblings
    assert _unchanged_records() == preserved
    audits = _success_events()
    assert len(audits) == previous_audits + 1
    audit = next(row for row in audits if row["id"] not in previous_audit_ids)
    assert (audit["event_type"], audit["actor_id"], audit["target_type"]) == (
        "product.hide",
        "u-admin",
        "product",
    )
    assert audit["request_summary"]["isHidden"] is True
    assert audit["request_summary"]["version"] == original["version"]
    assert audit["request_summary"]["reasonProvided"] is True
    assert REASON not in json.dumps(audit["request_summary"], ensure_ascii=False, default=str)
    assert REASON not in json.dumps(hidden, ensure_ascii=False)
    restored = _ok(_visibility(client, admin_headers, False, version=hidden["version"]))
    assert restored == {"productId": PRODUCT, "isHidden": False, "version": original["version"] + 2}
    assert len(_success_events()) == previous_audits + 2
    assert any(row["event_type"] == "product.restore" for row in _success_events())
    assert _unchanged_records() == preserved


@pytest.mark.parametrize("hidden", [False, True])
def test_AC_23_14_current_visibility_is_a_noop_without_version_or_timestamp_change(
    client, admin_headers, hidden
):
    if hidden:
        _ok(_visibility(client, admin_headers))
    before = _product()
    response = _ok(_visibility(client, admin_headers, hidden, version=before["version"]))
    assert response == {"productId": PRODUCT, "isHidden": hidden, "version": before["version"]}
    assert _product() == before


@pytest.mark.parametrize("user,status", [(None, 401), ("u-seojun", 403), ("u-kang", 403)])
def test_AC_23_13_admin_only_visibility(client, login, user, status):
    headers = _key() | (login(user) if user else {})
    before = _product(), _success_events(), _unchanged_records()
    response = client.post(
        URL,
        headers=headers,
        json={"isHidden": True, "version": _product()["version"], "reason": REASON},
    )
    assert response.status_code == status, response.text
    assert (_product(), _success_events(), _unchanged_records()) == before


@pytest.mark.parametrize(
    "patch",
    [
        {"isHidden": "yes"},
        {"isHidden": None},
        {"version": 0},
        {"version": -1},
        {"version": "one"},
        {"reason": ""},
        {"reason": " \n\t "},
        {"reason": "가" * 501},
        {"reason": None},
    ],
)
def test_AC_23_13_invalid_visibility_body_is_400_and_has_no_mutation(client, admin_headers, patch):
    before = _product(), _success_events()
    response = _visibility(client, admin_headers, **patch)
    assert response.status_code == 400, response.text
    assert (_product(), _success_events()) == before


def test_AC_23_14_missing_key_missing_product_stale_version_and_key_mismatch(client, admin_headers):
    version = _product()["version"]
    payload = {"isHidden": True, "version": version, "reason": REASON}
    assert client.post(URL, headers=admin_headers, json=payload).status_code == 400
    assert (
        client.post(
            "/admin/products/p-missing/visibility", headers=admin_headers | _key(), json=payload
        ).status_code
        == 404
    )
    first_key = _key()
    _ok(_visibility(client, admin_headers, request_key=first_key, version=version))
    before = _product(), _success_events()
    stale = _visibility(client, admin_headers, False, version=version)
    assert stale.status_code == 409 and stale.json()["details"]["reason"] == "VERSION_MISMATCH"
    mismatch = _visibility(client, admin_headers, False, version=version, request_key=first_key)
    assert (
        mismatch.status_code == 409
        and mismatch.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    )
    assert (_product(), _success_events()) == before


@pytest.mark.parametrize("reason", ["가", "가" * 500])
def test_AC_23_13_reason_length_boundaries_are_accepted(client, admin_headers, reason):
    assert _ok(_visibility(client, admin_headers, reason=reason))["isHidden"] is True


def test_AC_07_11_hidden_product_leaves_all_public_surfaces_but_stays_manageable(
    client, admin_headers, login
):
    from app.catalog.service import published_products_of_farm

    before = _ok(client.get("/api/home"))
    assert PRODUCT in _product_ids(before)
    assert PRODUCT in _product_ids(_ok(client.get("/api/farms/f-kang")))
    search = {
        row["farmId"] for row in _ok(client.get("/api/farms", params={"q": "궁천조생"}))["items"]
    }
    assert "f-kang" in search
    _ok(_visibility(client, admin_headers))
    assert client.get(f"/api/products/{PRODUCT}").status_code == 404
    for path in ("/api/home", "/api/farms/f-kang", "/api/farms"):
        assert PRODUCT not in _product_ids(_ok(client.get(path)))
    assert "f-kang" not in {
        row["farmId"] for row in _ok(client.get("/api/farms", params={"q": "궁천조생"}))["items"]
    }
    assert client.get("/api/products/p-redhyang").status_code == 200
    detail = _ok(client.get("/admin/users/u-kang", headers=admin_headers))
    managed = next(row for row in detail["products"] if row["productId"] == PRODUCT)
    assert managed["isHidden"] is True and managed["version"] == _product()["version"]
    assert PRODUCT in _product_ids(_ok(client.get("/api/products/mine", headers=login("u-kang"))))
    with get_sessionmaker()() as db:
        assert PRODUCT not in {p.id for p in published_products_of_farm(db, "f-kang")}
    _ok(_visibility(client, admin_headers, False))
    assert client.get(f"/api/products/{PRODUCT}").status_code == 200
    assert PRODUCT in _product_ids(_ok(client.get("/api/home")))
    assert PRODUCT in _product_ids(_ok(client.get("/api/farms/f-kang")))
    assert "f-kang" in {
        row["farmId"] for row in _ok(client.get("/api/farms", params={"q": "궁천조생"}))["items"]
    }


@pytest.mark.parametrize("blocked_by", ["DRAFT", "SUSPENDED"])
def test_AC_07_11_restore_respects_existing_product_and_farm_approvals(
    client, admin_headers, blocked_by
):
    _ok(_visibility(client, admin_headers))
    with get_sessionmaker()() as db, db.begin():
        if blocked_by == "DRAFT":
            db.get(Product, PRODUCT).status = "DRAFT"
        else:
            db.get(Farm, "f-kang").approval_status = "SUSPENDED"
    assert _ok(_visibility(client, admin_headers, False))["isHidden"] is False
    assert client.get(f"/api/products/{PRODUCT}").status_code == 404
    assert PRODUCT not in _product_ids(_ok(client.get("/api/home")))


def test_AC_23_15_hidden_product_blocks_new_orders_but_keeps_payment_fulfillment_and_refund(
    client, admin_headers, login
):
    consumer, producer = login("u-seojun"), login("u-kang")
    order = _ok(client.post("/api/orders", headers=consumer | _key(), json=order_body()))
    order_id = order["orderId"]
    _ok(_visibility(client, admin_headers))
    assert (
        _ok(client.get(f"/api/orders/{order_id}", headers=consumer))["status"] == "PENDING_PAYMENT"
    )
    before = _rows(Order), _rows(Payment), _rows(Refund)
    blocked = client.post("/api/orders", headers=consumer | _key(), json=order_body())
    assert blocked.status_code == 404, blocked.text
    assert (_rows(Order), _rows(Payment), _rows(Refund)) == before
    awaiting = _ok(
        client.post(f"/api/orders/{order_id}/deposit", headers=consumer | _key(), json={})
    )
    assert awaiting["status"] == "AWAITING_DEPOSIT" and awaiting["depositAccount"]
    assert (
        _ok(client.post(f"/api/orders/{order_id}/confirm-deposit", headers=producer))["status"]
        == "PREPARING"
    )
    shipped = _ok(
        client.post(
            f"/api/orders/{order_id}/ship",
            headers=producer,
            json={"carrier": "CJ", "trackingNumber": "DEV479-SYNTHETIC"},
        )
    )
    assert shipped["status"] == "SHIPPED"
    refund = client.post(
        f"/admin/orders/{order_id}/refund",
        headers=admin_headers | _key(),
        json={"reason": "합성 테스트 환불"},
    )
    assert refund.status_code == 200, refund.text
    assert _ok(client.get(f"/api/orders/{order_id}", headers=consumer))["status"] == "REFUNDED"
    assert _product()["is_hidden"] is True


def test_AC_23_15_hidden_product_blocks_general_product_chat_but_own_paid_order_inquiry_works(
    client, admin_headers, login
):
    consumer = login("u-minji")
    _ok(_visibility(client, admin_headers))
    chat = "/api/messaging/chats/f-kang/messages"
    before = _ok(client.get(chat, headers=consumer))["items"]
    blocked = client.post(
        chat, headers=consumer | _key(), json={"text": "이 상품 문의", "productId": PRODUCT}
    )
    assert blocked.status_code == 404, blocked.text
    assert _ok(client.get(chat, headers=consumer))["items"] == before
    started = client.post(
        "/api/messaging/chats",
        headers=consumer | _key(),
        json={"farmId": "f-kang", "orderId": "o-42"},
    )
    assert started.status_code == 200, started.text
    sent = _ok(
        client.post(
            chat, headers=consumer | _key(), json={"text": "내 기존 주문 문의", "orderId": "o-42"}
        )
    )
    assert sent["message"]["orderId"] == "o-42"
    assert sent["message"]["body"] == "내 기존 주문 문의"


def _await_blocked_requests(blocker_pid, count, futures):
    """Synchronize against PostgreSQL's real lock queue, rather than elapsed sleep."""
    query = text("""
        WITH RECURSIVE blocked(pid) AS (
            SELECT pid FROM pg_stat_activity
            WHERE :blocker_pid = ANY(pg_blocking_pids(pid))
            UNION
            SELECT activity.pid FROM pg_stat_activity AS activity
            JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
        )
        SELECT count(DISTINCT pid) FROM blocked
    """)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        with get_sessionmaker()() as observer:
            waiting = observer.scalar(query, {"blocker_pid": blocker_pid})
        if waiting >= count:
            return
        assert not any(future.done() for future in futures), (
            "request bypassed the held product lock"
        )
        time.sleep(0.01)
    pytest.fail(f"Expected {count} requests waiting on product lock, observed {waiting}")


@pytest.mark.parametrize("hide_first", [True, False])
def test_AC_23_15_hide_and_new_order_serialize_at_the_same_product_lock(
    client, admin_headers, login, hide_first
):
    consumer = login("u-seojun")
    version = _product()["version"]
    prior_orders = {row["id"] for row in _rows(Order)}
    hide_key, order_key = _key(), _key()

    def hide():
        return _visibility(client, admin_headers, version=version, request_key=hide_key)

    def order():
        return client.post("/api/orders", headers=consumer | order_key, json=order_body())

    # Hold the shared boundary, queue the two real HTTP transactions in either order,
    # and only then release it. Both requests must wait for this product row.
    with ThreadPoolExecutor(max_workers=2) as pool:
        with get_sessionmaker()() as blocker, blocker.begin():
            blocker.scalar(select(Product).where(Product.id == PRODUCT).with_for_update())
            blocker_pid = blocker.scalar(text("SELECT pg_backend_pid()"))
            first = pool.submit(hide if hide_first else order)
            _await_blocked_requests(blocker_pid, 1, [first])
            second = pool.submit(order if hide_first else hide)
            _await_blocked_requests(blocker_pid, 2, [first, second])
        first_result, second_result = first.result(timeout=10), second.result(timeout=10)
    hidden, created = (first_result, second_result) if hide_first else (second_result, first_result)
    assert hidden.status_code == 200, hidden.text
    assert _product()["is_hidden"] is True and _product()["version"] == version + 1
    after_orders = {row["id"] for row in _rows(Order)}
    if hide_first:
        assert created.status_code == 404, created.text
        assert after_orders == prior_orders
    else:
        assert created.status_code == 200, created.text
        order_id = created.json()["orderId"]
        assert after_orders == prior_orders | {order_id}
        assert _ok(client.get(f"/api/orders/{order_id}", headers=consumer))["productId"] == PRODUCT


@pytest.mark.parametrize(
    "context", ["explicit_product", "automatic_single_product", "own_paid_order"]
)
def test_AC_23_15_hide_committed_during_ai_discards_general_answer_but_keeps_paid_order_answer(
    client, login, monkeypatch, context
):
    from app.ai import service as ai
    from app.ai.schemas import AiAnswer

    consumer = login("u-seojun")
    chat = "/api/messaging/chats/f-kang/messages"
    question = f"보관 방법을 알려 주세요 {uuid4().hex}"
    answer = f"테스트 근거에 따른 보관 안내 {uuid4().hex}"
    payload = {"text": question}
    if context == "explicit_product":
        payload["productId"] = PRODUCT
    elif context == "automatic_single_product":
        # The existing seed has two published products in f-kang; make this a
        # single-product farm without giving the request an explicit product ID.
        with get_sessionmaker()() as db, db.begin():
            for product in db.scalars(
                select(Product).where(
                    Product.farm_id == "f-kang",
                    Product.id != PRODUCT,
                    Product.status == "PUBLISHED",
                )
            ):
                product.status = "DRAFT"
    else:
        payload["orderId"] = "o-38"
        with get_sessionmaker()() as db:
            own_order = db.get(Order, "o-38")
            assert own_order.consumer_id == "u-seojun" and own_order.paid_at is not None
            assert own_order.product_id == PRODUCT

    before = _ok(client.get(chat, headers=consumer))
    assert before["thread"]["aiMode"] == "AUTO"
    old_ids = {message["messageId"] for message in before["items"]}
    calls = []

    def external_answer_while_product_is_hidden(question_text, evidence, enabled=True):
        assert question_text == question and enabled is True
        assert evidence.product_id == PRODUCT
        assert evidence.order_id == ("o-38" if context == "own_paid_order" else None)
        calls.append(evidence.product_id)
        # A separate transaction commits the admin visibility state while the
        # external answer is outstanding. A lock timeout makes an accidentally
        # held product lock fail this test instead of hanging the suite.
        with get_sessionmaker()() as other, other.begin():
            other.execute(text("SET LOCAL lock_timeout = '2s'"))
            product = other.get(Product, PRODUCT)
            assert product.is_hidden is False
            product.is_hidden = True
            product.version += 1
            other.flush()
        assert _product()["is_hidden"] is True
        return AiAnswer(
            action="ANSWER",
            answer=answer,
            reason="합성 테스트 근거",
            source_refs=["order:o-38" if context == "own_paid_order" else f"product:{PRODUCT}"],
        )

    monkeypatch.setattr(ai, "answer_question", external_answer_while_product_is_hidden)
    sent = _ok(client.post(chat, headers=consumer | _key(), json=payload))
    assert calls == [PRODUCT], "The race must occur during an actual AI invocation"
    assert _product()["is_hidden"] is True
    reloaded = _ok(client.get(chat, headers=consumer))
    new_messages = [message for message in reloaded["items"] if message["messageId"] not in old_ids]
    stored_question = next(
        message for message in new_messages if message["messageId"] == sent["message"]["messageId"]
    )
    assert stored_question["body"] == question
    new_ai_messages = [message for message in new_messages if message["senderType"] == "AI"]
    if context == "own_paid_order":
        assert sent["message"]["needsHuman"] is False
        assert sent["reply"]["body"] == answer
        assert stored_question["orderId"] == "o-38"
        assert [message["messageId"] for message in new_ai_messages] == [sent["reply"]["messageId"]]
        assert new_ai_messages[0]["body"] == answer
    else:
        assert sent["reply"] is None
        assert sent["message"]["needsHuman"] is True
        assert stored_question["needsHuman"] is True
        assert new_ai_messages == []
        assert all(message["body"] != answer for message in reloaded["items"])
