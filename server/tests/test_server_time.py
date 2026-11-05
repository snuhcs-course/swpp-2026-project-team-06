"""DEV-229: 응답의 X-Server-Time(서버 시각, FIXED_NOW 반영)과 CORS 노출."""

from datetime import datetime

from fastapi.testclient import TestClient

from app.core import clock
from app.core.config import get_settings
from app.main import app

client = TestClient(app)


def test_R_28_every_response_carries_server_time_from_fixed_clock():
    # conftest가 FIXED_NOW=2026-10-07T10:00:00+09:00로 고정한다.
    # 기기 시계와 달라도 앱은 이 값으로 기한을 판단한다
    response = client.get("/health")

    assert response.status_code == 200
    value = response.headers["x-server-time"]
    assert datetime.fromisoformat(value) == clock.now()
    assert datetime.fromisoformat(value) == datetime.fromisoformat("2026-10-07T10:00:00+09:00")


def test_R_28_error_responses_also_carry_server_time():
    response = client.get("/api/orders")

    assert response.status_code == 401
    assert "x-server-time" in response.headers


def test_R_28_web_apps_can_read_server_time_across_origins():
    origin = get_settings().consumer_app_url
    response = client.get("/health", headers={"Origin": origin})

    exposed = response.headers["access-control-expose-headers"].lower()
    assert "x-server-time" in exposed
