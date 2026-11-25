"""AC-ENG-2/3 · R-29: engagement endpoints honor the canonical farm visibility rule."""

import pytest
from sqlalchemy import func, select

from app.core import config
from app.core.db import get_sessionmaker
from app.engagement.models import FarmReport
from tests.test_test_farm_visibility import (
    HIDDEN_TO,
    SHOWN_TO,
    bearer,
    set_flags,
)
from tests.test_test_farm_visibility import (
    viewers as viewers,  # re-export the production-like authenticated viewer fixture
)


@pytest.fixture(params=["seed_owner", "ops_owner"])
def test_farm(request):
    if request.param == "ops_owner":
        set_flags("u-halla", ops_tester=True)
        return "f-halla"
    return "f-kang"


@pytest.mark.parametrize("name", HIDDEN_TO + SHOWN_TO)
def test_AC_ENG_2_temperature_uses_public_farm_visibility(client, viewers, test_farm, name):
    headers = viewers[name]
    response = client.get(f"/api/farms/{test_farm}/temperature", headers=headers)
    if name in HIDDEN_TO:
        missing = client.get("/api/farms/f-nope/temperature", headers=headers)
        assert response.status_code == missing.status_code == 404
        assert response.json() == missing.json()
    else:
        assert response.status_code == 200, response.text
        assert response.json()["policyVersion"] == 1
        assert set(response.json()["contributions"]) == set("FPLHRM")


@pytest.mark.parametrize("name", ("real",) + SHOWN_TO)
def test_AC_ENG_3_reports_require_visible_farm_and_do_not_persist_when_hidden(
    client, viewers, test_farm, name
):
    headers = viewers[name]
    response = client.post(
        f"/api/engagement/farms/{test_farm}/reports",
        headers=headers,
        json={"reason": "직접 경험한 문제를 운영팀에 신고합니다."},
    )
    with get_sessionmaker()() as db:
        count = db.scalar(select(func.count()).select_from(FarmReport))
    if name == "real":
        missing = client.post(
            "/api/engagement/farms/f-nope/reports",
            headers=headers,
            json={"reason": "직접 경험한 문제를 운영팀에 신고합니다."},
        )
        assert response.status_code == missing.status_code == 404
        assert response.json() == missing.json()
        assert count == 0
    else:
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "PENDING"
        assert count == 1


def test_AC_ENG_2_real_farm_temperature_remains_public(client, viewers):
    for headers in viewers.values():
        response = client.get("/api/farms/f-halla/temperature", headers=headers)
        assert response.status_code == 200, response.text


def test_AC_ENG_2_production_filters_test_temperature_even_with_test_login_enabled(
    client, monkeypatch
):
    settings = config.get_settings()
    assert settings.mock_login_enabled is True
    monkeypatch.setattr(settings, "app_env", "production")
    assert client.get("/api/farms/f-kang/temperature").status_code == 404
    assert (
        client.get(
            "/api/farms/f-kang/temperature", headers=bearer("u-minji", "CONSUMER")
        ).status_code
        == 200
    )


def test_AC_ENG_3_anonymous_report_still_requires_authentication(client, viewers):
    response = client.post(
        "/api/engagement/farms/f-kang/reports",
        json={"reason": "직접 경험한 문제를 운영팀에 신고합니다."},
    )
    assert response.status_code == 401
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(FarmReport)) == 0
