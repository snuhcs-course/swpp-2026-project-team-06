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
