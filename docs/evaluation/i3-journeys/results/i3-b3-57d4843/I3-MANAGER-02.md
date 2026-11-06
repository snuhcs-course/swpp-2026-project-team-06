# I3-MANAGER-02 — Similar targets reviewed by ID; empty history (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-174 (I3-T14) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Minsun Kim — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | operator `u-admin`; farm A `f-kang` (`하우스 감귤 5kg / 10kg`) and farm `f-hyodon` (`하우스 감귤 3kg`) — similarly named products; `f-wimi` (no decisions yet) |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, fixtures used as seeded |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-02.json` |
| UTC | 2026-11-06T11:09:06Z – 2026-11-06T11:09:07Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** Open the admin preview of each farm by ID, read each farm's decision history, read the history of a target with no decisions and of an unknown ID, and list all capacity requests.

**Expected (matrix):** No cross-target action or data; empty history explicitly shown; if UI/API cannot retrieve it, BLOCKED with proof rather than PASS

| Assertion | Observed | Result |
| --- | --- | --- |
| `fixture_has_similar_names_on_both_farms` | `p-house` (`f-kang`) "하우스 감귤 5kg / 10kg" and `p-hyodon` (`f-hyodon`) "하우스 감귤 3kg" | ✓ |
| `preview_returns_requested_target_only` | `/admin/farms/f-kang/preview` → `f-kang` / `u-kang` (open orders 37); `/admin/farms/f-hyodon/preview` → `f-hyodon` / `u-hyodon` (no open orders) — matches the DB owners | ✓ |
| `history_only_own_farm` | both histories empty (seeded approvals have no decision rows); nothing from the other farm | ✓ |
| `empty_history_explicit` | `GET /admin/producers/f-wimi/decisions` → **200** `[]`; the admin page renders an empty list as "결정 이력이 없어요." (`scripts/admin-web/api/_views/producers.html:104`); unknown `f-nope` → 404 "신청 농가를 찾을 수 없어요." | ✓ |
| `capacity_rows_match_product_farm` | the one capacity request (`p-cheonggyeon`) is labelled with its owning farm `f-kang` | ✓ |

**Verdict: PASS.** The empty-history text was checked in the admin page source, not rendered in a browser. Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-02.json`.
