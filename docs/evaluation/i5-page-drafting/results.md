# DEV-445 development experiments — 2026-11-24

These results use a fixed extraction snapshot from the existing 24 public development sources (324 facts, 134 critical). They are not end-to-end OCR results, unseen generalization, human editorial acceptance or release readiness. The original gold and scorer are unchanged.

## Experiment 1: single call with a source-sentence plan

Same Gemini 3 Flash Preview model, current safety validators, frozen extraction inputs and dev264-number-evidence-v2 scorer in both arms. Old writer: source-refine-v11-routing. Candidate: source-refine-v12-page-plan. Each source is attempted twice per arm. Both arms include all failures in the denominator.

| Trial | Arm | Facts / 324 | Critical / 134 | Misplaced | Failed | Forbidden | Unsupported |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Baseline | 222 | 94 | 37 | 0 | 0 | 0 |
| 1 | Candidate | 182 | 86 | 31 | 1 | 0 | 1 |
| 2 | Baseline | 219 | 96 | 42 | 0 | 0 | 0 |
| 2 | Candidate | 213 | 96 | 35 | 0 | 1 | 1 |

Mean strict fact recall: baseline 68.1%, candidate 61.0%. A long-PDF candidate request timed out in trial 1 (REQUEST_UNCERTAIN). The failure is retained. Fewer misplaced matches do not establish better organization when fewer facts survive overall.

Decision: this experiment does not justify adopting the candidate. Preserve its outputs and failures. Settled cost $0.326798, with an additional $0.061929 reservation for uncertain usage. The source-sentence inventory and private coverage ledger remain useful diagnostics; they do not prove semantic coverage.

## Experiment 2: bounded writing groups

Declared follow-up after experiment 1: preserve all accepted candidates, partition in source order at at most 10 candidates or approximately 6,000 serialized characters per group (an oversized candidate remains intact). Run each group through a separately reserved/settled call, merge exact duplicate texts and citations, then apply the same validator to the complete result. Keep product/model/gold/scorer fixed. This experiment is development-only and shares the same cumulative $5 ledger ceiling.

| Trial | Arm | Facts / 324 | Critical / 134 | Misplaced | Failed | Forbidden | Unsupported |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | baseline | 229 | 98 | 32 | 0 | 0 | 0 |
| 1 | candidate | 222 | 93 | 29 | 0 | 1 | 1 |
| 2 | baseline | 217 | 94 | 41 | 0 | 0 | 0 |
| 2 | candidate | 219 | 96 | 28 | 0 | 0 | 1 |

Mean fact recall is 68.8% baseline and 68.1% grouped. Mean critical recall is 71.6% and 70.5%. This does not establish an improvement; the grouped arm is not adopted. Settled cost $0.392965; uncertain reservations $0 for this experiment. Per-format results are retained in the private report.

## Experiment 3: source-unit decisions

A separately declared experimental adapter requires one placement/exclusion decision per source unit. Unknown IDs, missing/duplicate decisions, uncited own-unit output and empty decisions are rejected before the unchanged safety validator. Writing groups have at most five complete candidates; the model, source cohort and gold/scorer remain fixed. Two trials completed under the same cumulative $5 ledger cap.

| Trial | Arm | Facts / 324 | Critical / 134 | Misplaced | Failed | Forbidden | Unsupported |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Baseline | 220 | 96 | 40 | 0 | 0 | 0 |
| 1 | Candidate | 225 | 92 | 35 | 0 | 0 | 0 |
| 2 | Baseline | 222 | 97 | 40 | 0 | 0 | 0 |
| 2 | Candidate | 216 | 87 | 32 | 1 | 0 | 0 |

Mean fact recall: 68.2% baseline and 68.1% candidate. Mean critical recall: 72.0% baseline and 66.8% candidate. One candidate request returned INVALID_MODEL_OUTPUT; it remains a failed source. The candidate is not adopted. Settled cost: $0.602810.

Across all three experiments, settled cost is $1.322573 plus $0.061929 still reserved for uncertain usage: $1.384502 accounted against the $5 cap. No further paid calls were made during the source audit. These figures do not count already-settled reservations a second time.

## Gold diagnostics

The offline audit scans 47 development sources, 212 reference sentences, 354 facts and 154 critical facts. It flags four exact duplicate-selector pairs across sections and six reference sentences flagged by current product detectors. These are adjudication leads, not automatically incorrect facts. No gold edits were made.

## Review still required

Original-source gold adjudication, blinded Korean editorial review, producer acceptance and full editor/render/save/apply acceptance remain separate open requirements. A good demonstration does not establish release readiness.

## Source-audited offline replay

See [source-audit.md](source-audit.md). The pre-fix validator reproduced all 95 successful saved records from experiment 3; the failed record was retained. Applying the two narrow fixes symmetrically accepts four previously rejected statements and removes one contained hero title. No new model generation, gold editing or raw-candidate rescue occurred.

| Trial | Arm | Facts / 324 | Critical / 134 | Misplaced | Failed | Forbidden | Unsupported |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Baseline + fixes | 221 | 97 | 40 | 0 | 0 | 1 |
| 1 | Experimental writer + fixes | 225 | 92 | 36 | 0 | 0 | 1 |
| 2 | Baseline + fixes | 225 | 98 | 40 | 0 | 0 | 1 |
| 2 | Experimental writer + fixes | 216 | 87 | 33 | 1 | 0 | 1 |

The frozen scorer flags the recovered Brix unit as unsupported in each record: its normalization maps the contiguous Korean unit to brix, but not the source's broken unit. This is a source-verified measurement mismatch, not a reason to silently change the historical scorer. Baseline mean fact recall rises from 68.2% to 68.8% and critical recall from 72.0% to 72.8% in this replay; this modest recovery is not a release pass. The experimental writer remains worse on critical recall, and a fact restored to another section increases misplacement rather than strict recall. Human editorial quality has not been measured.
