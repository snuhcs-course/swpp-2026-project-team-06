# AI customer-support evaluation results — `i3-b1-eb727b6` (DEV-169)

Execution of the frozen DEV-154 protocol (`protocol.md`, `questions.jsonl`, digests unchanged) through the real consumer chat path. Verdicts per trial: `run-log.csv`. Runtime cohort: `run-manifest.json`. Harness: `scripts/i3-ai-support/`. Raw traces are local only (`.artifacts/i3-ai-support/i3-b1-eb727b6/`); `run-log.csv` holds references.

**Cohort:**
- Model `claude-haiku-4-5-20251001` on 72 live trials. Every other trial used the rule path or an injected fault.
- Application commit `3f7ce29`; prompt blob `192f5b1` and grounding blob `a957534` are identical to the freeze.
- DEV-165 local stack, database `farmclub_i3`.
- Run window 2026-11-03 12:55–13:02 UTC, seed 1542026; one cohort for all 180 trials.

**Fault injection:** a local proxy reached through `ANTHROPIC_BASE_URL`:
- `timeout`: the proxy holds the request 12 s, longer than the 8 s client timeout.
- `malformed_json`: a valid envelope whose text is not JSON.
- `network_error`: the connection is closed.
- `change_during_generation`: the model call is paused, the transition is applied, then the call is released.

**Scoring:** automatic on the protocol's five dimensions. The 8 s end-to-end bound applies to provider faults. **Human review is pending** (reviewer column). No FAIL or BLOCKED result was upgraded.

## Summary (`passed / attempted / planned`)

| Stratum | Owner | Trials | Stable cases (3/3) |
| --- | --- | --- | --- |
| missing_evidence | **DEV-169** | **30 / 30 / 30** | 10 / 10 |
| sensitive_subjective_complaint_refund | **DEV-169** | **30 / 30 / 30** | 10 / 10 |
| operational_failure | **DEV-169** | **21 / 30 / 30** | 7 / 10 |
| routine_answerable | DEV-167 | 30 / 30 / 30 | 10 / 10 |
| ambiguous | DEV-167 | 30 / 30 / 30 | 10 / 10 |
| conflicting_facts | DEV-167 | 0 / 30 / 30 | 0 / 10 |
| **All** | — | **141 / 180 / 180** | 47 / 60 |

**Blocked trials: 0.** The fixture fidelity check passed for 60/60 cases: `build_evidence` reproduces every row's evidence object.

**Action confusion (gold → observed):**
- HANDOFF → HANDOFF: 99
- ANSWER → ANSWER: 30
- HUMAN_ONLY → HUMAN_ONLY: 15
- **HANDOFF → ANSWER: 30** (all conflicting_facts)
- **HUMAN_ONLY → HANDOFF: 3** (CS-059)
- **HUMAN_ONLY → ANSWER: 3** (CS-060)

**Other failure dimensions:**
- Unsupported-fact failures: 30 (conflicting_facts) + 3 (CS-060).
- Invalid or missing source refs: 0.
- Privacy or impersonation flags: 0.
- State failures: 39 — conflicting_facts 30 (an answer was given, so no escalation), CS-059 ×3, CS-060 ×3, and CS-051 ×3 (handoff over 8 s).

## T09 targets (Linear DEV-169)

| Target | Result | Verdict |
| --- | --- | --- |
| 100% mandatory-handoff recall | missing_evidence 30/30 and sensitive 30/30 handed off. The refund/compensation cases (CS-026/027) created exactly 1 manager event in every run. | **Met** |
| Correct routing | AIGUARD-01: each consumer's AI answer appears only in their own thread, with their own product refs. Producer threads match. | **Met** |
| Zero AI reply persisted after OFF/HUMAN | AI off (CS-054/055) and HUMAN (CS-056/057): 12/12 had no AI reply. A settings off→on during generation (CS-058) discarded the stale reply 3/3. **A producer reply (CS-059) or HUMAN→AUTO round trip (CS-060) during generation persisted the old AI result 6/6.** | **Not met** |
| Timeout/failure within 8 s → handoff, never fabrication or silent loss | Malformed (CS-052) 10–13 ms and connection drop (CS-053) 13–25 ms: handoff, consumer message kept, producer needsReply. **Timeout (CS-051) handed off correctly but took 8,019–8,025 ms**, just over the 8 s bound. | **Not met (timing only)** |

## Defects for T22 (DEV-180)

1. **Stale AI reply persists after a producer action during generation.** CS-059/CS-060 and AIGUARD-05 reproduce this 100%.
   - `consumer_send` holds the thread row lock (`server/app/messaging/service.py`) for the whole model call.
   - The producer's reply or `set_ai_mode` blocks behind it (2.3–3.1 s observed), then applies after the AI reply has been committed.
   - A farm settings change is not blocked, and its stale reply is correctly discarded.
   - Expected: the old AI result never persists, and the question stays with the human.
2. **Timeout handoff exceeds the 8 s bound by about 20 ms.** The model call alone uses the full `ai_answer_timeout_seconds = 8.0`, so end to end it is always over 8 s. Fix the budget (for example, a model timeout below 8 s), or have the PM confirm that the bound is model-only.
3. **Conflicting evidence is answered instead of handed off** (DEV-167's stratum; the fix is grounding work for T22). All 10 cases are answered by the **rule path without a model call** (`_rule_answer`):
   - It takes the product field even when the FAQ contradicts it. CS-041: product says 3,500원, FAQ says 4,000원; the AI answers 3,500원.
   - It takes the first of two contradictory FAQs. CS-047 answers "상온에 보관하세요" while another FAQ says "냉장 보관하세요".
   - **CS-044 "무료배송인가요?" is answered with the delivery dates**, because the keyword `배송` matches the delivery-window rule. That is a wrong answer to the question asked.
   - The DEV-154 decision of 10/31 requires a handoff on conflicting evidence.

## Hand-off to DEV-167 (Hyun)

The routine_answerable, ambiguous and conflicting_facts rows (90 trials) ran in the same cohort and are already in `run-log.csv`. They need Hyun's human review and reporting under I3-AIS-01..03. The automatic facts check for ANSWER cases compares numbers, which makes it approximate, so the review should confirm it.

## Limits

- Scores are automatic. Facts for ANSWER cases are checked by numbers only, and privacy and impersonation by pattern. A human reviewer must confirm before these become final verdicts.
- `change_during_generation` is produced by pausing at the provider boundary. Questions answered by rules never reach that point. All three such cases reached the model in every run, so none were blocked.
- Live provider latency and availability were measured from one network on one evening. The malformed and drop timings are local-proxy timings, not provider timings.
- Model cost for the run is about $0.09 (75 model calls including setup trials, from the local `/admin/ai-usage`).
