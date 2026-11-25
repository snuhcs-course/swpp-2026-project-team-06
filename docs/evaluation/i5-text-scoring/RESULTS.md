# DEV-447/448/449 text-first implementation — 2026-11-24

User authorized issue consolidation and implementation of the reduced Version2 text plan. ExistingDEV445rollup and447–453workissues reused, no duplicate newprogram created. DEV446essentialcontract merged into447; oldfullrubric issue canceled and draftPR795closed with branch/evidence retained. DEV456–464photo/visualwork backlogged; old code/attempts immutable. Release decisions DEV412/413/433 remain separate. Schedule existing18rows synchronized, no new estimates/deadlines/humanhours invented.

## Implemented first wave
- New opt-in bounded text_score evaluator leaves historical final_score/gold/helpers unchanged; exposes rawlegacy, pagewide lexicalcoverage/placement, separately confirmedsemanticlower/upperbounds, explicitunknown, outputcorrectness, duplicateburden and processing. Explicit95%performat is distinctfromcriticalGate. No calibratedsemanticprecision or approvedfullgold claim.
- Both sentence/fact reviews require source/output/evidence identities including currentgoldSourcehash; oldnegativejudgments veto lexicalcredit. Precedingsample/date/productcontext blocks automatic support. Mechanicalunit/rangeequivalents guarded; unknownparaphrases remain unresolved.
- New accepted-source inventory preserves exactcandidatevalues/quotes, target/revisions andduplicateevidence beforeeditorialrewrite. Everyunit requiresKEEP/EXCLUDE/REVIEW; stale/tampered/incomplete plans reject. Sourceunits are not atomicgoldfacts and accounting is notsemanticproof. No generator/editor default adoption.
- Exclusive offline comparison runner and reproducible55publiccapabilitycontrols. Proposed labels never used as semanticjudgment inputs. Correctempty allowlist is explicitcontract metadata.

## Targeted pilot
Eight existingdevelopment sources (twoeach text/image/longimage/PDF),130historicalfacts55critical; selected bycomplexity/knownsourceissues before newoutputs. Eightcorrectionproposals remainassistant-proposedhumanPENDING. Original354facts/154criticalflags andalloldinputs unchanged;105schema/fidelity checks passed. Source-scoped factIDs retained (330uniqueunscopedIDs but354unique source/factpairs). All64adapted historicalrecords retained,63EVALUATED/1FAILED; original96rawrows unchanged. Thisis purposive diagnosticpilot, notfullgoldaudit or independentgeneralization.

## Capability result
55inventedcontrols (38prior+17new):21PASS/23FAIL/11UNKNOWN in the opt-in evaluator. Noneof the proposedunsupported-output controls receives newPASS. Thisselectedsuite is notaccuracy. Proposedjudgments require humanreview. Explicitnegativejudgmentbinding and context/stale guards additionally tested by unit/independentprobes. Initialextra-controls schema/monetary-in-gold incompatibilities retainedprivately then corrected beforetrackedreport; finalpublicrunner parsesbothfiles unchanged andinjects noexpectedtruthjudgments.

## Saved-output interpretation
Historicalgrouped baseline trial1: oldstrict89/130 vs newpagewide lexical107/130 (82.3%),critical43/55. Difference reflectsplacement/tokenmeasurement, NOTgeneratorgain. Newautomaticsemanticdecision coverage was insufficient on historicalparaphrases: noapproved correctedsemanticbaseline established. Zero confirmed lowerbound mustnotbereported as0%accuracy. Fullgoldreference paraphrases mostlynotmechanicallysourcebound; furtherjudgment/calibration remains explicit, notsilentlyaccepted bykeywordmatching. All8savedarmreports retained privately, including firstexploratoryrunner revisions. No newmodelcalls orbudgetspend.

## Verification
Final command/results recorded after execution below. Initialcombined run508passed/1failed (temporalguard), earlierunitrun34passed/1failed (raw-vs-split hash test); both retained as engineeringhistory. Independentreview reproduced stalegold reviewreuse and precedingcontextfalsePASS, then7scorer+5inventory pureclosureprobes passed0failed. FocusedRuffpassed. Inventorypytest28passed. No productionaccess, deployment ormerge.

