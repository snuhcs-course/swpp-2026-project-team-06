"""공개 미디어 업로드·조회(DEV-102). 사진은 core/images로 검사하고 메타데이터를 지운다."""

from sqlalchemy.orm import Session

from app.core import images
from app.core.clock import now
from app.core.errors import forbidden, invalid, not_found
from app.core.ids import new_id
from app.farms import service as farms
from app.media.models import PublicMedia
from app.media.schemas import MediaView
from app.source_analysis.storage import Storage

# 영상 1개 60초·100MB(FQ-05). 길이는 앱이 확인한다.
VIDEO_MAX_BYTES = 100 * 1024 * 1024
READ_LIMIT = VIDEO_MAX_BYTES + 1
_IMAGE_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_VIDEO_EXT = {"video/mp4": "mp4", "video/webm": "webm"}


def _sniff_video(data: bytes) -> str | None:
    # MP4·MOV는 ISO BMFF(4~8바이트 ftyp), WebM은 EBML 헤더
    if data[4:8] == b"ftyp":
        return "video/mp4"
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "video/webm"
    return None


def url_of(media: PublicMedia) -> str:
    return f"/api/media/{media.id}.{media.ext}"


def upload(db: Session, user, data: bytes, declared: str | None) -> MediaView:
    farm = farms.get_farm_of_producer(db, user.id)
    if farm is None:
        raise forbidden("농가 신청 후 사진을 올릴 수 있어요.")
    if not data:
        raise invalid({"file": "파일을 골라 주세요"})
    video = _sniff_video(data)
    if video:
        if len(data) > VIDEO_MAX_BYTES:
            raise invalid({"file": "영상은 100MB까지예요"})
        kind, mime, cleaned = "video", video, data
    else:
        mime, cleaned = images.sanitize(data, declared)
        kind = "image"
    ext = {**_IMAGE_EXT, **_VIDEO_EXT}[mime]
    row = PublicMedia(
        id=new_id("med"),
        farm_id=farm.id,
        uploader_id=user.id,
        kind=kind,
        mime_type=mime,
        ext=ext,
        size=len(cleaned),
        storage_key=Storage().put(cleaned),
        created_at=now(),
    )
    db.add(row)
    db.flush()
    return MediaView(url=url_of(row), kind=kind, mime_type=mime, size=row.size)


def read(db: Session, name: str) -> tuple[PublicMedia, bytes]:
    media_id, _, ext = name.rpartition(".")
    media = db.get(PublicMedia, media_id) if media_id else None
    if media is None or media.ext != ext:
        raise not_found()
    return media, Storage().get(media.storage_key)
