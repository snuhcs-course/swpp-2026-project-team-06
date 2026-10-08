"""messaging 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.pagination import decode_cursor, encode_cursor
from app.core.schemas import Paged
from app.messaging.models import Broadcast, Reaction
from app.messaging.schemas import NewsItem


def _items(db: Session, rows: list[Broadcast], farm, user_id: str | None) -> list[NewsItem]:
    mine: set[str] = set()
    if user_id and rows:
        mine = set(
            db.scalars(
                select(Reaction.broadcast_id).where(
                    Reaction.user_id == user_id,
                    Reaction.broadcast_id.in_([b.id for b in rows]),
                )
            )
        )
    return [
        NewsItem(
            broadcast_id=b.id,
            farm_id=b.farm_id,
            farm_name=farm.name,
            farm_photo=farm.photo,
            created_at=b.created_at,
            body=b.body,
            photos=b.photos,
            visibility=b.visibility,
            reaction_count=b.reaction_count,
            my_reaction=b.id in mine,
        )
        for b in rows
    ]


def farm_public_news(
    db: Session, farm, user_id: str | None, cursor: str | None, limit: int
) -> Paged[NewsItem]:
    """농가의 공개 소식(M-14, AC-15-1). 최신순, cursor = (createdAt, id)."""
    query = select(Broadcast).where(Broadcast.farm_id == farm.id, Broadcast.visibility == "PUBLIC")
    after = decode_cursor(cursor)
    if after:
        at, bid = datetime.fromisoformat(after[0]), after[1]
        query = query.where(
            or_(Broadcast.created_at < at, and_(Broadcast.created_at == at, Broadcast.id < bid))
        )
    query = query.order_by(Broadcast.created_at.desc(), Broadcast.id.desc()).limit(limit + 1)
    rows = list(db.scalars(query))
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor([rows[-1].created_at.isoformat(), rows[-1].id])
    return Paged[NewsItem](items=_items(db, rows, farm, user_id), next_cursor=next_cursor)


def latest_public_news(db: Session, farm, user_id: str | None) -> NewsItem | None:
    page = farm_public_news(db, farm, user_id, None, 1)
    return page.items[0] if page.items else None
