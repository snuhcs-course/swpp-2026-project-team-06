## DEV-165 Prepare reproducible test environment, accounts, fixtures, and build baseline

- Issue: [DEV-165](https://linear.app/sswp6/issue/DEV-165)
- Branch: `zahra/dev-165-i3-test-environment`
- Source task: I3-T03 (P0). Protocol: `docs/evaluation/i3-journeys/protocol.md` §Environment, `docs/evaluation/i3-ai-support/protocol.md`.
- Status: In progress

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

### Work
- [ ] Bring up `farmclub_i3`, migrate, seed, run API and apps.
- [ ] Fixture register: map protocol needs to seeded IDs.
- [ ] Inventory unavailable prerequisites (fault hooks, eval fixtures, devices) as BLOCKED/NOT READY.
- [ ] Smoke script and `make i3-smoke`.
- [ ] Run existing lint/test suites on the baseline.
- [ ] README + manifest with baseline ID.

### Completion criteria
- [ ] Reset + smoke reproduces the same non-AI results twice.
- [ ] Every protocol environment field is recorded or marked BLOCKED with owner and next action.
- [ ] No secrets or real personal data in the diff.
