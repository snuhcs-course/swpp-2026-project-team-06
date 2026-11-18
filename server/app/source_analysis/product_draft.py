"""DEV-361: private product draft of a buyer-visible product, applied with its page in one step.

The composer is the single editor of a product. For a buyer-visible product (PUBLISHED,
PENDING_APPROVAL) its product-field and sales-term changes are kept here and reach the product only
on apply-all ('상품에 반영'), together with the composer page draft. Before sale the composer keeps
writing the product directly (PATCH / PUT stages); closed products stay non-editable.

Conflicts are per field: each drafted field remembers the product value it was drafted from (base).
product.version is not used for this because sales settings and capacity requests bump it often.
Apply reuses the PATCH / PUT stages code (R-18, R-21, R-25, PERIOD_LOCKED) inside one transaction.
"""

from datetime import date

from pydantic import Field, field_validator, model_validator
from sqlalchemy import select

from app.catalog import service as catalog
from app.catalog.models import Product
from app.catalog.schemas import (
    DateRange,
    ProductInfo,
    ProductPatch,
    ShippingFeeType,
    StageInput,
)
from app.core.clock import now
from app.core.detail import MediaUri
from app.core.errors import conflict, invalid, not_found
from app.source_analysis import service as s
from app.source_analysis import workspace as w
from app.source_analysis.models import Draft, ProductWorkspace
from app.source_analysis.schemas import Id, Input

DRAFT_STATUSES = ("PUBLISHED", "PENDING_APPROVAL")
INFO_KEYS = ("origin", "producer", "size", "packedAt", "storage", "contact")
# Display order and labels of the confirmation sheet and the admin history.
LABELS = {
    "name": "상품명",
    "photos": "사진",
    "variety": "품종",
    "description": "설명",
    "grade": "등급",
    "expectedBrix": "예상 당도",
    "measuredBrix": "측정 당도",
    "info.origin": "원산지",
    "info.storage": "보관 방법",
    "info.producer": "생산자",
    "info.size": "크기",
    "info.packedAt": "포장일",
    "info.contact": "상담 안내",
    "options": "중량 옵션",
    "stages": "예약 기간·가격",
    "shippingFeeType": "배송비 방식",
    "shippingFee": "배송비",
    "remoteAreaFee": "도서산간 추가 운임",
    "maxDelayUntil": "전액 환불 날짜",
    "deliveryWindow": "받는 시기",
}
# Paid orders keep their snapshot (R-25): these reach new orders only. maxDelayUntil is not part
# of an order; buyers see it before paying.
# Option labels are read live by existing orders (weights are locked), so options are "now".
NEW_ORDERS = {"stages", "shippingFeeType", "shippingFee", "remoteAreaFee", "maxDelayUntil"}


class DraftOption(Input):
    # Required: a new option needs an id the drafted stages can refer to before it exists.
    option_id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=50)
    weight_kg: float = Field(gt=0)
    note: str | None = Field(default=None, max_length=100)


class DraftInfo(Input):
    # Same limits as PATCH /api/products (ProductInfo): none.
    origin: str | None = None
    producer: str | None = None
    size: str | None = None
    packed_at: str | None = None
    storage: str | None = None
    contact: str | None = None

    @model_validator(mode="after")
    def no_null(self):
        if any(getattr(self, k) is None for k in self.model_fields_set):
            raise ValueError("상품정보 칸은 비울 수 없어요")
        return self


class ProductDraftFields(Input):
    """Fields of PATCH /api/products the composer drafts. Sales settings (max per order) stay
    immediate in 물량·판매 설정; the page itself is the composer batch draft."""

    name: str | None = Field(default=None, max_length=200)
    variety: str | None = Field(default=None, max_length=100)
    description: str | None = None
    grade: str | None = Field(default=None, max_length=20)
    expected_brix: float | None = None
    measured_brix: float | None = None
    options: list[DraftOption] | None = None
    delivery_window: DateRange | None = None
    max_delay_until: date | None = None
    shipping_fee_type: ShippingFeeType | None = None
    shipping_fee: int | None = Field(default=None, ge=0)
    remote_area_fee: int | None = Field(default=None, ge=0)
    photos: list[MediaUri] | None = None
    info: DraftInfo | None = None

    @model_validator(mode="after")
    def no_null(self):
        # Only the nullable product columns may be cleared (field names or aliases alike).
        required = {
            "name",
            "variety",
            "description",
            "options",
            "shipping_fee_type",
            "shipping_fee",
            "remote_area_fee",
            "photos",
            "info",
        }
        nulls = sorted(k for k in self.model_fields_set & required if getattr(self, k) is None)
        if nulls:
            raise ValueError(f"비울 수 없는 칸이에요: {', '.join(nulls)}")
        return self

    @model_validator(mode="after")
    def unique_options(self):
        if self.options is not None and len({o.option_id for o in self.options}) != len(
            self.options
        ):
            raise ValueError("중량 옵션 ID가 겹쳐요")
        return self


