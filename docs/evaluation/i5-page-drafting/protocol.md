# DEV-445: page drafting prototype protocol

## Scope and authorization

Zahra requested an urgent implementation and demonstration for the Nov 25 TA meeting. The live comparison has a total $5 ceiling. This authorizes an isolated prototype, not release acceptance or production deployment.

## Frozen evidence

Use existing development extraction snapshots only (24 public development sources and 23 synthetic cases). Never inspect sealed holdout v2. Preserve original gold and the dev264-number-evidence-v2 scorer. Record snapshot, code/prompt/model versions and every attempted trial. Retain failures and partial output in the denominator.

## Prototype

Provide a deterministic, source-linked sentence inventory and section-purpose plan to the existing single refinement call. Explicitly distinguish a short introduction from detailed content; preserve exact values, conditions and uncertainty. Keep existing safety validation, call reservation/settlement, manual edits and explicit apply behavior. Source inventory coverage is a diagnostic, not semantic proof.

## Comparison

Compare the old and candidate builder on the same saved accepted extraction candidates. Start with all 24 public development sources, repeated trials if the budget allows. Keep the model and scorer fixed. Record per-format facts, critical facts, misplaced facts, forbidden/unsupported counts, failures, duration and actual cost. Do not select only improved examples.

Audit duplicate text and candidate coverage separately. Gold audit flags are review leads; do not automatically remove facts or relax safety rules. Reference rewrites may preserve the underlying valid facts. Publish no raw sources or private gold.

## Limits and gates

Historical targets remain at least 95% fact recall per format and zero unsupported critical/forbidden output. Changes in strict scores are development evidence, not generalization. Editorial acceptance needs Korean-speaking human review and producer feedback; no automatic duplicate metric or LLM score substitutes for it. The proposed editorial 4/5 gate is not approved by this prototype. DEV-412/413 remain the release decision and evaluation.
