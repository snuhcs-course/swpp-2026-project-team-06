"""Aggregate all trials, including failures, blocked prerequisites and unknown cost."""

from __future__ import annotations

import math
from collections import Counter, defaultdict


def _rates(rows):
    counts = Counter(r["verdict"] for r in rows)
    return dict(sorted(counts.items()))


def summarize(cases, results, manifest=None):
    seen = [(r["case_id"], r["run"]) for r in results]
    expected = {(c["id"], n) for c in cases for n in (1, 2, 3)}
    if len(seen) != len(set(seen)) or not set(seen) <= expected:
        raise ValueError("DUPLICATE_OR_UNPLANNED_TRIAL")
    dimensions = {
        d: dict(Counter(r["dimensions"].get(d, "UNREVIEWED") for r in results))
        for d in ("action", "factual_grounding", "semantic_correctness", "state_outcome", "privacy")
    }
    by_case = defaultdict(list)
    for r in results:
        by_case[r["case_id"]].append(r)
    strata = {}
    for stratum in sorted({c["stratum"] for c in cases}):
        ids = {c["id"] for c in cases if c["stratum"] == stratum}
        rows = [r for r in results if r["case_id"] in ids]
        stable = sum(
            len(by_case[cid]) == 3
            and all(r["verdict"] == "AUTO_PASS_PENDING_REVIEW" for r in by_case[cid])
            for cid in ids
        )
        any_pass = sum(
            any(r["verdict"] == "AUTO_PASS_PENDING_REVIEW" for r in by_case[cid]) for cid in ids
        )
        strata[stratum] = {
            "planned": len(ids) * 3,
            "attempted": len(rows),
            "statuses": _rates(rows),
            "cases": len(ids),
            "stable_screening_cases_3_of_3": stable,
            "screening_cases_at_least_one_of_3": any_pass,
        }
    latencies = sorted(
        r["latency_ms"]
        for r in results
        if isinstance(r.get("latency_ms"), (int, float)) and r["latency_ms"] >= 0
    )

    def percentile(p):
        return latencies[max(0, math.ceil(p * len(latencies)) - 1)] if latencies else None

    known_cost, unknown = 0.0, 0
    for row in results:
        cost = row["provider"].get("cost_usd")
        if cost is None:
            if row["path"] in {"model", "fault", "fallback"}:
                unknown += 1
        elif isinstance(cost, (int, float)) and math.isfinite(cost) and cost >= 0:
            known_cost += cost
        else:
            unknown += 1
    eligible = [r for r in results if r["model_quality_eligible"]]
    model_successes = sum(r["verdict"] == "AUTO_PASS_PENDING_REVIEW" for r in eligible)
    return {
        "model_screening": {
            "eligible_trials": len(eligible),
            "successes": model_successes,
            "rate": model_successes / len(eligible) if eligible else None,
            "zero_denominator": "N/A" if not eligible else None,
        },
        "schema_version": "evals-v2.1",
        "cohort": (manifest or {}).get("cohort"),
        "planned": len(expected),
        "attempted": len(results),
        "not_run": len(expected) - len(results),
        "statuses": _rates(results),
        "dimension_counts": dimensions,
        "strata": strata,
        "path_coverage": dict(Counter(r["path"] for r in results)),
        "model_quality_eligible_trials": sum(r["model_quality_eligible"] for r in results),
        "failure_causes": dict(Counter(reason for r in results for reason in r["reasons"])),
        "latency_ms": {"n": len(latencies), "p50": percentile(0.5), "p95": percentile(0.95)},
        "cost": {
            "known_usd": known_cost,
            "unknown_trials": unknown,
            "all_cost_known": unknown == 0,
        },
        "human_review_pending": True,
        "llm_calibration": "UNREVIEWED",
        "measured_readiness": False,
        "interpretation": (
            "Automated bounded screening; neither human-reviewed quality "
            "nor population-level reliability."
        ),
    }
