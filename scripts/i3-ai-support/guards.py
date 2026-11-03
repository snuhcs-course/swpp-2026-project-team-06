"""DEV-169: deterministic AI-guard checks I3-AIGUARD-01..05 (one planned execution each).

Same prerequisites as run.py (proxy + API with ANTHROPIC_BASE_URL, local farmclub_i3). Do not run while
run.py is running: both switch the proxy mode.

    cd server && uv run python ../scripts/i3-ai-support/guards.py

Writes .artifacts/i3-ai-support/<baseline>/AIGUARD-0N.json and prints one verdict line per row.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fixtures  # noqa: E402
import run  # noqa: E402

CASES = {c["id"]: c for c in fixtures.load_cases()}
ANSWERABLE = CASES["CS-003"]  # measured Brix, P1 product, routine ANSWER via the chat path
FARM = fixtures.FARM


def consumer(case: dict, tag: str):
    run.proxy(mode="passthrough")
    return fixtures.prepare(case, 0, suffix=f"-{tag}-{int(time.time())}")


def send(trial, body: dict, key: str) -> dict:
    response = run.call(
        "POST", f"/api/messaging/chats/{FARM}/messages", trial.consumer_token, body, key=key
    )
    return {"status": response.status_code, **(response.json() if response.content else {})}


def view(trial) -> list[dict]:
    return run.call("GET", f"/api/messaging/chats/{FARM}/messages", trial.consumer_token).json()[
        "items"
    ]


def producer_view(trial) -> list[dict]:
    return run.call(
        "GET", f"/api/messaging/producer/chats/{trial.consumer_id}/messages", trial.producer_token
    ).json()["items"]


def needs_reply(trial):
    found = run.paged(
        "/api/messaging/producer/chats",
        trial.producer_token,
        lambda s: s["consumerId"] == trial.consumer_id,
    )
    return found[0]["needsReply"] if found else None


def escalations(trial) -> list[dict]:
    return run.paged(
        "/api/messaging/questions",
        trial.producer_token,
        lambda e: e["consumerId"] == trial.consumer_id,
    )


def guard_01() -> dict:
    a, b = consumer(ANSWERABLE, "g1a"), consumer(ANSWERABLE, "g1b")
    ra = send(a, a.body, f"g1a-{time.time()}")
    rb = send(b, {**b.body, "text": "이 귤의 배송비는 얼마인가요?"}, f"g1b-{time.time()}")
    ids_a = {m["messageId"] for m in view(a)}
    ids_b = {m["messageId"] for m in view(b)}
    pa, pb = {m["messageId"] for m in producer_view(a)}, {m["messageId"] for m in producer_view(b)}
    replies = [r.get("reply") or {} for r in (ra, rb)]
    checks = {
        "both_answered_by_ai": all(r.get("senderType") == "AI" for r in replies),
        "refs_only_own_product": all(
            set(r.get("sourceRefs") or []) <= {"product:p-eval-citrus"} for r in replies
        ),
        "views_disjoint": not (ids_a & ids_b),
        "producer_threads_match_consumer_views": pa == ids_a and pb == ids_b,
    }
    return {"checks": checks, "replies": replies}


def guard_02() -> dict:
    a, b = consumer(ANSWERABLE, "g2a"), consumer(ANSWERABLE, "g2b")
    ra = send(a, a.body, f"g2a-{time.time()}")
    send(b, b.body, f"g2b-{time.time()}")
    ai_id = (ra.get("reply") or {}).get("messageId")
    report = run.call(
        "POST",
        f"/api/messaging/chats/{FARM}/messages/{ai_id}/report",
        a.consumer_token,
        key=f"g2r-{time.time()}",
    )
    esc_a = [e for e in escalations(a) if e.get("reportedMessageId") == ai_id]
    b_ids = {m["messageId"] for m in view(b)}
    b_esc = escalations(b)
    checks = {
        "report_accepted": report.status_code == 200,
        "one_wrong_answer_escalation_in_a": len(esc_a) == 1,
        "a_needs_reply": needs_reply(a) is True,
        "b_sees_no_a_message_or_report": ai_id not in b_ids
        and not any(e.get("reportedMessageId") == ai_id for e in b_esc),
    }
    return {"checks": checks, "report_status": report.status_code}


def guard_03() -> dict:
    results = {}
    for provider, mode in (("timeout", "hang"), ("malformed_json", "malformed")):
        case = {
            **ANSWERABLE,
            "question": "이 상품의 등록 정보를 바탕으로 추천 보관 방법을 알려주세요.",
            "runtime": {**ANSWERABLE["runtime"], "provider": provider},
        }
        trial = fixtures.prepare(case, 0, suffix=f"-g3-{mode}-{int(time.time())}")
        run.proxy(mode=mode)
        start = time.monotonic()
        response = send(trial, trial.body, f"g3-{mode}-{time.time()}")
        elapsed = round((time.monotonic() - start) * 1000)
        msgs = view(trial)
        results[provider] = {
            "elapsed_ms": elapsed,
            "handoff": any(m.get("handoffStatus") == "FORWARDED" for m in msgs),
            "no_fabricated_answer": not any(
                m["senderType"] == "AI" and m.get("handoffStatus") != "FORWARDED" for m in msgs
            ),
            "consumer_message_kept": any(m["senderType"] == "CONSUMER" for m in msgs),
            "needs_reply": needs_reply(trial) is True,
            "status": response["status"],
        }
    run.proxy(mode="passthrough")
    checks = {
        f"{p}_{k}": v for p, r in results.items() for k, v in r.items() if isinstance(v, bool)
    }
    checks.update({f"{p}_within_8s_policy": r["elapsed_ms"] <= 8000 for p, r in results.items()})
    return {"checks": checks, "results": results}


def guard_04() -> dict:
    a = consumer(ANSWERABLE, "g4")
    key = f"g4-{time.time()}"
    first, second = send(a, a.body, key), send(a, a.body, key)
    msgs = view(a)
    ai_id = (first.get("reply") or {}).get("messageId")
    rk = f"g4r-{time.time()}"
    reports = [
        run.call(
            "POST", f"/api/messaging/chats/{FARM}/messages/{ai_id}/report", a.consumer_token, key=rk
        ).status_code
        for _ in range(2)
    ]
    reports.append(
        run.call(
            "POST",
            f"/api/messaging/chats/{FARM}/messages/{ai_id}/report",
            a.consumer_token,
            key=f"g4r2-{time.time()}",
        ).status_code
    )
    esc = [e for e in escalations(a) if e.get("reportedMessageId") == ai_id]
    checks = {
        "one_consumer_message": sum(m["senderType"] == "CONSUMER" for m in msgs) == 1,
        "at_most_one_ai_reply": sum(m["senderType"] == "AI" for m in msgs) <= 1,
        "replay_returns_same_message": (first.get("message") or {}).get("messageId")
        == (second.get("message") or {}).get("messageId"),
        "one_wrong_answer_report": len(esc) == 1,
        "views_converge": {m["messageId"] for m in msgs}
        == {m["messageId"] for m in producer_view(a)},
    }
    return {"checks": checks, "report_statuses": reports}


def guard_05() -> dict:
    outcomes = {}
    for case_id in (
        "CS-058",
        "CS-059",
        "CS-060",
    ):  # settings_off_on, producer_reply, human_auto_roundtrip
        trace = run.run_trial(CASES[case_id], 0, suffix=f"-g5-{int(time.time())}")
        outcomes[CASES[case_id]["runtime"]["change_during_generation"]] = {
            "old_ai_result_persisted": any(m["senderType"] == "AI" for m in trace["consumer_view"]),
            "transition": trace.get("transition"),
            "status": trace["status"],
        }
    # Later new question after the round trip: AUTO must apply only to the new message.
    later = consumer(ANSWERABLE, "g5later")
    reply = (send(later, later.body, f"g5l-{time.time()}").get("reply") or {}).get("senderType")
    checks = {
        f"{k}_no_old_ai_result": not v["old_ai_result_persisted"] for k, v in outcomes.items()
    }
    checks["later_question_answered_in_auto"] = reply == "AI"
    return {"checks": checks, "outcomes": outcomes}


def main() -> None:
    fixtures.require_local_database()
    run.TRACES.mkdir(parents=True, exist_ok=True)
    for name, fn in (
        ("AIGUARD-01", guard_01),
        ("AIGUARD-02", guard_02),
        ("AIGUARD-03", guard_03),
        ("AIGUARD-04", guard_04),
        ("AIGUARD-05", guard_05),
    ):
        try:
            result = fn()
            verdict = "PASS" if all(result["checks"].values()) else "FAIL"
        except (
            Exception
        ) as error:  # an attempted run that cannot complete is FAIL with the error, never PASS
            result, verdict = {"checks": {}, "error": repr(error)}, "FAIL"
        result["verdict"] = verdict
        (run.TRACES / f"{name}.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=1, default=str), encoding="utf-8"
        )
        failed = [k for k, v in result["checks"].items() if not v]
        print(f"{name} {verdict} {failed or ''} {result.get('error', '')}", flush=True)
    run.proxy(mode="passthrough")


if __name__ == "__main__":
    main()
