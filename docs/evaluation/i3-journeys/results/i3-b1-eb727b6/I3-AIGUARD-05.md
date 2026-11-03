# AIGUARD-05 — Producer action or settings change during AI generation

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-169 (I3-T09) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent second review 2026-11-03 agrees; human sign-off pending |
| Build / environment | app commit `3f7ce29` (server code = `eb727b6`), DEV-165 baseline `i3-b1-eb727b6`, local `farmclub_i3`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b1-eb727b6/` |
| UTC | 2026-11-03 (result written 13:03:01Z) |

**Steps:** Proxy `pause` holds the model call; apply (a) farm AI settings off→on, (b) producer reply, (c) HUMAN→AUTO round trip; release after 1 s; then a new consumer question in AUTO.

**Expected (matrix):** Old AI result never persists; old question remains for human until answered; producer reply only in correct thread; later AUTO/ON applies only to new message

| Assertion | Result |
| --- | --- |
| `settings_off_on_no_old_ai_result` | ✓ |
| `producer_reply_no_old_ai_result` | ✗ |
| `human_auto_roundtrip_no_old_ai_result` | ✗ |
| `later_question_answered_in_auto` | ✓ |

Transitions: settings off→on finished in 13 ms before release (stale reply discarded); producer reply **blocked 2345 ms** on the thread lock and the AI reply was committed first; HUMAN→AUTO round trip **blocked 2773 ms**, old AI answer persisted.

**Verdict: FAIL.** Defect: see `docs/evaluation/i3-ai-support/results.md` §Defects (to be linked under DEV-180). Trace: `.artifacts/i3-ai-support/i3-b1-eb727b6/AIGUARD-05.json`.
