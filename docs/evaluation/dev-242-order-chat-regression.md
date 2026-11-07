# DEV-242 — First paid-order conversation regression

**Status: required local verification passed; human review, merge and deployment checks pending.** The final committed run passed all 57 browser cases and seven real API scenarios. This establishes the local fixes and leaves deployment/native observations separate.

| Field | Value |
| --- | --- |
| Parent / closure issue | [DEV-242](https://linear.app/sswp6/issue/DEV-242) / [DEV-249](https://linear.app/sswp6/issue/DEV-249) |
| Baseline | `2693916ba956c771a61c3b07e479a8a47693c45e` |
| Integration branch / review | `minsunkim/dev-245-order-chat-restoration` / [PR #482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482) |
| Fixed tested SHA | `4c57556a1f4286eb5108e5552be5621c52bcc225` — subsequent evidence-only changes do not alter tested source |
| Local environment | Branch-specific `farmclub_dev245` / `_test` on local PostgreSQL 16; real FastAPI; Metro-served consumer/producer web apps; Chromium 156.0.8078.4 / Playwright 1.64.0, Node 24.22.1, with 390×844 and 360×844 viewports |
| Production writes | None in this regression procedure |
| Native-device verification | Not executed by these web tests |

## Baseline and diagnosis

DEV-153 F-04 run `20261106T073442796Z` used an isolated synthetic fixture: consumer `u-seojun`, paid Halla order `o-11`, no Halla follow or thread. Order detail → **농가에 물어보기** opened `/chats/f-halla?from=order&fromOrder=o-11`. Message GET repeatedly returned 404, “대화를 먼저 시작해 주세요.” The room stayed in its loading state; typed text could not be sent. Diagnostic run `20261106T073804620Z` confirmed the same failure. These identifiers described a modified evaluation fixture; they are not assumptions about the standard seed's order ownership.

The baseline order-detail link supplied a navigation return target, without starting a conversation or carrying the explicit API order context. The message reader and sender required an existing authorized thread. The generic start endpoint auto-followed, so adding only `start=1` would have violated the paid-order exception. An empty paid-order conversation also had no durable, authorized order association for list/reload access. Calling the formal inquiry endpoint would create an inquiry, message, and mode transition that the user had not requested.

The baseline evidence remains in the original local DEV-153 report package. It is not attached to Linear. This report records a sanitized summary and repository test paths; it does not export raw traces or private photo bytes.

## Selected implementation

| Step | Change | Critical boundary |
| --- | --- | --- |
| [DEV-245](https://linear.app/sswp6/issue/DEV-245) | Record a unique `(thread, order)` context and retain eligible legacy inquiry access through read-time validation, without backfill. | Context is an association, not permanent permission or a fake inquiry. |
| [DEV-246](https://linear.app/sswp6/issue/DEV-246) | Authorize explicit paid-order start, create one thread/context safely, and revalidate current eligibility on reads/sends/replays. | General starts keep auto-follow; paid-order starts do not follow, invoke AI, or change HUMAN/AUTO. |
| [DEV-247](https://linear.app/sswp6/issue/DEV-247) | Carry optional order context through the compatible client API and enforce the same contract in Mock. | Legacy general-start request shape and idempotency hashes remain compatible. |
| [DEV-248](https://linear.app/sswp6/issue/DEV-248) | Make both order buttons bootstrap before reading, preserve source back targets, provide bounded retry/error states, and require an explicit order choice where ambiguous. | Photos and pending-send keys are scoped to the chosen order; stale route/session responses cannot reveal or enable the previous room. |
| [DEV-249](https://linear.app/sswp6/issue/DEV-249) | Execute the real first-order journeys, retry and privacy boundaries, and publish exact results. | Keep the defect open for any unexecuted required case and until review/merge/deployment evidence exists. |

## Fixture and execution procedure

1. Start the repository's real integration stack against the branch-specific local database. Use UTC for the database session; the native installation's initial Seoul default caused two existing timestamp assertions before this environment correction. Do not change product time-zone behavior to accommodate a local database default.
2. Use the runner's synthetic test-login/admin fixtures. `FARMCLUB_API_URL`, `FARMCLUB_CONSUMER_URL`, `DATABASE_URL`, and `FARMCLUB_ADMIN_TOKEN` must be supplied by that isolated environment. Never put credential values in this record.
3. Every case calls the guarded `chat-regression-fixture.py begin`. Assert no Halla thread, follow, messages, context, inquiry, escalation, or synthetic private attachment exists. The helper refuses an unexpected conversation body, requires a loopback `farmclub_dev*` database and explicit regression flag, and saves/restores farm AI settings. AI is OFF for deterministic sends.
4. Create an owned synthetic order through `POST /api/orders`, request its deposit, and confirm it through the real admin endpoint. Do not globally reassign a seeded paid order or seed a follow/thread to hide the defect.
5. Execute the specs below. The entry spec retains the original order-detail buttons and first-open preconditions. The closure spec adds complete re-entry and account/privacy boundaries.
6. Run cleanup in `afterEach` only after `begin` succeeded. The helper removes the synthetic conversation and private attachments and restores AI settings. Synthetic checkout orders remain only in the disposable branch database, which is discarded after evaluation. This does not run a shared reset.

Focused browser invocation against an already running isolated stack:

```sh
npm run test:e2e -- scripts/e2e/order-chat-entry.spec.ts scripts/e2e/order-chat-closure.spec.ts
```

The same files are discovered by the existing root `make test-e2e` target. `make test-server`, `npm run test:mock`, and `npm run typecheck` are supporting gates; browser-only discovery is not a substitute for execution.

## Required real-stack matrix

The test titles carry FEAT acceptance IDs. Every entry below passed on the committed revision above. The final run used no local retries.

| Case | Requirement and observable result | Test source | Result |
| --- | --- | --- | --- |
| O4-01 / O4-02 | Both 390px and 360px first paid-order inline entries start before message GET, enable send, and save exactly one message with the selected order; zero follow/inquiry/escalation. | `order-chat-entry.spec.ts`: first paid-order inline entry, two viewport cases | PASS |
| O4-03 | Paid cancellation/refund-pending history remains eligible through the order bottom-bar entry without following. | `order-chat-entry.spec.ts`: paid cancellation/refund-pending | PASS |
| O4-04 | A deposit-reported but unpaid order uses the general follow contract with visible notice and no order context. | `order-chat-entry.spec.ts`: unpaid deposit-reported | PASS |
| O4-05 | Start and send responses lost after server commit retry the same keys and create one context/message. | `order-chat-entry.spec.ts`: lost start/send responses | PASS |
| O4-06 | A legacy `fromOrder` URL starts the valid order context and reload keeps the thread. | `order-chat-entry.spec.ts`: legacy order link | PASS |
| O4-07 | A first photo-only send binds a private photo to the selected order. | `order-chat-entry.spec.ts`: first order photo-only | PASS |
| O4-08 | Changing order retains draft text, clears old-order photos, and sends only the newly selected order context. | `order-chat-entry.spec.ts`: multiple order selection | PASS |
| O4-09 | Foreign order failure is visible; composer is absent, no message polling begins, no thread/follow is created. | `order-chat-entry.spec.ts`: foreign order | PASS |
| C01 | Send with AI OFF, back to originating order, reopen, enter via private list, reload, logout/relogin, and re-enter the same thread; no follow or phantom inquiry/escalation; AUTO/version unchanged. | `order-chat-closure.spec.ts`: C01 | PASS |
| C02 | At 360px, a private-list entry with two paid contexts disables the composer until explicit selection; sending binds the deliberately chosen order. A fresh list entry remains unselected. | `order-chat-closure.spec.ts`: C02 | PASS |
| C03 | A committed text+photo response is lost; draft/photo survive, retry uses identical key and body, and there is exactly one stored message and one attachment with the correct order. | `order-chat-closure.spec.ts`: C03 | PASS |
| C04 | Consumer B cannot start/send with A's order, use A's cursor/read ID, upload to A's thread/order, read/bind A's bound photo; another farm's producer cannot upload/read/bind it. Error envelopes match, A's scoped counts/state and B's page remain unchanged. | `order-chat-closure.spec.ts`: C04 | PASS |
| C05 | Hold the first order's real message response, navigate visibly back through the order list to a second order, then deliver the old response. The second selection/composer stays active and sends with the second order ID. | `order-chat-closure.spec.ts`: C05 | PASS |

Test paths above are relative to `scripts/e2e/`. The closure helper is `scripts/e2e/chat-regression.ts`. It adds no second application runner and does not replace standard auth helpers.

### Supporting gates already reported during implementation

These are interim, stage-specific results reported by the central implementation runner, not final browser results or a claim that the final combined diff passed.

| Stage | Executed gate | Recorded result |
| --- | --- | --- |
| DEV-245/246 server | `make test-server` | 1,600 passed / 1 skipped; Alembic check found no model drift |
| DEV-247 API/Mock | `npm run test:mock` | 198 passed / 1 skipped |
| DEV-247 workspaces | `npm run typecheck` | Five workspace type checks passed |
| DEV-248 entry helpers | `npm run test:mock`; entry helper unit suite | 204 passed / 1 skipped overall Mock; 6 entry unit cases passed |
| DEV-250 metadata store | Focused pure state suite | 13 passed at that implementation stage; later shared-engine changes require their own run |
| DEV-249 discovery | `npm run test:e2e -- scripts/e2e/order-chat-closure.spec.ts --list` | Five tests discovered at that stage; final browser execution subsequently passed all five closure cases. |

The initial DEV-248 browser attempt failed at launch because the pinned Chromium build was absent. It executed no app journey and does not establish an app failure. A task-local browser download corrected that dependency. Node/npm/browser dependencies are kept outside product source; record the actual subsequent run instead of counting environment retries as app-case results.

## Required boundary coverage and remaining review

The real-stack cases connect entry, session, order selection, retry, and private-file behavior. The server/Mock suites additionally exercise the invalid/unpaid/wrong-farm/unapproved matrix, authentication and onboarding, same-key/different-body conflicts, concurrent same/different-key/general-order starts, legacy inquiry compatibility, revoked-context replay, one-thread/context uniqueness, and stable general-start hashes. Their final exact commands/counts must be recorded after the combined implementation is settled.

The separate DEV-243 scroll defect and DEV-244 ordering-oracle issue do not change the first-order acceptance denominator. Preserve DEV-235 saved sequence ordering, DEV-223 KST day grouping, and DEV-224 source-aware back targets throughout this work.

### Final execution record — central runner to complete

| Field | Required entry |
| --- | --- |
| Fixed committed SHA / execution date | 4c57556a1f4286eb5108e5552be5621c52bcc225;2026-11-06 UTC |
| Exact commands / safe environment description | See final command record below; isolated loopback farmclub_dev245 database, AI/source external keys unset |
| Entry browser count / closure browser count | 9/9 entry +5/5 closure PASS; final total57 passed,0 failed/skipped/flaky in 2.8 minutes;7 real API scenarios passed |
| Final server / Mock / typecheck results | Server 1,600 passed/skip1; Alembic no drift; Mock 245 passed / 1 skipped; all 5 workspace and changed E2E typechecks passed; lint passed |
| Safe screenshot / network assertion references | Local test-results paid-order-390.png, paid-order-360.png, paid-order-photo.png, order-selection-sheet.png and C01/C02 screenshots; exact request/response/state assertions in the linked specs. Raw artifacts are not attached to Linear. |
| First AI review / must findings resolved | [Codex first review](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482#issuecomment-6684643601); no outstanding must findings for the two scoped fixes; DEV-257 follow-up recorded |
| Human review / merge SHA | PENDING |
| Railway / consumer deployment revision | PENDING |
| Read-only health / OpenAPI / client asset observations | PENDING |
| Authenticated deployment mutation journey | Unverified; no production mutation test is authorized by this regression procedure |

**Closure rule:** keep DEV-242 and DEV-249 open until all required local regression cases pass and human review/merge plus read-only deployment checks are recorded. A documentation entry, discovered test, screenshot, or local supporting test count alone does not meet that rule.

## Final command record

On tested revision 4c57556, use a disposable loopback database named farmclub_dev* (or the repository CI environment), an installed pinned Playwright browser, and the repository integration runner. Do not substitute a shared/production database.

```sh
make test-server
npm run test:mock
npm run typecheck
make lint
node scripts/ci/classify.mjs --check
node scripts/run-integration.mjs scripts/e2e/order-chat-entry.spec.ts scripts/e2e/order-chat-closure.spec.ts scripts/e2e/chat-view-restoration.spec.ts scripts/e2e/chat-session-isolation.spec.ts scripts/e2e/chat-message-order.spec.ts scripts/e2e/conversation-ui.spec.ts scripts/e2e/back-rules.spec.ts scripts/e2e/producer-chat-header.spec.ts scripts/e2e/producer-and-privacy.spec.ts scripts/e2e/consumer-support.spec.ts scripts/e2e/farmclub-support.spec.ts scripts/e2e/producer-support-contact.spec.ts
```

This run supplied DATABASE_URL for the isolated farmclub_dev245 database, APP_ENV=local, SOURCE_ANALYSIS_ENABLED=false, EXPO_OFFLINE=1, FARMCLUB_INTEGRATION_SKIP_DOCKER=1 for the dedicated native PostgreSQL instance, and a task-local PLAYWRIGHT_BROWSERS_PATH. External AI keys were unset. The runner generated its own admin fixture and stopped app/API services afterwards. No secret value is reproduced here.

Supporting full server source was unchanged after its 1,600 / 1 skipped verification. Final Mock/typechecks ran ated520660; later source changes were E2E-only fixture/oracle corrections, then evidence. Changed E2E files also passed a direct no-emit TypeScript check using ESNext/bundler resolution.

The first wider run at ed520660 had54/57 passes; corrected prior test assumptions were rerun. A second run at 5ff8ba9 had56/57 passes because the new harvest check initially omitted the accepted already-started label variant. The final 4c57556 run passed57/57. The separate existing producer toast replacement race is [DEV-257](https://linear.app/sswp6/issue/DEV-257); checking independent notifications serially is test isolation, not a product fix for that race. Figma follow-up is [DEV-256](https://linear.app/sswp6/issue/DEV-256).
