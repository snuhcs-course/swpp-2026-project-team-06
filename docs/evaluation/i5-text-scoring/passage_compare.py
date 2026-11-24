"""DEV-451 private paired passage experiment. Dry-run by default; never a release gate."""

import argparse
import copy
import fcntl
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))

from app.ai import source_refine as ai
from app.ai.source_analysis import ExtractionError
from app.core.config import SOURCE_OPENROUTER_PRICES, get_settings
from app.core.db import get_sessionmaker
from app.source_analysis import (
    budget,
    refinement,
    text_score,
)
from app.source_analysis import passage_refinement as passage
from app.source_analysis.final_eval import Calls
from app.source_analysis.final_score import Gold, Run
from app.source_analysis.models import Spend
from app.source_analysis.preprocess import scrub
from app.source_analysis.source_inventory import build_inventory
from sqlalchemy import func, select
from sqlalchemy.engine import make_url

MODEL = "google/gemini-3-flash-preview"
OUTPUT_TOKENS = 8000
TRIALS = (1, 2)
PHASE_CAP_MICROS = 1_500_000
GLOBAL_CAP_MICROS = 5_000_000
PHASE_BASELINE = {"rows": 438, "settledMicros": 1_371_739, "uncertainReservedMicros": 828_496}
PRIMARY_IDS = {
    "ssarijai", "h3-text-01", "farm-mong", "h3-image-03", "oasis-long",
    "h3-long_image-01", "farm-father", "h3-pdf-02",
}
SUPPLEMENT_IDS = {"h3-pdf-03", "h3-long_image-03"}
VERSION = "passage-comparison-v1"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def write_json(path, value):
    # Individual files are immutable too; journal files are versioned per attempt.
    with path.open("x", encoding="utf-8") as handle:
        path.chmod(0o600)
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def _compact_schema(value):
    if isinstance(value, dict):
        return {k: _compact_schema(v) for k, v in value.items()
                if k not in {"minItems", "maxItems", "minLength", "maxLength", "title"}}
    if isinstance(value, list):
        return [_compact_schema(v) for v in value]
    return value


def _private_strings(value, generated=(), key=None):
    if isinstance(value, str):
        if key in {"requestSha256", "safetyListsHash"}:
            return []
        if key in {"id", "unitId"} and value in generated:
            return []
        return [value]
    if isinstance(value, dict):
        return [s for k, v in value.items() for s in [k, *_private_strings(v, generated, k)]]
    if isinstance(value, list):
        return [s for v in value for s in _private_strings(v, generated, key)]
    return []


def request_envelope(prompt, payload, schema):
    """Mirror the complete OpenRouter transport, including repeated system/schema bytes."""
    input_rate, output_rate = SOURCE_OPENROUTER_PRICES[MODEL]
    return {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "Refinement", "strict": True, "schema": schema},
        },
        "max_tokens": OUTPUT_TOKENS,
        "extra_body": {
            "reasoning": {"effort": "minimal", "exclude": True},
            "provider": {"require_parameters": True, "allow_fallbacks": False,
                         "max_price": {"prompt": input_rate, "completion": output_rate}},
        },
    }


