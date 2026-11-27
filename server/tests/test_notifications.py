"""DEV-495 농가 주문 알림(FEAT-18): 넣기·멱등·주문 격리·보내지 않는 경우·발송 루프·관리 API.

외부로 나가는 연결은 없다. 발송자는 테스트 안의 가짜이거나
`httpx.MockTransport`를 쓴 솔라피 클라이언트다.
번호는 모두 가짜(010-0000-xxxx)다.
"""

import json
import logging
import uuid
from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select, text, update

from app.accounts.models import User
from app.core.clock import now
from app.core.config import Settings, get_settings
from app.core.db import get_sessionmaker
from app.core.masking import phone_tail
from app.farms.models import Farm
from app.notifications import service as notify_service
from app.notifications import worker
from app.notifications.models import Notification, NotificationSettings
from app.notifications.sender import NoopSender, SendResult, build_sender
from app.orders.models import Order
from tests.test_orders import deposit, key, order_body

FAKE_PHONE = "010-0000-1234"
FAKE_DIGITS = "01000001234"
SECRET = "test-secret-not-real"


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def rows(order_id: str | None = None) -> list[Notification]:
    with get_sessionmaker()() as db:
        query = select(Notification).order_by(Notification.created_at, Notification.id)
        if order_id:
            query = query.where(Notification.order_id == order_id)
        return list(db.scalars(query))


def set_now(monkeypatch, value: str) -> None:
    monkeypatch.setattr(get_settings(), "fixed_now", value)


class FakeSender:
    """보낸 메시지를 모으고 정해 둔 결과를 돌려준다."""

    def __init__(self, *results: SendResult):
        self.results = list(results) or [SendResult("sent", None, "G-test", "M-test")]
        self.sent = []

    def send(self, message):
        self.sent.append(message)
        return self.results.pop(0) if len(self.results) > 1 else self.results[0]

    def close(self):
        return None


@pytest.fixture
def live(client, monkeypatch):
    """솔라피가 켜진 것처럼 두고 f-kang을 실제 농가(테스트 계정 아님, 가짜 번호)로 바꾼다.

    생산자 u-kang 헤더를 돌려준다(테스트 계정이 아니면 지금 버전 동의가 필요하다).
    """
    from app.accounts.schemas import CONSENT_VERSION, REQUIRED_PRODUCER_CONSENTS
    from app.core.security import issue_token

    settings = get_settings()
    monkeypatch.setattr(settings, "notify_provider", "solapi")
    monkeypatch.setattr(settings, "solapi_template_order_awaiting_deposit", "TPL_ORDER")
    monkeypatch.setattr(settings, "solapi_template_deposit_reported", "TPL_REPORTED")
    with get_sessionmaker()() as db, db.begin():
        db.execute(update(User).where(User.id == "u-kang").values(is_test_account=False))
        db.execute(update(Farm).where(Farm.id == "f-kang").values(contact_phone=FAKE_PHONE))
    producer = {"Authorization": f"Bearer {issue_token('u-kang', 'PRODUCER')}"}
    consents = [{"kind": k, "version": CONSENT_VERSION} for k in REQUIRED_PRODUCER_CONSENTS]
    ok(client.post("/api/auth/me/consents", json={"consents": consents}, headers=producer))
    return producer


def new_order(client, consumer) -> str:
    return ok(client.post("/api/orders", headers=consumer | key(), json=order_body()))["orderId"]


def waiting(client, consumer) -> dict:
    return ok(deposit(client, consumer, new_order(client, consumer)))


# --- 넣기·멱등 ---------------------------------------------------------------


