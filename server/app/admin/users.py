"""관리자 페이지 사용자 목록·검색과 운영 검증 계정 표시(DEV-107).

카카오로 가입한 팀원·운영 검증 계정은 시드 테스트 계정(is_test_account)이 아니라서 테스트 농가
숨기기(DEV-93·98)가 실사용자 주문으로 거부한다. 운영자가 ops_tester를 켜면 그 계정의 주문은
테스트로 센다. 공개 범위(R-29, DEV-472)에서도 테스트 계정이라, 켠 생산자의 농가는 일반 사용자에게
숨고 켠 소비자는 테스트 농가를 본다. is_test_account(Mock 로그인 대상, 온보딩 생략)는 바꾸지 않는다.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.accounts import service as accounts
from app.accounts.models import User
from app.accounts.schemas import IdCredentialsProvisionInput, KindFilter, TemporaryPasswordView
from app.accounts.service import account_kind, kind_clause
from app.admin.models import ManagerEvent
from app.admin.schemas import AdminUserPage, AdminUserView
from app.admin.service import run_manager_action
from app.core.clock import now
from app.core.db import get_db
from app.core.errors import conflict, not_found
from app.core.ids import new_id
from app.core.security import Admin
from app.farms.models import Farm
from app.orders.models import Order

router = APIRouter(prefix="/admin/users", tags=["admin"])
logger = logging.getLogger(__name__)
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
        signup="PASSWORD" if user.username else "KAKAO" if user.kakao_id else "SEED",
        username=user.username,
        is_test_account=user.is_test_account,
        ops_tester=user.ops_tester,
        account_kind=account_kind(user),
        withdrawn=user.deleted_at is not None,
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
    kind: Annotated[KindFilter, Query()] = "real",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    """운영자 계정은 빼고 가입 최신순.

    q는 이름·닉네임·ID·농가 이름, 숫자 4자리 이상이면 전화 끝자리.
    kind는 계정 필터(DEV-307): 기본 real(시드 테스트·운영 검증 계정 제외), test, all.
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
    clause = kind_clause(kind)
    if clause is not None:
        stmt = stmt.where(clause)
    q = q.strip()
    if q.isdigit() and len(q) >= 4:
        stmt = stmt.where(func.replace(User.phone, "-", "").endswith(q))
    elif q:
        stmt = stmt.where(
            or_(
                User.name.icontains(q, autoescape=True),
                User.nickname.icontains(q, autoescape=True),
                User.id.icontains(q, autoescape=True),
                User.username.icontains(q, autoescape=True),
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


@router.post("/{user_id}/temporary-password", response_model=TemporaryPasswordView)
def issue_temporary_password(db: Db, admin: Admin, user_id: str, response: Response):
    """임시 비밀번호 발급(DEV-363, AC-01-31). 아이디 계정만, 평문은 이 응답에 한 번만 나간다.

    멱등 기록(`idempotency_records.response`)에 평문이 남지 않게 `run_manager_action`을 쓰지 않고,
    같은 꼴의 감사 행(`user.temporary_password`, 결과 `{status: ISSUED}`)만 직접 남긴다.
    다시 누르면 새 임시 비밀번호가 나가고 앞의 것은 못 쓴다.
    """
    user = db.get(User, user_id, with_for_update=True)
    if user is None:
        raise not_found("사용자를 찾을 수 없어요.")
    value = accounts.issue_temporary_password(db, user)
    event_id = new_id("manager-event")
    at = now()
    db.add(
        ManagerEvent(
            id=event_id,
            event_type="user.temporary_password",
            actor_id=admin.id,
            target_type="user",
            target_id=user_id,
            scope=f"temporary-password:{user_id}",
            idempotency_key=f"issued:{event_id}",
            original_body={},
            request_summary={},
            status="SUCCEEDED",
            retryable=False,
            attempts=1,
            result={"status": "ISSUED"},
            created_at=at,
            updated_at=at,
        )
    )
    db.commit()
    view = TemporaryPasswordView(user_id=user.id, username=user.username, temporary_password=value)
    try:
        accounts.unlock_login(user.role, user.username)
    except Exception:  # noqa: BLE001 - 잠금 해제 실패로 이미 바뀐 비밀번호를 잃지 않게
        logger.warning("temporary password issued but login unlock failed for %s", user_id)
    response.headers["Cache-Control"] = "no-store"
    return view


@router.post("/{user_id}/id-credentials", response_model=TemporaryPasswordView)
def provision_id_credentials(
    db: Db,
    admin: Admin,
    user_id: str,
    body: IdCredentialsProvisionInput,
    response: Response,
):
    """기존 테스트 생산자에 ID 로그인을 설정한다(DEV-439).

    응답 비밀번호는 이번 응답에서만 반환한다. 감사 행은 행위자·대상·결과만 기록하고,
    멱등 저장소는 사용하지 않는다. 이미 설정된 계정은 409라 재시도로 비밀을 잃거나
    계정을 중복 생성하지 않는다.
    """
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise not_found("사용자를 찾을 수 없어요.")
    if db.scalar(select(Farm.id).where(Farm.producer_id == user.id)) is None:
        raise conflict(
            "NOT_ELIGIBLE_PRODUCER",
            "연결된 농가가 있는 생산자 계정만 설정할 수 있어요.",
        )

    value = accounts.provision_id_credentials(db, user, body.username)
    event_id = new_id("manager-event")
    at = now()
    db.add(
        ManagerEvent(
            id=event_id,
            event_type="user.id_credentials_provisioned",
            actor_id=admin.id,
            target_type="user",
            target_id=user_id,
            scope=f"id-credentials:{user_id}",
            idempotency_key=f"issued:{event_id}",
            original_body={},
            request_summary={},
            status="SUCCEEDED",
            retryable=False,
            attempts=1,
            result={"status": "ISSUED"},
            created_at=at,
            updated_at=at,
        )
    )
    db.commit()
    try:
        accounts.unlock_login(user.role, user.username)
    except Exception:  # noqa: BLE001 - 자격 증명 발급은 커밋됐으므로 발급 응답을 보존한다
        logger.warning("ID credential provisioned but login unlock failed for %s", user_id)
    response.headers["Cache-Control"] = "no-store"
    return TemporaryPasswordView(
        user_id=user.id,
        username=user.username,
        temporary_password=value,
    )
