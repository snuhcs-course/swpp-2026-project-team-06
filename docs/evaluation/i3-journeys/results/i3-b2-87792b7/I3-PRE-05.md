# PRE-05 — Stage change before submit and overdue transfer

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-168 (I3-T05) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run) / Zahra Gholami — review pending |
| Build / environment | app + API commit `87792b7` (main, #388; includes DEV-207 order-status copy), baseline `i3-b2-87792b7`; local PostgreSQL 16.15, DB `farmclub_i3_pre`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; no AI, Kakao or analytics keys |
| URLs | API http://localhost:8100, consumer web http://localhost:8181, producer web http://localhost:8182 (Expo web, `EXPO_PUBLIC_API_MOCK=0`) |
| Browser / tooling | Playwright 1.64.0, Chromium headless (consumer 390×844, producer 1280×900); Node 24.1.0; uv 0.12.23 |
| Accounts / fixtures | consumers `u-minji` (UI + API) and `u-seojun` (API), producer `u-kang` (fixture + late confirm), operator local token (`app.accounts.admin_token`), seeded order `o-42` (`u-minji`, RESERVED) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` at 04:39:39Z (Alembic `0025`, 43 seeded orders), then: overdue fixture via API at the injected clock: `u-seojun` two deposit-pending orders, `o-64cfe29c0c` (5kg, no hint) and `o-cf7106423b` (10kg, '입금했어요' sent), both due 2026-10-08T10:00+09:00. Stage change during the run by producer `u-kang` `PUT /api/products/p-house/stages`: `st-house-1/opt-5` price 29,000 → 30,000 (200). Expiry by restarting the API with `FIXED_NOW=2026-10-08T10:30:00+09:00` (same DB), restored to 2026-10-07T10:00 afterwards |
| Harness | `node scripts/i3-preorder/run.mjs I3-PRE-05` (full run of all five rows, run log `.artifacts/i3-journeys/i3-b2-87792b7/run.log`) |
| Harness dry runs | Before the recorded run, the harness was debugged on the same stack (traces in `.artifacts/i3-journeys/i3-b2-87792b7/dryrun/`, outside the planned denominator). Fixes were harness-only (reading `details.reason`, ignoring hidden stack screens, adding the back-and-resubmit step); product observations did not differ from the recorded run. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-05.json`, screenshots `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-05/*.png` |
| UTC | 2026-11-04T04:39:34Z – 2026-11-04T04:40:26Z |
| Money | No transfer. Deposit confirmation was not executed in this row; `payments` rows are counted from the local DB only. |

**Steps:** Open the order sheet (5kg × 1, new address, five consents; sheet shows 29,000원). Producer changes the current stage price to 30,000. Press 예약하기 once and record what happens; confirm the changed terms if the app asks. Compare `o-42` and the no-hint order before/after. Advance the clock past the deadline, list `u-seojun`'s orders, try a late producer `confirm-deposit` on the expired order, and read `GET /admin/orders/deposit-overdue`.

**Expected (matrix):** Stage change requires renewed confirmation with input preserved; old order snapshot remains stable; overdue without paid hint cancels and releases stock, with hint remains pending for operator

| Assertion | Observed | Result |
| --- | --- | --- |
| `renewed_confirmation` | Sheet showed 29,000원. After the price change, 예약하기 → `POST /api/orders` **200** (`totalAmount` 30,000), deposit 200, app went straight to SCR-11 showing '입금할 금액 30,000원'. No 409 `STAGE_CHANGED`, no changed-price notice, no '바뀐 금액으로 예약하기'. DB: new order `AWAITING_DEPOSIT`, unit price 30,000, total 30,000 | ✗ |
| `old_snapshot_stable` | `o-42` 29,000 / 58,000 / `RESERVED` before and after; no-hint order 29,000 / 29,000 before and after | ✓ |
| `overdue_no_hint_cancels` | `o-64cfe29c0c` `CANCELED`, `cancelReason` '입금 기한 초과'; `st-house-1/opt-5` reserved 40 → 39; late `confirm-deposit` 409 `INVALID_TRANSITION` | ✓ |
| `overdue_with_hint_pending` | `o-cf7106423b` still `AWAITING_DEPOSIT`; `st-house-1/opt-10` reserved 7 → 7; listed in `GET /admin/orders/deposit-overdue` | ✓ |

**Defect (renewed confirmation, FEAT-08 E1 / AC-08-6, postcondition "바뀌면 STAGE_CHANGED로 다시 확인받는다"):** A consumer who opened the order sheet at 29,000원 is charged 30,000원 after the producer changes the current stage price, without being told and without confirming. Cause from code reading on `87792b7`: `POST /api/orders` (`server/app/orders/service.py` `create_order`) recalculates `unit_price` from the current stage at submit time, and `OrderInput` carries no expected stage or price, so the server cannot detect that the sheet is stale. The `STAGE_CHANGED` check in `request_deposit` only compares the order with itself, so it fires only if the change lands between the two calls the app sends back to back. By the same code path (read, not executed here) the gap also applies when the stage boundary passes while the sheet is open. Repro: this row's harness, or open the sheet, change the stage price from the producer side, press 예약하기. Expected: 409 `STAGE_CHANGED`, changed price shown, input kept, order only after '바뀐 금액으로 예약하기'. Linear defect: to be opened by the owner (Hyun) and linked here; not opened by the agent.

**Verdict: FAIL.** Partial-attempt rule: the other three assertions held, but any mismatch fails the row. Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-05.json`; screenshots `consumer-01-sheet-before-change`, `consumer-02-after-submit`.
