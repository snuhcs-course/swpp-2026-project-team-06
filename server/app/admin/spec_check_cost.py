"""spec-check AI 비용(DEV-144): CI가 실행마다 보고하고, 운영자가 건별·합계로 본다.

보고(`POST /internal/spec-check-runs`)는 운영자 JWT 대신 서버 설정 `SPEC_CHECK_USAGE_TOKEN`과
같은 `X-Spec-Check-Token` 헤더로 받는다. 금액은 저장 때 아래 단가표로 계산한다
(단가표에 없는 모델은 금액 없음).
"""

import hmac
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin.models import SpecCheckRun
from app.core.clock import KST, now
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ApiError, invalid, unauthenticated
from app.core.pagination import decode_cursor, encode_cursor, page_limit
from app.core.schemas import CamelModel
from app.core.security import Admin

# 100만 토큰당 USD(입력, 출력). Anthropic 공개 단가(2026-10 기준). 모델을 바꾸면 여기에 추가한다.
PRICES: dict[str, tuple[Decimal, Decimal]] = {
    "claude-sonnet-5-5": (Decimal("2"), Decimal("10")),
    "claude-sonnet-5": (Decimal("2"), Decimal("10")),
    "claude-sonnet-4-6": (Decimal("3"), Decimal("15")),
    "claude-opus-5-5": (Decimal("4"), Decimal("20")),
    "claude-opus-5": (Decimal("5"), Decimal("25")),
    "claude-haiku-5-5": (Decimal("0.10"), Decimal("0.50")),
    "claude-haiku-4-5": (Decimal("1"), Decimal("5")),
}
MILLION = Decimal(1_000_000)

Db = Annotated[Session, Depends(get_db)]
report_router = APIRouter(prefix="/internal/spec-check-runs", tags=["internal"])
router = APIRouter(prefix="/admin/spec-check-runs", tags=["admin"])


class SpecCheckRunInput(CamelModel):
    run_key: str = Field(pattern=r"^[0-9]+-[0-9]+-[a-z-]{1,24}$", max_length=80)
    pr_number: int = Field(gt=0)
    pr_title: str = Field(default="", max_length=300)
    head_sha: str = Field(pattern=r"^[0-9a-f]{40}$")
    status: Literal["PASS", "MISMATCH", "INCOMPLETE", "SKIPPED"]
    mode: str = Field(pattern=r"^[a-z-]{1,32}$")
    model: str = Field(min_length=1, max_length=80)
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    run_url: str = Field(pattern=r"^https://github\.com/", max_length=300)
    ran_at: datetime | None = None  # 지난 실행을 채워 넣을 때(backfill)만. 없으면 받은 시각


class SpecCheckRunView(CamelModel):
    run_key: str
    pr_number: int
    pr_title: str
    head_sha: str
    status: str
    mode: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    run_url: str
    created_at: datetime


class CostTotal(CamelModel):
    runs: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    unpriced_runs: int  # 단가표에 없는 모델이라 금액에서 빠진 실행 수


class SpecCheckCostPage(CamelModel):
    items: list[SpecCheckRunView]
    next_cursor: str | None
    total: CostTotal
    this_month: CostTotal  # KST 달력 기준
    last_7_days: CostTotal


def cost_of(model: str, input_tokens: int, output_tokens: int) -> Decimal | None:
    price = PRICES.get(model)
    if price is None:
        return None
    return (input_tokens * price[0] + output_tokens * price[1]) / MILLION


def view(run: SpecCheckRun) -> SpecCheckRunView:
    return SpecCheckRunView(
        run_key=run.id,
        pr_number=run.pr_number,
        pr_title=run.pr_title,
        head_sha=run.head_sha,
        status=run.status,
        mode=run.mode,
        model=run.model,
        input_tokens=run.input_tokens,
        output_tokens=run.output_tokens,
        cost_usd=None if run.cost_usd is None else float(run.cost_usd),
        run_url=run.run_url,
        created_at=run.created_at,
    )


def total(db: Session, since: datetime | None = None) -> CostTotal:
    query = select(
        func.count(SpecCheckRun.id),
        func.coalesce(func.sum(SpecCheckRun.input_tokens), 0),
        func.coalesce(func.sum(SpecCheckRun.output_tokens), 0),
        func.coalesce(func.sum(SpecCheckRun.cost_usd), 0),
        func.count(SpecCheckRun.id).filter(SpecCheckRun.cost_usd.is_(None)),
    )
    if since is not None:
        query = query.where(SpecCheckRun.created_at >= since)
    runs, tokens_in, tokens_out, cost, unpriced = db.execute(query).one()
    return CostTotal(
        runs=runs,
        input_tokens=tokens_in,
        output_tokens=tokens_out,
        cost_usd=float(cost),
        unpriced_runs=unpriced,
    )


def ran_at(value: datetime | None) -> datetime:
    current = now()
    if value is None:
        return current
    if value.tzinfo is None or not current - timedelta(days=90) <= value <= current:
        raise invalid({"ranAt": "최근 90일 안의 시각(시간대 포함)이어야 해요"})
    return value


@report_router.post("", response_model=SpecCheckRunView)
def report_run(
    db: Db,
    body: SpecCheckRunInput,
    token: Annotated[str | None, Header(alias="X-Spec-Check-Token")] = None,
):
    """spec-check 한 실행의 사용량 보고(CI 전용). 같은 실행 키는 처음 기록을 그대로 돌려준다."""
    expected = get_settings().spec_check_usage_token
    if not expected:
        raise ApiError(503, "NOT_CONFIGURED", "비용 보고 토큰이 서버에 설정되지 않았어요.")
    if not token or not hmac.compare_digest(token.encode(), expected.encode()):
        raise unauthenticated("비용 보고 토큰이 맞지 않아요.")
    existing = db.get(SpecCheckRun, body.run_key)
    if existing is not None:
        return view(existing)
    run = SpecCheckRun(
        id=body.run_key,
        pr_number=body.pr_number,
        pr_title=body.pr_title,
        head_sha=body.head_sha,
        status=body.status,
        mode=body.mode,
        model=body.model,
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        cost_usd=cost_of(body.model, body.input_tokens, body.output_tokens),
        run_url=body.run_url,
        created_at=ran_at(body.ran_at),
    )
    db.add(run)
    db.commit()
    return view(run)


@router.get("", response_model=SpecCheckCostPage)
def list_runs(
    db: Db,
    _: Admin,
    limit: Annotated[int, Depends(page_limit)],
    cursor: str | None = None,
):
    """spec-check 실행별 비용(최신순)과 합계(전체·이번 달 KST·최근 7일)."""
    offset = int((decode_cursor(cursor) or [0])[0])
    rows = db.scalars(
        select(SpecCheckRun)
        .order_by(SpecCheckRun.created_at.desc(), SpecCheckRun.id.desc())
        .offset(offset)
        .limit(limit + 1)
    ).all()
    current = now().astimezone(KST)
    month_start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return SpecCheckCostPage(
        items=[view(r) for r in rows[:limit]],
        next_cursor=encode_cursor([offset + limit]) if len(rows) > limit else None,
        total=total(db),
        this_month=total(db, month_start),
        last_7_days=total(db, current - timedelta(days=7)),
    )
