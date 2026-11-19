# DEV-264 draft filling — before vs after (development sets, 2026-11-18)

**What was measured:** the AI draft-filling pipeline (stage 1 extraction → stage 2 page text) on the **24 public development sources** (`source-dev-i3-private`, PM-shared) and the **23 synthetic sources**. These are the same denominators and the same gold as the I4 baseline ([baseline-2026-11-11.md](baseline-2026-11-11.md)). All numbers are automatic. Human review of the drafts is still pending (Jinwoo).

**Development set, not generalization:** every change was chosen by looking at failures on these sources. The only unseen check is holdout v2, run once on the merged code (see the end of this doc).

## Setup
- **Before:** `source-i4-b0-*`, code `e48b3f1c` (= `ed6518a4` for the draft pipeline), stage 1 `source-v8-exact-numbers`, stage 2 `source-refine-v7-farm-common`. One run.
- **After:** `source-i4-f1-*` and `source-i4-f2-*`, two runs of the same code `61c83e97`, stage 1 `source-v9-coverage`, stage 2 `source-refine-v11-routing`.
- **Shared settings:**
  - model `google/gemini-3-flash-preview` through OpenRouter
  - scorer `dev264-number-evidence-v2`; all arms rescored with it, and only one earlier arm changed
  - a fresh local evaluation database (see "Measurement problems found")
- **Product name:** the after arms send the masked product name to the model, because the product now does (criteria §5 version note). The before arm ran without it, as the product did then.
- Outputs are private and outside the repo; only aggregates are recorded here.

## Headline (24 public sources, 324 facts / 134 critical)

| | Before (b0) | After f1 | After f2 | **After, mean** | Pass line |
| --- | --- | --- | --- | --- | --- |
| Facts (strict) | 195 (60.2%) | 220 (67.9%) | 219 (67.6%) | **67.7%** | ≥ 95% — not met |
| Critical facts (strict) | 86 (64.2%) | 96 (71.6%) | 106 (79.1%) | **75.4%** | — |
| Facts (semantic) | 218 (67.3%) | 238 (73.5%) | 247 (76.2%) | **74.8%** | reported, not a pass line |
| Critical (semantic) | 92 (68.7%) | 98 (73.1%) | 111 (82.8%) | **78.0%** | — |
| Forbidden content | 2 | **0** | 1 | 0–1 | 0 — not stable |
| Unsupported numbers / claims | 0 | **0** | 1 | 0–1 | 0 — not stable |
| Sources fully read (EVALUATED) | 22 / 24 | **24 / 24** | **24 / 24** | | |
| Latency per source p50 / p95 | 10.0 / 52.7 s | 8.6 / 37.0 s | 8.1 / 39.0 s | | |
| Cost (24 sources) | $0.437 | $0.450 | $0.455 | | |

**Synthetic set (30 facts / 20 critical):** 27/30 and 17/20 before, 27/30 and 17/20 in both after runs. Forbidden and unsupported stay at 0.

**Paired facts, before → after:**

| | FAIL→PASS | PASS→FAIL |
|---|---|---|
| f1 | 49 | 24 |
| f2 | 54 | 30 |
| Critical, f1 | 20 | 10 |
| Critical, f2 | 25 | 5 |

## By format (strict, mean of the two after runs)

| Format | Sources | Facts before → after | Critical before → after |
| --- | ---: | --- | --- |
| text | 6 | 51/77 (66.2%) → 48.0 (62.3%) | 24/30 (80.0%) → 24.5 (81.7%) |
| image | 8 | 40/50 (80.0%) → 40.0 (80.0%) | 27/33 (81.8%) → 29.0 (87.9%) |
| long_image | 4 | 56/92 (60.9%) → 65.5 (71.2%) | 12/25 (48.0%) → 19.5 (78.0%) |
| pdf | 6 | 48/105 (45.7%) → 66.0 (62.9%) | 23/46 (50.0%) → 28.0 (60.9%) |

The gains are in long images and PDFs, from the larger stage-2 input and the OCR retry. Text is flat: it varies most between runs (f1 51, f2 45).

## Run-to-run noise
The two after runs use identical code, yet 35 facts went PASS→FAIL and 34 FAIL→PASS between them. Single development runs therefore move by about ±10 facts. Earlier single-run peaks during development (74.1% facts in one run, 86.6% critical in another) were partly this noise. The before arm has only one run, so its own noise isn't measured. The "about +7.5 points facts, +11 points critical" comparison carries that uncertainty.

## What changed (each validated by its own run before the next; one reverted)

