"""farms 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.config import get_settings
from app.core.detail import DetailDraft, DetailDraftInput, detail_content
from app.core.errors import conflict, forbidden, invalid, not_found
from app.core.ids import new_id
from app.farms.models import Farm, FarmAiSettings, FarmAiSettingsHistory, Follow
from app.farms.schemas import (
    AiPreview,
    AiPreviewInput,
    AiSettings,
    FaqItem,
    FarmCard,
    FarmDetail,
    FarmPatch,
    FarmSummary,
    FeaturedProduct,
    FollowState,
    Hero,
    Home,
    MyFarm,
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


def submit_application(
    db: Session,
    producer_id: str,
    name: str,
    region: str,
    main_items: str,
    contact_phone: str,
) -> Farm:
    farm = db.scalar(
        select(Farm).where(Farm.producer_id == producer_id).with_for_update()
    )
    if farm is None:
        farm = Farm(
            id=new_id("f"),
            producer_id=producer_id,
            name=name,
            region=region,
            intro="",
            detail_content=None,
            photo=None,
            main_items=main_items,
            contact_phone=contact_phone,
            approval_status="PENDING",
            reject_reason=None,
            suspend_reason=None,
            follower_count=0,
            applied_at=now(),
            decided_at=None,
        )
        db.add(farm)
    elif farm.approval_status == "REJECTED":
        farm.name = name
        farm.region = region
        farm.main_items = main_items
        farm.contact_phone = contact_phone
        farm.approval_status = "PENDING"
        farm.reject_reason = None
        farm.suspend_reason = None
        farm.applied_at = now()
        farm.decided_at = None
    else:
        raise conflict("INVALID_TRANSITION", "이미 신청했어요.")
    db.flush()
    return farm


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

    farm = get_approved_farm(db, farm_id)
    if farm is None:
        raise not_found("찾을 수 없는 농가예요.")
    following = bool(user and user.role == "CONSUMER" and is_following(db, user.id, farm.id))
    return FarmDetail(
        **_summary(farm),
        intro=farm.intro,
        detail_content=detail_content(farm.detail_content),
        is_following=following,
        products=catalog.by_deadline(catalog.published_cards(db, [farm.id])),
        share_url=share_url(farm),
    )


def _my_farm_view(farm: Farm) -> MyFarm:
    return MyFarm(
        **_summary(farm),
        intro=farm.intro,
        detail_content=detail_content(farm.detail_content),
        status=farm.approval_status,
        share_url=share_url(farm) if farm.approval_status == "APPROVED" else None,
    )


def my_farm(db: Session, producer_id: str) -> MyFarm:
    farm = get_farm_of_producer(db, producer_id)
    if farm is None:
        raise forbidden("생산자만 볼 수 있어요.")
    return _my_farm_view(farm)


def patch_my_farm(db: Session, producer_id: str, body: FarmPatch) -> MyFarm:
    farm = get_farm_of_producer(db, producer_id)
    if farm is None:
        raise forbidden("생산자만 수정할 수 있어요.")
    data = body.model_dump(exclude_unset=True)
    fields = {}
    if "name" in data and not (body.name or "").strip():
        fields["name"] = "농가 이름을 적어 주세요"
    if "region" in data and not (body.region or "").strip():
        fields["region"] = "지역을 적어 주세요"
    if fields:
        raise invalid(fields)
    for key in ("name", "region", "intro", "photo"):
        if key in data:
            setattr(farm, key, data[key])
    if "detail_content" in data:
        farm.detail_content = body.detail_content.model_dump(by_alias=True)
    db.flush()
    return _my_farm_view(farm)


def create_detail_draft(farm: Farm, body: DetailDraftInput) -> DetailDraft:
    from app.ai import service as ai

    return ai.detail_draft(
        body,
        name=farm.name,
        description=farm.intro,
        registered_photos=[farm.photo] if farm.photo else [],
        facts=[farm.region],
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


# ---------------- 농가 AI 응답 설정 (FEAT-32, contracts-1.2 5장) ----------------


def ai_settings_view(row: FarmAiSettings) -> AiSettings:
    return AiSettings(
        enabled=row.enabled,
        version=row.version,
        small_order_policy=row.small_order_policy,
        reservation_shipping_policy=row.reservation_shipping_policy,
        faqs=[FaqItem(**f) for f in row.faqs],
        handoff_topics=list(row.handoff_topics),
    )


def save_ai_settings(db: Session, farm, user_id: str, body: AiSettings) -> AiSettings:
    """버전이 다르면 409 STALE_VERSION(AC-32-4). 저장하면 version+1, 이력을 남기고 바로 쓴다."""
    row = db.scalar(
        select(FarmAiSettings).where(FarmAiSettings.farm_id == farm.id).with_for_update()
    )
    current = row.version if row else 1
    if body.version != current:
        raise conflict("STALE_VERSION", "최신 AI 설정을 다시 불러와 주세요.", version=current)
    faqs = [
        {"id": f.id or new_id("faq"), "question": f.question.strip(), "answer": f.answer.strip()}
        for f in body.faqs
    ]
    if row is None:
        row = FarmAiSettings(farm_id=farm.id)
        db.add(row)
    row.enabled = body.enabled
    row.version = current + 1
    row.small_order_policy = body.small_order_policy.strip()
    row.reservation_shipping_policy = body.reservation_shipping_policy.strip()
    row.faqs = faqs
    row.handoff_topics = [t.strip() for t in body.handoff_topics]
    row.updated_at = now()
    db.flush()
    view = ai_settings_view(row)
    db.add(
        FarmAiSettingsHistory(
            farm_id=farm.id,
            version=row.version,
            settings=view.model_dump(by_alias=True),
            saved_by=user_id,
            created_at=row.updated_at,
        )
    )
    db.flush()
    return view


def preview_ai(db: Session, farm, body: AiPreviewInput) -> AiPreview:
    """저장·메시지·전달 질문·AI 모드를 바꾸지 않는 미리보기(AC-32-3)."""
    from app.ai import service as ai
    from app.catalog import service as catalog
    from app.messaging import service as messaging
    from app.orders import service as orders

    if body.product_id:
        item = catalog.load_product(db, body.product_id)
        if item is None or item.product.farm_id != farm.id:
            raise not_found("찾을 수 없는 상품이에요.")
    if body.order_id:
        order = orders.get_any_order(db, body.order_id)
        if (
            order is None
            or order.paid_at is None
            or not orders.order_belongs_to_farm(db, order, farm.id)
        ):
            raise not_found("찾을 수 없는 주문이에요.")
    temporary = body.settings is not None
    settings = body.settings or ai_settings_view(ai_settings(db, farm.id))
    evidence = messaging.build_evidence(
        db,
        farm.id,
        body.order_id,
        settings.small_order_policy,
        settings.reservation_shipping_policy,
        [f.model_dump() for f in settings.faqs],
        settings.handoff_topics,
        product_id=body.product_id,
    )
    answer = ai.answer_question(body.question.strip(), evidence, enabled=settings.enabled)
    return AiPreview(
        action=answer.action,
        answer=answer.answer if answer.action == "ANSWER" else None,
        reason=answer.reason,
        source_refs=answer.source_refs,
        settings_version=None if temporary else settings.version,
    )
