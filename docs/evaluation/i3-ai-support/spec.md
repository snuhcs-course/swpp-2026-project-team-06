# I3 AI support evaluation artifacts

This folder holds the frozen DEV-154 evaluation protocol for FEAT-13. Product behavior is specified by `docs/spec/functional/FEAT-13-ai-reply.md`, `docs/spec/functional/rules.md` (M-05–M-09, M-15, M-18), and `docs/spec/contracts-1.2.md` section 5. These files are an evaluation oracle and do not change product behavior.

| Decision | Reason |
| --- | --- |
| Store 60 complete synthetic evidence snapshots in JSONL | Each case can be reproduced without real customer data or a mutable shared fixture. |
| Keep action, answer facts, source refs, and runtime state as separate fields | Action accuracy and factual grounding can be scored independently. |
| Freeze question/protocol SHA-256 values in a manifest | Any future change requires a new cohort; a result cannot silently be scored against revised gold labels. |
| Require three isolated runs per case and report every stratum | Exposes probabilistic variation and prevents an overall score from hiding safety failures. |
| Treat product-contract contradictions as defects, not reasons to rewrite gold labels | FEAT-13 and M-05 are the evaluation authority. |

`protocol.md` defines execution and scoring. `questions.jsonl` is the gold set. `run-manifest.json` records the frozen revision and intended model/prompt snapshot. `run-log.csv` schedules 180 trials without claiming they occurred. `validate.py` checks structural integrity and hashes.
