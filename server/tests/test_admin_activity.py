"""DEV-307 관리자 사용자 활동 로그 GET /admin/users/{userId}/activity (FEAT-23 AC-23-9·10)."""

import json
import logging
import uuid

import httpx
import pytest
from pydantic import SecretStr

from app.accounts.models import User
from app.admin import posthog_events
from app.core.config import get_settings
from app.core.db import get_sessionmaker

SECRET = "phx_test_personal_key_do_not_log"


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


@pytest.fixture
def posthog(monkeypatch):
    """PostHog 조회 설정을 켜고, 보낸 요청을 기록하는 가짜 전송을 끼운다."""
    settings = get_settings()
    monkeypatch.setattr(settings, "posthog_personal_api_key", SecretStr(SECRET))
    monkeypatch.setattr(settings, "posthog_project_id", "12345")
    monkeypatch.setattr(settings, "posthog_host", "https://us.i.posthog.com")
    sent: list[httpx.Request] = []

    def use(handler):
        def record(request: httpx.Request) -> httpx.Response:
            sent.append(request)
            return handler(request)

        monkeypatch.setattr(posthog_events, "TRANSPORT", httpx.MockTransport(record))
        return sent

    return use


def activity(client, admin_headers, user_id: str):
    response = client.get(f"/admin/users/{user_id}/activity", headers=admin_headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_AC_23_9_admin_only(client, login):
    assert client.get("/admin/users/u-minji/activity").status_code == 401
    assert client.get("/admin/users/u-minji/activity", headers=login("u-kang")).status_code == 403


def test_AC_23_9_unknown_user(client, admin_headers):
    response = client.get("/admin/users/u-404/activity", headers=admin_headers)
    assert response.status_code == 404


def test_AC_23_9_consumer_activity_has_signup_orders_and_support(client, admin_headers, login):
    # 소비자 문의 하나를 남기고 운영자가 답한다
    sent = client.post(
        "/api/messaging/support/messages",
        headers=login("u-seojun") | key(),
        json={"text": "배송 문의"},
    )
    assert sent.status_code == 200, sent.text
    reply = client.post(
        "/admin/support/consumers/u-seojun/messages",
        headers=admin_headers | key(),
        json={"text": "확인해 드릴게요"},
    )
    assert reply.status_code == 200, reply.text

    body = activity(client, admin_headers, "u-seojun")
    assert body["role"] == "CONSUMER" and body["accountKind"] == "SEED_TEST"
    assert body["withdrawn"] is False
    kinds = [i["kind"] for i in body["items"]]
    assert "SIGNUP" in kinds and "ORDER_CREATED" in kinds and "ORDER_PAID" in kinds
    assert {"SUPPORT_MESSAGE", "SUPPORT_REPLY"} <= set(kinds)
    times = [i["at"] for i in body["items"]]
    assert times == sorted(times, reverse=True)  # 최신순
    order = next(i for i in body["items"] if i["kind"] == "ORDER_CREATED")
    assert order["refType"] == "order" and order["meta"]["orderNo"].startswith("FC-")
    # 본문·받는 사람 정보는 내려 주지 않는다
    text = json.dumps(body, ensure_ascii=False)
    assert "배송 문의" not in text and "확인해 드릴게요" not in text
    assert "이서준" not in text and "해운대" not in text


def test_AC_23_9_producer_activity_has_farm_decisions_products_and_operator_marks(
    client, admin_headers
):
    assert client.post(
        "/admin/farms/f-hyodon/suspend",
        headers=admin_headers | key(),
        json={"reason": "확인 필요"},
    ).is_success
    marked = client.post("/admin/users/u-hyodon/mark-tester", headers=admin_headers | key())
    assert marked.status_code == 200, marked.text

    body = activity(client, admin_headers, "u-hyodon")
    assert body["accountKind"] == "OPS_TESTER"
    kinds = {i["kind"] for i in body["items"]}
    assert {"SIGNUP", "FARM_APPLIED", "FARM_SUSPENDED", "PRODUCT_UPDATED"} <= kinds
    assert "OPS_TESTER_MARKED" in kinds
    suspended = next(i for i in body["items"] if i["kind"] == "FARM_SUSPENDED")
    assert suspended["meta"]["reason"] == "확인 필요"
    product = next(i for i in body["items"] if i["kind"] == "PRODUCT_UPDATED")
    assert product["refId"] == "p-hyodon" and product["meta"]["status"] == "PUBLISHED"


def test_AC_23_9_producer_activity_has_capacity_and_received_orders(client, admin_headers):
    body = activity(client, admin_headers, "u-kang")
    kinds = {i["kind"] for i in body["items"]}
    assert {"CAPACITY_REQUESTED", "ORDER_RECEIVED", "FARM_APPLIED"} <= kinds


def test_AC_23_9_withdrawn_user_is_flagged(client, admin_headers, login):
    # 주문 없는 실사용자 농가 u-namwon이 탈퇴한다(테스트 계정은 탈퇴할 수 없다)
    from app.accounts import service as accounts

    with get_sessionmaker()() as session, session.begin():
        accounts.withdraw(session, session.get(User, "u-namwon"))
    body = activity(client, admin_headers, "u-namwon")
    assert body["withdrawn"] is True
    assert "WITHDRAWN" in {i["kind"] for i in body["items"]}


# ---------------- PostHog ----------------


def test_AC_23_10_posthog_disabled_without_key(client, admin_headers, monkeypatch):
    def fail(_request):
        raise AssertionError("키가 없으면 PostHog를 부르지 않는다")

    monkeypatch.setattr(posthog_events, "TRANSPORT", httpx.MockTransport(fail))
    body = activity(client, admin_headers, "u-minji")
    assert body["posthog"] == {"status": "disabled", "personUrl": None, "events": []}
    assert body["items"]  # 서버 기록은 그대로

    # 프로젝트 ID만 있으면 링크는 주고 조회는 하지 않는다
    monkeypatch.setattr(get_settings(), "posthog_project_id", "12345")
    body = activity(client, admin_headers, "u-minji")
    assert body["posthog"]["status"] == "disabled"
    assert body["posthog"]["personUrl"] == "https://us.posthog.com/project/12345/person/u-minji"


def test_AC_23_10_posthog_success(client, admin_headers, posthog):
    sent = posthog(
        lambda request: httpx.Response(
            200,
            json={
                "columns": ["event", "timestamp", "properties.app", "properties.$pathname"],
                "results": [
                    ["$pageview", "2026-10-07T09:00:00Z", "consumer", "/orders"],
                    ["order_paid", "2026-10-07T08:00:00Z", None, None],
                ],
            },
        )
    )
    body = activity(client, admin_headers, "u-minji")
    assert body["posthog"]["status"] == "ok"
    assert body["posthog"]["personUrl"] == "https://us.posthog.com/project/12345/person/u-minji"
    assert [e["event"] for e in body["posthog"]["events"]] == ["$pageview", "order_paid"]
    assert body["posthog"]["events"][0]["pathname"] == "/orders"

    [request] = sent
    # 앱 수집 호스트를 넣어도 조회 API 호스트로 보낸다
    assert str(request.url) == "https://us.posthog.com/api/projects/12345/query/"
    assert request.headers["Authorization"] == f"Bearer {SECRET}"
    payload = json.loads(request.content)
    assert payload["query"]["kind"] == "HogQLQuery"
    # 사용자 ID는 쿼리 문자열이 아니라 값으로 넘긴다
    assert payload["query"]["values"] == {"distinct_id": "u-minji"}
    assert "u-minji" not in payload["query"]["query"]
    assert SECRET not in json.dumps(body)


@pytest.mark.parametrize(
    "handler",
    [
        lambda request: httpx.Response(401, json={"detail": "bad key"}),
        lambda request: httpx.Response(500, text="boom"),
        lambda request: httpx.Response(200, text="not json"),
        lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("slow", request=request)),
        lambda request: (_ for _ in ()).throw(httpx.ConnectError("down", request=request)),
    ],
    ids=["401", "500", "bad-json", "timeout", "connect-error"],
)
def test_AC_23_10_posthog_failure_marks_unavailable_and_page_still_loads(
    client, admin_headers, posthog, caplog, handler
):
    posthog(handler)
    with caplog.at_level(logging.DEBUG):
        body = activity(client, admin_headers, "u-minji")
    assert body["posthog"]["status"] == "unavailable"
    assert body["posthog"]["events"] == []
    assert body["posthog"]["personUrl"].endswith("/person/u-minji")
    assert body["items"]
    assert SECRET not in caplog.text  # 키는 로그에 남기지 않는다
    assert SECRET not in json.dumps(body)


def test_AC_23_10_api_host_normalization():
    assert posthog_events.api_host("https://us.i.posthog.com") == "https://us.posthog.com"
    assert posthog_events.api_host("https://eu.i.posthog.com/") == "https://eu.posthog.com"
    assert posthog_events.api_host("") == "https://us.posthog.com"
    assert posthog_events.api_host("https://ph.example.com") == "https://ph.example.com"


def test_AC_23_10_settings_hide_key():
    settings = get_settings()
    assert SECRET not in repr(
        settings.model_copy(update={"posthog_personal_api_key": SecretStr(SECRET)})
    )
