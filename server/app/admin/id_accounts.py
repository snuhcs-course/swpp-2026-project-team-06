"""운영자가 만드는 아이디 계정(DEV-363, PM 결정 11/18).

공개 아이디 가입은 없다. 일반 사용자는 카카오로 가입하고, 아이디·비밀번호 계정은
원스토어 심사·UAT용으로 운영자가 여기서 만든다. 서버가 임시 비밀번호를 만들어 응답에
한 번만 주고(해시만 저장), 첫 로그인에서 비밀번호를 바꾸고 필수 약관에 동의해야 쓴다.

만들기는 다른 운영자 작업처럼 `run_manager_action`(멱등 키·감사 행)으로 한다.
멱등 기록·감사에는 평문이 남지 않게 `run`의 결과에는 비밀번호를 넣지 않고, 이번 요청에서
실제로 만든 경우에만 응답에 붙인다. 같은 키로 다시 보내면(재시도) 계정은 그대로이고
비밀번호는 비어 있다 — 사용자 목록의 ‘임시 비밀번호’로 다시 발급한다.
"""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.accounts import service as accounts
from app.accounts.models import User
from app.accounts.schemas import App, IdAccountCreated, IdAccountInput, IdAccountView
from app.admin.service import run_manager_action
from app.core.db import get_db
from app.core.security import Admin
from app.farms.models import Farm

router = APIRouter(prefix="/admin/id-accounts", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


def _view(db: Session, user: User, farm: Farm | None) -> IdAccountView:
    digits = "".join(c for c in user.phone or "" if c.isdigit())
    return IdAccountView(
        user_id=user.id,
        role=user.role,
        username=user.username or "",
        nickname=user.nickname,
        name=user.name,
        phone_last4=digits[-4:] if len(digits) >= 4 else None,
        must_change_password=bool(user.must_change_password),
        consented=not accounts.consent_required(db, user),
        farm_status=farm.approval_status if farm else None,
        created_at=user.created_at,
        withdrawn=user.deleted_at is not None,
        account_kind=accounts.account_kind(user),
    )


@router.get("", response_model=list[IdAccountView])
def list_id_accounts(
    db: Db,
    _: Admin,
    app: Annotated[App | None, Query()] = None,
    q: str = "",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
):
    """아이디 계정 목록(최근 만든 순). 탈퇴한 계정은 아이디가 지워져 목록에 없다."""
    stmt = (
        select(User, Farm)
        .outerjoin(Farm, Farm.producer_id == User.id)
        .where(User.username.is_not(None))
    )
    if app:
        stmt = stmt.where(User.role == accounts.APP_ROLE[app])
    q = q.strip()
    if q:
        stmt = stmt.where(
            or_(
                User.username.icontains(q.lower(), autoescape=True),
                User.nickname.icontains(q, autoescape=True),
                User.name.icontains(q, autoescape=True),
                func.replace(User.phone, "-", "").endswith(q),
            )
        )
    rows = db.execute(stmt.order_by(User.created_at.desc(), User.id).limit(limit)).all()
    return [_view(db, u, f) for u, f in rows]


@router.post("", response_model=IdAccountCreated)
def create_id_account(
    db: Db, admin: Admin, body: IdAccountInput, response: Response, key: IdempotencyKey = None
):
    """아이디 계정 만들기(AC-01-22). 응답의 `temporaryPassword`는 한 번만 보인다(`no-store`)."""
    issued: dict[str, str] = {}

    def run(_: str) -> IdAccountCreated:
        user, value = accounts.create_id_account(db, body)
        issue_id = secrets.token_hex(8)
        issued[issue_id] = value
        # 결과(멱등 기록·감사 요약에 남음)에는 비밀번호를 넣지 않는다
        return IdAccountCreated(**_view(db, user, None).model_dump(), issue_id=issue_id)

    raw = body.model_dump(by_alias=True)
    result = run_manager_action(
        db,
        actor_id=admin.id,
        action="id_account.create",
        target_type="user",
        target_id=f"{body.app}:{accounts.passwords.normalize_username(body.username)}"[:160],
        scope="id-account-create",
        key=key,
        body=raw,
        run=run,
    )
    response.headers["Cache-Control"] = "no-store"
    created = IdAccountCreated.model_validate(result)
    created.temporary_password = issued.get(created.issue_id)
    return created
