# PRE-04 — Lost response, idempotent retry, back and reload

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-168 (I3-T05) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run) / Zahra Gholami — review pending |
| Build / environment | app + API commit `87792b7` (main, #388; includes DEV-207 order-status copy), baseline `i3-b2-87792b7`; local PostgreSQL 16.15, DB `farmclub_i3_pre`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; no AI, Kakao or analytics keys |
| URLs | API http://localhost:8100, consumer web http://localhost:8181, producer web http://localhost:8182 (Expo web, `EXPO_PUBLIC_API_MOCK=0`) |
| Browser / tooling | Playwright 1.64.0, Chromium headless (consumer 390×844, producer 1280×900); Node 24.1.0; uv 0.12.23 |
| Accounts / fixtures | consumer `u-minji` (UI + API), product `p-house` 5kg × 1 |
| Fixture reset proof | `uv run python -m app.core.seed --reset` at 04:39:24Z (Alembic `0025`, 43 seeded orders), then: no data change; lost response injected in the browser with Playwright `page.route`: the first `POST /api/orders` is forwarded to the API (`route.fetch`, server commits) and the browser connection is then reset (`route.abort('connectionreset')`); later requests pass through. `st-house-1/opt-5` reserved 38 before |
| Harness | `node scripts/i3-preorder/run.mjs I3-PRE-04` (full run of all five rows, run log `.artifacts/i3-journeys/i3-b2-87792b7/run.log`) |
| Harness dry runs | Before the recorded run, the harness was debugged on the same stack (traces in `.artifacts/i3-journeys/i3-b2-87792b7/dryrun/`, outside the planned denominator). Fixes were harness-only (reading `details.reason`, ignoring hidden stack screens, adding the back-and-resubmit step); product observations did not differ from the recorded run. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-04.json`, screenshots `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-04/*.png` |
| UTC | 2026-11-04T04:39:18Z – 2026-11-04T04:39:34Z |
| Money | No transfer. Deposit confirmation was not executed in this row; `payments` rows are counted from the local DB only. |

**Steps:** Full order sheet → 예약하기 with the injected lost response → retry from the '연결이 불안정해요' toast → SCR-11. API: replay the captured body with the same key; same key with quantity 2; deposit instruction again with a new key. Browser back from SCR-11 to the order sheet and press 예약하기 again. Reload SCR-11; open and reload the order detail.

**Expected (matrix):** Same body/key returns same order and amount, one stock hold; changed body/key returns conflict; reload does not create an extra order

| Assertion | Observed | Result |
| --- | --- | --- |
| `retry_same_order` | Lost request committed `o-9369ce21f9` (200, 29,000) while the UI showed the toast; retry sent the same key `76f3f25c…` and got `o-9369ce21f9`; SCR-11 opened for that order; DB: 1 new order (`AWAITING_DEPOSIT`); reserved +1 | ✓ |
| `same_key_same_body` | 200, `o-9369ce21f9`, `totalAmount` 29,000 (first result) | ✓ |
| `same_key_changed_body` | 409 `IDEMPOTENCY_MISMATCH` | ✓ |
| `single_hold` | Deposit instruction with a new key: 200 `AWAITING_DEPOSIT` (same order); reserved delta still +1; 1 new order | ✓ |
| `back_resubmit_same_order` | Back → `/checkout/p-house?optionId=opt-5&quantity=1`, 예약하기 enabled; re-press sent the same key and returned `o-9369ce21f9`; still 1 new order | ✓ |
| `reload_no_extra_order` | SCR-11 reload and order-detail reload sent 0 write requests; 1 new order; reserved delta +1 | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-04.json`; screenshots `consumer-01-lost-response-toast`, `consumer-02-pay-after-retry`, `consumer-03a-back-to-sheet`, `consumer-04-detail-reload`.