## Remaining
Fullsemanticbenchmarkacceptance, humanreview ofdisputed gold/control meanings, DEV453extractionstage comparison, writeradoption and textedit/save/apply integration remain open. Current commit isfirstimplementationwave, notcompletegeneratorimprovement orreleaseapproval. Agent approx0.5h (elapsedfirstwave)/Tokens / Humanunconfirmed; priorHuman5h retained onlyDEV445parenthistory.

### Final executed verification
`DATABASE_URL=<isolated farmclub_dev448> .venv/bin/pytest tests/test_text_score.py tests/test_text_score_compare.py tests/test_source_inventory.py tests/test_final_score.py tests/test_final_eval.py -q` fromserver: **545passed0failed (41.90s)**, including81new evaluator/runner/inventory tests and464existing scorer/evaluator tests. FocusedRuff and gitdiffcheck passed. Legacyfinal_score/corpus_score/text_safety/devmanifest have no diff againstorigin/main. Earlier543passed/1failed headingfalseabstention fixed withoutweakening independent-measurement test; stale/context/privacy regressions pass.

Publiccontrolrunner finalreplay55cases:21PASS23FAIL11UNKNOWN,0proposedunsupportedcasesPASS. Privatecomparisonfinalr004 runsall8arms with0providercalls; publicreportcontains onlyaggregatecounts/hashes. IndependentAIreview confirmed12pureclosurechecks and nooutstandingfindingswithinboundedcontract. No new semantictruth/humanacceptance implied.


## Next phase: inventory writer and scorer audit (DEV-450/451)

The new explicit writer adapter is implemented alongside default v11. It binds the entire accepted inventory and current target/revisions to a versioned request, requires one disposition per unit, preserves literal text and runs the existing final safety validator. Missing/rejected KEEP units are incomplete. Exclusions require review. Every outcome, including COMPLETE and EMPTY, explicitly requires content review; these statuses describe assembly accounting only. No producer draft or production default changes.

The source audit distinguished upstream rejection, placement, real qualifier loss and unresolved semantics. Six missing PDF option rows had already been rejected as historical fields; copying raw rejected rows back into a page would bypass the current contract. A reference-only measurement qualifier can disappear despite numeric selector hits. These findings are assistant-audited leads, not human adjudicated gold.

### Frozen-input literal control

Eight development examples, 121 accepted source units; 112 KEEP units retained literally and nine units explicitly require review. Four examples completed assembly accounting and four require review. Both saved baseline and literal control were evaluated under the same scoring implementation and evidence. Historical baseline request provenance is a declared saved snapshot, not an independently attested provider request.

| Diagnostic | Saved baseline | Literal control |
| --- | ---: | ---: |
| Page-wide selectors | 107/130 | 110/130 |
| Critical selectors | 43/55 | 42/55 |
| Primary placement | 69/130 | 56/130 |
| Permitted placement | 86/130 | 71/130 |

**The literal control is not selected for product adoption.** A small page-wide selector increase does not offset critical/placement regressions. These are selector diagnostics, not calibrated semantic accuracy. The control makes no provider calls and cannot demonstrate better model output. Semantic automatic decision coverage remains insufficient; confirmed lower bound zero is not zero-percent accuracy.

The audit also found cross-option quantity and cross-property negation false positives. Corrections suppress automatic contradictions for complete exact source alternatives without awarding semantic support. Numbered source headings are covered, and swapped ordinal/value combinations remain rejected. On identical literal records, unsupported sentence flags fell from seven to three; five legacy forbidden matches remained unchanged. Remaining policy/other-product/service clauses expose upstream/current safety limitations, not successful safe copy. No new blacklist was tuned to hide these cases.

### Verification and limits

