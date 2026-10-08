"""messaging 모듈 SQLAlchemy 모델. 1.1 Must 범위(농가 공개 소식)만 둔다. 채팅은 후속 이슈."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Broadcast(Base):
    """화면 이름은 '소식'. visibility는 PUBLIC · FOLLOWERS(M-14)."""

    __tablename__ = "broadcasts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    body: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list[str]] = mapped_column(JSON, default=list)
    visibility: Mapped[str] = mapped_column(String(16))
    # 좋아요 수. 좋아요 켬·끔 때 같은 트랜잭션에서 바꾼다.
    reaction_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Reaction(Base):
    """좋아요. 한 사람이 한 소식에 한 번(FEAT-15)."""

    __tablename__ = "reactions"

    broadcast_id: Mapped[str] = mapped_column(ForeignKey("broadcasts.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
