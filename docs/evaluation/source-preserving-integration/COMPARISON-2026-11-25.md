# Full development comparison — 2026-11-25

DEV-451/452 · FEAT-03/04/07 · AC-SRC-2/3/5/6/11. This report supersedes using the four-source examples as the main comparison. It reports all 47 existing development sources, including empty and failed historical cases. It does not establish release readiness, semantic accuracy or producer acceptance.

The new pipeline retains more source information in private drafts than the fresh legacy writer: **328/354 pagewide lexical matches (92.7%) versus 294/354 and 292/354 (83.1% and 82.5%)**. It remains below the unchanged 95% coverage target. The paid organization step adds no pagewide or essential coverage over deterministic source assembly; its observed benefits are limited organization/linked-clause improvements. Strict historical placement results are weaker or mixed. These dimensions must remain separate.

## What “47 sources” and “regression” mean

“47 sources” means 47 saved example inputs: 24 public-development materials and 23 synthetic test cases. The number counts documents/images/text inputs; no new participant study was conducted. A regression check reruns known cases after a change to find behavior that has worsened. Passing such checks supports compatibility with those cases, while performance on unseen material remains a separate question.

## Matched input and arms

The fixed input is the accepted stage-1 inventory from the saved November 18 g2 development run: 24 public-development and 23 synthetic sources; 26 text, nine image, four long-image and eight PDF inputs. It contains 345 accepted candidates and 350 evidence occurrences, producing 348 distinct source passages. OCR and extraction were not rerun. Facts absent from accepted extraction were not added from gold or original-source inspection.

| Arm | Definition | Runs |
| --- | --- | ---: |
| Historical g1/g2 | Saved post-DEV-355 results; historical context | Two saved runs |
| A | Fresh Gemini 3 Flash v11 writer with the final legacy guards | Two trials on all 47 sources |
| B | Deterministic full accepted-source assembly | Once on all 47 sources |
| C raw | Astra medium organization/light editing of B, before production admission | Two trials on all 47 sources |
| C effective | The actual production admission/original-wording retention/fallback outcome | Same two trials |

A/B/C use identical accepted stage-1 inputs. Historical g1/g2 are not fresh identical-input controls for every current implementation detail. A's relevant guard functions were checked against the November 20 shipped baseline; provider preview revisions may nevertheless have drifted. The previous four-source and upstream extraction experiments remain separate evidence, not additional independent samples.

Every A/C job reached a terminal outcome: 188 planned outcomes, 180 paid calls and eight explicit no-text skips. No automatic retry or best-trial substitution occurred. C produced 88 APPLIED and six FALLBACK outcomes: four no-text skips and two admission rejections for exclusions. There was no fresh provider-generation failure. Raw C and effective C are reported separately; fallback coverage is not model-generated improvement. Historical g1 retains its one invalid-output failure and its denominator.

## Historical unseen-set result stays separate

The [Iteration 4 evidence report](../../wiki/AI-Collaboration-Report---Iteration-4---Evidence.md) records the November 18 holdout aggregates: **75/134 facts (56.0%), 25/33 critical facts (75.8%), 95/134 semantic matches (70.9%), three forbidden violations and two unsupported items**. Those results belong to the earlier build and unseen-source test. They are retained without opening the sealed folder or running that set again.

A claim of improvement from **56.0% to 92.7% would be invalid**: the numbers use different datasets, builds, input stages and scoring views. The controlled current comparison is A/B/C on the same 47 known development inputs. No current new-pipeline holdout result is established.

## Frozen original gold: coverage and placement

All arms use the same 354 original facts and 154 original critical flags. Strict scoring is `dev264-number-evidence-v2`; pagewide and placement diagnostics use the frozen `dev448-text-v1` evaluator. Selector matches do not establish correct option relationships or semantic support.

| Arm | Strict facts / 354 | Strict critical / 154 | Pagewide facts / 354 | Pagewide critical / 154 | Primary / permitted placement, / 354 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Historical g1 |221|109|249|117|173 / 217|
| Historical g2 |243|120|289|129|197 / 243|
| A trial 1 |246|118|294|130|197 / 244|
| A trial 2 |242|121|292|135|199 / 238|
| B |237|108|328|143|189 / 222|
| C raw trial 1 |241|108|329|143|195 / 228|
| C raw trial 2 |244|107|329|143|198 / 231|
| C effective trial 1 |239|108|328|143|192 / 225|
| C effective trial 2 |244|109|328|143|195 / 229|

