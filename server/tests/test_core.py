import pytest
from fastapi.testclient import TestClient

from app.core.config import LOCAL_JWT_SECRET, Settings
from app.main import app

client = TestClient(app)
R2 = {
    "source_r2_endpoint": "https://r2.example",
    "source_r2_bucket": "b",
    "source_r2_access_key": "k",
    "source_r2_secret_key": "s",
}


def test_jwt_secret_required_outside_local():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(app_env="production", jwt_secret="", source_storage="r2", **R2)


def test_r2_storage_required_outside_local_even_without_source_analysis():
    # 공개 미디어(DEV-102)가 같은 저장소를 쓰므로 자료 분석을 꺼도 검사한다
    with pytest.raises(ValueError, match="R2 storage is required"):
        Settings(app_env="production", jwt_secret="x", source_analysis_enabled=False)
    with pytest.raises(ValueError, match="not configured"):
        Settings(app_env="production", jwt_secret="x", source_storage="r2")
    assert Settings(app_env="production", jwt_secret="x", source_storage="r2", **R2)


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
