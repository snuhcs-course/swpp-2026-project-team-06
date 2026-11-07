# DEV-243 — Private conversation reading-position restoration

**Status: required local verification passed; human review, merge and deployment pending.** Final 57/57 browser cases and seven real API scenarios passed, including the empty historical window and affected prior regressions.

| Field | Record |
| --- | --- |
| Source / parent / closure | [DEV-153](https://linear.app/sswp6/issue/DEV-153) / [DEV-243](https://linear.app/sswp6/issue/DEV-243) / [DEV-253](https://linear.app/sswp6/issue/DEV-253) |
| Review | [PR #482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482) |
| Original failing baseline | 2693916ba956c771a61c3b07e479a8a47693c45e |
| Implementation base | 57d4843; main 5a10cbf integrated before the final run |
| Tested implementation revision | 4c57556a1f4286eb5108e5552be5621c52bcc225 |
| Environment | Branch-specific local PostgreSQL 16, UTC database; real FastAPI and Metro-served consumer/producer web apps; Chromium 156.0.8078.4 / Playwright 1.64.0; Node 24.22.1; 390×844 and 360×844 viewports |
| Native / deployed authenticated journeys | Unverified; these browser cases do not establish a native-device or deployed mutation pass |

## Diagnosis and fix strategy

The original evaluation created 26 unique messages in Halla with AI OFF. `DEV153-C01-HISTORY-12` was +27 CSS px below the timeline top before A → private list → B → private list → A. It returned at −562 px: **−589 px drift**. Farm identity, thread identity and persisted message order passed. Dated baseline runs: `20261106T073648766Z` and `20261106T073804620Z`. The original evidence remains local; it is not attached to Linear.

The timeline preserved geometry only during an in-place prepend. A recreated component initialized near-bottom=true and scrolled to latest as content appeared. A raw saved scroll offset would still be insufficient when the anchor is outside the newest API page or an earlier image changes height.

| Step | Implementation | Why it is needed |
| --- | --- | --- |
| DEV-250 | Bounded in-memory metadata store, scoped to consumer/user/auth generation/thread and a fresh per-visit lease | Retain only IDs and geometry; reject stale callbacks without caching protected content |
| DEV-251 | Optional timeline restoration phases, fresh older-page loading, sequence-aware deduplication, measured anchor placement and layout correction | Restore the saved reading window and anchor instead of silently jumping to the newest page |
| DEV-252 | Fresh route authorization, exact identity checks, synchronous session invalidation and guarded responses/media | A snapshot never grants access or survives a new authenticated session |
| DEV-253 | Exact-ID browser geometry, navigation, privacy, retry and existing-regression gates | Prove the original defect and the surrounding behaviors on the integrated code |

## Behavioral contract

1. Entry/focus gets a fresh authorized head page before reading a snapshot. Consumer, farm and server thread must match. Component identity includes auth generation, farm, thread and visit; order selection keeps a separate send context.
2. Historical restoration suppresses initial bottom scrolling and read advancement. It reloads older cursors until both the anchor and saved oldest boundary are present, or history is exhausted. Pages are retained, deduplicated and sorted by saved sequence.
3. Row heights, content padding/gap and the older-page control form measured row geometry. This avoids relying on downstream `onLayout` position callbacks when an earlier photo changes height. Target = message top − signed saved viewport offset, clamped to valid bounds.
4. Layout and scroll acknowledgements complete restoration. No fixed sleep decides completion. Later image decoding, text wrapping and prepends maintain the anchor until actual wheel/drag/scroll-key intent or the explicit latest action interrupts correction.
5. New messages leave a history reader in place with the existing new-message action. They are not read until latest is reached. Bottom-pinned snapshots retain ordinary latest behavior. Removed anchors use saved surviving neighbors, then clamped fresh-window geometry. An entirely removed window becomes a valid empty bottom snapshot.
6. Logout, token loss/401, WRONG_APP, account switch and every new login invalidate memory synchronously, including a new session with equal JWT bytes. Ordinary same-session auth.me refresh retains geometry. Old auth responses cannot sign out a newer session. Private-photo/upload auth failures use the same guarded notifications; discarded blob URLs are released.
7. Terminal access loss clears the room's protected data and snapshot. Temporary failures keep safe metadata and expose retry. There is no persistent message/photo/draft cache. Limit: 20 conversations and 30 idle minutes.

## Browser measurement method

- Fixture cleanup is guarded to a disposable loopback database and known synthetic text. AI settings and farm approval status are restored in cleanup. Halla's order eligibility is established through real checkout/admin APIs, without adding a follow or inquiry.
- The 26-message reproduction loads the complete 26-message window before choosing message 12. It waits for latest scrolling to finish, then places the exact server message ID at +27 px. All round trips use visible Back and private-list row controls in the same runtime, without a hard reload.
- Each measurement reads the message rectangle and the same timeline rectangle together. The target row is visible. Restoration is observed with bounded geometry assertions and stable animation-frame measurements, not arbitrary sleeps or hidden-node counts.
- Long-history setup follows the actual default **20 messages per page**, loading until the exact target is present. It records the window before leaving, checks it after returning, then loads remaining history and compares all 120 IDs to the server's saved sequence.
- Photo latency, transient errors, cursor nonprogress and auth errors are explicit network fault injections. Successful authorization/history data still come from the real API. Farm approval loss is an actual guarded local database state change. These are clearly distinguished from native background behavior.

### Original anchor results

The final committed run repeated every measurement below. The exact anchor was m-19122ec16c at 390 px and m-0e891f2bad at 360 px; all ten before/after offsets were 27 px.

| Viewport | Trip | Before (px) | After (px) | Drift (px) | Result |
| --- | --- | ---: | ---: | ---: | --- |
| 390×844 | 1 | 27 | 27 | 0 | PASS |
| 390×844 | 2 | 27 | 27 | 0 | PASS |
| 390×844 | 3 | 27 | 27 | 0 | PASS |
| 390×844 | 4 | 27 | 27 | 0 | PASS |
| 390×844 | 5 | 27 | 27 | 0 | PASS |
| 360×844 | 1 | 27 | 27 | 0 | PASS |
| 360×844 | 2 | 27 | 27 | 0 | PASS |
| 360×844 | 3 | 27 | 27 | 0 | PASS |
| 360×844 | 4 | 27 | 27 | 0 | PASS |
| 360×844 | 5 | 27 | 27 | 0 | PASS |

Each row is below the required ≤8 px absolute drift. The result files contain actual message IDs; safe JSON and screenshot output paths are generated by the tests.

## Final browser matrix

| Case | Observable requirement | Initial combined run | Final committed run |
| --- | --- | --- | --- |
| S01 ×2 | 26 messages, five visible A/B/A trips per phone width, exact +27px anchor | PASS; all ten drifts 0px | PASS |
| S02 | 120 messages; older anchor/window restored; subsequent pagination; no missing/duplicate/reordered IDs | PASS | PASS |
| S03 | Delayed private photo above anchor; new messages while away/live; no premature read; explicit latest/read and bottom following | PASS | PASS |
| S04 | Removed primary anchor uses surviving neighbor; transient older-load error exposes retry | PASS | PASS |
| S05 | Same-runtime same-user logout/login and second user reset snapshots; no geometry/content written to browser storage | PASS | PASS |
| S06 | Repeated cursor stops visibly and recovers on retry | PASS | PASS |
| S07 | Farm approval loss clears protected UI and snapshot; restored access starts at latest | PASS | PASS |
| S08 | All saved history deleted: empty room remains usable, then new arrival follows/read normally | Not in initial 28-case run | PASS |
| R01 | Slow previous A response cannot affect B or a new A visit | PASS | PASS |
| R02 ×4 | 401/WRONG_APP during older restore/private photo clears session; same-runtime relogin starts clean | PASS | PASS |
| R03 | Real mouse wheel interrupts restoration; delayed response and two polls cannot snap back | PASS | PASS |
| Order entry/closure | DEV-242 first paid-order, selected context, photo/retry, privacy and order-switch suite | 14/14 PASS | PASS |
| Existing affected specs | Message ordering, conversation UI, Back rules, producer chat/support, consumer support and private-state/privacy | Not in initial focused run | PASS |

Sources: `scripts/e2e/chat-view-restoration.spec.ts`, `chat-session-isolation.spec.ts`, `order-chat-entry.spec.ts`, `order-chat-closure.spec.ts`; shared guarded fixture and real-order helper live beside them. Default Playwright discovery and the existing root integration target include these files.

## Verification record

| Gate | Executed result |
| --- | --- |
| Initial integrated browser | 28 passed / 0 failed / 0 skipped in 1.9 minutes; no local retries configured |
| Full server / migration | 1,600 passed / 1 skipped; Alembic upgrade/check passed with no new operations |
| Full Mock + pure suites | 245 passed / 1 skipped; 0 failed |
| Workspaces | All five typechecks passed |
| Server lint | Passed |
| Final committed real-stack API/browser run | 7 real API scenarios +57 browser PASS;0 failed/skipped/flaky; 2.8 minutes; revision 4c57556 |
| Human review / merge / deployment read-only check | PENDING; parent remains open |

Earlier test setup failures are retained in local logs: missing pinned browser runtime, an inline-button arrow selector, model registration during fixture cleanup, and a 50-versus-20 page-size assumption. Corrected cases were rerun. They are not counted as successful app observations, and no product behavior was changed to satisfy those mistaken assumptions.

Raw traces, browser recordings, auth values, private photo bytes and unrelated conversation bodies remain outside the committed report. No production mutation tests were executed. The separate DEV-244 frozen-oracle issue is unchanged: this fix preserves DEV-235 saved sequence ordering and DEV-223 KST grouping.

## Final execution and review boundary

Final tested revision:4c57556a1f4286eb5108e5552be5621c52bcc225. Browser results:57 passed in 2.8 minutes, comprising29 new defect cases (14 order,9 restoration,6 session) plus28 existing affected cases. All seven real API integration scenarios passed. The final command/environment record is in [the order-chat report](dev-242-order-chat-regression.md#final-command-record). Later evidence-only commits leave tested source unchanged.

Safe local outputs include per-width anchor-offsets.json, S01-390-five-trips.png, S01-360-five-trips.png and R01.json. Network assertions verify fresh head/older authorization, privacy envelopes, idempotent retry and no premature read; the 120-message check compares all 120 exact IDs in saved sequence. Raw traces remain local and are not attached to Linear.

The earlier wider runs (54/57 then56/57) are retained in local logs. Existing test corrections align a legacy order URL with its seeded farm, distinguish DEV-231 harvest navigation from direct order mutation (including the already-started variant), and verify two temporary notifications independently. The separate producer notification replacement race is [DEV-257](https://linear.app/sswp6/issue/DEV-257); its product behavior is not fixed by these tests. Figma synchronization is [DEV-256](https://linear.app/sswp6/issue/DEV-256).

Human approval, merge revision, Railway/Vercel deployed revision, and post-merge read-only health/OpenAPI/client observations are pending. No authenticated production mutation or native-device pass is claimed. Keep parent defects open until those required gates are recorded.

AI first review: [recorded on PR #482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482#issuecomment-6684643601), with no outstanding must findings for the scoped fixes. Human approval remains pending.
