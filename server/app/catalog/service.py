"""catalog 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.catalog.models import (
    CapacityRequest,
    Product,
    ProductDraft,
    ProductOption,
    Stage,
    StageAllocation,
    StagePrice,
)
from app.catalog.schemas import (
    CapacityRequestView,
    DateRange,
    Draft,
    DraftFields,
    MyProduct,
    MyProductCard,
    ProductCard,
    ProductDetail,
    ProductInfo,
    ProductOptionInput,
    ProductOptionView,
    ProductPatch,
    SalesInput,
    SalesState,
    StageOptionValue,
    StagePreset,
    StagesInput,
    StagesResult,
    StageView,
)
from app.core.clock import days_until, now, today
from app.core.detail import DetailDraft, DetailDraftInput, detail_content
from app.core.errors import conflict, invalid, not_found
from app.core.ids import new_id


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


def weight_grams(weight_kg: float) -> int:
    try:
        grams = Decimal(str(weight_kg)) * 1000
    except InvalidOperation as exc:
        raise invalid({"weightKg": "중량을 확인해 주세요"}) from exc
    if grams != grams.to_integral_value() or grams <= 0:
        raise invalid({"weightKg": "중량은 소수 셋째 자리까지 입력해 주세요"})
    return int(grams)


def sales_state(db: Session, item: Loaded) -> SalesState:
    from app.orders import service as orders

    reserved_grams, shipped_grams, sold_quantity = orders.capacity_totals(
        db, item.product.id
    )
    p = item.product
    remaining = p.sales_limit_grams - reserved_grams - shipped_grams
    cur = current_stage(item)
    options = [o for o in item.options if cur and (cur.id, o.id) in item.allocations]
    if p.sales_paused:
        availability = "PAUSED"
    elif p.status == "CLOSED" or (item.stages and all(s.ends_at < today() for s in item.stages)):
        availability = "ENDED"
    elif cur is None:
        availability = "NOT_OPEN"
    elif not options or all(weight_grams(o.weight_kg) > remaining for o in options):
        availability = "TOTAL_SOLD_OUT"
    elif all(
        weight_grams(o.weight_kg) > remaining or item.remaining(cur, o.id) <= 0 for o in options
    ):
        availability = "PERIOD_SOLD_OUT"
    else:
        availability = "AVAILABLE"
    return SalesState(
        approved_supply_grams=p.approved_supply_grams,
        sales_limit_grams=p.sales_limit_grams,
        reserved_grams=reserved_grams,
        shipped_grams=shipped_grams,
        sold_quantity=sold_quantity,
        remaining_grams=remaining,
        sales_paused=p.sales_paused,
        availability=availability,
        version=p.version,
    )


def capacity_view(request: CapacityRequest) -> CapacityRequestView:
    return CapacityRequestView(
        request_id=request.id,
        product_id=request.product_id,
        kind=request.kind,
        requested_total_grams=request.requested_total_grams,
        status=request.status,
        reason=request.reason,
        created_at=request.created_at,
        decided_at=request.decided_at,
        version=request.version,
    )


def pending_capacity(db: Session, product_id: str) -> CapacityRequestView | None:
    request = db.scalar(
        select(CapacityRequest).where(
            CapacityRequest.product_id == product_id, CapacityRequest.status == "PENDING"
        )
    )
    return capacity_view(request) if request else None


def card(db: Session, item: Loaded, farm_name: str, reserved_people: int) -> ProductCard:
    p = item.product
    cur = current_stage(item)
    nxt = next_stage(item)
    first = item.options[0].id if item.options else None
    sold_out = cur is None or all(item.remaining(cur, o.id) == 0 for o in item.options)
    return ProductCard(
        **sales_state(db, item).model_dump(),
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
        card(db, item, approved[item.product.farm_id], people.get(item.product.id, 0))
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
    base = card(db, item, farm.name, _reserved_people(db, [p.id]).get(p.id, 0))
    cur = current_stage(item)
    return ProductDetail(
        **base.model_dump(),
        variety=p.variety,
        description=p.description,
        detail_content=detail_content(p.detail_content),
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


# ---------------- 생산자: 상품 편집·단계·게시 요청 (FEAT-03·04·05) ----------------

STAGE_PRESETS = [
    StagePreset(preset_id="three", label="3단계 기본", stage_count=3, step_price=4000),
    StagePreset(preset_id="two", label="2단계", stage_count=2, step_price=4000),
    StagePreset(preset_id="custom", label="직접", stage_count=1, step_price=0),
]
DRAFT_KEYS = {
    "name": "name",
    "variety": "variety",
    "options": "options",
    "expected_brix": "expectedBrix",
    "grade": "grade",
    "delivery_window": "deliveryWindow",
    "description": "description",
}
_WEIGHT = re.compile(r"(\d+(?:\.\d+)?)\s*kg", re.IGNORECASE)


def missing_fields(item: Loaded) -> list[str]:
    """게시 요청 전에 채워야 할 칸(AC-04-1, FEAT-04 입력·검증)."""
    p = item.product
    missing = []
    if not p.name.strip():
        missing.append("상품명")
    if not p.variety.strip():
        missing.append("품종")
    if not (p.info or {}).get("origin"):
        missing.append("원산지")
    if not (p.info or {}).get("storage"):
        missing.append("보관 방법")
    if not item.options:
        missing.append("중량 옵션")
    if not (p.delivery_start and p.delivery_end):
        missing.append("받는 시기")
    if not p.max_delay_until:
        missing.append("최대 지연 기한")
    if not item.stages or any(
        (s.id, o.id) not in item.prices for s in item.stages for o in item.options
    ):
        missing.append("단계 가격")
    return missing


def my_product(db: Session, item: Loaded) -> MyProduct:
    p = item.product
    return MyProduct(
        **sales_state(db, item).model_dump(),
        product_id=p.id,
        farm_id=p.farm_id,
        name=p.name,
        photo=p.photos[0] if p.photos else None,
        photos=p.photos,
        variety=p.variety,
        description=p.description,
        detail_content=detail_content(p.detail_content),
        grade=p.grade,
        expected_brix=p.expected_brix,
        measured_brix=p.measured_brix,
        measured_brix_at=p.measured_brix_at,
        options=option_views(item),
        stages=stage_views(item),
        shipping_fee_type=p.shipping_fee_type,
        shipping_fee=p.shipping_fee,
        remote_area_fee=p.remote_area_fee,
        max_quantity_per_order=p.max_quantity_per_order,
        delivery_window=_delivery_window(p),
        max_delay_until=p.max_delay_until,
        info=ProductInfo(**(p.info or {})),
        status=p.status,
        reject_reason=p.reject_reason,
        pending_capacity_request=pending_capacity(db, p.id),
        missing_fields=missing_fields(item),
        reserved_count=_reserved_people(db, [p.id]).get(p.id, 0),
    )


def my_product_card(db: Session, item: Loaded) -> MyProductCard:
    p = item.product
    cur = current_stage(item)
    return MyProductCard(
        **sales_state(db, item).model_dump(),
        product_id=p.id,
        name=p.name,
        photo=p.photos[0] if p.photos else None,
        status=p.status,
        reject_reason=p.reject_reason,
        pending_capacity_request=pending_capacity(db, p.id),
        reserved_count=_reserved_people(db, [p.id]).get(p.id, 0),
        current_stage_label=f"{cur.starts_at} ~ {cur.ends_at}" if cur else None,
        updated_at=p.updated_at,
    )


def my_product_cards(db: Session, farm_id: str, status: str | None = None) -> list[MyProductCard]:
    query = select(Product).where(Product.farm_id == farm_id)
    if status:
        query = query.where(Product.status == status)
    products = list(db.scalars(query))
    status_order = {
        "REJECTED": 0,
        "PENDING_APPROVAL": 1,
        "PUBLISHED": 2,
        "DRAFT": 3,
        "CLOSED": 4,
    }
    products.sort(
        key=lambda product: (
            status_order.get(product.status, 99),
            -product.updated_at.timestamp(),
            product.id,
        )
    )
    return [my_product_card(db, item) for item in load_products(db, products)]


def load_my_product(db: Session, farm_id: str, product_id: str, lock: bool = False) -> Loaded:
    """자기 농가 상품만. 다른 농가 상품은 404(N-06)."""
    query = select(Product).where(Product.id == product_id)
    if lock:
        query = query.with_for_update()
    product = db.scalar(query)
    if product is None or product.farm_id != farm_id:
        raise not_found("찾을 수 없는 상품이에요.")
    return load_products(db, [product])[0]


def create_draft(db: Session, farm_id: str, input_text: str) -> Draft:
    """AI 상품 초안(FEAT-03). 실패하면 failed=true와 빈 값(AC-03-3). 가격은 채우지 않는다."""
    from app.ai import service as ai

    if not input_text.strip():
        raise invalid({"inputText": "문구를 붙여넣어 주세요"})
    if len(input_text) > 3000:
        raise invalid({"inputText": "3,000자까지 넣을 수 있어요"})
    extracted = ai.draft_product(input_text)
    fields = DraftFields(**extracted.model_dump()) if extracted else DraftFields()
    missing = [DRAFT_KEYS[k] for k, v in fields.model_dump().items() if v in (None, [], "")]
    draft = ProductDraft(
        id=new_id("d"),
        farm_id=farm_id,
        input_text=input_text,
        output=fields.model_dump(by_alias=True),
        missing_fields=missing,
        failed=extracted is None,
        price_mentioned=ai.price_mentioned(input_text),
        created_at=now(),
    )
    db.add(draft)
    db.flush()
    return Draft(
        draft_id=draft.id,
        input_text=input_text,
        extracted=fields,
        missing_fields=missing,
        failed=draft.failed,
        price_mentioned=draft.price_mentioned,
    )


def _option_id(label: str, taken: set[str]) -> str:
    match = _WEIGHT.search(label)
    base = f"opt-{match.group(1).replace('.', '_')}" if match else "opt"
    oid, n = base, 2
    while oid in taken:
        oid, n = f"{base}-{n}", n + 1
    taken.add(oid)
    return oid


def create_product(db: Session, farm, draft_id: str | None) -> MyProduct:
    """초안 상품(DRAFT)을 만든다. 초안이 있으면 값을 채운다(가격·단계는 빼고, M-12)."""
    fields = DraftFields()
    if draft_id:
        draft = db.get(ProductDraft, draft_id)
        if draft is None or draft.farm_id != farm.id:
            raise not_found("초안을 찾을 수 없어요.")
        if not draft.failed:
            fields = DraftFields.model_validate(draft.output)
    product = Product(
        id=new_id("p"),
        farm_id=farm.id,
        name=fields.name or "",
        variety=fields.variety or "",
        description=fields.description or "",
        grade=fields.grade,
        expected_brix=fields.expected_brix,
        photos=[],
        info=ProductInfo(
            origin=farm.region,
            producer=farm.name,
            size=" / ".join(fields.options or []),
            packed_at="출하 당일",
            storage="서늘하고 통풍되는 곳",
            contact="farmclub 고객센터",
        ).model_dump(by_alias=True),
        status="DRAFT",
        updated_at=now(),
    )
    db.add(product)
    db.flush()
    taken: set[str] = set()
    for i, label in enumerate(fields.options or []):
        match = _WEIGHT.search(label)
        db.add(
            ProductOption(
                product_id=product.id,
                id=_option_id(label, taken),
                label=label,
                weight_kg=float(match.group(1)) if match else 1.0,
                sort_order=i,
            )
        )
    db.flush()
    return my_product(db, load_products(db, [product])[0])


def _has_orders(db: Session, product_id: str, option_id: str | None = None) -> bool:
    from app.orders import service as orders

    return orders.has_orders(db, product_id, option_id)


def patch_product(db: Session, farm_id: str, product_id: str, patch: ProductPatch) -> MyProduct:
    item = load_my_product(db, farm_id, product_id, lock=True)
    p = item.product
    if p.status in ("PENDING_APPROVAL", "CLOSED"):
        raise conflict("INVALID_TRANSITION", "승인 대기·판매 종료 상품은 고칠 수 없어요.")
    data = patch.model_dump(exclude_unset=True)
    if patch.version != p.version:
        raise conflict("STALE_VERSION", "최신 상품을 다시 불러와 주세요.")
    data.pop("version", None)
    fields: dict[str, str] = {}
    window = patch.delivery_window
    if window and window.start > window.end:
        fields["deliveryWindow"] = "받는 시기를 확인해 주세요"
    end = window.end if window else p.delivery_end
    delay = patch.max_delay_until if "max_delay_until" in data else p.max_delay_until
    if end and delay and delay < end:
        fields["maxDelayUntil"] = "최대 지연 기한은 받는 시기 끝날 이후여야 해요"
    if "name" in data and not (patch.name or "").strip():
        fields["name"] = "상품명을 적어 주세요"
    if fields:
        raise invalid(fields)

    simple = (
        "name",
        "variety",
        "description",
        "grade",
        "expected_brix",
        "max_quantity_per_order",
        "max_delay_until",
        "shipping_fee_type",
        "shipping_fee",
        "remote_area_fee",
        "photos",
    )
    for key in simple:
        if key in data:
            setattr(p, key, data[key])
    if "detail_content" in data:
        p.detail_content = patch.detail_content.model_dump(by_alias=True)
    if "measured_brix" in data and data["measured_brix"] != p.measured_brix:
        p.measured_brix = data["measured_brix"]
        if p.measured_brix is not None:
            p.measured_brix_at = now()
            p.brix_record_count += 1
    if "delivery_window" in data:
        changed = (p.delivery_start, p.delivery_end) != (
            window.start if window else None,
            window.end if window else None,
        )
        p.delivery_start = window.start if window else None
        p.delivery_end = window.end if window else None
        if changed and window:
            from app.orders import service as orders

            orders.propose_delivery_window(db, p.id, window.start, window.end)
    if patch.info is not None:
        p.info = {**(p.info or {}), **patch.info.model_dump(by_alias=True, exclude_unset=True)}
    if patch.options is not None:
        _replace_options(db, item, patch.options)

    if p.status == "REJECTED":
        p.status = "DRAFT"
    if p.status == "PUBLISHED":
        refreshed = load_products(db, [p])[0]
        missing = missing_fields(refreshed)
        if missing:
            raise invalid({name: "필수 항목이에요" for name in missing})
        if (
            refreshed.stages
            and p.delivery_start
            and refreshed.stages[-1].ends_at >= p.delivery_start
        ):
            raise invalid({"deliveryWindow": "받는 시기는 마지막 예약 단계 뒤여야 해요"})
    p.version += 1
    p.updated_at = now()
    db.flush()
    return my_product(db, load_products(db, [p])[0])


def create_detail_draft(
    db: Session, farm_id: str, product_id: str, body: DetailDraftInput
) -> DetailDraft:
    from app.ai import service as ai

    item = load_my_product(db, farm_id, product_id)
    product = item.product
    if product.status in ("PENDING_APPROVAL", "CLOSED"):
        raise conflict("INVALID_TRANSITION", "승인 대기·판매 종료 상품은 고칠 수 없어요.")
    info = product.info or {}
    return ai.detail_draft(
        body,
        name=product.name,
        description=product.description,
        registered_photos=list(product.photos),
        facts=[product.variety, info.get("origin", ""), info.get("storage", "")],
    )


def _replace_options(db: Session, item: Loaded, options: list[ProductOptionInput]) -> None:
    for option in options:
        weight_grams(option.weight_kg)
    keep = {o.option_id for o in options if o.option_id}
    current = {o.id: o for o in item.options}
    for oid in set(current) - keep:
        if _has_orders(db, item.product.id, oid):
            raise conflict("PERIOD_LOCKED", "주문이 있는 옵션은 지울 수 없어요.")
        db.execute(
            delete(StagePrice).where(
                StagePrice.product_id == item.product.id, StagePrice.option_id == oid
            )
        )
        db.execute(
            delete(StageAllocation).where(
                StageAllocation.product_id == item.product.id, StageAllocation.option_id == oid
            )
        )
        db.delete(current[oid])
    db.flush()
    taken = set(keep)
    for i, o in enumerate(options):
        if o.option_id and o.option_id in current:
            row = current[o.option_id]
            if weight_grams(row.weight_kg) != weight_grams(o.weight_kg) and _has_orders(
                db, item.product.id, o.option_id
            ):
                raise conflict("PERIOD_LOCKED", "주문이 있는 옵션의 중량은 바꿀 수 없어요.")
            row.label, row.weight_kg, row.note, row.sort_order = o.label, o.weight_kg, o.note, i
        else:
            oid = o.option_id if o.option_id and o.option_id not in current else None
            db.add(
                ProductOption(
                    product_id=item.product.id,
                    id=oid or _option_id(o.label, taken),
                    label=o.label,
                    weight_kg=o.weight_kg,
                    note=o.note,
                    sort_order=i,
                )
            )
    db.flush()


def put_stages(db: Session, farm_id: str, product_id: str, body: StagesInput) -> StagesResult:
    """단계·가격·물량(FEAT-05). 이른 단계가 더 싸고 기간은 겹치지 않는다(R-18)."""
    item = load_my_product(db, farm_id, product_id, lock=True)
    p = item.product
    if p.status in ("PENDING_APPROVAL", "CLOSED"):
        raise conflict("INVALID_TRANSITION", "승인 대기·판매 종료 상품은 고칠 수 없어요.")
    if body.version != p.version:
        raise conflict("STALE_VERSION", "최신 상품을 다시 불러와 주세요.")
    option_ids = {o.id for o in item.options}
    stages = body.stages
    fields: dict[str, str] = {}
    if not stages:
        fields["stages"] = "단계를 하나 이상 정해 주세요"
    for i, s in enumerate(stages):
        if s.starts_at > s.ends_at:
            fields[f"stages.{i}.period"] = "기간을 확인해 주세요"
        if i > 0 and stages[i - 1].ends_at >= s.starts_at:
            fields[f"stages.{i}.period"] = "앞 단계와 기간이 겹쳐요"
        if set(s.options) != option_ids:
            fields[f"stages.{i}.options"] = "모든 중량 옵션의 가격과 물량을 적어 주세요"
        for oid, v in s.options.items():
            if v.price < 1:
                fields[f"stages.{i}.{oid}.price"] = "가격을 적어 주세요"
            if v.quantity < 0:
                fields[f"stages.{i}.{oid}.quantity"] = "물량은 0 이상이에요"
            prev = stages[i - 1].options.get(oid) if i > 0 else None
            if prev is not None and v.price <= prev.price:
                fields[f"stages.{i}.{oid}.price"] = (
                    f"앞 단계({prev.price:,}원)보다 싸요. 이른 단계가 더 싸야 해요."
                )
    if stages and p.delivery_start and stages[-1].ends_at >= p.delivery_start:
        fields["stages.period"] = "마지막 단계는 받는 시기 시작 전에 끝나야 해요"

    old = item.stages
    for i, s in enumerate(old):
        from app.orders.models import Order

        used = db.scalar(select(Order.id).where(Order.stage_id == s.id).limit(1)) is not None
        dates_changed = i >= len(stages) or (
            stages[i].starts_at != s.starts_at or stages[i].ends_at != s.ends_at
        )
        if used and dates_changed:
            raise conflict(
                "PERIOD_LOCKED", "주문이 있는 예약 기간은 날짜를 바꾸거나 지울 수 없어요."
            )
        reserved = {
            oid: a.reserved_count for (sid, oid), a in item.allocations.items() if sid == s.id
        }
        if not any(reserved.values()):
            continue
        if i >= len(stages):
            fields[f"stages.{i}"] = "예약이 있는 단계는 지울 수 없어요"
            continue
        for oid, count in reserved.items():
            new = stages[i].options.get(oid)
            if new is not None and new.quantity < count:
                fields[f"stages.{i}.{oid}.quantity"] = f"이미 {count}박스 예약됐어요"
    if fields:
        raise invalid(fields, "고칠 칸이 있어요. 저장하지 않았어요.")

    for i, s in enumerate(stages):
        if i < len(old):
            row = old[i]
            row.seq, row.name = i + 1, s.name or f"{i + 1}단계"
            row.starts_at, row.ends_at = s.starts_at, s.ends_at
        else:
            row = Stage(
                id=new_id("st"),
                product_id=p.id,
                seq=i + 1,
                name=s.name or f"{i + 1}단계",
                starts_at=s.starts_at,
                ends_at=s.ends_at,
            )
            db.add(row)
            db.flush()
        for oid, v in s.options.items():
            price = db.get(StagePrice, (row.id, oid))
            if price is None:
                db.add(StagePrice(stage_id=row.id, option_id=oid, product_id=p.id, price=v.price))
            else:
                price.price = v.price
            alloc = item.allocations.get((row.id, oid))
            if alloc is None:
                db.add(
                    StageAllocation(
                        stage_id=row.id, option_id=oid, product_id=p.id, quantity=v.quantity
                    )
                )
            else:
                alloc.quantity = v.quantity
    for row in old[len(stages) :]:
        db.execute(delete(StagePrice).where(StagePrice.stage_id == row.id))
        db.execute(delete(StageAllocation).where(StageAllocation.stage_id == row.id))
        db.delete(row)
    p.version += 1
    p.updated_at = now()
    db.flush()
    db.expire_all()
    return StagesResult(
        version=p.version, stages=stage_views(load_products(db, [db.get(Product, p.id)])[0])
    )


def capacity_history(db: Session, product_id: str) -> list[CapacityRequestView]:
    rows = db.scalars(
        select(CapacityRequest)
        .where(CapacityRequest.product_id == product_id)
        .order_by(CapacityRequest.created_at.desc(), CapacityRequest.id.desc())
    )
    return [capacity_view(row) for row in rows]


def create_capacity_request(
    db: Session, farm_id: str, product_id: str, requested_total_grams: int, version: int
) -> CapacityRequestView:
    item = load_my_product(db, farm_id, product_id, lock=True)
    p = item.product
    if version != p.version:
        raise conflict("STALE_VERSION", "최신 상품을 다시 불러와 주세요.")
    if pending_capacity(db, p.id):
        raise conflict("CAPACITY_REQUEST_PENDING", "심사 중인 신청을 먼저 확인해 주세요.")
    if p.status not in ("DRAFT", "REJECTED", "PUBLISHED"):
        raise conflict("INVALID_TRANSITION", "공급 물량을 신청할 수 없는 상품이에요.")
    if requested_total_grams <= p.approved_supply_grams:
        raise invalid({"requestedTotalGrams": "기존 승인량보다 큰 총중량을 입력해 주세요"})
    kind = "INITIAL" if p.approved_supply_grams == 0 else "INCREASE"
    if kind == "INITIAL":
        missing = missing_fields(item)
        if missing:
            raise invalid(
                {name: "필요해요" for name in missing},
                f"빠진 칸이 있어요: {', '.join(missing)}",
            )
        p.status = "PENDING_APPROVAL"
    request = CapacityRequest(
        id=new_id("capacity"),
        product_id=p.id,
        kind=kind,
        requested_total_grams=requested_total_grams,
        status="PENDING",
        created_at=now(),
        version=1,
    )
    db.add(request)
    p.reject_reason = None
    p.version += 1
    p.updated_at = now()
    db.flush()
    return capacity_view(request)


def _capacity_request(
    db: Session, product_id: str, request_id: str, version: int
) -> tuple[Product, CapacityRequest]:
    product = db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    request = db.scalar(
        select(CapacityRequest).where(CapacityRequest.id == request_id).with_for_update()
    )
    if product is None or request is None or request.product_id != product_id:
        raise not_found("신청을 찾을 수 없어요.")
    if request.version != version:
        raise conflict("STALE_VERSION", "최신 신청을 다시 불러와 주세요.")
    if request.status != "PENDING":
        raise conflict("INVALID_TRANSITION", "이미 처리된 신청이에요.")
    return product, request


def withdraw_capacity_request(
    db: Session, farm_id: str, product_id: str, request_id: str, version: int
) -> CapacityRequestView:
    owned = load_my_product(db, farm_id, product_id, lock=True).product
    product, request = _capacity_request(db, product_id, request_id, version)
    if product.id != owned.id:
        raise not_found("신청을 찾을 수 없어요.")
    request.status = "WITHDRAWN"
    request.decided_at = now()
    request.version += 1
    if request.kind == "INITIAL":
        product.status = "DRAFT"
    product.version += 1
    product.updated_at = now()
    db.flush()
    return capacity_view(request)


def decide_capacity_request(
    db: Session,
    product_id: str,
    request_id: str,
    version: int,
    approved: bool,
    reason: str | None = None,
) -> CapacityRequestView:
    product, request = _capacity_request(db, product_id, request_id, version)
    reason = (reason or "").strip()
    if not approved and not reason:
        raise invalid({"reason": "반려 사유를 입력해 주세요"})
    if product.status == "CLOSED":
        raise conflict("INVALID_TRANSITION", "판매가 끝난 상품이에요.")
    if approved:
        if request.requested_total_grams <= product.approved_supply_grams:
            raise conflict("INVALID_TRANSITION", "현재 승인량보다 큰 신청만 승인할 수 있어요.")
        if request.kind == "INITIAL":
            item = load_products(db, [product])[0]
            if missing_fields(item):
                raise conflict("INVALID_TRANSITION", "필수 상품 정보를 확인해 주세요.")
            product.sales_limit_grams = request.requested_total_grams
            product.status = "PUBLISHED"
        product.approved_supply_grams = request.requested_total_grams
        product.reject_reason = None
        request.status = "APPROVED"
        request.reason = None
    else:
        if request.kind == "INITIAL":
            product.status = "REJECTED"
        product.reject_reason = reason
        request.status = "REJECTED"
        request.reason = reason
    request.decided_at = now()
    request.version += 1
    product.version += 1
    product.updated_at = now()
    db.flush()
    return capacity_view(request)


def update_sales_settings(
    db: Session, farm_id: str, product_id: str, body: SalesInput
) -> SalesState:
    item = load_my_product(db, farm_id, product_id, lock=True)
    p = item.product
    if body.version != p.version:
        raise conflict("STALE_VERSION", "최신 상품을 다시 불러와 주세요.")
    if p.status in ("PENDING_APPROVAL", "CLOSED"):
        raise conflict("INVALID_TRANSITION", "승인 대기·판매 종료 상품은 고칠 수 없어요.")
    state = sales_state(db, item)
    committed = state.reserved_grams + state.shipped_grams
    if p.approved_supply_grams == 0 and body.sales_limit_grams != 0:
        raise conflict("APPROVED_CAP_EXCEEDED", "승인 전에는 판매 한도를 늘릴 수 없어요.")
    if body.sales_limit_grams > p.approved_supply_grams:
        raise conflict("APPROVED_CAP_EXCEEDED", "승인 물량 안에서 판매 한도를 정해 주세요.")
    if body.sales_limit_grams < committed:
        raise conflict("CAP_BELOW_COMMITTED", "이미 예약·출하한 물량보다 줄일 수 없어요.")
    if p.status != "PUBLISHED" and body.sales_paused != p.sales_paused:
        raise conflict("INVALID_TRANSITION", "승인된 상품에서만 중지·재개할 수 있어요.")
    p.sales_limit_grams = body.sales_limit_grams
    p.max_quantity_per_order = body.max_quantity_per_order
    p.sales_paused = body.sales_paused
    p.version += 1
    p.updated_at = now()
    db.flush()
    refreshed = load_products(db, [p])[0]
    result = sales_state(db, refreshed)
    if not p.sales_paused and p.status == "PUBLISHED":
        remaining = result.remaining_grams
        resumable = any(
            stage.ends_at >= today()
            and any(
                (allocation := refreshed.allocations.get((stage.id, option.id))) is not None
                and allocation.quantity > allocation.reserved_count
                and weight_grams(option.weight_kg) <= remaining
                for option in refreshed.options
            )
            for stage in refreshed.stages
        )
        if not resumable:
            raise conflict("NOT_RESUMABLE", "판매 가능한 기간과 물량을 먼저 확인해 주세요.")
    return result


def lock_product(db: Session, product_id: str) -> Loaded:
    product = db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if product is None:
        raise not_found("상품을 찾을 수 없어요.")
    return load_products(db, [product])[0]


def lock_allocation(db: Session, stage_id: str, option_id: str) -> StageAllocation:
    """결제 때 단계 물량 행을 잠근다(SELECT … FOR UPDATE, R-06)."""
    allocation = db.scalar(
        select(StageAllocation)
        .where(StageAllocation.stage_id == stage_id, StageAllocation.option_id == option_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if allocation is None:
        raise not_found("단계 물량을 찾을 수 없어요.")
    return allocation


def farm_products(db: Session, farm_id: str) -> list[Loaded]:
    query = select(Product).where(Product.farm_id == farm_id).order_by(Product.id)
    products = list(db.scalars(query))
    return load_products(db, products)


def published_products_of_farm(db: Session, farm_id: str) -> list[Product]:
    query = select(Product).where(Product.farm_id == farm_id, Product.status == "PUBLISHED")
    return list(db.scalars(query.order_by(Product.id)))
