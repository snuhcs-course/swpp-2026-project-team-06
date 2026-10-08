"""farms 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.config import get_settings
from app.core.errors import not_found
from app.farms.models import Farm, FarmAiSettings, Follow
from app.farms.schemas import (
    FarmCard,
    FarmDetail,
    FarmSummary,
    FeaturedProduct,
    FollowState,
    Hero,
    Home,
)

# 시즌 히어로 문구는 서버 설정 값이다(screens.md 결정 19). 운영자 관리는 I2.
HERO = {
    "label": "10월 · 수확 전 예약",
    "title": "서귀포 하우스 귤이\n지금 익어가고 있어요",
    "caption": "강씨네 귤밭 · 하우스 감귤 5kg 보러 가기",
    "photo": "/photos/orchard-crate.jpg",
}


def get_farm_of_producer(db: Session, producer_id: str) -> Farm | None:
    return db.scalar(select(Farm).where(Farm.producer_id == producer_id))


def get_approved_farm(db: Session, farm_id: str) -> Farm | None:
    farm = db.get(Farm, farm_id)
    return farm if farm and farm.approval_status == "APPROVED" else None


def approved_farm_names(db: Session, farm_ids: list[str]) -> dict[str, str]:
    if not farm_ids:
        return {}
    rows = db.execute(
        select(Farm.id, Farm.name).where(Farm.id.in_(farm_ids), Farm.approval_status == "APPROVED")
    )
    return dict(rows.all())


def share_url(farm: Farm) -> str:
    """서버 공유 주소(ADR 0006). OG 페이지 /s/farms/<id>는 Should 범위."""
    return f"/s/farms/{farm.id}"


def _summary(f: Farm) -> dict:
    return dict(
        farm_id=f.id, name=f.name, region=f.region, photo=f.photo, follower_count=f.follower_count
    )


def farm_cards(db: Session) -> list[FarmCard]:
    """승인된 농가 카드. 지금 단계가 가장 일찍 끝나는 농가가 위(FEAT-06)."""
    from app.catalog import service as catalog

    farms = list(db.scalars(select(Farm).where(Farm.approval_status == "APPROVED")))
    grouped = catalog.group_by_farm(catalog.published_cards(db, [f.id for f in farms]))
    cards = []
    for f in farms:
        live = [c for c in catalog.by_deadline(grouped.get(f.id, [])) if not c.sold_out]
        top = live[0] if live else None
        featured = (
            FeaturedProduct(
                product_id=top.product_id,
                name=top.name,
                current_price=top.current_price or 0,
                d_day=top.d_day or 0,
            )
            if top
            else None
        )
        cards.append(FarmCard(**_summary(f), featured=featured))
    return sorted(cards, key=lambda c: (c.featured is None, c.featured.d_day if c.featured else 0))


def home(db: Session) -> Home:
    """홈·발견(SCR-01): 시즌 히어로, 추천 상품(마감 임박순 상위 N), 농가 둘러보기."""
    from app.catalog import service as catalog

    settings = get_settings()
    limit = settings.home_recommend_limit
    cards = [c for c in catalog.by_deadline(catalog.published_cards(db)) if not c.sold_out]
    hero_id = settings.home_hero_product_id
    hero_product = hero_id if any(c.product_id == hero_id for c in cards) else None
    return Home(
        hero=Hero(**HERO, product_id=hero_product),
        recommended=cards[:limit],
        farms=farm_cards(db)[:limit],
    )


def is_following(db: Session, consumer_id: str, farm_id: str) -> bool:
    return db.get(Follow, (consumer_id, farm_id)) is not None


def farm_detail(db: Session, farm_id: str, user) -> FarmDetail:
    from app.catalog import service as catalog
    from app.messaging import service as messaging

    farm = get_approved_farm(db, farm_id)
    if farm is None:
        raise not_found("찾을 수 없는 농가예요.")
    user_id = user.id if user else None
    following = bool(user and user.role == "CONSUMER" and is_following(db, user.id, farm.id))
    return FarmDetail(
        **_summary(farm),
        intro=farm.intro,
        is_following=following,
        products=catalog.by_deadline(catalog.published_cards(db, [farm.id])),
        latest_news=messaging.latest_public_news(db, farm, user_id),
        share_url=share_url(farm),
    )


def set_follow(db: Session, consumer_id: str, farm_id: str, on: bool) -> FollowState:
    """팔로우·해제(FEAT-06). 팔로워 수는 같은 트랜잭션에서 바꾼다."""
    farm = db.scalar(select(Farm).where(Farm.id == farm_id).with_for_update())
    if farm is None or farm.approval_status != "APPROVED":
        raise not_found("찾을 수 없는 농가예요.")
    existing = db.get(Follow, (consumer_id, farm_id))
    if on and existing is None:
        db.add(Follow(consumer_id=consumer_id, farm_id=farm_id, created_at=now()))
        farm.follower_count += 1
    elif not on and existing is not None:
        db.delete(existing)
        farm.follower_count = max(0, farm.follower_count - 1)
    db.flush()
    return FollowState(following=on, follower_count=farm.follower_count)


def summary(farm: Farm) -> FarmSummary:
    return FarmSummary(**_summary(farm))


def get_farm(db: Session, farm_id: str) -> Farm | None:
    return db.get(Farm, farm_id)


def followed_farm_ids(db: Session, consumer_id: str) -> list[str]:
    return list(db.scalars(select(Follow.farm_id).where(Follow.consumer_id == consumer_id)))


def follower_ids(db: Session, farm_id: str) -> set[str]:
    return set(db.scalars(select(Follow.consumer_id).where(Follow.farm_id == farm_id)))


def get_farms(db: Session, farm_ids: list[str]) -> dict[str, Farm]:
    if not farm_ids:
        return {}
    return {f.id: f for f in db.scalars(select(Farm).where(Farm.id.in_(farm_ids)))}


def ai_settings(db: Session, farm_id: str, fresh: bool = False) -> FarmAiSettings:
    """농가 AI 응답 설정. 행이 없으면 저장하지 않은 기본값(켜짐, version 1).

    fresh=True면 세션 캐시를 건너뛰고 DB의 최신 값을 읽는다(AI 답 저장 직전 재확인).
    """
    row = db.get(FarmAiSettings, farm_id, populate_existing=fresh)
    if row is None:
        row = FarmAiSettings(
            farm_id=farm_id,
            enabled=True,
            version=1,
            small_order_policy="",
            reservation_shipping_policy="",
            faqs=[],
            handoff_topics=[],
        )
    return row
