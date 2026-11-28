"""DEV-498: 예상 못 한 서버 오류를 PostHog `$exception`으로 보고한다. httpx는 모두 가짜다."""

import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.analytics import service
from app.analytics.service import scrub_error_text
from app.core.config import get_settings
from app.core.errors import install_error_handlers

BODY_500 = {"code": "INTERNAL_ERROR", "message": "잠시 후 다시 시도해 주세요.", "details": {}}


@pytest.fixture
def app_client():
    app = FastAPI()
    install_error_handlers(app)

    @app.post("/api/orders/{order_id}")
    def boom(order_id: str, body: dict):
        raise RuntimeError(
            "fail for kim@example.com phone 010-1234-5678 https://x.io/a?token=SECRET"
        )

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def with_key(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "posthog_project_api_key", SecretStr("phc_test"))
    return settings


@pytest.fixture
def sent(monkeypatch):
    calls = []

    def fake_post(url, json=None, timeout=None, **kw):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return httpx.Response(200, request=httpx.Request("POST", url))

    monkeypatch.setattr(service.httpx, "post", fake_post)
    return calls


def _post(client):
    return client.post(
        "/api/orders/o-123?email=a@b.co&secret=q",
        json={"password": "hunter2", "name": "홍길동"},
        headers={"Authorization": "Bearer tok", "Cookie": "sid=abc"},
    )


def test_unhandled_error_sends_exception_event_with_scrubbed_message_and_route_template(
    app_client, with_key, sent
):
    r = _post(app_client)
    assert r.status_code == 500 and r.json() == BODY_500
    assert len(sent) == 1
    assert sent[0]["url"] == "https://us.i.posthog.com/i/v0/e/"
    assert sent[0]["timeout"] == 2.0
    ev = sent[0]["json"]
    assert ev["api_key"] == "phc_test" and ev["event"] == "$exception"
    assert ev["distinct_id"] == "server"
    p = ev["properties"]
    assert p["route"] == "/api/orders/{order_id}" and p["method"] == "POST"
    assert p["source"] == "server" and p["$exception_level"] == "error"
    exc = p["$exception_list"][0]
    assert exc["type"] == "RuntimeError"
    assert exc["value"] == "fail for [email] phone [number] https://x.io/a"
    frame = exc["stacktrace"]["frames"][-1]
    assert frame["function"] == "boom" and set(frame) >= {"filename", "function", "lineno"}
    assert not {"context_line", "vars"} & set(frame)


def test_event_payload_has_no_request_body_query_headers_or_cookies(app_client, with_key, sent):
    _post(app_client)
    dumped = json.dumps(sent[0]["json"], ensure_ascii=False)
    for secret in (
        "hunter2",
        "홍길동",
        "a@b.co",
        "secret=q",
        "o-123",
        "Bearer",
        "sid=abc",
        "SECRET",
    ):
        assert secret not in dumped


def test_no_event_is_sent_without_project_key(app_client, sent):
    assert get_settings().posthog_project_api_key.get_secret_value() == ""
    r = _post(app_client)
    assert r.status_code == 500 and r.json() == BODY_500
    assert sent == []


@pytest.mark.parametrize("failure", [httpx.ConnectTimeout("slow"), RuntimeError("boom"), "http500"])
def test_posthog_failure_or_timeout_still_returns_same_500_body(
    app_client, with_key, monkeypatch, caplog, failure
):
    def failing_post(url, **kw):
        if failure == "http500":
            return httpx.Response(500, request=httpx.Request("POST", url))
        raise failure

    monkeypatch.setattr(service.httpx, "post", failing_post)
    r = _post(app_client)
    assert r.status_code == 500 and r.json() == BODY_500
    assert "PostHog 서버 오류 보고 실패" in caplog.text


def test_unhandled_error_is_reraised_so_the_server_logs_the_traceback(app_client, with_key, sent):
    # Starlette는 500 처리기 뒤에 예외를 다시 던지고, uvicorn이 traceback을 남긴다(Railway)
    raising = TestClient(app_client.app, raise_server_exceptions=True)
    with pytest.raises(RuntimeError):
        _post(raising)
    assert len(sent) == 1  # 다시 던지기 전에 PostHog 보고는 이미 끝났다


def test_scrub_error_text_matches_app_rules():
    assert scrub_error_text("go https://a.b/c?x=1#h now") == "go https://a.b/c now"
    assert scrub_error_text("a.b+c@d-e.co.kr") == "[email]"
    assert scrub_error_text("card 1234 5678-9012") == "card [number]"
    assert scrub_error_text("id 123 and 12 3") == "id 123 and 12 3"
    assert len(scrub_error_text("x" * 500)) == 200


def test_database_error_message_drops_detail_sql_and_parameters():
    exc = RuntimeError(
        '(psycopg.errors.UniqueViolation) duplicate key value violates unique constraint "uq_name"'
        " [SQL: INSERT INTO users (name, address) VALUES (%(name)s, %(address)s)]"
        "\nDETAIL:  Key (name)=(홍길동) already exists."
        "\n[parameters: {'name': '홍길동', 'address': '제주시 애월읍'}]"
    )
    message = service.exception_message(exc)
    assert message == (
        '(psycopg.errors.UniqueViolation) duplicate key value violates unique constraint "uq_name"'
    )
    event = service.build_exception_event(exc, "/api/x", "POST", "phc_test")
    dumped = json.dumps(event, ensure_ascii=False)
    for leaked in ("홍길동", "제주시", "INSERT INTO", "DETAIL"):
        assert leaked not in dumped
