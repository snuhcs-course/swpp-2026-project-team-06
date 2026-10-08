"""ai 모듈 입출력 형식. 모델 출력은 이 형식으로만 받는다(ADR 0004)."""

from pydantic import BaseModel, Field


class DraftExtraction(BaseModel):
    """AI 초안 추출 결과. 가격 필드는 두지 않는다(M-12)."""

    name: str | None = Field(default=None, max_length=200)
    variety: str | None = Field(default=None, max_length=100)
    options: list[str] | None = None
    expected_brix: float | None = Field(default=None, ge=0, le=30)
    grade: str | None = Field(default=None, max_length=20)
    delivery_window: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