def test_AC_18_1_deposit_request_enqueues_one_pending_row(client, login, live):
    consumer = login("u-seojun")
    order_id = new_order(client, consumer)
    same = {"Idempotency-Key": str(uuid.uuid4())}
    first = ok(client.post(f"/api/orders/{order_id}/deposit", headers=consumer | same, json={}))
    ok(client.post(f"/api/orders/{order_id}/deposit", headers=consumer | same, json={}))
    ok(deposit(client, consumer, order_id))  # 다른 키: 이미 입금 대기라 그대로 돌려준다

    [row] = rows(order_id)
    assert (row.event, row.status, row.farm_id) == ("ORDER_AWAITING_DEPOSIT", "PENDING", "f-kang")
    assert row.dedupe_key == f"order_awaiting_deposit:{order_id}"
    assert row.variables == {
        "#{농가명}": "강씨네 귤밭",
        "#{상품명}": row.variables["#{상품명}"],
        "#{수량}": "1박스",
        "#{입금자명}": first["depositCode"],
        "#{입금금액}": f"{first['totalAmount']:,}",
        "#{입금기한}": "10월 8일 오전 10시",
    }
    assert row.variables["#{상품명}"].endswith("5kg") and len(row.variables["#{상품명}"]) <= 40
    # 받는 사람 이름·주소·전화번호는 행 어디에도 없다
    stored = json.dumps(row.variables, ensure_ascii=False)
    for value in ("이서준", "010-3456-7890", "해운대"):
        assert value not in stored


def test_AC_18_1_undo_back_to_awaiting_deposit_does_not_add_rows(client, login, live):
    consumer = login("u-seojun")
    order = waiting(client, consumer)
    oid = order["orderId"]
    confirmed = ok(
        client.post(f"/api/orders/{oid}/confirm-deposit", headers=live | key(), json={})
    )
    action_id = confirmed["undoAction"]["actionId"]
    restored = client.post(
        f"/api/orders/{oid}/undo", headers=live | key(), json={"actionId": action_id}
    )
    assert ok(restored)["status"] == "AWAITING_DEPOSIT"
    assert [r.event for r in rows(oid)] == ["ORDER_AWAITING_DEPOSIT"]


def test_AC_18_2_each_deposit_report_enqueues_one_row(client, login, live, monkeypatch):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))
    ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))  # 이미 알림: 그대로
    # 고정 시계라 만든 시각이 같다. 순서가 아니라 모음으로 본다
    assert sorted(r.event for r in rows(oid)) == ["DEPOSIT_REPORTED", "ORDER_AWAITING_DEPOSIT"]

    # 생산자 미승인(입금 대기 유지) 뒤 다시 알리면 새 알림
    ok(
        client.post(
            f"/api/orders/{oid}/reject-deposit",
            headers=live | key(),
            json={"reason": "아직 입금이 안 보여요", "cancel": False},
        )
    )
    set_now(monkeypatch, "2026-10-07T11:00:00+09:00")
    ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))
    reported = sorted(
        (r for r in rows(oid) if r.event == "DEPOSIT_REPORTED"), key=lambda r: r.created_at
    )
    assert len(reported) == 2 and len({r.dedupe_key for r in reported}) == 2
    assert all(r.status == "PENDING" for r in reported)
    assert "#{농가명}" not in reported[0].variables and "#{입금자명}" in reported[0].variables


# --- 주문과 떼어 놓기 ---------------------------------------------------------------


def test_AC_18_3_enqueue_failure_does_not_fail_the_order(client, login, live, monkeypatch, caplog):
    consumer = login("u-seojun")
    order_id = new_order(client, consumer)

    def broken(db, order):
        db.execute(text("select 1/0"))  # 실제 DB 오류(savepoint 안)

    monkeypatch.setattr(notify_service, "_order_variables", broken)
    with caplog.at_level(logging.WARNING, logger="app.notifications"):
        response = deposit(client, consumer, order_id)
        reported = client.post(f"/api/orders/{order_id}/deposit-reported", headers=consumer)
    assert ok(response)["status"] == "AWAITING_DEPOSIT"
    assert ok(reported)["status"] == "AWAITING_DEPOSIT"
    with get_sessionmaker()() as db:
        order = db.get(Order, order_id)
        assert order.status == "AWAITING_DEPOSIT" and order.deposit_reported_at is not None
    assert rows(order_id) == []
    assert "notification enqueue failed" in caplog.text
    assert "DataError" in caplog.text or "ProgrammingError" in caplog.text