def prepare(data, *, cohort="primary"):
    """Preflight every source before reservation; invalid sources fail both paired arms.

    Gold/safeTexts are offline-only scoring inputs. Only accepted candidates and the
    target enter either provider request. No raw OCR or rejected candidates are rescued.
    """
    try:
        if type(data) is not dict or set(data) != {"version", "gold", "safeTexts", "sources"}:
            raise ValueError
        if type(data["version"]) is not int or data["version"] != 1:
            raise ValueError
        parsed = Gold.model_validate(data["gold"])
        if parsed.split != "development" or cohort not in {"primary", "supplement"}:
            raise ValueError
        expected = PRIMARY_IDS if cohort == "primary" else SUPPLEMENT_IDS
        ids = [s.id for s in parsed.sources]
        if set(ids) != expected or len(ids) != len(expected):
            raise ValueError
        if type(data["safeTexts"]) is not dict or set(data["safeTexts"]) != expected:
            raise ValueError
        if any(type(t) is not str for t in data["safeTexts"].values()):
            raise ValueError
        if type(data["sources"]) is not list or len(data["sources"]) != len(ids):
            raise ValueError
        rows = {row["id"]: row for row in data["sources"]}
        if set(rows) != expected:
            raise ValueError
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ValueError("INVALID_DEVELOPMENT_PASSAGE_COHORT") from None
    prepared = []
    for sid in ids:
        source, row = next(s for s in parsed.sources if s.id == sid), rows[sid]
        result = {"id": sid, "format": source.format, "eligible": False}
        try:
            if set(row) != {"id", "target", "candidates", "acceptedCandidateIds",
                            "sourceRevisions", "baselineRecord"}:
                raise ValueError("INVALID_SOURCE_ENVELOPE")
            saved = Run.model_validate(row["baselineRecord"])
            if saved.id != sid or saved.format != source.format:
                raise ValueError("INVALID_SAVED_BASELINE")
            inventory = build_inventory(
                row["candidates"], accepted_candidate_ids=row["acceptedCandidateIds"],
                target_id=row["target"]["id"], source_revisions=row["sourceRevisions"],
            )
            accepted = inventory["candidates"]
            if not accepted:
                raise ValueError("NO_ACCEPTED_CANDIDATES")
            if any(e["sourceId"] != sid for c in accepted for e in c["evidence"]):
                raise ValueError("CROSS_SOURCE_CANDIDATES")
            request = passage.prepare_request(
                row["target"], inventory, source_revisions=row["sourceRevisions"],
            )
            # This is the adapter's exact lossless projection, not an independently
            # invented/smaller approximation of its actual transmission.
            wire = passage.provider_payload(request)
            generated = {p["id"] for p in request["passages"]}
            generated.update(u["id"] for u in inventory["units"])
            baseline_payload = {"target": row["target"], "candidates": accepted}
            if any(scrub(t) != t for t in _private_strings(baseline_payload)) or any(
                scrub(t) != t for t in _private_strings(wire, generated)
            ):
                raise ValueError("PRIVATE_SOURCE")
            limited, _ = refinement.limit_candidates(accepted)
            if limited != accepted:
                raise ValueError("BASELINE_WOULD_TRUNCATE_INPUT")
            candidate_schema = (ai.passage_provider_schema() if hasattr(ai, "passage_provider_schema")
                                else _compact_schema(passage.PassageOutput.model_json_schema()))
            requests = {
                "v11": request_envelope(ai.PROMPT, baseline_payload, ai.provider_schema()),
                "passages": request_envelope(ai.PASSAGE_PROMPT, wire, candidate_schema),
            }
            result.update(
                eligible=True, target=copy.deepcopy(row["target"]), inventory=inventory,
                acceptedCandidates=accepted, sourceRevisions=copy.deepcopy(row["sourceRevisions"]),
                passageRequest=request, requests=requests,
                acceptedCandidatesSha256=digest(canonical(accepted).encode()),
                acceptedCandidatesCount=len(accepted),
                wireRequestSha256={arm: digest(canonical(value).encode())
                                   for arm, value in requests.items()},
                requestUtf8Bytes={arm: len(canonical(value).encode())
                                  for arm, value in requests.items()},
            )
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            allowed = {"PRIVATE_SOURCE", "INVENTORY_INPUT_LIMIT", "NO_ACCEPTED_CANDIDATES",
                       "CROSS_SOURCE_CANDIDATES", "BASELINE_WOULD_TRUNCATE_INPUT",
                       "INVALID_SOURCE_ENVELOPE", "INVALID_SAVED_BASELINE"}
            result["error"] = str(exc) if str(exc) in allowed else "SOURCE_PREFLIGHT_REJECTED"
        prepared.append(result)
    return prepared


def validate_local_ledger(cfg):
    url = make_url(cfg.database_url)
    if cfg.app_env != "local" or url.host not in {"127.0.0.1", "localhost"} or (
        url.database != "farmclub_dev445_eval"
    ):
        raise ValueError("EXISTING_ISOLATED_LOCAL_LEDGER_REQUIRED")


