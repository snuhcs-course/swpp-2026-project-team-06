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

## Follow-up arms declared after the first result

Experiment 2 groups complete candidates in source order (10 candidates / about 6,000 serialized characters, with oversized candidates intact). Every group is reserved and settled independently. Exact duplicate outputs merge citations before the unchanged safety validator. Two trials per arm use the same complete 24-source snapshot.

Experiment 3 uses source-unit dispositions instead of free module generation. A group has at most five candidates. Every source unit must occur exactly once as a decision with outputs or an explicit exclusion; unknown IDs, missing decisions and empty reasons are rejected. Outputs cite source-unit IDs which are mapped back to original candidate references before the unchanged validator. Two trials compare the old writer against this experimental writer on the same complete 24-source snapshot and same model. Unit accounting does not prove semantic preservation. All experiments share the same isolated database and cumulative $5 cap; uncertainty retains reservations. No previous failure is erased and no gold is changed.

## Source-audit follow-up

After all three experimental writers failed to reliably improve critical recall, Zahra selected original-source auditing before further paid calls. Audit the union of critical misses from the four experiment-3 outputs, keeping the original gold unchanged. Reconstruct accepted citations from saved ledgers and rejected generated texts from diagnostics. Require exact pre-fix module reproduction before replaying validation changes; retain failed records, apply fixes to both arms, and report the unchanged scorer's disagreements separately. The replay is an offline validation experiment, not a new model sample. Results and evidence fingerprints are in source-audit.md and results.md.