def test_AC_18_3_db_error_in_farm_checks_does_not_fail_the_order(client, login, live, monkeypatch):
    """농가 검사(테스트 계정·설정 읽기)에서 난 DB 오류도 savepoint 안에서 끝난다."""
    consumer = login("u-seojun")
    order_id = new_order(client, consumer)

    def broken(db, farm):
        db.execute(text("select 1/0"))

    monkeypatch.setattr(notify_service, "skip_reason", broken)
    assert ok(deposit(client, consumer, order_id))["status"] == "AWAITING_DEPOSIT"
    reported = client.post(f"/api/orders/{order_id}/deposit-reported", headers=consumer)
    assert ok(reported)["depositReportedAt"]
    with get_sessionmaker()() as db:
        assert db.get(Order, order_id).deposit_reported_at is not None
    assert rows(order_id) == []


def test_AC_18_3_provider_off_skips_and_order_response_is_the_same(
    client, login, live, monkeypatch
):
    consumer = login("u-seojun")
    on = waiting(client, consumer)
    monkeypatch.setattr(get_settings(), "notify_provider", "none")
    off = waiting(client, consumer)
    assert set(on) == set(off) and on["status"] == off["status"] == "AWAITING_DEPOSIT"
    [row] = rows(off["orderId"])
    assert (row.status, row.skip_reason, row.variables) == ("SKIPPED", "provider_disabled", {})


def test_AC_18_3_provider_errors_never_touch_the_order(client, login, live):
    consumer = login("u-seojun")
    order = waiting(client, consumer)
    worker.run_once(FakeSender(SendResult("retry", "ConnectTimeout")))
    detail = ok(client.get(f"/api/orders/{order['orderId']}", headers=consumer))
    assert detail["status"] == "AWAITING_DEPOSIT"
    due = (detail["depositDueAt"], order["depositDueAt"])
    assert len({datetime.fromisoformat(v.replace("Z", "+00:00")) for v in due}) == 1


# --- 보내지 않는 경우 ---------------------------------------------------------------


def test_AC_18_4_seed_test_account_farm_is_skipped(client, login):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    [row] = rows(oid)
    assert (row.status, row.skip_reason) == ("SKIPPED", "test_account")


def test_AC_18_4_farm_turned_off_or_bad_phone_is_skipped(client, login, live):
    consumer = login("u-seojun")
    with get_sessionmaker()() as db, db.begin():
        db.add(
            NotificationSettings(
                farm_id="f-kang", order_alimtalk_enabled=False, updated_at=now()
            )
        )
    first = waiting(client, consumer)["orderId"]
    assert rows(first)[0].skip_reason == "farm_disabled"
    with get_sessionmaker()() as db, db.begin():
        db.execute(update(NotificationSettings).values(order_alimtalk_enabled=True))
        db.execute(update(Farm).where(Farm.id == "f-kang").values(contact_phone="064-000-0000"))
    second = waiting(client, consumer)["orderId"]
    assert rows(second)[0].skip_reason == "invalid_phone"


def test_AC_18_4_checks_again_right_before_sending(client, login, live):
    consumer = login("u-seojun")
    a = waiting(client, consumer)["orderId"]
    b = waiting(client, consumer)["orderId"]
    with get_sessionmaker()() as db, db.begin():
        db.execute(update(User).where(User.id == "u-kang").values(is_test_account=True))
    sender = FakeSender()
    worker.run_once(sender)
    assert sender.sent == []
    assert {r.skip_reason for r in rows(a) + rows(b)} == {"test_account"}


def test_AC_18_4_unapproved_farm_at_send_time_is_skipped(client, login, live):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    with get_sessionmaker()() as db, db.begin():
        db.execute(update(Farm).where(Farm.id == "f-kang").values(approval_status="SUSPENDED"))
    worker.run_once(FakeSender())
    assert rows(oid)[0].skip_reason == "farm_not_approved"


