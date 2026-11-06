# I3-PRODORD-01 — Producer confirms a deposit once (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-173 (I3-T13) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Hyun — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | consumer `u-minji`, producer `u-kang` (farm A `f-kang`) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, then `u-minji` placed a new 5 kg `p-house` order `o-4487725028` and asked for the deposit guide (`AWAITING_DEPOSIT`) |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-01.json` |
| UTC | 2026-11-06T11:09:02Z – 2026-11-06T11:09:03Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** Find the awaiting order in the producer order list. Confirm the deposit once (`POST /api/orders/o-4487725028/confirm-deposit`). Reload the producer list and dashboard and the consumer order detail.

**Expected (matrix):** One RESERVED order, payment confirmation time and actor; dashboard to-do/count updates; consumer/producer item, amount and status agree

| Assertion | Observed | Result |
| --- | --- | --- |
| `found_awaiting_in_producer_list` | `o-4487725028` listed for `u-kang` as `AWAITING_DEPOSIT` | ✓ |
| `confirm_200_reserved` | confirm-deposit **200**, status `RESERVED` | ✓ |
| `one_payment_record` | `payments` rows for `o-4487725028`: 1 | ✓ |
| `confirmation_time_and_actor_recorded` | `paid_at` 2026-10-07T01:00:00+00:00 (the fixed clock), `deposit_confirmed_by` `PRODUCER` | ✓ |
| `dashboard_awaiting_count_down_by_1` | dashboard to-do `awaitingDeposit` 1 → 0; harvest target count 30 → 31 (observed, not asserted) | ✓ |
| `consumer_producer_agree_item_amount_status` | After reload both roles show `p-house`, quantity 1, 29,000원, `RESERVED` | ✓ |

Coverage note: the matrix row asks for the dashboard "to-do/count" update, asserted here as the `awaitingDeposit` to-do count. AC-14-1 is only partly verified: the total/reserved order metrics and the representative product's reserved kg were not asserted (spec-check SC-001, run 42211369650).

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-01.json`.
