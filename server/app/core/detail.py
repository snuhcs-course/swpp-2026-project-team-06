"""농가·상품 상세 콘텐츠 공통 스키마(storefront-1.5)."""

import re
from typing import Annotated, Literal

from pydantic import Field, TypeAdapter, field_validator, model_validator

from app.core.schemas import CamelModel

_SERVICE_IMAGE = re.compile(r"^/(?!/)[^\s]+$")
_HTTPS_IMAGE = re.compile(r"^https://[^\s]+$")


def _valid_image_uri(uri: str) -> str:
    if not (_HTTPS_IMAGE.fullmatch(uri) or _SERVICE_IMAGE.fullmatch(uri)):
        raise ValueError("사진 주소는 HTTPS 또는 서비스 상대 경로여야 해요")
    return uri


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

    _uri = field_validator("uri")(_valid_image_uri)


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
        return [_valid_image_uri(uri) for uri in photos]


class DetailDraft(CamelModel):
    content: DetailContent
    mode: Literal["mock", "ai"]


_DETAIL_ADAPTER = TypeAdapter(DetailContent)


def detail_content(value: dict | None) -> DetailContent | None:
    return _DETAIL_ADAPTER.validate_python(value) if value is not None else None
