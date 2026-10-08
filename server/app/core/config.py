"""환경 변수 설정. 이름은 server/.env.example이 원본이다."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# local에서만 쓰는 JWT 비밀값. local이 아니면 JWT_SECRET이 반드시 있어야 한다(이슈 #5).
LOCAL_JWT_SECRET = "local-dev-only-secret-do-not-use-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

    app_env: str = "local"

    # 로컬 기본값은 docker-compose.yml의 PostgreSQL과 같다.
    database_url: str = "postgresql+psycopg://farmclub:farmclub@localhost:5432/farmclub"

    # 인증 (ADR 0009 Mock 로그인, ADR 0003 카카오는 I2)
    jwt_secret: str = ""
    jwt_ttl_minutes: int = 60 * 24 * 7
    # 운영 기본값은 꺼짐. 켜려면 환경 변수로 명시한다(ADR 0009).
    mock_login_enabled: bool = False
    kakao_rest_api_key: str = ""
    kakao_client_secret: str = ""

    # 앱 주소: CORS, 공유 링크 이동(ADR 0006)
    consumer_app_url: str = "http://localhost:8081"
    producer_app_url: str = "http://localhost:8082"

    # AI (ADR 0004). 키가 없으면 AI 초안은 실패로 처리한다(AC-03-3).
    anthropic_api_key: str = ""
    ai_model: str = "claude-haiku-4-5"
    ai_draft_timeout_seconds: float = 20.0

    # 홈 (FEAT-06). 시즌 히어로는 설정 값, 운영자 관리는 I2.
    home_recommend_limit: int = 6
    home_hero_product_id: str = "p-house"

    # 데모·테스트용 고정 시각(ISO 8601). 비면 실제 시각을 쓴다.
    fixed_now: str = ""

    @model_validator(mode="after")
    def _require_jwt_secret(self) -> "Settings":
        if not self.jwt_secret:
            if self.app_env != "local":
                raise ValueError("JWT_SECRET이 비어 있어요. local이 아니면 꼭 설정해야 해요.")
            self.jwt_secret = LOCAL_JWT_SECRET
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
