# DISC-05 — Sale paused and resumed (re-run after the DEV-215 fix)

This is a new run on the DEV-215 branch. It does not replace the original FAIL in `../i3-b2-87792b7/I3-DISC-05.md`.

| Field | Value |
| --- | --- |
| Execution issue | DEV-215 (fix for the I3-DISC-05 defect, DEV-166 / I3-T04) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run and automatic assertion check) / review pending |
| Build / environment | app and API commit `0842d0b` (branch `nemodleo/dev-215-paused-product-visibility`, PR #410), baseline `i3-dev215-0842d0b`, local `farmclub_dev215` (Alembic `0025`), API http://localhost:8010, consumer web http://localhost:8091 (Expo web, real API; ports moved off 8000/8081 because another local worktree held them), `FIXED_NOW=2026-10-07T10:00+09:00`, Chromium 156.0.8078.4 headless 390×844 ko-KR Asia/Seoul, no AI or other provider keys in `server/.env` |
| Accounts / fixtures | consumer `u-minji` (follows `f-kang` in the seed); producer `u-kang`; farm A `f-kang` / product A `p-house` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` immediately before the row (2026-11-04T08:35:18.534Z UTC): 7 farms, 8 products, 5 follows, 4 broadcasts, 16 thread messages |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-dev215-0842d0b/` (`I3-DISC-05.json` + 5 screenshots) |
| UTC | 2026-11-04T08:35:15.719Z – 08:35:25.175Z |
| Harness | `I3_BASELINE=i3-dev215-0842d0b I3_DB=farmclub_dev215 FARMCLUB_API_URL=http://localhost:8010 FARMCLUB_CONSUMER_URL=http://localhost:8091 node scripts/i3-discovery/run.mjs I3-DISC-05` |

**Setup and steps:** same as the original row. Pause and resume go through `PUT /api/products/p-house/sales-settings` as `u-kang` (200, version 1→2, then 2→3).

| Assertion | Observed while paused / after resume | Result |
| --- | --- | --- |
| A not offered as saleable while paused (AC-06-5, AC-07-3) | `p-house` absent from `/api/home` recommendations and from the home product carousel; 강씨네 귤밭 has no featured product in `/api/farms`; product page shows ‘판매 일시 중지’ (`availability=PAUSED`, `soldOut=true`) | ✓ |
| Reserve remains disabled (AC-07-3) | 예약하기 disabled; clicking it opens no option sheet | ✓ |
| Follow and news room persist (AC-06-3) | Room button 팔로잉; `/api/farms/following` includes `f-kang`; room shows both f-kang news | ✓ |
| Resumed state uses current price/stock | After resume `availability=AVAILABLE`, 29,000원 = DB `stage_prices`, ‘42박스 남음’ = DB 80 − 38; 예약하기 enabled | ✓ |

**Verdict: PASS.** No console errors.
