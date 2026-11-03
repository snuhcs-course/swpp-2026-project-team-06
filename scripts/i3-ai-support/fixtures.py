"""DEV-169: per-trial synthetic fixtures for the DEV-154 AI-support corpus (local database only).

Run from server/ so the app settings and .env are used:
    cd server && uv run python ../scripts/i3-ai-support/fixtures.py --check   # fidelity check, no model calls

Every trial gets a fresh consumer and thread on the synthetic farm `f-eval`. Products, the paid order
(`o-eval-1`/`o-eval-2`) and the farm AI settings are reset from that row's `evidence`, and `build_evidence` (the
exact function the chat path uses) must reproduce the row's evidence before the trial may run.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import inspect

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))

from app.accounts.models import User  # noqa: E402
from app.catalog.models import Product, ProductOption, Stage  # noqa: E402
from app.core.clock import now  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.db import get_sessionmaker  # noqa: E402
from app.core.security import issue_token  # noqa: E402
from app.farms.models import Farm, FarmAiSettings, Follow  # noqa: E402
from app.messaging import service as messaging  # noqa: E402
from app.orders.models import Order  # noqa: E402

QUESTIONS = ROOT / "docs" / "evaluation" / "i3-ai-support" / "questions.jsonl"
FARM = "f-eval"
PRODUCER = "u-eval-producer"
# Fixture products (protocol.md "Fixture interpretation"); all stay PUBLISHED so the farm is multi-product.
PRODUCT_IDS = ("p-eval-citrus", "p-eval-pear", "p-eval-grape")
SEED_PRODUCT, SEED_ORDER, SEED_FARM = "p-house", "o-42", "f-kang"


def load_cases() -> list[dict]:
    return [json.loads(line) for line in QUESTIONS.read_text(encoding="utf-8").splitlines() if line]


def require_local_database() -> None:
    url = get_settings().database_url
    host = url.split("@", 1)[-1]
    if not (host.startswith("localhost") or host.startswith("127.0.0.1")):
        sys.exit(f"Stopped: not a local database ({host})")


def _clone(db, model, source_id: str, new_id: str, **overrides):
    """Copy a seeded row's columns into a new row (or update the existing copy)."""
    source = db.get(model, source_id)
    if source is None:
        sys.exit(f"Seed row {model.__name__} {source_id} missing — run the seed first")
    row = db.get(model, new_id)
    if row is None:
        row = model()
        for column in inspect(model).columns:
            setattr(row, column.key, getattr(source, column.key))
        row.id = new_id
        db.add(row)
    for key, value in overrides.items():
        setattr(row, key, value)
    return row


@dataclass
class Trial:
    case_id: str
    run: int
    consumer_id: str
    consumer_token: str
    producer_token: str
    body: dict
    fidelity_diff: dict


def _ensure_base(db) -> None:
    """Producer, approved farm and three published products (idempotent)."""
    _clone(db, User, "u-kang", PRODUCER, name="평가용 생산자", is_test_account=True)
    _clone(
        db,
        Farm,
        SEED_FARM,
        FARM,
        producer_id=PRODUCER,
        name="평가용 농가",
        approval_status="APPROVED",
    )
    db.flush()
    for pid in PRODUCT_IDS:
        _clone(db, Product, SEED_PRODUCT, pid, farm_id=FARM, status="PUBLISHED")
    # The paid order needs an option and a sales stage of its product (FK on orders).
    if db.get(ProductOption, ("p-eval-citrus", "opt-eval")) is None:
        option = db.get(ProductOption, (SEED_PRODUCT, "opt-5"))
        copy = ProductOption()
        for column in inspect(ProductOption).columns:
            setattr(copy, column.key, getattr(option, column.key))
        copy.product_id, copy.id = "p-eval-citrus", "opt-eval"
        db.add(copy)
    _clone(db, Stage, "st-house-1", "st-eval-1", product_id="p-eval-citrus")
    if db.get(FarmAiSettings, FARM) is None:
        db.add(FarmAiSettings(farm_id=FARM, enabled=True, version=1, updated_at=now()))
    db.flush()


