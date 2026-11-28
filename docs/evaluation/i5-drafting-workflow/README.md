# DEV-452: local drafting workflow verification

The current baseline passed the tested generate → edit → private save/reopen → preview → explicit apply workflows. No product-code defect was found in these scenarios. Two browser coverage gaps were strengthened: manual edits through a **partial-failure retry**, and an explicitly mobile consumer context with applied text scrolled into the viewport. This is mechanical workflow evidence, not AI writing-quality or producer acceptance.

Full counts, exact code identities, environment and artifact fingerprints: [results.json](results.json). Product code remains identical to baseline ef390bde. Initial harness commit a3ee00db contains planning documents; final browser test commit 32d313d7 contains only documentation and test changes. The initial baseline and affected-case runs do not integrate DEV-445/453. A separate local composition below checks their default fixes together; it does not select an experimental writer or establish acceptance.

## Executed checks

| Check | Actual result |
| --- | --- |
| Backend editor/integration/recovery/product workspace/product draft | 158 passed, 0 failed (27.92s) |
| Real-server API integration scenarios | 7 passed |
| Workspace type checks | 5 workspaces passed |
| Mock suite, unrestricted | 485 passed, 0 failed, 0 skipped (58.86s) |
| Baseline Chromium: six selected specs | 59 passed, 0 failed/skipped/flaky, retries=0 (198.63s) |
| Strengthened affected Chromium specs | 7 passed, 0 failed/skipped/flaky, retries=0 (68.80s) |

The last seven cases overlap the original 59; do not sum them as independent coverage. The first mock attempt had 480 passes and five failures because the sandbox blocked localhost sockets (EPERM). The unrestricted rerun passed without code changes. The first backend command used a nonexistent plural filename, collected no tests, and was corrected to the existing singular test_product_draft.py before the 158-case run. Original logs/reports are retained privately rather than replaced.

All application/API requests use localhost, mock AI and local storage. The real-stack database is isolated as farmclub_dev452; pytest uses farmclub_dev452_test. The API/server/app processes stopped after the runner completed. No production account/order or live-model call was made, and the existing $5 model budget is unchanged.

## What the evidence covers

- **Generate and recover:** mock extraction into the composer, progress/partial failure, manual recovery and retry, original-input preservation when the first source save fails, missing-input guidance and failed/uncertain request handling.
- **Keep producer work:** saved drafts reopen with their content; edits and hidden/excluded modules survive normal reanalysis. The strengthened 360px partial-failure case also edits summary/storage, saves/reloads, retries extraction, then checks the same manual values in preview and applied modules.
- **Private versus applied:** edits stay private until explicit apply; cancellation preserves the public page. Saved preview modules match applied public modules and consumer-rendered text. New products remain unpublished after page application until their publication contract is satisfied.
- **Failure/version boundaries:** atomic save failure preserves input/idempotency keys; apply conflicts and server-refresh guidance remain useful; stale review/source/product versions and cross-tenant requests are rejected by the API checks.
- **Rendering/media/privacy:** producer widths 360/390/430, photo placement and hidden-section handling, independent public media and denied private source access. Four format-flow buyer contexts now use 390×850, scroll the applied summary into view and assert no document-width overflow. A local screenshot was visually inspected for on-screen manual content; this is not a human editorial score.

The text format uses a known **mock extraction fixture**. Image/long-image/PDF scenarios intentionally test **manual recovery**, not live OCR/model accuracy. Normal reanalysis/manual edits were already covered by the format flow; the new test specifically closes the partial-retry gap. Initial consumer screenshots used Playwright's default desktop context, even though the producer used 390px; the new checks correct that coverage boundary. Long real-source copy, arbitrary photo ordering across every reanalysis, actual producer feedback and a selected combined candidate still need their own acceptance evidence.

## Reproduction

After make setup, use an isolated local PostgreSQL database, never production. The existing runner migrates/resets its database and starts both Expo apps plus FastAPI with the source mock provider. Its default ports must be free. The baseline command selects:

```sh
DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_dev452 \
APP_ENV=local SOURCE_STORAGE=local FARMCLUB_INTEGRATION_SKIP_DOCKER=1 \
node scripts/run-integration.mjs \
  scripts/e2e/source-analysis.spec.ts scripts/e2e/source-editor.spec.ts \
  scripts/e2e/page-editor-unified.spec.ts scripts/e2e/he-source-recovery.spec.ts \
  scripts/e2e/source-review-regressions.spec.ts scripts/e2e/producer-format-flow.spec.ts \
  --retries=0
```

The affected-case rerun selects only source-analysis.spec.ts and producer-format-flow.spec.ts and sets FARMCLUB_INTEGRATION_API=0 because the seven API scenarios already passed. Existing Playwright discovery/test-integration entry points collect both files; no new Makefile target is needed. Full local logs, JSON/HTML reports, build/run metadata and screenshots remain outside public commits, with separate baseline/final evidence copies so the runner's artifact cleanup does not erase the first run. Public results contain only metadata and fingerprints.

## Composed default-fix compatibility

A separate private local branch at **6b682c0af909ed4d50220f54964cd3903d47a82e** combines the default-path fixes from PR794/798 with PR799's strengthened browser checks. Own commits were cherry-picked cleanly onto ef390bde; the shared version-assertion file merged without conflict. The composed branch was not pushed. Experimental writers remain opt-in and unselected.

After make setup, `DATABASE_URL=.../farmclub_dev452_composed uv run pytest -q` in server completed with **2,208 passed, 1 skipped, 0 failed (329.71s)**. The same six-spec integration command above, with the composed database, completed seven API scenarios and **59 browser cases, 0 skipped/unexpected/flaky, retries=0 (212.37s)**. These repeat the baseline cohort and must not be added as independent cases. The local apps/API stopped after completion. This checks compatibility of narrow default fixes and editor workflows with mock AI; it is not repeated live-generation/all-format quality evaluation.

## Prepared meeting and review artifacts

A private portable TA demo contains three invented before/after mechanical examples, executable-helper results, the tested mobile mock screenshot and a five-minute walkthrough. It was rendered and visually inspected; archive CRC and links were checked. The separate DEV-447 portable review packet includes all source-linked gold, proposed standards and scorer controls without changing human judgments. Raw sources, gold, screenshots and local paths remain outside public commits. Archive/build/evidence fingerprints are recorded in results.json (DEV-447 records its own bundle).

Schedule rows433–441 now list DEV-445 through453 with current In Progress/Started state, issue links and Zahra as coordinator. Nine rows and36 relative formulas were read back; validation and exemplar formatting were preserved. The confirmed Human5h appears only on the parent row. Estimates, deadlines, end dates and child actuals remain blank. Browser access was unavailable, so the sheet was verified through value/formula/format/validation metadata; native visual fit was not verified.

## Still pending

Human code review, Jinwoo's gold/editorial judgments, producer participation/feedback, selected-writer/candidate acceptance, content-quality evaluation and DEV-412/413 release decisions remain open. Longer real-source content and arbitrary photo ordering still need explicit acceptance coverage. These local results do not retain drafting in release scope, approve a writer or authorize production deployment. No merge or deployment occurred.
