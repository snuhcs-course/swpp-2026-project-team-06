# DISC-05 — Sale paused and resumed

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-166 (I3-T04) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run and automatic assertion check) / Minsun Kim (matrix reviewer) — review pending |
| Build / environment | app and API commit `87792b7` (main, #388), baseline `i3-b2-87792b7` (DEV-165 procedure on this commit), local `farmclub_i3_disc` (Alembic `0025`), API http://localhost:8000, consumer web http://localhost:8081 (Expo web, real API), `FIXED_NOW=2026-10-07T10:00+09:00`, Chromium 156.0.8078.4 headless 390×844 ko-KR Asia/Seoul, no AI or other provider keys in `server/.env` |
| Accounts / fixtures | consumer `u-minji` (follows `f-kang` in the seed); producer `u-kang`; farm A `f-kang` / product A `p-house` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` immediately before the row (2026-11-04T04:34:23.384Z UTC): 7 farms, 8 products, 5 follows, 4 broadcasts, 16 thread messages; then the row setup below |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/` (`I3-DISC-05.json` + screenshots) |
| UTC | 2026-11-04T04:34:20.997Z – 04:34:28.754Z |
| Harness | `scripts/i3-discovery/run.mjs I3-DISC-05` |

**Setup:** no DB edit. `p-house` is AVAILABLE in the seed (current stage `st-house-1`, 5kg 29,000원, 80 boxes, 38 reserved). Pause and resume go through the producer API as `u-kang`: `PUT /api/products/p-house/sales-settings` with `salesPaused=true` (200, version 1→2) and later `false` (200, version 2→3); limit 2,400,000 g and max 3 per order unchanged.

**Steps:** Producer pauses; consumer reloads home, `/farms`, `/products/p-house` and A's room `/farms/f-kang`; producer resumes; consumer reloads `/products/p-house`.

**Expected (matrix):** A is not offered as saleable while paused; reserve remains disabled; follow and news room persist; resumed state uses current fixture price/stock

| Assertion | Observed while paused / after resume | Result |
| --- | --- | --- |
| A not offered as saleable while paused (AC-06-5, AC-07-3) | API knows it is paused (`availability=PAUSED`, `salesPaused=true`) but `soldOut=false`, so A stays the first card of home recommendations (`/api/home` and the UI product carousel) and is the featured product of 강씨네 귤밭 in the farm list (29,000원, D-5); no paused wording (일시 중지/판매 중지) anywhere in the home, farm list or product page text. The product page shows the normal option prices and ‘42박스 남음 · 마감 D-5’ instead of ‘판매 일시 중지’ | ✗ |
| Reserve remains disabled (AC-07-3) | 예약하기 enabled; clicking it opens the option sheet with ‘주문서로’ | ✗ |
| Follow and news room persist (AC-06-3) | Room button 팔로잉; `/api/farms/following` includes `f-kang`; room shows both f-kang news | ✓ |
| Resumed state uses current price/stock | After resume `availability=AVAILABLE`, current price 29,000원 = DB `stage_prices` (`st-house-1`, 5kg), page shows 29,000원 and ‘42박스 남음’ = DB 80 − 38; 예약하기 enabled | ✓ |

**Verdict: FAIL.**

**Defect (for a Linear issue):** a sale paused by the producer is still offered as saleable in the consumer app. Server: `card()` in `server/app/catalog/service.py` computes `sold_out` from the current stage's remaining boxes only and ignores `availability`, so a PAUSED product has `soldOut=false`; `home()` and `farm_cards()` in `server/app/farms/service.py` filter on `sold_out` only, so the paused product stays in home recommendations and as the farm's featured product. Client: `apps/consumer/src/app/(tabs)/products/[productId].tsx` disables 예약하기 only when `soldOut`, and `packages/ui/src/ProductPage.tsx` shows the availability label (‘판매 일시 중지’) only when `soldOut`. Contract: AC-07-3 (PAUSED/기간 공백/품절/종료를 구분하여 예약 버튼 제한) and FEAT-06 home/list ordering of saleable products. The shared mock (`packages/api/src/mock/derive.ts`) sets `soldOut = availability !== "AVAILABLE"`, so mock-based tests do not see this; only the real API path fails. Not exercised in this row: order creation, which the server rejects with `SALES_PAUSED` according to `server/app/orders/service.py` (code reading only).

**Trace:** `.artifacts/i3-journeys/i3-b2-87792b7/I3-DISC-05.json`, screenshots `I3-DISC-05-01…06-*.png` (`03-product-paused`, `04-product-paused-reserve-click`).

**Harness note:** a first attempt (04:33:18 UTC) did not pause anything — the sales-settings call was rejected with 400 (missing `Idempotency-Key` header in the harness) — so it was not a faithful run. Kept in `attempt1/`, not counted.
