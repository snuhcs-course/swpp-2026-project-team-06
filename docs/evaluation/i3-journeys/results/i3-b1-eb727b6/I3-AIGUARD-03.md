# AIGUARD-03 — Timeout and malformed provider response

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-169 (I3-T09) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent second review 2026-11-03 agrees; human sign-off Zahra Gholami 2026-11-03 |
| Build / environment | app commit `3f7ce29` (server code = `eb727b6`), DEV-165 baseline `i3-b1-eb727b6`, local `farmclub_i3`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b1-eb727b6/` |
| UTC | 2026-11-03 (result written 13:02:45Z) |

**Steps:** Proxy `hang` (12 s > 8 s client timeout), then proxy `malformed` (non-JSON text), each on a fresh consumer; record end-to-end elapsed time and the persisted thread.

**Expected (matrix):** Within 8-second policy each failure yields handoff and producer needsReply; no fabricated answer or silent loss; actual elapsed time recorded

| Assertion | Result |
| --- | --- |
| `timeout_handoff` | ✓ |
| `timeout_no_fabricated_answer` | ✓ |
| `timeout_consumer_message_kept` | ✓ |
| `timeout_needs_reply` | ✓ |
| `malformed_json_handoff` | ✓ |
| `malformed_json_no_fabricated_answer` | ✓ |
| `malformed_json_consumer_message_kept` | ✓ |
| `malformed_json_needs_reply` | ✓ |
| `timeout_within_8s_policy` | ✗ |
| `malformed_json_within_8s_policy` | ✓ |

Elapsed: timeout **8025 ms** (over the 8,000 ms bound by 25 ms; handoff itself correct), malformed 13 ms.

**Verdict: FAIL.** Defect: see `docs/evaluation/i3-ai-support/results.md` §Defects (to be linked under DEV-180). Trace: `.artifacts/i3-ai-support/i3-b1-eb727b6/AIGUARD-03.json`.
