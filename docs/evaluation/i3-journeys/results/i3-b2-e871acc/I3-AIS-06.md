# I3-AIS-06 — Operational failures and mode changes (`i3-b2-e871acc`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-180 (I3-T22) re-run of DEV-169 rows |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent review agrees; human sign-off pending |
| Build / environment | T22 branch commit `e871acc` (DEV-180 fixes on `main` `3ad4f7e`), local `farmclub_i3`, Haiku 4.5, answer timeout 7.5 s, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py`, fidelity 60/60, cohort-specific consumers |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b2-e871acc/` |
| Previous result | `../i3-b1-eb727b6/` |

**Observed:** 30 / 30 / 30 trials passed; per-trial rows in `docs/evaluation/i3-ai-support/run-log-i3-b2-e871acc.csv` (stratum `operational_failure`).

**Verdict: PASS.**
