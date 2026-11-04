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
- Status: Done (results recorded and signed off; defects filed under DEV-180)

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
- [x] Defect issues for T22 (3 sub-issues of DEV-180), DEV-167 hand-off

### Record
- 11/03 Fixture fidelity 60/60. Full run 12:55–13:02 UTC: 141/180 PASS (T09 strata: missing 30/30, sensitive 30/30, operational 21/30). AIGUARD-01/02/04 PASS, 03/05 FAIL. Details and defects: `results.md`.
- 11/03 First scoring did not apply the 8 s bound to provider faults in `run.py` (only in `guards.py`); re-scored the saved traces (`run.py --rescore`, same observations): CS-051 PASS→FAIL ×3. `actual_model_id` now only names a model when the trial called one.
- 11/03 An ad-hoc re-check of CS-053 (same build, injected `network_error`, no model call) wrote over the planned run's three CS-053 traces. Verdicts unchanged (PASS ×3); `run-log.csv` now references the replacement traces (later start times). `run.py` now writes ad-hoc traces as `*-adhoc.json`.
- 11/03 Agent second review of raw traces: agrees with all 180 verdicts; notable: CS-045/046 adopt the contradicting FAQ as a promise, routine stratum is 100% rule path. Zahra signed off the reviewed verdicts on 11/03.
- 11/03 Reviewer column in `run-log.csv` edited after the run to record the agent review and Zahra's sign-off (verdict columns unchanged); `run.py --rescore` now keeps an existing reviewer value. Manifest `execution.scoring` updated to match (spec-check SC-001).
- 11/03 Model cost ≈ $0.09 (local `/admin/ai-usage`, includes setup trials).

## DEV-167 Evaluate consumer-facing AI answer accuracy, evidence, and correction path

- Issue: [DEV-167](https://linear.app/sswp6/issue/DEV-167) (I3-T08) · Branch: `nemodleo/dev-167-i3-ai-answer-review`
- Matrix rows: I3-AIS-01/02/03. Baseline `i3-b2-87792b7` (app commit `87792b7`). DEV-169 cohort `3f7ce29` kept separate.
- Status: In review (results recorded; Hyun's human sign-off pending; defects tracked as DEV-203 under DEV-180)

### Scope (editable paths)
- `docs/evaluation/i3-ai-support/{results.md,tasks.md,run-log-i3-b2-87792b7.csv}` (not `questions.jsonl`, `protocol.md`, `run-manifest.json`, or DEV-169's rows in `run-log.csv`)
- `docs/evaluation/i3-journeys/results/i3-b2-87792b7/**`, `docs/evaluation/i3-journeys/tasks.md` (not `matrix.csv`/`protocol.md`)
- No product code: `server/app/ai/**` is a high-risk path; fixes go to DEV-180/DEV-203.

### Decisions
- 11/04 Re-run the 90 DEV-167 trials on this build instead of reviewing DEV-169's scores only, because DEV-169's raw traces are on Zahra's machine. Report as a separate cohort (`87792b7` ≠ `3f7ce29`), never pooled.
- 11/04 Use DEV-169's harness unchanged: `run.run_trial` and `run.score` are called from a local wrapper that only overrides the API/proxy ports, the baseline name and the case filter, and does not call `run.write_log` (which rewrites `run-log.csv`).
- 11/04 Verdicts go to a separate `run-log-i3-b2-87792b7.csv` with the same columns, not appended to `run-log.csv`: `validate.py` asserts exactly 180 rows (one cohort), and DEV-169's rows must stay unchanged.
- 11/04 Conflicting-facts class A (higher-tier field answered despite the conflict) stays FAIL under the frozen gold; the matrix wording "higher-priority fact governs" is raised as a question to the DEV-154 owner and PM, not used to re-label.
- 11/04 Correction path (AC-13-5) checked after scoring on run 1 of each case, so it cannot affect the scored traces.

### Work
- [x] Isolated stack: `farmclub_i3_ais` (+`_test`), migrate + seed, API `:8200`, proxy `:8287`, local `.env` without Kakao/OpenAI/OpenRouter/R2 keys
- [x] Fixture fidelity check (60/60) and 90-trial run
- [x] Trace review of every trial; correction-path check (30 cases)
- [x] Matrix records I3-AIS-01..03, results.md DEV-167 section, cohort run log
- [x] Defect write-up (D1/D2 → DEV-203, O1 new)
- [ ] Hyun's human sign-off of the reviewed verdicts

### Commands
```bash
docker exec server-db-1 psql -U farmclub -d postgres -c "CREATE DATABASE farmclub_i3_ais"   # and farmclub_i3_ais_test
make setup && make migrate && make seed            # DATABASE_URL=…/farmclub_i3_ais in server/.env
cd server && uv run python ../scripts/i3-ai-support/fixtures.py --check     # fidelity: 60/60
python3 <scratch>/proxy8287.py scripts/i3-ai-support &                      # fault_proxy.Handler on 127.0.0.1:8287
cd server && ANTHROPIC_BASE_URL=http://127.0.0.1:8287 APP_ENV=local MOCK_LOGIN_ENABLED=true uv run uvicorn app.main:app --port 8200 &
cd server && uv run python <scratch>/run_dev167.py <worktree>               # 90 trials, traces in .artifacts/
```
The wrapper (`run_dev167.py`, not committed) sets `run.API="http://localhost:8200"`, `run.PROXY="http://127.0.0.1:8287"`, `run.BASELINE="i3-b2-87792b7"`, keeps the cases whose stratum is routine_answerable, ambiguous or conflicting_facts, shuffles `(case, run)` with `random.Random(1542026)`, and writes each `run.run_trial(case, run)` result to `.artifacts/i3-ai-support/i3-b2-87792b7/<case>-r<run>.json`.

### Record
- 11/04 Worktree from `87792b7`; DEV-167 set to In Progress. `make setup`, migrate to 0025, seed; fixture fidelity 60/60.
- 11/04 Run 04:28:11–04:30:00 UTC, 90/90 attempted, 0 blocked: routine 30/30 PASS (rules, 13/16 ms p50/p95), ambiguous 30/30 PASS (model, 1,346/1,702 ms), conflicting_facts 0/30 (rules, answered instead of handoff). Identical case-by-case to the DEV-169 cohort.
- 11/04 Trace review: agrees with all 90 automatic verdicts. Conflicting failures split into A 15 (supported higher-tier value, action failure), B 3 (CS-044 wrong question), C 12 (contested farm statement adopted; CS-045/046 = 6 safety failures). New observation O1: the model's handoff reason is shown to consumers as "근거:".
- 11/04 Settings version: 90/90 replies carry their trial's saved version (62…151, +1 per trial; DB 151 after the last trial). Refs: 0 invalid. Privacy/impersonation: 0.
- 11/04 Correction path: 20/20 answers reported → one OPEN reported question, `needsReply=true`, `reported=true`, idempotent; 10/10 forwarded notices refused (400).
- 11/04 Model cost: 30 `ai_answer` calls, 10,398 input + 2,494 output tokens, $0.0229 (local `ai_usage`).
- 11/04 `python3 docs/evaluation/i3-ai-support/validate.py` PASS (run-log.csv unchanged, 180 rows); `python3 docs/evaluation/i3-journeys/validate.py` PASS (matrix unchanged). No tests to run: documentation only.