C effective improves pagewide coverage over A in both trials but does not improve that coverage over B. Its permitted-placement matches improve modestly over B and remain below A. Strict critical results are lower than A. Moving source-bound option properties into one coherent section can reduce legacy section-based credit; this explains part of the difference but does not justify dismissing every placement miss. Some routing remains review work.

Paired A→C effective pagewide changes are **37 gains / three losses** in trial 1 and **38 gains / two losses** in trial 2. Strict changes are 27 gains / 34 losses and 32 gains / 30 losses. A's two trials exchange 14 pagewide gains and 16 losses; C effective has the same 328 pagewide hits in both trials. Stable lexical coverage is not proof of stable semantic correctness.

### Format and cohort results

The denominators below are unchanged original gold. B and both C effective trials have the same pagewide results.

| Format | Sources | A facts, trials 1 / 2 | B and C effective facts | A critical, trials 1 / 2 | B and C effective critical | Fact coverage ≥95%? |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Text |26|87 / 103; 86 / 103|97 / 103 (94.2%)|42 / 46; 42 / 46|45 / 46|No|
| Image |9|45 / 52; 48 / 52|51 / 52 (98.1%)|30 / 35; 33 / 35|35 / 35|Yes, lexical only|
| Long image |4|80 / 92; 74 / 92|86 / 92 (93.5%)|23 / 25; 22 / 25|23 / 25|No|
| PDF |8|82 / 107; 84 / 107|94 / 107 (87.9%)|35 / 48; 38 / 48|40 / 48|No|

Public-development sources separately reach 298/324 pagewide facts and 123/134 critical facts under C effective. Synthetic cases reach 30/30 and 20/20. These are different cohorts; synthetic success does not establish public-source or unseen-source readiness. Overall and three of four format fact-coverage results remain below 95%.

## Revised policy: applied symmetrically

The separate user-authorized `draft-first-gold-v2` policy maps all 354 old facts, preserves their critical flags and adds one optional descriptor. Its 355 entries are 142 essential, 186 optional and 27 owner-review items. This is policy authorization, not a completed human factual audit. `dev448-relaxed-v1` is applied to both old and new outputs without changing historical results.

| Arm | Essential / 142 | Optional / 186 | Owner-review information present / 27 |
| --- | ---: | ---: | ---: |
| Historical g1 |103|126|14|
| Historical g2 |112|151|17|
| A trial 1 |118|156|13|
| A trial 2 |118|149|14|
| B |130|174|22|
| C raw trial 1 |130|174|21|
| C raw trial 2 |129|174|21|
| C effective trial 1 |130|173|22|
| C effective trial 2 |130|173|22|

These are pagewide policy-selector diagnostics, not semantic accuracy. Essential coverage of 130/142 (91.5%) remains below 95%. Revised essential results by format are text 42/43, image 34/35, long image 22/25 and PDF 32/39; long image and PDF remain below 95%. Public-development essential coverage is 111/123; synthetic is 19/19.

Linked-clause essentials improve from B's 117/142 to C effective's 119/142 in both trials, compared with A's 115/142 in both trials. C adds two linked-clause matches but zero pagewide essential hits over B. The apparent one-optional-hit decrease from B is a verified page-normalization boundary artifact, described below; the frozen score remains unchanged. Old critical /154 and revised essential /142 are never interchangeable improvement denominators.

## Loss inspection and unresolved quality

Read-only inspection of the requested A→C pagewide regressions found three distinct source-wording issues: an equivalent consumption recommendation using a different selector word, a source spelling retained instead of the gold spelling, and another source spelling retained in storage-related advice. Source information remains present. The storage-related advice also remains in its baseline taste section, so placement needs separate review.

Two revised-policy losses are evaluator boundary artifacts: page normalization removes paragraph boundaries and can place a sentence period immediately before a numeric range, or an ASCII heading immediately after a normalized measurement unit. Per-clause matching confirms the retained facts. No gold, scorer, output or frozen headline count was changed to remove these misses. These narrow diagnoses do not excuse unrelated omissions or validate general paraphrase equivalence.

The full bounded-support evaluator leaves 351/354 facts UNKNOWN for C effective. This measures the evaluator's narrow confirmation envelope, not 351 established errors. C effective retains 13 exact-repetition excesses across 404 output sentences; A has zero and one across 272 and 285 sentences. Current evidence does not establish overall naturalness, correct nonnumeric meaning, option association or producer acceptance.

## Private review and safety are separate from coverage

B and C effective include all 348 accepted source passages; 104 remain owner-review pending and seven carry restricted-source flags. These are passage counts, not 104 omitted facts. C does not clear the source-bound review queue. Private save, explicit owner choices, stale/concurrent edits and public-apply checks remain separate boundaries; this experiment did not publish anything.

