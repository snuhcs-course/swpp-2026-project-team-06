# I3-T12 producer flow evidence — DEV-171

Execution issue: [DEV-171](https://linear.app/sswp6/issue/DEV-171). Requirements: FEAT-03/04/07, AC-SRC-1/2/5/6/7/9/11, M-11/13. Follow [the I3 journey protocol](i3-journeys/protocol.md) for environment, verdicts, redaction and reviewer records. This document inventories coverage and provides a run sheet; test discovery is not execution evidence.

Build ID (git-based): **`6c259ac41b39f2d3112ef31e58b441fdff77e110 + uncommitted DEV-171 changes`** (`dirty: true` in all four build JSON files). API SHA / Producer SHA / Consumer SHA: **`6c259ac41b39f2d3112ef31e58b441fdff77e110` + the same uncommitted worktree changes**, per the human's same-worktree stack report; the JSON records one checkout `gitSha`, not independent service/deployment hashes. This browser run precedes the nosniff fix below. Inventory base includes DEV-184/186/187. Executor: **Claude (agent) / human owner** (human ran outside sandbox); independent reviewer: not recorded.

UTC evidence interval: **2026-11-01T12:53:22.268Z – 2026-11-01T12:54:18.024Z**. Starts below come from `t12-<format>-build.json.startedAt`. Neither build nor run JSON has an end timestamp; ends are reconstructed from each preserved `test-results/.../trace.zip` → `test.trace` (`context-options.wallTime + last endTime − monotonicTime`), not inferred from the 56.8s reporter duration.

| Format | Build JSON / run JSON (under `.artifacts/dev171/`) | UTC start (build JSON) | UTC end (trace) |
| --- | --- | --- | --- |
| text | `t12-text-build.json` / `t12-text-run.json` | 2026-11-01T12:53:22.268Z | 2026-11-01T12:53:41.891Z |
| image | `t12-image-build.json` / `t12-image-run.json` | 2026-11-01T12:53:42.478Z | 2026-11-01T12:53:53.876Z |
| long-image | `t12-long-image-build.json` / `t12-long-image-run.json` | 2026-11-01T12:53:54.478Z | 2026-11-01T12:54:06.036Z |
| pdf | `t12-pdf-build.json` / `t12-pdf-run.json` | 2026-11-01T12:54:06.623Z | 2026-11-01T12:54:18.024Z |

Stack: isolated **`farmclub_dev171`**, real local API/producer/consumer at ports 8000/8082/8081, mock login/provider, fixed clock **`2026-10-07T10:00:00+09:00`**. Desktop Chromium **156.0.8078.4**, viewport **390 × 850** (not mobile-device emulation). Migration revision/reset command: not recorded in supplied metadata; no production/deployment claim. Checkout parser/stage-1/stage-2 versions: `source-parser-v3` / `source-v6-candidate-validation` / `source-refine-v4`; mock, no live model call in DEV-171.

## Existing coverage inventory

All 25 existing `scripts/e2e/*.spec.ts` files were inventoried. The following test keys identify exact `spec:test` pairs; `{width}` expands to 360, 390 and 430. An implemented assertion is coverage, not a current-build PASS. Route-stubbed display checks are explicitly separate from real-stack workflow checks.

| Key | Existing spec:test | Actual coverage / limitation |
| --- | --- | --- |
| C | `new-product-composer.spec.ts: DEV-184 AC-03-1/AC-SRC-11 {width}px: new product opens one editor and AI sheet fills it` | Real text + separate product photo; upload, private save, unsaved edit survives reanalysis, explicit next step, private product public API 404. At 390px, removed-text modal/chip and buyer preview. No source-file privacy request or consumer route equality. |
| T | `new-product-two-step.spec.ts: DEV-184 AC-03-1/AC-04-1/AC-05-1 {width}px: two screens from new product to sale request` | Real text + photo; two-screen flow, repeated apply/photo preservation, sale preview, public 404 before approval, optional local admin approval/public API. Does not open the consumer route. |
| A | `source-analysis.spec.ts: AC-SRC-1/2/7/8 {width}px: upload, review, resume and apply` | Real text + product photo. Private draft, edit, hide/restore across saves/reloads, explicit apply, entire preview text equals consumer `source-detail`. At 360px partial-extraction fault/retry. Does not open the per-field “원문 보기” control or request private downloads anonymously. |
| E | `source-editor.spec.ts: AC-SRC-11: failed atomic save preserves input and retries the same payload` | Real text/photo setup via API, real editor; save 503, input retention, same idempotency key, reopen. One review conflict is route-injected. |
| EP | `source-editor.spec.ts: AC-SRC-11: photos without descriptions remain available for manual placement` | Separate original product photo, manual placement. A product photo is not an analyzed image source. |
| ED | `source-editor.spec.ts: AC-SRC-11: inline photo description survives failure and flushes before analysis` | Description save failure/retry and description persisted before run. |
| EB | `source-editor.spec.ts: AC-SRC-11: basic information saves, validates, survives failures and fills the editor` | Required/invalid/manual basic info, 503, reopen, worker, editor fill. |
| ET | `source-editor.spec.ts: AC-SRC-11: text edits stay inside cards and representative selection survives reload and deletion` | Text upload failure/retry, photo selection/reopen/delete, no analysis of uploaded image source. |
| W | `source-workspace-ui.spec.ts: AC-SRC-1/4 {width}px: compact files and live analysis status` | **Stubbed** text/PDF/photo metadata and image response; live status and disabled controls. No PDF upload/decode/analysis. |
| WN | `source-workspace-ui.spec.ts: AC-SRC-1: New Product opens uploads linked to a new private product` | New workspace/private product linkage; not a per-format full flow. |
| WR | `source-workspace-ui.spec.ts: AC-SRC-1: workspace retry reuses the new product and idempotency key` | Workspace creation fault/retry, no duplicate product. |
| WU | `source-workspace-ui.spec.ts: AC-SRC-1/5/11 {width}px: {kind} upload waits for manual basic-info saving` | Real text or ordinary JPEG **source file** (`kind=file`), save/upload ordering and reopen. Image analysis is not started; no long-image/PDF variant. |
| WF | `source-workspace-ui.spec.ts: AC-SRC-5/11: failed basic-info save retains manual input and file for one explicit retry` | JPEG source selection retained after save failure; explicit retry. |
| D | `source-detail-design.spec.ts: AC-SRC-7/9 AC-TPL-4/5/10: source detail design and grounded content at {width}px` | **Stubbed public product**; 18-module rendering, escaping, image ratio, sparse/long text. No uploaded source of any format. |
| DB | `source-detail-design.spec.ts: AC-07-2: generated meter accompanies only real Brix readings` | **Stubbed** measured/estimated Brix display. |
| R | `source-review-regressions.spec.ts: DEV-186 AC-SRC-5/11: {composer|workspace} refine messages have no file failure` | **Stubbed** refine success/failure messages vs source failure attribution. |
| RC | `source-review-regressions.spec.ts: DEV-186 AC-SRC-3/11: candidate buttons hide money and health, retain product and platform text` | **Stubbed** candidate selection safety. |
| RH | `source-review-regressions.spec.ts: DEV-186 AC-SRC-3/11: composer hints apply to story inputs only` | **Stubbed** inline safety hints. |
| RQ | `source-review-regressions.spec.ts: DEV-186 AC-SRC-1/2/11: multi-product exclusions queue one named modal` | **Stubbed** multi-product exclusion modal queue and session acknowledgement. |
| RE | `source-review-regressions.spec.ts: DEV-186 AC-SRC-11: existing product canvas has no next-step story hints` | Existing editor hint boundary. |
| RO | `source-review-regressions.spec.ts: DEV-186 AC-SRC-5/11: {composer|workspace} accepts an older review response` | **Stubbed** absent-refinementResults compatibility. |
| P | `product-page-workspace.spec.ts: AC-SRC-9: selling product edits remain private until explicit apply` | Product-bound editor save/reopen/confirmation; does not assert consumer pre-apply absence on a separate page. |
| PH | `product-page-workspace.spec.ts: AC-SRC-11 {width}px: heading visibility preserves excluded items through save and apply` | Seeded modules; edit/exclude/hide/restore/save/reopen/apply, API checks resulting module IDs. |
| PP | `product-page-workspace.spec.ts: AC-SRC-11: first editor upload preserves both representative and module placement` | Manual photo upload and private snapshot consistency. |
| M | `public-media.spec.ts: AC-02-3 DEV-102: farm photo is uploaded as a file and saved as a URL, not base64` | Public farm media upload + unauthenticated GET/content type. **No private source URL checks.** |

Other files: `producer-i2` covers older draft failure/manual input; `producer-and-privacy` covers draft/sales wiring and farm storytelling without publishing; `source-disabled` covers the feature-off manual fallback. `conversation-ui` checks consumer product layout, `discovery-and-gates` public discovery/role gates, `producer-help-guide` onboarding entry. `account-withdrawal`, `brand-logo`, `checkout-and-fulfillment`, `consumer-kakao`, `consumer-support`, `farmclub-support`, `legal-consent`, `legal-pages`, `mock-login`, `producer-kakao` cover unrelated account, branding, order, support and legal behavior. None supplies the missing analyzed-image/long-image/PDF full flow.

### Existing format × step × criterion matrix

`—` means no faithful format-specific coverage found. Product-photo-only cases and stubbed PDF metadata are not counted as analyzed source formats. Keys resolve to exact tests above. All listed existing E2E executions are **NOT RUN for this worktree**.

| Source format | Upload (SRC-1) | Private draft (SRC-7/9) | Evidence inspection (SRC-2) | Edit/hide/restore (SRC-11) | Save/reopen (SRC-7/11) | Explicit apply (SRC-9) | Consumer render/equality (SRC-7/9) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Text | C, T, A, ET, WU(text) | C, T, A | — (A has candidates but never opens quotes) | A | A, C, E | A, C, T | A |
| Image source | WU(file), WF | — | — | — | WU(file), WF (attachment only) | — | — |
| Long-image source | — | — | — | — | — | — | — |
| PDF source | — (W is a stub) | — | — | — | — | — | — |

| Source format | Producer edit survives reanalysis (SRC-5/11) | Nothing published before apply (SRC-9) | Approved text exactly equals consumer (SRC-9) | Failure recovery (SRC-5) | Original source stays private (SRC-6) |
| --- | --- | --- | --- | --- | --- |
| Text | C (unsaved); A (360px partial retry) | C/T public API 404 on new product; A save notice only | A full rendered detail equality | E, EB, ET, A(360px) | — (M covers public farm media) |
| Image source | — | — | — | WF (upload ordering) | — |
| Long-image source | — | — | — | — | — |
| PDF source | — | — | — | — | — |

## Added tests and honest boundaries

New `scripts/e2e/producer-format-flow.spec.ts` defines exactly four tests:

- `DEV-171 AC-SRC-1/2/5/6/7/9/11 text: extracted draft to consumer` (**N-text**).
- `DEV-171 AC-SRC-1/2/5/6/7/9/11 image: manual recovery draft to consumer` (**N-image**).
- `DEV-171 AC-SRC-1/2/5/6/7/9/11 long-image: manual recovery draft to consumer` (**N-long-image**).
- `DEV-171 AC-SRC-1/2/5/6/7/9/11 pdf: manual recovery draft to consumer` (**N-pdf**).

All use the real producer UI/API/DB and the existing `run_once` Python worker driver. The source is uploaded through UI and authenticated original bytes are compared with the fixture. Product photo upload is a separate action. Text uses the exact `MOCK_TEXT` fixture; its editor quote must match source ID/page/text. Every format edits summary/storage, persists a hidden section, injects one editor-save 503, retries the identical idempotency key, reopens/restores/saves/reopens, reanalyzes and checks both manual values. A fresh anonymous consumer context must still show the previous public page before apply and while the confirmation is open. Only the explicit confirmation may update it. The approved snapshot's entire module/text array must equal the public API, and the entire rendered preview text must equal the consumer detail. The summary/storage values must appear exactly in their consumer modules. Private original/text/page/raw-image/sanitized-image endpoints must reject anonymous requests; a consumer token must also fail. Independently copied public cover/module photos must return image bytes. No source storage key or private source URL may appear in the public product response.

**Successful visual extraction is NOT covered by mock; covered by T11 live run, not by this E2E.** At this base, `server/app/ai/source_analysis.py:extract(mock)` accepts only `MOCK_SHA` and `MOCK_REFINE_SHA`, calculated from two text strings. `worker.py` sends the original asset checksum, including for PNG/PDF. The synthetic visual generator and pytest OCR seams are not a successful image/PDF extraction provider. A real uploaded visual file cannot have either text checksum. No checksum rewriting, extractor replacement, new mock behavior, paid call or dependency was added. N-image/N-long-image/N-pdf therefore explicitly expect real analysis failure and test the existing manual editor recovery; their passing result does **not** prove successful automatic extraction or visual evidence review. They record a gap annotation and `evidence-unavailable` screenshot. An environment without OCR can fail earlier during preparation; the UI must still show an error/retry and allow the manual editor with the separately prepared product photo.

Per the human owner's DEV-170 execution report, image, long image and PDF were successfully analysed by the live model in the **development set**. Successful extraction is **covered by T11 live run, not by this E2E**. T11 metrics belong to `docs/spec/validation/source-final-eval-i3-*` on branch `jinumeral/dev-170-i3-t11-quality-eval`: [report](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/jinumeral/dev-170-i3-t11-quality-eval/docs/spec/validation/source-final-eval-i3-2026-11-01.md), [metrics JSON](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/jinumeral/dev-170-i3-t11-quality-eval/docs/spec/validation/source-final-eval-i3-2026-11-01.json). The local DEV-170 report snapshot still labels its original mock dry run and has no populated `liveResults`; live success here is explicitly human-reported, and no mock metric is relabelled as a live result. T11 development extraction does not establish holdout quality, farmer acceptance, or successful browser quote inspection for these visual fixtures.

`server/tests/test_producer_format_flow.py::test_AC_SRC_1_5_6_7_9_11_visual_failure_manual_recovery_and_private_source[image|long-image|pdf]` (**V-format**) supplements this at API level. It reuses `synthetic.material`, the existing visual-quality `_ocr` fixture seam, real in-process decoding/tiling/PDF rendering, and the unchanged mock extractor. It checks actual upload hashes, private page spans/downloads, `UNSUPPORTED_MOCK_SOURCE`, manual draft/hide/restore/reopen/reanalysis, explicit apply and exact public text. It also checks other-farm 404 and inaccessible static storage paths. OCR recognition is controlled; OCR quality and browser rendering are not claimed. QR/privacy preprocessing is not bypassed; the existing OCR extra must be installed in the executor's environment.

### Current-build run sheet

**Overall DEV-171 status: PASS for the human-controlled flow with mock.** Human command: `npx playwright test scripts/e2e/producer-format-flow.spec.ts --workers=1 --trace on` → **4 passed, 0 failed (56.8s)**. Text covered mock extraction and quote inspection. Image/long-image/PDF covered real uploads, analysis failure, manual recovery and the complete editing/apply/consumer flow. Their successful visual extraction path is delegated to T11 live development results, not claimed by this E2E. Post-fix API regression and the additional sandbox limitation are recorded separately below.

All filenames below are under ignored `.artifacts/dev171/`. PASS reflects executed assertions; screenshots show the named UI boundaries and the trace carries HTTP assertions. `*-run.json` records approved/public module text and extraction mode.

| Format / test | Upload | Private draft | Source evidence inspection | Edit/hide/restore | Save/reopen | Explicit apply | Consumer render |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Text / N-text | PASS — `t12-text-upload.png` | PASS — `t12-text-private-draft.png` | PASS — `t12-text-evidence.png` | PASS — `t12-text-edit.png`, `t12-text-hide.png`, `t12-text-restore.png` | PASS — `t12-text-save.png`, `t12-text-reopen.png` | PASS — `t12-text-apply-confirmation.png`, `t12-text-apply.png` | PASS — `t12-text-consumer.png` |
| Image / N-image (manual recovery) | PASS — `t12-image-upload.png` | PASS — `t12-image-private-draft.png` | NOT COVERED by mock — `t12-image-evidence-unavailable.png`; covered by T11 live run, not by this E2E | PASS — `t12-image-edit.png`, `t12-image-hide.png`, `t12-image-restore.png` | PASS — `t12-image-save.png`, `t12-image-reopen.png` | PASS — `t12-image-apply-confirmation.png`, `t12-image-apply.png` | PASS — `t12-image-consumer.png` |
| Long image / N-long-image (manual recovery) | PASS — `t12-long-image-upload.png` | PASS — `t12-long-image-private-draft.png` | NOT COVERED by mock — `t12-long-image-evidence-unavailable.png`; covered by T11 live run, not by this E2E | PASS — `t12-long-image-edit.png`, `t12-long-image-hide.png`, `t12-long-image-restore.png` | PASS — `t12-long-image-save.png`, `t12-long-image-reopen.png` | PASS — `t12-long-image-apply-confirmation.png`, `t12-long-image-apply.png` | PASS — `t12-long-image-consumer.png` |
| PDF / N-pdf (manual recovery) | PASS — `t12-pdf-upload.png` | PASS — `t12-pdf-private-draft.png` | NOT COVERED by mock — `t12-pdf-evidence-unavailable.png`; covered by T11 live run, not by this E2E | PASS — `t12-pdf-edit.png`, `t12-pdf-hide.png`, `t12-pdf-restore.png` | PASS — `t12-pdf-save.png`, `t12-pdf-reopen.png` | PASS — `t12-pdf-apply-confirmation.png`, `t12-pdf-apply.png` | PASS — `t12-pdf-consumer.png` |

| Format / test | Edit survives reanalysis | Consumer unchanged before confirmation | Approved = consumer text | Failure + retry retains draft | Private source / public photo separation |
| --- | --- | --- | --- | --- | --- |
| Text / N-text | PASS — `t12-text-reanalysis.png` | PASS — `t12-text-before-apply.png`, `t12-text-apply-confirmation.png` | PASS — `t12-text-consumer.png`, `t12-text-run.json` | PASS — `t12-text-failure.png`, `t12-text-recovery.png` | PASS — `t12-text-privacy.png` + trace HTTP checks |
| Image / N-image | PASS (failed analysis) — `t12-image-reanalysis.png` | PASS — `t12-image-before-apply.png`, `t12-image-apply-confirmation.png` | PASS (manual content) — `t12-image-consumer.png`, `t12-image-run.json` | PASS — `t12-image-failure.png`, `t12-image-recovery.png` | PASS — `t12-image-privacy.png` + trace HTTP checks |
| Long image / N-long-image | PASS (failed analysis) — `t12-long-image-reanalysis.png` | PASS — `t12-long-image-before-apply.png`, `t12-long-image-apply-confirmation.png` | PASS (manual content) — `t12-long-image-consumer.png`, `t12-long-image-run.json` | PASS — `t12-long-image-failure.png`, `t12-long-image-recovery.png` | PASS — `t12-long-image-privacy.png` + trace HTTP checks |
| PDF / N-pdf | PASS (failed analysis) — `t12-pdf-reanalysis.png` | PASS — `t12-pdf-before-apply.png`, `t12-pdf-apply-confirmation.png` | PASS (manual content) — `t12-pdf-consumer.png`, `t12-pdf-run.json` | PASS — `t12-pdf-failure.png`, `t12-pdf-recovery.png` | PASS — `t12-pdf-privacy.png` + trace HTTP checks |

For visual formats, `t12-image-analysis-failure.png`, `t12-long-image-analysis-failure.png`, and `t12-pdf-analysis-failure.png` record **PASS for expected failure detection and enabled retry control**. No successful extraction/evidence PASS is assigned to these mock runs.

## Human execution commands and artifacts

Use the isolated DEV-171 database supplied with the task (`127.0.0.1:55484/farmclub_dev171`), never a shared/production DB. Pytest creates/reseeds `farmclub_dev171_test`. The browser tests mutate the seeded **published synthetic** `p-house`; do not run concurrently with another suite against this DB. Start the API and both apps from the same recorded SHA, with real FastAPI transport (`EXPO_PUBLIC_API_MOCK=0`), mock login, `APP_ENV=local`, `SOURCE_STORAGE=local`, `SOURCE_ANALYSIS_ENABLED=true`, `SOURCE_ANALYSIS_PROVIDER=mock`, and the same DATABASE_URL as the worker. Use fixed demo clock `2026-10-07T10:00:00+09:00`. Stop background workers to keep manual `run_once` execution deterministic. Clear real provider keys. Existing optional OCR packages/models are executor prerequisites, not new project dependencies; without them retain the failure evidence and leave the success gate unrun.

Against that already-running stack, from the repository root (DATABASE_URL supplied in the shell):

```sh
export APP_ENV=local SOURCE_STORAGE=local SOURCE_ANALYSIS_ENABLED=true SOURCE_ANALYSIS_PROVIDER=mock
export FIXED_NOW='2026-10-07T10:00:00+09:00'
export FARMCLUB_API_URL='http://localhost:8000'
export FARMCLUB_PRODUCER_URL='http://localhost:8082'
export FARMCLUB_CONSUMER_URL='http://localhost:8081'
export FARMCLUB_INTEGRATION_ARTIFACTS="$PWD/.artifacts/dev171/$(git rev-parse HEAD)"
mkdir -p "$FARMCLUB_INTEGRATION_ARTIFACTS"
git rev-parse HEAD > "$FARMCLUB_INTEGRATION_ARTIFACTS/build-sha.txt"
npx playwright test scripts/e2e/producer-format-flow.spec.ts --workers=1 --trace on
```

Alternatively, the existing local runner resets the supplied isolated DB, starts the mock-configured real stack and passes arguments to Playwright:

```sh
APP_ENV=local SOURCE_STORAGE=local npm run test:integration:full -- scripts/e2e/producer-format-flow.spec.ts --workers=1 --trace on
```

The runner sets artifacts to `.artifacts/integration` and clears that directory first. Archive each run before another invocation. It also runs the existing API integration checks before the browser cases. To rerun the new API checks in an environment with the existing OCR extra:

```sh
cd server
uv run ruff check . && uv run --extra ocr pytest tests/test_producer_format_flow.py
```

| Artifact | Path after a human run |
| --- | --- |
| Build/environment metadata | `$FARMCLUB_INTEGRATION_ARTIFACTS/t12-<format>-build.json` (local git SHA, dirty flag, browser, URLs, UTC start; human must reconcile running app/API SHAs) |
| Per-step screenshots | `$FARMCLUB_INTEGRATION_ARTIFACTS/t12-<format>-<step>.png` |
| Common step names | `upload`, `private-draft`, `edit`, `hide`, `failure`, `recovery`, `restore`, `save`, `reopen`, `reanalysis`, `before-apply`, `apply-confirmation`, `apply`, `consumer`, `privacy` |
| Evidence step | Text: `evidence`; visual formats: `analysis-failure`, `evidence-unavailable` (never a success claim) |
| Approved/public texts and IDs | `$FARMCLUB_INTEGRATION_ARTIFACTS/t12-<format>-run.json`, also attached to the Playwright report |
| Trace, retained for success and failure with command above | `test-results/producer-format-flow-*/trace.zip` (use the exact generated directory from the reporter) |
| Review report / attachments | `playwright-report/index.html`, `test-results/**/attachments/` |

The supplied human run produced **67 step screenshots**, four build JSON and four run JSON files in `.artifacts/dev171/`, plus four retained Playwright traces. The agent read the metadata/traces; independent human visual review is not recorded. Screenshots, traces and fixtures are **not generated by `--list`**. Keep raw artifacts outside git and restricted as the journey protocol requires. `privacy.png` is the producer screen at the final privacy assertion boundary; the HTTP denial proof is in the trace and assertions, not inferred from the screenshot.

## Source-entry issue register

Source references: `apps/producer/tasks.md` and `server/app/source_analysis/tasks.md`. Current Linear title/status read on 2026-11-01; historical task notes are not current issue status. No issues were created, closed or messaged by this task.

| Issue | Current Linear title | Current status / implication |
| --- | --- | --- |
| [DEV-58](https://linear.app/sswp6/issue/DEV-58) | [DEV] Integrate budgeted OpenRouter Gemini and synthetic pre-release validation | **In Progress**. Existing parent source-integration/quality/farmer-acceptance follow-up; no claim of source-entry closure. |
| [DEV-84](https://linear.app/sswp6/issue/DEV-84) | [DEV] 운영 생산자 앱 새 상품 추가 불가: 자료 분석 꺼진 서버에서 기존 흐름으로 전환 | Done. Feature-off entry has dedicated `source-disabled` coverage. |
| [DEV-90](https://linear.app/sswp6/issue/DEV-90) | [DEV] Enable production source analysis worker and reconcile delivery evidence | Done. Historical deployment is not evidence for this SHA. |
| [DEV-92](https://linear.app/sswp6/issue/DEV-92) | [BUG] Source upload can race basic-info blur save and return STALE_VERSION | Done. WU/WF were inventoried, not rerun; the new N-format upload paths passed in this build. |
| [DEV-184](https://linear.app/sswp6/issue/DEV-184) | [I3] Redesign new-product flow as one edit screen with a bottom AI sheet | Done. Present in base; C/T test current two-screen behavior. |
| [DEV-186](https://linear.app/sswp6/issue/DEV-186) | [I3] Two-stage product draft: refine model fills the detail page | Done. Present in base; exclusion modal/chip regressions are R/RC/RH/RQ/RE/RO. |
| [DEV-187](https://linear.app/sswp6/issue/DEV-187) | [I3] Final-text gold set and stage-2 scorer | Done. Related evaluation work; not a source-entry defect. |
| [DEV-172](https://linear.app/sswp6/issue/DEV-172) | [I3-T10] Freeze source-analysis evaluation corpus, holdout, and field-level scoring rules | Done. Related corpus work; these synthetic workflow cases do not replace that evaluation. |
| DEV-171 finding | Duplicate nosniff header on private source content (also page images / workspace photos) | **Fixed in this PR's uncommitted changes.** Router and `SourceRequestMiddleware` both set `X-Content-Type-Options`, yielding `nosniff, nosniff`. Removed the router copies; middleware owns the single `nosniff`. Strict existing visual-flow assertions remain unchanged; the existing security test now asserts a single header for metadata and source content. Targeted visual API regression: **3 passed** after fix. No PR has been opened. |

DEV-171's human-controlled mock flow is PASS. Successful visual extraction is covered by T11 live run, not by this E2E; DEV-170 owns those metrics and quality limits. No other open source-entry defect was identified from these references; this is not an exhaustive Linear audit. The separate worker subprocess sandbox restriction below needs the human test executor to rerun the named additional test outside sandbox. No live calls are authorized or made by DEV-171.

## Commands actually executed in this worktree

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS: 5 workspaces, 0 errors. |
| `npm run test:mock` | PASS: 47 passed, 0 failed, 0 skipped. Existing Node package-type warnings only. |
| `npx playwright test scripts/e2e/producer-format-flow.spec.ts --list` | Exit 0: 4 tests discovered in 1 file; 0 browser executions. |
| `./node_modules/.bin/tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --esModuleInterop --skipLibCheck --types node scripts/e2e/producer-format-flow.spec.ts` | PASS after correcting the test to use snapshot `texts`; workspace typecheck alone excludes E2E specs. |
| `cd server` then `DATABASE_URL=<supplied DEV-171 DB> SOURCE_ANALYSIS_PROVIDER=mock .venv/bin/python -m pytest tests/test_producer_format_flow.py -q --tb=short` | **0 passed / 3 failed**. At that earlier authoring run the venv lacked `cv2`; `preprocess.qr_regions` raises `IMAGE_PRIVACY_NOT_CONFIGURED` before the expected mock-checksum rejection. No dependency installation or QR bypass; downstream API assertions were unexecuted then (subsequent results below). A first authoring attempt also exposed omitted optional `moduleDetail` in the initial public response; the test now compares its absent/None value correctly. |
| Human outside sandbox, before header fix: `npx playwright test scripts/e2e/producer-format-flow.spec.ts --workers=1 --trace on` | **4 passed / 0 failed (56.8s)**; evidence and boundaries above. Not rerun by this agent after the header-only fix. |
| Human outside sandbox, before header fix: `cd server && uv run --extra ocr pytest tests/test_producer_format_flow.py` | **0 passed / 3 failed** (image, long-image, PDF). Real defect: strict `== "nosniff"` receives `"nosniff, nosniff"`. Supersedes the earlier authoring environment's missing-OpenCV diagnosis for this human run. |
| After header fix: `cd server && uv run ruff check . && uv run --extra ocr pytest tests/test_producer_format_flow.py` | **ruff PASS; 3 passed / 0 failed (4.97s)**. Ran with writable `UV_CACHE_DIR=/private/tmp/dev171-uv-cache` and supplied isolated DEV-171 `DATABASE_URL`; unprefixed first attempt stopped at uv cache `Operation not permitted` before lint/tests. Existing OCR extra/OpenCV available for the successful run; no QR bypass or test weakening. |
| After header fix: `cd server && uv run --extra ocr pytest tests/test_source_analysis.py::test_AC_SRC_8_read_body_limit_and_noncacheable tests/test_media.py tests/test_source_integration.py::test_AC_SRC_6_public_photo_is_independent_and_requires_preparation` (same cache/DB environment) | **15 passed / 1 failed (4.02s)**. The strengthened single-nosniff/security test and all 14 existing media tests passed. The additional source-photo integration test failed before publication: worker PREPARE `PROCESSING_FAILED`, no candidates → review 400. Direct `preprocess.prepare(text, "text/plain")` reproduced **`PermissionError: [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)`**. Human must rerun this same test outside sandbox; no test weakened or guard bypassed. |

Agent time / tokens: instrumentation unavailable. No new dependency, live/paid model call, commit, push, PR or deployment. Product fix is limited to removing duplicate source-response security headers. Local commit outcome and final scope audit are recorded in `apps/producer/tasks.md`.

### 시각 형식 실패 원인 (Claude 확인, 2026-11-01)
브라우저 스택(mock, OCR 모델 경로 미설정)에서 이미지·긴 이미지·PDF는 PREPARE 단계 `OCR_NOT_CONFIGURED`로 실패하고, OCR extra가 있는 pytest 환경에서는 OCR 뒤 mock 추출이 `UNSUPPORTED_MOCK_SOURCE`로 거절한다. E2E는 이 두 코드만 허용해 다른 환경 오류로 통과하지 않게 했다. 두 경우 모두 이 테스트가 확인하는 것은 '분석 실패 → 직접 입력 복구 → 반영 → 소비자 화면' 흐름이며, 시각 자료의 성공 추출은 DEV-170 실측(개발셋 r4: 이미지 사실 19/25, 긴 이미지 16/18, PDF 10/13, 금지 위반·근거 없는 수치 0)으로 대신한다.
