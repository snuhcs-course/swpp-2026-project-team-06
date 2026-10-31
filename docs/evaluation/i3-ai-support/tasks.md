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
