"""Public farm-link metadata and landing page (FEAT-19, ADR 0006)."""

from pathlib import Path
from typing import Annotated
from urllib.parse import quote, urljoin, urlsplit

from fastapi import APIRouter, Depends, Request
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.farms.service import get_approved_farm

router = APIRouter(tags=["farms"])
templates = Jinja2Templates(directory=Path(__file__).with_name("templates"))


@router.get("/s/farms/{farm_id}", name="share_farm", include_in_schema=False)
def share_farm(request: Request, farm_id: str, db: Annotated[Session, Depends(get_db)]):
    farm = get_approved_farm(db, farm_id)
    consumer = get_settings().consumer_app_url.rstrip("/")
    image = urljoin(consumer + "/", farm.photo) if farm and farm.photo else None
    if image and urlsplit(image).scheme not in {"http", "https"}:
        image = None
    return templates.TemplateResponse(
        request=request,
        name="farm-share.html",
        context={
            "farm": farm,
            "image": image,
            "share_url": str(request.url_for("share_farm", farm_id=farm_id)),
            "destination": (
                f"{consumer}/farms/{quote(farm.id, safe='')}" if farm else f"{consumer}/farms"
            ),
        },
        status_code=200 if farm else 404,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
