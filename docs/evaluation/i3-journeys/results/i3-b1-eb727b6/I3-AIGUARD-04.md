# AIGUARD-04 — Idempotent replay and repeated report

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-169 (I3-T09) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent second review 2026-11-03 agrees; human sign-off pending |
| Build / environment | app commit `3f7ce29` (server code = `eb727b6`), DEV-165 baseline `i3-b1-eb727b6`, local `farmclub_i3`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b1-eb727b6/` |
| UTC | 2026-11-03 (result written 13:02:46Z) |

**Steps:** Send the same message twice with one Idempotency-Key; report the AI answer twice with one key and once with a new key; reload consumer and producer views.

**Expected (matrix):** One consumer message, at most one AI reply/escalation and no duplicate wrong-answer report; producer/consumer views converge

| Assertion | Result |
| --- | --- |
| `one_consumer_message` | ✓ |
| `at_most_one_ai_reply` | ✓ |
| `replay_returns_same_message` | ✓ |
| `one_wrong_answer_report` | ✓ |
| `views_converge` | ✓ |

Report request statuses: 200, 200, 200 → one escalation.

**Verdict: PASS.** Trace: `.artifacts/i3-ai-support/i3-b1-eb727b6/AIGUARD-04.json`.
