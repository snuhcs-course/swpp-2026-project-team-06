"""앱 보조 주소(DEV-236): Vercel 기본 주소처럼 같은 앱을 여는 다른 주소를 CORS가 받는다.

보조 주소가 비면 예전처럼 대표 주소 두 개만 받는다. 공유 링크 등 대표 주소는 바뀌지 않는다.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import install_cors

CONSUMER = "https://farmclub.kr"
PRODUCER = "https://farm.farmclub.kr"
CONSUMER_ALT = "https://farmclub-consumer.vercel.app"
PRODUCER_ALT = "https://farmclub-producer.vercel.app"


def _settings(**env) -> Settings:
    return Settings(_env_file=None, consumer_app_url=CONSUMER, producer_app_url=PRODUCER, **env)


def _cors_client(settings: Settings) -> TestClient:
    app = FastAPI()
    install_cors(app, settings)

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"ok": "yes"}

    return TestClient(app)


def _preflight(client: TestClient, origin: str):
    return client.options(
        "/ping",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )


def test_alt_urls_empty_keeps_two_app_origins():
    settings = _settings()

    assert settings.app_urls("consumer") == [CONSUMER]
    assert settings.app_urls("producer") == [PRODUCER]
    assert settings.app_origins() == [CONSUMER, PRODUCER]
    client = _cors_client(settings)
    assert _preflight(client, CONSUMER).status_code == 200
    assert _preflight(client, CONSUMER_ALT).status_code == 400


def test_alt_urls_are_parsed_per_app_after_main_url():
    settings = _settings(
        consumer_app_alt_urls=f" {CONSUMER_ALT}/ , ,http://localhost:19006,{CONSUMER}",
        producer_app_alt_urls=PRODUCER_ALT,
    )

    # 대표 주소가 먼저, 끝의 /와 빈 칸·중복은 버린다
    assert settings.app_urls("consumer") == [CONSUMER, CONSUMER_ALT, "http://localhost:19006"]
    assert settings.app_urls("producer") == [PRODUCER, PRODUCER_ALT]
    with pytest.raises(ValueError):
        settings.app_urls("admin")


def test_cors_preflight_allows_alt_origins_and_rejects_others():
    client = _cors_client(
        _settings(consumer_app_alt_urls=CONSUMER_ALT, producer_app_alt_urls=PRODUCER_ALT)
    )

    for origin in (CONSUMER, PRODUCER, CONSUMER_ALT, PRODUCER_ALT):
        response = _preflight(client, origin)
        assert response.status_code == 200, origin
        assert response.headers["access-control-allow-origin"] == origin
        assert response.headers["access-control-allow-credentials"] == "true"
    for origin in (
        "https://evil.example",
        "https://farmclub-consumer-git-main-x.vercel.app",
        "https://farmclub-consumer.vercel.app.evil.example",
    ):
        response = _preflight(client, origin)
        assert response.status_code == 400, origin
        assert "access-control-allow-origin" not in response.headers
    simple = client.get("/ping", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in simple.headers


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "https://*.vercel.app",
        "farmclub-consumer.vercel.app",
        "ftp://farmclub-consumer.vercel.app",
        "https://farmclub-consumer.vercel.app/login",
        "https://farmclub-consumer.vercel.app?x=1",
        f"{CONSUMER_ALT},*",
    ],
)
def test_alt_urls_reject_non_origins(value):
    """`*`·경로가 들어가면 시작하지 않는다(모든 출처 허용·복귀 주소 오판 방지)."""
    with pytest.raises(ValidationError):
        _settings(consumer_app_alt_urls=value)
    with pytest.raises(ValidationError):
        _settings(producer_app_alt_urls=value)
