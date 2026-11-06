# PRE-05 — Stage change before submit and overdue transfer (re-run on merged main after the DEV-216 fix)

This is a new run on merged `main`. It does not replace the original FAIL in `../i3-b2-87792b7/I3-PRE-05.md`.

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged) |
| Execution issue | DEV-177 (I3-T20 regression); fix DEV-216 (PR #412, `231faa9`) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run) / Zahra Gholami — review pending |
| Build / environment | app + API commit `57d4843` (main, #481; includes #412), baseline `i3-main-57d4843`; local PostgreSQL 16.15, DB `farmclub_i3rerun`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; AI / Kakao / payment keys blanked in `server/.env` for the run |
| URLs | API http://localhost:8177 (started and stopped by the harness), consumer web http://localhost:8277, producer web http://localhost:8377 (Expo web, `EXPO_PUBLIC_API_MOCK=0`; ports off the defaults) |
| Browser / tooling | Playwright 1.64.0, Chromium headless (consumer 390×844, producer 1280×900); Node 24.1.0; uv 0.12.23 |
| Accounts / fixtures | consumers `u-minji` (UI + API) and `u-seojun` (API), producer `u-kang` (stage change + late confirm), operator local token (`app.accounts.admin_token`), seeded order `o-42` (`u-minji`, RESERVED) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` at 2026-11-06T11:37:50.094Z (Alembic `0025`, 43 seeded orders), then overdue fixture via API at the injected clock: `u-seojun` two deposit-pending orders, `o-3c2fc64ecc` (5kg, no hint) and `o-83105b8b6e` (10kg, '입금했어요' sent, 200), both due 2026-10-08T10:00+09:00. Stage change during the run by `u-kang` `PUT /api/products/p-house/stages`: `st-house-1/opt-5` 29,000 → 30,000 (200). Expiry by restarting the API with `FIXED_NOW=2026-10-08T10:30:00+09:00` (same DB) |
| Harness | `I3_BASELINE=i3-main-57d4843 I3_DB=farmclub_i3rerun FARMCLUB_API_URL=http://localhost:8177 FARMCLUB_CONSUMER_URL=http://localhost:8277 FARMCLUB_PRODUCER_URL=http://localhost:8377 node scripts/i3-preorder/run.mjs I3-PRE-05` (harness unchanged since the original run; single row only) |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-main-57d4843/I3-PRE-05.json`, screenshots `.artifacts/i3-journeys/i3-main-57d4843/I3-PRE-05/consumer-01-sheet-before-change.png`, `consumer-02-after-submit.png`, `consumer-03-after-reconfirm.png` |
| UTC | 2026-11-06T11:37:46.536Z – 11:38:08.881Z |
| Money | No transfer. Deposit confirmation was not executed in this row; `payments` rows are counted from the local DB only. |

**Steps:** same as the original row. Open the order sheet (5kg × 1, new address, five consents; 29,000원). Producer changes the current stage price to 30,000. Press 예약하기 once; confirm the changed terms if the app asks. Compare `o-42` and the no-hint order before/after. Advance the clock past the deadline, list `u-seojun`'s orders, try a late producer `confirm-deposit` on the expired order, and read `GET /admin/orders/deposit-overdue`.

**Expected (matrix):** Stage change requires renewed confirmation with input preserved; old order snapshot remains stable; overdue without paid hint cancels and releases stock, with hint remains pending for operator

| Assertion | Observed | Result |
| --- | --- | --- |
| `renewed_confirmation` | First 예약하기 → `POST /api/orders` **409 `STAGE_CHANGED`**; app stays on `/checkout/p-house?optionId=opt-5&quantity=1` with the changed-price notice, recipient and option kept, bottom button '바뀐 금액으로 예약하기' with 30,000원. After pressing it: `POST /api/orders` 200 (new idempotency key, `totalAmount` 30,000), deposit 200, SCR-11. DB: one new order `AWAITING_DEPOSIT`, unit price 30,000, total 30,000 | ✓ |
| `old_snapshot_stable` | `o-42` 29,000 / 58,000 / `RESERVED` before and after; no-hint order 29,000 / 29,000 before and after | ✓ |
| `overdue_no_hint_cancels` | `o-3c2fc64ecc` `CANCELED`, `cancelReason` '입금 기한 초과'; `st-house-1/opt-5` reserved 40 → 39; late `confirm-deposit` 409 `INVALID_TRANSITION` | ✓ |
| `overdue_with_hint_pending` | `o-83105b8b6e` still `AWAITING_DEPOSIT`; `st-house-1/opt-10` reserved 7 → 7; listed in `GET /admin/orders/deposit-overdue` | ✓ |

**Verdict: PASS (4/4).**
