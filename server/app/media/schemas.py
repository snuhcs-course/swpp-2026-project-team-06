from typing import Literal

from app.core.schemas import CamelModel


class MediaView(CamelModel):
    url: str
    kind: Literal["image", "video"]
    mime_type: str
    size: int
