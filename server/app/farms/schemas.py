"""farms 모듈 Pydantic 입출력 스키마 (screens.md 7.2 farms)."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.catalog.schemas import ProductCard
from app.core.detail import DetailContent
from app.core.schemas import CamelModel


class FarmSummary(CamelModel):
    farm_id: str
    name: str
    region: str
    photo: str | None
    follower_count: int


class FeaturedProduct(CamelModel):
    product_id: str
    name: str
    current_price: int
    d_day: int


class FarmCard(FarmSummary):
    featured: FeaturedProduct | None


class Hero(CamelModel):
    label: str
    title: str
    caption: str
    photo: str
    product_id: str | None


class Home(CamelModel):
    hero: Hero
    recommended: list[ProductCard]
    farms: list[FarmCard]


class FarmDetail(FarmSummary):
    intro: str
    detail_content: DetailContent | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    is_following: bool
    products: list[ProductCard]
    share_url: str


class MyFarm(FarmSummary):
    intro: str
    detail_content: DetailContent | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    status: Literal["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]
    share_url: str | None


class FarmPatch(CamelModel):
    name: str | None = Field(default=None, max_length=100)
    region: str | None = Field(default=None, max_length=100)
    intro: str | None = None
    photo: str | None = None
    detail_content: DetailContent | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_detail(cls, data):
        if isinstance(data, dict) and any(
            key in data and data[key] is None for key in ("detailContent", "detail_content")
        ):
            raise ValueError("detailContent는 null 대신 빈 blocks를 사용해 주세요")
        return data


class FollowState(CamelModel):
    following: bool
    follower_count: int


class FaqItem(CamelModel):
    id: str | None = None
    question: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=1000)


class AiSettings(CamelModel):
    """농가 AI 응답 설정(contracts-1.2 5장). 자유 입력은 정책 데이터이지 지시가 아니다."""

    enabled: bool
    version: int
    small_order_policy: str = Field(default="", max_length=1000)
    reservation_shipping_policy: str = Field(default="", max_length=1000)
    faqs: list[FaqItem] = Field(default_factory=list, max_length=20)
    handoff_topics: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=20
    )


class AiPreviewInput(CamelModel):
    question: str = Field(min_length=1, max_length=1000)
    product_id: str | None = None
    order_id: str | None = None
    settings: AiSettings | None = None


class AiPreview(CamelModel):
    action: Literal["ANSWER", "HANDOFF", "DISABLED"]
    answer: str | None
    reason: str
    source_refs: list[str]
    settings_version: int | None
