"""AI 비용 기록·조회(DEV-144): spec-check 보고, 서버 안 호출 기록, 기능별·전체 합계."""

from datetime import timedelta
from types import SimpleNamespace

import pytest

from app.admin import ai_usage
from app.admin.models import AiUsage
from app.ai import service as ai
from app.core.clock import now
from app.core.config import get_settings
from app.core.db import get_sessionmaker

TOKEN = "test-spec-check-usage-token"


@pytest.fixture
def usage_token(monkeypatch):
    monkeypatch.setattr(get_settings(), "spec_check_usage_token", TOKEN)


def run(key="100-1-pr", **extra):
    body = {
        "runKey": key,
        "prNumber": 170,
        "prTitle": "[DEV-83] 관리자 페이지",
        "headSha": "a" * 40,
        "status": "PASS",
        "mode": "pr",
        "model": "claude-sonnet-5-5",
        "inputTokens": 50_000,
        "outputTokens": 4_000,
        "runUrl": "https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/100",
    }
    return body | extra


def report(client, body, token=TOKEN):
    headers = {"X-Spec-Check-Token": token} if token else {}
    return client.post("/internal/spec-check-runs", json=body, headers=headers)


def test_DEV_144_spec_check_report_requires_server_token(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "spec_check_usage_token", "")
    off = report(client, run())
    assert off.status_code == 503
    assert off.json()["code"] == "NOT_CONFIGURED"

    monkeypatch.setattr(get_settings(), "spec_check_usage_token", TOKEN)
    assert report(client, run(), token=None).status_code == 401
    assert report(client, run(), token="wrong").status_code == 401


def test_DEV_144_spec_check_report_prices_run_and_is_idempotent(client, usage_token):
    first = report(client, run())
    assert first.status_code == 200, first.text
    row = first.json()
    # 50,000 × $2/M + 4,000 × $10/M = $0.10 + $0.04
    assert row["costUsd"] == pytest.approx(0.14)
    assert (row["feature"], row["ref"], row["status"]) == ("spec_check", "#170", "PASS")

    again = report(client, run(inputTokens=999_999))
    assert again.json()["inputTokens"] == 50_000  # 처음 기록 그대로

    unknown = report(client, run("101-1-pr", model="claude-unknown-9"))
    assert unknown.json()["costUsd"] is None

    demo = report(client, run("102-1-demo-matched", mode="demo-matched"))
    assert demo.json()["title"].startswith("[데모] ")

    earlier = (now() - timedelta(days=3)).isoformat()  # backfill은 artifact 시각을 쓴다
    assert report(client, run("103-1-pr", ranAt=earlier)).json()["createdAt"][:16] == earlier[:16]


def test_DEV_144_spec_check_report_rejects_bad_fields(client, usage_token):
    for bad in (
        {"runKey": "../x"},
        {"headSha": "nothex"},
        {"status": "OK"},
        {"inputTokens": -1},
        {"runUrl": "https://evil.example/run"},
        {"ranAt": "2020-01-01T00:00:00+09:00"},
        {"ranAt": "2999-01-01T00:00:00+09:00"},
    ):
        assert report(client, run(**bad)).status_code == 400, bad


def _fake_claude(monkeypatch, text, usage):
    class Messages:
        def create(self, **_):
            return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], usage=usage)

    monkeypatch.setattr(ai, "_client", lambda timeout: SimpleNamespace(messages=Messages()))
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")
    monkeypatch.setattr(get_settings(), "ai_model", "claude-haiku-4-5")


def test_DEV_144_server_ai_calls_are_recorded_by_feature(monkeypatch):
    _fake_claude(monkeypatch, "{}", SimpleNamespace(input_tokens=1_000, output_tokens=200))
    ai._call_claude("감귤 5kg")
    ai._record(
        "ai_answer", SimpleNamespace(usage=SimpleNamespace(input_tokens=10, output_tokens=5))
    )
    ai._record("detail_draft", SimpleNamespace())  # usage가 없으면 남기지 않는다
    with get_sessionmaker()() as session:
        rows = {r.feature: r for r in session.query(AiUsage).all()}
    assert set(rows) == {"product_draft", "ai_answer"}
    # haiku-4-5: 1,000 × $1/M + 200 × $5/M = $0.002
    assert float(rows["product_draft"].cost_usd) == pytest.approx(0.002)