def _apply_evidence(db, ev: dict) -> None:
    pid = ev["product_id"]
    if pid:
        start, end = ev["delivery_window"] or (None, None)
        from datetime import date

        _clone(
            db,
            Product,
            SEED_PRODUCT,
            pid,
            farm_id=FARM,
            status="PUBLISHED",
            name=ev["product_name"],
            shipping_fee_type=ev["shipping_fee_type"],
            shipping_fee=ev["shipping_fee"],
            remote_area_fee=ev["remote_area_fee"],
            delivery_start=date.fromisoformat(start) if start else None,
            delivery_end=date.fromisoformat(end) if end else None,
            measured_brix=ev["measured_brix"],
            expected_brix=ev["expected_brix"],
        )
    settings = db.get(FarmAiSettings, FARM)
    settings.faqs = ev["faqs"]
    settings.small_order_policy = ev["small_order_policy"]
    settings.reservation_shipping_policy = ev["reservation_shipping_policy"]
    settings.handoff_topics = ev["handoff_topics"]


def prepare(case: dict, run: int, suffix: str = "") -> Trial:
    """Reset the fixture for one trial and return the tokens and request body to send."""
    require_local_database()
    ev, runtime = case["evidence"], case["runtime"]
    consumer_id = f"u-eval-{case['id'].lower()}-{run}{suffix}"
    with get_sessionmaker()() as db:
        _ensure_base(db)
        _apply_evidence(db, ev)
        settings = db.get(FarmAiSettings, FARM)
        settings.enabled = bool(runtime["ai_enabled"])
        settings.version += 1
        settings.updated_at = now()
        consumer = _clone(
            db, User, "u-minji", consumer_id, name="평가 소비자", is_test_account=True
        )
        db.flush()
        if db.get(Follow, (consumer_id, FARM)) is None:
            db.add(Follow(consumer_id=consumer_id, farm_id=FARM, created_at=now()))
        body = {"text": case["question"]}
        if ev["order_id"]:
            from datetime import date

            start, end = ev["order_delivery_window"]
            seed = db.get(Order, SEED_ORDER)
            _clone(
                db,
                Order,
                SEED_ORDER,
                ev["order_id"],
                order_no=f"FC-EVAL-{ev['order_id'][-1]}",
                consumer_id=consumer_id,
                product_id=ev["product_id"],
                status=ev["order_status"],
                delivery_start=date.fromisoformat(start),
                delivery_end=date.fromisoformat(end),
                option_id="opt-eval",
                stage_id="st-eval-1",
                paid_at=seed.paid_at or now(),
                # synthetic recipient; never real contact data (protocol: sanitized fixtures)
                recipient_name="평가 소비자",
                recipient_phone="010-0000-0000",
                address="평가용 주소",
                address_detail="",
                delivery_note=None,
            )
            body["orderId"] = ev["order_id"]
        elif ev["product_id"]:
            body["productId"] = ev["product_id"]
        db.flush()
        thread = messaging.ensure_thread(db, FARM, consumer_id)
        thread.ai_mode = runtime["thread_mode"]
        db.flush()
        built = messaging.build_evidence(
            db,
            FARM,
            body.get("orderId"),
            settings.small_order_policy,
            settings.reservation_shipping_policy,
            settings.faqs,
            settings.handoff_topics,
            product_id=body.get("productId"),
        ).model_dump()
        diff = {
            k: {"expected": ev[k], "built": _norm(built.get(k))}
            for k in ev
            if _norm(built.get(k)) != ev[k]
        }
        db.commit()
        role = consumer.role
    return Trial(
        case_id=case["id"],
        run=run,
        consumer_id=consumer_id,
        consumer_token=issue_token(consumer_id, role),
        producer_token=issue_token(PRODUCER, "PRODUCER"),
        body=body,
        fidelity_diff=diff,
    )


def _norm(value):
    if isinstance(value, tuple):
        return list(value)
    return value


if __name__ == "__main__":
    require_local_database()
    failures = 0
    for case in load_cases():
        trial = prepare(case, 0, suffix="-check")
        if trial.fidelity_diff:
            failures += 1
            print(case["id"], json.dumps(trial.fidelity_diff, ensure_ascii=False))
    print(f"fidelity: {60 - failures}/60 cases reproduce their evidence exactly")
    sys.exit(1 if failures else 0)
