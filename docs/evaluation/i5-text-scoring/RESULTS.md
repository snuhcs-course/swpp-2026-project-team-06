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
