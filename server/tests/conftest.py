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


def _ensure_test_database() -> None:
    admin = _base_url.set(drivername="postgresql", database="postgres")
    conninfo = admin.render_as_string(hide_password=False)
    with psycopg.connect(conninfo, autocommit=True) as conn:
        exists = conn.execute("select 1 from pg_database where datname = %s", (TEST_DB,)).fetchone()
        if not exists:
            conn.execute(f'create database "{TEST_DB}"')


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
