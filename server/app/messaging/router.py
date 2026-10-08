from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import not_found
from app.core.pagination import page_limit
from app.core.schemas import Paged
from app.core.security import OptionalUser
from app.farms import service as farms
from app.messaging import service
from app.messaging.schemas import NewsItem

router = APIRouter(prefix="/messaging", tags=["messaging"])

Db = Annotated[Session, Depends(get_db)]


@router.get("/farms/{farm_id}/news", response_model=Paged[NewsItem])
def farm_news(
    db: Db,
    farm_id: str,
    user: OptionalUser,
    limit: Annotated[int, Depends(page_limit)],
    cursor: str | None = None,
):
    """농가 공개 소식(FEAT-15). 로그인한 소비자면 내 좋아요를 표시한다."""
    farm = farms.get_approved_farm(db, farm_id)
    if farm is None:
        raise not_found("찾을 수 없는 농가예요.")
    return service.farm_public_news(db, farm, user.id if user else None, cursor, limit)
