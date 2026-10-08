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


class Evidence(BaseModel):
    """AI 응답 근거. 개인정보(연락처·주소·이름)는 넣지 않는다(M-18)."""

    product_id: str | None = None
    product_name: str | None = None
    shipping_fee_type: str | None = None
    shipping_fee: int | None = None
    remote_area_fee: int | None = None
    delivery_window: tuple[str, str] | None = None
    measured_brix: float | None = None
    expected_brix: float | None = None
    order_id: str | None = None
    order_status: str | None = None
    order_delivery_window: tuple[str, str] | None = None
    faqs: list[dict] = Field(default_factory=list)
    small_order_policy: str = ""
    reservation_shipping_policy: str = ""
    handoff_topics: list[str] = Field(default_factory=list)


class AiAnswer(BaseModel):
    """ANSWER면 answer가 문자열, HANDOFF·DISABLED면 None(contracts-1.2 5장)."""

    action: str
    answer: str | None
    reason: str
    source_refs: list[str] = Field(default_factory=list)