Legacy forbidden counters are zero for A and 47 for B/C. They overlap and must not be read as 47 independent invented claims. They include retained source prices, platform terms, lineups/services and health wording, plus explicit gold-rule matches. The three gold-PII matches contain already-redacted placeholders; live phone/email detections are zero. Two generic non-curative health slogans are not current restricted-source flags, so a blanket claim that every old restricted label is automatically covered would be incorrect. Source-context and policy interpretation remain review work. Private retention is not permission for public unsafe content; the zero-public-unsafe requirement is unchanged.

Legacy unsupported-token counts are zero for A/B and one for each C trial. Inspection attributes that one to repairing a split measurement-unit word: the numeric value and threshold are unchanged, but the legacy safe-text tokenizer recognizes a different unit token. The original count is retained. No broad numeric/health/privacy exemption was introduced.

## Cost, latency and final guard replay

| Paid downstream arm | Calls | Known settled cost | Per-call latency p50 / p95 |
| --- | ---: | ---: | ---: |
| A legacy writer |90|$0.221672|1.803s / 6.495s|
| C organizer |90|$2.441755|3.711s / 21.012s|

All 180 call costs are known: $2.663427 for this phase. B has no provider cost. C raw/effective share the same calls and must not be costed twice. Historical end-to-end latency/cost includes OCR and extraction, unlike these downstream-only measurements. Percentiles use median p50 and nearest-rank p95.

The cumulative experiment ledger ends at 709 rows, $6.363697 settled plus $0.956184 previously uncertain reservation, leaving $22.680119 under the authorized $30 cap. This is the local experiment ledger, not an API account balance.

The paid run's generation code stayed frozen. Subsequent final admission/worker v2 guard changes were replayed offline over all 94 C outcomes: 90 saved raw responses and four no-text skips. Effective modules, passages, review flags, accounting and presentation outcomes are unchanged: 88 APPLIED, six FALLBACK, zero mismatches. Version/cache hashes intentionally change. No additional provider or database calls were used for this replay, and no paid result was silently relabelled as a fresh v2 generation.

## Verification and interpretation

Executed integration evidence, with overlapping cohorts kept separate:

- Full backend suite: 2,627 passed before the final narrow guard changes.
- Full mock suite with test concurrency four: 586 passed, zero failed (137.22s). The earlier 582-pass/one-ECONNRESET run remains recorded; isolated emoticons four passed, and a bounded trace of the formerly failing case passed with 91 completed local requests and no transport error.
- Final local browser cohort: two passed (11.9s). The initial local CORS-origin login timeout and one unrun scenario remain recorded; the corrected local environment does not change product behavior.
- Final v2 guard affected regression cohort, from `server/`: `.venv/bin/pytest -q tests/test_presentation_plan.py tests/test_source_presentation.py tests/test_source_copy_service.py tests/test_source_copy_publication.py` → 54 passed, zero failed (10.03s). Final pure guard/runner cohort: `.venv/bin/pytest -q tests/test_presentation_plan.py tests/test_pipeline_compare.py` → 41 passed (0.63s). These overlap earlier suites and do not establish a fresh full-backend run after every narrow edit.
- Final `DATABASE_URL=<isolated farmclub_dev452_source> make test-source-preserving` → **757 backend tests passed (59.46s) plus 25 UI behavior tests passed**. This includes the final guard controls and 20 pipeline-runner tests. Whole-server Ruff over app/tests and diff checks passed.
- All five workspace typechecks passed. Cohort counts above overlap and must not be summed as independent tests.
- Reporter completion/ledger/grid controls passed; all nine arms retain all 47 sources and the original 354/154 denominators. Eighteen independent quick/full metric cross-checks matched. Input, model/prompt/schema, code, scorer, gold, output and ledger hashes are retained in the private immutable report manifest.

The frozen input SHA-256 is `b90357a7b99b694cafd1b7515bc05a41e7030dabb83ea3ae7402d41f3b2ea915`. Private source text, business data, gold contents and machine-specific artifact locations are not published here.

This evidence supports improved **private content retention** over the matched legacy writer. It does not support an overall 95% pass, a semantic-accuracy claim, automatic publication or a paid-organizer coverage advantage over B. Human review of placement, wording and producer usefulness remains necessary. The previously reported holdout aggregate belongs to its historical build and is not a new-pipeline result; no sealed folder was opened or rescored. No merge or deployment is claimed.

AI-use effort for the combined continuation: Agent approximately5.5h wall clock / Tokens / Human unconfirmed. This supersedes provisional phase checkpoints; no human time or token count was invented.
