# E2E workflow verification decisions

Product behavior is defined in docs/spec/, not by browser tests. Existing Playwright fixtures/configuration and scripts/run-integration.mjs remain the execution entry points.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-11-24 | DEV-452 strengthens the existing mobile source-analysis retry case to preserve producer-edited content through reanalysis, reopen, preview and apply. | Generated text staying unchanged did not demonstrate preservation of manual edits. |
| 2026-11-24 | Keep existing generation assertions, viewport cases and mock-worker failures. Use isolated localhost API/apps/database and explicit mock models. | More meaningful coverage without weakening assertions or mutating production. |
| 2026-11-24 | Existing Playwright discovery/test-integration target collects this spec; no new suite/Makefile target is required. | The same three source-analysis viewport cases remain. |
