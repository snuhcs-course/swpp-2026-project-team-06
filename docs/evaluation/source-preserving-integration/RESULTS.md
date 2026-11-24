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
- Final make test-source-preserving:447backend tests passed,12UItests passed; all5workspace typechecks passed. Review-version, stale OMIT/EDIT snapshot and actual-sale-price-preservation regressions executed.
- Real local API/DB/worker/browser1passed(5.5s), retries0. Full flagged source survives private save/reopen, explicit owner correction and price transfer persist, and final public page contains confirmed date plus original warm wording only after explicit apply. Mobile390px/desktop1365px and console checks pass. Earlier failures retained; no speculative frontend refactor was made.
- Related newgold/scoring suite1094passed+10migrationpassed, final44pure checks include3additional format cases. Independent mediumSol reviews closed known findings; privacy/review/legacy serialization assertions verified. Sourcecopy screenshot inspected.
- Stable private review hub updated with current4pagecomparison, original metric history, separate relaxedgold summary and downloadable versioned privategold/policy/map. Historical folders untouched. No paid provider calls, production changes, merge or deployment. Human unconfirmed; Agent approx0.5h continuation / Tokens .


## Focused reviewer fixes and option organization — 2026-11-25
User accepts nonpromotional review categories, requests ordinary promotion stop warning, automatic handling of broken source sentences and one block per product option. Local v4 engine narrows promotion only in source-copy mode; global legacy scorer/safety unchanged. Same-candidate adjacent continuation joins automatically. Cross-candidate/module continuation stays connected with explicit context review. Ordered spans, independent headings/options, ambiguity, source/target scope and explicit owner placement are guarded. Four long-image options now contain size/count/packing together; two multirow PDF home-option headings also group without flattening suboptions. All original evidence passages remain exact/traceable.

Fresh forensic audit verified six PDF option rows were read by OCR/extraction but rejected solely as HISTORICAL_FIELD. It was not unreadable-source loss. The generic trusted batch opt-in permits historical text fields while retaining their flag and all other checks, across text/vision paths with cache and in-flight policy fences. No hardcoded source rows, field remapping or historical=false. The private recovery arm separately revalidates those six saved rows; existing stored runs are unchanged.

Frozen input:115previousaccepted candidates/116evidence +6independentlyrevalidated historical candidates =121candidates/122evidence. All122passages included; original quote values and evidence retained. Source-page provenance verified. Four final code replays exactly reproduce the saved plans; six recovered row prices/quantities remain owner-review-pending.

| Same original gold/scorer,4known sources | Fact selectors | Critical selectors |
| --- | ---: | ---: |
| Original v11 |73/94|27/38|
| Previous complete draft |81/94|29/38|
| Current source blocks + recovery |87/94|35/38|

Revised gold remains unchanged: pagewide essential30/31, optional51/55, owner-review6/9; linked-clause essentials24/31. These diagnostics do not certify semantic quality. The seven remaining old-gold misses are six distinct missing text groups, because the full producer name is counted twice. They include a comparative qualifier, two historical durations, full producer name, regular-customer context and visual size-reference labels/caveat. They are upstream omissions, not all mere spelling mismatches or review withholding. Original size graphic still contains its labels. No missing fact was injected from gold into generated pages.

Validation: related suite554backendpassed(52.16s)+13UItests before final explicit-owner-placement edge; final focused pure139passed(5.64s)+14UItests after edge fix. Worker/OCR/legacy-workspace cohort135passed(23.27s). Final source-publication/service cohort12passed(6.46s), including actual grouped historical option private save/reopen and pending-review public gate. First such DB run from repo root failed11/1pass because parser subprocess requires server cwd; proper server-cwd rerun passed. Test expectations not weakened. All5workspace typechecks passed. Ruff/diff passed. New private comparison validates all122passages, all module values, mobile/desktop widths and original images/PDF pages. Failure-review view validates11cases,6remaining issue cards, source links and filter behavior.

Independent mediumSol review found and closed false-ready crossmodule joins, reversed span order, and owner placement overridden by grouping. Numeric adjacency is not semantic approval; cross-context review remains. Earlier fixture typos and failed intermediate runs are retained privately. No paid calls, holdout/production access, merge or deployment. Human review and release remain open. Agent approx0.5h continuation / Tokens / Human unconfirmed.

Final live-local browser check after refreshing CI-mode Expo bundle: source-preserving.spec.ts result recorded below. Failure-review packet11issues includes4repaired cases,1connected/context-review case,6remaining distinct omission groups representing7oldgold facts. It uses source/audited excerpts, exact earlier/current output and reason explanations, with working filters/source links; desktop/mobile checks and screenshots inspected. No raw review/source content published in git.

Final real local browser:1passed(7.4s), retries0, after current UI bundle rebuild. Source/private-owner review/edit/save/reopen/explicit apply and mobile/desktop checks passed. This cohort overlaps the previous browser scenario; it is not a new independent producer sample.


