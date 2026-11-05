# DISC-02 — No saleable products and a sold-out product

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` |
| Execution issue | DEV-166 (I3-T04) |
| Executor / reviewer | Hyun with Claude Code (agent, scripted run and automatic assertion check) / Minsun Kim (matrix reviewer) — review pending |
| Build / environment | app and API commit `87792b7` (main, #388), baseline `i3-b2-87792b7` (DEV-165 procedure on this commit), local `farmclub_i3_disc` (Alembic `0025`), API http://localhost:8000, consumer web http://localhost:8081 (Expo web, real API), `FIXED_NOW=2026-10-07T10:00+09:00`, Chromium 156.0.8078.4 headless 390×844 ko-KR Asia/Seoul, no AI or other provider keys in `server/.env` |
| Accounts / fixtures | consumer `u-minji`; sold-out product `p-noji` (`f-halla`) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` immediately before the row (2026-11-04T04:33:01.606Z UTC): 7 farms, 8 products, 5 follows, 4 broadcasts, 16 thread messages; then the row setup below |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b2-87792b7/` (`I3-DISC-02.json` + screenshots) |
| UTC | 2026-11-04T04:32:58.569Z – 04:33:03.869Z |
| Harness | `scripts/i3-discovery/run.mjs I3-DISC-02` |

**Setup (local DB only):** the other published products `p-house`, `p-hyodon`, `p-redhyang` set to `CLOSED` (sale ended), so nothing is saleable; `p-noji` sold out in its current stage (`st-noji-1` allocation 40/40 reserved), next stage `st-noji-2` from 2026-10-26 (0/40).

**Steps:** Log in as `u-minji`; open home; open `/products/p-noji`.

**Expected (matrix):** Home shows no-saleable message while news remains; product distinguishes sold out and shows next-stage date; reserve disabled

| Assertion | Observed | Result |
| --- | --- | --- |
| Home shows ‘현재 예약 가능한 상품이 없어요’ (AC-06-5) | `/api/home` recommended = 0; message shown | ✓ |
| News list remains (AC-06-5) | Public news `n-2`, `n-3`, `n-4` from the home farms; news carousel rendered (no ‘첫 소식을 기다려요’, no load error) | ✓ |
| Product distinguishes sold out (AC-07-1, AC-07-3) | API `availability=PERIOD_SOLD_OUT`, `soldOut=true`; page shows ‘이번 기간 품절’ | ✓ |
| Next-stage start date shown (AC-07-1) | `nextStageStartsAt=2026-10-26`; page shows ‘다음 예약은 10월 26일에 열려요.’ | ✓ |
| Reserve disabled | 예약하기 disabled | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b2-87792b7/I3-DISC-02.json`, screenshots `I3-DISC-02-01-home-no-saleable.png`, `I3-DISC-02-02-product-sold-out.png`.
