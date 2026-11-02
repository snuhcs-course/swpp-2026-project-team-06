"""AI 비용 기록과 조회(DEV-144). 기능별로 모으고 운영자는 기능별·전체 합계와 호출 목록을 본다.

- 서버 안 호출(상품 초안·상세 초안·AI 답변)은 `record_call`, 자료 분석은 `record_source_spend`가
  남긴다. 기록 실패는 원래 기능에 영향을 주지 않는다.
- CI의 spec-check는 운영자 JWT 대신 서버 설정 `SPEC_CHECK_USAGE_TOKEN`과 같은
  `X-Spec-Check-Token`으로 `POST /internal/spec-check-runs`에 보고한다.
  같은 실행 키는 처음 기록을 그대로 둔다.
- 금액: Anthropic 모델은 저장 때 아래 단가표로 계산하고, 자료 분석은 제공자가 돌려준 금액을 쓴다.
  둘 다 없으면 금액 없음(합계에서 따로 센다).
"""

import hmac
import logging
import math
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin.models import AiUsage
from app.core.clock import KST, now
from app.core.config import get_settings
from app.core.db import get_db, get_sessionmaker
from app.core.errors import ApiError, invalid, unauthenticated
from app.core.pagination import decode_cursor, encode_cursor, page_limit
from app.core.schemas import CamelModel
from app.core.security import Admin

log = logging.getLogger(__name__)

# 기능 키 → 화면 이름은 관리자 페이지(ai-cost.html)가 붙인다. 순서는 화면 표 순서.
FEATURES = ("spec_check", "product_draft", "detail_draft", "ai_answer", "source_analysis")
Feature = Literal["spec_check", "product_draft", "detail_draft", "ai_answer", "source_analysis"]

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
router = APIRouter(prefix="/admin/ai-usage", tags=["admin"])


def cost_of(model: str, input_tokens: int, output_tokens: int) -> Decimal | None:
    price = PRICES.get(model)
    if price is None:
        return None
    return (input_tokens * price[0] + output_tokens * price[1]) / MILLION


def record_call(feature: Feature, model: str, usage: object) -> None:
    """서버 안 Anthropic 호출 한 번을 기록한다. usage가 없거나 기록이 실패해도 조용히 넘어간다."""
    tokens_in = getattr(usage, "input_tokens", None)
    tokens_out = getattr(usage, "output_tokens", None)
    if not isinstance(tokens_in, int) or not isinstance(tokens_out, int):
        return
    try:
        with get_sessionmaker()() as session:
            session.add(
                AiUsage(
                    id=f"{feature}:{uuid.uuid4().hex}",
                    feature=feature,
                    model=model,
                    input_tokens=tokens_in,
                    output_tokens=tokens_out,
                    cost_usd=cost_of(model, tokens_in, tokens_out),
                    created_at=now(),
                )
            )
            session.commit()
    except Exception:  # noqa: BLE001  비용 기록 실패가 상품 초안·답변을 막지 않는다
        log.warning("AI 비용 기록 실패(%s)", feature, exc_info=True)


def record_source_spend(db: Session, reservation_id: str, usage: dict) -> None:
    """자료 분석 호출 한 번(예약 ID 기준 한 번만). 금액은 제공자가 준 `cost`(USD)를 쓴다."""
    key = f"source_analysis:{reservation_id}"[:80]
    if db.get(AiUsage, key) is not None:
        return
    cost = usage.get("cost")
    priced = isinstance(cost, (int, float)) and math.isfinite(cost) and cost >= 0
    db.add(
        AiUsage(
            id=key,
            feature="source_analysis",
            model=str(usage.get("model") or "")[:80],
            input_tokens=int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
            cost_usd=Decimal(str(cost)) if priced else None,
            created_at=now(),
        )
    )
    db.flush()  # 같은 트랜잭션 안에서 다시 settle돼도 한 번만


class SpecCheckRunInput(CamelModel):
    run_key: str = Field(pattern=r"^[0-9]+-[0-9]+-[a-z-]{1,24}$", max_length=60)
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


class AiUsageView(CamelModel):
    id: str
    feature: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    status: str
    ref: str
    title: str
    link: str
    created_at: datetime