def ledger_snapshot():
    with get_sessionmaker()() as db:
        url = db.get_bind().url
        if url.host not in {"127.0.0.1", "localhost"} or url.database != "farmclub_dev445_eval":
            raise ValueError("EXISTING_ISOLATED_LOCAL_LEDGER_REQUIRED")
        rows = db.scalar(select(func.count()).select_from(Spend))
        settled = db.scalar(select(func.coalesce(func.sum(Spend.charged_micros), 0)))
        pending = db.scalar(select(func.coalesce(func.sum(Spend.reserved_micros), 0)).where(
            Spend.charged_micros.is_(None)))
    return {"rows": rows, "settledMicros": settled, "uncertainReservedMicros": pending,
            "remainingMicros": GLOBAL_CAP_MICROS - settled - pending}


def available_micros(snapshot, phase_cap_usd=1.5):
    if not math.isfinite(phase_cap_usd) or not 0 < phase_cap_usd <= 1.5:
        raise ValueError("PHASE_CAP_AT_MOST_1_50_USD")
    if any(type(snapshot.get(k)) is not int or snapshot[k] < 0 for k in PHASE_BASELINE):
        raise ValueError("INVALID_LEDGER_SNAPSHOT")
    used = snapshot["settledMicros"] + snapshot["uncertainReservedMicros"]
    original = PHASE_BASELINE["settledMicros"] + PHASE_BASELINE["uncertainReservedMicros"]
    if snapshot["rows"] < PHASE_BASELINE["rows"] or used < original:
        raise ValueError("HISTORICAL_LEDGER_NOT_RECONCILED")
    return max(0, min(math.floor(phase_cap_usd * 1e6) - (used - original),
                      GLOBAL_CAP_MICROS - used))


def code_hashes():
    paths = [Path(__file__), Path(ai.__file__), Path(passage.__file__), Path(refinement.__file__),
             Path(text_score.__file__), ROOT / "server/app/source_analysis/source_inventory.py",
             ROOT / "server/app/source_analysis/inventory_refinement.py",
             ROOT / "server/app/source_analysis/budget.py", ROOT / "server/app/source_analysis/final_eval.py"]
    return {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in paths}


def _failed_record(job, status="FAILED"):
    return {"id": job["sourceId"], "format": job["format"], "status": status, "modules": []}


def _score_all(data, jobs):
    reports = []
    for trial in TRIALS:
        for arm in ("v11", "passages"):
            records = [j["record"] for j in jobs if j["trial"] == trial and j["arm"] == arm]
            reports.append({"trial": trial, "arm": arm, "records": records,
                            "report": text_score.score(data["gold"], records, data["safeTexts"])})
    return reports


