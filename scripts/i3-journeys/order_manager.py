"""DEV-173 / DEV-174: I3-PRODORD-01..05 and I3-MANAGER-01..05 (one planned execution each).

API-layer checks on the isolated local stack (docs/evaluation/i3-env/README.md). Each row reseeds the
local DB first (fixture reset), then calls the same endpoints the producer/consumer apps and the admin
page call, and reads the DB only to count rows (payments, manager events, decisions, allocations).

    # API with the fault proxy (MANAGER-05 holds the AI call mid-generation)
    python3 scripts/i3-ai-support/fault_proxy.py &
    cd server && ANTHROPIC_BASE_URL=http://127.0.0.1:8787 uv run uvicorn app.main:app --port 8173 &
    I3_API=http://localhost:8173 uv run python ../scripts/i3-journeys/order_manager.py [CASE ...]

Writes .artifacts/i3-journeys/<baseline>/<CASE>.json (raw, local only) and prints one verdict per row.
Refuses a non-local DATABASE_URL. A FAIL is never upgraded by the script.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy import func, select, update

SERVER = Path(__file__).resolve().parents[2] / "server"
sys.path.insert(0, str(SERVER))
os.chdir(SERVER)

from app.admin.models import ManagerEvent  # noqa: E402
from app.catalog.models import StageAllocation  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import get_sessionmaker  # noqa: E402
from app.core.security import issue_token  # noqa: E402
from app.farms.models import ProducerDecisionHistory  # noqa: E402
from app.messaging.models import ThreadMessage  # noqa: E402
from app.orders.models import Order, Payment  # noqa: E402

DB_URL = get_settings().database_url
if not any(host in DB_URL for host in ("@localhost", "@127.0.0.1")):
    sys.exit(f"refusing non-local DATABASE_URL: {DB_URL.split('@')[-1]}")

API = os.environ.get("I3_API", "http://localhost:8173")
PROXY = "http://127.0.0.1:8787"
ROOT = SERVER.parent
BASELINE = os.environ.get("I3_BASELINE", "i3-b3-57d4843")
TRACES = ROOT / ".artifacts" / "i3-journeys" / BASELINE
TRACES.mkdir(parents=True, exist_ok=True)

client = httpx.Client(timeout=30)
Session = get_sessionmaker()


def tok(user: str, role: str) -> str:
    return issue_token(user, role)


ADMIN = tok("u-admin", "ADMIN")
KANG = tok("u-kang", "PRODUCER")  # farm A = f-kang
HALLA = tok("u-halla", "PRODUCER")  # farm B = f-halla (token minted locally; no test login)
MINJI = tok("u-minji", "CONSUMER")
SEOJUN = tok("u-seojun", "CONSUMER")


class Log:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def __call__(self, method, path, token, body=None, key=None, note=""):
        headers = {"authorization": f"Bearer {token}"} if token else {}
        if key:
            headers["Idempotency-Key"] = key
        r = client.request(method, API + path, headers=headers, json=body)
        try:
            data = r.json()
        except ValueError:
            data = r.text[:300]
        self.calls.append(
            {
                "note": note,
                "method": method,
                "path": path,
                "key": key,
                "body": body,
                "status": r.status_code,
                "response": data,
            }
        )
        return r.status_code, data


def reset() -> dict:
    out = subprocess.run(
        ["uv", "run", "python", "-m", "app.core.seed", "--reset"],
        capture_output=True,
        text=True,
        check=True,
    )
    return {
        "command": "uv run python -m app.core.seed --reset",
        "stdout": out.stdout.strip(),
        "at": datetime.now(UTC).isoformat(),
    }


def db_order(order_id: str) -> dict:
    with Session() as s:
        o = s.get(Order, order_id)
        return {
            "status": o.status,
            "paidAt": o.paid_at and o.paid_at.isoformat(),
            "depositConfirmedBy": o.deposit_confirmed_by,
            "depositIssue": o.deposit_issue,
            "trackingNumber": o.tracking_number,
            "cancelReason": o.cancel_reason,
            "payments": s.scalar(
                select(func.count()).select_from(Payment).where(Payment.order_id == order_id)
            ),
        }


def reserved(stage_id: str, option_id: str) -> int:
    with Session() as s:
        return s.get(StageAllocation, (stage_id, option_id)).reserved_count


def events(**where) -> list[dict]:
    with Session() as s:
        q = select(ManagerEvent)
        for k, v in where.items():
            q = q.where(getattr(ManagerEvent, k) == v)
        return [
            {
                "id": e.id,
                "type": e.event_type,
                "actor": e.actor_id,
                "targetType": e.target_type,
                "targetId": e.target_id,
                "status": e.status,
                "messageId": e.message_id,
                "summary": e.request_summary,
                "attempts": e.attempts,
            }
            for e in s.scalars(q.order_by(ManagerEvent.created_at))
        ]


def decisions(farm_id: str) -> int:
    with Session() as s:
        return s.scalar(
            select(func.count())
            .select_from(ProducerDecisionHistory)
            .where(ProducerDecisionHistory.farm_id == farm_id)
        )


def new_order(log: Log, consumer: str, product_id: str, note: str) -> str:
    """Consumer places an order and asks for the deposit guide → AWAITING_DEPOSIT."""
    _, product = log("GET", f"/api/products/{product_id}", consumer, note=f"{note}: product detail")
    option = product["options"][0]["optionId"]
    consents = {
        k: True for k in ("deliveryWindow", "delayRefund", "shortage", "cancelPolicy", "thirdParty")
    }
    body = {
        "productId": product_id,
        "optionId": option,
        "quantity": 1,
        "recipientName": "평가 수령인",
        "recipientPhone": "010-0000-0173",
        "postalCode": "06000",
        "address": "서울 강남구 평가로 1",
        "addressDetail": "101호",
        "consents": consents,
        "consentVersion": "policy-2026-10-23",  # apps/consumer checkout CONSENT_VERSION
    }
    status, order = log(
        "POST", "/api/orders", consumer, body, key=f"{note}-{time.time()}", note=f"{note}: create"
    )
    assert status == 200, order
    status, order = log(
        "POST",
        f"/api/orders/{order['orderId']}/deposit",
        consumer,
        key=f"{note}-dep-{time.time()}",
        note=f"{note}: deposit guide",
    )
    assert status == 200 and order["status"] == "AWAITING_DEPOSIT", order
    return order["orderId"]


def producer_list(log: Log, token: str, note: str) -> list[dict]:
    items, cursor = [], None
    while True:
        _, page = log(
            "GET",
            "/api/orders/producer?limit=50" + (f"&cursor={cursor}" if cursor else ""),
            token,
            note=note,
        )
        items += page.get("items", [])
        cursor = page.get("nextCursor")
        if not cursor:
            return items


def producer_row(log: Log, token: str, order_id: str, note: str) -> dict | None:
    return next((o for o in producer_list(log, token, note) if o["orderId"] == order_id), None)


def todo(log: Log, note: str) -> dict:
    return log("GET", "/api/orders/producer/dashboard", KANG, note=note)[1]["todo"]


# ---------------------------------------------------------------- PRODORD (DEV-173)


def prodord_01(log: Log) -> dict:
    oid = new_order(log, MINJI, "p-house", "setup A order")
    before_todo = todo(log, "dashboard before")
    row = producer_row(log, KANG, oid, "producer finds order")
    s_confirm, confirmed = log(
        "POST", f"/api/orders/{oid}/confirm-deposit", KANG, note="confirm deposit once"
    )
    after_todo = todo(log, "dashboard after (reload)")
    prow = producer_row(log, KANG, oid, "producer reload")
    _, cview = log("GET", f"/api/orders/{oid}", MINJI, note="consumer reload")
    db = db_order(oid)
    same = prow and all(
        prow[k] == cview.get(k) for k in ("productId", "quantity", "totalAmount", "status")
    )
    return {
        "orderId": oid,
        "db": db,
        "todoBefore": before_todo,
        "todoAfter": after_todo,
        "checks": {
            "found_awaiting_in_producer_list": bool(row) and row["status"] == "AWAITING_DEPOSIT",
            "confirm_200_reserved": s_confirm == 200 and confirmed.get("status") == "RESERVED",
            "one_payment_record": db["payments"] == 1,
            "confirmation_time_and_actor_recorded": bool(db["paidAt"])
            and db["depositConfirmedBy"] == "PRODUCER",
            "dashboard_awaiting_count_down_by_1": after_todo["awaitingDeposit"]
            == before_todo["awaitingDeposit"] - 1,
            "consumer_producer_agree_item_amount_status": bool(same)
            and cview.get("status") == "RESERVED",
        },
    }


def prodord_02(log: Log) -> dict:
    b_oid = new_order(log, SEOJUN, "p-noji", "setup farm B order")
    b_before = db_order(b_oid)
    s1, r1 = log("POST", f"/api/orders/{b_oid}/confirm-deposit", KANG, note="A confirms B order")
    s2, r2 = log(
        "POST",
        f"/api/orders/{b_oid}/reject-deposit",
        KANG,
        {"reason": "확인 불가"},
        note="A rejects B order",
    )
    in_list = producer_row(log, KANG, b_oid, "B order in A list?")
    shipped = "o-g6"
    sh_before = db_order(shipped)
    s3, r3 = log(
        "POST",
        f"/admin/orders/{shipped}/delivered",
        KANG,
        key=f"dl-{time.time()}",
        note="producer tries delivery-complete",
    )
    s4, r4 = log(
        "POST", f"/api/orders/{shipped}/confirm", KANG, note="producer tries consumer confirm route"
    )
    b_after, sh_after = db_order(b_oid), db_order(shipped)
    return {
        "bOrder": b_oid,
        "shippedOrder": shipped,
        "before": {"b": b_before, "shipped": sh_before},
        "after": {"b": b_after, "shipped": sh_after},
        "checks": {
            "b_confirm_404": s1 == 404,
            "b_reject_404": s2 == 404,
            "b_not_in_a_list": in_list is None,
            "delivery_complete_rejected_for_producer": s3 in (401, 403) and s4 in (401, 403, 404),
            "states_unchanged": b_before == b_after and sh_before == sh_after,
        },
    }


def prodord_03(log: Log) -> dict:
    oid = new_order(log, MINJI, "p-house", "setup awaiting order")
    prep = "o-40"
    a_before, p_before = db_order(oid), db_order(prep)
    s1, r1 = log(
        "POST",
        f"/api/orders/{oid}/reject-deposit",
        KANG,
        {"reason": ""},
        note="reject, empty reason",
    )
    s2, r2 = log(
        "POST",
        f"/api/orders/{oid}/reject-deposit",
        KANG,
        {"reason": "   "},
        note="reject, blank reason",
    )
    s3, r3 = log(
        "POST",
        f"/api/orders/{prep}/ship",
        KANG,
        {"trackingNumber": "9" * 51, "carrier": "CJ"},
        note="ship, 51-char tracking",
    )
    a_mid, p_mid = db_order(oid), db_order(prep)
    a_row, p_row = (
        producer_row(log, KANG, oid, "rows after errors"),
        producer_row(log, KANG, prep, "rows after errors"),
    )
    # correction on the same rows
    s4, _ = log(
        "POST",
        f"/api/orders/{oid}/reject-deposit",
        KANG,
        {"reason": "입금자명이 달라요", "cancel": False},
        note="corrected rejection (keep awaiting)",
    )
    s5, r5 = log(
        "POST",
        f"/api/orders/{prep}/ship",
        KANG,
        {"trackingNumber": "123456789012", "carrier": "CJ"},
        note="corrected shipment",
    )
    return {
        "awaitingOrder": oid,
        "preparingOrder": prep,
        "before": {"awaiting": a_before, "preparing": p_before},
        "afterErrors": {"awaiting": a_mid, "preparing": p_mid},
        "after": {"awaiting": db_order(oid), "preparing": db_order(prep)},
        "checks": {
            "empty_reason_rejected": s1 in (400, 422) and s2 in (400, 422),
            "long_tracking_rejected": s3 in (400, 422),
            "neither_order_changed": a_before == a_mid and p_before == p_mid,
            "rows_still_listed_for_correction": bool(a_row) and bool(p_row),
            "correction_succeeds": s4 == 200 and s5 == 200 and r5.get("status") == "SHIPPED",
        },
    }


def prodord_04(log: Log) -> dict:
    oid = new_order(log, MINJI, "p-house", "setup A order")
    s1, r1 = log(
        "POST",
        f"/api/orders/{oid}/confirm-deposit",
        KANG,
        note="confirm (response treated as lost)",
    )
    s2, r2 = log("POST", f"/api/orders/{oid}/confirm-deposit", KANG, note="client retries confirm")
    after_confirm = db_order(oid)
    prep = "o-40"
    body = {"trackingNumber": "555566667777", "carrier": "CJ"}
    s3, r3 = log(
        "POST", f"/api/orders/{prep}/ship", KANG, body, note="ship (response treated as lost)"
    )
    s4, r4 = log("POST", f"/api/orders/{prep}/ship", KANG, body, note="client retries ship")
    p_row = producer_row(log, KANG, prep, "producer reload")
    _, consumers = log("GET", f"/admin/users/by-order/{prep}", ADMIN, note="owner of o-40")
    cons_id = consumers.get("userId") if isinstance(consumers, dict) else None
    c_status = c_track = None
    if cons_id:
        _, cview = log(
            "GET", f"/api/orders/{prep}", tok(cons_id, "CONSUMER"), note="consumer reload"
        )
        c_status, c_track = cview.get("status"), cview.get("trackingNumber")
    _, a_cview = log("GET", f"/api/orders/{oid}", MINJI, note="consumer reload confirmed order")
    pa_row = producer_row(log, KANG, oid, "producer reload confirmed order")
    return {
        "order": oid,
        "preparingOrder": prep,
        "db": {"confirmed": after_confirm, "shipped": db_order(prep)},
        "checks": {
            "confirm_once_retry_harmless": s1 == 200
            and s2 in (200, 409)
            and after_confirm["status"] == "RESERVED",
            "one_payment_record": after_confirm["payments"] == 1,
            "ship_once_retry_rejected_or_same": s3 == 200 and s4 in (200, 409),
            "single_shipment_state": db_order(prep)["status"] == "SHIPPED"
            and db_order(prep)["trackingNumber"] == body["trackingNumber"],
            "roles_agree_status_and_tracking": bool(p_row)
            and p_row["status"] == c_status == "SHIPPED"
            and p_row["trackingNumber"] == c_track == body["trackingNumber"]
            and bool(pa_row)
            and pa_row["status"] == a_cview.get("status") == "RESERVED",
        },
    }


def prodord_05(log: Log) -> dict:
    no_hint = new_order(log, MINJI, "p-house", "setup overdue no-hint")
    hinted = new_order(log, SEOJUN, "p-house", "setup overdue paid-hint")
    log("POST", f"/api/orders/{hinted}/deposit-reported", SEOJUN, note="consumer says 'I paid'")
    with Session() as s:
        o = s.get(Order, no_hint)
        stage, option = o.stage_id, o.option_id
    held = reserved(stage, option)
    past = datetime(2026, 10, 6, tzinfo=UTC)  # before the fixed test clock (FIXED_NOW 2026-10-07)
    with Session() as s, s.begin():
        s.execute(update(Order).where(Order.id.in_([no_hint, hinted])).values(deposit_due_at=past))
    _, cview = log("GET", f"/api/orders/{no_hint}", MINJI, note="consumer queries overdue no-hint")
    plist = {"items": producer_list(log, KANG, "producer queries list")}
    _, h_cview = log("GET", f"/api/orders/{hinted}", SEOJUN, note="consumer queries paid-hint")
    _, overdue = log("GET", "/admin/orders/deposit-overdue", ADMIN, note="operator overdue list")
    s_late, _ = log("POST", f"/api/orders/{no_hint}/confirm-deposit", KANG, note="late confirm")
    released = reserved(stage, option)
    prow = {o["orderId"]: o for o in plist.get("items", [])}
    delivered = prow.get("o-07")
    _, dash = log("GET", "/api/orders/producer/dashboard", KANG, note="dashboard recent orders")
    masked_fields = (
        {
            k: delivered.get(k)
            for k in ("recipientName", "recipientPhone", "address", "addressDetail", "postalCode")
        }
        if delivered
        else None
    )
    return {
        "noHint": no_hint,
        "paidHint": hinted,
        "reservedBefore": held,
        "reservedAfter": released,
        "db": {"noHint": db_order(no_hint), "paidHint": db_order(hinted)},
        "deliveredProducerRow": masked_fields,
        "checks": {
            "no_hint_canceled_deadline": cview.get("status") == "CANCELED"
            and "기한" in (db_order(no_hint)["cancelReason"] or ""),
            "stock_restored": released == held - 1,
            "late_confirm_409": s_late == 409,
            "paid_hint_pending_and_on_operator_list": h_cview.get("status") == "AWAITING_DEPOSIT"
            and any(o.get("orderId") == hinted for o in overdue),
            "producer_consumer_agree": prow.get(no_hint, {}).get("status") in (None, "CANCELED")
            and prow.get(hinted, {}).get("status") == "AWAITING_DEPOSIT",
            "delivered_contact_address_masked_in_order_list": bool(delivered)
            and not any(delivered.get(k) for k in ("recipientPhone", "address", "addressDetail")),
            "delivered_masked_on_dashboard": all(
                "○" in r["buyerName"] for r in dash["recentOrders"]
            ),
        },
    }


# ---------------------------------------------------------------- MANAGER (DEV-174)

# consumer name / phone / address values used by the fixtures (internal IDs such as thread-kang-minji are not PII)
PII = ("010-", "김민지", "김○○", "평가로", "평가 수령인")


def refund_message(log: Log, consumer: str, farm: str, key: str, note: str) -> tuple[int, dict]:
    log(
        "POST",
        "/api/messaging/chats",
        consumer,
        {"farmId": farm},
        key=f"start-{key}",
        note=f"{note}: start chat",
    )
    return log(
        "POST",
        f"/api/messaging/chats/{farm}/messages",
        consumer,
        {"text": "상품이 상해서 환불해 주세요"},
        key=key,
        note=note,
    )


def manager_01(log: Log) -> dict:
    before = decisions("f-wimi")
    s1, r1 = log(
        "POST",
        "/admin/producers/f-wimi/approve",
        ADMIN,
        key=f"m1-{time.time()}",
        note="approve f-wimi",
    )
    _, hist = log("GET", "/admin/producers/f-wimi/decisions", ADMIN, note="decision history")
    _, app_view = log("GET", "/admin/producers?status=ALL", ADMIN, note="application list")
    s_msg, msg = refund_message(
        log, MINJI, "f-kang", f"m1-refund-{time.time()}", "consumer refund request"
    )
    _, queue = log("GET", "/admin/exceptions?limit=50", ADMIN, note="exception queue")
    refund = [e for e in queue["items"] if e["type"] == "manager_refund_request"]
    detail = (
        log("GET", f"/admin/exceptions/{refund[0]['exceptionId']}", ADMIN, note="exception detail")[
            1
        ]
        if refund
        else {}
    )
    with Session() as s:
        m = s.get(ThreadMessage, msg["message"]["messageId"]) if s_msg == 200 else None
        thread_id = m.thread_id if m else None
    # successful manager actions are audit records, listed with status=SUCCEEDED (the default view is OPEN/FAILED)
    _, audit = log(
        "GET",
        "/admin/exceptions?status=SUCCEEDED&type=producer.approve&limit=50",
        ADMIN,
        note="approval audit records",
    )
    approve_events = [e for e in audit["items"] if e["targetId"] == "f-wimi"]
    blob = json.dumps(detail, ensure_ascii=False)
    return {
        "approve": r1,
        "history": hist,
        "refundEvent": detail,
        "threadId": thread_id,
        "checks": {
            "approved_once": s1 == 200
            and r1.get("status") == "APPROVED"
            and decisions("f-wimi") == before + 1,
            "farm_status_approved": next(a for a in app_view if a["farmId"] == "f-wimi")["status"]
            == "APPROVED",
            "history_actor_time": len(hist) == 1
            and hist[0]["managerId"] == "u-admin"
            and bool(hist[0]["decidedAt"]),
            "approve_audit_event_once": len(approve_events) == 1
            and approve_events[0]["actorId"] == "u-admin",
            "refund_exception_one_correct_thread": len(refund) == 1
            and detail.get("targetId") == thread_id
            and detail.get("messageId") == msg["message"]["messageId"],
            "no_body_or_consumer_pii": "환불해 주세요" not in blob
            and not any(p in blob for p in PII),
        },
        "note": "Approval history stores no reason for approvals (reason is only for rejections).",
    }


def manager_02(log: Log) -> dict:
    _, kang = log("GET", "/admin/farms/f-kang/preview", ADMIN, note="preview farm A")
    _, hyodon = log(
        "GET", "/admin/farms/f-hyodon/preview", ADMIN, note="preview farm B (similar product names)"
    )
    _, hk = log("GET", "/admin/producers/f-kang/decisions", ADMIN, note="history A")
    _, hh = log("GET", "/admin/producers/f-hyodon/decisions", ADMIN, note="history B")
    _, empty = log("GET", "/admin/producers/f-wimi/decisions", ADMIN, note="empty history target")
    _, missing = log("GET", "/admin/producers/f-nope/decisions", ADMIN, note="unknown target")
    _, caps = log("GET", "/admin/capacity-requests?status=ALL", ADMIN, note="capacity requests")
    with Session() as s:
        from app.catalog.models import Product
        from app.farms.models import Farm

        names = {
            p.id: (p.farm_id, p.name)
            for p in s.scalars(select(Product).where(Product.farm_id.in_(["f-kang", "f-hyodon"])))
        }
        owners = {
            f.id: f.producer_id
            for f in s.scalars(select(Farm).where(Farm.id.in_(["f-kang", "f-hyodon"])))
        }
    similar = sorted(n for _, n in names.values() if "하우스" in n)
    return {
        "previewA": kang,
        "previewB": hyodon,
        "productNames": names,
        "historyA": hk,
        "historyB": hh,
        "emptyHistory": empty,
        "unknownTarget": missing,
        "similarNames": similar,
        "checks": {
            "fixture_has_similar_names_on_both_farms": {
                names[i][0] for i in names if "하우스" in names[i][1]
            }
            == {"f-kang", "f-hyodon"},
            "preview_returns_requested_target_only": kang.get("farmId") == "f-kang"
            and kang.get("producerId") == owners["f-kang"]
            and hyodon.get("farmId") == "f-hyodon"
            and hyodon.get("producerId") == owners["f-hyodon"],
            "history_only_own_farm": all(d["farmId"] == "f-kang" for d in hk)
            and all(d["farmId"] == "f-hyodon" for d in hh),
            "empty_history_explicit": empty == [],
            "capacity_rows_match_product_farm": all(
                names.get(c["productId"], (c["farmId"],))[0] == c["farmId"] for c in caps
            ),
        },
        "ui": "admin page producers view renders '결정 이력이 없어요.' for an empty list (scripts/admin-web/api/_views/producers.html:104)",
    }


def manager_03(log: Log) -> dict:
    tries = []
    for who, token in (("producer", KANG), ("consumer", MINJI)):
        for method, path, body in (
            ("GET", "/admin/producers?status=ALL", None),
            ("GET", "/admin/exceptions?limit=5", None),
            ("GET", "/admin/orders/deposit-overdue", None),
            ("POST", "/admin/producers/f-wimi/approve", None),
            ("POST", "/admin/producers/f-wimi/reject", {"reason": "x"}),
            (
                "POST",
                "/admin/products/p-cheonggyeon/capacity-requests/capacity-p-cheonggyeon/approve",
                {"version": 1},
            ),
            ("POST", "/admin/orders/o-g6/delivered", None),
        ):
            s, _ = log(
                method,
                path,
                token,
                body,
                key=f"m3-{who}-{time.time()}",
                note=f"{who} {method} {path}",
            )
            tries.append({"who": who, "method": method, "path": path, "status": s})
    s_anon, _ = log("GET", "/admin/exceptions?limit=5", None, note="no token")
    wimi = log("GET", "/admin/producers?status=ALL", ADMIN, note="state after")[1]
    s_bad, bad = log(
        "POST",
        "/admin/producers/f-nope/approve",
        ADMIN,
        key=f"m3-bad-{time.time()}",
        note="invalid target",
    )
    s_empty, empty = log(
        "POST",
        "/admin/producers/f-wimi/reject",
        ADMIN,
        {"reason": ""},
        key=f"m3-e-{time.time()}",
        note="reject without reason",
    )
    s_b, b = log(
        "POST",
        "/admin/producers/f-halla/approve",
        ADMIN,
        key=f"m3-b-{time.time()}",
        note="approve already-approved farm B",
    )
    return {
        "attempts": tries,
        "invalid": bad,
        "emptyReason": empty,
        "farmB": b,
        "checks": {
            "non_admin_forbidden": all(t["status"] == 403 for t in tries) and s_anon == 401,
            "no_target_mutation": next(a for a in wimi if a["farmId"] == "f-wimi")["status"]
            == "PENDING"
            and decisions("f-wimi") == 0
            and db_order("o-g6")["status"] == "SHIPPED",
            "invalid_target_rejected_safely": s_bad == 404
            and s_empty in (400, 422)
            and s_b in (404, 409)
            and "Traceback" not in json.dumps([bad, empty, b]),
        },
    }


def manager_04(log: Log) -> dict:
    key = f"m4-approve-{time.time()}"
    path = "/admin/products/p-cheonggyeon/capacity-requests/capacity-p-cheonggyeon/approve"
    s1, r1 = log(
        "POST", path, ADMIN, {"version": 1}, key=key, note="approve (response treated as lost)"
    )
    s2, r2 = log("POST", path, ADMIN, {"version": 1}, key=key, note="replay same key")
    after_replay = events(event_type="capacity.approve")
    s3, r3 = log(
        "POST", path, ADMIN, {"version": 1}, key=f"{key}-new", note="extra: repeat with new key"
    )
    cap_events = events(event_type="capacity.approve")
    rkey = f"m4-refund-{time.time()}"
    sa, ra = refund_message(log, MINJI, "f-kang", rkey, "refund message")
    sb, rb = log(
        "POST",
        "/api/messaging/chats/f-kang/messages",
        MINJI,
        {"text": "상품이 상해서 환불해 주세요"},
        key=rkey,
        note="replay same message key",
    )
    refund_events = events(event_type="manager_refund_request")
    _, msgs = log(
        "GET", "/api/messaging/chats/f-kang/messages?limit=50", MINJI, note="consumer thread"
    )
    copies = [m for m in msgs["items"] if m.get("body") == "상품이 상해서 환불해 주세요"]
    return {
        "capacityEvents": cap_events,
        "observation": "Extra step beyond the matrix: a repeat with a NEW key is refused 409 STALE_VERSION and "
        "audited as one REJECTED manager event (not a second transition).",
        "refundEvents": refund_events,
        "checks": {
            "approve_replay_same_result": s1 == 200 and s2 == 200 and r1 == r2,
            "replay_adds_no_audit_record": len(after_replay) == 1
            and after_replay[0]["status"] == "SUCCEEDED",
            "one_approval_transition": s3 == 409
            and len([e for e in cap_events if e["status"] == "SUCCEEDED"]) == 1,
            "message_replay_same_result": sa == 200
            and sb == 200
            and ra["message"]["messageId"] == rb["message"]["messageId"],
            "one_message_one_exception": len(copies) == 1 and len(refund_events) == 1,
        },
    }


def manager_05(log: Log) -> dict:
    # second pending application (u-new applies)
    app_body = {
        "ownerName": "평가 농가주",
        "farmName": "평가 귤농장",
        "region": "제주 서귀포",
        "mainItems": "노지 감귤",
        "phone": "010-0000-0174",
    }
    s_app, applied = log(
        "POST",
        "/api/auth/producer-application",
        tok("u-new", "PRODUCER"),
        app_body,
        key=f"m5-app-{time.time()}",
        note="u-new applies (second pending)",
    )
    new_farm = applied.get("farmId") if isinstance(applied, dict) else None
    s_ok, _ = log(
        "POST",
        "/admin/producers/f-wimi/approve",
        ADMIN,
        key=f"m5-a-{time.time()}",
        note="approve f-wimi",
    )
    s_no, _ = log(
        "POST",
        f"/admin/producers/{new_farm}/reject",
        ADMIN,
        {"reason": "연락처 확인 필요"},
        key=f"m5-r-{time.time()}",
        note="reject new farm with reason",
    )
    _, hw = log("GET", "/admin/producers/f-wimi/decisions", ADMIN, note="history f-wimi")
    _, hn = log("GET", f"/admin/producers/{new_farm}/decisions", ADMIN, note="history new farm")

    # Refund/compensation messages are always handed to the farm before any model call (M-07,
    # app/ai/service.py), so there is no generation window to hold. The row's race is run as two
    # concurrent requests: the refund message and the producer's HUMAN + AI OFF switch.
    proxy_before = client.get(PROXY + "/_stats").json()["requests"]
    log(
        "POST",
        "/api/messaging/chats",
        SEOJUN,
        {"farmId": "f-kang"},
        key=f"m5-start-{time.time()}",
        note="start chat (new thread, AUTO)",
    )
    _, page = log(
        "GET", "/api/messaging/producer/chats/u-seojun/messages", KANG, note="thread before"
    )
    mode_before = page["thread"]["aiMode"]
    _, settings = log("GET", "/api/farms/me/ai-settings", KANG, note="ai settings before")
    gate = threading.Barrier(2)
    result: dict = {}

    def send():
        gate.wait()
        result["send"] = log(
            "POST",
            "/api/messaging/chats/f-kang/messages",
            SEOJUN,
            {"text": "받은 귤이 상했는데 환불이나 보상 받을 수 있나요?"},
            key=f"m5-msg1-{time.time()}",
            note="refund message 1 (concurrent)",
        )

    def switch():
        gate.wait()
        result["mode"] = log(
            "PUT",
            "/api/messaging/producer/chats/u-seojun/ai-mode",
            KANG,
            {"mode": "HUMAN", "version": page["thread"]["version"]},
            key=f"m5-mode-{time.time()}",
            note="switch to HUMAN (concurrent)",
        )
        result["off"] = log(
            "PUT",
            "/api/farms/me/ai-settings",
            KANG,
            {**settings, "enabled": False},
            key=f"m5-off-{time.time()}",
            note="AI OFF (concurrent)",
        )

    workers = [threading.Thread(target=send), threading.Thread(target=switch)]
    for w in workers:
        w.start()
    for w in workers:
        w.join(30)
    s1, m1 = result["send"]
    s2, m2 = log(
        "POST",
        "/api/messaging/chats/f-kang/messages",
        SEOJUN,
        {"text": "환불 언제 되나요?"},
        key=f"m5-msg2-{time.time()}",
        note="refund message 2 (after switch)",
    )
    _, msgs = log(
        "GET", "/api/messaging/chats/f-kang/messages?limit=50", SEOJUN, note="consumer thread after"
    )
    _, page_after = log(
        "GET", "/api/messaging/producer/chats/u-seojun/messages", KANG, note="thread after"
    )
    proxy_after = client.get(PROXY + "/_stats").json()["requests"]
    id1, id2 = m1["message"]["messageId"], m2["message"]["messageId"]
    seq2 = m2["message"]["sequence"]
    reply1 = m1.get("reply")
    ai_msgs = [m for m in msgs["items"] if m.get("senderType") == "AI"]
    refund_events = events(event_type="manager_refund_request")
    return {
        "newFarm": new_farm,
        "historyWimi": hw,
        "historyNew": hn,
        "modeBefore": mode_before,
        "modeAfter": page_after["thread"]["aiMode"],
        "settingsAfter": result["off"][1],
        "message1": m1,
        "message2": m2,
        "aiMessagesInThread": ai_msgs,
        "refundEvents": refund_events,
        "modelCalls": proxy_after - proxy_before,
        "checks": {
            "decisions_attached_to_correct_targets": s_app == 200
            and s_ok == 200
            and s_no == 200
            and [d["decision"] for d in hw] == ["APPROVED"]
            and [d["decision"] for d in hn] == ["REJECTED"]
            and hn[0]["reason"] == "연락처 확인 필요"
            and all(d["farmId"] == "f-wimi" for d in hw),
            "started_auto_ended_human_off": mode_before == "AUTO"
            and page_after["thread"]["aiMode"] == "HUMAN"
            and result["off"][1].get("enabled") is False,
            "exception_exactly_once_per_message": s1 == 200
            and s2 == 200
            and len(refund_events) == 2
            and sorted(e["messageId"] for e in refund_events) == sorted([id1, id2]),
            "no_model_answer_for_refund": proxy_after == proxy_before
            and (
                reply1 is None
                or (reply1.get("handoffStatus") == "FORWARDED" and not reply1.get("sourceRefs"))
            ),
            "no_ai_reply_after_switch": m2.get("reply") is None
            and not [m for m in ai_msgs if m["sequence"] > seq2],
        },
    }


CASES = {
    "I3-PRODORD-01": prodord_01,
    "I3-PRODORD-02": prodord_02,
    "I3-PRODORD-03": prodord_03,
    "I3-PRODORD-04": prodord_04,
    "I3-PRODORD-05": prodord_05,
    "I3-MANAGER-01": manager_01,
    "I3-MANAGER-02": manager_02,
    "I3-MANAGER-03": manager_03,
    "I3-MANAGER-04": manager_04,
    "I3-MANAGER-05": manager_05,
}


def main(selected: list[str]) -> None:
    sha = subprocess.run(
        ["git", "rev-parse", "HEAD"], capture_output=True, text=True
    ).stdout.strip()
    dirty = bool(
        subprocess.run(
            ["git", "status", "--porcelain", "--", "server", "apps", "packages"],
            capture_output=True,
            text=True,
        ).stdout.strip()
    )
    for case in selected or CASES:
        log = Log()
        start = datetime.now(UTC).isoformat()
        reset_proof = reset()
        try:
            out = CASES[case](log)
            verdict = "PASS" if all(out["checks"].values()) else "FAIL"
        except Exception as exc:  # an attempted run that breaks is a FAIL, never a PASS
            out, verdict = {"checks": {}, "error": repr(exc)}, "FAIL"
        record = {
            "case": case,
            "baseline": BASELINE,
            "gitSha": sha,
            "productCodeDirty": dirty,
            "api": API,
            "database": DB_URL.rsplit("/", 1)[-1],
            "fixedNow": os.environ.get("FIXED_NOW") or get_settings().fixed_now,
            "start": start,
            "end": datetime.now(UTC).isoformat(),
            "reset": reset_proof,
            "verdict": verdict,
            **out,
            "calls": log.calls,
        }
        (TRACES / f"{case}.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=1, default=str)
        )
        failed = [k for k, v in out["checks"].items() if not v]
        print(
            f"{case}: {verdict}"
            + (f"  failed={failed}" if failed else "")
            + (f"  error={out['error']}" if "error" in out else "")
        )


if __name__ == "__main__":
    main(sys.argv[1:])
