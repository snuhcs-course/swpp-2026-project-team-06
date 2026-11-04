# PRE-01 — Valid preorder, total, consent and producer view

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-168 (I3-T05) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run) / Zahra Gholami — review pending |
| Build / environment | app + API commit `87792b7` (main, #388; includes DEV-207 order-status copy), baseline `i3-b2-87792b7`; local PostgreSQL 16.15, DB `farmclub_i3_pre`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; no AI, Kakao or analytics keys |
| URLs | API http://localhost:8100, consumer web http://localhost:8181, producer web http://localhost:8182 (Expo web, `EXPO_PUBLIC_API_MOCK=0`) |
| Browser / tooling | Playwright 1.64.0, Chromium headless (consumer 390×844, producer 1280×900); Node 24.1.0; uv 0.12.23 |
| Accounts / fixtures | consumer A `u-minji` (UI), producer A `u-kang` → farm `f-kang` (UI + API), product `p-house` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` at 04:38:49Z (Alembic `0025`, 43 seeded orders), then: producer `u-kang` `PATCH /api/products/p-house` → `shippingFeeType=SEPARATE`, `shippingFee=4000`, `remoteAreaFee=3000` (200); `maxQuantityPerOrder=3`; stage `st-house-1` / `opt-5` price 29,000 (integer), allocation 80 / reserved 38; consent version fixed by the app (`policy-2026-10-23`) |
| Harness | `node scripts/i3-preorder/run.mjs I3-PRE-01` (full run of all five rows, run log `.artifacts/i3-journeys/i3-b2-87792b7/run.log`) |
| Harness dry runs | Before the recorded run, the harness was debugged on the same stack (traces in `.artifacts/i3-journeys/i3-b2-87792b7/dryrun/`, outside the planned denominator). Fixes were harness-only (reading `details.reason`, ignoring hidden stack screens, adding the back-and-resubmit step); product observations did not differ from the recorded run. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-01.json`, screenshots `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-01/*.png` |
| UTC | 2026-11-04T04:38:44Z – 2026-11-04T04:38:58Z |
| Money | No transfer. Deposit confirmation was not executed in this row; `payments` rows are counted from the local DB only. |

**Steps:** Product page → 예약하기 → option 5kg, quantity 2 → 주문서로 → new remote address (postal 63584, Jeju) → five consents checked one by one → 예약하기 once → read deposit instruction (SCR-11) → consumer `GET /api/orders/{id}` and DB → producer web `/ship?status=AWAITING_DEPOSIT` + `GET /api/orders/producer?status=AWAITING_DEPOSIT` → consumer list tabs (미확정, 확정) → one extra pre-deposit (`PENDING_PAYMENT`) order via API to check that unpaid orders are not listed.

**Expected (matrix):** Total equals price×quantity+shipping+surcharge; consent timestamp/version stored; one AWAITING_DEPOSIT order and one stock reservation; deposit instruction and producer view agree on item/amount/status; unpaid order absent from paid-order tabs; no money moved

**Contract note (logged before execution):** the matrix phrase "paid-order tabs" predates the current SCR-13 contract. `screens.md` SCR-13 (DEV-68/DEV-207) shows `AWAITING_DEPOSIT` orders as '입금 대기 · 입금해 주세요' cards, and the app groups them in 미확정; "결제 전 주문은 제외" (AC-10-6) refers to `PENDING_PAYMENT`. The product contract wins, so the assertion was run as: the deposit-pending order appears only as an unpaid '입금 대기' card (never in 확정 and never with paid copy), and a `PENDING_PAYMENT` order is in no tab and not in `GET /api/orders`.

| Assertion | Observed | Result |
| --- | --- | --- |
| `sheet_total_breakdown` | Order sheet showed goods 58,000원, shipping 4,000원, '도서산간 추가 운임' 3,000원, total 65,000원 | ✓ |
| `one_keyed_request` | 1 × `POST /api/orders` with one `Idempotency-Key`, 1 × `POST /api/orders/{id}/deposit` with its own key | ✓ |
| `total_formula` | `unitPrice` 29,000 × `quantity` 2 + `shippingFee` 4,000 + `remoteAreaFee` 3,000 = `totalAmount` **65,000** | ✓ |
| `consent_stored` | `consent_at` 2026-10-07 01:00:00+00 (injected clock), `consent_version` `policy-2026-10-23` | ✓ |
| `one_awaiting_order_one_hold` | New orders for `u-minji`: exactly one, `o-5a2a2201fe` `AWAITING_DEPOSIT`; `st-house-1/opt-5` reserved 38 → 40 (+2 once) | ✓ |
| `deposit_instruction` | SCR-11 showed 65,000원, '5kg × 2', the farm account number, depositor name = order no. `FC-1007-…`, deadline 10월 8일 10:00, intermediary notice | ✓ |
| `producer_agrees` | Producer API: `AWAITING_DEPOSIT`, '5kg × 2', 65,000; producer web row with '`<order no>` 입금 승인' button, 65,000원, '5kg × 2' | ✓ |
| `unpaid_absent_from_paid_tabs` | '입금 대기 · 입금해 주세요' card in 미확정; 0 matches in 확정; the extra `PENDING_PAYMENT` order not in `GET /api/orders` and not on screen | ✓ |
| `no_money_moved` | `payments` for the order 0, `paid_at` null, total `payments` delta 0 | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-01.json`; screenshots `consumer-01-order-sheet`, `consumer-02-deposit-instruction`, `producer-03-awaiting-deposit`, `consumer-04-orders-pending-tab`, `consumer-05-orders-confirmed-tab`.