def test_AC_18_4_rate_limits_skip_extra_rows(client, login, live, monkeypatch):
    consumer = login("u-seojun")
    monkeypatch.setattr(get_settings(), "notify_farm_hourly_limit", 1)
    first, second = waiting(client, consumer)["orderId"], waiting(client, consumer)["orderId"]
    sender = FakeSender()
    worker.run_once(sender)
    assert len(sender.sent) == 1
    got = sorted((r.status, r.skip_reason) for r in rows(first) + rows(second))
    assert got == [("SENT", None), ("SKIPPED", "rate_limited")]

    # 한 시간이 지나면 농가 한도가 풀리고, 하루 한도는 그날 보낸 건수로 센다
    set_now(monkeypatch, "2026-10-07T11:30:00+09:00")
    monkeypatch.setattr(get_settings(), "notify_daily_limit", 1)
    third = waiting(client, consumer)["orderId"]
    worker.run_once(sender)
    assert rows(third)[0].skip_reason == "rate_limited"


# --- 발송 루프 ---------------------------------------------------------------


def test_AC_18_6_sends_once_and_records_provider_ids(client, login, live):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    sender = FakeSender(SendResult("sent", None, "G-1", "M-1"))
    assert worker.run_once(sender) == 1
    assert worker.run_once(sender) == 0
    [message] = sender.sent
    assert message.to == FAKE_DIGITS and message.template_id == "TPL_ORDER"
    [row] = rows(oid)
    assert (row.status, row.attempts, row.phone_last4) == ("SENT", 1, "1234")
    assert (row.provider_group_id, row.provider_message_id) == ("G-1", "M-1")
    assert row.sent_at is not None and row.lease_token is None


def test_AC_18_6_retries_transient_errors_then_fails(client, login, live, monkeypatch):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    sender = FakeSender(SendResult("retry", "http_503"))
    clock = ["2026-10-07T10:00:00+09:00", "2026-10-07T10:01:00+09:00",
             "2026-10-07T10:06:00+09:00", "2026-10-07T10:36:00+09:00"]
    waits = []
    for value in clock:
        set_now(monkeypatch, value)
        assert worker.run_once(sender) == 1
        row = rows(oid)[0]
        waits.append((row.status, row.attempts))
        # 아직 때가 안 됐으면 다시 가져가지 않는다
        assert worker.run_once(sender) == 0
    assert waits == [("PENDING", 1), ("PENDING", 2), ("PENDING", 3), ("FAILED", 4)]
    assert rows(oid)[0].last_error == "http_503"


def test_AC_18_6_permanent_errors_fail_immediately(client, login, live):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    worker.run_once(FakeSender(SendResult("failed", "http_400:ValidationError")))
    row = rows(oid)[0]
    assert (row.status, row.attempts, row.last_error) == ("FAILED", 1, "http_400:ValidationError")


def test_AC_18_6_sender_exception_is_retried(client, login, live):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]

    class Broken(FakeSender):
        def send(self, message):
            raise RuntimeError("boom")

    worker.run_once(Broken())
    row = rows(oid)[0]
    assert (row.status, row.last_error) == ("PENDING", "RuntimeError")


def test_AC_18_6_order_state_rechecked_before_sending(client, login, live):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))
    ok(client.post(f"/api/orders/{oid}/confirm-deposit", headers=live | key(), json={}))
    sender = FakeSender()
    worker.run_once(sender)
    assert sender.sent == []
    assert {r.skip_reason for r in rows(oid)} == {"order_state_changed"}


def test_AC_18_6_reported_row_skipped_after_rejection_clears_signal(client, login, live):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    ok(client.post(f"/api/orders/{oid}/deposit-reported", headers=consumer))
    ok(
        client.post(
            f"/api/orders/{oid}/reject-deposit",
            headers=live | key(),
            json={"reason": "아직 입금이 안 보여요", "cancel": False},
        )
    )
    sender = FakeSender()
    worker.run_once(sender)
    by_event = {r.event: r for r in rows(oid)}
    assert by_event["ORDER_AWAITING_DEPOSIT"].status == "SENT"
    assert by_event["DEPOSIT_REPORTED"].skip_reason == "order_state_changed"


