# I3-MANAGER-03 — Non-admin tokens and invalid targets (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-174 (I3-T14) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Minsun Kim — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | producer `u-kang`, consumer `u-minji`, no token, operator `u-admin`; targets `f-wimi` (pending), `f-halla` (approved farm B), capacity request `capacity-p-cheonggyeon`, order `o-g6` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, fixtures used as seeded |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-03.json` |
| UTC | 2026-11-06T11:09:07Z – 2026-11-06T11:09:07Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** With the producer and the consumer token, call seven admin routes each (three reads: producer applications, exception queue, overdue deposits; four mutations: approve, reject, capacity approve, mark delivered). Call the exception queue with no token. As the operator, approve an unknown farm, reject without a reason, and approve the already-approved farm B. Check the targets afterwards.

**Expected (matrix):** Non-admin requests forbidden server-side; no target mutation; admin validation rejects invalid request with audit-safe error

| Assertion | Observed | Result |
| --- | --- | --- |
| `non_admin_forbidden` | all 14 producer/consumer calls → **403** `FORBIDDEN` "볼 수 없는 화면이에요."; no token → **401** `UNAUTHENTICATED` | ✓ |
| `no_target_mutation` | `f-wimi` still `PENDING` with 0 decisions; `o-g6` still `SHIPPED` | ✓ |
| `invalid_target_rejected_safely` | unknown farm → **404** `NOT_FOUND`; empty reason → **400** `VALIDATION_ERROR` (`reason`); approved farm B → **409** `INVALID_TRANSITION` "대기 중인 신청만 처리할 수 있어요." — short coded messages, no stack trace or internal data | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-03.json`.
