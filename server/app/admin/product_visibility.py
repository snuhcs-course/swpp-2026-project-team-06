"""상품 승인·기존 주문과 독립된 운영자 공개 제어(AC-23-13~15)."""

from pydantic import Field, StrictBool, StrictInt, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin.service import run_manager_action
from app.catalog.models import Product
from app.core.clock import now
from app.core.errors import conflict, not_found
from app.core.schemas import CamelModel


class VisibilityInput(CamelModel):
    is_hidden: StrictBool
    version: StrictInt = Field(ge=1)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def meaningful_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("변경 사유를 적어 주세요.")
        return value.strip()


class VisibilityView(CamelModel):
    product_id: str
    is_hidden: bool
    version: int


def set_visibility(
    db: Session, admin_id: str, product_id: str, body: VisibilityInput, key: str | None
):
    def run(_: str) -> VisibilityView:
        product = db.scalar(
            select(Product)
            .where(Product.id == product_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if product is None:
            raise not_found("상품을 찾을 수 없어요.")
        if product.version != body.version:
            raise conflict("VERSION_MISMATCH", "상품이 변경됐어요. 새로고침 후 다시 확인해 주세요.")
        if product.is_hidden != body.is_hidden:
            product.is_hidden = body.is_hidden
            product.version += 1
            product.updated_at = now()
        return VisibilityView(
            product_id=product.id, is_hidden=product.is_hidden, version=product.version
        )

    return run_manager_action(
        db,
        actor_id=admin_id,
        action="product.hide" if body.is_hidden else "product.restore",
        target_type="product",
        target_id=product_id,
        scope=f"product-visibility:{product_id}",
        key=key,
        body=body.model_dump(by_alias=True),
        run=run,
    )
