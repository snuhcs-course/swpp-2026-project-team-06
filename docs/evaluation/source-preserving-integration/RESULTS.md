# Source-preserving editor integration (DEV-452)

## Historical v1 implemented boundary (superseded by complete-private-draft revision below)

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


## Superseding complete-private-draft revision — 2026-11-25
User explicitly replaced withholding: warnings do not remove source wording from private draft. All116current target-relevant accepted evidence passages are included across the4focused examples;42have pending review flags. Inclusion and review state are independent, with explanations and owner KEEP/EDIT/OMIT/settings choices. Dates/prices/marketing/policy allow explicit acknowledgment with note; actual sale settings are not silently changed. Privacy redaction and restricted public-claim checks remain. Both public apply paths require current source-bound review, and legacy snapshots carry a server-owned review version. Removed/replaced source wording cannot be republished from a stale legacy snapshot.

Same original gold/scorer: baseline73/94critical27/38, previous withhelddraft61/94critical22/38, current completeprivate draft81/94critical29/38. This isolates the inclusion change from separately revised gold. Old scorer now flags27forbiddenmatches and19repetitionexcesses on private source text; neither warning count proves all flagged wording is invented, nor does coverage establish publication readiness. Linked option/context assembly remains a quality limitation. No new generation/OCR/provider calls.

Focused DB/backend related run453passed(48.48s); updated make test-source-preserving446passed(47.45s)+12UItests. Independent review caught stale legacy publicapply and prompted regression/fence. Final full backend and real browser results follow below. Initial browser failed for unmatched worker storage directory, second for cached CI-mode Expo bundle, third exposed an E2E save/reload race: the test reloaded before its async save reached the server; failures retained privately. Final typecheck all5workspaces passed.


### Final executed revision checks
- Full backend before compatibility correction:2337passed/3failed(299.93s). Failures exposed an optional review-metadata null key added to legacy saved responses but absent after reopen. Fixed serialization to omit absent metadata; old tests unchanged. The first affected rerun preceded correction; final affected workspace/source-copy/publication cohort19passed0failed(6.81s). This is not a claim that the full suite was rerun after the narrow metadata fix.
- Final make test-source-preserving:446backend tests passed,12UItests passed; all5workspace typechecks passed. Review-version, stale OMIT/EDIT snapshot and actual-sale-price-preservation regressions executed.
- Real local API/DB/worker/browser1passed(5.5s), retries0. Full flagged source survives private save/reopen, explicit owner correction and price transfer persist, and final public page contains confirmed date plus original warm wording only after explicit apply. Mobile390px/desktop1365px and console checks pass. Earlier failures retained; no speculative frontend refactor was made.
- Related newgold/scoring suite1094passed+10migrationpassed, final44pure checks include3additional format cases. Independent mediumSol reviews closed known findings; privacy/review/legacy serialization assertions verified. Sourcecopy screenshot inspected.
- Stable private review hub updated with current4pagecomparison, original metric history, separate relaxedgold summary and downloadable versioned privategold/policy/map. Historical folders untouched. No paid provider calls, production changes, merge or deployment. Human unconfirmed; Agent approx0.5h continuation / Tokens .
