# I3-PRODORD-02 — Other farm's order and producer delivery-complete (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-173 (I3-T13) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Hyun — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | consumer `u-seojun`, producer `u-kang` (farm A), farm B `f-halla` (`p-noji`), seeded SHIPPED order `o-g6` (farm A) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, then `u-seojun` placed farm B order `o-147a4ac9d1` (`AWAITING_DEPOSIT`) |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-02.json` |
| UTC | 2026-11-06T11:09:03Z – 2026-11-06T11:09:03Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** As farm A's producer, try to confirm and reject the deposit of farm B's order. Try to mark the shipped order `o-g6` as delivered (the only delivered route is the operator's `POST /admin/orders/{id}/delivered`; the producer app has no such action) and the consumer's `POST /api/orders/o-g6/confirm`. Compare both orders before and after.

**Expected (matrix):** B order is 404 to A producer; producer delivery-complete request rejected; both states unchanged

| Assertion | Observed | Result |
| --- | --- | --- |
| `b_confirm_404` | `POST /api/orders/o-147a4ac9d1/confirm-deposit` as `u-kang` → **404** "주문을 찾을 수 없어요." | ✓ |
| `b_reject_404` | `reject-deposit` → **404** | ✓ |
| `b_not_in_a_list` | farm B order absent from all pages of `u-kang`'s order list | ✓ |
| `delivery_complete_rejected_for_producer` | `POST /admin/orders/o-g6/delivered` → **403** `FORBIDDEN`; `POST /api/orders/o-g6/confirm` → **403** `WRONG_APP` | ✓ |
| `states_unchanged` | `o-147a4ac9d1` `AWAITING_DEPOSIT`, 0 payments before and after; `o-g6` `SHIPPED`, tracking unchanged, 1 payment before and after | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-02.json`.
