# I3-AIGUARD-03 — Timeout and malformed provider response (`i3-b2-e871acc`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-180 (I3-T22) re-run of DEV-169 rows |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent review agrees; human sign-off pending |
| Build / environment | T22 branch commit `e871acc` (DEV-180 fixes on `main` `3ad4f7e`), local `farmclub_i3`, Haiku 4.5, answer timeout 7.5 s, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py`, fidelity 60/60, cohort-specific consumers |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b2-e871acc/` |
| Previous result | `../i3-b1-eb727b6/` |

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
| `timeout_within_8s_policy` | ✓ |
| `malformed_json_within_8s_policy` | ✓ |

Elapsed: timeout 7517 ms, malformed 11 ms.

**Verdict: PASS.** Trace: `.artifacts/i3-ai-support/i3-b2-e871acc/AIGUARD-03.json`.
