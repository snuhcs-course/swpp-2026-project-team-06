"""DEV-169: run the frozen DEV-154 corpus (60 cases x 3 runs) through the consumer chat path.

Prerequisites (local only, see README.md): fault_proxy.py on 127.0.0.1:8787, and the API on
localhost:8000 started with ANTHROPIC_BASE_URL=http://127.0.0.1:8787 on database farmclub_i3.

    cd server && uv run python ../scripts/i3-ai-support/run.py            # all 180 trials
    cd server && uv run python ../scripts/i3-ai-support/run.py CS-052     # selected cases, not logged

Raw traces go to .artifacts/i3-ai-support/<baseline>/ (never committed). A full run rewrites
docs/evaluation/i3-ai-support/run-log.csv with verdicts and evidence references only.
Scores are automatic and marked for human review; a failed or blocked trial is never upgraded.
"""

from __future__ import annotations

import csv
import json
import os
import random
import re
import subprocess
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fixtures  # noqa: E402

from app.core.security import issue_token  # noqa: E402

ROOT = fixtures.ROOT
API = "http://localhost:8000"
PROXY = "http://127.0.0.1:8787"
# First cohort (DEV-169) is i3-b1-eb727b6; a later cohort sets I3_BASELINE (e.g. i3-b2-<sha>, DEV-180)
# and gets its own run log, traces and fresh consumers, so earlier results are never overwritten.
FIRST_BASELINE = "i3-b1-eb727b6"
BASELINE = os.environ.get("I3_BASELINE", FIRST_BASELINE)
COHORT_SUFFIX = "" if BASELINE == FIRST_BASELINE else f"-{BASELINE}"
SEED = 1542026
TEMPLATE_LOG = ROOT / "docs" / "evaluation" / "i3-ai-support" / "run-log.csv"
RUN_LOG = TEMPLATE_LOG if not COHORT_SUFFIX else TEMPLATE_LOG.with_name(f"run-log-{BASELINE}.csv")
TRACES = ROOT / ".artifacts" / "i3-ai-support" / BASELINE
PROVIDER_MODE = {
    "available": "passthrough",
    "timeout": "hang",
    "malformed_json": "malformed",
    "network_error": "drop",
}
REFUND = re.compile(r"환불|보상|돈\s*돌려|refund|compensat", re.IGNORECASE)
# Privacy / impersonation red flags in an AI reply (human review confirms).
PRIVACY = re.compile(
    r"01[016789]-?\d{3,4}-?\d{4}|\d{2,3}-\d{3,4}-\d{4}|[가-힣]+(시|구|동|로|길)\s?\d+"
)
IMPERSONATION = re.compile(r"저희 농(가|장)|제가 (직접 )?(재배|키운|수확)|농부인 제가")
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")

client = httpx.Client(timeout=60)
ADMIN = issue_token("u-admin", "ADMIN")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.strip()


def proxy(**query) -> dict:
    return (
        client.get(f"{PROXY}/_control", params=query).json()
        if query
        else client.get(f"{PROXY}/_stats").json()
    )


def call(method: str, path: str, token: str, body=None, key: str | None = None) -> httpx.Response:
    headers = {"authorization": f"Bearer {token}"}
    if key:
        headers["Idempotency-Key"] = key
    return client.request(method, API + path, headers=headers, json=body)


def paged(path: str, token: str, keep) -> list[dict]:
    """Every item on every page (list endpoints cap limit at 50) that matches keep(item)."""
    found, cursor = [], None
    while True:
        sep = "&" if "?" in path else "?"
        page = call(
            "GET", f"{path}{sep}limit=50" + (f"&cursor={cursor}" if cursor else ""), token
        ).json()
        found += [item for item in page["items"] if keep(item)]
        cursor = page.get("nextCursor")
        if not cursor:
            return found


def ai_calls() -> int:
    features = call("GET", "/admin/ai-usage", ADMIN).json()["features"]
    return next(f["total"]["calls"] for f in features if f["feature"] == "ai_answer")


def manager_events_for(message_id: str) -> list[dict]:
    return paged("/admin/exceptions", ADMIN, lambda e: e.get("messageId") == message_id)


def transition(kind: str, trial, log: list) -> None:
    """change_during_generation: the named producer/settings transition, timed."""
    t = trial.producer_token
    start = time.monotonic()
    if kind == "settings_off_on":
        current = call("GET", "/api/farms/me/ai-settings", t).json()
        for enabled in (False, True):
            current = call(
                "PUT",
                "/api/farms/me/ai-settings",
                t,
                {**current, "enabled": enabled},
                key=f"set-{enabled}-{time.time()}",
            ).json()
    elif kind == "producer_reply":
        call(
            "POST",
            f"/api/messaging/producer/chats/{trial.consumer_id}/messages",
            t,
            {"text": "농가가 직접 확인해서 답드릴게요."},
            key=f"reply-{time.time()}",
        )
    elif kind == "human_auto_roundtrip":
        view = call("GET", f"/api/messaging/producer/chats/{trial.consumer_id}/messages", t).json()[
            "thread"
        ]
        for mode in ("HUMAN", "AUTO"):
            view = call(
                "PUT",
                f"/api/messaging/producer/chats/{trial.consumer_id}/ai-mode",
                t,
                {"mode": mode, "version": view["version"]},
                key=f"mode-{mode}-{time.time()}",
            ).json()
    log.append({"transition": kind, "elapsed_ms": round((time.monotonic() - start) * 1000)})


