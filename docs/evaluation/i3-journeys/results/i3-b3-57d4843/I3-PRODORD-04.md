# I3-PRODORD-04 — Repeated confirmation and shipment (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-173 (I3-T13) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Hyun — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | consumer `u-minji`, producer `u-kang`, seeded PREPARING order `o-40` (consumer found through `GET /admin/users/by-order/o-40`) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, then `u-minji` placed `o-5dcc2bd153` (`AWAITING_DEPOSIT`) |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-04.json` |
| UTC | 2026-11-06T11:09:04Z – 2026-11-06T11:09:05Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** Confirm the deposit of `o-5dcc2bd153`, then send the same confirmation again as a client would after losing the first response (the lost response is simulated by the retry itself; no network fault was injected). Ship `o-40`, then send the same shipment again. Reload both roles.

**Expected (matrix):** Deposit confirmation and shipment each act once; one payment record; consumer and producer show same final status and tracking number

| Assertion | Observed | Result |
| --- | --- | --- |
| `confirm_once_retry_harmless` | first confirm 200 `RESERVED`; retry **200** with the same order (idempotent, no new state) | ✓ |
| `one_payment_record` | `payments` rows for `o-5dcc2bd153`: 1 | ✓ |
| `ship_once_retry_rejected_or_same` | first ship 200 `SHIPPED`; retry **409** `INVALID_TRANSITION` ("출하 준비인 주문만…") | ✓ |
| `single_shipment_state` | `o-40` `SHIPPED`, tracking `555566667777`, one payment row | ✓ |
| `roles_agree_status_and_tracking` | `o-40`: producer list and consumer detail both `SHIPPED` / `555566667777`; `o-5dcc2bd153`: both `RESERVED` | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-04.json`.
