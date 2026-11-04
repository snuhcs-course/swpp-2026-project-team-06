# AIS-01 — Routine answerable questions

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (both unchanged) |
| Execution issue | DEV-167 (I3-T08) |
| Executor / reviewer | Hyun with Claude Code (agent: re-run, automatic score, then trace-by-trace review of every persisted answer) / human sign-off pending (Hyun); matrix reviewer: Minsun Kim |
| Build / environment | app commit `87792b7` (baseline `i3-b2-87792b7`; `server/app/ai/**` identical to DEV-169 cohort `3f7ce29`: prompt blob `192f5b1`, grounding blob `a957534`, config blob `3e811d9`; `server/app/messaging/**` differs by DEV-208/209/210), local `farmclub_i3_ais`, API `:8200`, `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout. Separate cohort from DEV-169 (`3f7ce29`); never pooled. |
| Runner | `scripts/i3-ai-support/run.py` unchanged (`run_trial` + `score`), called for the 30 DEV-167 cases only, schedule shuffled with seed 1542026; proxy `fault_proxy.py` unchanged in passthrough on `:8287` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 before the run. Each reply carries that trial's own saved settings version (62…151, +1 per trial in run order; DB `farm_ai_settings.version` = 151 after the last trial) |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b2-87792b7/` (gitignored) |
| Per-trial verdicts | `docs/evaluation/i3-ai-support/run-log-i3-b2-87792b7.csv` (rows of stratum `routine_answerable`) |
| UTC window | 2026-11-04T04:28:11+00:00 – 2026-11-04T04:30:00+00:00 (trial starts, all 90 DEV-167 trials) |

**Expected (matrix):** ANSWER with correct facts/units/qualifier, valid supplied sourceRefs, AI label, saved settings version and no safety violation

**Observed:** 30 / 30 / 30 trials passed (passed / attempted / planned); stable cases 10 / 10. Latency p50 13 ms, p95 16 ms (max 19 ms). **All 30 answers come from the rule path (`_rule_answer`); no model call** — this row does not exercise the model.

**Trace review (every trial, all three runs identical text):**

| Case | Persisted AI answer | Gold facts / refs | Review |
| --- | --- | --- | --- |
| CS-001 | 배송비는 3,500원이에요. | 3,500 KRW / `product:p-eval-citrus` | correct, unit 원 |
| CS-002 | 2026-11-10 ~ 2026-11-14에 받을 예정이에요. | window, not a guarantee / product | correct; "받을 예정" keeps it an expectation |
| CS-003 | 등록된 실측 당도는 12.4Brix예요. | measured 12.4 Brix / product | correct, says 실측 (measured) |
| CS-004 | 예상 당도는 10.5Brix이고 실측값은 아직 없어요. | expected 10.5, no measured / `product:p-eval-pear` | correct, says 예상 and that measured is absent (AC-13-3, M-15) |
| CS-005 | 서늘한 곳에 보관해 주세요. | cool place / `farm:faq` | correct |
| CS-006 | 먹기 전에 흐르는 물로 씻어 주세요. | running water before eating / `farm:faq` | correct |
| CS-007 | 1박스부터 주문할 수 있어요. | from one box / `farm:smallOrderPolicy` | correct |
| CS-008 | 예약 상품은 예약 기간 종료 후 순차 출하합니다. | sequential after period, no date / `farm:reservationShippingPolicy` | correct, no date promise |
| CS-009 | 2026-11-12 ~ 2026-11-15에 받을 예정이에요. | order window / `order:o-eval-1` | correct; the order window overrides the product window |
| CS-010 | 무료배송이에요. 도서산간은 추가 운임 5,000원이 붙어요. | free + 5,000 KRW remote / `product:p-eval-grape` | correct |

Every answer: `senderType=AI` (rendered with the "AI 안내" badge), exactly the gold source ref and no other ref, a non-null settings version equal to that trial's saved version, no unsupported number or date, no producer impersonation or personal data, no escalation, and the same message in the producer view. Note: the delivery-window answers show `근거: 확정 배송 기간` under the bubble; contracts-1.2 §5 allows the AI to state the "확정 배송 기간", and the body still says "예정", so it is not worded as a guarantee.

**Correction path (AC-13-5, '틀렸어요'):** reporting the run-1 answer of each case (`POST /api/messaging/chats/f-eval/messages/{id}/report`) returned 200, opened one `OPEN` producer question with `reportedMessageId`, set the producer `needsReply=true` and the message `reported=true` in 10/10 cases; a second report returned the same escalation (idempotent). Evidence `.artifacts/i3-ai-support/i3-b2-87792b7/correction-path.json`.

**Verdict: PASS.** Agrees with the DEV-169 cohort (`3f7ce29`, 30/30). Target ≥95% correct and supported routine answers: **met (100%)**; 100% claim support and correct refs: **met**.
