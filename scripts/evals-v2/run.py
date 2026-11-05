#!/usr/bin/env python3
"""DEV-241: immutable local cohorts, offline rescore and comparable aggregate reports."""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from datetime import UTC, datetime
from pathlib import Path

from evalsys import (
    EvalGateError,
    comparison_gate,
    compile_rubric,
    digest,
    gate_cohort,
    grade_trial,
    scorer_digest,
    summarize,
)


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    with Path(path).open("x", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2, sort_keys=True)


def load_cases(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def run(args):
    from evalsys.adapter import LegacyAdapter

    if (
        not math.isfinite(args.max_usd)
        or args.max_usd <= 0
        or not math.isfinite(args.trial_reserve_usd)
        or args.trial_reserve_usd <= 0
    ):
        raise EvalGateError("INVALID_BUDGET")
    if args.timeout_ms != 8000:
        raise EvalGateError("FAULT_LATENCY_BUDGET_MUST_BE_8000")
    if args.split == "holdout":
        raise EvalGateError("HOLDOUT_REQUIRES_INDEPENDENT_SEALED_RUNNER")
    if digest(Path(args.cases).read_bytes()) != args.expected_cases_sha:
        raise EvalGateError("FROZEN_CASE_BYTES_MISMATCH")
    cases = load_cases(args.cases)
    smoke_cases = [c for c in cases if c["id"] == args.smoke_case]
    if len(smoke_cases) != 1:
        raise EvalGateError("SMOKE_CASE_NOT_UNIQUE")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)
    adapter = LegacyAdapter(args.runner, args.api, args.proxy)
    manifest = {
        "schema_version": "evals-v2.1",
        "cohort": args.cohort,
        "suite_id": args.suite,
        "split": args.split,
        "purpose": args.purpose,
        "cases_sha256": digest(cases),
        "cases_file_sha256": digest(Path(args.cases).read_bytes()),
        "rubric_sha256": digest([compile_rubric(c) for c in cases]),
        "scorer_sha256": scorer_digest(),
        "fixture_revision": args.fixture_revision,
        "application_commit": adapter.commit(),
        "source_sha256": adapter.initial_source,
        "runner_sha256": digest(Path(args.runner).read_bytes()),
        "config_sha256": digest(
            {
                "fixed_now": os.environ.get("FIXED_NOW"),
                "fault_latency_budget_ms": args.timeout_ms,
                "runner_http_timeout_seconds": 60,
                "max_retries": 0,
                "fixture_sha256": adapter.fixture_sha256,
                "actual_model": args.actual_model,
                "provider_route": args.provider_route,
            }
        ),
        "environment": adapter.manifest_environment(),
        "actual_model": args.actual_model,
        "provider_route": args.provider_route,
        "runs_per_case": 3,
        "seed": args.seed,
        "created_utc": datetime.now(UTC).isoformat(),
        "max_usd": args.max_usd,
        "trial_reserve_usd": args.trial_reserve_usd,
        "calibration": "UNREVIEWED",
    }
    manifest["config"] = {
        "fixed_now": os.environ.get("FIXED_NOW"),
        "fault_latency_budget_ms": args.timeout_ms,
        "runner_http_timeout_seconds": 60,
        "max_retries": 0,
        "fixture_sha256": adapter.fixture_sha256,
        "actual_model": args.actual_model,
        "provider_route": args.provider_route,
    }
    write(out / "manifest.json", manifest)
    write(
        out / "cases.json", cases
    )  # public dev corpus only; sealed holdout uses a separate runner
    trial_scope = args.cohort + "-" + digest(manifest)[:12]
    fidelity = adapter.fidelity(cases, trial_scope)
    write(out / "fidelity.json", fidelity)
    if any(x["diff"] for x in fidelity):
        raise EvalGateError("FIXTURE_FIDELITY")
    if args.max_usd < args.trial_reserve_usd:
        raise EvalGateError("INSUFFICIENT_SMOKE_RESERVE")
    smoke = adapter.run(smoke_cases[0], 0, f"-v2-{trial_scope}-smoke")
    write(out / "smoke.json", smoke)
    gate = gate_cohort(manifest, cases, fidelity, smoke)
    write(out / "gate.json", gate)
    print(
        json.dumps(
            {
                "preflight": "PASS",
                "fixture_checked": len(cases),
                "actual_model": gate["provider"]["actual_model"],
            }
        ),
        flush=True,
    )
    if args.preflight_only:
        return
    schedule = [(c, n) for c in cases for n in (1, 2, 3)]
    random.Random(args.seed).shuffle(schedule)
    results = []
    known_spent = gate["provider"].get("cost_usd")
    if not isinstance(known_spent, (int, float)):
        raise EvalGateError("SMOKE_COST_UNKNOWN")
    (out / "traces").mkdir()
    for index, (case, n) in enumerate(schedule, 1):
        if known_spent + args.trial_reserve_usd > args.max_usd:
            break
        trace = adapter.run(case, n, f"-v2-{trial_scope}")
        trace["application_source_sha256"] = manifest["source_sha256"]
        trace["manifest_sha256"] = digest(manifest)
        write(out / "traces" / f"trial-{index:04}.json", trace)
        result = grade_trial(case, trace, manifest)
        results.append(result)
        cost = result["provider"].get("cost_usd")
        unknown_cost = result["path"] in {"model", "fault", "fallback"} and not isinstance(
            cost, (int, float)
        )
        if isinstance(cost, (int, float)):
            known_spent += cost
        print(
            json.dumps(
                {
                    "attempted": len(results),
                    "planned": len(schedule),
                    "status": result["verdict"],
                    "path": result["path"],
                }
            ),
            flush=True,
        )
        if (
            unknown_cost
            or result["verdict"] == "INVALID"
            or (isinstance(cost, (int, float)) and cost > args.trial_reserve_usd)
        ):
            break  # no further paid calls after invalid provenance or uncertain reservation
    write(out / "scores.json", results)
    summary = summarize(cases, results, manifest)
    summary["cost"]["including_smoke_known_usd"] = known_spent
    write(out / "summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if summary["not_run"] or "INVALID" in summary["statuses"]:
        raise EvalGateError("COHORT_INCOMPLETE_OR_INVALID")


def require_gate(directory, manifest):
    gate = read(directory / "gate.json")
    if gate.get("status") != "PASS" or gate.get("manifest_sha256") != digest(manifest):
        raise EvalGateError("SAVED_PREFLIGHT_GATE_UNVERIFIED")


def rescore(args):
    source = Path(args.input)
    old = read(source / "manifest.json")
    require_gate(source, old)
    cases = read(source / "cases.json")
    if old["split"] == "holdout":
        raise EvalGateError("SEALED_HOLDOUT_RESCORE_VIA_OWNER_ONLY")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)
    manifest = {
        **old,
        "scorer_sha256": scorer_digest(),
        "rubric_sha256": digest([compile_rubric(c) for c in cases]),
        "rescore_of_manifest": digest(old),
        "created_utc": datetime.now(UTC).isoformat(),
    }
    write(out / "manifest.json", manifest)
    write(out / "cases.json", cases)
    fidelity, smoke = read(source / "fidelity.json"), read(source / "smoke.json")
    write(out / "fidelity.json", fidelity)
    write(out / "smoke.json", smoke)
    write(out / "gate.json", gate_cohort(manifest, cases, fidelity, smoke))
    (out / "traces").mkdir()
    mapping = {c["id"]: c for c in cases}
    scores = []
    for path in sorted((source / "traces").glob("trial-*.json")):
        trace = read(path)
        write(out / "traces" / path.name, trace)
        scores.append(grade_trial(mapping[trace["case"]], trace, manifest))
    write(out / "scores.json", scores)
    write(out / "summary.json", summarize(cases, scores, manifest))
    print(json.dumps({"rescored": len(scores), "original_preserved": True}))


