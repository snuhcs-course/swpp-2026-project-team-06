from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import Consumer, OptionalUser
from app.farms import service
from app.farms.schemas import FarmDetail, FollowState, Home

router = APIRouter(prefix="/farms", tags=["farms"])
home_router = APIRouter(tags=["farms"])

Db = Annotated[Session, Depends(get_db)]


@home_router.get("/home", response_model=Home)
def home(db: Db):
    """홈·발견(SCR-01, FEAT-06)."""
    return service.home(db)


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
