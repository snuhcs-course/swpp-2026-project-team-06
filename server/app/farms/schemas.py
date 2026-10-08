"""farms 모듈 Pydantic 입출력 스키마 (screens.md 7.2 farms)."""

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
