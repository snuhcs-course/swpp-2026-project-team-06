# DISC-01 — Discovery order, cultivar search and farm/product identity

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-166 (I3-T04) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run and automatic assertion check) / Minsun Kim (matrix reviewer) — review pending |
| Build / environment | app and API commit `87792b7` (main, #388), baseline `i3-b2-87792b7` (DEV-165 procedure on this commit), local `farmclub_i3_disc` (Alembic `0025`), API http://localhost:8000, consumer web http://localhost:8081 (Expo web, real API), `FIXED_NOW=2026-10-07T10:00+09:00`, Chromium 156.0.8078.4 headless 390×844 ko-KR Asia/Seoul, no AI or other provider keys in `server/.env` |
| Accounts / fixtures | consumer `u-minji`; farm A `f-halla` / product A `p-noji`; farm B `f-hyodon` / product B `p-hyodon` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` immediately before the row (2026-11-04T04:33:59.892Z UTC): 7 farms, 8 products, 5 follows, 4 broadcasts, 16 thread messages; then the row setup below |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/` (`I3-DISC-01.json` + screenshots) |
| UTC | 2026-11-04T04:33:57.136Z – 04:34:03.397Z |
| Harness | `scripts/i3-discovery/run.mjs I3-DISC-01` |

**Setup (local DB only):** A gets cultivar 한라봉 (`farms.main_items='한라봉'` for `f-halla`; `p-noji` variety `한라봉`, name `한라봉 10kg`); A's current stage `st-noji-1` ends 2026-10-08 (tomorrow, next stage from 10-09); B's current stage `st-hyodon-1` ends 2026-10-14 (next week, next stage from 10-15). `p-house` (`f-kang`, ends 10-12) stays as seeded.

**Steps:** Log in as `u-minji`; open home; open the farm list (`/farms`); type 한라봉 in 농가 검색; open A from the result; open product A from the farm room shelf.

**Expected (matrix):** A precedes B in farm and recommendation lists; search finds A; farm/product identity, current price and period agree

| Assertion | Observed | Result |
| --- | --- | --- |
| Home recommendations: A before B (AC-06-4) | UI order `한라봉 10kg` (0) › `하우스 감귤 5kg / 10kg` › `하우스 감귤 3kg` (2); `/api/home` order `p-noji` (D-1) › `p-house` (D-5) › `p-hyodon` (D-7) | ✓ |
| Farm list: A above B (AC-06-1) | UI order 한라네 과수원 › 강씨네 귤밭 › 효돈 하우스농원 › 남원 귤빛농원; `/api/farms` same order | ✓ |
| Search 한라봉 finds only A (AC-06-2) | `GET /api/farms?q=한라봉` 200 → `[f-halla]`; UI shows only 한라네 과수원 | ✓ |
| Identity, price, period agree | Home card, farm card (featured), farm detail and product detail all `f-halla` / `p-noji` / `한라봉 10kg`, current price 24,000원 = DB `stage_prices` for `st-noji-1`, stage end 2026-10-08 (D-1), delivery 2026-12-01–12-15; product page shows 한라봉 10kg, 한라네 과수원, 24,000원, 마감 D-1 | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-DISC-01.json`, screenshots `I3-DISC-01-01…05-*.png`.

**Observation outside the planned denominator (candidate defect, not part of this verdict):** the search matched A through the farm's 주 품목 and the product name. A cultivar stored only in the product's `variety` is not searched: in the same run `GET /api/farms?q=궁천조생` returned `[]` although published `p-house` and `p-hyodon` both have variety 궁천조생. FEAT-06 says the search matches 농가명·품종·지역; `search_farms` in `server/app/farms/service.py` builds its haystack from farm name, region, `main_items` and product names only.

**Harness note:** the first scripted attempt (04:32:21 UTC) stopped at "open A" on a locator that matched the hidden previous screen (harness error, no product observation); its first three assertions matched this run. Kept in `attempt1/`, not counted.
