"""One private input form: source materials and producer-selected sale settings."""

from copy import deepcopy
from datetime import date
from typing import Literal

from pydantic import Field
from sqlalchemy import select

from app.catalog import service as catalog
from app.catalog.schemas import (
    ProductPatch,
    StageInput,
    StageOptionInput,
    StagesInput,
)
from app.core.errors import conflict, invalid
from app.source_analysis import service as s
from app.source_analysis.models import Asset, Run
from app.source_analysis.schemas import Input, Version


class SetupOption(Input):
    option_id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=50)
    weight_kg: float = Field(ge=0.1, le=100, allow_inf_nan=False)
    note: str | None = Field(default=None, max_length=100)


class SetupCell(Input):
    price: int | None = Field(default=None, ge=1)
    quantity: int | None = Field(default=None, ge=0)


class SetupRow(Input):
    key: str = Field(min_length=1, max_length=100)
    stage_id: str | None = Field(default=None, max_length=64)
    starts_at: date | None = None
    ends_at: date | None = None
    options: dict[str, SetupCell] = Field(default_factory=dict, max_length=20)


class SetupWindow(Input):
    start: date
    end: date


class SetupTerms(Input):
    options: list[SetupOption] = Field(default_factory=list, max_length=20)
    delivery_window: SetupWindow | None = None
    max_delay_until: date | None = None
    shipping_fee_type: Literal["FREE", "SEPARATE"] = "FREE"
    shipping_fee: int | None = Field(default=None, ge=0)
    remote_area_fee: int | None = Field(default=None, ge=0)
    rows: list[SetupRow] = Field(default_factory=list, max_length=10)


class SetupInputs(Input):
    product_name: str = Field(default="", max_length=200)
    product_hint: str = Field(default="", max_length=100)
    origin: str = Field(default="", max_length=200)
    requested_kg: float | None = Field(default=None, gt=0, le=1000000, allow_inf_nan=False)
    terms: SetupTerms


class SetupSave(Version):
    inputs: SetupInputs
    batch_version: int | None = Field(default=None, ge=1)


def save(db, farm, pid, body, *, generate=False):
    from app.source_analysis import workspace as w

    product, row = w.owned(db, farm, pid)
    s.version(row.version, body.version)
    if product.status not in {"DRAFT", "REJECTED"}:
        raise conflict("INVALID_TRANSITION", "판매 전 상품의 자료·판매 설정 화면이에요.")
    batch = s.batch(db, farm.id, row.batch_id)
    if db.scalar(select(Run.id).where(Run.batch_id == batch.id, Run.status.in_(s.ACTIVE))):
        raise conflict("RUN_ACTIVE", "페이지 생성이 끝난 뒤 입력 정보를 수정해 주세요.")
    if generate:
        if body.batch_version is None:
            raise invalid({"batchVersion": "첨부 자료를 다시 확인해 주세요."})
        s.version(batch.version, body.batch_version)
        # DEV-452 (PM 11/27): a page is generated only from complete required inputs.
        if not body.inputs.product_hint.strip():
            raise invalid({"productHint": "어떤 상품인지 적어 주세요."})
        has_material = db.scalar(
            select(Asset.id).where(
                Asset.batch_id == batch.id,
                Asset.deleted.is_(False),
                Asset.product_photo.is_(None),
            )
        )
        if not has_material:
            raise invalid({"sources": "자료를 하나 이상 넣어 주세요."})
        require_sale_inputs({"setupInputs": body.inputs.model_dump(mode="json", by_alias=True)})
    terms = body.inputs.terms
    ids = [o.option_id for o in terms.options]
    if len(set(ids)) != len(ids) or len({o.weight_kg for o in terms.options}) != len(ids):
        raise invalid({"options": "중량 옵션을 중복 없이 입력해 주세요."})
    if any(not set(r.options) <= set(ids) for r in terms.rows):
        raise invalid({"rows": "현재 중량 옵션에 맞는 가격을 입력해 주세요."})
    info = body.inputs.model_dump(mode="json", by_alias=True)
    row.snapshot = {**row.snapshot, "setupInputs": info}
    row.published_snapshot = {**row.published_snapshot, "setupInputs": deepcopy(info)}
    row.version += 1
    # Current settings are producer inputs. Source documents never set these fields.
    patch = {
        "version": product.version,
        "options": [o.model_dump(by_alias=True) for o in terms.options],
    }
    if body.inputs.product_name.strip():
        patch["name"] = body.inputs.product_name.strip()
    elif body.inputs.product_hint.strip() and (product.name or "").strip() in ("", "새 상품"):
        # DEV-452: an empty product name takes the product hint ("한라봉") instead of staying blank.
        patch["name"] = body.inputs.product_hint.strip()[:60]
    if body.inputs.product_hint.strip():
        patch["variety"] = body.inputs.product_hint.strip()
    if body.inputs.origin.strip():
        patch["info"] = {**(product.info or {}), "origin": body.inputs.origin.strip()}
    if terms.delivery_window:
        patch["deliveryWindow"] = terms.delivery_window.model_dump(mode="json")
    if terms.max_delay_until:
        patch["maxDelayUntil"] = terms.max_delay_until.isoformat()
    if terms.shipping_fee_type == "FREE" or terms.shipping_fee is not None:
        patch.update(
            shippingFeeType=terms.shipping_fee_type,
            shippingFee=terms.shipping_fee or 0,
            remoteAreaFee=terms.remote_area_fee or 0,
        )
    catalog.patch_product(db, farm.id, pid, ProductPatch.model_validate(patch))
    product = catalog.load_my_product(db, farm.id, pid).product
    complete_prices = bool(
        ids and terms.rows and terms.delivery_window and terms.max_delay_until
    ) and all(
        r.starts_at
        and r.ends_at
        and set(r.options) == set(ids)
        and all(c.price is not None for c in r.options.values())
        for r in terms.rows
    )
    if complete_prices:
        stages = [
            StageInput(
                stage_id=r.stage_id,
                starts_at=r.starts_at,
                ends_at=r.ends_at,
                options={
                    oid: StageOptionInput(price=c.price, quantity=99999)
                    for oid, c in r.options.items()
                },
            )
            for r in terms.rows
        ]
        catalog.put_stages(db, farm.id, pid, StagesInput(version=product.version, stages=stages))
    target_rows = deepcopy(batch.targets)
    for target in target_rows:
        if target["id"] == row.target_id:
            target["producerInputs"] = deepcopy(info)
            if body.inputs.product_name.strip() or body.inputs.product_hint.strip():
                target["name"] = (
                    body.inputs.product_name.strip() or body.inputs.product_hint.strip()
                )
            if body.inputs.product_hint.strip():
                target["basicInfo"] = {
                    **(target.get("basicInfo") or {}),
                    "variety": body.inputs.product_hint.strip(),
                }
    if target_rows != batch.targets:
        batch.targets = target_rows
        batch.version += 1
        batch.review_version += 1
    db.flush()
    result = {
        "workspace": w.view(row),
        "product": catalog.my_product(db, catalog.load_my_product(db, farm.id, pid)).model_dump(
            mode="json", by_alias=True
        ),
    }
    if generate:
        result["run"] = s.start_run(db, batch, batch.version)
    return result


