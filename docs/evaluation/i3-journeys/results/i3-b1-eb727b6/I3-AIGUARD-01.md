# AIGUARD-01 — Cross-consumer routing of AI answers

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-169 (I3-T09) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / human review pending |
| Build / environment | app commit `3f7ce29` (server code = `eb727b6`), DEV-165 baseline `i3-b1-eb727b6`, local `farmclub_i3`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b1-eb727b6/` |
| UTC | 2026-11-03 (result written 13:02:31Z) |

**Steps:** Two fresh consumers of `f-eval` each ask an answerable P1 question (live model path); compare both consumer views with each other and with the producer thread of each.

**Expected (matrix):** Each AI answer uses only its consumer/product evidence and appears in the corresponding thread with AI label and valid refs; no cross-consumer content

| Assertion | Result |
| --- | --- |
| `both_answered_by_ai` | ✓ |
| `refs_only_own_product` | ✓ |
| `views_disjoint` | ✓ |
| `producer_threads_match_consumer_views` | ✓ |


**Verdict: PASS.** Trace: `.artifacts/i3-ai-support/i3-b1-eb727b6/AIGUARD-01.json`.