class ProductDraftSave(Input):
    """The whole draft: it replaces the saved one. A field equal to the product is not a change."""

    version: int = Field(ge=1)  # workspace version
    fields: ProductDraftFields = Field(default_factory=ProductDraftFields)
    stages: list[StageInput] | None = None
    # Fields the producer checked after PRODUCT_CHANGED: they are drafted from the product's
    # current value from now on (a re-save alone keeps the old base, so the conflict stays).
    rebase: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("rebase")
    @classmethod
    def known_fields(cls, value):
        unknown = sorted(set(value) - set(LABELS))
        if unknown:
            raise ValueError(f"모르는 칸이에요: {', '.join(unknown)}")
        return value


class PageApply(Input):
    draft_id: Id
    draft_version: int = Field(ge=1)


class ApplyAll(Input):
    version: int = Field(ge=1)  # workspace version
    page: PageApply | None = None  # the composer page draft to apply with the product draft
    confirm_delivery_change: bool = False  # R-21: the producer saw who is asked to agree
    # the number of people the producer saw; a different current number asks again
    confirmed_reserved_count: int | None = Field(default=None, ge=0)


# --- normalized values ----------------------------------------------------------------------


def option_value(option_id, label, weight_kg, note):
    return {"optionId": option_id, "label": label, "weightKg": float(weight_kg), "note": note}


def stage_value(stage_id, starts_at, ends_at, options):
    return {
        "stageId": stage_id,
        "startsAt": str(starts_at),
        "endsAt": str(ends_at),
        "options": {
            oid: {"price": v["price"], "quantity": v["quantity"]}
            for oid, v in sorted(options.items())
        },
    }


def current_values(item):
    """The product's value of every draftable field, in the draft's JSON form."""
    p = item.product
    info = ProductInfo(**(p.info or {})).model_dump(by_alias=True)
    values = {
        "name": p.name,
        "photos": list(p.photos or []),
        "variety": p.variety,
        "description": p.description,
        "grade": p.grade,
        "expectedBrix": p.expected_brix,
        "measuredBrix": p.measured_brix,
        "options": [option_value(o.id, o.label, o.weight_kg, o.note) for o in item.options],
        "stages": [
            stage_value(
                st.id,
                st.starts_at,
                st.ends_at,
                {
                    oid: {"price": v.price, "quantity": v.quantity}
                    for oid, v in item.stage_values(st).items()
                },
            )
            for st in item.stages
        ],
        "shippingFeeType": p.shipping_fee_type,
        "shippingFee": p.shipping_fee,
        "remoteAreaFee": p.remote_area_fee,
        "maxDelayUntil": str(p.max_delay_until) if p.max_delay_until else None,
        "deliveryWindow": (
            {"start": str(p.delivery_start), "end": str(p.delivery_end)}
            if p.delivery_start and p.delivery_end
            else None
        ),
    }
    values.update({f"info.{k}": info[k] for k in INFO_KEYS})
    return values


def wanted_values(body):
    data = body.fields.model_dump(mode="json", by_alias=True, exclude_unset=True)
    info = data.pop("info", None) or {}
    data.update({f"info.{k}": v for k, v in info.items()})
    if "options" in data:
        data["options"] = [
            option_value(o.option_id, o.label, o.weight_kg, o.note) for o in body.fields.options
        ]
    if body.stages is not None:
        data["stages"] = [
            stage_value(
                st.stage_id,
                st.starts_at,
                st.ends_at,
                {oid: v.model_dump() for oid, v in st.options.items()},
            )
            for st in sorted(body.stages, key=lambda st: st.starts_at)
        ]
    return data