def require_sale_inputs(snapshot):
    """Incomplete saved inputs cannot reuse older valid product settings at submission."""
    info = snapshot.get("setupInputs")
    if info is None:
        return
    parsed = SetupInputs.model_validate(info)
    t = parsed.terms
    ids = {o.option_id for o in t.options}
    if (
        not parsed.requested_kg
        or not ids
        or not t.delivery_window
        or not t.max_delay_until
        or not t.rows
        or any(
            not r.starts_at
            or not r.ends_at
            or set(r.options) != ids
            or any(c.price is None for c in r.options.values())
            for r in t.rows
        )
        or (t.shipping_fee_type == "SEPARATE" and t.shipping_fee is None)
    ):
        raise invalid(
            {
                "setupInputs": (
                    "자료·판매 설정에서 물량, 옵션, 가격, 기간과 배송비를 마저 입력해 주세요."
                )
            }
        )


def page_statuses(db, farm_id):
    """DEV-452: generation state of each product made through the combined setup page.

    For the product list: MAKING (with the run's items for a count-based bar), READY (with the
    number of things to check), FAILED or NONE, plus a name fallback for unnamed drafts.
    """
    from sqlalchemy import select

    from app.source_analysis import service as s
    from app.source_analysis.models import Asset, Batch, ProductWorkspace, Run
    from app.source_analysis.source_copy_service import plan
    from app.source_analysis.source_sale import unconfirmed_photos

    rows = db.execute(
        select(ProductWorkspace, Batch)
        .join(Batch, Batch.id == ProductWorkspace.batch_id)
        .where(Batch.farm_id == farm_id, Batch.deleted.is_(False))
    ).all()
    result = []
    for workspace, batch in rows:
        info = (workspace.snapshot or {}).get("setupInputs")
        if info is None:
            continue
        name = (info.get("productName") or info.get("productHint") or "").strip()
        run = db.scalar(
            select(Run).where(Run.batch_id == batch.id).order_by(Run.created_at.desc()).limit(1)
        )
        entry = {"productId": workspace.product_id, "batchId": batch.id, "nameHint": name}
        if run is None:
            result.append({**entry, "state": "NONE"})
            continue
        if run.status in s.ACTIVE:
            sources = db.scalars(
                select(Asset).where(Asset.batch_id == batch.id, Asset.deleted.is_(False))
            )
            view = s.run_view(db, run)
            result.append(
                {
                    **entry,
                    "state": "MAKING",
                    "run": {"id": run.id, "status": run.status, "items": view["items"]},
                    "sources": [{"id": a.id, "originalPhoto": a.original_photo} for a in sources],
                }
            )
            continue
        if run.status not in ("SUCCEEDED", "PARTIAL"):
            result.append({**entry, "state": "FAILED"})
            continue
        target = next((t for t in batch.targets if t["id"] == workspace.target_id), None)
        to_check = 0
        if target is not None:
            try:
                current = plan(db, batch, target["id"])
                to_check = sum(1 for p in current["passages"] if p.get("reviewPending"))
            except Exception:  # noqa: BLE001 - the list must still load
                to_check = 0
            to_check += len(unconfirmed_photos(db, batch, target, [workspace.snapshot]))
        result.append({**entry, "state": "READY", "toCheck": to_check})
    return {"items": result}