Independent medium Sol review used eight pure mocked-transport/privacy/usage probes. First integrated suite: 918 passed, two failed because of new test-fixture errors (reversing a generator, and expecting an exception where the documented result is INCOMPLETE). Both fixtures were corrected; invalid response binding is now tested with a mismatched hash. An initial sandbox run had 403 database setup errors; no test cases executed successfully in that attempt. The isolated local database rerun passed 403 related tests. Final expanded suite result follows after execution.

Medium Sol implemented/audited/reviewed; Luna added bounded regressions; coordinator integrated and ran tests. No high Sol, paid provider calls, merge, deployment or human acceptance. Original cumulative $5 allowance unchanged. Agent approximately 0.5h elapsed for this continuation / Tokens / Human unconfirmed; prior DEV445 Human5h is not reassigned. Full prose editing, semantic deduplication/calibration, extraction/currentness policy, owner-flow adoption and producer acceptance remain open.

### Executed expanded verification

`DATABASE_URL=<isolated farmclub_dev448> .venv/bin/pytest tests/test_text_score.py tests/test_text_score_compare.py tests/test_source_inventory.py tests/test_inventory_refinement.py tests/test_inventory_compare.py tests/test_source_refine.py tests/test_final_score.py tests/test_final_eval.py -q --tb=short` from server: **929 passed, zero failed (89.14s)**. This includes all unchanged historical scorer/evaluator tests and the existing default-v11 refinement suite. Final source-local cache optimization was separately rechecked after this run (result below). Focused Ruff and git diff --check passed. All 55 capability controls remain 21 PASS / 23 FAIL / 11 UNKNOWN; no proposed unsupported control receives PASS.

Independent final review: ten pure closure probes passed, no unresolved must findings. Latest private replay r002 retains the same selector totals, four complete/four review assembly outcomes, three unsupported sentences and five legacy forbidden violations. Original r001 and all historical outputs remain unchanged. No paid calls or budget changes. CI and human review are separate from these local results.

Final post-cache focused command: isolated `.venv/bin/pytest tests/test_text_score.py tests/test_inventory_refinement.py tests/test_inventory_compare.py -q --tb=short`: **89 passed, zero failed (9.33s)**. No source changes followed this verification.


## Live passage routing and quote-repair comparison

Live implementation commit: 92c5c4f1. Fixed provider/model: OpenRouter / google/gemini-3-flash-preview, output cap 8,000, two trials per arm. Primary eight-source inputs were frozen before requests; only accepted candidates, quoted context and target information were sent. Full OCR and gold remained offline. The two-source extraction supplement was separately predeclared and never pooled with the primary pilot. All 48 calls and failed records were retained without retry. No holdout access, gold changes, production mutation, merge or deployment.

### Primary eight-source result: reject passage-router adoption

| Trial | Writer | Page-wide selectors | Critical selectors | Permitted placement |
| --- | --- | ---: | ---: | ---: |
| 1 | Current v11 | 105/130 | 44/55 | 83/130 |
| 1 | Passage router | 33/130 | 13/55 | 24/130 |
| 2 | Current v11 | 109/130 | 44/55 | 83/130 |
| 2 | Passage router | 58/130 | 23/55 | 44/130 |

The experimental router is unselected. Five of its 16 primary responses failed validation; all current-v11 responses produced retained text. The exact invalid-response subcauses remain UNKNOWN because the original adapter did not retain parsed raw invalid output or safe reason codes. No later code change is treated as an explanation or correction of these historical outcomes.

Independent audit attributes 42 of the 52 lost critical selector instances to failed response cases, and ten to valid whole passages marked REVIEW. The latter include blocked parents and mixed product/other-product/service passages. Only four of 121 candidate units split into finer passages. All kept passages survived final safety validation. This does not establish that valid routing decisions were semantically correct. Retaining zero unsupported-sentence flags alongside low coverage is not a quality improvement.

### Separate extraction supplement: retain the narrow repair as the supported direction

Existing v11 writer, original versus quote-layout-repaired candidates:

| Trial | Input | Page-wide selectors | Critical selectors | Permitted placement |
| --- | --- | ---: | ---: | ---: |
| 1 | Original | 23/44 | 6/16 | 23/44 |
| 1 | Repaired | 32/44 | 11/16 | 28/44 |
| 2 | Original | 23/44 | 6/16 | 23/44 |
| 2 | Repaired | 32/44 | 11/16 | 28/44 |

