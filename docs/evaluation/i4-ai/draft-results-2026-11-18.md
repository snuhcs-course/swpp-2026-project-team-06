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

## DEV-355 follow-up — loss attribution

Every public-development fact that the draft missed falls into one of three buckets:

- (a) **Stage 1 did not extract it.** No single accepted stage-1 candidate contains all of the fact's `mustContain` tokens.
- (b) **Extracted, not used.** At least one candidate contains the fact, but the draft does not.
- (c) **Used in the wrong section.** The draft contains the fact, but in the wrong section.

Matching uses the scorer's `contains` function on one candidate's value plus its evidence quotes. Rejected candidates are not counted, because they never reach stage 2.

The handoff table instead joined all candidates into one string. That let tokens from different candidates combine: for example, "돌이 많아" in one candidate and "물 빠짐" in another counted as extracted. The handoff script was later found with the private development files and reproduces the handoff table exactly. After switching it to per-candidate matching, it gives the table below, which differs from the handoff table on exactly those four facts (2 PDF, 1 long_image, 1 text).

| Format | f1 (a / b / c) | f2 (a / b / c) |
|---|---:|---:|
| pdf | 27 / 8 / 9 | 12 / 10 / 12 |
| long_image | 5 / 10 / 11 | 6 / 13 / 8 |
| text | 8 / 7 / 11 | 8 / 12 / 12 |
| image | 1 / 2 / 5 | 1 / 5 / 6 |
| **Total missed** | 104 of 324 | 105 of 324 |

The two runs have nearly the same total, but the split moves. PDF stage-1 misses fall from 27 in f1 to 12 in f2, so the stage-1 share of PDF loss is not stable across runs and two runs cannot pin it down. Most misses happen after extraction ((b) + (c): 63 of 104 in f1, 78 of 105 in f2), and wrong-section placement is steady in text (11 and 12). The table does not separate OCR from structured extraction.

At the time of these runs, DEV-355's deterministic safety code added Korean range, line-up and other-product package checks. The other-product check was removed later after the PM review (see "PM review response" below); it rejected nothing in these runs. The evaluation runner supports `--stage2-model` so stage 1 can stay fixed. Two 47-source follow-up runs completed with stage 1 `google/gemini-3-flash-preview` and stage 2 `openai/gpt-6.1-sol`:

| | Run 1 | Run 2 | Mean |
|---|---:|---:|---:|
| Facts | 254/354 (71.8%) | 255/354 (72.0%) | 254.5/354 (71.9%) |
| Critical facts | 114/154 (74.0%) | 117/154 (76.0%) | 115.5/154 (75.0%) |
| Forbidden violations | 1 | 1 | 1 |
| Unsupported tokens | 0 | 0 | 0 |
| Misplaced facts | 27/354 | 36/354 | 31.5/354 |
| Settled cost | $0.735116 | $0.741872 | $0.738494 |

Run 1 statuses: 40 EVALUATED, 4 EMPTY, 1 FAILED, 2 PARTIAL across 338 calls. Run 2: 42 EVALUATED, 4 EMPTY, 1 PARTIAL across 339 calls. The forbidden count did not reach zero in either run. Text fact recall was 81/103 and 80/103; image 38/52 and 44/52; long_image 62/92 and 65/92; PDF 73/107 and 66/107. The results do not show a stable recall improvement across formats, and critical recall remains below the pass line. Since deterministic safety checks also changed from the earlier f1/f2 arms, this is an end-to-end follow-up, not a clean model-only causal comparison. No holdout data was used. The locked protocol is in [`criteria.md`](criteria.md).

For context, the earlier Gemini stage-2 f1/f2 runs scored 247/354 and 246/354 facts after including the synthetic set (mean 246.5/354, 69.6%). Critical facts were 113/154 and 123/154 (mean 118/154, 76.6%). The GPT stage-2 follow-up mean is 8 facts higher (+2.3 percentage points) and 2.5 critical facts lower (-1.6 points). Forbidden violations were 0 and 1 in the earlier pair versus 1 and 1 in this pair; unsupported tokens were 0 and 1 versus 0 and 0. Because the safety validators changed between these arms and run-to-run variation is material, these deltas do not establish that the stage-2 model alone caused the differences. They do not support adopting GPT on critical recall or safety grounds.