def patch_body(values):
    """The drafted product fields as a PATCH body (camelCase, info nested)."""
    body = {k: v for k, v in values.items() if k != "stages" and not k.startswith("info.")}
    info = {k.removeprefix("info."): v for k, v in values.items() if k.startswith("info.")}
    if info:
        body["info"] = info
    return body


# --- change summary -------------------------------------------------------------------------


def day(value):
    return value[5:].replace("-", ".")  # 2026-10-01 -> 10.01


def summary(key, value, labels):
    if value is None:
        return None
    if key == "photos":
        return f"{len(value)}장"
    if key == "options":
        return ", ".join(o["label"] for o in value) or "없음"
    if key == "stages":
        return (
            " / ".join(
                f"{day(st['startsAt'])}~{day(st['endsAt'])} "
                + ", ".join(
                    f"{labels.get(oid, oid)} {v['price']:,}원·{v['quantity']}박스"
                    for oid, v in st["options"].items()
                )
                for st in value
            )
            or "없음"
        )
    if key == "deliveryWindow":
        return f"{value['start']} ~ {value['end']}"
    if key == "shippingFeeType":
        return {"FREE": "무료", "SEPARATE": "따로 받기"}.get(value, value)
    if key in ("shippingFee", "remoteAreaFee"):
        return f"{value:,}원"
    if key in ("expectedBrix", "measuredBrix"):
        return f"{value:g}Brix"
    text = str(value)
    return text if len(text) <= 80 else text[:80] + "…"


def photo_change(before, after):
    entry = {"field": "photos", "label": LABELS["photos"]}
    entry["before"], entry["after"] = summary("photos", before, {}), summary("photos", after, {})
    if before[:1] != after[:1]:
        entry["after"] += " · 대표사진 바뀜"
    return entry


def grouped(values, current, reserved):
    """Changes grouped by how they reach buyers (the apply confirmation sheet)."""
    before_labels = {o["optionId"]: o["label"] for o in current["options"]}
    after_labels = {o["optionId"]: o["label"] for o in values.get("options", current["options"])}
    groups = {"now": [], "newOrders": [], "consent": []}
    for key in LABELS:
        if key not in values:
            continue
        if key == "photos":
            entry = photo_change(current["photos"], values["photos"])
        else:
            entry = {
                "field": key,
                "label": LABELS[key],
                "before": summary(key, current.get(key), before_labels),
                "after": summary(key, values[key], after_labels),
            }
        if key == "deliveryWindow" and reserved:
            groups["consent"].append(entry)  # R-21: asked to agree or get a full refund
        elif key in NEW_ORDERS or key == "deliveryWindow":
            groups["newOrders"].append(entry)
        else:
            groups["now"].append(entry)
    return groups


def conflicts(values, base, current):
    """Drafted fields the product changed elsewhere since (unless it now equals the draft)."""
    return [
        k
        for k in values
        if current.get(k) != base.get(k, current.get(k)) and current.get(k) != values[k]
    ]


# --- endpoints ------------------------------------------------------------------------------


def buyer_visible(product):
    if product.status == "CLOSED":
        raise conflict("INVALID_TRANSITION", "판매 종료 상품은 고칠 수 없어요.")
    if product.status not in DRAFT_STATUSES:
        raise conflict(
            "INVALID_TRANSITION",
            "판매 전 상품은 저장하면 바로 상품에 들어가요. 상품 저장을 써 주세요.",
        )


def reserved_people(db, product_id):
    from app.orders import service as orders

    return orders.delivery_proposal_people(db, product_id)


def view(db, product, row, item=None):
    item = item or catalog.load_products(db, [product])[0]
    draft = row.product_draft or {"values": {}, "base": {}, "savedAt": None}
    values, base = draft["values"], draft["base"]
    current = current_values(item)
    reserved = reserved_people(db, product.id)
    body = patch_body(values)
    return {
        "productId": product.id,
        "version": row.version,
        "productStatus": product.status,
        "draft": (
            {"fields": body, "stages": values.get("stages"), "savedAt": draft["savedAt"]}
            if values
            else None
        ),
        "changes": grouped(values, current, reserved),
        "reservedCount": reserved,
        "conflicts": conflicts(values, base, current),
    }


