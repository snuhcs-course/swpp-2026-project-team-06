"""farms 모듈 Pydantic 입출력 스키마 (screens.md 7.2 farms)."""

from typing import Annotated, Literal

from pydantic import Field

from app.catalog.schemas import ProductCard
from app.core.schemas import CamelModel
from app.messaging.schemas import NewsItem


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
    is_following: bool
    products: list[ProductCard]
    latest_news: NewsItem | None
    share_url: str


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
