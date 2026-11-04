# DISC-03 — Search failure and retry

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-166 (I3-T04) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run and automatic assertion check) / Minsun Kim (matrix reviewer) — review pending |
| Build / environment | app and API commit `87792b7` (main, #388), baseline `i3-b2-87792b7` (DEV-165 procedure on this commit), local `farmclub_i3_disc` (Alembic `0025`), API http://localhost:8000, consumer web http://localhost:8081 (Expo web, real API), `FIXED_NOW=2026-10-07T10:00+09:00`, Chromium 156.0.8078.4 headless 390×844 ko-KR Asia/Seoul, no AI or other provider keys in `server/.env` |
| Accounts / fixtures | consumer `u-minji`; farm A `f-halla` (seed, unchanged) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` immediately before the row (2026-11-04T04:34:05.995Z UTC): 7 farms, 8 products, 5 follows, 4 broadcasts, 16 thread messages; then the row setup below |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/` (`I3-DISC-03.json` + screenshots) |
| UTC | 2026-11-04T04:34:03.397Z – 04:34:09.140Z |
| Harness | `scripts/i3-discovery/run.mjs I3-DISC-03` |

**Setup:** no fixture mutation. Fault hook: a Playwright route answers the **first** `GET /api/farms?…q=…` from the browser with HTTP 503 (`{"code":"UNAVAILABLE"}`); the request never reaches the API. Later search requests pass through. Search term 한라네 (farm A's name; `GET /api/farms?q=한라네` → `[f-halla]`).

**Steps:** Log in as `u-minji`; open `/farms` (full list loads, 4 farms); type 한라네 in 농가 검색 (request fails); retry with the only retry control on screen (‘다시 시도’).

**Expected (matrix):** Failure is visible and does not masquerade as zero results; successful retry returns A without duplicate cards

| Assertion | Observed | Result |
| --- | --- | --- |
| Failure is visible | No error message. The previous, unfiltered list stays on screen under the query 한라네 with the header ‘마감 임박순 · 농가 4곳’ (강씨네 귤밭, 효돈 하우스농원, 한라네 과수원, 남원 귤빛농원); only a bare text button ‘다시 시도’ below the last card hints at a problem | ✗ |
| Does not masquerade as zero results | ‘찾는 농가가 없어요’ not shown (but see above: it masquerades as a 4-farm result) | ✓ |
| Retry returns A without duplicate cards | Retry request 200 → `[f-halla]`, but the screen shows 5 cards: the 4 stale cards plus 한라네 과수원 appended again, header ‘마감 임박순 · 농가 5곳’; console `Encountered two children with the same key` | ✗ |

**Verdict: FAIL.**

**Defect (for a Linear issue):** consumer farm list search error handling, `apps/consumer/src/app/(tabs)/farms/index.tsx` `FarmList`. When a search request fails after a list is already loaded, `load()` keeps the old `items`, and the error state is only rendered when `items` is empty (`error && !items`), so the user sees the unfiltered list as if it were the result for the new query, with no message. The ‘다시 시도’ button calls `load(false)` (append/pagination mode), so the retried search result is appended to the stale list: A appears twice and the count is wrong. Contract: FEAT-06 search shows matching farms only (AC-06-2) and the matrix requires a visible failure and a duplicate-free retry. Expected fix direction: clear or mark the list on a failed new query, show an error message, and retry the failed query with reset.

**Trace:** `.artifacts/i3-journeys/i3-b2-87792b7/I3-DISC-03.json`, screenshots `I3-DISC-03-01-search-failed.png`, `I3-DISC-03-02-search-retried.png`.

**Harness note:** a first attempt (04:33:03 UTC) used the term 한라봉, which matches nothing in the unmutated seed, so it could not test "search for A"; it showed the same missing failure message and stale 4-farm list. Kept in `attempt1/`, not counted.
