"""관리자 페이지 사용자 목록·검색과 운영 검증 계정 표시(DEV-107).

카카오로 가입한 팀원·운영 검증 계정은 시드 테스트 계정(is_test_account)이 아니라서 테스트 농가
숨기기(DEV-93·98)가 실사용자 주문으로 거부한다. 운영자가 ops_tester를 켜면 그 계정의 주문은
테스트로 센다. is_test_account(Mock 로그인 대상, 온보딩 생략)는 바꾸지 않는다.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.accounts.models import User
from app.admin.schemas import AdminUserPage, AdminUserView
from app.admin.service import run_manager_action
from app.core.db import get_db
from app.core.errors import conflict, not_found
from app.core.security import Admin
from app.farms.models import Farm
from app.orders.models import Order

router = APIRouter(prefix="/admin/users", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


def _order_counts():
    return select(Order.consumer_id, func.count().label("n")).group_by(Order.consumer_id).subquery()


def _view(user: User, farm: Farm | None, order_count: int) -> AdminUserView:
    digits = "".join(c for c in user.phone or "" if c.isdigit())
    return AdminUserView(
        user_id=user.id,
        name=user.name,
        nickname=user.nickname,
        role=user.role,
        signup="KAKAO" if user.kakao_id else "SEED",
        is_test_account=user.is_test_account,
        ops_tester=user.ops_tester,
        phone_last4=digits[-4:] if len(digits) >= 4 else None,
        created_at=user.created_at,
        order_count=order_count,
        farm_id=farm.id if farm else None,
        farm_name=farm.name if farm else None,
        farm_status=farm.approval_status if farm else None,
    )


@router.get("", response_model=AdminUserPage)
def list_users(
    db: Db,
    _: Admin,
    q: str = "",
    role: Annotated[str | None, Query(pattern="^(CONSUMER|PRODUCER)$")] = None,
    kind: Annotated[str | None, Query(pattern="^(test|real)$")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    """운영자 계정은 빼고 가입 최신순.

    q는 이름·닉네임·ID·농가 이름, 숫자 4자리 이상이면 전화 끝자리.
    """
    counts = _order_counts()
    stmt = (
        select(User, Farm, func.coalesce(counts.c.n, 0))
        .outerjoin(Farm, Farm.producer_id == User.id)
        .outerjoin(counts, counts.c.consumer_id == User.id)
        .where(User.role != "ADMIN")
    )
    if role:
        stmt = stmt.where(User.role == role)
    test = User.is_test_account.is_(True) | User.ops_tester.is_(True)
    if kind == "test":
        stmt = stmt.where(test)
    elif kind == "real":
        stmt = stmt.where(~test)
    q = q.strip()
    if q.isdigit() and len(q) >= 4:
        stmt = stmt.where(func.replace(User.phone, "-", "").endswith(q))
    elif q:
        stmt = stmt.where(
            or_(
                User.name.icontains(q, autoescape=True),
                User.nickname.icontains(q, autoescape=True),
                User.id.icontains(q, autoescape=True),
                Farm.name.icontains(q, autoescape=True),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(User.created_at.desc(), User.id).limit(limit)).all()
    return AdminUserPage(items=[_view(u, f, n) for u, f, n in rows], total=total)


def _mark(db: Session, admin_id: str, user_id: str, key: str | None, on: bool):
    """run_manager_action이 멱등 키 저장과 커밋, 거부(409) 감사를 맡는다."""
    if db.get(User, user_id) is None:
        raise not_found("사용자를 찾을 수 없어요.")

    def run(_: str) -> AdminUserView:
        user = db.get(User, user_id, with_for_update=True)
        if user.role == "ADMIN":
            raise conflict("ADMIN_ACCOUNT", "운영자 계정은 바꿀 수 없어요.")
        if user.is_test_account:
            raise conflict("SEED_TEST_ACCOUNT", "시드 테스트 계정이라 이미 테스트로 세요.")
        user.ops_tester = on
        db.flush()
        farm = db.scalar(select(Farm).where(Farm.producer_id == user_id))
        orders = db.scalar(select(func.count()).where(Order.consumer_id == user_id))
        return _view(user, farm, orders)

    verb = "mark" if on else "unmark"
    return run_manager_action(
        db,
        actor_id=admin_id,
        action=f"ops_tester.{verb}",
        target_type="user",
        target_id=user_id,
        scope=f"ops-tester-{verb}:{user_id}",
        key=key,
        body={},
        run=run,
    )


@router.post("/{user_id}/mark-tester", response_model=AdminUserView)
def mark_ops_tester(db: Db, admin: Admin, user_id: str, key: IdempotencyKey = None):
    return _mark(db, admin.id, user_id, key, on=True)


@router.post("/{user_id}/unmark-tester", response_model=AdminUserView)
def unmark_ops_tester(db: Db, admin: Admin, user_id: str, key: IdempotencyKey = None):
    return _mark(db, admin.id, user_id, key, on=False)