| Step | Change | Kept? | Why |
| --- | --- | --- | --- |
| R1 | Stage 2 sees 80 candidates / 32k chars (was 40 / 16k) | yes | Long sources were cut mid-document (17 facts) |
| R1 | Stage 2 cites every candidate whose number it uses | yes | 14 facts lost to the number check → 1–2 |
| R2 | Masked product name sent to stage 1 and 2 | yes | Mixed-product sources leaked or went empty; PM-approved 11/17 (privacy) |
| R2 | Other-product line-ups excluded from every module | yes | Leak |
| 1 | Scorer: "Since 1966," reads as 1966 | yes | False unsupported number |
| 2 | Reject superlatives, comparisons, calls to action | yes | 2 forbidden → 0 |
| 2b | Reject ranges built from two separate values | yes | "13.2Brix 13.5Brix" became a range |
| 3 | Section routing rules (tagline, parentage, packaging, ripening, growing conditions) | yes | Misplaced facts |
| 4 | Stage-1 coverage checklist | yes | Stage-1 misses 26 → 22 in its run |
| 5 | "Keep source wording verbatim" | **reverted** | Critical facts fell and misplaced facts rose |
| 6 | Re-read an OCR crop once with double room when it hits the token/line cap | yes | The same PDF page failed the same way in 3 runs; now 24/24 read |
| 6b | Reject clear policy text (refund, compensation, returns, sales ended, delivery date, order options); "건강함을 담" is a health claim | yes (PM-style decision by Zahra) | 4 forbidden → 1 |
| 7 | Semantic recall judge (`fact-judge-v1`) | yes | Measurement |

## Remaining safety items (after runs)
- **Farm line-up list inside productionProcess** ("주 생산품목: 비트차, 비트칩(상시)"): 1 in f2, also seen in earlier runs. The prompt rule exists; the model doesn't always follow it.
- **Range rewritten with 에서/사이** ("1월에서 4월 사이" for a 1월~4월 range): 1 in f2. The range check only recognises `~` / `-`.
- Neither appeared in f1.

## Semantic recall and the judge's self-check
- The judge is asked only about facts that fail the strict match. "Unknown" counts as a miss.
- **Present facts** (pass strictly): the judge said yes for 223/230 (97.0%). Target ≥ 95%, met.
- **Facts borrowed from another source:** it said no for 155/170 (91.2%). Target ≥ 95%, not met as measured.
  - By hand, about 12 of the 15 "yes" answers were facts that really are in the draft: neighbouring sources share products, storage advice and months.
  - About 3 were lenient (e.g. "2S, S 사이즈" ≈ "아담한 크기"). That puts the real false-yes rate around 2%.
- **What it shows:** semantic recall is only about 7 points above strict. Most of the gap to 95% is facts that are really missing, not exact-wording strictness.

## Measurement problems found
- **Spend ledger:** the local database `farmclub_i3` held $4.65 of real evaluation spending since I3, against a $5 budget, so later runs aborted part-way. Evaluations now run on a fresh local database `farmclub_dev264_eval`. **Holdout v2 must also run on a fresh database**, or its one attempt can abort.
- **Scorer bug:** "Since 1966," was read as an unsupported number (fixed, `dev264-number-evidence-v2`).

## Against the pass lines (criteria §4)

| Line | Result |
|---|---|
| Fact recall ≥ 95% per format | **Not met** (62–80% by format) |
| Forbidden 0 | **Not stable** (0 and 1 in the two runs, 2 before) |
| Unsupported 0 | **Not stable** (0 and 1 in the two runs) |

The pass lines are not lowered. The I4 decision (limit exposure, manual fallback, or move to I5) is the PM's.

## Holdout v2 — the unseen check (2026-11-18, run once)

12 sources the improver never saw, scored on the merged code `472047bd`. Zahra ran it in her own terminal on a fresh local database. The agent saw only the totals below. No per-source output was shared.

**Attempt record:**
- The folder already held a run-once marker dated 2026-11-05, from an earlier unfinished v2 attempt. The PM confirmed on 11/16 that the earlier attempt showed no per-source results.
- The first try today stopped at that marker before any model call ($0, nothing produced).
- This run is therefore recorded by the script as attempt 2 (`--force-rerun`), with the reason saved in the marker. The earlier marker is kept.

| Format | Sources | Facts (strict) | Critical | Forbidden | Unsupported |
| --- | ---: | --- | --- | ---: | ---: |
| text | 3 | 27/49 (55.1%) | 10/15 | 1 | 2 |
| image | 3 | 14/25 (56.0%) | 5/6 | 0 | 0 |
| long_image | 3 | 16/24 (66.7%) | 3/3 | 1 | 0 |
| pdf | 3 | 18/36 (50.0%) | 7/9 | 1 | 0 |
| **overall** | **12** | **75/134 (56.0%)** | **25/33 (75.8%)** | **3** | **2** |

- **Semantic recall** (`fact-judge-v1`, PM-approved, no-training providers only): 95/134 (70.9%) facts, 25/33 critical.
- **Run:** all 12 sources EVALUATED. Cost $0.148, plus $0.007 for the judge.

**Against development:**

| | Holdout v2 | Development (final mean) |
|---|---|---|
| Critical facts | 75.8% | 75.4% |
| All facts | 56.0% | 67.7% |
| Safety (forbidden / unsupported) | 3 / 2 | 0–1 / 0–1 |

- **Critical facts hold** on unseen sources.
- **All facts are about 12 points lower** than on development. Part of the development gain is tuning to those sources.
- **Safety is worse on unseen data.** Deterministic code checks are the next step (DEV-355).
- There is no holdout "before" number: v2 had never produced results. This is one after-point, not a before/after comparison.

**Pass lines:** not met (facts ≥ 95%, forbidden 0, unsupported 0). Not lowered.

## Not done / next
- ~~Holdout v2~~: done, see above.
- **Human review** of the drafts (Jinwoo).
- **Cost of this work:** about $5.5 of the $6 approved, development runs and judge included.
