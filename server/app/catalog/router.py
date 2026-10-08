from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.catalog import service
from app.catalog.schemas import (
    CapacityDecisionInput,
    CapacityRequestInput,
    CapacityRequestView,
    CreateProductInput,
    Draft,
    DraftInput,
    MyProduct,
    MyProductCard,
    ProductDetail,
    ProductPatch,
    SalesInput,
    SalesState,
    StagePreset,
    StagesInput,
    StagesResult,
    VersionInput,
)
from app.core.db import get_db
from app.core.errors import forbidden, not_found
from app.core.idempotency import run_idempotent
from app.core.pagination import decode_cursor, encode_cursor, page_limit
from app.core.schemas import Paged
from app.core.security import Admin, ApprovedProducer, CurrentUser

router = APIRouter(prefix="/products", tags=["catalog"])
admin_router = APIRouter(prefix="/admin/products", tags=["admin"])

Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]

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


@router.get("/mine", response_model=Paged[MyProductCard])
def my_products(
    db: Db,
    producer: ApprovedProducer,
    limit: Annotated[int, Depends(page_limit)],
    cursor: str | None = None,
    status: str | None = None,
):
    _, farm = producer
    items = service.my_product_cards(db, farm.id, status)
    offset = int((decode_cursor(cursor) or [0])[0])
    page = items[offset : offset + limit]
    next_cursor = encode_cursor([offset + limit]) if offset + limit < len(items) else None
    return Paged(items=page, next_cursor=next_cursor)


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
def patch_product(
    db: Db,
    producer: ApprovedProducer,
    product_id: str,
    body: ProductPatch,
    key: IdempotencyKey = None,
):
    _, farm = producer
    return run_idempotent(
        db,
        farm.producer_id,
        f"product-patch:{product_id}",
        key,
        body,
        lambda: service.patch_product(db, farm.id, product_id, body),
    )


@router.put("/{product_id}/stages", response_model=StagesResult)
def put_stages(
    db: Db,
    producer: ApprovedProducer,
    product_id: str,
    body: StagesInput,
    key: IdempotencyKey = None,
):
    _, farm = producer
    return run_idempotent(
        db,
        farm.producer_id,
        f"product-stages:{product_id}",
        key,
        body,
        lambda: service.put_stages(db, farm.id, product_id, body),
    )


@router.put("/{product_id}/sales-settings", response_model=SalesState)
def sales_settings(
    db: Db,
    producer: ApprovedProducer,
    product_id: str,
    body: SalesInput,
    key: IdempotencyKey = None,
):
    _, farm = producer
    return run_idempotent(
        db,
        farm.producer_id,
        f"sales-settings:{product_id}",
        key,
        body,
        lambda: service.update_sales_settings(db, farm.id, product_id, body),
    )


@router.get("/{product_id}/capacity-requests", response_model=Paged[CapacityRequestView])
def capacity_requests(
    db: Db,
    user: CurrentUser,
    product_id: str,
    limit: Annotated[int, Depends(page_limit)],
    cursor: str | None = None,
):
    if user.role == "ADMIN":
        if service.load_product(db, product_id) is None:
            raise not_found()
    elif user.role == "PRODUCER":
        from app.farms import service as farms

        farm = farms.get_farm_of_producer(db, user.id)
        if farm is None or farm.approval_status != "APPROVED":
            raise forbidden("승인된 농가만 쓸 수 있어요.")
        service.load_my_product(db, farm.id, product_id)
    else:
        raise forbidden()
    items = service.capacity_history(db, product_id)
    offset = int((decode_cursor(cursor) or [0])[0])
    page = items[offset : offset + limit]
    next_cursor = encode_cursor([offset + limit]) if offset + limit < len(items) else None
    return Paged(items=page, next_cursor=next_cursor)


@router.post("/{product_id}/capacity-requests", response_model=CapacityRequestView)
def request_capacity(
    db: Db,
    producer: ApprovedProducer,
    product_id: str,
    body: CapacityRequestInput,
    key: IdempotencyKey = None,
):
    _, farm = producer
    return run_idempotent(
        db,
        farm.producer_id,
        f"capacity-create:{product_id}",
        key,
        body,
        lambda: service.create_capacity_request(
            db, farm.id, product_id, body.requested_total_grams, body.version
        ),
    )


@router.post(
    "/{product_id}/capacity-requests/{request_id}/withdraw",
    response_model=CapacityRequestView,
)
def withdraw_capacity(
    db: Db,
    producer: ApprovedProducer,
    product_id: str,
    request_id: str,
    body: VersionInput,
    key: IdempotencyKey = None,
):
    _, farm = producer
    return run_idempotent(
        db,
        farm.producer_id,
        f"capacity-withdraw:{request_id}",
        key,
        body,
        lambda: service.withdraw_capacity_request(
            db, farm.id, product_id, request_id, body.version
        ),
    )


@admin_router.post(
    "/{product_id}/capacity-requests/{request_id}/approve",
    response_model=CapacityRequestView,
)
def approve_capacity(
    db: Db,
    admin: Admin,
    product_id: str,
    request_id: str,
    body: VersionInput,
    key: IdempotencyKey = None,
):
    return run_idempotent(
        db,
        admin.id,
        f"capacity-approve:{request_id}",
        key,
        body,
        lambda: service.decide_capacity_request(
            db, product_id, request_id, body.version, True
        ),
    )


@admin_router.post(
    "/{product_id}/capacity-requests/{request_id}/reject",
    response_model=CapacityRequestView,
)
def reject_capacity(
    db: Db,
    admin: Admin,
    product_id: str,
    request_id: str,
    body: CapacityDecisionInput,
    key: IdempotencyKey = None,
):
    return run_idempotent(
        db,
        admin.id,
        f"capacity-reject:{request_id}",
        key,
        body,
        lambda: service.decide_capacity_request(
            db, product_id, request_id, body.version, False, body.reason
        ),
    )
