"""media 모듈 SQLAlchemy 모델. 농가 프로필·상품·소식·상세의 공개 사진과 영상(DEV-102)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PublicMedia(Base):
    """누구나 보는 미디어. 바이트는 저장소(R2)에 두고 이 행은 키와 형식만 가진다.

    비공개 사진(messaging.PrivateAttachment)과 섞지 않는다.
    """

    __tablename__ = "public_media"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    # image · video
    kind: Mapped[str] = mapped_column(String(16))
    mime_type: Mapped[str] = mapped_column(String(32))
    ext: Mapped[str] = mapped_column(String(8))
    size: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
