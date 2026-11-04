# PRE-02 — Quantity boundary and concurrent last unit

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-168 (I3-T05) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run) / Zahra Gholami — review pending |
| Build / environment | app + API commit `87792b7` (main, #388; includes DEV-207 order-status copy), baseline `i3-b2-87792b7`; local PostgreSQL 16.15, DB `farmclub_i3_pre`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; no AI, Kakao or analytics keys |
| URLs | API http://localhost:8100, consumer web http://localhost:8181, producer web http://localhost:8182 (Expo web, `EXPO_PUBLIC_API_MOCK=0`) |
| Browser / tooling | Playwright 1.64.0, Chromium headless (consumer 390×844, producer 1280×900); Node 24.1.0; uv 0.12.23 |
| Accounts / fixtures | consumers `u-minji` (UI + API) and `u-seojun` (API), producer `u-kang` (fixture only), product `p-house` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` at 04:39:04Z (Alembic `0025`, 43 seeded orders), then: `p-house` `maxQuantityPerOrder=3` (seed); last-unit fixture by producer `u-kang` `PUT /api/products/p-house/stages` setting `st-house-1/opt-10` quantity 20 → 7 with 6 reserved (exactly one unit left, 200) |
| Harness | `node scripts/i3-preorder/run.mjs I3-PRE-02` (full run of all five rows, run log `.artifacts/i3-journeys/i3-b2-87792b7/run.log`) |
| Harness dry runs | Before the recorded run, the harness was debugged on the same stack (traces in `.artifacts/i3-journeys/i3-b2-87792b7/dryrun/`, outside the planned denominator). Fixes were harness-only (reading `details.reason`, ignoring hidden stack screens, adding the back-and-resubmit step); product observations did not differ from the recorded run. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-02.json`, screenshots `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-02/*.png` |
| UTC | 2026-11-04T04:38:58Z – 2026-11-04T04:39:07Z |
| Money | No transfer. Deposit confirmation was not executed in this row; `payments` rows are counted from the local DB only. |

**Steps:** Option sheet: press 빼기 at 1 and 더하기 until disabled. API `POST /api/orders` with quantity 0 and 4. Then both consumers create a 10kg × 1 order concurrently (`Promise.all`) and request the deposit instruction concurrently (the step that reserves stock, FEAT-09).

**Expected (matrix):** Invalid quantity rejected without order; at most one last-unit reservation succeeds; loser gets sold-out/limit conflict; stock never negative

| Assertion | Observed | Result |
| --- | --- | --- |
| `invalid_quantity_rejected` | UI: 빼기 disabled at 1, 더하기 disabled at 3, caption '한 번에 최대 3개', sheet shows '5kg × 3'. API: quantity 0 → 409 `QUANTITY_LIMIT`, quantity 4 → 409 `QUANTITY_LIMIT`; 0 new orders | ✓ |
| `one_last_unit_winner` | Both creates 200 (`PENDING_PAYMENT`, no hold by design); deposit: one 200 `AWAITING_DEPOSIT`, one 409; 1 holding order | ✓ |
| `loser_conflict` | 409, `details.reason` `SOLD_OUT`, '이 단계 물량이 다 팔렸어요.' | ✓ |
| `stock_never_negative` | `st-house-1/opt-10` quantity 7, reserved 7 (remaining 0); 0 allocation rows with reserved > quantity or < 0 | ✓ |

Note: quantity 0 is rejected as 409 `QUANTITY_LIMIT` rather than 400. The matrix asks only for rejection without an order, so this does not affect the verdict.

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-02.json`; screenshot `consumer-01-quantity-max`.
