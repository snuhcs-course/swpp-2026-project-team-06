"""농가·상품 상세 콘텐츠 공통 스키마(storefront-1.5)."""

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, TypeAdapter, field_validator, model_validator

from app.core.config import get_settings
from app.core.schemas import CamelModel

_SERVICE_IMAGE = re.compile(r"^/(?!/)[^\s]+$")
_HTTPS_IMAGE = re.compile(r"^https://[^\s]+$")
# 로컬 서버(APP_ENV=local)의 업로드 주소. 운영 데이터에는 남지 않는다(DEV-102).
_LOCAL_IMAGE = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?/[^\s]+$")
# farms.photo 컬럼 길이와 같다. data URL 같은 긴 값은 500 대신 400으로 막는다.
MEDIA_URI_MAX = 500


def valid_media_uri(uri: str) -> str:
    """공개 사진·영상 주소. HTTPS 또는 서비스 상대 경로만 저장한다(storefront-1.5, DEV-102)."""
    local = get_settings().app_env == "local" and _LOCAL_IMAGE.fullmatch(uri)
    if len(uri) > MEDIA_URI_MAX or not (
        _HTTPS_IMAGE.fullmatch(uri) or _SERVICE_IMAGE.fullmatch(uri) or local
    ):
        raise ValueError("사진 주소가 올바르지 않아요. 사진을 다시 올려 주세요")
    return uri


MediaUri = Annotated[str, AfterValidator(valid_media_uri)]


class TextDetailBlock(CamelModel):
    id: str = Field(min_length=1, max_length=100)
    type: Literal["text"]
    title: str = Field(max_length=100)
    body: str = Field(max_length=3000)

    @model_validator(mode="after")
    def require_text(self):
        if not self.title.strip() and not self.body.strip():
            raise ValueError("제목이나 본문을 적어 주세요")
        return self


class ImageDetailBlock(CamelModel):
    id: str = Field(min_length=1, max_length=100)
    type: Literal["image"]
    uri: str
    alt: str = Field(max_length=200)

    _uri = field_validator("uri")(valid_media_uri)


DetailBlock = Annotated[TextDetailBlock | ImageDetailBlock, Field(discriminator="type")]


class DetailContent(CamelModel):
    blocks: list[DetailBlock] = Field(max_length=30)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [block.id for block in self.blocks]
        if len(ids) != len(set(ids)):
            raise ValueError("상세 블록 ID는 중복될 수 없어요")
        return self


class DetailDraftInput(CamelModel):
    input_text: str = Field(max_length=3000)
    photos: list[str] = Field(max_length=10)

    @field_validator("photos")
    @classmethod
    def validate_photos(cls, photos: list[str]) -> list[str]:
        return [valid_media_uri(uri) for uri in photos]


class DetailDraft(CamelModel):
    content: DetailContent
    mode: Literal["mock", "ai"]


_DETAIL_ADAPTER = TypeAdapter(DetailContent)


def detail_content(value: dict | None) -> DetailContent | None:
    return _DETAIL_ADAPTER.validate_python(value) if value is not None else None
