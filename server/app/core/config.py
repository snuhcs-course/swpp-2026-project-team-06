"""환경 변수 설정. 이름은 server/.env.example이 원본이다."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# local에서만 쓰는 JWT 비밀값. local이 아니면 JWT_SECRET이 반드시 있어야 한다(이슈 #5).
LOCAL_JWT_SECRET = "local-dev-only-secret-do-not-use-in-production"

# USD per million tokens; shared by provider caps and pre-request reservations.
SOURCE_OPENROUTER_PRICES = {
    "google/gemini-3.1-flash-lite": (0.25, 1.5),
    "google/gemini-3-flash-preview": (0.5, 3.0),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore", hide_input_in_errors=True
    )

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
    ai_answer_timeout_seconds: float = 8.0

    source_analysis_enabled: bool = False
    source_analysis_provider: str = "mock"
    source_analysis_model: str = "google/gemini-3-flash-preview"
    openrouter_api_key: str = ""
    source_visual_model: str = ""
    source_openai_fallback_model: str = ""
    source_budget_usd: float = 5.0
    source_evaluation_budget_usd: float = 1.0
    source_evaluation: bool = False
    source_max_output_tokens: int = 4096
    openai_api_key: str = ""
    source_storage: str = "local"
    source_storage_dir: str = ".artifacts/private-sources"
    source_r2_endpoint: str = ""
    source_r2_bucket: str = ""
    source_r2_access_key: str = ""
    source_r2_secret_key: str = ""
    source_ocr_model_dir: str = ""
    source_ocr_model_sha256: str = ""
    source_parser_timeout: int = 120
    source_parser_memory_mb: int = 1024

    @model_validator(mode="after")
    def _source_settings(self) -> "Settings":
        if self.source_analysis_enabled:
            if self.source_analysis_provider not in ("mock", "openai", "openrouter"):
                raise ValueError("Invalid source analysis provider")
            if not (
                0 < self.source_budget_usd <= 100
                and 0 < self.source_evaluation_budget_usd <= self.source_budget_usd
            ):
                raise ValueError("Invalid source budget limits")
            if not 256 <= self.source_max_output_tokens <= 8000:
                raise ValueError("Invalid source output token limit")
            if self.source_analysis_provider == "openrouter" and (
                not self.openrouter_api_key
                or self.source_analysis_model not in SOURCE_OPENROUTER_PRICES
            ):
                raise ValueError("OpenRouter key and budget-qualified Gemini model are required")
            if self.source_analysis_provider == "openai" and not self.openai_api_key:
                raise ValueError("OPENAI_API_KEY is required for source analysis")
            if self.app_env != "local" and self.source_analysis_provider == "mock":
                raise ValueError("Mock source analysis is local-only")
            if self.source_storage not in ("local", "r2"):
                raise ValueError("Invalid source storage")
            if self.app_env != "local" and self.source_storage != "r2":
                raise ValueError("Private R2 storage is required outside local")
            if self.source_storage == "r2" and not all(
                (
                    self.source_r2_endpoint,
                    self.source_r2_bucket,
                    self.source_r2_access_key,
                    self.source_r2_secret_key,
                )
            ):
                raise ValueError("Private R2 source storage is not configured")
        return self

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