The affected PDF gained nine fact selectors in trial one and ten in trial two; the unchanged long-image control varied down by one fact in trial two. All five additional critical selectors came from the affected PDF in both trials. This is a targeted development result, not a cross-format accuracy estimate. No new unsupported-sentence flags were detected in these v11 supplement outputs; semantic uncertainty and human adjudication remain open.

The frozen extraction replay preserved all 68 original accepted values/quotes and reproduced 16 prior rejection codes. Eight newly accepted candidates came from one PDF outside the primary pilot; six passed unchanged literal page-safety echoes. In actual v11 generation, seven recovered candidate IDs were cited in retained text in both trials, with existing neutral editing/safety handling. These are different checks and must not be conflated. Six historical-field rows remain rejected. Only three retained, bounded reconstructed chunks were replayed; seven primary exports are explicitly unchanged/NOT_REPLAYED. Full original provider chunks were not captured. Draft PR798 retains the narrow consecutive-span Korean line-wrap fix; no automatic raw-candidate restoration or rollout is authorized by these scores.

### Cost and implementation verification

48 actual model calls; phase ledger charge **$0.266945** within the fixed $1.50 phase allowance. Cumulative settled **$1.638684** plus prior uncertain reservations **$0.828496** leaves **$2.532820** of the original $5 cap. No new uncertain reservation and no further paid calls in this phase.

Before paid execution, the complete isolated scoring/generation regression suite passed **959 cases, zero failed (86.21s)**; the new passage/budget suite passed **30 cases, zero failed (5.31s)**. One initial oversized-input fixture used exact duplicates that correctly collapsed; it was corrected to distinct values without relaxing limits. Independent review fixed detached hedge context and unknown-cost continuation before execution. Focused Ruff/diff checks passed.

After the experiment, fixed redacted validation reason codes were added for future source-scoped attribution, with usage/request IDs retained and only whitelisted reasons propagated to private failure artifacts. Valid output, routing, prompt/schema, default v11 and prior literal behavior remain unchanged. Past invalid subcauses are still UNKNOWN. Final post-diagnostic test evidence is recorded below after execution.

Private text-only comparison preserves all 48 records, protocols, inputs, costs and both trials, with primary/supplement separated; HTML links and HTTP availability checked. This is a diagnostic text viewer, not an actual app screenshot or visual-quality benchmark. Earlier page-evolution and review packets remain untouched.

Medium Sol implementation/source audit/independent review; Luna bounded regressions; coordinator integration. No high Sol. Agent approximately 0.5h elapsed for this continuation shared across DEV450/451/453 (not additive) / Tokens / Human unconfirmed. Prior DEV445 Human5h remains unchanged. Human code/source/editorial review, full semantic scoring/calibration and release acceptance remain open.

Final post-diagnostic command: isolated `.venv/bin/pytest tests/test_text_score.py tests/test_text_score_compare.py tests/test_source_inventory.py tests/test_inventory_refinement.py tests/test_inventory_compare.py tests/test_passage_refinement.py tests/test_passage_compare.py tests/test_source_refine.py tests/test_final_score.py tests/test_final_eval.py -q --tb=short`: **962 passed, zero failed (87.51s)**. Focused Ruff and git diff --check passed. Independent final diagnostic review has no unresolved must findings. No model calls followed the frozen 48-call experiment. All six invalid-output subcauses (five primary, one repaired supplement) remain UNKNOWN; future reason codes are not retrofitted.


## Partial human feedback and scoring calibration follow-up

The first representative review is bound to the original focused baseline v11 trial-one outputs, including a different text source from the current pilot. No approval is transferred to new generations. Feedback supports restoring producer voice and sentence flow while retaining factual summaries and much existing grouping. Optional weight, spacing equivalence and historical-time decisions remain source-specific; quantity wording tolerance is editorial acceptance in one example, not a global mathematical equivalence. Unanswered importance judgments remain pending.