### Prose reflow verification — DEV-452
Whitespace-only narrative reflow separates source layout from generated prose. Exact quotes, explicit owner edits, structural rows and review bindings remain protected. Independent review found stale-publication detection missed reflowed original wording; formatting-aware and option-scoped checks now cover OMIT/EDIT/ACCEPT_REPAIR. Re-review reproduced409 rejection and found no remaining MUST in this delta.
Executed: `DATABASE_URL=...farmclub_dev452_source make test-source-preserving`:611backendpassed(56.07s)+14UIpassed; overlapping pure assembly/reflow166passed(9.31s); independent reflow52passed(4.10s); whole-server Ruff passed. Two initial layout-expectation failures were corrected with exact evidence assertions retained. Four private previews match module output at desktop/mobile widths. Same original score87/94, critical35/38. No provider calls or gold changes. Six unique remaining omission groups are present in saved source/OCR but absent/partial in saved extraction, without corresponding rejected candidates; model rationale is unknown. Source completeness is currently prompt-driven, not an enforced source-unit ledger. Human review/merge/deploy remain pending. Agent approx0.5h continuation / Tokens / Human unconfirmed.


## Fixed-OCR block extraction capability comparison — DEV-453

Three models, four known development sources, two trials each:24paid calls. All models received byte-identical saved OCR transcripts and the same source-blocks-v1 prompt/schema. OCR was not rerun. Gold, prior candidates and missing-fact hints were not sent to models. Whole saved vision-OCR layers were used for raster/PDF; direct text remained whole. Unrelated legal/patent/OCR material was retained in input. Flat transcript references are synthetic container positions, not original PDF page locations.

The user corrected an unnecessarily strict adjacency representation rule during execution. Preserve all original strict outputs. After all calls, all24raw responses were reprocessed offline with the same source-blocks-v2-independent-refs materializer: nonadjacent passages retain separate exact evidence runs and paragraph boundaries; no intervening text is invented. No paid calls were repeated for this repair. These are v1-generation/v2-conversion results, not measured live v2-prompt behavior.

| Model / reasoning | Original94-fact lexical matches, trials1/2 | Critical38matches, trials1/2 | Eight-call settled cost |
| --- | --- | --- | --- |
| Gemini3.1FlashLite / off |77/94;51/94|30/38;20/38|$0.038937|
| GPT6.1Sol / medium |76/94;76/94|33/38;33/38|$0.318263|
| GPT6.2Astra / medium |83/94;86/94|36/38;36/38|$1.039255|

Counts measure fixed original-gold lexical coverage in actual private draft output, not semantic accuracy. A failed source remains in the denominator. Lite PDFtrial2 has a nonexistent source ID with a zero-padding typo; whole-source output fails conversion. Do not attribute that entire score loss to semantic misunderstanding. Normalized23/24outputs materialize. Sol/Astra restore PDF comparison/history, producer name and size-reference labels to drafts. Regular-customer context remains ledger-only except Astra trial2, reflecting attribution uncertainty. Lite loses size-guide/caveat text as DECORATIVE, groups useful content with unrelated material in an oversized unrouted block, and misattributes a distributor as producer. No inspected accepted candidate contained patent/court/exam contamination.

Stronger models also encounter conservative exclusion-checker mismatches: genuine navigation controls outside the allowlist and legacy `[전화 가림]` redaction markers are flagged as unsupported exclusions. Those are protocol/checker disagreements, not established product-fact omissions. Unrouted blocks and model reviewReasons stay visible in the private ledger and are not counted as generated-page recovery. No release or producer-acceptance PASS. Prior review draft87/94and35/38critical remains historical context, not an exact-input controlled arm; this experiment does not establish an overall improvement over it. Astra is the best-coverage candidate in this bounded comparison; Sol is stable and cheaper.

24calls cost$1.396455. Separate stopped preliminary cohort retained1completed$0.034334call and1interrupted$0.127688reservation. Existing cumulative local experiment ledger:521rows,$3.105995settled+$0.956184uncertain,$25.937821remaining under user-authorized$30cumulativecap. This is the experiment ledger, not the API account balance. No automatic retries, holdout access, production mutation, merge or deployment.

Executed after v2: `DATABASE_URL=...farmclub_dev452_source make test-source-preserving`:670backendpassed55.82s+14UIchecks passed; pure helper/runner59passed0.40s(overlapping). Earlier v1related119passed6.69s. Initial v2one layout expectation failed58passed, then boundary expectation corrected with exact evidence assertions retained. Initial nonexistent test filename ran0tests and remains recorded. Independent mediumSol code/results review found no remaining observed MUST. Private viewer all24module outputs/downloads exact;8case/trial browser selections,0pageerrors, desktop/mobile check and screenshot inspection passed. Human high-risk code/producer review remains pending. Agent approx0.5h continuation / Tokens / Human unconfirmed.

Final configuration boundary: Astra prices support explicit experiments, but enabled product Settings reject Astra until legacy refinement support is separately implemented. New regression and affected controls120passed6.82s; independent guard+block39passed0.32s(overlap), server-onlyRuff/diffpassed. No remaining observed MUST in independent final review.