def test_AC_18_6_rows_older_than_six_hours_are_skipped(client, login, live, monkeypatch):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    set_now(monkeypatch, "2026-10-07T16:00:01+09:00")
    sender = FakeSender()
    worker.run_once(sender)
    assert sender.sent == [] and rows(oid)[0].skip_reason == "stale"


def test_AC_18_6_expired_lease_is_taken_again_and_old_result_is_ignored(
    client, login, live, monkeypatch
):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    [stuck] = worker.claim()  # 이 루프가 보내다 죽었다고 본다
    assert worker.claim() == []  # 임대 중에는 아무도 못 가져간다
    set_now(monkeypatch, "2026-10-07T10:01:01+09:00")
    [again] = worker.claim()
    assert again.id == stuck.id and again.token != stuck.token
    worker.finish(again, SendResult("sent", None, "G-2", "M-2"))
    worker.finish(stuck, SendResult("failed", "late"))  # 늦게 끝난 옛 임대는 덮어쓰지 않는다
    row = rows(oid)[0]
    assert (row.status, row.attempts, row.provider_message_id) == ("SENT", 2, "M-2")


def test_AC_18_6_noop_sender_skips(client, login, live):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    worker.run_once(NoopSender())
    assert rows(oid)[0].skip_reason == "provider_disabled"


def test_worker_starts_only_for_solapi(monkeypatch):
    monkeypatch.setattr(get_settings(), "notify_provider", "none")
    assert worker.start() is None


# --- 로그·관리 응답 가림 ---------------------------------------------------------------


def test_AC_18_5_logs_and_admin_responses_hide_phone_variables_and_keys(
    client, login, live, admin_headers, monkeypatch, caplog
):
    settings = get_settings()
    monkeypatch.setattr(settings, "solapi_api_key", type(settings.solapi_api_key)("KEY-NOT-REAL"))
    monkeypatch.setattr(settings, "solapi_api_secret", type(settings.solapi_api_secret)(SECRET))
    monkeypatch.setattr(settings, "solapi_pfid", "KA01PF-NOT-REAL")
    monkeypatch.setattr(settings, "solapi_sender_number", "010-0000-9999")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if len(seen) == 1:
            return httpx.Response(503, json={"errorCode": "Unavailable"})
        return httpx.Response(
            200,
            json={
                "groupInfo": {"groupId": "G4V-TEST"},
                "messageList": [{"messageId": "M4V-TEST", "statusCode": "2000"}],
                "failedMessageList": [],
            },
        )

    consumer = login("u-seojun")
    with caplog.at_level(logging.DEBUG):
        order = waiting(client, consumer)
        sender = build_sender(settings, transport=httpx.MockTransport(handler))
        worker.run_once(sender)
        set_now(monkeypatch, "2026-10-07T10:01:00+09:00")
        worker.run_once(sender)
        listed = ok(
            client.get(f"/admin/notifications?orderId={order['orderId']}", headers=admin_headers)
        )
    assert len(seen) == 2
    [view] = listed
    assert view["status"] == "SENT" and view["phoneTail"] == "●●●●1234"
    assert view["providerMessageId"] == "M4V-TEST" and "variables" not in view
    exposed = caplog.text + json.dumps(listed, ensure_ascii=False)
    for secret in (FAKE_DIGITS, FAKE_PHONE, "0000-1234", SECRET, "KEY-NOT-REAL",
                   "signature=", order["depositCode"], "강씨네 귤밭"):
        assert secret not in exposed, secret
    assert "●●●●1234" in caplog.text
    # 요청에는 실제로 번호·서명이 들어간다(가린 것은 로그·응답뿐)
    body = json.loads(seen[-1].content)
    assert body["messages"][0]["to"] == FAKE_DIGITS
    assert seen[-1].headers["Authorization"].startswith("HMAC-SHA256 apiKey=KEY-NOT-REAL, ")
    assert repr(sender) == "SolapiSender(<redacted>)"


def test_phone_tail():
    assert phone_tail(FAKE_PHONE) == "●●●●1234"
    assert phone_tail("12") == "●●●●"
    assert phone_tail(None) == "●●●●"


