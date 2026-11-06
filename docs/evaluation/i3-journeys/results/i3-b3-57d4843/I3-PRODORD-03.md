# I3-PRODORD-03 — Rejection without reason and over-long tracking number (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-173 (I3-T13) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Hyun — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API (status code and field message the producer app shows). The producer app screens were not driven for this row |
| Accounts / fixtures | consumer `u-minji`, producer `u-kang`, seeded PREPARING order `o-40` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, then `u-minji` placed `o-8b637539f8` (`AWAITING_DEPOSIT`) |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-03.json` |
| UTC | 2026-11-06T11:09:03Z – 2026-11-06T11:09:04Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** Reject the deposit of `o-8b637539f8` with an empty reason and with a blank reason. Ship `o-40` with a 51-character tracking number. Check both orders and the producer list. Then correct both on the same rows: reject with a reason (keep awaiting) and ship with a 12-digit tracking number.

**Expected (matrix):** Validation error shown for both actions; neither order changes; current rows remain available for correction

| Assertion | Observed | Result |
| --- | --- | --- |
| `empty_reason_rejected` | empty reason → **400** `VALIDATION_ERROR` (`reason`: at least 1 character); blank reason → **400** (`reason`: "사유를 적어 주세요") | ✓ |
| `long_tracking_rejected` | 51 characters → **400** `VALIDATION_ERROR` (`trackingNumber`: at most 50 characters) | ✓ |
| `neither_order_changed` | `o-8b637539f8` `AWAITING_DEPOSIT`, no issue text; `o-40` `PREPARING`, no tracking — identical before and after the errors | ✓ |
| `rows_still_listed_for_correction` | both rows still in the producer list with the same status | ✓ |
| `correction_succeeds` | reject with reason → 200, `o-8b637539f8` stays `AWAITING_DEPOSIT` with the reason; ship → 200 `SHIPPED`, tracking `123456789012` | ✓ |

**Verdict: PASS** (API layer). How the producer app displays the 400 message was not checked in this row. Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-PRODORD-03.json`.
