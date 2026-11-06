# DISC-03 — Search failure and retry (re-run on merged main after the DEV-214 fix)

This is a new run on merged `main`. It does not replace the original FAIL in `../i3-b2-87792b7/I3-DISC-03.md`.

| Field | Value |
| --- | --- |
| Requirement IDs | matrix v1.0 row: FEAT-06 AC-06-2. Current spec for the asserted behaviour: FEAT-06 E4, AC-06-7 (added by DEV-214 after the matrix freeze; AC-06-2 now covers variety search) |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged) |
| Execution issue | DEV-177 (I3-T20 regression); fix DEV-214 (PR #411, `cf8e972`) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run and automatic assertion check) / Minsun Kim (matrix reviewer) — review pending |
| Build / environment | app and API commit `57d4843` (main, #481; includes #411), baseline `i3-main-57d4843`, local PostgreSQL 16.15 DB `farmclub_i3rerun` (Alembic `0025`), API http://localhost:8177, consumer web http://localhost:8277 (Expo web, `EXPO_PUBLIC_API_MOCK=0`, real API; ports off the defaults), `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`, Chromium 156.0.8078.4 headless 390×844 ko-KR Asia/Seoul, Node 24.1.0, Playwright 1.64.0, AI / Kakao / payment keys blanked in `server/.env` for the run |
| Accounts / fixtures | consumer `u-minji`; farm A `f-halla` (seed, unchanged) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` immediately before the row (2026-11-06T11:37:17.787Z UTC): 7 farms, 8 products, 5 follows, 4 broadcasts, 16 thread messages |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-main-57d4843/` (`I3-DISC-03.json`, `I3-DISC-03-01-search-failed.png`, `I3-DISC-03-02-search-retried.png`) |
| UTC | 2026-11-06T11:37:15.804Z – 11:37:21.576Z |
| Harness | `I3_BASELINE=i3-main-57d4843 I3_DB=farmclub_i3rerun FARMCLUB_API_URL=http://localhost:8177 FARMCLUB_CONSUMER_URL=http://localhost:8277 node scripts/i3-discovery/run.mjs I3-DISC-03` (harness unchanged since the original run) |

**Setup and steps:** same as the original row. No fixture mutation. A Playwright route answers the first `GET /api/farms?…q=…` with HTTP 503; later search requests pass through. Search term 한라네 (`GET /api/farms?q=한라네` → `[f-halla]`). Log in as `u-minji`, open `/farms`, type 한라네 (request fails), press ‘다시 시도’.

**Expected (matrix):** Failure is visible and does not masquerade as zero results; successful retry returns A without duplicate cards

| Assertion | Observed | Result |
| --- | --- | --- |
| Failure is visible | Error box under the search field: ‘‘한라네’ 검색 결과를 불러오지 못했어요 / 잠시 뒤 다시 시도해 주세요. 아래는 이전 목록이에요.’ with one ‘다시 시도’ button; the kept list is labelled ‘이전 목록 · 농가 4곳’ (no ‘마감 임박순 · 농가 4곳’ header under the new query) | ✓ |
| Does not masquerade as zero results | ‘찾는 농가가 없어요’ not shown | ✓ |
| Retry returns A without duplicate cards | Retry request 200; screen shows one card, 한라네 과수원, header ‘마감 임박순 · 농가 1곳’; matches API `q=한라네` → `[f-halla]`; 2 search requests in total | ✓ |

**Verdict: PASS.** Console: one `Failed to load resource … 503` line, which is the injected fault itself; no duplicate-key warning (the original run had `Encountered two children with the same key`).
