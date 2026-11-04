## DEV-165 Prepare reproducible test environment, accounts, fixtures, and build baseline

- Issue: [DEV-165](https://linear.app/sswp6/issue/DEV-165)
- Branch: `zahra/dev-165-i3-test-environment`
- Source task: I3-T03 (P0). Protocol: `docs/evaluation/i3-journeys/protocol.md` §Environment, `docs/evaluation/i3-ai-support/protocol.md`.
- Status: In review

### Goal
Record one isolated, reproducible environment (build, accounts, fixtures, clock, AI/source versions, reset steps) with smoke evidence, so the I3 execution issues can start.

### Scope (editable paths)
- `docs/evaluation/i3-env/**`
- `scripts/i3-env-smoke.mjs`
- `Makefile` (one `i3-smoke` target)

### Out of scope
- Product code, seed data, frozen I3 matrices/corpora, production data, real payments.

### Decisions
- 11/03 Local isolated stack with database `farmclub_i3`; production URLs read-only.
- 11/03 Live AI uses the existing Anthropic key from Railway (kept in local `server/.env`, never committed).
- 11/03 Baseline ID names the product commit (`main` merge-base), not this docs branch: `i3-b1-eb727b6`. Later builds use `I3_BASELINE=i3-b2-<sha>`.
- 11/03 Producer B is `u-misook` (pending farm `f-wimi`): the owners of other approved farms have no test login, and changing the seed is outside T03 scope (gap G-4).
- 11/03 `mark-tester` only sets the analytics `opsTester` flag; it does not enable test login, so it is not used.

### Work
- [x] Bring up `farmclub_i3`, migrate, seed, run API and apps.
- [x] Fixture register: map protocol needs to seeded IDs.
- [x] Inventory unavailable prerequisites (fault hooks, eval fixtures, devices) as BLOCKED/NOT READY.
- [x] Smoke script and `make i3-smoke`.
- [x] Run existing lint/test suites on the baseline.
- [x] README + manifest with baseline ID.

### Completion criteria
- [x] Reset + smoke reproduces the same non-AI results twice.
- [x] Every protocol environment field is recorded or marked BLOCKED with owner and next action.
- [x] No secrets or real personal data in the diff.

### Record
- 11/03 Brought up `farmclub_i3` (alembic 0024), smoke 12/12 PASS in three reset → smoke runs with identical non-AI observations; one live Haiku call per run (~$0.0008).
- 11/03 pytest with the live key: 3 AI-draft tests take the live path and fail by design. Without the key, from `server/` (CI condition): 1452 passed, 1 skipped. A keyless run from the repo root failed 34 (31 source tests use paths relative to `server/`); not a product defect. `make` was blocked by the unaccepted Xcode license; after Zahra accepted it, `make i3-smoke` passed 12/12.
- 11/03 Stale local `apps/consumer/.expo/types` (10/20) broke `npm run typecheck`; moved aside, after which all four typechecks pass like CI.
