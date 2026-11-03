## DEV-154 Prepare frozen AI customer-support question set and scoring rubric

- Issue: [DEV-154](https://linear.app/sswp6/issue/DEV-154)
- Branch: `llovablanche/dev-154-ai-support-evaluation`
- Feature and criteria: FEAT-13; AC-13-1/2/3/6/7/8; M-05/06/07/08/15/18
- Status: In review; no model trials have been run

### Goal
Define a privacy-safe, reproducible oracle before evaluating probabilistic AI support responses. Distinguish correct routine answers from missing evidence, mandatory handoff, ambiguity, conflicts, and operational failures.

### Scope (allowed paths)
- `docs/evaluation/i3-ai-support/spec.md`
- `docs/evaluation/i3-ai-support/tasks.md`
- `docs/evaluation/i3-ai-support/protocol.md`
- `docs/evaluation/i3-ai-support/questions.jsonl`
- `docs/evaluation/i3-ai-support/run-manifest.json`
- `docs/evaluation/i3-ai-support/run-log.csv`
- `docs/evaluation/i3-ai-support/validate.py`

### Out of scope
- Product code, model prompts, production data, live model evaluation, and DEV-152's broader journey matrix.

### Decisions
- 10/31: Use 10 distinct synthetic questions per required stratum (60 total) and freeze exact evidence with each row.
- 10/31: Use the current FEAT-13/M-05 contract as gold; conflicting evidence requires handoff even if current code chooses a field.
- 10/31: `HUMAN_ONLY` is a separate gold action for AI OFF, HUMAN mode, and stale in-flight answer cases.
- 10/31: Record code blob versions and candidate default model at freeze; actual deployed model/prompt/build are recorded at execution, not guessed.

### Work
- [x] Review DEV-154, FEAT-13, rules, contracts, and current answer implementation.
- [x] Create 60 privacy-safe questions with gold labels/facts/source refs and complete synthetic evidence.
- [x] Define a dimensioned rubric, three-run repeat policy, and per-stratum reporting.
- [x] Freeze hashes, candidate model/prompt version, and 180-row run schedule before any model run.
- [x] Run static validation of IDs, counts, labels, hashes, refs, and privacy patterns.
- [ ] Link to DEV-152's finalized AI support matrix row and resolve any threshold conflict before execution.
- [ ] Obtain human review and merge to main.

### Completion criteria
- [x] At least 60 distinct, stratified questions with expected answer/evidence or mandatory handoff/human-only label.
- [x] Frozen privacy-safe question set, gold labels, rubric, and run manifest.
- [x] Three-run repeat policy and model/prompt version recording defined.
- [x] Documentation-only integrity check passes.
- [ ] Reviewer approval and main merge under repository rules.

### Record
- 10/31: Frozen protocol prepared without model calls or live customer data. DEV-152 remained Backlog at freeze; execution requires alignment and a verified isolated environment.

## DEV-169 Evaluate AI customer-support handoff, routing, mode changes, and failure safety

- Issue: [DEV-169](https://linear.app/sswp6/issue/DEV-169) (I3-T09) · Branch: `zahra/dev-169-ai-support-eval`
- Matrix rows: I3-AIS-04/05/06, I3-AIGUARD-01..05. Environment: DEV-165 baseline `i3-b1-eb727b6`.
- Status: In review (results recorded; human review of auto-scores and defect issues pending)

### Scope (editable paths)
- `scripts/i3-ai-support/**`
- `docs/evaluation/i3-ai-support/{run-log.csv,run-manifest.json,tasks.md,results.md}` (not `questions.jsonl`/`protocol.md`)
- `docs/evaluation/i3-journeys/results/i3-b1-eb727b6/**`

### Decisions
- 11/03 Run all 60 × 3 = 180 trials in one cohort (Zahra); T09 reports missing_evidence, sensitive/refund and operational_failure; the other three strata go to DEV-167 (Hyun) as data.
- 11/03 No product code change before the 11/4 HE (a `server/**` merge deploys to production): faults come from a local proxy via `ANTHROPIC_BASE_URL`; fixtures are written to the local DB only.
- 11/03 Synthetic eval consumers/producer are flagged as test accounts in the local DB so onboarding/consent gates do not block the chat path; this does not change what the AI sees.
- 11/03 `change_during_generation` is injected by pausing the model call at the proxy; if a case is answered by rules (no model call) it is BLOCKED, not run differently.

### Work
- [x] Fixture loader + fidelity check (60/60)
- [x] Fault proxy (hang, malformed, drop, pause)
- [x] Runner and AIGUARD script
- [x] Full 180-trial run, AIGUARD run
- [x] run-log.csv, run-manifest.json, results.md, matrix result files
- [ ] Defect issues for T22, DEV-167 hand-off

### Record
- 11/03 Fixture fidelity 60/60. Full run 12:55–13:02 UTC: 141/180 PASS (T09 strata: missing 30/30, sensitive 30/30, operational 21/30). AIGUARD-01/02/04 PASS, 03/05 FAIL. Details and defects: `results.md`.
- 11/03 First scoring did not apply the 8 s bound to provider faults in `run.py` (only in `guards.py`); re-scored the saved traces (`run.py --rescore`, same observations): CS-051 PASS→FAIL ×3. `actual_model_id` now only names a model when the trial called one.
- 11/03 An ad-hoc re-check of CS-053 (same build, injected `network_error`, no model call) wrote over the planned run's three CS-053 traces. Verdicts unchanged (PASS ×3); `run-log.csv` now references the replacement traces (later start times). `run.py` now writes ad-hoc traces as `*-adhoc.json`.
- 11/03 Agent second review of raw traces: agrees with all 180 verdicts; notable: CS-045/046 adopt the contradicting FAQ as a promise, routine stratum is 100% rule path. Human sign-off pending.
- 11/03 Model cost ≈ $0.09 (local `/admin/ai-usage`, includes setup trials).
