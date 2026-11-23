# DEV-448: factual scorer capability controls

The historical scorer can pass materially incorrect statements and reject proposed valid equivalents. This diagnostic reproduces those limitations with **38 invented controls** while leaving the scorer, normalization, development gold, generator and product policy unchanged. The controls' semantic judgments are **PROPOSED_HUMAN_REVIEW_PENDING**, not an approved replacement evaluator.

Artifacts: [controls.json](controls.json), offline [probe.py](probe.py), and complete [results.json](results.json). Related work: [DEV-446 contract proposal](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/795) and [DEV-447 review preparation](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/796). No private source/gold, participant data, model calls or sealed holdout inputs are used here.

## What the run shows

| Observation | Controls | Interpretation |
| --- | ---: | --- |
| Proposed unsupported output passes historical critical gate | 13 | Token presence does not establish correct relations, negation, conditions, scope or full-output support. |
| Proposed incorrect claim receives lexical coverage credit | 12 | Coverage can be awarded to wrong claims, including tokens distributed across unrelated sentences. Overlaps the row above. |
| Proposed valid primary output fails historical gate | 5 | Unit/range spelling and ordinary paraphrases can defeat lexical or unsupported-token checks. |
| Proposed valid primary claim missed lexically | 4 | A subset of the five rejected valid outputs; spaced Brix gets coverage but fails the unsupported check. |
| Preserved fact in another section loses strict recall | 1 | This reflects the documented placement contract. Page-wide preservation and placement need separate reporting. |
| Proposed correct-empty result counted as historical failure | 1 | This is documented existing behavior, not silently redefined as a bug. A revised empty-contract outcome needs approval. |

Rows overlap and must not be summed. Historical gates are PASS for 23 controls and FAIL for 15; that distribution is **not accuracy**. The controls deliberately concentrate known failure patterns, are agent-authored and have no independent human adjudication. They are not a random sample, producer-acceptance result or evidence about unseen model performance.

The 13 passing unsupported-output candidates cover reversed negation with weak selectors; expected→measured; sample average→all-product claim; wrong product; swapped sample values and option quantities; lost approximation; contradictory additions; unrelated fragments; an extra invented property; a quantity substring; stronger uncertainty; and historical→current context. A correct sentence elsewhere does not make the extra property supported, even though the gate passes. The precision proxy is not a semantic gate: it reaches 1.0 for several incorrect controls, while an unrelated-fragment case passes the gate with proxy 0.0.

Five proposed valid outputs fail: kg/g mass equivalence, range punctuation, whitespace inside the Korean Brix unit, a Korean paraphrase and a peel/skin synonym. These are declared meanings of invented examples; approval for a real alias or paraphrase still requires the original source context. The probe also submits each control's reference text as an output. All nonempty references receive lexical credit, but one reference check fails the unsupported-number guard because the spaced source unit normalizes differently. There are 37 nonempty reference checks, with repeated reference examples; they are not 37 independent sources.

Existing defenses also remain visible. New quantities, changed units, combining separate measurements into a range and adding a new numeric claim fail the unsupported-token checks. A selector containing the actual negative phrase rejects the negation reversal. Duplication earns only one claim hit. Missing/failed runs keep the fact in the denominator, leftover failed output remains safety-audited, and PARTIAL remains explicitly visible even where the historical scorer gives its content credit.

## How this was measured

Each case supplies invented safe evidence, one reference claim and selector set (or no claim for the empty case), output texts/modules, processing status and a separately declared proposed semantic judgment/rationale. `probe.py` validates the envelope and constructs ordinary **development** scorer inputs. It calls the unchanged `final_score.score`; it does not load a gold manifest, discover private files, invoke a semantic judge or call a provider/database.

The diagnostic flags compare the proposed judgments with observed fact hits, misplacement, unsupported/forbidden counts and the historical gate. They are transparent discrepancy candidates, not a new semantic classification algorithm. Exact output/reference observations, status, precision proxy and rationale are retained case by case. Results include SHA-256 for controls, probe, scorer, corpus normalizer, safety helper/list and module schema. A zero CLI exit means a diagnostic report was written; it does **not** mean the historical scorer passed semantic validation.

Run from the repository root after `make setup`, using a fresh output path:

```sh
server/.venv/bin/python docs/evaluation/i5-scorer-controls/probe.py --out /private/tmp/dev448-new-report.json
```

The CLI creates output exclusively and refuses to overwrite inputs or previous reports. Regenerate comparisons into a new report rather than erasing the published observations. This control version uses text inputs only and does not establish OCR, per-format model quality or a corrected development baseline.

## Regression checks and next step

The added tests live in the existing [test_final_score.py](../../../server/tests/test_final_score.py), already collected by `make test-source-final`. They preserve the distinction between proposed meanings and historical measurements; check input immutability/validation/redacted errors, the known false-accept/reject candidates, numeric guards, duplication, placement, empty/failure/partial handling, provenance and exclusive report creation. Passing these tests means the **diagnostic** works and the recorded historical behavior is reproducible; it does not endorse that behavior. No old test is removed or weakened and no expected-failure marker hides semantic gaps.

Execution: `make setup` completed; the targeted new-control run passed 31 tests (273 deselected). The full existing `make test-source-final` target passed **464 tests in 39.20s** against the isolated local DEV-448 test database. Ruff passed on the probe and modified test file after five line-length fixes. The first probe execution failed because it read a nonexistent counts subobject in the aggregate; corrected it to the existing failedRuns field before recording results. The first targeted pytest attempt was blocked by sandbox cache access; it ran successfully with escalation. The saved report was reproduced byte for byte; scorer/helpers/development gold and manifest were checked unchanged against origin/main.

Before replacing the scorer, Jinwoo must review the control meanings and DEV-446/447 contract/gold decisions. A future version needs source-bound claim/qualifier checks, calibrated positive/negative examples, separate page-wide coverage/placement/processing measures and explicit handling of unresolved judgments. Do not globally replace words, accept every co-occurring number or treat selector hits as semantic truth. Preserve historical results, version the replacement, then rescore **both** saved baseline and candidate outputs on the same approved development cohort. Full revised-baseline and release acceptance remain open; no new paid run is required for this diagnostic.
