"""Local, budgeted before/after refinement using frozen DEVELOPMENT candidates only."""

import argparse
import hashlib
import html
import importlib.util
import json
import math
import time
from pathlib import Path

from sqlalchemy.engine import make_url

from app.ai import page_writer, source_refine
from app.ai.page_plan import writing_groups
from app.core.config import get_settings
from app.source_analysis import final_score, refinement
from app.source_analysis.final_eval import Calls, costs, private_path, write_json
from app.source_analysis.preprocess import scrub


def load_baseline(path):
    spec = importlib.util.spec_from_file_location("frozen_baseline_refine", path)
    module = importlib.util.module_from_spec(spec)
    # dataclasses consult the defining module while loading it.
    import sys

    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def duplicate_texts(modules):
    seen, count = set(), 0
    for module in modules:
        for text in module["texts"]:
            key = final_score.compact(text)
            count += key in seen
            seen.add(key)
    return count


def validate_limits(max_usd, trials, consent):
    if not consent or not math.isfinite(max_usd) or not 0 < max_usd <= 5:
        raise ValueError("EXPLICIT_CONSENT_AND_BUDGET_REQUIRED")
    if trials not in {1, 2, 3}:
        raise ValueError("INVALID_TRIAL_COUNT")


def private_output(path):
    destination = private_path(path)
    if any((parent / ".git").exists() for parent in [destination, *destination.parents]):
        raise ValueError("PRIVATE_OUTPUT_OUTSIDE_CHECKOUT_REQUIRED")
    return destination


def page_wide_recall(source, record):
    """Diagnostic only: frozen token matches independent of prescribed section."""
    text = "\n".join(t for m in record["modules"] for t in m["texts"])
    valid = record["status"] in {"EVALUATED", "PARTIAL"}
    facts = [f for s in source["sentences"] for f in s["facts"]]
    hits = [f for f in facts if valid and final_score.contains(f["mustContain"], text)]
    return {
        "hit": len(hits),
        "total": len(facts),
        "criticalHit": sum(f["critical"] for f in hits),
        "criticalTotal": sum(f["critical"] for f in facts),
    }


def render_comparison(rows):
    parts = [
        "<!doctype html><html lang='ko'><meta charset='utf-8'>",
        "<title>DEV-445 private development comparison</title>",
        "<style>body{font:16px/1.7 system-ui;max-width:1200px;margin:40px auto;"
        "padding:20px;background:#f7f7f2}section{display:grid;grid-template-columns:1fr 1fr;"
        "gap:24px}article{background:white;padding:24px;border-radius:16px}"
        "h3{color:#246b43}p{white-space:pre-wrap}@media(max-width:700px){"
        "section{grid-template-columns:1fr}}</style>",
        "<h1>Page drafting — development comparison</h1>",
        "<p>Private development output. Not producer acceptance or release readiness. "
        "Exact-duplicate counts do not measure semantic repetition or writing quality.</p>",
    ]
    for row in rows:
        parts.append(f"<h2>{html.escape(row['id'])} · trial {row['trial']}</h2><section>")
        for arm in ("baseline", "candidate"):
            result = row[arm]
            parts.append(f"<article><h2>{arm}</h2><p>{result['status']}</p>")
            for module in result["modules"]:
                parts.append(f"<h3>{html.escape(module['module'])}</h3>")
                parts.extend(f"<p>{html.escape(t)}</p>" for t in module["texts"])
            parts.append("</article>")
        parts.append("</section>")
    return "".join(parts) + "</html>"