A private source-first packet leads with confirmed decisions and only three unresolved questions. Twelve optional calibration pairs remain separate from assistant proposals. The strict offline reporter recomputes source/output/gold hashes, supports partial reviewed dimensions and retains missing labels, predictions, abstentions and failures. It never edits gold or infers semantic approval. Real pending-template replay:12pairs,0reviewed, statusPENDING_HUMAN_REVIEW,0provider calls. Voice/naturalness remains qualitative feedback outside the three factual dimensions.

Actual isolated command: `.venv/bin/pytest tests/test_text_calibration.py tests/test_text_score_compare.py tests/test_text_score.py -q --tb=short` with the isolated farmclub_dev448 database: **93 passed, zero failed (7.00s)**. Focused Ruff/diff checks passed; independent review verified16pure cases and original artifact/source bindings with no unresolved must findings. No new model spend, gold changes, merge or deployment. Agent approximately0.5h shared continuation / Tokens / Human unconfirmed.


## Focused wording-only experiment

Live code9fc24855. Four EXACT originally reviewed baseline v11 trial-one pages,69text units,94goldfacts/38critical; two polishing trials. No rerouting, extraction/gold changes or default adoption. Full accepted snapshots remain private/offline; only baseline-cited candidates and nine bounded style excerpts enter the writer. Same Gemini Flash model and8,000output cap.

Before execution,430relatedpytestcases passed0failed(38.09s), including new writer/critic/budget cases and existingv11/scorer regressions. Final26focused cases passed0failed(2.34s). Ruff/diff and independent review passed. Three pre-paid must findings were fixed/regressed: hash-named metadata privacy, package-weight association and property-negation swaps. Critic source/output bindings are rebuilt from internal request/result; no approval transfer. Initial fixture failures were corrected without weakening guards.

Eight writer responses were structurally valid; no transport/schema failures. One page was COMPLETE with uncalibrated critic PASS; seven were INCOMPLETE and did not receive a paid critic, as predeclared. Across138proposed text instances,107passed mechanical/final safety checks and31were rejected (16polarity,12qualifier,2numeric,1final-safety). These guard decisions are not human semantic judgments. Independent source-linked audit provisionally identified11possible guard sensitivities,13observable baseline changes/additions and7mixed/unadjudicated paraphrases. A prefix alarm can coexist with actual changed content; these categories are not false-positive rates. Examples of baseline deviations include added delivery timing and unsupported trust/quality wording. No guard was relaxed or response retried after seeing results.

| Trial | Arm | Fact selectors | Critical selectors |
| --- | --- | ---: | ---: |
| 1 | Frozen reviewed baseline | 73/94 | 27/38 |
| 1 | Polished text retained after checks | 51/94 | 22/38 |
| 2 | Frozen reviewed baseline | 73/94 | 27/38 |
| 2 | Polished text retained after checks | 55/94 | 20/38 |

Decision: keep current v11. The experiment does not establish improved factual accuracy or an acceptable whole-page replacement. The private comparison shows all proposed wording, with rejected edits visibly flagged, separately from retained-output scores. It is a text diagnostic viewer, not an actual app screenshot or visual benchmark. Human voice/readability and factual acceptance remain pending. The one model-critic PASS is explicitly uncalibrated.

Nine actual calls cost$0.036522 against the fixed$0.75phase allowance. Cumulative settled$1.675206 +prior uncertain$0.828496 leaves$2.496298 of the original$5cap. No new uncertainty. All frozen requests/results/costs/failures remain private and preserved; no further paid calls in this slice.

Agent approximately0.5h shared continuation / Tokens / Human unconfirmed; priorparent5hnotreassigned. DraftPR797 contains implementation/evidence; no merge/deployment. PR798 spec review SC-001 scope wording was clarified separately in00aca349 with schema context/disposition; human review remains required.


## Offline per-edit review and explicit composition

