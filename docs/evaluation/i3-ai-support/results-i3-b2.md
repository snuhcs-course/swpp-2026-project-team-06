# AI customer-support re-evaluation after the T22 fixes — `i3-b2-e871acc` (DEV-180)

Second cohort of the frozen DEV-154 protocol, run on the T22 branch (commit `e871acc`, which merges `main` at `3ad4f7e` and adds the DEV-180 fixes). Same harness, fixtures (fidelity 60/60), model (`claude-haiku-4-5-20251001`), prompt blob (`192f5b1`, unchanged from the freeze) and seed (1542026) as the first cohort `i3-b1-eb727b6` (`results.md`), which stays as recorded. Run window 2026-11-03T14:03:00+00:00 – 2026-11-03T14:18:08+00:00 UTC. Per-trial verdicts: `run-log-i3-b2-e871acc.csv`. Raw traces: local `.artifacts/i3-ai-support/i3-b2-e871acc/`. Scored automatically. An agent review of the raw traces agrees with every verdict; **human sign-off is pending**.

**What changed between the cohorts (DEV-180):**
- `consumer_send` no longer holds the thread lock during the model call, and rechecks mode and versions right before saving.
- The answer timeout is now 7.5 s.
- `_rule_answer` hands off when sources disagree, and treats free-shipping questions as fee questions.

## Before → after (`passed / attempted / planned`)

| Stratum | `i3-b1-eb727b6` | `i3-b2-e871acc` |
| --- | --- | --- |
| routine_answerable | 30 / 30 / 30 | 30 / 30 / 30 (answers identical to b1) |
| missing_evidence | 30 / 30 / 30 | 30 / 30 / 30 |
| sensitive_subjective_complaint_refund | 30 / 30 / 30 | 30 / 30 / 30 |
| ambiguous | 30 / 30 / 30 | 30 / 30 / 30 |
| conflicting_facts | **0** / 30 / 30 | **30** / 30 / 30 |
| operational_failure | **21** / 30 / 30 | **30** / 30 / 30 |
| **All** | **141** / 180 | **180** / 180 |

| Guard | b1 | b2 |
| --- | --- | --- |
| AIGUARD-01 cross-consumer routing | PASS | PASS |
| AIGUARD-02 wrong-answer report isolation | PASS | PASS |
| AIGUARD-03 timeout / malformed within 8 s | FAIL (8,025 ms) | **PASS (7,517 ms; malformed 11 ms)** |
| AIGUARD-04 idempotent replay | PASS | PASS |
| AIGUARD-05 change during generation | FAIL (producer blocked 2.3–2.8 s, stale reply saved) | **PASS (settings 13 ms, producer reply 5 ms, HUMAN→AUTO 12 ms; no stale reply)** |

## Evidence per defect

1. **Stale AI reply after a producer action:** CS-059 and CS-060 are 6/6.
   - The producer reply completed in 6–9 ms and the HUMAN→AUTO round trip in 13–14 ms, both **before** the paused model call was released (b1: 2,269–3,094 ms, blocked).
   - No AI message was saved, and the question stays with the producer (needsReply).
2. **Timeout:** CS-051 handed off in **7,527–7,530 ms** (b1: 8,019–8,025 ms).
3. **Conflicting evidence:** all 30 conflicting_facts trials returned the standard handoff notice with one escalation, from the rule path and with no model call.
   - That includes CS-045 and CS-046, which no longer adopt the contradicting FAQ, and CS-044 "무료배송인가요?".
   - The routine stratum's 10 answers are unchanged, so the conflict check does not over-trigger.

**Path mix:**
- routine and conflicting: rules 30/30 each
- missing_evidence and ambiguous: model 30/30 each
- sensitive: rules 27, model 3
- operational_failure: rules 18, model 12

Model IDs in the run log: {'(no model call)': 99, 'claude-haiku-4-5-20251001': 72, '(fault injected: timeout)': 3, '(fault injected: malformed_json)': 3, '(fault injected: network_error)': 3}.

## Limits

These are the same as for b1: automatic scoring, a local network, and proxy-injected faults. The fixes are verified on the local stack only. Production behavior changes only after PR #387 is merged and deployed (after the 11/4 HE), and the Railway `AI_ANSWER_TIMEOUT_SECONDS` variable must not override the 7.5 s default.