# --- 관리 API ---------------------------------------------------------------


def test_AC_18_7_admin_lists_and_retries_failed_only(client, login, live, admin_headers):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    other = waiting(client, consumer)["orderId"]
    worker.run_once(FakeSender(SendResult("failed", "http_400:BadTemplate")))
    failed = ok(client.get("/admin/notifications?status=FAILED", headers=admin_headers))
    assert {v["orderId"] for v in failed} == {oid, other}
    nid = next(v["notificationId"] for v in failed if v["orderId"] == oid)

    no_key = client.post(f"/admin/notifications/{nid}/retry", headers=admin_headers)
    assert no_key.status_code == 400
    same = {"Idempotency-Key": str(uuid.uuid4())}
    retried = ok(client.post(f"/admin/notifications/{nid}/retry", headers=admin_headers | same))
    assert (retried["status"], retried["attempts"]) == ("PENDING", 0)
    replay = ok(client.post(f"/admin/notifications/{nid}/retry", headers=admin_headers | same))
    assert replay == retried
    again = client.post(f"/admin/notifications/{nid}/retry", headers=admin_headers | key())
    assert again.status_code == 409

    worker.run_once(FakeSender())
    assert rows(oid)[0].status == "SENT"
    with get_sessionmaker()() as db:
        from app.admin.models import ManagerEvent

        events = db.scalar(
            select(func.count()).select_from(ManagerEvent).where(
                ManagerEvent.target_type == "notification", ManagerEvent.target_id == nid
            )
        )
    assert events >= 1


def test_AC_18_7_retry_refused_when_provider_off(client, login, live, admin_headers, monkeypatch):
    consumer = login("u-seojun")
    oid = waiting(client, consumer)["orderId"]
    worker.run_once(FakeSender(SendResult("failed", "http_400:BadTemplate")))
    nid = rows(oid)[0].id
    monkeypatch.setattr(get_settings(), "notify_provider", "none")
    refused = client.post(f"/admin/notifications/{nid}/retry", headers=admin_headers | key())
    assert refused.status_code == 409 and refused.json()["details"]["reason"] == "NOTIFY_DISABLED"


def test_AC_18_7_admin_api_requires_admin(client, login):
    producer = login("u-kang")
    assert client.get("/admin/notifications", headers=producer).status_code == 403
    assert client.get("/admin/notifications").status_code == 401


# --- 설정 ---------------------------------------------------------------


def test_solapi_settings_required_outside_local():
    base = {"app_env": "production", "jwt_secret": "x", "source_storage": "r2",
            "source_r2_endpoint": "e", "source_r2_bucket": "b",
            "source_r2_access_key": "a", "source_r2_secret_key": "s"}
    assert Settings(**base).notify_provider == "none"
    with pytest.raises(ValueError, match="SOLAPI_"):
        Settings(**base, notify_provider="solapi")
    with pytest.raises(ValueError, match="NOTIFY_PROVIDER"):
        Settings(**base, notify_provider="sms")
    full = Settings(
        **base,
        notify_provider="solapi",
        solapi_api_key="k",
        solapi_api_secret="s",
        solapi_pfid="p",
        solapi_sender_number="01000000000",
        solapi_template_order_awaiting_deposit="t1",
        solapi_template_deposit_reported="t2",
    )
    assert full.notify_provider == "solapi" and "s" not in repr(full.solapi_api_secret)


def test_deadline_text():
    from app.core.clock import KST

    assert notify_service.deadline_text(datetime(2026, 11, 28, 15, 0, tzinfo=KST)) == (
        "11월 28일 오후 3시"
    )
    assert notify_service.deadline_text(datetime(2026, 11, 28, 0, 5, tzinfo=KST)) == (
        "11월 28일 오전 12시 5분"
    )
    assert notify_service.deadline_text(
        datetime(2026, 11, 28, 3, 0, tzinfo=KST) + timedelta(hours=9)
    ) == "11월 28일 오후 12시"
