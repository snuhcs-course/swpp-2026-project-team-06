from typing import Annotated, Literal

from pydantic import ConfigDict, Field, model_validator

from app.core.schemas import CamelModel


class Input(CamelModel):
    model_config = ConfigDict(extra="forbid")


Id = Annotated[str, Field(min_length=1, max_length=64)]
Short = Annotated[str, Field(min_length=1, max_length=200)]
FieldKey = Literal[
    "name",
    "summary",
    "composition",
    "pieceCount",
    "taste",
    "specification",
    "qualityEvidence",
    "productionProcess",
    "delivery",
    "storage",
    "appearanceFaq",
    "support",
    "farmStory",
    "farmUpdates",
    "sizePhoto",
    "crossSectionPhoto",
    "packagePhoto",
    "farmPhotos",
    "hero",
    "historicalSales",
]
MODULE_FIELDS = {
    "hero": ["name", "hero"],
    "summary": ["summary"],
    "composition": ["composition"],
    "pieceCount": ["pieceCount"],
    "taste": ["taste"],
    "specification": ["specification"],
    "sizePhoto": ["sizePhoto"],
    "crossSectionPhoto": ["crossSectionPhoto"],
    "qualityEvidence": ["qualityEvidence"],
    "productionProcess": ["productionProcess"],
    "packagePhoto": ["packagePhoto"],
    "delivery": ["delivery"],
    "storage": ["storage"],
    "appearanceFaq": ["appearanceFaq"],
    "support": ["support"],
    "farmStory": ["farmStory"],
    "farmPhotos": ["farmPhotos"],
    "farmUpdates": ["farmUpdates"],
}
SECTION_MODULES = {
    "intro": {"hero", "summary"},
    "composition": {"composition", "pieceCount"},
    "taste": {"taste", "specification", "sizePhoto", "crossSectionPhoto"},
    "production": {"qualityEvidence", "productionProcess"},
    "packing": {"packagePhoto", "delivery"},
    "storage": {"storage"},
    "faq": {"appearanceFaq", "support"},
    "farm": {"farmStory", "farmPhotos"},
    "updates": {"farmUpdates"},
}
SectionId = Literal[
    "intro", "composition", "taste", "production", "packing", "storage", "faq", "farm", "updates"
]


def hidden_modules(section_ids):
    return {module for section in section_ids for module in SECTION_MODULES[section]}


# IDs refer to the pre-generated, labeled illustrations; no runtime generation.
ILLUSTRATIONS = {"hand-citrus-small", "hand-citrus-medium", "hand-citrus-large"}


class BasicInfo(Input):
    variety: str = Field(default="", max_length=100)
    size: str = Field(default="", max_length=200)
    expected_brix: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def trimmed(self):
        self.variety = self.variety.strip()
        self.size = self.size.strip()
        return self


class Target(Input):
    id: Id | None = None
    name: Short
    product_id: Id | None = None
    basic_info: BasicInfo | None = None


class BatchCreate(Input):
    targets: list[Target] = Field(min_length=1, max_length=10)


class Version(Input):
    version: int = Field(ge=1)


class TargetBasicInfo(Input):
    target_id: Id
    basic_info: BasicInfo


class BasicInfoPatch(Version):
    targets: list[TargetBasicInfo] = Field(min_length=1, max_length=10)


class BatchPatch(Version, BatchCreate):
    pass


class Assignment(Input):
    source_version: int = Field(ge=1)
    target_ids: list[Id] = Field(default_factory=list, max_length=10)
    common: bool = False
    original_photo: bool = False


class SourceEdit(Input):
    description_version: int | None = Field(default=None, ge=1)
    source_version: int = Field(ge=1)
    text: str | None = Field(default=None, max_length=30000)
    description: str | None = Field(default=None, max_length=300)


class Region(Input):
    page: int = Field(ge=1, le=20)
    box: list[float] = Field(min_length=4, max_length=4)

    @model_validator(mode="after")
    def valid_box(self):
        x1, y1, x2, y2 = self.box
        if not (0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1):
            raise ValueError("정규화된 사각형 좌표가 필요해요.")
        return self


class Privacy(Input):
    source_revision: int = Field(ge=1)
    sanitization_version: int = Field(ge=0)
    regions: list[Region] = Field(default_factory=list, max_length=500)
    span_ids: list[Id] = Field(default_factory=list, max_length=3000)
    approved: bool = False


class RunStart(Input):
    batch_version: int = Field(ge=1)
    visual_pages: dict[str, list[int]] = Field(default_factory=dict, max_length=30)


class Retry(Input):
    item_ids: list[Id] = Field(min_length=1, max_length=100)
    acknowledge_uncertain: bool = False


class FieldReview(Input):
    target_id: Id
    field_key: FieldKey
    value: str = Field(default="", max_length=3000)
    state: Literal["CONFIRMED", "EXCLUDED", "UNREVIEWED"]
    provenance: Literal["EXTRACTED", "PRODUCER"]
    candidate_ids: list[Id] = Field(default_factory=list, max_length=100)
    photo_asset_ids: list[Id] = Field(default_factory=list, max_length=30)
    illustration_id: Id | None = None


class ReviewPatch(Input):
    review_version: int = Field(ge=1)
    fields: list[FieldReview] = Field(min_length=1, max_length=200)


class DraftTarget(Input):
    target_id: Id
    enabled_module_ids: list[str] = Field(max_length=18)
    hidden_section_ids: list[SectionId] = Field(default_factory=list, max_length=9)


class DraftSave(Input):
    review_version: int = Field(ge=1)
    targets: list[DraftTarget] = Field(min_length=1, max_length=10)


class Evidence(Input):
    source_id: Id
    source_revision: int = Field(ge=1)
    page: int = Field(ge=1)
    span_ids: list[Id] = Field(min_length=1, max_length=100)
    quote: str = Field(min_length=1, max_length=3000)


class Extracted(Input):
    target_id: Id | None
    field_key: FieldKey
    value: str = Field(min_length=1, max_length=3000)
    evidence: list[Evidence] = Field(min_length=1, max_length=20)
    historical: bool


class Extraction(Input):
    candidates: list[Extracted] = Field(max_length=100)
    photo_requests: list[str] = Field(max_length=30)


class ApplyDraft(Input):
    product_id: Id
    product_version: int = Field(ge=1)
    draft_version: int = Field(ge=1)
