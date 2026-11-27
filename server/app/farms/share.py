"""Public farm-link metadata and landing page (FEAT-19, ADR 0006)."""

from pathlib import Path
from typing import Annotated
from urllib.parse import quote, urljoin, urlsplit

from fastapi import APIRouter, Depends, Request
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.farms.service import public_farm

router = APIRouter(tags=["farms"])
templates = Jinja2Templates(directory=Path(__file__).with_name("templates"))


def farm_share_url(request: Request, farm_id: str) -> str:
    """농가 공유 주소. SHARE_BASE_URL이 있으면 그 도메인으로(ADR 0012), 없으면 요청 서버 주소로."""
    base = get_settings().share_base_url.rstrip("/")
    if base:
        return f"{base}/s/farms/{quote(farm_id, safe='')}"
    return str(request.url_for("share_farm", farm_id=farm_id))


@router.get("/s/farms/{farm_id}", name="share_farm", include_in_schema=False)
def share_farm(request: Request, farm_id: str, db: Annotated[Session, Depends(get_db)]):
    # 공유 페이지는 로그인 없이 열린다(크롤러·메신저 미리보기). 테스트 농가는 404(DEV-472)
    farm = public_farm(db, farm_id, None)
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
            "share_url": farm_share_url(request, farm_id),
            "destination": (
                f"{consumer}/farms/{quote(farm.id, safe='')}" if farm else f"{consumer}/farms"
            ),
        },
        status_code=200 if farm else 404,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
