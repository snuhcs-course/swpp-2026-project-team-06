import re
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import Producer
from app.media import service
from app.media.schemas import MediaView

router = APIRouter(prefix="/media", tags=["media"])

Db = Annotated[Session, Depends(get_db)]
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


@router.post("", response_model=MediaView, status_code=201)
def upload_media(db: Db, user: Producer, file: Annotated[UploadFile, File()]):
    """multipart(file). 사진 JPEG·PNG·WebP 10MB(EXIF 제거), 영상 MP4·WebM 100MB(FQ-05).

    저장소 쓰기(R2)가 오래 걸리므로 동기 함수로 두어 스레드풀에서 돈다.
    """
    data = file.file.read(service.READ_LIMIT)
    view = service.upload(db, user, data, file.content_type)
    db.commit()
    return view


def _span(header: str | None, total: int) -> tuple[int, int] | None:
    """`bytes=a-b` 하나만 지원한다. 맞지 않는 Range는 무시하고 전체를 보낸다."""
    match = _RANGE.fullmatch(header or "")
    if not match or not total or match.groups() == ("", ""):
        return None
    first, last = match.groups()
    if first:
        start, end = int(first), min(int(last), total - 1) if last else total - 1
    else:
        start, end = max(total - int(last), 0), total - 1
    return (start, end) if start <= end else None


@router.get("/{name}", response_class=Response)
def read_media(db: Db, name: str, range: Annotated[str | None, Header()] = None):
    """인증 없이 본다. 같은 주소의 내용은 바뀌지 않으므로 오래 캐시한다.

    영상은 Range(206)를 지원해야 iOS Safari가 재생한다.
    """
    media, data = service.read(db, name)
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
    }
    span = _span(range, len(data))
    if span is None:
        return Response(data, media_type=media.mime_type, headers=headers)
    start, end = span
    headers["Content-Range"] = f"bytes {start}-{end}/{len(data)}"
    return Response(
        data[start : end + 1], status_code=206, media_type=media.mime_type, headers=headers
    )
