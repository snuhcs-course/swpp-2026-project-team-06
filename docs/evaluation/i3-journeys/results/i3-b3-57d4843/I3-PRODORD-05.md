# I3-PRODORD-05 — Overdue deposits and delivered-order privacy (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-173 (I3-T13) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Hyun — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173, producer web http://localhost:8082 (Expo web, `EXPO_PUBLIC_API_MOCK=0`) |
| Layer | API for all assertions; producer web app (Playwright, Chromium headless, 390×850) for the delivered-order screen |
| Accounts / fixtures | consumers `u-minji` (no hint) and `u-seojun` (paid hint), producer `u-kang`, operator local token, seeded DELIVERED order `o-07` (`FC-0918-0007`, farm A) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, then two new `p-house` 5 kg orders: `o-a4c0c781d7` (`u-minji`, no hint) and `o-c84dc79ed0` (`u-seojun`, '입금했어요' sent); both `deposit_due_at` set to 2026-10-06T00:00Z in the isolated DB (before the fixed clock) — the "expire due date" step |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run); screen check `I3_PRODUCER=http://localhost:8082 DELIVERED_ORDER_NO=FC-0918-0007 node scripts/i3-journeys/delivered-mask.mjs` |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-05.json`, screenshots `PRODORD-05-ship-all-delivered.png`, `PRODORD-05-dashboard.png` (same folder) |
| UTC | 2026-11-06T11:09:05Z – 2026-11-06T11:09:06Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** With both due dates in the past, query the no-hint order as the consumer and the order list as the producer, query the paid-hint order, read `GET /admin/orders/deposit-overdue`, try a late producer confirmation on the no-hint order, and compare `st-house-1/opt-5` reserved count. Inspect the delivered order `o-07` in the producer order list (API and the app's 주문 현황 › 전체 tab) and on the dashboard.

**Expected (matrix):** No-hint order canceled and stock restored; paid-hint order remains pending for operator; delivered address/contact masked and counts agree

| Assertion | Observed | Result |
| --- | --- | --- |
| `no_hint_canceled_deadline` | `o-a4c0c781d7` `CANCELED`, `cancelReason` '입금 기한 초과' | ✓ |
| `stock_restored` | `st-house-1/opt-5` reserved 40 → 39 | ✓ |
| `late_confirm_409` | late `confirm-deposit` → **409** `INVALID_TRANSITION` | ✓ |
| `paid_hint_pending_and_on_operator_list` | `o-c84dc79ed0` still `AWAITING_DEPOSIT`; the only row in `deposit-overdue` | ✓ |
| `producer_consumer_agree` | producer list: the canceled no-hint order is no longer listed (canceled orders leave the producer list); paid-hint `AWAITING_DEPOSIT` — consistent with the consumer views (`CANCELED` / `AWAITING_DEPOSIT`) | ✓ |
| `delivered_contact_address_masked_in_order_list` | `o-07` (`DELIVERED`) in `GET /api/orders/producer`: recipient name, phone, postal code, street address and unit all returned in full (synthetic seed values, redacted here). The app's 주문 현황 › 전체 tab shows the row "김민지 · 조생 감귤 5kg × 1 / 21,000원 / <full street address and unit> / CJ대한통운 <tracking>" (screenshot) | ✗ |
| `delivered_masked_on_dashboard` | the dashboard's recent-order rows carry only a masked name and region, never an address or phone (rows in this run: three `RESERVED` orders, e.g. '예○○'; `o-07` was not among them, so this shows the dashboard format, not `o-07` itself) | ✓ |

**Defect (R-15 "배송 완료 후에는 가린다", matrix PRODORD-05; AC-14-2 for the 현황 screen):** after delivery the producer still sees the consumer's full address and phone in the order list. Cause from code reading on `57d4843`: `producer_order_view` (`server/app/orders/service.py`) hides address and contact only while `paid_at` is empty (before deposit), not after `DELIVERED`, and `apps/producer/src/app/ship.tsx` prints `address`/`addressDetail` for every non-awaiting, non-refunded row; the 전체 tab includes delivered orders. The dashboard (`recentOrders`) is masked. Repro: this row's harness, or log in as 강영수 locally and open 주문 현황 › 전체, scroll to `FC-0918-0007`. Expected: name, phone and address masked once the order is `DELIVERED`. Linear defect: [DEV-254](https://linear.app/sswp6/issue/DEV-254) (owner to be assigned).

**Verdict: FAIL.** Partial-attempt rule: the other six assertions held, but any mismatch fails the row. Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-05.json`.