def compare(args):
    before, after = Path(args.before), Path(args.after)
    a, b = read(before / "manifest.json"), read(after / "manifest.json")
    require_gate(before, a)
    require_gate(after, b)
    result = comparison_gate(a, b)
    sa, sb = read(before / "summary.json"), read(after / "summary.json")
    if sa["not_run"] or sb["not_run"] or "INVALID" in sa["statuses"] or "INVALID" in sb["statuses"]:
        raise EvalGateError("INCOMPLETE_OR_INVALID_COHORT_COMPARISON")
    result.update(before=sa, after=sb)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def source_compare(args):
    from evalsys.source import compare_source, wrap_source

    result = compare_source(
        wrap_source(args.before, args.purpose), wrap_source(args.after, args.purpose)
    )
    if args.out:
        write(Path(args.out), result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("run")
    for flag in (
        "runner",
        "cases",
        "api",
        "proxy",
        "out",
        "cohort",
        "actual-model",
        "provider-route",
        "smoke-case",
    ):
        p.add_argument("--" + flag, required=True)
    p.add_argument("--expected-cases-sha", required=True)
    p.add_argument("--suite", default="farmclub-ai-support-v2")
    p.add_argument("--split", choices=["development", "holdout"], required=True)
    p.add_argument("--purpose", choices=["regression", "capability"], required=True)
    p.add_argument("--fixture-revision", default="synthetic-v1")
    p.add_argument("--seed", type=int, default=1542026)
    p.add_argument("--timeout-ms", type=int, default=8000)
    p.add_argument("--max-usd", type=float, required=True)
    p.add_argument("--trial-reserve-usd", type=float, default=0.01)
    p.add_argument("--preflight-only", action="store_true")
    p.set_defaults(fn=run)
    p = commands.add_parser("rescore")
    p.add_argument("--input", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(fn=rescore)
    p = commands.add_parser("compare")
    p.add_argument("--before", required=True)
    p.add_argument("--after", required=True)
    p.set_defaults(fn=compare)
    p = commands.add_parser("source-compare")
    p.add_argument("--before", required=True)
    p.add_argument("--after", required=True)
    p.add_argument("--purpose", choices=["regression", "capability"], default="regression")
    p.add_argument("--out")
    p.set_defaults(fn=source_compare)
    args = parser.parse_args()
    try:
        args.fn(args)
    except (EvalGateError, FileExistsError) as e:
        print(
            json.dumps({"status": "BLOCKED", "reason": str(e), "readiness": False}), file=sys.stderr
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
