"""공통 Pydantic 기반. JSON은 camelCase(packages/api 타입과 같다)."""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Paged[T](CamelModel):
    items: list[T]
    next_cursor: str | None
