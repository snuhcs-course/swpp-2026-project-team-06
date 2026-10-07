"""환경 변수 설정. 이름은 server/.env.example이 원본이다."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

    app_env: str = "local"

    # 로컬 기본값은 docker-compose.yml의 PostgreSQL과 같다.
    database_url: str = "postgresql+psycopg://farmclub:farmclub@localhost:5432/farmclub"

    # 인증 (DEV-4, ADR 0003)
    jwt_secret: str = ""
    kakao_rest_api_key: str = ""
    kakao_client_secret: str = ""

    # 앱 주소: CORS, 공유 링크 이동(ADR 0006)
    consumer_app_url: str = "http://localhost:8081"
    producer_app_url: str = "http://localhost:8082"


@lru_cache
def get_settings() -> Settings:
    return Settings()
