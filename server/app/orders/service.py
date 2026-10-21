"""orders 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

import re
import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.catalog.schemas import DateRange
from app.core.clock import now, today
from app.core.config import get_settings
from app.core.errors import conflict, invalid, not_found
from app.core.ids import new_id
from app.orders.models import Order, Payment, Refund
from app.orders.schemas import (
    Changed,
    Dashboard,
    DashboardProduct,
    DashboardStage,
    DashboardStageOption,
    DashboardTodo,
    OrderInput,
    OrderView,
    ProducerOrder,
    RecentOrder,
    RefundView,
)

# 결제된 주문(예약한 사람 수·주문 수에 센다)
ACTIVE = ("RESERVED", "PREPARING", "SHIPPED", "DELIVERED", "COMPLETED")
# 생산자 화면에 보이는 주문(결제 전만 뺀다). 입금 대기는 물량을 잡고 있으므로 보인다(DEV-68)
VISIBLE = Order.status != "PENDING_PAYMENT"
# 생산자 목록: 돈을 낸 적 없이 끝난 취소(입금 기한 초과·입금 전 취소·입금 미승인 취소)는 뺀다(R-15)
PRODUCER_VISIBLE = VISIBLE & ~((Order.status == "CANCELED") & Order.paid_at.is_(None))
# 입금 대기 주문의 취소 사유(R-28)
DEPOSIT_EXPIRED = "입금 기한 초과"


def holds_stock(order: Order) -> bool:
    """물량을 잡고 있는 주문: 입금 대기(안내 시점 선점) 또는 입금 확인된 주문."""
    return order.status == "AWAITING_DEPOSIT" or order.paid_at is not None
# 도서산간(예시): 제주·울릉·옹진 우편번호 앞자리 또는 주소. 생산자 지역 설정은 후속(R-20)
_REMOTE_POSTAL = re.compile(r"^(63|40[0-2]|23[01])")
_REMOTE_ADDRESS = re.compile(r"(울릉|옹진|도서)")


def capacity_totals(db: Session, product_id: str) -> tuple[int, int, int]:
    reserved_grams = shipped_grams = sold_quantity = 0
    orders = db.scalars(select(Order).where(Order.product_id == product_id))
    for order in orders:
        if not holds_stock(order):
            continue
        allocated = max(0, order.quantity - order.released_quantity)
        sold_quantity += allocated
        grams = allocated * order.unit_weight_grams
        if order.shipped_at:
            shipped_grams += grams
        else:
            reserved_grams += grams
    return reserved_grams, shipped_grams, sold_quantity


def propose_delivery_window(
    db: Session, product_id: str, delivery_start, delivery_end
) -> None:
    orders = db.scalars(
        select(Order).where(
            Order.product_id == product_id,
            Order.status.in_(("AWAITING_DEPOSIT", "RESERVED", "PREPARING")),
        )
    )
    for order in orders:
        order.proposed_delivery_start = delivery_start
        order.proposed_delivery_end = delivery_end


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
    if o.status in ("AWAITING_DEPOSIT", "RESERVED", "PREPARING"):
        actions.append("cancel")
    if o.status == "AWAITING_DEPOSIT" and o.deposit_reported_at is None:
        actions.append("reportDeposit")
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
        unit_weight_grams=o.unit_weight_grams,
        released_quantity=o.released_quantity,
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
        # 계좌·판매자 정보는 입금 안내 이후(물량을 잡은 뒤)에만 내려준다(DEV-68 결정 6)
        deposit_account=farms.deposit_account(farm) if farm and holds_stock(o) else None,
        seller_info=farms.seller_info(db, farm) if farm and holds_stock(o) else None,
        deposit_due_at=o.deposit_due_at,
        deposit_reported_at=o.deposit_reported_at,
        cancel_reason=o.cancel_reason,
        refund_settled_at=_refund_settled_at(db, o),
        deposit_issue=o.deposit_issue if o.status == "AWAITING_DEPOSIT" else None,
        refund_issue=_refund_issue(db, o),
        recipient_name=o.recipient_name,
        recipient_phone=o.recipient_phone,
        postal_code=o.postal_code,
        address=o.address,
        address_detail=o.address_detail,
        actions=_actions(o),
    )


def _refund_settled_at(db: Session, o: Order):
    """전액 환불된 주문의 농가 송금 완료 시각. 환불 행이 없거나 아직 송금 전이면 None."""
    if o.status != "REFUNDED":
        return None
    return db.scalar(
        select(Refund.settled_at)
        .where(Refund.order_id == o.id)
        .order_by(Refund.created_at.desc())
        .limit(1)
    )


def _refund_issue(db: Session, o: Order) -> str | None:
    """농가가 아직 송금하지 못한 사유(환불 미승인). 송금을 마쳤으면 None."""
    if o.status != "REFUNDED" or o.refund_issue is None or _refund_settled_at(db, o) is not None:
        return None
    return o.refund_issue


def _reason(text: str, field: str = "reason") -> str:
    reason = text.strip()
    if not reason:
        raise invalid({field: "사유를 적어 주세요"})
    return reason


def _new_order_no(db: Session) -> str:
    """주문 번호 `FC-MMDD-NNNN`. 입금자명으로 쓴다(R-28).

    NNNN은 연번이 아니라 무작위 4자리다. 연번이면 소비자가 거래 건수를 셀 수 있어서다
    (2026-10-18 결정).
    같은 날 같은 번호가 이미 있으면 다시 뽑는다(order_no는 UNIQUE).
    """
    prefix = f"FC-{today():%m%d}-"
    for _ in range(50):
        candidate = f"{prefix}{secrets.randbelow(10000):04d}"
        if db.scalar(select(Order.id).where(Order.order_no == candidate)) is None:
            return candidate
    raise conflict("INVALID_TRANSITION", "주문 번호를 만들지 못했어요. 다시 시도해 주세요.")


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
    if p.sales_paused:
        raise conflict("SALES_PAUSED", "농가가 잠시 예약을 쉬고 있어요.", productId=p.id)
    if stage is None:
        raise conflict("STAGE_CHANGED", "예약 기간이 바뀌었어요.", productId=p.id)
    requested_grams = body.quantity * catalog.weight_grams(option.weight_kg)
    if catalog.sales_state(db, item).remaining_grams < requested_grams:
        raise conflict("TOTAL_LIMIT_REACHED", "상품의 전체 예약 물량이 소진됐어요.", productId=p.id)
    if item.remaining(stage, option.id) < body.quantity:
        raise conflict("SOLD_OUT", "이 단계 물량이 다 팔렸어요.", productId=p.id)

    unit_price = item.prices[(stage.id, option.id)]
    shipping_fee = p.shipping_fee if p.shipping_fee_type == "SEPARATE" else 0
    remote = bool(_REMOTE_POSTAL.match(body.postal_code) or _REMOTE_ADDRESS.search(body.address))
    remote_fee = p.remote_area_fee if remote else 0
    created = now()
    order = Order(
        id=new_id("o"),
        order_no=_new_order_no(db),
        consumer_id=consumer.id,
        product_id=p.id,
        option_id=option.id,
        stage_id=stage.id,
        quantity=body.quantity,
        unit_price=unit_price,
        unit_weight_grams=catalog.weight_grams(option.weight_kg),
        released_quantity=0,
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
    # 무작위 주문 번호가 동시에 같은 값을 뽑으면 UNIQUE 위반이 난다. 그때만 새 번호로 다시 넣는다
    for attempt in range(5):
        try:
            with db.begin_nested():
                db.add(order)
                db.flush()
            break
        except IntegrityError as exc:
            if attempt == 4 or "order_no" not in str(exc.orig):
                raise
            order.order_no = _new_order_no(db)
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
    """본인 주문만. 남의 주문은 404(AC-10, IA 예외 경로). 기한이 지난 입금 대기는 먼저 취소한다."""
    order = _my_order(db, consumer_id, order_id)
    if _expire_if_overdue(db, order):
        db.commit()
    return order_view(db, order)


def list_orders(db: Session, consumer_id: str) -> list[OrderView]:
    if expire_overdue_deposits(db, consumer_id=consumer_id):
        db.commit()
    orders = list(
        db.scalars(
            select(Order).where(
                Order.consumer_id == consumer_id, Order.status != "PENDING_PAYMENT"
            )
        )
    )
    orders.sort(
        key=lambda order: (
            "respondDeliveryWindow" in _actions(order) or "confirm" in _actions(order),
            order.created_at,
            order.id,
        ),
        reverse=True,
    )
    return [order_view(db, order) for order in orders]


def _release_quantity(db: Session, order: Order, quantity: int) -> None:
    from app.catalog import service as catalog

    if order.shipped_at or not holds_stock(order):
        return
    releasable = max(0, order.quantity - order.released_quantity)
    released = min(max(quantity, 0), releasable)
    if released == 0:
        return
    allocation = catalog.lock_allocation(db, order.stage_id, order.option_id)
    if allocation.reserved_count < released:
        raise conflict("INVALID_TRANSITION", "예약 물량이 일치하지 않아요.")
    allocation.reserved_count -= released
    order.released_quantity += released


def _refund(
    db: Session,
    order: Order,
    reason: str,
    *,
    actor: str,
    actor_user_id: str | None,
    amount: int | None = None,
    manager_event_id: str | None = None,
) -> Refund | None:
    if order.status == "REFUNDED":
        return None
    payment = db.scalar(
        select(Payment).where(Payment.order_id == order.id).with_for_update()
    )
    if payment is None:
        raise conflict("INVALID_TRANSITION", "결제 내역이 없어 환불할 수 없어요.")
    refunded = db.scalar(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.order_id == order.id)
    )
    remaining = payment.amount - int(refunded or 0)
    requested = remaining if amount is None else amount
    if requested <= 0:
        raise invalid({"amount": "환불 금액은 0보다 커야 해요"})
    if requested > remaining:
        raise invalid({"amount": "남은 결제 금액보다 많이 환불할 수 없어요"})

    refund = Refund(
        id=new_id("refund"),
        order_id=order.id,
        amount=requested,
        reason=reason,
        actor=actor,
        actor_user_id=actor_user_id,
        manager_event_id=manager_event_id,
        created_at=now(),
    )
    db.add(refund)
    if requested < remaining:
        payment.status = "PARTIALLY_REFUNDED"
        return refund

    _release_quantity(db, order, order.quantity - order.released_quantity)
    payment.status = "REFUNDED"
    order.status = "REFUNDED"
    order.refunded_at = now()
    order.refund_reason = reason
    return refund


def cancel_order(db: Session, consumer_id: str, order_id: str) -> OrderView:
    from app.catalog import service as catalog

    existing = _my_order(db, consumer_id, order_id)
    catalog.lock_product(db, existing.product_id)
    order = _my_order(db, consumer_id, order_id, lock=True)
    _expire_if_overdue(db, order)  # 기한이 지났으면 '입금 기한 초과'로 끝낸다(R-28)
    if order.status in ("REFUNDED", "CANCELED") and order.shipped_at is None:
        return order_view(db, order)
    if order.status == "AWAITING_DEPOSIT":
        # 입금 전 취소: 돈이 없으므로 환불 없이 끝내고 물량만 돌려준다(DEV-68 결정 5)
        current = today()
        _cancel_awaiting(db, order, f"{current.month}월 {current.day}일 직접 취소(입금 전)")
        db.flush()
        return order_view(db, order)
    if order.status not in ("RESERVED", "PREPARING"):
        raise conflict("INVALID_TRANSITION", "출하 후에는 취소할 수 없어요.")
    current = today()
    _refund(
        db,
        order,
        f"{current.month}월 {current.day}일 직접 취소(출하 전)",
        actor="CONSUMER",
        actor_user_id=consumer_id,
    )
    db.flush()
    return order_view(db, order)


def confirm_order(db: Session, consumer_id: str, order_id: str) -> OrderView:
    order = _my_order(db, consumer_id, order_id, lock=True)
    if order.status != "DELIVERED":
        raise conflict("INVALID_TRANSITION", "배송 완료 후에 구매 확정할 수 있어요.")
    order.status = "COMPLETED"
    order.completed_at = now()
    db.flush()
    return order_view(db, order)


def mark_delivered(db: Session, order_id: str) -> OrderView:
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise not_found("주문을 찾을 수 없어요.")
    if order.status != "SHIPPED":
        raise conflict("INVALID_TRANSITION", "출하된 주문만 배송 완료로 바꿀 수 있어요.")
    order.status = "DELIVERED"
    order.delivered_at = now()
    db.flush()
    return order_view(db, order)


def admin_refund(
    db: Session,
    order_id: str,
    reason: str,
    amount: int | None,
    manager_id: str,
    manager_event_id: str | None = None,
) -> OrderView:
    from app.catalog import service as catalog

    refund_reason = reason.strip()
    if not refund_reason:
        raise invalid({"reason": "환불 사유를 적어 주세요"})

    existing = db.get(Order, order_id)
    if existing is None:
        raise not_found("주문을 찾을 수 없어요.")
    if existing.status in ("RESERVED", "PREPARING"):
        catalog.lock_product(db, existing.product_id)

    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order.status not in ("RESERVED", "PREPARING", "SHIPPED", "DELIVERED"):
        raise conflict("INVALID_TRANSITION", "전액 환불할 수 없는 주문 상태예요.")
    _refund(
        db,
        order,
        refund_reason,
        actor="MANAGER",
        actor_user_id=manager_id,
        amount=amount,
        manager_event_id=manager_event_id,
    )
    db.flush()
    return order_view(db, order)


def respond_delivery_window(
    db: Session, consumer_id: str, order_id: str, choice: str
) -> OrderView:
    from app.catalog import service as catalog

    existing = _my_order(db, consumer_id, order_id)
    catalog.lock_product(db, existing.product_id)
    order = _my_order(db, consumer_id, order_id, lock=True)
    if not order.proposed_delivery_start or order.status not in ("RESERVED", "PREPARING"):
        raise conflict("INVALID_TRANSITION", "바뀐 받는 시기가 없어요.")
    if choice == "accept":
        order.delivery_start = order.proposed_delivery_start
        order.delivery_end = order.proposed_delivery_end
        order.proposed_delivery_start = None
        order.proposed_delivery_end = None
    else:
        order.proposed_delivery_start = None
        order.proposed_delivery_end = None
        _refund(
            db,
            order,
            "받는 시기 변경에 동의하지 않아 전액 환불",
            actor="CONSUMER",
            actor_user_id=consumer_id,
        )
    db.flush()
    return order_view(db, order)


def _cancel_awaiting(db: Session, order: Order, reason: str) -> None:
    """입금 대기 주문을 결제 없이 끝낸다. 잡아 둔 물량은 한 번만 돌려준다(R-28)."""
    _release_quantity(db, order, order.quantity - order.released_quantity)
    order.status = "CANCELED"
    order.cancel_reason = reason


def _expire_if_overdue(db: Session, order: Order) -> bool:
    """기한 지난 입금 대기를 취소한다. 소비자가 '입금했어요'를 보낸 주문은 취소하지 않는다.

    돈이 이미 농가 계좌에 들어갔을 수 있어서다. 운영자가 `GET /admin/orders/deposit-overdue`로 찾아
    생산자에게 연락한다(2026-10-18 박현 결정).
    """
    if (
        order.status != "AWAITING_DEPOSIT"
        or order.deposit_due_at is None
        or order.deposit_due_at > now()
        or order.deposit_reported_at is not None
    ):
        return False
    from app.catalog import service as catalog

    catalog.lock_product(db, order.product_id)
    locked = db.scalar(select(Order).where(Order.id == order.id).with_for_update())
    if (
        locked is None
        or locked.status != "AWAITING_DEPOSIT"
        or locked.deposit_reported_at is not None
    ):
        return False
    _cancel_awaiting(db, locked, DEPOSIT_EXPIRED)
    db.flush()
    return True


def reported_overdue_deposits(db: Session) -> list[Order]:
    """소비자는 입금했다고 알렸는데 기한까지 생산자가 확인하지 않은 주문(운영자가 연락할 대상)."""
    return list(
        db.scalars(
            select(Order)
            .where(
                Order.status == "AWAITING_DEPOSIT",
                Order.deposit_due_at <= now(),
                Order.deposit_reported_at.is_not(None),
            )
            .order_by(Order.deposit_due_at, Order.id)
        )
    )


def expire_overdue_deposits(
    db: Session, *, consumer_id: str | None = None, farm_id: str | None = None
) -> int:
    """기한이 지난 입금 대기 주문을 취소하고 물량을 돌려준다(R-28, AC-09-7).

    조회 시점 지연 검사와 운영자 일괄 API가 같이 쓴다. 바뀐 주문 수를 돌려준다.
    """
    query = select(Order).where(
        Order.status == "AWAITING_DEPOSIT",
        Order.deposit_due_at <= now(),
        Order.deposit_reported_at.is_(None),
    )
    if consumer_id:
        query = query.where(Order.consumer_id == consumer_id)
    if farm_id:
        from app.catalog import service as catalog

        ids = [item.product.id for item in catalog.farm_products(db, farm_id)]
        if not ids:
            return 0
        query = query.where(Order.product_id.in_(ids))
    changed = 0
    for order in list(db.scalars(query)):
        if _expire_if_overdue(db, order):
            changed += 1
    return changed


def request_deposit(db: Session, consumer_id: str, order_id: str) -> OrderView:
    """입금 안내(FEAT-09 개정). 상품 → 기간 물량 순서로 잠그고 박스·중량을 선점한 뒤
    입금 대기로 바꾼다.

    같은 멱등 키로 다시 오면 라우터가 처음 결과를 돌려준다(AC-09-3).
    이미 입금 대기·확인된 주문은 그대로 돌려준다.
    """
    from app.catalog import service as catalog
    from app.farms import service as farms

    existing = _my_order(db, consumer_id, order_id)
    item = catalog.lock_product(db, existing.product_id)
    order = _my_order(db, consumer_id, order_id, lock=True)
    if _expire_if_overdue(db, order):
        raise conflict("INVALID_TRANSITION", "입금 기한이 지나 취소된 주문이에요.")
    if order.status != "PENDING_PAYMENT":
        if holds_stock(order) and order.status in ("AWAITING_DEPOSIT", *ACTIVE):
            return order_view(db, order)
        raise conflict("INVALID_TRANSITION", "입금 안내를 받을 수 없는 주문이에요.")
    farm = farms.get_farm(db, item.product.farm_id)
    if farm is None or not farms.has_deposit_account(farm):
        raise conflict("NO_FARM_ACCOUNT", "농가가 아직 입금 계좌를 등록하지 않았어요.")
    if item.product.sales_paused:
        raise conflict("SALES_PAUSED", "판매가 잠시 중지됐어요.", productId=order.product_id)
    current = catalog.current_stage(item)
    if item.product.status != "PUBLISHED" or current is None or current.id != order.stage_id:
        raise conflict("STAGE_CHANGED", "그사이 단계가 바뀌었어요.", productId=order.product_id)
    option = next((row for row in item.options if row.id == order.option_id), None)
    price = item.prices.get((order.stage_id, order.option_id))
    if (
        option is None
        or price != order.unit_price
        or catalog.weight_grams(option.weight_kg) != order.unit_weight_grams
    ):
        raise conflict("STAGE_CHANGED", "가격이나 옵션이 바뀌었어요.", productId=order.product_id)
    allocation = catalog.lock_allocation(db, order.stage_id, order.option_id)
    if allocation.quantity - allocation.reserved_count < order.quantity:
        raise conflict("SOLD_OUT", "이 단계 물량이 다 팔렸어요.", productId=order.product_id)
    state = catalog.sales_state(db, item)
    requested_grams = order.quantity * order.unit_weight_grams
    if state.remaining_grams < requested_grams:
        raise conflict(
            "TOTAL_LIMIT_REACHED",
            "추가 예약 가능한 공급 물량이 부족해요.",
            productId=order.product_id,
        )
    allocation.reserved_count += order.quantity
    order.status = "AWAITING_DEPOSIT"
    order.deposit_due_at = now() + timedelta(hours=get_settings().deposit_deadline_hours)
    db.flush()
    return order_view(db, order)


def report_deposit(db: Session, consumer_id: str, order_id: str) -> OrderView:
    """소비자 '입금했어요' 신호. 상태는 바꾸지 않고 생산자 줄의 힌트로만 쓴다(DEV-68 결정 4)."""
    # 잠금 순서는 다른 경로와 같게 상품 → 주문(만료 검사가 상품을 먼저 잠근다)
    if _expire_if_overdue(db, _my_order(db, consumer_id, order_id)):
        raise conflict("INVALID_TRANSITION", "입금 기한이 지나 취소된 주문이에요.")
    order = _my_order(db, consumer_id, order_id, lock=True)
    if order.status != "AWAITING_DEPOSIT":
        raise conflict("INVALID_TRANSITION", "입금 대기 주문이 아니에요.")
    if order.deposit_reported_at is None:
        order.deposit_reported_at = now()
    db.flush()
    return order_view(db, order)


def reject_deposit(
    db: Session, farm_id: str, order_id: str, reason: str, *, cancel: bool
) -> Order:
    """입금 미승인(DEV-68). 사유는 필수이고 소비자에게 그대로 보인다.

    cancel이면 주문을 취소하고 물량을 돌려준다(`cancel_reason="입금 미승인 · 사유"`).
    아니면 입금 대기로 두고 사유만 남긴다. 소비자가 다시 '입금했어요'를 누를 수 있게 신호를 지운다.
    """
    from app.catalog import service as catalog

    text = _reason(reason)
    existing = db.get(Order, order_id)
    if existing is None or not order_belongs_to_farm(db, existing, farm_id):
        raise not_found("주문을 찾을 수 없어요.")
    catalog.lock_product(db, existing.product_id)
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if _expire_if_overdue(db, order):
        raise conflict("INVALID_TRANSITION", "입금 기한이 지나 취소된 주문이에요.")
    if order.status != "AWAITING_DEPOSIT":
        raise conflict("INVALID_TRANSITION", "입금 대기 주문만 미승인할 수 있어요.")
    if cancel:
        _cancel_awaiting(db, order, f"입금 미승인 · {text}")
        order.deposit_issue = None
    else:
        order.deposit_issue = text
        order.deposit_reported_at = None
    order.deposit_issue_at = now()
    db.flush()
    return order


def confirm_deposit(
    db: Session, order_id: str, *, farm_id: str | None, confirmed_by: str
) -> Order:
    """입금 확인(AC-09-8). 생산자(자기 농가) 또는 운영자. 이미 확인됐으면 그대로 돌려준다(멱등).

    결제일(`paid_at`, R-13)은 확인 시각이다. 입금 대기가 아니면 409.
    """
    from app.catalog import service as catalog

    existing = db.get(Order, order_id)
    if existing is None or (farm_id and not order_belongs_to_farm(db, existing, farm_id)):
        raise not_found("주문을 찾을 수 없어요.")
    catalog.lock_product(db, existing.product_id)
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order.paid_at is not None and order.status in ACTIVE:
        return order
    if _expire_if_overdue(db, order):
        raise conflict("INVALID_TRANSITION", "입금 기한이 지나 취소된 주문이에요.")
    if order.status != "AWAITING_DEPOSIT":
        raise conflict("INVALID_TRANSITION", "입금 대기 주문만 확인할 수 있어요.")
    order.status = "RESERVED"
    order.paid_at = now()
    order.deposit_confirmed_by = confirmed_by
    order.deposit_issue = None
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
    return order


def settle_refund(db: Session, farm_id: str, order_id: str) -> ProducerOrder:
    """농가가 입금했던 계좌로 송금을 마쳤다고 표시한다(AC-17-7). 환불 행이 없으면 409."""
    order = db.get(Order, order_id)
    if order is None or not order_belongs_to_farm(db, order, farm_id):
        raise not_found("주문을 찾을 수 없어요.")
    if order.status != "REFUNDED":
        raise conflict("INVALID_TRANSITION", "환불할 주문이 아니에요.")
    refunds = list(
        db.scalars(select(Refund).where(Refund.order_id == order_id).with_for_update())
    )
    if not refunds:
        raise conflict("INVALID_TRANSITION", "환불 기록이 없어요.")
    for refund in refunds:
        if refund.settled_at is None:
            refund.settled_at = now()
    order.refund_issue = None
    db.flush()
    return producer_order_view(db, order)


def refund_issue(db: Session, farm_id: str, order_id: str, reason: str) -> ProducerOrder:
    """환불 미승인(DEV-68). 아직 송금하지 못한 사유를 남긴다. 환불 송금 대기는 그대로다."""
    text = _reason(reason)
    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None or not order_belongs_to_farm(db, order, farm_id):
        raise not_found("주문을 찾을 수 없어요.")
    if order.status != "REFUNDED":
        raise conflict("INVALID_TRANSITION", "환불할 주문이 아니에요.")
    if _refund_settled_at(db, order) is not None:
        raise conflict("INVALID_TRANSITION", "이미 환불을 마친 주문이에요.")
    order.refund_issue = text
    order.refund_issue_at = now()
    db.flush()
    return producer_order_view(db, order)


def _masked_name(user) -> str:
    """농가에 보이는 소비자 이름(R-15): 닉네임, 없으면 이름 앞 글자 + ○○."""
    from app.accounts import service as accounts

    return accounts.public_name(user)


def dashboard(db: Session, farm) -> Dashboard:
    """생산자 현황(FEAT-14). 배송 정보는 넣지 않고 이름 앞 글자만(R-15)."""
    from app.accounts import service as accounts
    from app.catalog import service as catalog
    from app.farms import service as farms
    from app.messaging import service as messaging

    if expire_overdue_deposits(db, farm_id=farm.id):
        db.commit()
    products = catalog.farm_products(db, farm.id)
    ids = [p.product.id for p in products]
    farm_orders = (
        list(
            db.scalars(
                select(Order).where(Order.product_id.in_(ids), VISIBLE)
            )
        )
        if ids
        else []
    )
    unsettled = (
        set(
            db.scalars(
                select(Refund.order_id).where(
                    Refund.order_id.in_([o.id for o in farm_orders]), Refund.settled_at.is_(None)
                )
            )
        )
        if farm_orders
        else set()
    )
    live = [p for p in products if p.product.status == "PUBLISHED" and catalog.current_stage(p)]
    live.sort(key=lambda p: catalog.current_stage(p).ends_at)
    main = live[0] if live else None
    product = stages = None
    if main:
        mid = main.product.id
        cur = catalog.current_stage(main)
        product = DashboardProduct(
            **catalog.sales_state(db, main).model_dump(),
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
            awaiting_deposit=sum(1 for o in farm_orders if o.status == "AWAITING_DEPOSIT"),
            refunds_to_settle=sum(
                1 for o in farm_orders if o.status == "REFUNDED" and o.id in unsettled
            ),
            has_account=farms.has_deposit_account(farm),
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


def producer_order_view(db: Session, order: Order) -> ProducerOrder:
    from app.catalog import service as catalog

    item = catalog.load_product(db, order.product_id)
    option = next((row for row in item.options if row.id == order.option_id), None)
    awaiting = order.status == "AWAITING_DEPOSIT"
    # 결제(입금 확인) 전 주문은 배송지를 보여 주지 않는다(R-15 최소 노출)
    hide = order.paid_at is None
    return ProducerOrder(
        order_id=order.id,
        order_no=order.order_no,
        product_id=order.product_id,
        product_name=_short_name(item.product.name),
        option_label=option.label if option else "",
        quantity=order.quantity,
        status=order.status,
        delivery_note=None if hide else order.delivery_note,
        carrier=order.carrier,
        tracking_number=order.tracking_number,
        created_at=order.created_at,
        total_amount=order.total_amount,
        deposit_due_at=order.deposit_due_at,
        deposit_reported_at=order.deposit_reported_at,
        refund_settled_at=_refund_settled_at(db, order),
        deposit_issue=order.deposit_issue if awaiting else None,
        refund_issue=_refund_issue(db, order),
        # 입금 전에는 배송지를 보여 주지 않는다(R-15 최소 노출)
        recipient_name=order.recipient_name,
        recipient_phone="" if hide else order.recipient_phone,
        postal_code="" if hide else order.postal_code,
        address="" if hide else order.address,
        address_detail="" if hide else order.address_detail,
    )


def producer_orders(
    db: Session, farm_id: str, status: str | None, product_id: str | None
) -> list[ProducerOrder]:
    from app.catalog import service as catalog

    if expire_overdue_deposits(db, farm_id=farm_id):
        db.commit()
    product_ids = [item.product.id for item in catalog.farm_products(db, farm_id)]
    if not product_ids:
        return []
    query = select(Order).where(Order.product_id.in_(product_ids), PRODUCER_VISIBLE)
    if status:
        query = query.where(Order.status == status)
    if product_id:
        if product_id not in product_ids:
            raise not_found("찾을 수 없는 상품이에요.")
        query = query.where(Order.product_id == product_id)
    rows = db.scalars(query.order_by(Order.created_at.desc(), Order.id.desc()))
    return [producer_order_view(db, row) for row in rows]


def harvest_start(db: Session, farm_id: str, product_id: str) -> Changed:
    from app.catalog import service as catalog

    catalog.load_my_product(db, farm_id, product_id)
    orders = list(
        db.scalars(
            select(Order).where(
                Order.product_id == product_id, Order.status == "RESERVED"
            ).with_for_update()
        )
    )
    for order in orders:
        order.status = "PREPARING"
    db.flush()
    return Changed(changed=len(orders))


def ship_order(
    db: Session,
    farm_id: str,
    order_id: str,
    tracking_number: str | None,
    carrier: str | None,
) -> ProducerOrder:
    from app.catalog import service as catalog

    order = db.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise not_found("주문을 찾을 수 없어요.")
    item = catalog.load_product(db, order.product_id)
    if item is None or item.product.farm_id != farm_id:
        raise not_found("주문을 찾을 수 없어요.")
    if order.status != "PREPARING":
        raise conflict("INVALID_TRANSITION", "출하 준비인 주문만 출하로 바꿀 수 있어요.")
    order.status = "SHIPPED"
    order.shipped_at = now()
    order.tracking_number = (tracking_number or "").strip() or None
    order.carrier = carrier
    db.flush()
    return producer_order_view(db, order)


def get_any_order(db: Session, order_id: str) -> Order | None:
    return db.get(Order, order_id)


def refund_history(db: Session, order_id: str) -> list[RefundView]:
    if db.get(Order, order_id) is None:
        raise not_found("주문을 찾을 수 없어요.")
    rows = db.scalars(
        select(Refund)
        .where(Refund.order_id == order_id)
        .order_by(Refund.created_at.desc(), Refund.id.desc())
    )
    return [
        RefundView(
            refund_id=row.id,
            order_id=row.order_id,
            amount=row.amount,
            reason=row.reason,
            actor=row.actor,
            actor_user_id=row.actor_user_id,
            manager_event_id=row.manager_event_id,
            created_at=row.created_at,
            settled_at=row.settled_at,
        )
        for row in rows
    ]


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


def order_farm_id(db: Session, order: Order) -> str:
    from app.catalog import service as catalog

    return catalog.load_product(db, order.product_id).product.farm_id
