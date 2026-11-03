# AIGUARD-02 — Wrong-answer report isolation

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-169 (I3-T09) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent second review 2026-11-03 agrees; human sign-off Zahra Gholami 2026-11-03 |
| Build / environment | app commit `3f7ce29` (server code = `eb727b6`), DEV-165 baseline `i3-b1-eb727b6`, local `farmclub_i3`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b1-eb727b6/` |
| UTC | 2026-11-03 (result written 13:02:33Z) |

**Steps:** Consumers A and B get AI answers; A reports the AI answer as wrong (`POST …/report`); inspect A escalations and producer needsReply, B view and B escalations.

**Expected (matrix):** A report opens one wrong-answer escalation in A thread and marks needsReply; B sees no A message, report or private data

| Assertion | Result |
| --- | --- |
| `report_accepted` | ✓ |
| `one_wrong_answer_escalation_in_a` | ✓ |
| `a_needs_reply` | ✓ |
| `b_sees_no_a_message_or_report` | ✓ |

Report request status: 200.

**Verdict: PASS.** Trace: `.artifacts/i3-ai-support/i3-b1-eb727b6/AIGUARD-02.json`.