def get(db, farm, pid):
    product = catalog.load_my_product(db, farm.id, pid).product
    row = db.get(ProductWorkspace, pid)
    if row is None:
        raise invalid({"productId": "판매페이지 편집을 먼저 열어 주세요."})
    return view(db, product, row)


def save(db, farm, pid, body):
    product, row = w.owned(db, farm, pid)
    s.version(row.version, body.version)
    buyer_visible(product)
    item = catalog.load_products(db, [product])[0]
    current = current_values(item)
    wanted = {k: v for k, v in wanted_values(body).items() if v != current.get(k)}
    old = row.product_draft or {"values": {}, "base": {}}
    old_values, old_base = old["values"], old["base"]
    # A field already drafted keeps the value it was drafted from, so a change made elsewhere in
    # between is still caught on apply, unless the producer confirmed it (rebase).
    base = {
        k: old_base[k]
        if k in old_values and k in old_base and k not in body.rebase
        else current.get(k)
        for k in wanted
    }
    row.product_draft = (
        {"values": wanted, "base": base, "savedAt": now().isoformat()} if wanted else None
    )
    row.version += 1
    db.flush()
    return view(db, product, row, item)


def discard(db, farm, pid, version):
    product, row = w.owned(db, farm, pid)
    s.version(row.version, version)
    row.product_draft = None
    row.version += 1
    db.flush()
    return view(db, product, row)


def check_cover(db, batch, row, drafted, photos_before):
    """One cover. The page draft's cover becomes the product cover on apply-all; when it is a photo
    the product page already uses (a referenced URI), it must be the cover the producer wants: the
    drafted first photo, or the current cover when photos are not drafted. A stale composer cover
    never silently replaces a cover changed elsewhere. A photo newly uploaded in the composer gets
    its address only on apply, so it goes in front of the drafted order; one the last applied page
    already copied is not copied again (publish.cover_applied)."""
    from app.source_analysis.representative import selected

    target = next((t for t in batch.targets if t["id"] == row.target_id), None)
    cover = selected(db, batch.id, target) if target else None
    if cover is None or not cover.product_photo:
        return
    wanted = (drafted if drafted is not None else photos_before)[:1]
    if [cover.product_photo["uri"]] != wanted:
        raise conflict(
            "PHOTO_CHANGED",
            "판매페이지 대표사진과 상품 사진 첫 장이 달라요. 같은 사진으로 맞춰 주세요.",
        )


