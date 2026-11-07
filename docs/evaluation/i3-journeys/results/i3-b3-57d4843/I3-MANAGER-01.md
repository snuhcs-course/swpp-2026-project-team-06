# I3-MANAGER-01 — Approve the right target; history and refund exception (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-174 (I3-T14) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Minsun Kim — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded and the API pointed at the DEV-169 fault proxy (passthrough) for the whole run, but this row makes no model call; no Kakao or analytics keys |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | operator `u-admin` (local token), pending application `f-wimi` (`u-misook`), consumer `u-minji` → farm `f-kang` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, fixtures used as seeded (`f-wimi` `PENDING`, no manager events) |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-01.json` |
| UTC | 2026-11-06T11:09:06Z – 2026-11-06T11:09:06Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** Approve `f-wimi`. Read its decision history, the application list and the success audit (`GET /admin/exceptions?status=SUCCEEDED&type=producer.approve`). `u-minji` sends a refund request in the `f-kang` chat ("상품이 상해서 환불해 주세요"). Read the exception queue (`GET /admin/exceptions`, default OPEN/FAILED) and the exception detail.

**Expected (matrix):** Target state changes once; actor/time/reason history retrievable; refund exception references correct synthetic thread without message body or consumer PII

| Assertion | Observed | Result |
| --- | --- | --- |
| `approved_once` | approve **200** `APPROVED`; `producer_decisions` rows for `f-wimi` 0 → 1 | ✓ |
| `farm_status_approved` | application list shows `f-wimi` `APPROVED`; other farms unchanged | ✓ |
| `history_actor_time` | one decision: `APPROVED`, `managerId` `u-admin`, `decidedAt` 2026-10-07T01:00Z. Reason is `null` — approvals carry no reason; rejections do (see MANAGER-05) | ✓ |
| `approve_audit_event_once` | one `producer.approve` audit record for `f-wimi`, actor `u-admin`, `SUCCEEDED` | ✓ |
| `refund_exception_one_correct_thread` | one OPEN `manager_refund_request`: `targetType` thread, `targetId` `thread-kang-minji` (the sending thread), `messageId` = the sent message | ✓ |
| `no_body_or_consumer_pii` | exception detail holds only IDs and `{{"farmId": "f-kang", "category": "refund_or_compensation"}}`; no message text, name, phone or address. (The seeded thread ID contains the user ID slug `minji` — an internal ID, not a personal value) | ✓ |

Note: the admin page (`scripts/admin-web`) shows producer decision history but not the exception queue; the queue is read through the operator API (Swagger), as planned for I1–I2.

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-01.json`.
