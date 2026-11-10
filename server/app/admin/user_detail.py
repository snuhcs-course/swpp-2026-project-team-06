"""관리자 페이지 사용자 상세(DEV-106). 문의 대응용으로 한 사용자의 주문·입금·환불을 본다.

생산자면 그 농가의 모든 상품(작성 중·승인 대기·반려·판매·종료)과 AI 상품 초안도 본다(DEV-303).
옵션 줄은 생산자 앱 상품 카드(DEV-300 `card_options`)와 같은 정의를 쓴다.

읽기만 한다. 입금 확인 대행·환불·배송 완료는 화면이 기존 운영 API(`/admin/orders/...`)를 그대로
부른다. 받는 사람 전화·주소, 계정 전화·이메일은 내려 주지 않는다(운영자 화면에도 필요할 때만).
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.accounts.models import User
from app.catalog import service as catalog
from app.catalog.models import Product, ProductDraft
from app.catalog.schemas import MyProductCardOption, ProductStatus
from app.core.db import get_db
from app.core.errors import not_found
from app.core.schemas import CamelModel
from app.core.security import Admin
from app.farms.models import Farm
from app.orders.models import Order, Payment, Refund

router = APIRouter(prefix="/admin/users", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
ORDER_LIMIT = 100
DRAFT_LIMIT = 50
# 생산자 앱 상품 목록(`my_product_cards`)과 같은 순서: 손볼 것 먼저
STATUS_ORDER = {"REJECTED": 0, "PENDING_APPROVAL": 1, "PUBLISHED": 2, "DRAFT": 3, "CLOSED": 4}
REFUNDABLE = ("RESERVED", "PREPARING", "SHIPPED", "DELIVERED")

Action = Literal["confirm_deposit", "refund", "delivered"]


class UserFarm(CamelModel):
    farm_id: str
    name: str
    approval_status: str


class UserRefund(CamelModel):
    refund_id: str
    amount: int
    reason: str
    actor: str
    created_at: datetime
    settled_at: datetime | None


class UserOrder(CamelModel):
    order_id: str
    order_no: str
    product_name: str
    farm_id: str
    farm_name: str
    quantity: int
    total_amount: int
    status: str
    recipient: str
    created_at: datetime
    deposit_due_at: datetime | None
    deposit_reported_at: datetime | None
    deposit_confirmed_by: str | None
    paid_at: datetime | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    cancel_reason: str | None
    payment_status: str | None
    refunded_amount: int
    refundable_amount: int
    refunds: list[UserRefund]
    actions: list[Action]


class UserProduct(CamelModel):
    """농가 상품 한 줄(DEV-303). 판매 중 상품의 품절·종료는 저장 상태가 아니라 `availability`."""

    product_id: str
    name: str
    status: ProductStatus
    availability: str  # catalog `SalesState.availability`(AVAILABLE·PERIOD_SOLD_OUT 등)
    reject_reason: str | None
    approved_supply_grams: int
    sales_limit_grams: int
    remaining_grams: int
    current_stage_label: str | None
    options: list[MyProductCardOption]
    updated_at: datetime


class UserProductDraft(CamelModel):
    """아직 상품이 되지 않았을 수 있는 AI 상품 초안(`product_drafts`). 원문은 내려 주지 않는다."""

    draft_id: str
    name: str | None
    variety: str | None
    options: list[str]
    missing_fields: list[str]
    failed: bool
    created_at: datetime


class UserDetail(CamelModel):
    user_id: str
    name: str
    nickname: str | None
    role: str
    is_test_account: bool
    kakao_linked: bool
    created_at: datetime
    farm: UserFarm | None
    orders: list[UserOrder]
    orders_truncated: bool
    products: list[UserProduct]
    drafts: list[UserProductDraft]


class UserLookup(CamelModel):
    user_id: str
    order_id: str


def _initial(name: str) -> str:
    """받는 사람은 앞 글자만. 같은 주문인지 맞춰 보는 데는 주문 번호·상품·금액이면 충분하다."""
    name = name.strip()
    return f"{name[0]}○○" if name else ""


def _actions(order: Order, refundable: int) -> list[Action]:
    """버튼을 보일지만 정한다. 실제 허용 여부는 기존 운영 API가 다시 검사한다."""
    actions: list[Action] = []
    if order.status == "AWAITING_DEPOSIT":
        actions.append("confirm_deposit")
    if order.status == "SHIPPED":
        actions.append("delivered")
    if order.status in REFUNDABLE and refundable > 0:
        actions.append("refund")
    return actions


def _orders(db: Session, consumer_id: str) -> tuple[list[UserOrder], bool]:
    rows = db.execute(
        select(Order, Product.name, Farm.id, Farm.name, Payment.status, Payment.amount)
        .join(Product, Product.id == Order.product_id)
        .join(Farm, Farm.id == Product.farm_id)
        .outerjoin(Payment, Payment.order_id == Order.id)
        .where(Order.consumer_id == consumer_id)
        .order_by(Order.created_at.desc(), Order.id)
        .limit(ORDER_LIMIT + 1)
    ).all()
    truncated = len(rows) > ORDER_LIMIT
    rows = rows[:ORDER_LIMIT]
    refunds: dict[str, list[Refund]] = {}
    for refund in db.scalars(
        select(Refund)
        .where(Refund.order_id.in_([r[0].id for r in rows]))
        .order_by(Refund.created_at)
    ):
        refunds.setdefault(refund.order_id, []).append(refund)

    orders = []
    for order, product_name, farm_id, farm_name, payment_status, paid in rows:
        mine = refunds.get(order.id, [])
        refunded = sum(r.amount for r in mine)
        refundable = max((paid or 0) - refunded, 0) if payment_status else 0
        orders.append(
            UserOrder(
                order_id=order.id,
                order_no=order.order_no,
                product_name=product_name,
                farm_id=farm_id,
                farm_name=farm_name,
                quantity=order.quantity,
                total_amount=order.total_amount,
                status=order.status,
                recipient=_initial(order.recipient_name),
                created_at=order.created_at,
                deposit_due_at=order.deposit_due_at,
                deposit_reported_at=order.deposit_reported_at,
                deposit_confirmed_by=order.deposit_confirmed_by,
                paid_at=order.paid_at,
                shipped_at=order.shipped_at,
                delivered_at=order.delivered_at,
                cancel_reason=order.cancel_reason,
                payment_status=payment_status,
                refunded_amount=refunded,
                refundable_amount=refundable,
                refunds=[
                    UserRefund(
                        refund_id=r.id,
                        amount=r.amount,
                        reason=r.reason,
                        actor=r.actor,
                        created_at=r.created_at,
                        settled_at=r.settled_at,
                    )
                    for r in mine
                ],
                actions=_actions(order, refundable),
            )
        )
    return orders, truncated


def _products(db: Session, farm_id: str) -> list[UserProduct]:
    """순서·판매 기간 표기는 생산자 앱 `my_product_cards`·`my_product_card`와 같다.
    옵션·단계·가격·물량은 `load_products`가 한 번에 읽는다. 판매 상태(`sales_state`)는
    생산자 앱 카드처럼 상품마다 주문 합계를 한 번 읽는다."""
    products = list(db.scalars(select(Product).where(Product.farm_id == farm_id)))
    products.sort(key=lambda p: (STATUS_ORDER.get(p.status, 99), -p.updated_at.timestamp(), p.id))
    rows = []
    for item in catalog.load_products(db, products):
        p, cur = item.product, catalog.current_stage(item)
        state = catalog.sales_state(db, item)
        rows.append(
            UserProduct(
                product_id=p.id,
                name=p.name,
                status=p.status,
                availability=state.availability,
                reject_reason=p.reject_reason,
                approved_supply_grams=p.approved_supply_grams,
                sales_limit_grams=p.sales_limit_grams,
                remaining_grams=state.remaining_grams,
                current_stage_label=f"{cur.starts_at} ~ {cur.ends_at}" if cur else None,
                options=catalog.card_options(item, cur),
                updated_at=p.updated_at,
            )
        )
    return rows


def _drafts(db: Session, farm_id: str) -> list[UserProductDraft]:
    drafts = db.scalars(
        select(ProductDraft)
        .where(ProductDraft.farm_id == farm_id)
        .order_by(ProductDraft.created_at.desc(), ProductDraft.id)
        .limit(DRAFT_LIMIT)
    )
    rows = []
    for d in drafts:
        out = d.output or {}
        rows.append(
            UserProductDraft(
                draft_id=d.id,
                name=out.get("name") or None,
                variety=out.get("variety") or None,
                options=list(out.get("options") or []),
                missing_fields=list(d.missing_fields or []),
                failed=d.failed,
                created_at=d.created_at,
            )
        )
    return rows


@router.get("/by-order/{order_ref}", response_model=UserLookup)
def find_by_order(db: Db, _: Admin, order_ref: str):
    """주문 ID 또는 주문 번호(입금자명 `FC-MMDD-NNNN`)로 주문한 소비자를 찾는다."""
    order = db.scalar(
        select(Order).where(
            or_(Order.id == order_ref, func.upper(Order.order_no) == order_ref.upper())
        )
    )
    if order is None:
        raise not_found("주문을 찾을 수 없어요.")
    return UserLookup(user_id=order.consumer_id, order_id=order.id)


@router.get("/{user_id}", response_model=UserDetail)
def user_detail(db: Db, _: Admin, user_id: str):
    user = db.get(User, user_id)
    if user is None:
        raise not_found("사용자를 찾을 수 없어요.")
    farm = db.scalar(select(Farm).where(Farm.producer_id == user.id))
    orders, truncated = _orders(db, user.id) if user.role == "CONSUMER" else ([], False)
    products = _products(db, farm.id) if farm else []
    drafts = _drafts(db, farm.id) if farm else []
    return UserDetail(
        user_id=user.id,
        name=user.name,
        nickname=user.nickname,
        role=user.role,
        is_test_account=user.is_test_account,
        kakao_linked=user.kakao_id is not None,
        created_at=user.created_at,
        farm=UserFarm(farm_id=farm.id, name=farm.name, approval_status=farm.approval_status)
        if farm
        else None,
        orders=orders,
        orders_truncated=truncated,
        products=products,
        drafts=drafts,
    )
