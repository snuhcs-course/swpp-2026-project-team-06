"""Fail-closed provenance gates. Missing measurements are not negative quality scores."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

VERSION = "evals-v2.1"


class EvalGateError(ValueError):
    pass


def digest(value):
    data = (
        value
        if isinstance(value, bytes)
        else json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    )
    return hashlib.sha256(data).hexdigest()


def scorer_digest():
    return digest(
        b"\n".join(
            p.name.encode() + b":" + p.read_bytes()
            for p in sorted(Path(__file__).parent.glob("*.py"))
        )
    )


def provider_evidence(trace):
    p = trace.get("provider_result") or {}
    usage = p.get("usage") or {}
    actual = p.get("last_model") or p.get("actual_model")
    inputs = usage.get("input_tokens", usage.get("prompt_tokens"))
    outputs = usage.get("output_tokens", usage.get("completion_tokens"))
    valid = (
        p.get("upstream_status") == 200
        and bool(p.get("response_id"))
        and bool(actual)
        and type(inputs) is int
        and inputs >= 0
        and type(outputs) is int
        and outputs > 0
        and type(p.get("request_delta")) is int
        and p["request_delta"] >= 1
    )
    return {
        "valid": bool(valid),
        "actual_model": actual,
        "provider": p.get("provider"),
        "input_tokens": inputs,
        "output_tokens": outputs,
        "http_status": p.get("upstream_status"),
        "response_id": p.get("response_id"),
        "request_delta": p.get("request_delta"),
        "cost_usd": p.get("cost_usd", usage.get("cost")),
    }


def provider_matches(provider, manifest):
    route = manifest.get("provider_route", "")
    expected_provider = route.removesuffix("-compatible")
    return (
        provider.get("actual_model") == manifest.get("actual_model")
        and provider.get("provider") == expected_provider
    )


def gate_cohort(manifest, cases, fidelity_audits, smoke_trace):
    errors = []
    required = (
        "suite_id",
        "split",
        "purpose",
        "cases_sha256",
        "rubric_sha256",
        "scorer_sha256",
        "fixture_revision",
        "runner_sha256",
        "application_commit",
        "source_sha256",
        "config_sha256",
        "environment",
        "actual_model",
        "provider_route",
    )
    errors += [f"MISSING_{k.upper()}" for k in required if not manifest.get(k)]
    if manifest.get("schema_version") != VERSION:
        errors.append("MANIFEST_VERSION")
    if manifest.get("split") not in {"development", "holdout"}:
        errors.append("SPLIT")
    if manifest.get("purpose") not in {"regression", "capability"}:
        errors.append("PURPOSE")
    if manifest.get("runs_per_case") != 3:
        errors.append("TRIAL_COUNT")
    from .grading import compile_rubric

    if manifest.get("cases_sha256") != digest(cases):
        errors.append("CORPUS_HASH_MISMATCH")
    if manifest.get("rubric_sha256") != digest([compile_rubric(c) for c in cases]):
        errors.append("RUBRIC_HASH_MISMATCH")
    if manifest.get("scorer_sha256") != scorer_digest():
        errors.append("SCORER_HASH_MISMATCH")
    if not isinstance(manifest.get("config"), dict) or manifest.get("config_sha256") != digest(
        manifest.get("config")
    ):
        errors.append("CONFIG_HASH_MISMATCH")
    ids = [c.get("id") for c in cases]
    if not cases or None in ids or len(set(ids)) != len(ids):
        errors.append("CASE_IDENTITIES")
    if len(fidelity_audits) != len(cases) or any(
        a.get("case_id") != cid or a.get("diff") != {}
        for cid, a in zip(ids, fidelity_audits, strict=False)
    ):
        errors.append("FIXTURE_FIDELITY")
    env = manifest.get("environment") or {}
    if env.get("database_host") not in {"localhost", "127.0.0.1", "::1"}:
        errors.append("NONLOCAL_DATABASE")
    if env.get("runtime_source_verified") is not True:
        errors.append("RUNTIME_SOURCE_UNVERIFIED")
    if not env.get("fixed_now"):
        errors.append("CLOCK_NOT_FROZEN")
    p = provider_evidence(smoke_trace)
    if not p["valid"]:
        errors.append("PROVIDER_SMOKE_FAILED")
    if not provider_matches(p, manifest):
        errors.append("MODEL_MISMATCH")
    if (smoke_trace.get("response") or {}).get("status") != 200:
        errors.append("PRODUCT_SMOKE_FAILED")
    if smoke_trace.get("status") == "BLOCKED":
        errors.append("SMOKE_BLOCKED")
    response_data = (smoke_trace.get("response") or {}).get("json") or {}
    reply = response_data.get("reply") or {}
    if reply.get("senderType") != "AI" or not reply.get("body"):
        errors.append("MODEL_PRODUCT_REPLY_NOT_OBSERVED")
    expected = [response_data.get("message"), response_data.get("reply")]
    if not expected[0] or any(
        not any(
            m.get("messageId") == observed.get("messageId")
            and m.get("body") == observed.get("body")
            for m in smoke_trace.get(view, [])
        )
        for observed in expected
        if observed
        for view in ("consumer_view", "producer_view")
    ):
        errors.append("SMOKE_PERSISTENCE_UNVERIFIED")
    if errors:
        raise EvalGateError(";".join(errors))
    return {
        "status": "PASS",
        "manifest_sha256": digest(manifest),
        "fixture_checked": len(cases),
        "fixture_fidelity": 1.0,
        "provider": p,
        "human_review": "UNREVIEWED",
        "readiness": False,
    }


def comparison_gate(before, after):
    keys = (
        "schema_version",
        "suite_id",
        "split",
        "purpose",
        "cases_sha256",
        "rubric_sha256",
        "scorer_sha256",
        "fixture_revision",
        "runner_sha256",
        "config_sha256",
        "actual_model",
        "provider_route",
        "runs_per_case",
    )
    differences = [k for k in keys if not before.get(k) or before.get(k) != after.get(k)]
    if differences:
        raise EvalGateError("INCOMPARABLE:" + ",".join(differences))
    return {
        "eligible": True,
        "application_changed": before["source_sha256"] != after["source_sha256"],
        "note": (
            "Same corpus/rubric/scorer/config; "
            "this is not evidence of population-level significance."
        ),
    }
