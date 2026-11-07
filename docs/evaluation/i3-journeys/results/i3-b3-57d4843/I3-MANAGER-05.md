# I3-MANAGER-05 — Approve and reject; AI switched off while a refund message commits (`i3-b3-57d4843`)

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (unchanged; `validate.py` PASS) |
| Execution issue | DEV-174 (I3-T14) |
| Executor / reviewer | Zahra Gholami with Claude Code (agent, scripted run) / Minsun Kim — review pending |
| Build / environment | app + API commit `57d4843` (`main`, #481), no product-code changes; local PostgreSQL 16, DB `farmclub_dev173`, Alembic `0025`; `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00:00+09:00`; Anthropic key loaded from the local environment and the API pointed at the DEV-169 fault proxy (`scripts/i3-ai-support/fault_proxy.py`, passthrough) to count model calls — none were made |
| URLs | API http://localhost:8173 |
| Layer | API — the same endpoints the producer/consumer apps and the admin page call; DB read only to count rows |
| Accounts / fixtures | operator `u-admin`; pending `f-wimi` and a second application by `u-new` (farm `f-015270ee28`); consumer `u-seojun` → `f-kang` (new thread, AUTO); producer `u-kang` |
| Fixture reset proof | `uv run python -m app.core.seed --reset` ("시드를 넣었어요.") immediately before the row, then `u-new` applied as a producer (second pending target) |
| Harness | `uv run python ../scripts/i3-journeys/order_manager.py` (all ten rows in one recorded run) |
| Harness dry runs | Before the recorded run the harness was debugged on the same stack (outside the planned denominator). Fixes were harness-only: `consentVersion` in the order body, producer-list paging (`limit` ≤ 50), an overdue date before the fixed clock, response field names, reading success audits with `status=SUCCEEDED`, and a new AUTO thread for MANAGER-05. Product observations did not differ. |
| Raw evidence (restricted, local) | `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-05.json` |
| UTC | 2026-11-06T11:09:08Z – 2026-11-06T11:09:09Z |
| Money | No transfer. Deposit confirmation is a simulated state action on isolated orders; `payments` rows are counted in the local DB only. |

**Steps:** Approve `f-wimi`; reject `f-015270ee28` with reason "연락처 확인 필요"; read both histories. Start `u-seojun`'s chat with `f-kang` (AUTO). Fire two requests at the same moment: the refund message "받은 귤이 상했는데 환불이나 보상 받을 수 있나요?" and the producer switching the thread to HUMAN, then AI settings OFF. Send a second refund message after the switch. Count model calls, AI messages and exceptions.

Pre-execution note: refund/compensation messages are always handed to the farm before any model call (M-07, `server/app/ai/service.py:215`), so there is no generation window to pause. The "while the refund message commits" race was run as two concurrent requests. In this run the switch committed first: message 1 was stored with `needsHuman` and no reply. The stale-answer path itself (DEV-201) is covered by I3-AIGUARD-04/05 in `i3-b2-e871acc`.

**Expected (matrix):** Each decision/history stays attached to correct target; exception appears exactly once despite AI mode; no stale AI reply; no shared production record mutated

| Assertion | Observed | Result |
| --- | --- | --- |
| `decisions_attached_to_correct_targets` | `f-wimi`: one `APPROVED` (`u-admin`); `f-015270ee28`: one `REJECTED`, reason "연락처 확인 필요"; no cross-over | ✓ |
| `started_auto_ended_human_off` | thread `AUTO` before, `HUMAN` after (version 2); farm AI settings `enabled` false (version 2) | ✓ |
| `exception_exactly_once_per_message` | two `manager_refund_request` events on `thread-kang-seojun`, one per message (`m-0a8769ddd3`, `m-8915d0ffb0`) | ✓ |
| `no_model_answer_for_refund` | model calls through the proxy: 0; message 1 reply `null` | ✓ |
| `no_ai_reply_after_switch` | message 2 reply `null`, `needsHuman` true; no AI message after it (the only AI message in the thread is the seeded `m-10` from 10/06) | ✓ |

Isolation: every write went to `farmclub_dev173`; no production or shared record was touched.

**Verdict: PASS.** Trace: `.artifacts/i3-journeys/i3-b3-57d4843/I3-MANAGER-05.json`.
