"""spec-check AI 비용 보고·조회(DEV-144)."""

from datetime import timedelta

import pytest

from app.admin.models import SpecCheckRun
from app.core.clock import now
from app.core.config import get_settings
from app.core.db import get_sessionmaker

TOKEN = "test-spec-check-usage-token"
SHA = "a" * 40


@pytest.fixture
def usage_token(monkeypatch):
    monkeypatch.setattr(get_settings(), "spec_check_usage_token", TOKEN)


def run(key="100-1-pr", **extra):
    body = {
        "runKey": key,
        "prNumber": 170,
        "prTitle": "[DEV-83] 관리자 페이지",
        "headSha": SHA,
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


def test_DEV_144_report_requires_server_token(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "spec_check_usage_token", "")
    off = report(client, run())
    assert off.status_code == 503
    assert off.json()["code"] == "NOT_CONFIGURED"

    monkeypatch.setattr(get_settings(), "spec_check_usage_token", TOKEN)
    assert report(client, run(), token=None).status_code == 401
    assert report(client, run(), token="wrong").status_code == 401


def test_DEV_144_report_prices_run_and_is_idempotent(client, usage_token):
    first = report(client, run())
    assert first.status_code == 200, first.text
    # 50,000 × $2/M + 4,000 × $10/M = $0.10 + $0.04
    assert first.json()["costUsd"] == pytest.approx(0.14)

    again = report(client, run(inputTokens=999_999))
    assert again.status_code == 200
    assert again.json()["inputTokens"] == 50_000  # 처음 기록 그대로

    unknown = report(client, run("101-1-pr", model="claude-unknown-9"))
    assert unknown.json()["costUsd"] is None

    # backfill은 artifact가 만들어진 시각을 그대로 쓴다
    earlier = (now() - timedelta(days=3)).isoformat()
    backfilled = report(client, run("102-1-pr", ranAt=earlier))
    assert backfilled.json()["createdAt"][:16] == earlier[:16]


def test_DEV_144_report_rejects_bad_fields(client, usage_token):
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


def test_DEV_144_admin_lists_runs_with_totals(client, usage_token, admin_headers, login):
    report(client, run("200-1-pr"))
    report(client, run("201-1-pr", status="MISMATCH", inputTokens=100_000, outputTokens=0))
    report(client, run("202-1-demo-matched", mode="demo-matched", model="claude-unknown-9"))
    with get_sessionmaker()() as session:  # 지난달 실행: 전체에만 들어간다
        old = session.get(SpecCheckRun, "200-1-pr")
        old.created_at = now() - timedelta(days=40)
        session.commit()

    page = client.get("/admin/spec-check-runs", headers=admin_headers)
    assert page.status_code == 200, page.text
    data = page.json()
    assert [r["runKey"] for r in data["items"]] == ["202-1-demo-matched", "201-1-pr", "200-1-pr"]
    assert data["total"] == {
        "runs": 3,
        "inputTokens": 200_000,
        "outputTokens": 8_000,
        "costUsd": pytest.approx(0.34),  # 0.14 + 0.20, 단가 없는 모델은 빠짐
        "unpricedRuns": 1,
    }
    assert data["last7Days"]["runs"] == 2
    assert data["last7Days"]["costUsd"] == pytest.approx(0.20)
    assert data["thisMonth"]["runs"] == 2  # 40일 전 실행은 이번 달이 아니다

    paged = client.get("/admin/spec-check-runs?limit=2", headers=admin_headers).json()
    assert len(paged["items"]) == 2 and paged["nextCursor"]
    rest = client.get(
        f"/admin/spec-check-runs?limit=2&cursor={paged['nextCursor']}", headers=admin_headers
    ).json()
    assert [r["runKey"] for r in rest["items"]] == ["200-1-pr"] and rest["nextCursor"] is None

    assert client.get("/admin/spec-check-runs").status_code == 401
    assert client.get("/admin/spec-check-runs", headers=login("u-kang")).status_code == 403
