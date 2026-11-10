"""관리자 홈 할 일 건수 `GET /admin/home`(DEV-307, FEAT-23 AC-23-11). 메뉴 배지에도 쓴다.

정의는 각 목록 API와 같다. 가입 신청·공급 물량·문의는 계정 필터(kind, 기본 real)를 따르고,
열린 예외와 입금 기한 지남은 운영 대상 전체를 센다.
- 가입 신청 대기: GET /admin/producers?status=PENDING
- 공급 물량 대기: GET /admin/capacity-requests?status=PENDING
- 답변 대기 문의: GET /admin/support 중 waiting
- 열린 예외: GET /admin/exceptions 기본 목록(OPEN·FAILED)
- 입금 기한 지남: GET /admin/orders/deposit-overdue(입금했어요 + 기한 지남)
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.accounts import service as accounts
from app.accounts.schemas import KindFilter
from app.admin.models import ManagerEvent
from app.admin.support import filter_by_kind
from app.catalog import service as catalog
from app.core.db import get_db
from app.core.schemas import CamelModel
from app.core.security import Admin
from app.messaging import support
from app.orders import service as orders

router = APIRouter(prefix="/admin/home", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]


class HomeCounts(CamelModel):
    kind: KindFilter
    pending_applications: int
    pending_capacity_requests: int
    waiting_support_threads: int
    open_exceptions: int
    overdue_deposits: int


@router.get("", response_model=HomeCounts)
def home_counts(db: Db, _: Admin, kind: Annotated[KindFilter, Query()] = "real"):
    threads = filter_by_kind(support.inbox(db), kind)
    return HomeCounts(
        kind=kind,
        pending_applications=len(accounts.list_producer_applications(db, "PENDING", kind)),
        pending_capacity_requests=len(catalog.list_capacity_requests(db, "PENDING", kind)),
        waiting_support_threads=sum(1 for t in threads if t["waiting"]),
        open_exceptions=db.scalar(
            select(func.count()).where(ManagerEvent.status.in_(("OPEN", "FAILED")))
        ),
        overdue_deposits=len(orders.reported_overdue_deposits(db)),
    )
