from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.detail import DetailDraft, DetailDraftInput
from app.core.idempotency import run_idempotent
from app.core.pagination import decode_cursor, encode_cursor, page_limit
from app.core.schemas import Paged
from app.core.security import ApprovedProducer, Consumer, OnboardedConsumer, OptionalUser, Producer
from app.farms import service
from app.farms.schemas import (
    AiPreview,
    AiPreviewInput,
    AiSettings,
    FarmCard,
    FarmDetail,
    FarmPatch,
    FarmSummary,
    FollowState,
    Home,
    MyFarm,
)
from app.farms.share import farm_share_url

router = APIRouter(prefix="/farms", tags=["farms"])
home_router = APIRouter(tags=["farms"])

Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]
Limit = Annotated[int, Depends(page_limit)]


def _page(items: list, cursor: str | None, limit: int) -> Paged:
    """offset cursor(screens.md 7.1). orders 라우터와 같은 방식."""
    offset = int((decode_cursor(cursor) or [0])[0])
    page = items[offset : offset + limit]
    next_cursor = encode_cursor([offset + limit]) if offset + limit < len(items) else None
    return Paged(items=page, next_cursor=next_cursor)


def with_share_url(view: MyFarm | FarmDetail, request: Request):
    if view.share_url:
        view.share_url = farm_share_url(request, view.farm_id)
    return view


@home_router.get("/home", response_model=Home)
def home(db: Db):
    """홈·발견(SCR-01, FEAT-06)."""
    return service.home(db)


# ---------------- 농가 AI 응답 설정 (SCR-31, FEAT-32) ----------------


@router.get("/me/ai-settings", response_model=AiSettings)
def get_ai_settings(db: Db, producer: ApprovedProducer):
    _, farm = producer
    return service.ai_settings_view(service.ai_settings(db, farm.id))


@router.put("/me/ai-settings", response_model=AiSettings)
def save_ai_settings(
    db: Db, producer: ApprovedProducer, body: AiSettings, key: IdempotencyKey = None
):
    """현재 version을 함께 보낸다. 오래된 버전이면 409 STALE_VERSION."""
    user, farm = producer
    return run_idempotent(
        db,
        user.id,
        "ai-settings",
        key,
        body,
        lambda: service.save_ai_settings(db, farm, user.id, body),
    )


@router.post("/me/ai-settings/preview", response_model=AiPreview)
def preview_ai(db: Db, producer: ApprovedProducer, body: AiPreviewInput):
    """저장 없이 답·근거·전달 사유를 보여준다. settings를 주면 임시 값(settingsVersion=null)."""
    _, farm = producer
    return service.preview_ai(db, farm, body)


# ---------------- 내 농가 상세 (FEAT-02·03) ----------------


@router.post("/me/detail-draft", response_model=DetailDraft)
def farm_detail_draft(_: Db, producer: ApprovedProducer, body: DetailDraftInput):
    _, farm = producer
    return service.create_detail_draft(farm, body)


@router.get("/me", response_model=MyFarm)
def my_farm(db: Db, user: Producer, request: Request):
    return with_share_url(service.my_farm(db, user.id), request)


@router.patch("/me", response_model=MyFarm)
def patch_my_farm(db: Db, user: Producer, body: FarmPatch, request: Request):
    result = service.patch_my_farm(db, user.id, body)
    db.commit()
    return with_share_url(result, request)


# 고정 경로는 /{farm_id} 보다 앞에 둔다(screens.md 7.1 경로 순서)
@router.get("", response_model=Paged[FarmCard])
def list_farms(db: Db, limit: Limit, q: str | None = None, cursor: str | None = None):
    """농가 목록·검색(SCR-02, FEAT-06). 지금 단계가 가장 일찍 끝나는 농가가 위."""
    return _page(service.search_farms(db, q), cursor, limit)


@router.get("/following", response_model=Paged[FarmSummary])
def following(db: Db, user: Consumer, limit: Limit, cursor: str | None = None):
    """팔로우한 농가 목록(SCR-17, AC-06-3). 소비자만."""
    return _page(service.following_farms(db, user.id), cursor, limit)


@router.get("/{farm_id}", response_model=FarmDetail)
def farm_detail(db: Db, farm_id: str, user: OptionalUser, request: Request):
    """농가 페이지(SCR-03). 승인된 농가만, 아니면 404."""
    return with_share_url(service.farm_detail(db, farm_id, user), request)


@router.put("/{farm_id}/follow", response_model=FollowState)
def follow(db: Db, farm_id: str, user: OnboardedConsumer):
    state = service.set_follow(db, user.id, farm_id, True)
    db.commit()
    return state


@router.delete("/{farm_id}/follow", response_model=FollowState)
def unfollow(db: Db, farm_id: str, user: Consumer):
    state = service.set_follow(db, user.id, farm_id, False)
    db.commit()
    return state
