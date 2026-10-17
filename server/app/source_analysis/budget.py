"""Conservative USD-micro reservations, serialized across workers and batches."""

import json
import math

from sqlalchemy import func, select, text

from app.ai.source_analysis import PROMPT, ExtractionError
from app.core.config import SOURCE_OPENROUTER_PRICES, get_settings
from app.source_analysis.models import Spend


def reserve(db, item, mode, model, chunk, targets, images, *, stage=None, output_tokens=None):
    cfg = get_settings()
    # UTF-8 bytes upper-bound text tokens; encoded image bytes deliberately over-reserve.
    input_bound = (
        len(
            (
                PROMPT + json.dumps({"targets": targets, "source": chunk}, ensure_ascii=False)
            ).encode()
        )
        + sum(map(len, images))
        + 8192
    )
    # USD per million tokens equals micro-USD per token.
    if mode == "openrouter":
        if model not in SOURCE_OPENROUTER_PRICES:
            raise ExtractionError("UNSUPPORTED_MODEL")
        input_rate, output_rate = SOURCE_OPENROUTER_PRICES[model]
    else:
        input_rate, output_rate = (2, 10)
    amount = math.ceil(
        input_bound * input_rate + (output_tokens or cfg.source_max_output_tokens) * output_rate
    )
    db.execute(text("SELECT pg_advisory_xact_lock(563158)"))
    used = func.coalesce(Spend.charged_micros, Spend.reserved_micros)
    total = db.scalar(select(func.coalesce(func.sum(used), 0)))
    evaluation = db.scalar(
        select(func.coalesce(func.sum(used), 0)).where(Spend.evaluation.is_(True))
    )
    if total + amount > int(cfg.source_budget_usd * 1_000_000) or (
        cfg.source_evaluation
        and evaluation + amount > int(cfg.source_evaluation_budget_usd * 1_000_000)
    ):
        raise ExtractionError("BUDGET_EXCEEDED")
    reservation_id = f"{item.id}:{item.attempt}"
    if stage:
        reservation_id += f":{stage}"
    db.add(Spend(id=reservation_id, reserved_micros=amount, evaluation=cfg.source_evaluation))
    db.flush()
    return reservation_id


def settle(db, reservation_id, usage):
    if not reservation_id:
        return
    row = db.get(Spend, reservation_id)
    cost = usage.get("cost")
    # Missing/uncertain cost retains full reservation, including after cancellation/deletion.
    if row and isinstance(cost, (int, float)) and math.isfinite(cost) and cost >= 0:
        row.charged_micros = math.ceil(cost * 1_000_000)
