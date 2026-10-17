import pytest
from fastapi.testclient import TestClient

from app.core.config import LOCAL_JWT_SECRET, Settings
from app.main import app

client = TestClient(app)


def test_jwt_secret_required_outside_local():
    with pytest.raises(ValueError):
        Settings(app_env="production", jwt_secret="")


def test_local_uses_dev_secret_when_empty():
    assert Settings(app_env="local", jwt_secret="").jwt_secret == LOCAL_JWT_SECRET


@pytest.mark.parametrize(
    "given",
    [
        "postgresql://u:p@db.railway.internal:5432/railway",
        "postgres://u:p@db.railway.internal:5432/railway",
        "postgresql+psycopg://u:p@db.railway.internal:5432/railway",
    ],
)
def test_database_url_uses_psycopg_driver(given):
    settings = Settings(database_url=given)

    assert settings.database_url == "postgresql+psycopg://u:p@db.railway.internal:5432/railway"


def test_unknown_route_uses_error_format():
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"code": "NOT_FOUND", "message": "Not Found", "details": {}}