Replayed all eight saved voice-polish results without changing source, gold, requests, outputs or original guard outcomes. The138text instances comprise48exact no-ops and90changed proposals. New reporting separates59mechanically eligible changes,24soft wording flags needing review and7hard-blocked changes. None of these are human semantic labels. The existing model critic covers6text instances, including5no-ops; only1changed edit has an existing model judgment. All90human decisions remain pending. Zero useful-edit accuracy is inferred from missing labels.

Each human decision binds baseline request/source revision, text identity and exact original/proposed hashes. Wording APPROVE and semantic PASS are independent and both required to compose an edit; readability-only approval does not imply factual approval. Hard numeric/privacy/causal/final-safety and recognized presence/absence changes remain non-overridable. Unknown-prefix wording alarms are review evidence rather than automatically proven errors. Recognized property relations retain order/multiplicity to prevent reversal being hidden in a set.

Composition starts with exact v11, records baseline provenance for unchanged text, applies only explicit eligible approvals, and runs final whole-page safety validation. All eight real no-review compositions were byte-structure identical to their baseline modules with zero applied edits. Baseline retention is not generation gain. A failed final composition remains an explicit hard failure, not a rescued success. No product generator/UI/persistence change was made.

Prepared89isolated pending critic jobs for changed edits, excluded48no-ops and did not requeue the1already judged change. These jobs were not executed. Each single-text job preserves exact parent binding, local text identity and request hash; an unsafe proposal blocks only its own job. Model PASS remains uncalibrated and cannot approve composition.

The private source-first six-edit decision packet spans four formats with separate assistant observations and pending human answers. Its exporter requires separate wording and factual decisions and does not infer PASS from APPROVE. The main viewer retains all90proposals, counts and source-bound reports. Older packets remain unchanged. Link/hash and local HTTP checks passed; native app screenshot/visual evaluation is not claimed.

Actual final command with isolated farmclub_dev448 database: `.venv/bin/pytest tests/test_edit_review.py tests/test_voice_polish.py tests/test_text_calibration.py -q --tb=short` → **61 passed, zero failed (4.62s)**. Focused Ruff/diff checks passed. Independent medium Sol review closed known-property deletion/order and independent semantic-approval requirements, plus per-edit critic privacy/isolation and exact bindings. Earlier55pass/2fixturefail and60pass/1fixturefail runs were corrected at fixture boundaries (string/list helper, per-text versus whole-page injection, internal critic request shape); guards were not weakened.

Medium Sol implementation/audit plus Luna tests and separate medium Sol review; no high Sol. No new provider/generation/judge calls or ledger charge. The prior remaining$2.496298 includes existing uncertainty. Agent approximately0.5h shared continuation / Tokens / Human unconfirmed; prior parent5h unchanged. No merge/deployment. Human source decisions and broader scoring calibration remain open.


## Source-preserving control result — 2026-11-24
Implemented source_copy.py, an offline exact-evidence-quote control on the same four focused-review inputs. It preserves original wording, line breaks and qualifiers, and retains baseline citation/module links. Every source occurrence has a disposition; ambiguous routing, old/unresolved dates and existing safety rejection remain visible. Exact identity deduplication is supported, not semantic repetition editing.
Actual frozen replay:69 baseline texts,97 frozen candidates/98 evidence occurrences;75 complete source passages displayed,23 queued,0 deduplicated in this subset. Eighteen accepted candidates outside the frozen wording requests are explicitly outside this control. Original assets and stored snapshots for all four cases match prior hashes. These are accounting counts, not an accuracy or recall improvement. No new model calls, gold changes, default adoption, merge or deployment. Human editorial/source review pending.
Verification: isolated local DATABASE_URL=farmclub_dev448, .venv/bin/pytest tests/test_source_copy.py tests/test_voice_polish.py tests/test_edit_review.py tests/test_text_calibration.py -q --tb=short →77 passed,0 failed (5.72s). Earlier collection import error fixed; first executable run76passed/1fixture failure expected duplicate provenance count incorrectly, corrected to one unique source identity while requiring both candidate/occurrence IDs. Focused Ruff and git diff checks passed. Headless Chromium:5 pages,75 displayed strings exactly equal source results,10 links HTTP-success,390px overflow checks and one pending-filtered qualitative answer export passed. Screenshot inspected. Independent medium Sol review closed frozen-binding, specific-caveat and proper-name date matching findings.
Private reviewer packet has six audited spotlights and four full before/source-preserved comparisons; all human labels pending. Review preferences never import as semantic PASS or publication approval. Agent approximately0.5h continuation / Tokens / Human unconfirmed; prior DEV445Human5h unchanged.


