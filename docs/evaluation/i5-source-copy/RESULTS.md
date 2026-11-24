# DEV-450 — source-grounded copy experiment

Local development prototype, 2026-11-24. FEAT-03/04/07, AC-SRC-1/2/5/7/9/11. No product default, API, save/apply, accepted gold, scorer, sealed holdout or production change. Existing visual experiments and review packets are preserved.

## Observed behavior

An assistant audited the original pixels and existing candidate quotes for the same two known development raster examples. The complete saved OCR was not sent to a model: it contains duplicated and unrelated material. The private audited inventory contains 24 eligible narrative/caveat facts plus four option tuples for the long example, and eight eligible facts plus one tuple for the short example. Seven period/policy claims are excluded from story copy. This is a source-audited subset pending human review, not measured extraction recall or adjudicated gold.

Option cards now render immutable source-bound weight/count/size/packaging tuples directly. Original count qualification and the complete size range remain explicit. Narrative output uses canonical claim coverage, critical literal expressions, numerical scope, negation and uncertainty guards, existing safety detectors, and a separate mandatory experimental semantic check. Positive model review is not semantic proof or calibrated accuracy.

| Example | Prior text entries | Revised entries | Fixed visual assets |
| --- | ---: | ---: | ---: |
| Long raster | 35 | 17 | 6 |
| Short raster | 8 | 5 | 3 |

Entries are UI paragraphs/cards, not independent facts or quality samples. Revised output retains all 32 eligible canonical facts in this inventory. Packing information was moved from taste into the existing packing/delivery section; storage and natural ripening advice appear under storage. The original layout plans, media URIs/hashes, dimensions, image order, hero titles and photo arrays remain unchanged. Compiler localAssets are exact; only filesystem pointers are relocated in the portable preview copy.

## Preserved attempts and cost

Run1: long source rejected before critic/compilation for omitted protected expressions; short writer+critic compiled. No failed fixture was silently replaced with baseline. Run2: explicitly revised literal-preservation prompt v2 compiled the long source. Final editorial check found a packing fact still assigned to taste; run3 changes that audited claim's routing only, using the same v2 prompt and unchanged guards. It compiled after writer+critic. Each attempt remains private. Short accepted output is v1; final long is v2. No automatic retry.

Seven actual model requests. Copy slice settled **$0.033821**, no new uncertain reservation. Existing cumulative ledger: 438 rows, settled **$1.371739**, uncertain reservations **$0.828496**, remaining **$2.799765** of the original **$5** cap. The original uncertainty remains charged against the cap. Copy allowance $0.25 is bound to the fixed pre-copy checkpoint and serialized with a nonblocking process lock; a newer snapshot cannot reset it. Complete prompt/schema duplication and output caps are reserved before each send. No additional paid calls planned for this pass.

## Executed verification

From the prepared worktree server directory:

- `DATABASE_URL=<isolated farmclub_dev464> .venv/bin/pytest tests/test_source_copy.py tests/test_copy_preview.py tests/test_source_design.py tests/test_design_preview.py tests/test_final_eval.py -q`: **221 passed, 0 failed**. Includes 35 copy/runner tests, 26 visual runner tests and 160 existing evaluator/spend tests.
- Focused Ruff check passed for all five new Python files. `git diff --check` passed.
- `npm run typecheck`: all five workspaces passed with the generated opt-in copy route.
- `node --test scripts/test-source-guided-story.mjs`: **13 passed, 0 failed**.
- Private source audit: **420 structural/reference assertions passed**, followed by six independent regression/review checks. These are engineering checks, not independent truth labels.
- Actual app browser: **315 assertions passed** on both examples at 360/390/430/1440 widths. Exact text cards/paragraphs, nine images, unchanged placement/native aspect/no upscaling, absence of horizontal overflow and runtime errors checked. Baseline captures at 390/1440. Complete mobile pages visually inspected.
- Packaged comparison: **12 browser assertions passed** across both cases and mobile/desktop selectors. Portable packet has 114 payload files plus SHA manifest; payload hashes and ZIP CRC passed. Raw inputs, quotes, attempts, screenshots and packet stay private/gitignored.
- Final pure compiler replay on both accepted outputs passed after review fixes, without additional model requests.

Early runs encountered a sandbox DB connection rejection and concurrent test-schema resets. Re-running the suites sequentially outside the sandbox produced the 221-pass result. The initial browser attempt could not reach the sandboxed preview; the final local server and all browser checks passed. These environment failures are separate from the preserved failed long writer attempt.

## Review and limits

Medium Sol independent review found two must issues: a double-negation reversal could pass, and a size attribute substring could drop a range endpoint. Both were fixed with synthetic regressions; independent reviewer confirmed closure. Fixed checkpoint and process serialization address the runner budget review. No outstanding AI review findings in this slice; human code/source/Korean editorial review is still pending.

Local read-only preview and private comparison only. No PDF automation, normal upload integration, producer acceptance or general accuracy claim. Source auditing itself is manual assistant preparation; do not describe this as an end-to-end automatic improvement. High-risk AI paths require human review before merge. Draft PR816 remains draft; no merge/deployment. Figma follow-up DEV-430.

AI: Sol medium implementation/source audit/review, Luna medium regressions, coordinator integration. No high Sol. Agent approx. 0.5h for this copy slice / Tokens  / Human unconfirmed. Earlier cumulative Human5h belongs to DEV-445 and is not reassigned.
