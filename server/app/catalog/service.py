"""catalog 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog.models import Product, ProductOption, Stage, StageAllocation, StagePrice
from app.catalog.schemas import (
    DateRange,
    ProductCard,
    ProductDetail,
    ProductInfo,
    ProductOptionView,
    StageOptionValue,
    StageView,
)
from app.core.clock import days_until, today


@dataclass
class Loaded:
    """상품 하나와 옵션·단계·가격·물량을 한 번에 읽은 묶음."""

    product: Product
    options: list[ProductOption] = field(default_factory=list)
    stages: list[Stage] = field(default_factory=list)
    prices: dict[tuple[str, str], int] = field(default_factory=dict)
    allocations: dict[tuple[str, str], StageAllocation] = field(default_factory=dict)

    def stage_values(self, stage: Stage) -> dict[str, StageOptionValue]:
        values = {}
        for o in self.options:
            alloc = self.allocations.get((stage.id, o.id))
            price = self.prices.get((stage.id, o.id))
            if alloc is None or price is None:
                continue
            values[o.id] = StageOptionValue(
                price=price, quantity=alloc.quantity, reserved_count=alloc.reserved_count
            )
        return values

    def remaining(self, stage: Stage, option_id: str) -> int:
        alloc = self.allocations.get((stage.id, option_id))
        return max(0, alloc.quantity - alloc.reserved_count) if alloc else 0


def load_products(db: Session, products: list[Product]) -> list[Loaded]:
    ids = [p.id for p in products]
    loaded = {p.id: Loaded(product=p) for p in products}
    if not ids:
        return []
    for o in db.scalars(
        select(ProductOption)
        .where(ProductOption.product_id.in_(ids))
        .order_by(ProductOption.sort_order)
    ):
        loaded[o.product_id].options.append(o)
    for s in db.scalars(select(Stage).where(Stage.product_id.in_(ids)).order_by(Stage.seq)):
        loaded[s.product_id].stages.append(s)
    for p in db.scalars(select(StagePrice).where(StagePrice.product_id.in_(ids))):
        loaded[p.product_id].prices[(p.stage_id, p.option_id)] = p.price
    for a in db.scalars(select(StageAllocation).where(StageAllocation.product_id.in_(ids))):
        loaded[a.product_id].allocations[(a.stage_id, a.option_id)] = a
    return [loaded[i] for i in ids]


def load_product(db: Session, product_id: str) -> Loaded | None:
    product = db.get(Product, product_id)
    return load_products(db, [product])[0] if product else None


def current_stage(item: Loaded, on: date | None = None) -> Stage | None:
    """현재 시각이 기간 안에 든 단계(시작·끝 날짜 포함)."""
    day = on or today()
    return next((s for s in item.stages if s.starts_at <= day <= s.ends_at), None)


def next_stage(item: Loaded) -> Stage | None:
    day = today()
    return next((s for s in item.stages if s.starts_at > day), None)


def _delivery_window(p: Product) -> DateRange | None:
    if p.delivery_start and p.delivery_end:
        return DateRange(start=p.delivery_start, end=p.delivery_end)
    return None


def card(item: Loaded, farm_name: str, reserved_people: int) -> ProductCard:
    p = item.product
    cur = current_stage(item)
    nxt = next_stage(item)
    first = item.options[0].id if item.options else None
    sold_out = cur is None or all(item.remaining(cur, o.id) == 0 for o in item.options)
    return ProductCard(
        product_id=p.id,
        name=p.name,
        farm_id=p.farm_id,
        farm_name=farm_name,
        photo=p.photos[0] if p.photos else None,
        current_price=item.prices.get((cur.id, first)) if cur and first else None,
        next_price=item.prices.get((nxt.id, first)) if nxt and first else None,
        stage_ends_at=cur.ends_at if cur else None,
        d_day=days_until(cur.ends_at) if cur else None,
        delivery_window=_delivery_window(p),
        sold_out=sold_out,
        next_stage_starts_at=nxt.starts_at if sold_out and nxt else None,
        reserved_count=reserved_people,
        expected_brix=p.expected_brix,
    )


def option_views(item: Loaded) -> list[ProductOptionView]:
    return [
        ProductOptionView(option_id=o.id, label=o.label, weight_kg=o.weight_kg, note=o.note)
        for o in item.options
    ]


def stage_views(item: Loaded) -> list[StageView]:
    return [
        StageView(
            stage_id=s.id,
            seq=s.seq,
            name=s.name,
            starts_at=s.starts_at,
            ends_at=s.ends_at,
            options=item.stage_values(s),
        )
        for s in item.stages
    ]


def _reserved_people(db: Session, product_ids: list[str]) -> dict[str, int]:
    from app.orders import service as orders

    return orders.reserved_people(db, product_ids)


def published_cards(db: Session, farm_ids: list[str] | None = None) -> list[ProductCard]:
    """판매 중 상품 카드(승인된 농가만). 농가를 주면 그 농가들만."""
    from app.farms import service as farms

    query = select(Product).where(Product.status == "PUBLISHED")
    if farm_ids is not None:
        query = query.where(Product.farm_id.in_(farm_ids))
    products = list(db.scalars(query.order_by(Product.id)))
    approved = farms.approved_farm_names(db, list({p.farm_id for p in products}))
    products = [p for p in products if p.farm_id in approved]
    people = _reserved_people(db, [p.id for p in products])
    return [
        card(item, approved[item.product.farm_id], people.get(item.product.id, 0))
        for item in load_products(db, products)
    ]


def by_deadline(cards: list[ProductCard]) -> list[ProductCard]:
    """FEAT-06 정렬: 지금 단계가 가장 일찍 끝나는 것이 위, 판매 중 단계가 없으면 아래."""
    return sorted(cards, key=lambda c: (c.sold_out, c.d_day if c.d_day is not None else 10**6))


def product_detail(db: Session, product_id: str) -> ProductDetail | None:
    """소비자 상품 상세(FEAT-07). 판매 중 상품만. 최신 소식 칸은 없다(screens.md 결정 26)."""
    from app.farms import service as farms

    item = load_product(db, product_id)
    if item is None or item.product.status != "PUBLISHED":
        return None
    p = item.product
    farm = farms.get_approved_farm(db, p.farm_id)
    if farm is None:
        return None
    base = card(item, farm.name, _reserved_people(db, [p.id]).get(p.id, 0))
    cur = current_stage(item)
    return ProductDetail(
        **base.model_dump(),
        variety=p.variety,
        description=p.description,
        grade=p.grade,
        measured_brix=p.measured_brix,
        measured_brix_at=p.measured_brix_at,
        brix_record_count=p.brix_record_count,
        farmer_note=p.farmer_note,
        farm_region=farm.region,
        farm_photo=farm.photo,
        options=option_views(item),
        stages=stage_views(item),
        current_stage_id=cur.id if cur else None,
        shipping_fee_type=p.shipping_fee_type,
        shipping_fee=p.shipping_fee,
        remote_area_fee=p.remote_area_fee,
        max_quantity_per_order=p.max_quantity_per_order,
        max_delay_until=p.max_delay_until,
        info=ProductInfo(**p.info),
        status=p.status,
    )


def products_by_status(db: Session, farm_id: str, statuses: list[str]) -> int:
    return len(
        db.scalars(
            select(Product.id).where(Product.farm_id == farm_id, Product.status.in_(statuses))
        ).all()
    )


def group_by_farm(cards: list[ProductCard]) -> dict[str, list[ProductCard]]:
    grouped: dict[str, list[ProductCard]] = defaultdict(list)
    for c in cards:
        grouped[c.farm_id].append(c)
    return grouped