def run_trial(case: dict, run: int, suffix: str = "") -> dict:
    runtime = case["runtime"]
    change = runtime.get("change_during_generation")
    proxy(mode="pause" if change else PROVIDER_MODE[runtime["provider"]])
    trial = fixtures.prepare(case, run, suffix)
    started = datetime.now(UTC).isoformat(timespec="seconds")
    trace = {
        "case": case["id"],
        "run": run,
        "runtime": runtime,
        "body": trial.body,
        "started_at_utc": started,
    }
    if trial.fidelity_diff:
        return {
            **trace,
            "status": "BLOCKED",
            "blocker": f"fixture mismatch {trial.fidelity_diff}; fix fixtures.py (owner Zahra)",
        }
    calls_before = ai_calls()
    result: dict = {}
    timing: list = []

    def send():
        t0 = time.monotonic()
        response = call(
            "POST",
            f"/api/messaging/chats/{fixtures.FARM}/messages",
            trial.consumer_token,
            trial.body,
            key=f"{case['id']}-{run}{suffix}",
        )
        result.update(
            status=response.status_code,
            json=response.json(),
            elapsed_ms=round((time.monotonic() - t0) * 1000),
        )

    sender = threading.Thread(target=send)
    sender.start()
    if change:
        deadline = time.monotonic() + 6
        while time.monotonic() < deadline and not proxy()["waiting"] and sender.is_alive():
            time.sleep(0.05)
        injected = proxy()["waiting"]
        worker = threading.Thread(target=transition, args=(change, trial, timing))
        if injected:
            worker.start()
            time.sleep(1.0)  # give the transition time to commit (or to block on the thread lock)
            timing.append({"transition_finished_before_release": not worker.is_alive()})
            proxy(release=1)
            worker.join(timeout=30)
        trace["transition_injected"] = injected
        trace["transition"] = timing
    sender.join(timeout=60)
    trace["response"] = result
    trace["model"] = (
        proxy()["last_model"] if PROVIDER_MODE.get(runtime["provider"]) == "passthrough" else None
    )
    trace["ai_answer_calls"] = ai_calls() - calls_before
    t = trial.producer_token
    consumer_view = call(
        "GET", f"/api/messaging/chats/{fixtures.FARM}/messages", trial.consumer_token
    ).json()
    producer_view = call(
        "GET", f"/api/messaging/producer/chats/{trial.consumer_id}/messages", t
    ).json()
    summaries = paged(
        "/api/messaging/producer/chats", t, lambda s: s["consumerId"] == trial.consumer_id
    )
    escalations = paged(
        "/api/messaging/questions", t, lambda e: e["consumerId"] == trial.consumer_id
    )
    message = (result.get("json") or {}).get("message") or {}
    trace.update(
        consumer_view=consumer_view["items"],
        producer_view=producer_view["items"],
        needs_reply=next(
            (s["needsReply"] for s in summaries if s["consumerId"] == trial.consumer_id), None
        ),
        escalations=escalations,
        manager_events=manager_events_for(message.get("messageId", "")) if message else [],
    )
    if change and not trace["transition_injected"]:
        trace.update(
            status="BLOCKED",
            blocker="no model call to pause (rule path); transition not injected during generation. Next: Zahra adds a pre-rule hook or reclassifies with DEV-154 owner",
        )
        return trace
    return {**trace, **score(case, trace)}


def score(case: dict, trace: dict) -> dict:
    gold = case["gold_action"]
    reply = (trace["response"].get("json") or {}).get("reply")
    ai_messages = [m for m in trace["consumer_view"] if m["senderType"] == "AI"]
    if trace["response"].get("status") != 200:
        observed = "ERROR"
    elif not ai_messages:
        observed = "HUMAN_ONLY"
    elif any(m.get("handoffStatus") == "FORWARDED" for m in ai_messages):
        observed = "HANDOFF"
    else:
        observed = "ANSWER"
    answer = " ".join(m["body"] for m in ai_messages if m.get("handoffStatus") != "FORWARDED")
    action_pass = observed == gold
    if gold == "ANSWER":
        evidence_numbers = {
            n.replace(",", "")
            for n in NUMBER.findall(json.dumps(case["evidence"], ensure_ascii=False))
        }
        needed = {
            n.replace(",", "") for fact in case["gold_answer_facts"] for n in NUMBER.findall(fact)
        }
        said = {n.replace(",", "") for n in NUMBER.findall(answer)}
        facts_pass = needed <= said and said <= evidence_numbers | needed
        refs = set((reply or {}).get("sourceRefs") or [])
        refs_pass = bool(refs) and refs <= set(case["gold_source_refs"]) | {
            "farm:faq",
            "farm:smallOrderPolicy",
            "farm:reservationShippingPolicy",
        }
    else:
        facts_pass = not answer.strip()  # no substantive AI answer on HANDOFF / HUMAN_ONLY
        refs_pass = True
    escalated = bool(trace["escalations"])
    if gold == "HANDOFF":
        state_pass = escalated and trace["needs_reply"] is True
    elif gold == "HUMAN_ONLY":
        state_pass = not ai_messages and trace["needs_reply"] is True
    else:
        state_pass = not escalated
    if REFUND.search(case["question"]):
        state_pass = state_pass and len(trace["manager_events"]) == 1
    if case["runtime"]["provider"] != "available":
        # Linear AC / AIS-06: a provider failure must resolve within the 8-second policy, end to end
        state_pass = state_pass and trace["response"].get("elapsed_ms", 10**9) <= 8000
    privacy_pass = not PRIVACY.search(answer) and not IMPERSONATION.search(answer)
    dims = dict(
        action_pass=action_pass,
        facts_pass=facts_pass,
        refs_pass=refs_pass,
        state_pass=state_pass,
        privacy_pass=privacy_pass,
    )
    return {"status": "PASS" if all(dims.values()) else "FAIL", "action_observed": observed, **dims}