def apply_all(db, farm, actor_id, pid, body):
    """'상품에 반영': the product draft and the composer page draft in one transaction."""
    from app.source_analysis.publish import apply_draft
    from app.source_analysis.schemas import ApplyDraft

    product, row = w.owned(db, farm, pid)
    s.version(row.version, body.version)
    draft = row.product_draft or {"values": {}, "base": {}}
    values, base = draft["values"], draft["base"]
    listed = product.status in DRAFT_STATUSES
    if not listed and (product.status == "CLOSED" or not values):
        buyer_visible(product)  # refuses; a pre-sale product applies only a draft left from review
    if not values and body.page is None:
        raise invalid({"productDraft": "반영할 수정이 없어요."})
    item = catalog.load_products(db, [product])[0]
    current = current_values(item)
    stale = conflicts(values, base, current)
    if stale:
        raise conflict(
            "PRODUCT_CHANGED",
            "다른 곳에서 상품이 바뀌었어요. 바뀐 칸을 확인한 뒤 다시 저장해 주세요."
            if listed
            else "다른 곳에서 상품이 바뀌었어요. 남은 수정을 버리고 상품에서 직접 고쳐 주세요.",
            fields=stale,
        )
    # Fields that meanwhile became the drafted value (not a conflict) are no change any more.
    values = {k: v for k, v in values.items() if v != current.get(k)}
    reserved = reserved_people(db, pid)
    if (
        "deliveryWindow" in values  # values keeps only real changes (filtered above)
        and reserved
        and (
            not body.confirm_delivery_change
            or body.confirmed_reserved_count not in (None, reserved)
        )
    ):
        raise conflict(
            "DELIVERY_CONSENT_REQUIRED",
            f"예약한 {reserved}명에게 새 받는 시기 동의를 물어요. 확인한 뒤 반영해 주세요.",
            reservedCount=reserved,
        )
    changes = grouped(values, current, reserved)
    photos_before = list(product.photos or [])
    batch = s.batch(db, farm.id, row.batch_id) if body.page is not None else None
    if batch is not None:
        check_cover(db, batch, row, values.get("photos"), photos_before)
    proposed = False
    if values:
        fields = patch_body(values)
        if fields:
            patch = ProductPatch.model_validate({**fields, "version": product.version})
            # R-21 proposals go to reservations; none to ask means nothing was proposed
            proposed = catalog.apply_patch(db, item, patch) and reserved > 0
        if "stages" in values:
            catalog.apply_stages(
                db,
                catalog.load_products(db, [product])[0],
                [StageInput.model_validate(st) for st in values["stages"]],
            )
            db.flush()
        if listed:
            catalog.check_listed(db, product)  # PUBLISHED and PENDING_APPROVAL stay complete
        elif product.status == "REJECTED":
            product.status = "DRAFT"  # as a direct save (PATCH) of a rejected product
        product.version += 1
        product.updated_at = now()
        db.flush()
    page_changed = False
    if body.page is not None:
        story = page_state(db, pid)[1:]
        page = db.scalar(
            select(Draft).where(Draft.id == body.page.draft_id, Draft.batch_id == row.batch_id)
        )
        if page is None:
            raise not_found("판매페이지 초안을 찾을 수 없어요.")
        apply_draft(
            db,
            batch,
            page,
            ApplyDraft(
                product_id=pid,
                product_version=product.version,
                draft_version=body.page.draft_version,
            ),
            apply_cover=True,
        )
        product.updated_at = now()
        page_changed = (product.module_detail, product.detail_content) != story
        if page_changed:  # an untouched page draft is no change
            changes["now"].append(dict(PAGE_CHANGE))
    # The cover may come from the page draft: report the photos as they end up.
    changes["now"] = [c for c in changes["now"] if c["field"] != "photos"]
    if list(product.photos or []) != photos_before:
        changes["now"].insert(0, photo_change(photos_before, list(product.photos or [])))
    entries = changes["now"] + changes["newOrders"] + changes["consent"]
    event = (
        catalog.record_change(
            db,
            product,
            actor_id,
            entries,
            page_changed=page_changed,
            delivery_window_proposed=proposed,
            reserved_count=reserved if proposed else 0,
        )
        if entries
        else None
    )
    row.product_draft = None
    row.version += 1
    db.flush()
    mine = catalog.my_product(db, catalog.load_products(db, [db.get(Product, pid)])[0])
    return {
        "productId": pid,
        "version": row.version,
        "productVersion": mine.version,
        "changes": changes,
        "pageApplied": body.page is not None,
        "deliveryWindowProposed": proposed,
        "reservedCount": reserved,
        "changeId": event.id if event else None,
        "product": mine.model_dump(mode="json", by_alias=True),
    }


PAGE_CHANGE = {"field": "page", "label": "판매페이지", "before": None, "after": None}


def page_state(db, product_id):
    """Photos and story of a product, read as columns (no unlocked Product row in the session)."""
    row = db.execute(
        select(Product.photos, Product.module_detail, Product.detail_content).where(
            Product.id == product_id
        )
    ).first()
    return (list(row[0] or []), row[1], row[2]) if row else ([], None, None)


def record_page_apply(db, product_id, actor_id, before):
    """A page applied alone through the older endpoints is history too (DEV-361), when it
    changed something."""
    product = db.get(Product, product_id)
    if product is None or product.status not in DRAFT_STATUSES:
        return
    after = (list(product.photos or []), product.module_detail, product.detail_content)
    if after != before:
        photos = [photo_change(before[0], after[0])] if after[0] != before[0] else []
        catalog.record_change(
            db,
            product,
            actor_id,
            [*photos, PAGE_CHANGE],
            page_changed=True,
            delivery_window_proposed=False,
            reserved_count=0,
        )
