"""테스트 공통. DATABASE_URL의 DB 이름에 _test를 붙인 별도 DB를 쓴다(alembic 검사 DB와 분리).

매 테스트 전에 시드를 다시 넣고, 시계는 데모 기준일(2026-10-07)로 고정한다.
"""

import os

import psycopg
import pytest
from sqlalchemy.engine import make_url

_base_url = make_url(
    os.environ.get("DATABASE_URL", "postgresql+psycopg://farmclub:farmclub@localhost:5432/farmclub")
)
TEST_DB = f"{_base_url.database}_test"
os.environ["DATABASE_URL"] = _base_url.set(database=TEST_DB).render_as_string(hide_password=False)
os.environ["FIXED_NOW"] = "2026-10-07T10:00:00+09:00"
os.environ["MOCK_LOGIN_ENABLED"] = "true"
os.environ["APP_ENV"] = "local"
os.environ["ANTHROPIC_API_KEY"] = ""
# DEV-495: 알림은 테스트에서 절대 보내지 않는다(no-op). 솔라피 테스트는 MockTransport만 쓴다
os.environ["NOTIFY_PROVIDER"] = "none"

# DEV-355: an empty env value is ignored (env_ignore_empty), so a developer's server/.env
# could still supply live AI keys and providers. Tests read no .env file, same as CI.
from app.core import config as _config  # noqa: E402

_config.Settings.model_config["env_file"] = None


def _ensure_test_database() -> None:
    admin = _base_url.set(drivername="postgresql", database="postgres")
    conninfo = admin.render_as_string(hide_password=False)
    with psycopg.connect(conninfo, autocommit=True) as conn:
        exists = conn.execute("select 1 from pg_database where datname = %s", (TEST_DB,)).fetchone()
        if not exists:
            conn.execute(f'create database "{TEST_DB}"')


# 실제로 연결하면 안 되는 외부 발송 업체(DEV-495)
_BLOCKED_HOSTS = ("solapi.com",)


def _blocked(host) -> bool:
    name = (host.decode() if isinstance(host, bytes) else str(host or "")).lower().rstrip(".")
    return any(name == h or name.endswith("." + h) for h in _BLOCKED_HOSTS)


@pytest.fixture(autouse=True)
def _no_provider_network(monkeypatch):
    """솔라피로 실제 연결을 열면 테스트가 실패한다. MockTransport는 이 경로를 거치지 않는다."""
    import socket

    import httpx

    real_getaddrinfo = socket.getaddrinfo
    real_handle = httpx.HTTPTransport.handle_request

    def getaddrinfo(host, *args, **kwargs):
        if _blocked(host):
            raise AssertionError(f"test tried to resolve {host}")
        return real_getaddrinfo(host, *args, **kwargs)

    def handle_request(self, request):
        if _blocked(request.url.host):
            raise AssertionError(f"test tried to connect to {request.url.host}")
        return real_handle(self, request)

    monkeypatch.setattr(socket, "getaddrinfo", getaddrinfo)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", handle_request)
    yield


@pytest.fixture(scope="session", autouse=True)
def _schema():
    from app.core import config, db

    config.get_settings.cache_clear()
    db.get_engine.cache_clear()
    db.get_sessionmaker.cache_clear()
    _ensure_test_database()

    from tests import migrations_models  # noqa: F401  모든 모델을 Base.metadata에 올린다

    engine = db.get_engine()
    db.Base.metadata.drop_all(engine)
    db.Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def seeded(_schema):
    from app.core import seed
    from app.core.db import get_sessionmaker

    with get_sessionmaker()() as session, session.begin():
        seed.clear(session)
        seed.seed(session)
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def login(client):
    def _login(user_id: str, app: str | None = None) -> dict[str, str]:
        if app is None:
            app = "consumer" if user_id in ("u-minji", "u-seojun") else "producer"
        response = client.post("/api/auth/test-login", json={"userId": user_id, "app": app})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    return _login


@pytest.fixture
def admin_headers():
    from app.core.security import issue_token

    return {"Authorization": f"Bearer {issue_token('u-admin', 'ADMIN')}"}


@pytest.fixture
def other_farm_headers(client):
    """다른 승인 농가(u-halla, 시드의 실제 농가처럼 테스트 계정이 아님) 토큰.

    지금 버전 약관·개인정보에 동의해 둔다(DEV-113). 동의 관문이 아니라 농가 격리(404)를
    검사하기 위해서다.
    """
    from app.accounts.schemas import CONSENT_VERSION, REQUIRED_PRODUCER_CONSENTS
    from app.core.security import issue_token

    headers = {"Authorization": f"Bearer {issue_token('u-halla', 'PRODUCER')}"}
    consents = [{"kind": kind, "version": CONSENT_VERSION} for kind in REQUIRED_PRODUCER_CONSENTS]
    saved = client.post("/api/auth/me/consents", json={"consents": consents}, headers=headers)
    assert saved.status_code == 200, saved.text
    return headers
