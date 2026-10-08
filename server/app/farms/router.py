from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.idempotency import run_idempotent
from app.core.security import ApprovedProducer, Consumer, OptionalUser
from app.farms import service
from app.farms.schemas import AiPreview, AiPreviewInput, AiSettings, FarmDetail, FollowState, Home

router = APIRouter(prefix="/farms", tags=["farms"])
home_router = APIRouter(tags=["farms"])

Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


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


@router.get("/{farm_id}", response_model=FarmDetail)
def farm_detail(db: Db, farm_id: str, user: OptionalUser):
    """농가 페이지(SCR-03). 승인된 농가만, 아니면 404."""
    return service.farm_detail(db, farm_id, user)


@router.put("/{farm_id}/follow", response_model=FollowState)
def follow(db: Db, farm_id: str, user: Consumer):
    state = service.set_follow(db, user.id, farm_id, True)
    db.commit()
    return state


@router.delete("/{farm_id}/follow", response_model=FollowState)
def unfollow(db: Db, farm_id: str, user: Consumer):
    state = service.set_follow(db, user.id, farm_id, False)
    db.commit()
    return state
