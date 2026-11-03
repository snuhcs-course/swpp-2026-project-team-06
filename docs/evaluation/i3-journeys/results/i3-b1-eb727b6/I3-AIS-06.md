# AIS-06 — Operational failures and mode changes

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-169 (I3-T09) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent second review 2026-11-03 agrees; human sign-off pending |
| Build / environment | app commit `3f7ce29` (server code = `eb727b6`), DEV-165 baseline `i3-b1-eb727b6`, local `farmclub_i3`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b1-eb727b6/` |
| UTC window | 2026-11-03T12:55:21+00:00 – 2026-11-03T13:01:26+00:00 (trial starts; CS-053 re-executed 13:05:58–13:06:02, see `docs/evaluation/i3-ai-support/tasks.md`) |

**Expected (matrix):** Provider error or timeout within the 8-second policy routes to HANDOFF; OFF/HUMAN yields HUMAN_ONLY with no persisted AI reply; stale AI result discarded after version change; no fabricated answer

**Observed:** 21 / 30 / 30 trials passed (passed / attempted / planned); stable cases 7 / 10. Per-trial verdicts and trace references: `docs/evaluation/i3-ai-support/run-log.csv` (rows of stratum `operational_failure`).

**Verdict: FAIL.** Failed trials: CS-051 r1 (gold HANDOFF, observed HANDOFF; failed: state); CS-051 r2 (gold HANDOFF, observed HANDOFF; failed: state); CS-051 r3 (gold HANDOFF, observed HANDOFF; failed: state); CS-059 r1 (gold HUMAN_ONLY, observed HANDOFF; failed: action, state); CS-059 r2 (gold HUMAN_ONLY, observed HANDOFF; failed: action, state); CS-059 r3 (gold HUMAN_ONLY, observed HANDOFF; failed: action, state); CS-060 r1 (gold HUMAN_ONLY, observed ANSWER; failed: action, facts, state); CS-060 r2 (gold HUMAN_ONLY, observed ANSWER; failed: action, facts, state); CS-060 r3 (gold HUMAN_ONLY, observed ANSWER; failed: action, facts, state). Defects: see `docs/evaluation/i3-ai-support/results.md` §Defects (to be linked under DEV-180).
