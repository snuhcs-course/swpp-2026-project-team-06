# PRE-03 — Missing consent and paused sale

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-168 (I3-T05) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run) / Zahra Gholami — review pending |
| Build / environment | app + API commit `87792b7` (main, #388; includes DEV-207 order-status copy), baseline `i3-b2-87792b7`; local PostgreSQL 16.15, DB `farmclub_i3_pre`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; no AI, Kakao or analytics keys |
| URLs | API http://localhost:8100, consumer web http://localhost:8181, producer web http://localhost:8182 (Expo web, `EXPO_PUBLIC_API_MOCK=0`) |
| Browser / tooling | Playwright 1.64.0, Chromium headless (consumer 390×844, producer 1280×900); Node 24.1.0; uv 0.12.23 |
| Accounts / fixtures | consumer `u-minji` (UI + API), producer `u-kang` (fixture only), product `p-house` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` at 04:39:12Z (Alembic `0025`, 43 seeded orders), then: paused sale created during the run by producer `u-kang` `PUT /api/products/p-house/sales-settings` `salesPaused=true` (200) while the consumer's order sheet was open |
| Harness | `node scripts/i3-preorder/run.mjs I3-PRE-03` (full run of all five rows, run log `.artifacts/i3-journeys/i3-b2-87792b7/run.log`) |
| Harness dry runs | Before the recorded run, the harness was debugged on the same stack (traces in `.artifacts/i3-journeys/i3-b2-87792b7/dryrun/`, outside the planned denominator). Fixes were harness-only (reading `details.reason`, ignoring hidden stack screens, adding the back-and-resubmit step); product observations did not differ from the recorded run. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-03.json`, screenshots `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-03/*.png` |
| UTC | 2026-11-04T04:39:07Z – 2026-11-04T04:39:18Z |
| Money | No transfer. Deposit confirmation was not executed in this row; `payments` rows are counted from the local DB only. |

**Steps:** Order sheet with 10kg × 2 and a new address; check four consents, leave '개인정보 제3자 제공 (판매자)' unchecked; try 예약하기. Send the same order to the API with `thirdParty=false`. Then check the fifth consent, pause the sale from the producer side, press 예약하기, and send one direct API order.

**Expected (matrix):** Missing consent rejected in UI and server with no order; paused sale rejected; entered address and choice retained for correction

| Assertion | Observed | Result |
| --- | --- | --- |
| `missing_consent_rejected` | UI: 예약하기 disabled, '5개 중 4개 동의했어요. …' shown, 0 `POST /api/orders` sent. API: 400 `VALIDATION_ERROR`, `fields.consents` '예약 전 확인 5개에 모두 동의해 주세요'; 0 new orders | ✓ |
| `paused_rejected` | UI request: 409 `SALES_PAUSED`; direct API: 409 `SALES_PAUSED`; 0 new orders | ✓ |
| `input_retained` | Still on `/checkout/p-house`; recipient, address, '10kg × 2' and all consents still shown/checked | ✓ |

Observation (outside the matrix assertion, not a verdict change): after the pause the sheet shows the notice '농가가 잠시 예약을 쉬고 있어요.' with the price-change body, and the button changes to '바뀐 금액으로 예약하기' and stays enabled although the amount did not change (screenshot `consumer-02-paused`). The 409 branch in `apps/consumer/src/app/checkout/[productId]/index.tsx` treats every conflict as a price change. Suggested follow-up for the owner, not filed here.

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-PRE-03.json`; screenshots `consumer-01-missing-consent`, `consumer-02-paused`.
