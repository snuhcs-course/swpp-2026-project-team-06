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
- [ ] Update PR context and complete AI first review.

### Completion criteria
- [x] Every DEV-152 acceptance criterion is represented in versioned artifacts.
- [x] Validator passes and actual command/result is recorded.
- [ ] One human approves before merge to main.

### Record
- 10/31 Started from `origin/main` at `8f8d4d5`; DEV-151 dependency is Done; baseline environment and build are pending DEV-165.
- 10/31 Added five direct AI guard cases because DEV-154's corpus does not exercise wrong-answer report and cross-consumer routing. The final frozen matrix has 41 cases (31 P0, 10 P1). `python3 docs/evaluation/i3-journeys/validate.py` passed with the DEV-154 link to 60 questions / 180 planned trials and no measured results. Product execution remains pending DEV-165 and downstream issues.
