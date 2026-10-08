from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.catalog import service
from app.catalog.schemas import (
    CreateProductInput,
    Draft,
    DraftInput,
    MyProduct,
    ProductDetail,
    ProductPatch,
    StagePreset,
    StagesInput,
    StageView,
)
from app.core.db import get_db
from app.core.errors import not_found
from app.core.security import Admin, ApprovedProducer

router = APIRouter(prefix="/products", tags=["catalog"])
admin_router = APIRouter(prefix="/admin/products", tags=["admin"])

Db = Annotated[Session, Depends(get_db)]

# 고정 경로(/stage-presets, /drafts, /mine)를 경로 변수(/{product_id})보다 먼저 등록한다.


@router.get("/stage-presets", response_model=list[StagePreset])
def stage_presets(_: ApprovedProducer):
    return service.STAGE_PRESETS


@router.post("/drafts", response_model=Draft)
def create_draft(db: Db, producer: ApprovedProducer, body: DraftInput):
    """AI 상품 초안(FEAT-03). 실패해도 200과 failed=true를 돌려준다(AC-03-3)."""
    _, farm = producer
    draft = service.create_draft(db, farm.id, body.input_text)
    db.commit()
    return draft


@router.get("/mine/{product_id}", response_model=MyProduct)
def my_product(db: Db, producer: ApprovedProducer, product_id: str):
    _, farm = producer
    return service.my_product(db, service.load_my_product(db, farm.id, product_id))


@router.post("", response_model=MyProduct)
def create_product(db: Db, producer: ApprovedProducer, body: CreateProductInput):
    _, farm = producer
    product = service.create_product(db, farm, body.draft_id)
    db.commit()
    return product


@router.get("/{product_id}", response_model=ProductDetail)
def product_detail(db: Db, product_id: str):
    """상품 상세(SCR-04, FEAT-07). 판매 중이 아니면 404."""
    detail = service.product_detail(db, product_id)
    if detail is None:
        raise not_found("판매 중이 아닌 상품이에요.")
    return detail


@router.patch("/{product_id}", response_model=MyProduct)
def patch_product(db: Db, producer: ApprovedProducer, product_id: str, body: ProductPatch):
    _, farm = producer
    product = service.patch_product(db, farm.id, product_id, body)
    db.commit()
    return product


@router.put("/{product_id}/stages", response_model=list[StageView])
def put_stages(db: Db, producer: ApprovedProducer, product_id: str, body: StagesInput):
    _, farm = producer
    stages = service.put_stages(db, farm.id, product_id, body)
    db.commit()
    return stages


@router.post("/{product_id}/publish-request", response_model=MyProduct)
def publish_request(db: Db, producer: ApprovedProducer, product_id: str):
    _, farm = producer
    product = service.request_publish(db, farm.id, product_id)
    db.commit()
    return product


@admin_router.post("/{product_id}/approve", response_model=MyProduct)
def approve(db: Db, _: Admin, product_id: str):
    """운영자 상품 승인(ADR 0008). Swagger UI에서 ADMIN 토큰으로 부른다."""
    product = service.approve_product(db, product_id)
    db.commit()
    return product