def run(args):
    cfg = get_settings()
    url = make_url(cfg.database_url)
    if cfg.app_env != "local" or url.host not in {"localhost", "127.0.0.1"}:
        raise ValueError("LOCAL_DATABASE_REQUIRED")
    if url.database != "farmclub_dev445_eval":
        raise ValueError("ISOLATED_EVALUATION_DATABASE_REQUIRED")
    validate_limits(args.max_usd, args.trials, args.yes)
    out = private_output(args.out)
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    metadata = json.loads((args.snapshot / "metadata.json").read_text())
    if metadata.get("split") != "development":
        raise ValueError("DEVELOPMENT_SNAPSHOT_REQUIRED")
    raw = json.loads(args.gold.read_text())
    sources = raw if isinstance(raw, list) else raw["sources"]
    formats = {s["id"]: s["format"] for s in metadata["sources"]}
    if {s["id"] for s in sources} != set(formats):
        raise ValueError("COHORT_MISMATCH")
    gold = {
        "schemaVersion": 1,
        "split": "development",
        "sources": [{**s, "format": formats[s["id"]]} for s in sources],
    }
    final_score.Gold.model_validate(gold)
    frozen = {}
    snapshot_hash = hashlib.sha256()
    for source in sources:
        sid = source["id"]
        data = (args.snapshot / (sid + ".stored.json")).read_bytes()
        snapshot_hash.update(sid.encode() + b"\0" + data)
        frozen[sid] = json.loads(data)
    # Only import the API key, never deployment/production DB settings.
    if args.env_file:
        from dotenv import dotenv_values

        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
    if not cfg.openrouter_api_key:
        raise ValueError("MISSING_PROVIDER_KEY")
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = 5
    baseline = load_baseline(args.baseline)
    candidate_builder = page_writer if args.strategy == "units" else source_refine.PlannedBuilder
    calls = Calls("openrouter", args.max_usd)
    safe_texts = {s["id"]: (args.snapshot / (s["id"] + ".safe.txt")).read_text() for s in sources}
    rows, scores = [], []
    write_json(
        out / "protocol.json",
        {
            "split": "development",
            "trials": args.trials,
            "model": args.model,
            "goldSha256": hashlib.sha256(args.gold.read_bytes()).hexdigest(),
            "snapshotMetadataSha256": hashlib.sha256(
                (args.snapshot / "metadata.json").read_bytes()
            ).hexdigest(),
            "acceptedCandidatesSha256": snapshot_hash.hexdigest(),
            "baselineSourceSha256": hashlib.sha256(args.baseline.read_bytes()).hexdigest(),
            "candidatePromptSha256": hashlib.sha256(candidate_builder.PROMPT.encode()).hexdigest(),
            "candidateVersion": candidate_builder.PROMPT_VERSION,
            "strategy": args.strategy,
            "baselineVersion": baseline.PROMPT_VERSION,
            "maxUsd": args.max_usd,
        },
    )
    for trial in range(1, args.trials + 1):
        records = {"baseline": [], "candidate": []}
        for source in sources:
            sid = source["id"]
            stored = frozen[sid]
            candidates, _ = refinement.limit_candidates(stored.get("candidates", []))
            safe = [
                {
                    **c,
                    "value": scrub(c["value"]),
                    "evidence": [{**e, "quote": scrub(e["quote"])} for e in c["evidence"]],
                }
                for c in candidates
            ]
            target = {"id": "eval-target", "name": scrub(source["product"])}
            row = {"id": sid, "trial": trial}
            # Alternate ordering to reduce systematic service/time bias.
            order = [("baseline", baseline), ("candidate", candidate_builder)]
            if trial % 2 == 0:
                order.reverse()
            for arm, builder in order:
                record = {"id": sid, "format": formats[sid], "status": "FAILED", "modules": []}
                started = time.monotonic()
                try:
                    payload = (
                        builder.request_payload(target, safe)
                        if hasattr(builder, "request_payload")
                        else {"target": target, "candidates": safe}
                    )
                    if arm == "candidate" and args.strategy in {"grouped", "units"}:
                        grouped_modules, grouped_exclusions = [], []
                        for group in writing_groups(
                            safe, max_candidates=5 if args.strategy == "units" else 10
                        ):
                            part = calls(
                                "refine",
                                args.model,
                                {
                                    "prompt": builder.PROMPT,
                                    **builder.request_payload(target, group),
                                },
                                [target],
                                [],
                                lambda b=builder, t=target, s=group: b.refine(
                                    "openrouter", args.model, t, s
                                ),
                            )
                            grouped_modules.extend(part.refinement.modules)
                            grouped_exclusions.extend(part.refinement.excluded)
                        # Merge exact text within a module, retaining every citation.
                        merged = {}
                        for module in grouped_modules:
                            texts = merged.setdefault(module.module, {})
                            for text in module.texts:
                                key = final_score.compact(text.value)
                                if key not in texts:
                                    texts[key] = {"value": text.value, "candidateIds": []}
                                texts[key]["candidateIds"] = list(
                                    dict.fromkeys(texts[key]["candidateIds"] + text.candidate_ids)
                                )
                        response = source_refine.RefineResponse(
                            source_refine.Refinement(
                                modules=[
                                    {"module": m, "texts": list(ts.values())}
                                    for m, ts in merged.items()
                                ],
                                excluded=grouped_exclusions,
                            ),
                            {},
                            None,
                        )
                    else:
                        response = calls(
                            "refine",
                            args.model,
                            {"prompt": builder.PROMPT, **payload},
                            [target],
                            [],
                            lambda b=builder, t=target, s=safe: b.refine(
                                "openrouter", args.model, t, s
                            ),
                        )
                    modules, diagnostics = refinement.validate(
                        response.refinement,
                        safe,
                        target["id"],
                        target_count=1,
                        target_name=target["name"],
                    )
                    record.update(
                        status="EVALUATED" if modules else "EMPTY",
                        modules=[
                            {"module": m["module"], "texts": [t["value"] for t in m["texts"]]}
                            for m in modules
                        ],
                    )
                    write_json(out / f"{sid}-{trial}-{arm}-diagnostics.json", diagnostics)
                except Exception as exc:
                    record["errorCode"] = getattr(exc, "code", "COMPARISON_FAILED")
                record["durationMs"] = (time.monotonic() - started) * 1000
                row[arm] = record
                records[arm].append(
                    {k: v for k, v in record.items() if k in {"id", "format", "status", "modules"}}
                )
            rows.append(row)
            write_json(out / "outputs.json", rows)
            write_json(out / "calls.json", calls.entries)
        for arm in records:
            report = final_score.score(gold, records[arm], safe_texts)
            scores.append(
                {
                    "trial": trial,
                    "arm": arm,
                    "overall": report["overall"],
                    "byFormat": report["byFormat"],
                    "exactRepeatedTexts": sum(duplicate_texts(r["modules"]) for r in records[arm]),
                }
            )
        write_json(out / "scores.json", scores)
        (out / "comparison.html").write_text(render_comparison(rows))
    summary = {
        "scores": scores,
        "spend": costs(calls.entries),
        "verdict": "DEVELOPMENT_ONLY_HUMAN_EDITORIAL_REVIEW_PENDING",
    }
    write_json(out / "summary.json", summary)
    print(json.dumps(summary))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--gold", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--model", default="google/gemini-3-flash-preview")
    parser.add_argument("--trials", type=int, default=2)
    parser.add_argument("--max-usd", type=float, default=5)
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--strategy", choices=["single", "grouped", "units"], default="single")
    try:
        run(parser.parse_args())
    except Exception:
        # Pydantic/provider exceptions may contain private source text or credentials.
        print(json.dumps({"error": "PAGE_COMPARISON_FAILED", "details": "redacted"}))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
