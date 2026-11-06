"""Read-only aggregate bridge for retained source-analysis artifacts.

Strict substring coverage is diagnostic, never semantic precision/recall or expert acceptance.
"""

from __future__ import annotations

import json
from pathlib import Path

from .gates import EvalGateError, digest


def wrap_source(directory, purpose="regression"):
    path = Path(directory)
    metadata = json.loads((path / "metadata.json").read_text())
    if metadata.get("split") != "development":
        raise EvalGateError("SEALED_SOURCE_HOLDOUT_REQUIRES_OWNER_AGGREGATES")
    score = json.loads((path / "score.json").read_text())
    report = json.loads((path / "report.json").read_text())
    if score.get("measurementVersion") != metadata.get("measurementVersion"):
        raise EvalGateError("SOURCE_MEASUREMENT_MISMATCH")
    gold = sorted((s["id"], s.get("goldSha256")) for s in score.get("sources", []))
    if not gold or any(not h for _, h in gold):
        raise EvalGateError("SOURCE_GOLD_HASH_MISSING")
    return {
        "schema_version": "evals-v2.1",
        "feature": "source_analysis",
        "split": "development",
        "purpose": purpose,
        "inputs_sha256": digest((path / "inputs.json").read_bytes()),
        "gold_sha256": digest(gold),
        "measurement_version": score["measurementVersion"],
        "scorer_sha256": metadata.get("scorerSha256"),
        "artifact_hashes": {
            name: digest((path / name).read_bytes())
            for name in ("metadata.json", "score.json", "report.json")
        },
        "config": {
            k: metadata.get(k)
            for k in (
                "model",
                "provider",
                "stage1PromptSha256",
                "stage2PromptSha256",
                "preprocessVersion",
                "sourceMaxOutputTokens",
                "ocrConcurrency",
                "ocrModel",
                "ocrPromptSha256",
            )
        },
        "sources": len(score.get("sources", [])),
        "diagnostic_coverage": {
            "overall": score.get("overall"),
            "by_format": score.get("byFormat"),
        },
        "performance_by_format": report.get("performanceByFormat"),
        "cost": {
            "settled_usd": metadata.get("settledUsd"),
            "unsettled_reservation_usd": metadata.get("unsettledReservedUsd"),
            "unknown_trials": sum(
                not s.get("costKnown", False) for s in metadata.get("sources", [])
            ),
        },
        "metric_units": {
            "factRecall": "strict matched fact units / gold fact units",
            "forbiddenViolations": (
                "detector hits; overlapping field/source hits are not unique materials"
            ),
            "unsupportedTokens": "detector token hits; not unique hallucinated statements",
        },
        "semantic_correctness": "UNREVIEWED",
        "factual_grounding_review": "UNREVIEWED",
        "human_review": "UNREVIEWED",
        "provider_provenance": "UNVERIFIED"
        if not metadata.get("providerTraceVerified")
        else "VERIFIED",
        "metric_interpretation": (
            "Exact substring gold coverage and code safety proxies; not semantic model accuracy."
        ),
        "measured_readiness": False,
    }


def compare_source(before, after):
    keys = ("feature", "split", "purpose", "inputs_sha256", "gold_sha256", "measurement_version")
    mismatches = [k for k in keys if not before.get(k) or before.get(k) != after.get(k)]
    if mismatches:
        raise EvalGateError("SOURCE_INCOMPARABLE:" + ",".join(mismatches))
    for key in ("model", "provider"):
        if before["config"].get(key) != after["config"].get(key):
            raise EvalGateError("SOURCE_MODEL_OR_PROVIDER_CHANGED")
    scorer_verified = bool(before.get("scorer_sha256")) and before["scorer_sha256"] == after.get(
        "scorer_sha256"
    )
    provider_verified = all(r.get("provider_provenance") == "VERIFIED" for r in (before, after))
    return {
        "comparison_eligible": scorer_verified and provider_verified,
        "diagnostic_comparison_eligible": True,
        "limitations": ([] if scorer_verified else ["HISTORICAL_SCORER_CODE_HASH_NOT_ATTESTED"])
        + ([] if provider_verified else ["HISTORICAL_PROVIDER_TRACE_NOT_VERIFIED"]),
        "before": before,
        "after": after,
        "measured_readiness": False,
    }
