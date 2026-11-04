# DISC-04 — Follow failure, retry, reload, unfollow and refollow

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-166 (I3-T04) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run and automatic assertion check) / Minsun Kim (matrix reviewer) — review pending |
| Build / environment | app and API commit `87792b7` (main, #388), baseline `i3-b2-87792b7` (DEV-165 procedure on this commit), local `farmclub_i3_disc` (Alembic `0025`), API http://localhost:8000, consumer web http://localhost:8081 (Expo web, real API), `FIXED_NOW=2026-10-07T10:00+09:00`, Chromium 156.0.8078.4 headless 390×844 ko-KR Asia/Seoul, no AI or other provider keys in `server/.env` |
| Accounts / fixtures | consumer `u-minji`; farm A `f-halla` with public news `n-3` and seeded 1:1 thread `thread-halla-minji` (`m-6` consumer, `m-7` AI) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` immediately before the row (2026-11-04T04:34:11.551Z UTC): 7 farms, 8 products, 5 follows, 4 broadcasts, 16 thread messages; then the row setup below |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/` (`I3-DISC-04.json` + screenshots) |
| UTC | 2026-11-04T04:34:09.140Z – 04:34:20.997Z |
| Harness | `scripts/i3-discovery/run.mjs I3-DISC-04` |

**Setup (local DB only):** `delete from follows where consumer_id='u-minji' and farm_id='f-halla'` (not following A; the earlier 1:1 thread stays). Fault hook: a Playwright route aborts the **first** `PUT /api/farms/f-halla/follow` in the browser (`net::ERR_FAILED`) before it reaches the API, so nothing is committed.

**Steps:** Log in; open A's room `/farms/f-halla`; click 팔로우 (fails); click again; reload the room; open 내 정보 and 채팅 › 소식방; back in A's room click 팔로잉 (unfollow) then 팔로우 (refollow); open 채팅 › 1:1 and A's 1:1 chat.

**Expected (matrix):** Failure visible; exactly one relation after successful retry; button/list/news room agree after reload; prior private chat retained after refollow

| Assertion | Observed | Result |
| --- | --- | --- |
| Failure visible, no relation | Button stays 팔로우, message ‘인터넷 연결을 확인하고 다시 시도해 주세요.’, `follows` rows for (u-minji, f-halla) = 0 | ✓ |
| Exactly one relation after retry (AC-06-3) | `PUT …/follow` 200, button 팔로잉, rows = 1 | ✓ |
| Button / list / news room agree after reload (AC-06-3) | After reload button 팔로잉; 내 정보 ‘팔로우한 농가’ lists 한라네 과수원; 채팅 › 소식방 lists 한라네 과수원; A's room shows news `n-3`; `/api/farms/following` = `[f-halla, f-hyodon, f-kang]` | ✓ |
| Prior private chat retained after refollow (FEAT-12 E4) | Unfollow `DELETE` 200 → rows 0; refollow `PUT` 200 → rows 1; thread messages before and after `m-6`, `m-7` (same IDs, API and DB); 1:1 list shows 한라네 과수원; A's 1:1 chat shows both earlier messages | ✓ |
| 1:1 chat has no news (AC-12-5) | News `n-3` body not in A's 1:1 chat | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-DISC-04.json`, screenshots `I3-DISC-04-01…06-*.png`.

**Harness note:** a first attempt (04:33:09 UTC) stopped at the unfollow step on an ambiguous button locator (harness error); its first three assertions matched this run. Kept in `attempt1/`, not counted.
