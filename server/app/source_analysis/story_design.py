"""Persist source-backed layout without granting new media access."""

from typing import Literal

from pydantic import Field, model_validator

from app.source_analysis.schemas import MODULE_FIELDS, Input, SectionId


class TextRef(Input):
    module_id: str = Field(max_length=80)
    text_index: int = Field(ge=0, le=39)


class SourceRef(Input):
    uri: str = Field(min_length=1, max_length=2000)
    pages: list[int] = Field(min_length=1, max_length=4)


class StoryMedia(Input):
    uri: str = Field(min_length=1, max_length=2000)
    alt: str = Field(max_length=500)
    width: int = Field(gt=0, le=40000)
    height: int = Field(gt=0, le=40000)
    kind: Literal["photo", "comparison"]
    source_id: str = Field(min_length=1, max_length=80)
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_region_id: str = Field(min_length=1, max_length=80)
    caption: str | None = Field(default=None, max_length=1000, exclude_if=lambda v: v is None)
    caption_ref: TextRef | None = Field(default=None, exclude_if=lambda v: v is None)
    after_text_ref: TextRef | None = Field(default=None, exclude_if=lambda v: v is None)
    source_ref: SourceRef | None = Field(default=None, exclude_if=lambda v: v is None)
    treatment: Literal["full", "inset", "mark"] | None = Field(
        default=None, exclude_if=lambda v: v is None
    )


class StorySection(Input):
    id: str = Field(min_length=1, max_length=80)
    group: SectionId
    layout: Literal["hero", "options", "editorial", "figure", "prose"]
    tone: Literal["paper", "cream", "accent"]
    module_ids: list[str] = Field(max_length=18)
    media_ids: list[str] = Field(max_length=20)
    title: str | None = Field(default=None, max_length=200, exclude_if=lambda v: v is None)


class StoryDesign(Input):
    version: Literal[1]
    theme: Literal["citrus-warm"]
    sections: list[StorySection] = Field(min_length=1, max_length=24)
    media: dict[str, StoryMedia] = Field(max_length=20)

    @model_validator(mode="after")
    def unique_references(self):
        if len({s.id for s in self.sections}) != len(self.sections):
            raise ValueError("상세 구역이 중복됐어요")
        mids = [m for s in self.sections for m in s.module_ids]
        pics = [m for s in self.sections for m in s.media_ids]
        if len(set(mids)) != len(mids) or not set(mids) <= set(MODULE_FIELDS):
            raise ValueError("상세 항목 연결을 확인해 주세요")
        if len(set(pics)) != len(pics) or set(pics) != set(self.media):
            raise ValueError("사진 연결을 확인해 주세요")
        return self

    def validate_modules(self, modules):
        by_id = {m.id: m for m in modules}
        used = {m for s in self.sections for m in s.module_ids}
        if any(m not in by_id for m in used):
            raise ValueError("없는 상세 항목을 참조해요")
        if any(
            (any(t.value.strip() for t in m.texts) or m.photos) and m.id not in used
            for m in modules
        ):
            raise ValueError("배치에 빠진 상세 항목이 있어요")
        for section in self.sections:
            for mid in section.media_ids:
                media = self.media[mid]
                for ref in [media.caption_ref, media.after_text_ref]:
                    if ref and (
                        ref.module_id not in section.module_ids
                        or ref.text_index >= len(by_id[ref.module_id].texts)
                    ):
                        raise ValueError("사진과 문구 연결을 확인해 주세요")
