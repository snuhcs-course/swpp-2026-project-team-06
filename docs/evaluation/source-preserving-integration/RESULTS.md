# Source-preserving editor integration (DEV-452)

## Implemented boundary

The opt-in policy builds suggestions from all current validated extraction evidence, independent of an earlier generated page. It preserves full quoted wording, original source/target/revision/sanitization identity and every candidate/evidence disposition. Known whitespace OCR repairs remain explicit suggestions; uncertain grammar, exact repetition, owner-conditional information, placement and safety holds remain separate. Broad grammar correctness, semantic deduplication and extraction completeness are not established.

Owner decisions persist per passage binding. Unrelated additions preserve valid choices; source changes invalidate affected choices. Full input/review versions fence writes, and the UI compares the first-choice persisted decision so polling cannot bypass concurrent-write conflicts. Independent canvas edits remain authoritative; explicit updates can replace an unchanged earlier decision-derived edit. Prices cannot enter description, and confirmation cannot bypass source safety rules. The product page changes only through existing explicit apply.

The new table also follows owning-batch/farm retention in the existing admin cleanup. No production purge was executed. Existing batches retain their policy; new app composer workspaces explicitly opt in. Paid prose REFINE is skipped for that policy.

## Quality result: no automatic coverage gain established

Four known development sources, one per input format, using identical source evidence for both scoring arms. The source-first arm uses the full115 accepted candidates/116 evidence units;74 passages are automatic and42 are held. This is accepted-extraction accounting, not full original-source recall. No owner-completed arm is fabricated.

| Mechanical pagewide selector diagnostic | Saved v11 baseline | Source-first automatic draft |
| --- | ---: | ---: |
| Fact selectors |73/94|61/94|
| Critical fact selectors |27/38|22/38|

These are uncalibrated mechanical matches, not semantic accuracy. Holds contribute to the lower automatic result. The private audit also distinguishes accepted-extraction gaps from literal/OCR/placement mismatches; those are not all writer omissions. Do not treat passing workflow tests as proof of improved page quality.

Two new original-gold forbidden flags match exact source text. One is a health-marketing policy question; the other conflicts with a positive reference fact in the same source. Both remain unadjudicated. Original gold and scorers were not modified, and no full gold or release approval is inferred. Further gold/policy clarification and reduction of unnecessary holds/placement mistakes remain open in DEV-447/450.

Snapshot source revision is retained; sanitization version0 is declared for this offline replay, not reconstructed from a historical database. Private before/after artifacts retain exact source/input/code hashes and per-item accounting. No paid model calls were made.

## Executed checks

- `make setup`: passed in the isolated worktree from origin/main0988f0e2.
- Local DB: farmclub_dev452_source; pytest uses a distinct `_test` DB. Migration roundtrip uses farmclub_dev452_source_migration. No production DB/shell/variables.
- Initial related pytest:414passed/7failed; source fixtures and a real treatment-language safety gap were corrected. Subsequent related suite421passed/0failed(42.62s).
- Initial full pytest:2280passed/37failed/1skipped(278.90s).35 failures exposed the missing cleanup retention rule for the new table;2 were fixture errors. Affected rerun74passed/1fixture failure, then75passed/0failed(11.21s). These failures remain recorded.
- `npm run typecheck`: all5 workspaces passed.
- `npm run test:mock`:568passed/0failed/0skipped(111078.65ms), including the new source-copy behavior suite. `node --test scripts/test-source-copy.mjs`:7passed/0failed.
- Real local API/DB/worker/browser with an invented source and fixed mock extractor:1Playwright passed(5.5s), repeated after screenshot adjustment1passed(4.9s), retries0. Owner date EDIT, price-to-settings disposition, original voice, private save/reopen, unchanged public page before apply, explicit apply, mobile/desktop overflow and console checks passed. The rerun is the same scenario and is not an additional independent sample.
- Migration: upgrade to0040, downgrade0039, upgrade0040 and `alembic check` passed on the separate local DB; sole head0040.
- Focused Ruff and diff checks passed. Independent medium Sol reviews closed identified code findings; human high-risk review remains open.

Final full default suite: `DATABASE_URL=...farmclub_dev452_source .venv/bin/pytest -q -ra --tb=short` →2319passed/1skipped(274.02s). The skip is the existing OpenCV-dependent format module. Installed the project’s existing locked OCR extra with `uv sync --frozen --extra ocr` (no dependency-file changes); `pytest tests/test_producer_format_flow.py tests/test_source_visual_quality.py tests/test_source_analysis.py -q --tb=short` →50passed/0failed(17.50s), covering that module. The supplemental cohort overlaps the default suite and is not added as50new independent tests.

A final text/media edge correction preserves photos attached to an unchanged decision-derived field during explicit second EDIT/OMIT/third EDIT. Its5API regressions passed(3.43s); `make test-source-preserving` subsequently passed429pytest/0failed(44.40s) plus7UI tests/0failed. Independent canvas text remains protected. The prior full-suite result precedes this narrow correction.

All5workspace typechecks were rerun successfully. Review hub links/cards/mobile widths and the local editor screenshot were inspected. Spreadsheet status readback/formulas/styles/validation were checked; native browser host and artifact renderer were unavailable, so no native spreadsheet visual QA is claimed.

Final commit is recorded in the implementation task/PR. No merge or deployment. Agent approx0.5h continuation / Tokens / Human unconfirmed (prior parent5h not reassigned).
