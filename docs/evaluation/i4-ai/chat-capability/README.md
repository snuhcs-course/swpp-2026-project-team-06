# I4 chat capability set (DEV-265) — v1 frozen 2026-11-15

Purpose: measure whether the AI answers questions it can answer, instead of handing them off, without answering questions that must go to the producer. This is a **development set**: the same person writes it and improves the product, so results show recovery on known inputs, not generalization (`../criteria.md` section 1).

## Contents (`questions.jsonl`, sha256 in `manifest.json`)

- **Format:** the same row format as `../../i3-ai-support/questions.jsonl`.
- **Evidence:** each row's `evidence` is copied unchanged from the I3 fixtures `P1`, `P2`, `P3`, `FARM_ONLY`, `ORDER` and `MULTI_NO_CONTEXT`, so the I3 fixture check still applies.
- **Extra fields:** `note` (what the case probes) and `source` (`team-written`, or later `producer` / `consumer`).

| Stratum | Gold | Cases | What it probes |
| --- | --- | ---: | --- |
| answerable_variant | ANSWER | 20 | The same registered facts as I3 (fee, delivery window, Brix, FAQ, small-order and reservation policy, order window), asked in everyday phrasings |
| handoff_lookalike | HANDOFF | 9 | Questions that look answerable but must go to the producer (M-07 haggling, delivery change, taste, pesticide, refund; guarantees; missing evidence; ambiguous product) |

Run 3 trials per case, as in I3.

## Scoring limits

- **The I3 runner scores facts by numbers only.** An answer passes if it contains every gold number and no number missing from the evidence.
- **Non-numeric answers can't be fully scored automatically.** This covers storage, washing, small-order and reservation-policy answers, so they need human review. Until reviewed they are reported as **UNREVIEWED**, not PASS.

## Freeze (v1, 2026-11-15)

- **Frozen:** 29 cases (ANSWER 20, HANDOFF 9), committed before any change to `server/app/ai`. The sha256 is in `manifest.json`. v1 is never edited.
- **v2 (2 cases, `questions-v2.jsonl`, frozen 2026-11-15 before any code change):** the two cases whose gold label the PM decided on 11/15. CAP-027 "13브릭스 이상 보장되나요?" ("Is at least 13 Brix guaranteed?") is HANDOFF, because it asks for a guarantee. CAP-031 "얼마나 달아요?" ("How sweet is it?") is ANSWER with the registered Brix and no taste judgment. Reported separately from v1.
- **Question source:** all questions are team-written in everyday wording, not real user wording (PM decision 11/15). Results are reported with that caveat.

## Offline routing of the 30-case draft (2026-11-12, `main` @ `7ad9c123`, no model calls)

The keyword filter and rule step only; no model calls:

| Gold | Rule answer | Forced handoff | Rule handoff | Sent to model |
| --- | ---: | ---: | ---: | ---: |
| ANSWER (20) | 8 | 1 (CAP-005, `셔요`) | 1 (CAP-012, false conflict) | 10 |
| HANDOFF (10) | **2 (CAP-021, CAP-027)** | 5 | 0 | 3 |

**What this shows:**
- **Safety bug: CAP-021.** "택배비 빼주시면 안 돼요?" ("Could you waive the shipping fee?") is haggling, which M-07 says always goes to the producer. The fee rule answers it instead, because "빼" ("take off") is not in the keyword list.
- **Not measured yet:** this is routing only. Whether the 13 model-routed cases are answered correctly needs the paid baseline run.