The format comparison shows where the aggregate fact gain came from (all figures are two-run means; original and follow-up denominators match):

| Format | Gemini stage 2 facts | GPT stage 2 facts | Change | Gemini critical | GPT critical | Change |
|---|---:|---:|---:|---:|---:|---:|
| text | 71/103 (68.9%) | 80.5/103 (78.2%) | +9.5 | 37.5/46 (81.5%) | 39/46 (84.8%) | +1.5 |
| image | 42/52 (80.8%) | 41/52 (78.8%) | -1 | 31/35 (88.6%) | 30/35 (85.7%) | -1 |
| long_image | 65.5/92 (71.2%) | 63.5/92 (69.0%) | -2 | 19.5/25 (78.0%) | 16.5/25 (66.0%) | -3 |
| pdf | 68/107 (63.6%) | 69.5/107 (65.0%) | +1.5 | 30/48 (62.5%) | 30/48 (62.5%) | 0 |

Text is the only substantial fact-recall gain. This supports keeping the GPT stage-2 option for further text-focused evaluation, while the aggregate and critical results do not justify a default model switch. The PDF stage remains the lowest-recall format and is the stronger next pipeline investigation; the page diagnostics above identify a concrete page-coverage/OCR audit, not yet a fix.

The new runs' PDF diagnostics show 66 pages analyzed and 28 skipped in each run across eight PDFs. The parser intentionally caps PDFs at the first 20 pages (`PDF_PAGE_CAP=20`); this does not prove the missed facts were on skipped pages. PDF page failures were 3 in run 1 and 1 in run 2, with `OCR_PAGES_FAILED` on 2 and 1 PDF sources, respectively; no extraction chunks failed. The next PDF investigation should map misses against page availability and safe OCR text before changing the page cap or OCR behavior, since either change affects cost and coverage.

An offline audit of the 24 public f1 PDFs (105 gold facts) found 76 facts represented in accepted stage-1 candidates. Of the 29 unmatched facts, 25 had their gold tokens in the saved safe text and 4 did not. That points most of these misses toward candidate extraction/selection after text preparation, while the four absent from safe text still need OCR/page diagnosis. In the PDF text layer, 96 facts appeared within pages 1–20, one appeared only after page 20, and eight were not found in the text layer. These are token-presence checks, not semantic judgments; scanned content may have no PDF text layer. The data supports prioritizing stage-1 candidate extraction for PDFs before raising the page cap.

## DEV-355 — safety checks on the product setup (11/18)

**Offline replay first (no model calls).** The saved stage-2 outputs of six development runs were re-validated with the DEV-355 checks and rescored with the same scorer. The first version reached forbidden 0 but dropped good text: 6–11 facts per run (f1 220 → 214, f2 219 → 208, GPT 254 → 248 and 255 → 250). Two causes, both fixed: the "건강한 … 먹거리" pattern was also applied to the candidates a text cites, so clean GAP, 저농약 and EM-farming sentences were rejected; and the three-variety line-up rule counted the product's own variety, so "레드향은 한라봉과 천혜향의 장점…" on a 레드향 page was rejected. After the fix the replay gives f1 220/96, f2 217/105, GPT 250/114 and 252/117 (facts/critical), with forbidden and unsupported 0 in all four.

**Then two paid runs** of the fixed code with the product setup (Gemini 3 Flash in both stages), all 47 development sources, inputs frozen from the GPT runs (same OCR manifest), a fresh local database per run, $3 cap each. Settled cost $0.578750 and $0.573207. Artifacts `source-i4-dev355-fix-g1` and `-g2` (outside the repository). No holdout data used.