class CostTotal(CamelModel):
    calls: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    unpriced_calls: int  # 금액을 모르는 호출 수(합계 금액에서 빠짐)


class Period(CamelModel):
    this_month: CostTotal  # KST 달력 기준
    last_7_days: CostTotal
    total: CostTotal


class FeatureCost(Period):
    feature: str


class AiUsagePage(CamelModel):
    features: list[FeatureCost]  # FEATURES 순서, 기록이 없어도 0으로
    overall: Period
    items: list[AiUsageView]
    next_cursor: str | None


def view(row: AiUsage) -> AiUsageView:
    return AiUsageView(
        id=row.id,
        feature=row.feature,
        model=row.model,
        input_tokens=row.input_tokens,
        output_tokens=row.output_tokens,
        cost_usd=None if row.cost_usd is None else float(row.cost_usd),
        status=row.status,
        ref=row.ref,
        title=row.title,
        link=row.link,
        created_at=row.created_at,
    )


def totals(db: Session, since: datetime | None) -> dict[str, CostTotal]:
    """기능별 합계. 키 None은 전체."""
    query = select(
        AiUsage.feature,
        func.count(AiUsage.id),
        func.coalesce(func.sum(AiUsage.input_tokens), 0),
        func.coalesce(func.sum(AiUsage.output_tokens), 0),
        func.coalesce(func.sum(AiUsage.cost_usd), 0),
        func.count(AiUsage.id).filter(AiUsage.cost_usd.is_(None)),
    ).group_by(AiUsage.feature)
    if since is not None:
        query = query.where(AiUsage.created_at >= since)
    result: dict = {f: [0, 0, 0, Decimal(0), 0] for f in (*FEATURES, None)}
    for feature, *values in db.execute(query):
        for key in (feature, None):
            bucket = result.setdefault(key, [0, 0, 0, Decimal(0), 0])
            for i, v in enumerate(values):
                bucket[i] += v
    return {
        k: CostTotal(
            calls=v[0],
            input_tokens=v[1],
            output_tokens=v[2],
            cost_usd=float(v[3]),
            unpriced_calls=v[4],
        )
        for k, v in result.items()
    }


@report_router.post("", response_model=AiUsageView)
def report_spec_check_run(
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
    key = f"spec_check:{body.run_key}"
    existing = db.get(AiUsage, key)
    if existing is not None:
        return view(existing)
    current = now()
    if body.ran_at is not None and (
        body.ran_at.tzinfo is None or not current - timedelta(days=90) <= body.ran_at <= current
    ):
        raise invalid({"ranAt": "최근 90일 안의 시각(시간대 포함)이어야 해요"})
    demo = "" if body.mode == "pr" else "[데모] "
    row = AiUsage(
        id=key,
        feature="spec_check",
        model=body.model,
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        cost_usd=cost_of(body.model, body.input_tokens, body.output_tokens),
        status=body.status,
        ref=f"#{body.pr_number}",
        title=demo + body.pr_title,
        link=body.run_url,
        created_at=body.ran_at or current,
    )
    db.add(row)
    db.commit()
    return view(row)


@router.get("", response_model=AiUsagePage)
def list_usage(
    db: Db,
    _: Admin,
    limit: Annotated[int, Depends(page_limit)],
    feature: Annotated[Feature | None, Query()] = None,
    cursor: str | None = None,
):
    """기능별·전체 합계(이번 달 KST·최근 7일·전체)와 호출 목록(최신순, feature로 거름)."""
    current = now().astimezone(KST)
    month = totals(db, current.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
    week = totals(db, current - timedelta(days=7))
    every = totals(db, None)
    offset = int((decode_cursor(cursor) or [0])[0])
    query = select(AiUsage).order_by(AiUsage.created_at.desc(), AiUsage.id.desc())
    if feature is not None:
        query = query.where(AiUsage.feature == feature)
    rows = db.scalars(query.offset(offset).limit(limit + 1)).all()
    return AiUsagePage(
        features=[
            FeatureCost(feature=f, this_month=month[f], last_7_days=week[f], total=every[f])
            for f in FEATURES
        ],
        overall=Period(this_month=month[None], last_7_days=week[None], total=every[None]),
        items=[view(r) for r in rows[:limit]],
        next_cursor=encode_cursor([offset + limit]) if len(rows) > limit else None,
    )