def test_DEV_144_ai_record_failure_does_not_break_feature(monkeypatch):
    def broken():
        raise RuntimeError("db down")

    monkeypatch.setattr(ai_usage, "get_sessionmaker", broken)
    _fake_claude(monkeypatch, "{}", SimpleNamespace(input_tokens=1, output_tokens=1))
    assert ai._call_claude("감귤") == "{}"


def test_DEV_144_source_analysis_spend_uses_provider_cost():
    with get_sessionmaker()() as session:
        usage = {"prompt_tokens": 3_000, "completion_tokens": 500, "cost": 0.0123}
        ai_usage.record_source_spend(session, "job-1:1", usage)
        ai_usage.record_source_spend(session, "job-1:1", usage)  # 같은 예약은 한 번
        ai_usage.record_source_spend(session, "job-2:1", {"prompt_tokens": 1})
        session.commit()
        rows = session.query(AiUsage).order_by(AiUsage.id).all()
    assert [(r.input_tokens, r.output_tokens) for r in rows] == [(3_000, 500), (1, 0)]
    assert float(rows[0].cost_usd) == pytest.approx(0.0123) and rows[1].cost_usd is None


def test_DEV_144_admin_sees_feature_and_overall_totals(client, usage_token, admin_headers, login):
    report(client, run("200-1-pr"))  # 0.14
    report(client, run("201-1-pr", inputTokens=100_000, outputTokens=0))  # 0.20
    with get_sessionmaker()() as session:
        ai_usage.record_source_spend(session, "job-9:1", {"prompt_tokens": 10, "cost": 0.5})
        session.get(AiUsage, "spec_check:200-1-pr").created_at = now() - timedelta(days=40)
        session.commit()
    ai_usage.record_call(
        "ai_answer", "claude-unknown-9", SimpleNamespace(input_tokens=7, output_tokens=3)
    )

    page = client.get("/admin/ai-usage", headers=admin_headers)
    assert page.status_code == 200, page.text
    data = page.json()
    by = {f["feature"]: f for f in data["features"]}
    assert list(by) == list(ai_usage.FEATURES)  # 기록 없는 기능도 0으로
    assert by["spec_check"]["total"]["calls"] == 2
    assert by["spec_check"]["total"]["costUsd"] == pytest.approx(0.34)
    assert by["spec_check"]["thisMonth"]["calls"] == 1  # 40일 전은 이번 달·최근 7일에서 빠진다
    assert by["spec_check"]["last7Days"]["costUsd"] == pytest.approx(0.20)
    assert by["product_draft"]["total"]["calls"] == 0
    assert by["ai_answer"]["total"]["unpricedCalls"] == 1
    assert data["overall"]["total"]["calls"] == 4
    assert data["overall"]["total"]["costUsd"] == pytest.approx(0.84)  # 0.34 + 0.5
    assert data["overall"]["last7Days"]["calls"] == 3

    only = client.get("/admin/ai-usage?feature=source_analysis", headers=admin_headers).json()
    assert [i["feature"] for i in only["items"]] == ["source_analysis"]
    paged = client.get("/admin/ai-usage?limit=2", headers=admin_headers).json()
    assert len(paged["items"]) == 2 and paged["nextCursor"]
    rest = client.get(
        f"/admin/ai-usage?limit=2&cursor={paged['nextCursor']}", headers=admin_headers
    ).json()
    assert len(rest["items"]) == 2 and rest["nextCursor"] is None

    assert client.get("/admin/ai-usage?feature=wrong", headers=admin_headers).status_code == 400
    assert client.get("/admin/ai-usage").status_code == 401
    assert client.get("/admin/ai-usage", headers=login("u-kang")).status_code == 403
