from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import Producer
from app.media import service
from app.media.schemas import MediaView

router = APIRouter(prefix="/media", tags=["media"])

Db = Annotated[Session, Depends(get_db)]


@router.post("", response_model=MediaView, status_code=201)
async def upload_media(db: Db, user: Producer, file: Annotated[UploadFile, File()]):
    """multipart(file). 사진 JPEG·PNG·WebP 10MB(EXIF 제거), 영상 MP4·WebM 100MB(FQ-05)."""
    data = await file.read(service.READ_LIMIT)
    view = service.upload(db, user, data, file.content_type)
    db.commit()
    return view


@router.get("/{name}", response_class=Response)
def read_media(db: Db, name: str):
    """인증 없이 본다. 같은 주소의 내용은 바뀌지 않으므로 오래 캐시한다."""
    media, data = service.read(db, name)
    return Response(
        data,
        media_type=media.mime_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
