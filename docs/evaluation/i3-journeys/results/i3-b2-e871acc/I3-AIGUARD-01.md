# I3-AIGUARD-01 — Cross-consumer routing of AI answers (`i3-b2-e871acc`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-180 (I3-T22) re-run of DEV-169 rows |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, automatic scoring) / agent review agrees; human sign-off Zahra Gholami (2026-11-06) |
| Build / environment | T22 branch commit `e871acc` (DEV-180 fixes on `main` `3ad4f7e`), local `farmclub_i3`, Haiku 4.5, answer timeout 7.5 s, faults via `scripts/i3-ai-support/fault_proxy.py` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py`, fidelity 60/60, cohort-specific consumers |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b2-e871acc/` |
| Previous result | `../i3-b1-eb727b6/` |

| Assertion | Result |
| --- | --- |
| `both_answered_by_ai` | ✓ |
| `refs_only_own_product` | ✓ |
| `views_disjoint` | ✓ |
| `producer_threads_match_consumer_views` | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-ai-support/i3-b2-e871acc/AIGUARD-01.json`.
