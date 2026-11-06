# I3-MANAGER-04 — Repeated approval and replayed refund message (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-174 (I3-T14) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Minsun Kim — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | operator `u-admin`, pending capacity request `capacity-p-cheonggyeon` (`p-cheonggyeon`, version 1), consumer `u-minji` → `f-kang` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, fixtures used as seeded (no manager events) |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-04.json` |
| UTC | 2026-11-06T11:09:07Z – 2026-11-06T11:09:08Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** Approve the capacity request with an `Idempotency-Key`, then send the same request with the same key, as a client would after losing the response. Then send the refund message "상품이 상해서 환불해 주세요" and replay it with the same key. Count manager events and messages. Extra step outside the matrix: repeat the approval with a new key.

**Expected (matrix):** Only one approval transition/history item and one manager exception event; cached replay creates no duplicate

| Assertion | Observed | Result |
| --- | --- | --- |
| `approve_replay_same_result` | first **200** `APPROVED`; same-key replay **200** with an identical body | ✓ |
| `replay_adds_no_audit_record` | after the replay: one `capacity.approve` audit record, `SUCCEEDED` | ✓ |
| `one_approval_transition` | one `SUCCEEDED` transition in total. Extra new-key repeat → **409** `STALE_VERSION`, audited as one `REJECTED` event (a refused attempt, no second transition) | ✓ |
| `message_replay_same_result` | send **200** and replay **200** return the same `messageId` and sequence | ✓ |
| `one_message_one_exception` | the text appears once in the thread; one `manager_refund_request` event | ✓ |

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-04.json`.