def run(args):
    fd = os.open("/private/tmp/farmclub-dev451-passage.lock",
                 os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("PASSAGE_PHASE_ALREADY_RUNNING") from None
        return _run_locked(args)


def _run_locked(args):
    out = args.out.resolve()
    if out.exists() or out.is_relative_to(ROOT):
        raise ValueError("NEW_PRIVATE_OUTPUT_OUTSIDE_CHECKOUT_REQUIRED")
    raw = args.input.read_bytes()
    data = json.loads(raw)
    cohort = getattr(args, "cohort", "primary")
    sources = prepare(data, cohort=cohort)
    cfg = get_settings()
    validate_local_ledger(cfg)
    cfg.source_evaluation = True
    cfg.source_budget_usd = cfg.source_evaluation_budget_usd = 5
    cfg.source_max_output_tokens = OUTPUT_TOKENS
    before = ledger_snapshot()
    allowance = available_micros(before, getattr(args, "max_phase_usd", 1.5))
    if args.execute and getattr(args, "env_file", None):
        from dotenv import dotenv_values
        cfg.openrouter_api_key = dotenv_values(args.env_file).get("OPENROUTER_API_KEY") or ""
    if args.execute and any(s["eligible"] for s in sources) and not cfg.openrouter_api_key:
        raise ValueError("MISSING_PROVIDER_KEY")
    frozen_code = code_hashes()
    jobs = []
    # Alternate the first arm deterministically to avoid always spending the last
    # remaining allowance on the same arm; ordering is frozen before any calls.
    for trial in TRIALS:
        for index, source in enumerate(sources):
            order = ("v11", "passages") if (index + trial) % 2 else ("passages", "v11")
            for arm in order:
                job = {"index": len(jobs), "sourceId": source["id"], "format": source["format"],
                       "trial": trial, "arm": arm, "status": "PLANNED" if source["eligible"]
                       else "PREFLIGHT_FAILED", "preflightError": source.get("error")}
                job["record"] = _failed_record(job, "NOT_RUN" if source["eligible"] else "FAILED")
                if source["eligible"]:
                    envelope = source["requests"][arm]
                    job["requestSha256"] = digest(canonical(envelope).encode())
                    job["estimatedReservationMicros"] = budget.estimate_micros(
                        "openrouter", MODEL, {"completeProviderRequest": envelope}, [], [],
                        output_tokens=OUTPUT_TOKENS,
                    )
                jobs.append(job)
    out.mkdir(mode=0o700, parents=True)
    with (out / "input.json").open("xb") as handle:
        (out / "input.json").chmod(0o600)
        handle.write(raw)
    write_json(out / "preflight.json", sources)
    write_json(out / "ledger-before.json", before)
    protocol = {
        "version": VERSION, "purpose": "PAIRED_DEVELOPMENT_EXPERIMENT_NOT_RELEASE_ACCEPTANCE",
        "cohort": cohort, "trials": list(TRIALS), "provider": "openrouter", "model": MODEL,
        "maxOutputTokens": OUTPUT_TOKENS, "baselinePromptVersion": ai.PROMPT_VERSION,
        "candidatePromptVersion": passage.PLANNER_VERSION, "codeSha256": frozen_code,
        "inputSha256": digest(raw), "primarySupplementNeverPooled": True,
        "sample": [{"id": s["id"], "format": s["format"], "eligible": s["eligible"],
                    "error": s.get("error"), "acceptedCandidatesSha256":
                    s.get("acceptedCandidatesSha256")} for s in sources],
        "phaseBaseline": PHASE_BASELINE, "phaseCapUsd": getattr(args, "max_phase_usd", 1.5),
        "globalCapUsd": 5, "availableReservationMicros": allowance,
        "plannedReservationMicros": sum(j.get("estimatedReservationMicros", 0) for j in jobs),
        "requestBoundary": "ACCEPTED_CANDIDATES_ONLY_NO_RAW_OCR_OR_GOLD_TRANSMISSION",
        "inputBinding": "DECLARED_ACCEPTED_SNAPSHOT_NOT_HISTORIC_REQUEST_ATTESTATION",
        "requiresContentReview": True, "humanReview": "PENDING", "execute": args.execute,
    }
    write_json(out / "protocol.json", protocol)
    write_json(out / "planned-jobs.json", jobs)
    # Freeze every variant request (including exact serialized user payload and
    # schema) before the first provider call. Trials use byte-identical requests.
    for source in sources:
        case = out / source["id"]
        case.mkdir(mode=0o700)
        if source["eligible"]:
            for arm, envelope in source["requests"].items():
                write_json(case / (arm + "-request.json"), envelope)
    if not args.execute:
        result = {"version": VERSION, "status": "DRY_RUN_NO_PROVIDER_CALL", "protocol": protocol,
                  "jobs": jobs, "providerCalls": 0}
        write_json(out / "dry-run.json", result)
        return result
    calls = Calls("openrouter", allowance / 1e6) if allowance else None
    by_id = {s["id"]: s for s in sources}
    stopped = "BUDGET_EXCEEDED" if not allowance else None
    for job in jobs:
        if job["status"] == "PREFLIGHT_FAILED":
            continue
        if stopped:
            job.update(status="NOT_RUN", error=stopped)
            continue
        source = by_id[job["sourceId"]]
        case = out / source["id"]
        stem = f"trial{job['trial']}-{job['arm']}"
        entries_before = len(calls.entries)
        try:
            if code_hashes() != frozen_code or cfg.source_max_output_tokens != OUTPUT_TOKENS:
                raise ValueError("FROZEN_PROTOCOL_CHANGED")
            current_allowance = available_micros(ledger_snapshot(), protocol["phaseCapUsd"])
            if job["estimatedReservationMicros"] > current_allowance:
                raise ExtractionError("BUDGET_EXCEEDED")
            if job["arm"] == "v11":
                response = calls(
                    "passage-v11", MODEL,
                    {"completeProviderRequest": source["requests"]["v11"]}, [], [],
                    lambda s=source: ai.refine("openrouter", MODEL, s["target"],
                                              s["acceptedCandidates"]),
                    output_tokens=OUTPUT_TOKENS,
                )
                write_json(case / (stem + "-response.json"),
                           response.refinement.model_dump(by_alias=True))
                modules, diagnostics = refinement.validate(
                    response.refinement, source["acceptedCandidates"], source["target"]["id"],
                    target_count=1, target_name=source["target"]["name"],
                )
                detail = {"modules": modules, "diagnostics": diagnostics,
                          "requiresContentReview": True}
                status = "EVALUATED" if modules else "EMPTY"
            else:
                def candidate_call(s=source):
                    value = ai.refine_passages("openrouter", MODEL, s["target"], s["inventory"],
                                               source_revisions=s["sourceRevisions"])
                    return SimpleNamespace(plan=value, usage=value["usage"],
                                           request_id=value["requestId"])
                response = calls(
                    "passage-routing", MODEL,
                    {"completeProviderRequest": source["requests"]["passages"]}, [], [],
                    candidate_call, output_tokens=OUTPUT_TOKENS,
                )
                detail = response.plan
                modules = detail["modules"]
                status = ("EVALUATED" if detail["status"] == "COMPLETE" else "PARTIAL")
                if not modules:
                    status = "EMPTY" if detail["status"] == "EMPTY" else "FAILED"
            job.update(status="RECORDED", record={
                "id": job["sourceId"], "format": job["format"], "status": status,
                "modules": [{"module": m["module"], "texts": [t["value"] for t in m["texts"]]}
                            for m in modules],
            }, requestId=response.request_id)
            write_json(case / (stem + "-validated.json"), detail)
        except ExtractionError as exc:
            job.update(status="FAILED", error=exc.code, record=_failed_record(job),
                       requestId=exc.request_id)
            write_json(case / (stem + "-failure.json"),
                       {"code": exc.code, "requestId": exc.request_id, "usage": exc.usage})
            if exc.code in {"REQUEST_UNCERTAIN", "BUDGET_EXCEEDED"}:
                stopped = exc.code
        except Exception as exc:  # noqa: BLE001 - fail closed and retain unknown reservations
            # Unexpected post-send errors retain Calls' uncertain reservation and
            # stop, rather than inviting an unrecorded retry or exposing SDK text.
            job.update(status="FAILED", error=type(exc).__name__, record=_failed_record(job))
            stopped = "UNEXPECTED_FAILURE"
            write_json(case / (stem + "-failure.json"), {"errorType": type(exc).__name__})
        finally:
            # A parsed response or INVALID_MODEL_OUTPUT can still have unknown
            # billed cost. Retain its reservation and stop this phase as well.
            if (len(calls.entries) > entries_before
                    and calls.entries[-1].get("costKnown") is not True and not stopped):
                stopped = "UNSETTLED_CALL"
            write_json(out / f"checkpoint-{job['index']:03d}.json", {
                "jobs": jobs, "calls": calls.entries, "ledger": ledger_snapshot(),
                "stopped": stopped,
            })
    reports = _score_all(data, jobs)
    result = {"version": VERSION, "purpose": protocol["purpose"], "cohort": cohort,
              "protocol": protocol,
              "requiresContentReview": True, "humanReview": "PENDING", "jobs": jobs,
              "arms": reports, "calls": calls.entries if calls else [],
              "providerCalls": len(calls.entries) if calls else 0, "stopped": stopped}
    write_json(out / "result.json", result)
    write_json(out / "ledger-after.json", ledger_snapshot())
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cohort", choices=("primary", "supplement"), default="primary")
    parser.add_argument("--max-phase-usd", type=float, default=1.5)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    result = run(args)
    print(json.dumps({"output": str(args.out), "status": result.get("status", "RECORDED"),
                      "providerCalls": result["providerCalls"],
                      "eligibleSources": sum(s["eligible"] for s in
                                             result.get("protocol", {}).get("sample", []))}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
