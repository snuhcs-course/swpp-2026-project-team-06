## DEV-152 Freeze I3 user-journey test matrix and measurable criteria

- Issue: [DEV-152](https://linear.app/sswp6/issue/DEV-152)
- Branch: `llovablanche/dev-152-i3-journey-matrix`
- Requirements: FEAT-06/07/08/09/10/12/13/14/17/32; AC-06-1–5, AC-07-1–3, AC-08-1–7, AC-09-3/7/8, AC-10-5–7, AC-12-1/4/8/9, AC-13-1–8, AC-14-1/2, AC-17-2/4/5; N-03/04/05/06; 1.2 AI contract §5; 1.4 capacity contract; source integration AC-SRC-1–11.
- Status: In review

### Goal
Freeze a comparable oracle before I3 evaluation starts, with explicit denominators and no invented pass results.

### Scope (editable paths)
- `docs/evaluation/i3-journeys/**`

### Out of scope
- Product behavior, existing product specifications, DEV-154 corpus, live execution, shared production data, and financial transactions.

### Decisions
- 10/31 Use a case matrix plus a protocol and manifest; a test case starts NOT_READY until evidence is captured.
- 10/31 Link AI support to DEV-154's 60-case/180-run frozen corpus and retain its proposed targets separately from future measurements.
- 10/31 DEV-151 is marked Done in Linear, but its carryover register is not attached to the issue or present in main. Use current FEAT/contracts and I3 issue acceptance criteria as the oracle; flag the missing register for reviewer reconciliation.

### Work
- [x] Map P0 and P1 journeys to source requirements and accountable owners.
- [x] Define normal, boundary, error, retry, and state-change cases with setup, action, expected result, denominator, verdict, evidence, and reviewer.
- [x] Freeze protocol and digest; validate all rows and cross-links.
- [x] Update PR context and complete AI first review.

### Completion criteria
- [x] Every DEV-152 acceptance criterion is represented in versioned artifacts.
- [x] Validator passes and actual command/result is recorded.
- [ ] One human approves before merge to main.

### Record
- 10/31 Started from `origin/main` at `8f8d4d5`; DEV-151 dependency is Done; baseline environment and build are pending DEV-165.
- 10/31 Added five direct AI guard cases because DEV-154's corpus does not exercise wrong-answer report and cross-consumer routing. Added separate full source workflow cases for image, long image, and PDF after review found that analysis-only coverage was insufficient. The final frozen matrix has 44 cases (34 P0, 10 P1). `python3 docs/evaluation/i3-journeys/validate.py` passed with the DEV-154 link to 60 questions / 180 planned trials and no measured results. Product execution remains pending DEV-165 and downstream issues.
- 10/31 Draft PR #336 opened and updated; AI first review recorded at PR comment `6544860385` with no remaining findings. Human approval and merge remain pending.

## DEV-167 Record I3-AIS-01..03 results on baseline i3-b2-87792b7

- Issue: [DEV-167](https://linear.app/sswp6/issue/DEV-167) (I3-T08) · Branch: `nemodleo/dev-167-i3-ai-answer-review`
- Work record and commands: `docs/evaluation/i3-ai-support/tasks.md` (## DEV-167).

### Scope (editable paths)
- `docs/evaluation/i3-journeys/results/i3-b2-87792b7/I3-AIS-0{1,2,3}.md` and this section. `matrix.csv` and `protocol.md` stay frozen (`execution_status` is not edited).

### Record
- 11/04 I3-AIS-01 PASS 30/30/30 (10/10 stable), I3-AIS-02 PASS 30/30/30 (10/10), I3-AIS-03 FAIL 0/30/30 (0/10). Cohort app `87792b7`, Haiku `claude-haiku-4-5-20251001`, local `farmclub_i3_ais`, run 2026-11-04 04:28–04:30 UTC. Agent review agrees with the automatic verdicts; Hyun's sign-off pending.
- 11/04 `python3 docs/evaluation/i3-journeys/validate.py` PASS.
