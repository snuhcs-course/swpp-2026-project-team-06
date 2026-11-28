"""Experimental source-unit dispositions, converted to the unchanged page schema."""

from typing import Literal

from pydantic import Field

from app.ai import source_refine as legacy
from app.ai.page_plan import build_page_plan
from app.source_analysis.schemas import Id, Input

PROMPT_VERSION = "source-unit-writer-v1"
PROMPT = (
    legacy.PLANNED_PROMPT
    + """

STRUCTURED SOURCE-UNIT WRITER:
Return decisions, not modules/excluded. Each pagePlan.sourceUnits id MUST occur exactly
once as unitId. For each unit, preserve every eligible factual clause and qualifier in
outputs, or explain its removal in excludedReasons. A mixed unit may have both.
Each output has module, value and sourceUnitIds. Cite every unit supplying a number or
fact in that output. IDs refer only to units in this request. Preserve the full condition,
negation and sample context; a generic paraphrase must not replace specific source facts.
No outputs with no evidence. Do not omit a unit, add IDs or return an empty decision.
Use one primary home per fact; duplicate source units can be excluded as duplicate when
the fact is already retained. Do not label an inconvenient factual detail as unsupported
just to shorten copy. Keep eligible factual detail even in long passages.
"""
)


class UnitText(Input):
    module: str
    value: str = Field(min_length=1, max_length=3000)
    source_unit_ids: list[Id] = Field(min_length=1, max_length=100)


Reason = Literal[
    "price", "period", "platform", "health", "pii", "other_product", "unsupported", "duplicate"
]


class Decision(Input):
    unit_id: Id
    outputs: list[UnitText] = Field(max_length=30)
    excluded_reasons: list[Reason] = Field(max_length=8)


class UnitPage(Input):
    decisions: list[Decision] = Field(max_length=1000)


RESPONSE_TYPE = UnitPage


def request_payload(target, candidates):
    return legacy.PlannedBuilder.request_payload(target, candidates)


def convert(page, candidates):
    units = {u["id"]: u for u in build_page_plan(candidates)["sourceUnits"]}
    ids = [d.unit_id for d in page.decisions]
    if len(set(ids)) != len(ids) or set(ids) != set(units):
        raise ValueError("INVALID_UNIT_ACCOUNTING")
    modules, excluded = {}, []
    for decision in page.decisions:
        if not decision.outputs and not decision.excluded_reasons:
            raise ValueError("UNACCOUNTED_UNIT")
        cid = units[decision.unit_id]["candidateId"]
        for reason in decision.excluded_reasons:
            excluded.append({"candidateIds": [cid], "reason": reason})
        for text in decision.outputs:
            if (
                text.module not in legacy.TEXT_MODULE_FIELDS
                or decision.unit_id not in text.source_unit_ids
                or any(uid not in units for uid in text.source_unit_ids)
            ):
                raise ValueError("INVALID_UNIT_REFERENCE")
            citations = list(
                dict.fromkeys(units[uid]["candidateId"] for uid in text.source_unit_ids)
            )
            key = " ".join(text.value.split())
            existing = modules.setdefault(text.module, {}).get(key)
            if existing:
                existing["candidateIds"] = list(dict.fromkeys(existing["candidateIds"] + citations))
            else:
                modules[text.module][key] = {"value": text.value, "candidateIds": citations}
    return legacy.Refinement(
        modules=[
            {"module": name, "texts": list(texts.values())} for name, texts in modules.items()
        ],
        excluded=excluded,
    )


def refine(mode, model, target, candidates):
    import sys

    return legacy.refine(mode, model, target, candidates, contract=sys.modules[__name__])
