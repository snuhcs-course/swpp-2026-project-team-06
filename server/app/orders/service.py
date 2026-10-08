"""orders 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.catalog.schemas import DateRange
from app.core.clock import now, today
from app.core.errors import conflict, invalid, not_found
from app.core.ids import new_id
from app.orders.models import ORDER_NO_SEQ, Order, Payment
from app.orders.schemas import (
    Dashboard,
    DashboardProduct,
    DashboardStage,
    DashboardStageOption,
    DashboardTodo,
    OrderInput,
    OrderView,
    PayResult,
    RecentOrder,
)

# 결제된 주문(예약한 사람 수·주문 수에 센다)
ACTIVE = ("RESERVED", "PREPARING", "SHIPPED", "DELIVERED", "COMPLETED")
# 도서산간(예시): 제주·울릉·옹진 우편번호 앞자리 또는 주소. 생산자 지역 설정은 후속(R-20)
_REMOTE_POSTAL = re.compile(r"^(63|40[0-2]|23[01])")
_REMOTE_ADDRESS = re.compile(r"(울릉|옹진|도서)")


def reserved_people(db: Session, product_ids: list[str]) -> dict[str, int]:
    """상품별 예약한 사람 수(reservedCount, 같은 사람의 여러 주문은 한 명)."""
    if not product_ids:
        return {}
    rows = db.execute(
        select(Order.product_id, func.count(func.distinct(Order.consumer_id)))
        .where(Order.product_id.in_(product_ids), Order.status.in_(ACTIVE))
        .group_by(Order.product_id)
    )
    return dict(rows.all())


def has_orders(db: Session, product_id: str, option_id: str | None = None) -> bool:
    query = select(Order.id).where(Order.product_id == product_id)
    if option_id is not None:
        query = query.where(Order.option_id == option_id)
    return db.scalar(query.limit(1)) is not None


def _actions(o: Order) -> list[str]:
    actions = []
    if o.status in ("RESERVED", "PREPARING"):
        actions.append("cancel")
    if o.status == "DELIVERED":
        actions.append("confirm")
    if o.proposed_delivery_start and o.status in ("RESERVED", "PREPARING"):
        actions.append("respondDeliveryWindow")
    return actions


def _short_name(name: str) -> str:
    """'하우스 감귤 5kg / 10kg' → '하우스 감귤'. 옵션은 따로 보여준다."""
    return re.sub(r"\s\d+(\.\d+)?kg$", "", name.split(" / ")[0])


def order_view(db: Session, o: Order) -> OrderView:
    from app.catalog import service as catalog
    from app.farms import service as farms

    item = catalog.load_product(db, o.product_id)
    p = item.product
    farm = farms.get_farm(db, p.farm_id)
    option = next((x for x in item.options if x.id == o.option_id), None)
    proposed = (
        DateRange(start=o.proposed_delivery_start, end=o.proposed_delivery_end)
        if o.proposed_delivery_start and o.proposed_delivery_end
        else None
    )
    return OrderView(
        order_id=o.id,
        order_no=o.order_no,
        product_id=p.id,
        product_name=_short_name(p.name),
        farm_id=p.farm_id,
        farm_name=farm.name if farm else "",
        photo=p.photos[0] if p.photos else None,
        option_id=o.option_id,
        option_label=option.label if option else "",
        quantity=o.quantity,
        unit_price=o.unit_price,
        shipping_fee=o.shipping_fee,
        remote_area_fee=o.remote_area_fee,
        total_amount=o.total_amount,
        status=o.status,
        delivery_window=DateRange(start=o.delivery_start, end=o.delivery_end),
        proposed_delivery_window=proposed,
        delivery_note=o.delivery_note,
        carrier=o.carrier,
        tracking_number=o.tracking_number,
        created_at=o.created_at,
        paid_at=o.paid_at,
        shipped_at=o.shipped_at,
        delivered_at=o.delivered_at,
        refunded_at=o.refunded_at,
        refund_reason=o.refund_reason,
        recipient_name=o.recipient_name,
        recipient_phone=o.recipient_phone,
        postal_code=o.postal_code,
        address=o.address,
        address_detail=o.address_detail,
        actions=_actions(o),
    )


def create_order(db: Session, consumer, body: OrderInput) -> OrderView:
    """예약 주문(FEAT-08). 물량은 잡아두지 않고 결제 순간 선착순으로 확정한다(FQ-03)."""
    from app.accounts import service as accounts
    from app.accounts.schemas import AddressInput
    from app.catalog import service as catalog
    from app.farms import service as farms

    item = catalog.load_product(db, body.product_id)
    if (
        item is None
        or item.product.status != "PUBLISHED"
        or farms.get_approved_farm(db, item.product.farm_id) is None
    ):
        raise not_found("판매 중이 아닌 상품이에요.")
    p = item.product
    fields = accounts.validate_recipient(
        body.recipient_name, body.recipient_phone, body.postal_code, body.address
    )
    if body.delivery_note and len(body.delivery_note) > 100:
        fields["deliveryNote"] = "배송 메모는 100자까지예요"
    c = body.consents
    if not (c.delivery_window and c.delay_refund and c.shortage and c.cancel_policy):
        fields["consents"] = "결제 전 확인 4개에 모두 동의해 주세요"
    if not body.consent_version.strip():
        fields["consentVersion"] = "동의 문구 버전이 필요해요"
    option = next((o for o in item.options if o.id == body.option_id), None)
    if option is None:
        fields["optionId"] = "옵션을 골라 주세요"
    if fields:
        raise invalid(fields)
    if not 1 <= body.quantity <= p.max_quantity_per_order:
        raise conflict(
            "QUANTITY_LIMIT",
            f"한 번에 최대 {p.max_quantity_per_order}개까지 예약할 수 있어요.",
            maxQuantity=p.max_quantity_per_order,
        )
    stage = catalog.current_stage(item)
    if stage is None or item.remaining(stage, option.id) < body.quantity:
        raise conflict("SOLD_OUT", "이 단계 물량이 다 팔렸어요.", productId=p.id)

    unit_price = item.prices[(stage.id, option.id)]
    shipping_fee = p.shipping_fee if p.shipping_fee_type == "SEPARATE" else 0
    remote = bool(_REMOTE_POSTAL.match(body.postal_code) or _REMOTE_ADDRESS.search(body.address))
    remote_fee = p.remote_area_fee if remote else 0
    created = now()
    number = db.execute(ORDER_NO_SEQ.next_value()).scalar_one()
    order = Order(
        id=new_id("o"),
        order_no=f"FC-{today():%m%d}-{number % 10000:04d}",
        consumer_id=consumer.id,
        product_id=p.id,
        option_id=option.id,
        stage_id=stage.id,
        quantity=body.quantity,
        unit_price=unit_price,
        shipping_fee=shipping_fee,
        remote_area_fee=remote_fee,
        total_amount=unit_price * body.quantity + shipping_fee + remote_fee,
        status="PENDING_PAYMENT",
        delivery_start=p.delivery_start,
        delivery_end=p.delivery_end,
        recipient_name=body.recipient_name.strip(),
        recipient_phone=body.recipient_phone.strip(),
        postal_code=body.postal_code.strip(),
        address=body.address.strip(),
        address_detail=body.address_detail.strip(),
        delivery_note=(body.delivery_note or "").strip() or None,
        consent_at=created,
        consent_version=body.consent_version.strip(),
        created_at=created,
    )
    db.add(order)
    if body.save_address:
        accounts.save_order_address(
            db,
            consumer.id,
            AddressInput(
                recipient_name=order.recipient_name,
                recipient_phone=order.recipient_phone,
                postal_code=order.postal_code,
                address=order.address,
                address_detail=order.address_detail,
            ),
        )
    db.flush()
    return order_view(db, order)


def _my_order(db: Session, consumer_id: str, order_id: str, lock: bool = False) -> Order:
    query = select(Order).where(Order.id == order_id)
    if lock:
        query = query.with_for_update()
    order = db.scalar(query)
    if order is None or order.consumer_id != consumer_id:
        raise not_found("주문을 찾을 수 없어요.")
    return order


def get_order(db: Session, consumer_id: str, order_id: str) -> OrderView:
    """본인 주문만. 남의 주문은 404(AC-10, IA 예외 경로)."""
    return order_view(db, _my_order(db, consumer_id, order_id))


def pay(db: Session, consumer_id: str, order_id: str, mock_result: str) -> PayResult:
    """Mock 카드 결제(FEAT-09). 단계 물량 행을 잠그고 차감한다(R-06, AC-09-1)."""
    from app.catalog import service as catalog

    order = _my_order(db, consumer_id, order_id, lock=True)
    if order.status != "PENDING_PAYMENT":
        return PayResult(order=order_view(db, order), result="success", fail_reason=None)
    item = catalog.load_product(db, order.product_id)
    current = catalog.current_stage(item)
    if item.product.status != "PUBLISHED" or current is None or current.id != order.stage_id:
        raise conflict("STAGE_CHANGED", "그사이 단계가 바뀌었어요.", productId=order.product_id)
    allocation = catalog.lock_allocation(db, order.stage_id, order.option_id)
    if allocation.quantity - allocation.reserved_count < order.quantity:
        raise conflict("SOLD_OUT", "이 단계 물량이 다 팔렸어요.", productId=order.product_id)
    if mock_result == "fail":
        return PayResult(
            order=order_view(db, order),
            result="fail",
            fail_reason="카드 한도를 넘었어요. 다른 카드를 고르거나 다시 시도해 주세요. "
            "돈은 나가지 않았어요.",
        )
    allocation.reserved_count += order.quantity
    order.status = "RESERVED"
    order.paid_at = now()
    db.add(
        Payment(
            id=new_id("pay"),
            order_id=order.id,
            amount=order.total_amount,
            status="APPROVED",
            approved_at=order.paid_at,
        )
    )
    db.flush()
    return PayResult(order=order_view(db, order), result="success", fail_reason=None)


def _masked_name(user) -> str:
    """이름 앞 글자 + ○○ (R-15)."""
    return f"{(user.name if user else '?')[:1]}○○"


def dashboard(db: Session, farm) -> Dashboard:
    """생산자 현황(FEAT-14). 배송 정보는 넣지 않고 이름 앞 글자만(R-15)."""
    from app.accounts import service as accounts
    from app.catalog import service as catalog
    from app.messaging import service as messaging

    products = catalog.farm_products(db, farm.id)
    ids = [p.product.id for p in products]
    farm_orders = (
        list(
            db.scalars(
                select(Order).where(Order.product_id.in_(ids), Order.status != "PENDING_PAYMENT")
            )
        )
        if ids
        else []
    )
    live = [p for p in products if p.product.status == "PUBLISHED" and catalog.current_stage(p)]
    live.sort(key=lambda p: catalog.current_stage(p).ends_at)
    main = live[0] if live else None
    product = stages = None
    if main:
        mid = main.product.id
        cur = catalog.current_stage(main)
        product = DashboardProduct(
            product_id=mid,
            product_name=main.product.name,
            reserved_count=reserved_people(db, [mid]).get(mid, 0),
            order_count=sum(1 for o in farm_orders if o.product_id == mid and o.status in ACTIVE),
        )
        stages = [
            DashboardStage(
                stage_name=s.name,
                current=s.id == cur.id,
                ends_at=s.ends_at,
                options=[
                    DashboardStageOption(
                        option_id=o.id,
                        label=o.label,
                        price=v.price,
                        reserved=v.reserved_count,
                        quantity=v.quantity,
                    )
                    for o in main.options
                    if (v := main.stage_values(s).get(o.id))
                ],
            )
            for s in main.stages
        ]
    labels = {(p.product.id, o.id): o.label for p in products for o in p.options}
    recent = sorted(farm_orders, key=lambda o: o.created_at, reverse=True)[:3]
    buyers = accounts.get_users(db, [o.consumer_id for o in recent])
    return Dashboard(
        todo=DashboardTodo(
            open_questions=messaging.open_question_count(db, farm.id),
            to_ship=sum(1 for o in farm_orders if o.status == "PREPARING"),
            pending_products=sum(1 for p in products if p.product.status == "PENDING_APPROVAL"),
        ),
        product=product,
        stages=stages or [],
        recent_orders=[
            RecentOrder(
                order_id=o.id,
                buyer_name=_masked_name(buyers.get(o.consumer_id)),
                option_label=labels.get((o.product_id, o.option_id), ""),
                quantity=o.quantity,
                created_at=o.created_at,
                region=" ".join(o.address.split(" ")[:2]),
                status=o.status,
            )
            for o in recent
        ],
    )


def get_any_order(db: Session, order_id: str) -> Order | None:
    return db.get(Order, order_id)


def get_paid_order_of(db: Session, consumer_id: str, order_id: str) -> Order | None:
    """결제 이력이 있는 본인 주문(contracts-1.2 4·6장)."""
    order = db.get(Order, order_id)
    if order is None or order.consumer_id != consumer_id or order.paid_at is None:
        return None
    return order


def order_belongs_to_farm(db: Session, order: Order, farm_id: str) -> bool:
    from app.catalog import service as catalog

    item = catalog.load_product(db, order.product_id)
    return item is not None and item.product.farm_id == farm_id


def order_context(db: Session, order: Order) -> str:
    """전달 질문의 관련 예약 한 줄(예: '하우스 감귤 5kg 예약')."""
    from app.catalog import service as catalog

    item = catalog.load_product(db, order.product_id)
    option = next((o for o in item.options if o.id == order.option_id), None)
    return f"{_short_name(item.product.name)} {option.label if option else ''} 예약".replace(
        "  ", " "
    )


def linked_order_summaries(
    db: Session, consumer_id: str, farm_id: str, order_ids: list[str]
) -> list[dict]:
    """대화에 연결된 본인 결제 주문 요약(contracts-1.2 4장 orders)."""
    from app.catalog import service as catalog

    result = []
    for oid in order_ids:
        order = get_paid_order_of(db, consumer_id, oid)
        if order is None or not order_belongs_to_farm(db, order, farm_id):
            continue
        item = catalog.load_product(db, order.product_id)
        option = next((o for o in item.options if o.id == order.option_id), None)
        result.append(
            {
                "order_id": order.id,
                "product_name": item.product.name,
                "option_label": option.label if option else "",
                "quantity": order.quantity,
                "status": order.status,
            }
        )
    return result