## Conditional source-copy quality prototype — 2026-11-25
User selected source preservation subject to copyediting checks and separate owner confirmation for conditional facts. Recorded direction separately from item judgments; no sentence/gold/release approval inferred. New offline source_copy_quality.py reconstructs bound v1 quotes, independently scans even previously queued quotes for safety, and separates COPY_EDIT/OWNER_CONFIRMATION/PLACEMENT/SAFETY. Original wording remains intact; bounded whitespace-only repair proposals are unapplied. Possible fragments, spacing and exact repetition are signals, not general grammar proof. Cross-passage exact repeated sentences are checked without removing content or stripping numbered headings. Price confirmation never inserts a price into description.
Frozen four-source replay:98 passages,65 draft passages,6 copyediting flags,24 owner-confirmation items,6 placement items,11 safety items; queues overlap,18 accepted candidates outside frozen requests remain outside. Broader assistant audit observations (15 copy concerns) are separate from mechanical output, source/hash-bound and unadjudicated. Relative time, historical/dates, seasonal/availability, payment/return terms, prices/fees and dispatch promises have distinct owner reasons. Local export requires an explanation for confirmations/corrections and never applies/saves product changes. No model calls or new spend. Full grammar automation, semantic repetition judgment and persisted app integration remain open under DEV-450/452. Existing generator/defaults/gold/old packets unchanged.
Actual command from server with isolated farmclub_dev448 DATABASE_URL: .venv/bin/pytest tests/test_source_copy_quality.py tests/test_source_copy.py tests/test_voice_polish.py tests/test_edit_review.py tests/test_text_calibration.py -q --tb=short →97passed0failed(7.35s). First run95passed1failed (fragment test contract was still being aligned); frozen suite96passed, then compact-date regression97passed. Ruff configured with server/pyproject.toml and diff checks pass. Headless Chromium:5pages,24links,65 exact draft strings,queuecounts,390pxwidths,required explanatory note and pending-filtered unapplied export pass; screenshot inspected. Independent medium Sol review closed actual dispatch/holiday/repetition misses, numbered-heading split, test contract and visible separate manual-audit observations.
Ownership amendment: coordinator took quality-module implementation after initial agent design; Luna tests and medium Sol independent audit/review. No new dependency, merge or deployment. Agent approx0.5h continuation / Tokens / Human unconfirmed; prior parent5h unchanged.


## User-authorized relaxed gold and draft-first revision — 2026-11-25
Supersedes earlier policy pending/withholding behavior for new revision only. New versioned gold migration and relaxed evaluator are in ../i5-relaxed-gold/. Same historical scorer: full private source draft81/94facts29/38critical vs saved baseline73/94and27/38; earlier withholding61/94and22/38 retained as failed history. Revised policy separately scores essentials24/31 vs23/31baseline, optional51/55 vs45/55; these are pagewide diagnostics, not semantic accuracy or release approval. Linked-clause essentials remain18/31 vs22/31, so source-copy assembly still needs relationship/option review. All raw historical gold/output/scorer files unchanged; no new provider calls.


## Formatting-only scorer v2 correction

See [corrected all47case comparison](../i5-relaxed-gold/SCORER-CORRECTIONS-2026-11-25.md). Primary142essential coverage legacy122/125versus preservation/guardedAstra132; original354coverageunchanged. Spelling/phrase3facts separate diagnostics. Final1155related+13migrationpassed; independent154pureoverlap. No paidcalls/gold/generationchanges; initialtwofailedreplaysretained. Agentapprox0.5h / Tokens / Humanunconfirmed.
