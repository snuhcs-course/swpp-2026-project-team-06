"""messaging 모듈 Pydantic 입출력 스키마 (screens.md 7.2 messaging)."""

from datetime import datetime
from typing import Literal

from app.core.schemas import CamelModel


class NewsItem(CamelModel):
    broadcast_id: str
    farm_id: str
    farm_name: str
    farm_photo: str | None
    created_at: datetime
    body: str
    photos: list[str]
    visibility: Literal["PUBLIC", "FOLLOWERS"]
    reaction_count: int
    my_reaction: bool