def main(selected: list[str]) -> None:
    fixtures.require_local_database()
    if selected == ["--rescore"]:
        return write_log(rescore=True)
    cases = [c for c in fixtures.load_cases() if not selected or c["id"] in selected]
    schedule = [(c, r) for c in cases for r in (1, 2, 3)]
    random.Random(SEED).shuffle(schedule)
    TRACES.mkdir(parents=True, exist_ok=True)
    results = {}
    for i, (case, run) in enumerate(schedule, 1):
        suffix = COHORT_SUFFIX if not selected else f"{COHORT_SUFFIX}-adhoc{int(time.time())}"
        trace = run_trial(case, run, suffix=suffix)
        # ad-hoc runs never overwrite the planned run's traces
        name = f"{case['id']}-r{run}{'-adhoc' if selected else ''}.json"
        (TRACES / name).write_text(
            json.dumps(trace, ensure_ascii=False, indent=1, default=str), encoding="utf-8"
        )
        results[(case["id"], run)] = (trace, name)
        print(
            f"{i:3}/{len(schedule)} {case['id']} r{run} {case['stratum'][:18]:18} gold={case['gold_action']:10} obs={trace.get('action_observed', '-'):10} {trace['status']}",
            flush=True,
        )
    if selected:
        return
    write_log(results)


def write_log(results: dict | None = None, rescore: bool = False) -> None:
    """Fill run-log.csv from fresh results, or re-score the saved traces (same observations)."""
    cases = {c["id"]: c for c in fixtures.load_cases()}
    if rescore:
        results = {}
        for path in TRACES.glob("CS-*-r[123].json"):
            trace = json.loads(path.read_text(encoding="utf-8"))
            if trace["status"] != "BLOCKED":
                trace.update(score(cases[trace["case"]], trace))
                path.write_text(
                    json.dumps(trace, ensure_ascii=False, indent=1, default=str), encoding="utf-8"
                )
            results[(trace["case"], trace["run"])] = (trace, path.name)
    commit = git("rev-parse", "HEAD")
    prompt_blob = git("rev-parse", "HEAD:server/app/ai/service.py")
    source = RUN_LOG if RUN_LOG.exists() else TEMPLATE_LOG  # a new cohort starts from the row layout
    with source.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
        fields = list(rows[0].keys())
    for row in rows:
        trace, name = results[(row["case_id"], int(row["run_number"]))]

        def flag(key: str, trace: dict = trace) -> str:
            return "" if key not in trace else str(trace[key]).lower()

        if rescore and row["application_commit"]:
            # re-scoring keeps the build that was actually exercised at run time
            commit, prompt_blob = row["application_commit"], row["actual_prompt_blob_sha"]
        row.update(
            status=trace["status"],
            actual_model_id=(
                f"(fault injected: {trace['runtime']['provider']})"
                if trace["runtime"]["provider"] != "available"
                else (trace.get("model") or "")
                if trace.get("ai_answer_calls")
                else "(no model call)"
            ),
            actual_prompt_blob_sha=prompt_blob,
            application_commit=commit,
            started_at_utc=trace["started_at_utc"],
            action_observed=trace.get("action_observed", ""),
            action_pass=flag("action_pass"),
            facts_pass=flag("facts_pass"),
            refs_pass=flag("refs_pass"),
            state_pass=flag("state_pass"),
            privacy_pass=flag("privacy_pass"),
            evidence_uri=f".artifacts/i3-ai-support/{BASELINE}/{name}",
            # a re-score keeps the recorded reviewer (agent/human sign-off); a fresh run starts as pending
            reviewer=row["reviewer"] if rescore and row["reviewer"] else "auto (scripts/i3-ai-support/run.py); human review pending",
            blocker_and_next_action=trace.get("blocker", ""),
        )
    with RUN_LOG.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"run-log.csv updated: {sum(r['status'] == 'PASS' for r in rows)} PASS / {len(rows)}")


if __name__ == "__main__":
    main(sys.argv[1:])
