"""AC-ENG response contracts; no client-writeable score/completion fields."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from app.core.schemas import CamelModel


class Temperature(CamelModel):
    temperature_tenths: int
    contributions: dict[str, int]
    calculated_at: datetime
    policy_version: Literal[1] = 1


class ReviewInput(CamelModel):
    stars: int = Field(strict=True, ge=1, le=5)


class ReviewView(CamelModel):
    order_id: str
    stars: int | None


class ReportInput(CamelModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=1000)]


class ReportDecision(CamelModel):
    status: Literal["CONFIRMED", "REJECTED", "OVERTURNED"]
    incident_key: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ] = None

    @model_validator(mode="after")
    def confirmed_has_incident(self):
        if self.status == "CONFIRMED" and self.incident_key is None:
            raise ValueError("확정할 사건 번호를 적어 주세요")
        return self


class ReportView(CamelModel):
    report_id: str
    status: Literal["PENDING", "CONFIRMED", "REJECTED", "OVERTURNED"]


class Achievement(CamelModel):
    id: str
    title: str
    description: str
    completed: bool
    progress: Literal[0, 1]
    target: Literal[1] = 1
    action: str


class Achievements(CamelModel):
    tasks: list[Achievement]
    completed_count: int
    total: Literal[5] = 5


class ReportRecord(ReportView):
    """Admin queue: reasons are never part of public temperature/report responses."""

    farm_id: str
    reason: str
    incident_key: str | None
    created_at: datetime
    reviewed_at: datetime | None