| Gemini both stages | Old checks f1 | Old checks f2 | DEV-355 g1 | DEV-355 g2 |
|---|---:|---:|---:|---:|
| Facts (47 sources) | 247/354 | 246/354 | 221/354 | 243/354 |
| Critical | 113/154 | 123/154 | 109/154 | 120/154 |
| Forbidden violations | 0 | 1 | **0** | **0** |
| Unsupported tokens | 0 | 1 | **0** | **0** |
| Facts without h3-pdf-01 | 219/316 | 216/316 | 221/316 | 214/316 |
| Critical without h3-pdf-01 | 101/139 | 111/139 | 109/139 | 107/139 |

In g1, `h3-pdf-01` FAILED with `INVALID_MODEL_OUTPUT` (the model's output did not parse; 0 facts, against 29 in g2). That is a provider-side failure, not a safety-check rejection: the checks reject single texts and never fail a source. Without that source, both pairs have a mean of 217.5/316 facts; critical is 106 → 108 of 139; forbidden and unsupported are 0 in both new runs. With it, the means are 246.5 → 232 facts and 118 → 114.5 critical, entirely from the one failure. Two runs per arm, development sets the checks were designed on: this shows the checks remove the remaining forbidden/unsupported items without a recall cost, not that this generalises.

**PM review response (11/18).** The closed-list `OTHER_PRODUCT` validator was removed: it guessed whether a cultivar belonged to the current product from names alone, while the unchanged stage-2 prompt already tells the model to exclude other products. The saved GPT f1/f2 and product-setup g1/g2 diagnostics contained zero `OTHER_PRODUCT` rejections, so removing that code did not restore a scored sentence in these four runs. We retained the narrow `PRODUCT_LINEUP` check: an offline replay without it restored one forbidden line-up sentence in confirmation g2 (facts 243 → 244, critical 120 → 121, forbidden 0 → 1). We also removed the broad `생산 품목` marker that rejected a single-product sentence; other lineup heuristics can still misclassify semantic edge cases. Product identity/package attribution remains a known validation gap and was not tested on holdout data.

## Not done / next
- ~~Holdout v2~~: done, see above.
- **PDF stage-1 prompt follow-up (DEV-355):** `source-v10-historical-scope` narrows `historical=true` to explicit past-sales facts and tells the model to keep harvest/production years and seasons in their ordinary fields. This targets the audited ambiguity where six rejected PDF candidates matched eight gold composition facts. Against the two GPT stage-2 / v9 stage-1 runs, the two clean v10 runs scored PDF factual recall 73/107 and 74/107 (mean 73.5/107, 68.7%) and critical recall 32/48 and 34/48 (mean 33/48, 68.8%). The baseline pair scored 73/107 and 66/107 (mean 69.5/107, 65.0%) and 32/48 and 28/48 (mean 30/48, 62.5%). That is +4 facts and +3 critical facts on these two-run means. Run 1 was unchanged; the gain is entirely in run 2, so this is a promising but preliminary signal with substantial run variance. Run 2 had eight rejected PDF candidates overall, but its artifacts do not retain reason-level counts; the reduction in `HISTORICAL_FIELD` rejections cannot be confirmed. The prompt change also coincided with lower long-image recall in v10 run 2; full-format means were 244/354 facts and 114.5/154 critical versus GPT baseline 254.5/354 and 115.5/154. Keep the prompt revision as a narrow experimental candidate and do not claim overall improvement or generalization. No holdout was used. Clean run artifacts: `source-i4-dev355-pdfstage-v10-f1-clean` and `source-i4-dev355-pdfstage-v10-f2-clean` (outside the repository).
- **Human review** of the drafts (Jinwoo).
- **Cost of this work:** about $5.5 of the $6 approved, development runs and judge included.

- **Decision (Zahra, 11/18): the v10 stage-1 prompt is reverted, not adopted.** Total facts fell (254.5 → 244 of 354), long-image recall dropped, and the PDF gain (+4 facts, +3 critical) came from one of two runs only. The audit finding stays: six PDF candidates were rejected as historical sales but held eight composition facts. That is a candidate cause for a future, separately measured fix. Stage 1 stays `source-v9-coverage`.
