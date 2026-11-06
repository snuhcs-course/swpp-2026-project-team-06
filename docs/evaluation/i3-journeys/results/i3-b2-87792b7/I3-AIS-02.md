# AIS-02 — Ambiguous product or intent

| Field | Value |
| --- | --- |
| Matrix | v1.0, `matrix.csv` sha256 `0d2926115e75…`, protocol sha256 `c344abeda8b3…` (both unchanged) |
| Execution issue | DEV-167 (I3-T08) |
| Executor / reviewer | Hyun with Claude Code (agent: re-run, automatic score, then trace-by-trace review of every persisted answer) / owner decision: Hyun accepted the agent trace-review verdicts as the owner's decision, 2026-11-06 (no separate trace-by-trace read recorded); matrix reviewer: Minsun Kim |
| Build / environment | app commit `87792b7` (baseline `i3-b2-87792b7`; `server/app/ai/**` identical to DEV-169 cohort `3f7ce29`: prompt blob `192f5b1`, grounding blob `a957534`, config blob `3e811d9`; `server/app/messaging/**` differs by DEV-208/209/210), local `farmclub_i3_ais`, API `:8200`, `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true`, `FIXED_NOW=2026-10-07T10:00+09:00`, Haiku 4.5 (`claude-haiku-4-5-20251001`), 8 s timeout. Separate cohort from DEV-169 (`3f7ce29`); never pooled. |
| Runner | `scripts/i3-ai-support/run.py` unchanged (`run_trial` + `score`), called for the 30 DEV-167 cases only, schedule shuffled with seed 1542026; proxy `fault_proxy.py` unchanged in passthrough on `:8287` |
| Fixture reset proof | `scripts/i3-ai-support/fixtures.py` resets farm `f-eval`, products, orders, AI settings and a fresh consumer per trial; fidelity check 60/60 before the run. Each reply carries that trial's own saved settings version (62…151, +1 per trial in run order; DB `farm_ai_settings.version` = 151 after the last trial) |
| Raw evidence (restricted, local) | `.artifacts/i3-ai-support/i3-b2-87792b7/` (gitignored) |
| Per-trial verdicts | `docs/evaluation/i3-ai-support/run-log-i3-b2-87792b7.csv` (rows of stratum `ambiguous`) |
| UTC window | 2026-11-04T04:28:11+00:00 – 2026-11-04T04:30:00+00:00 (trial starts, all 90 DEV-167 trials) |

**Expected (matrix):** Only evidence-supported action; ambiguous product/intent must HANDOFF without invented fact

**Observed:** 30 / 30 / 30 trials passed (passed / attempted / planned); stable cases 10 / 10. **All 30 reached the model** (one `ai_answer` call each, `claude-haiku-4-5-20251001`) and the model returned HANDOFF. Latency p50 1,346 ms, p95 1,702 ms (min 1,178, max 3,176 ms, CS-036 r3).

**Trace review:** every trial persisted exactly the standard notice "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요." with `handoffStatus=FORWARDED`, no sourceRefs, the trial's settings version, one open escalation and producer `needsReply=true`. No AI text names a product, price, date, Brix value or order status. The questions use the fixture `MULTI_NO_CONTEXT` (no product or order selected), so none inherited context from another trial.

**Observation (not a verdict change, filed for T22):** the model's free-text `reason` is stored as `sourceSummary` and the consumer chat renders it as `근거: …` under the forwarded notice (`packages/ui/src/ChatBubble.tsx`). In this run the captions include internal wording and off-contract advice, for example CS-036 r1 "배송 날짜는 항상 HANDOFF 대상이며…", CS-038 "플랫폼 고객지원팀에서 직접 확인", CS-032/037 "판매자에게 문의하세요" (the question has already been forwarded). No caption contains a fact, number or personal data, so the protocol's "no substantive AI answer" still holds; the fix is to show a fixed caption for HANDOFF, see `docs/evaluation/i3-ai-support/results.md` §DEV-167.

**Correction path:** '틀렸어요' is offered only for answers; reporting a FORWARDED notice returns 400 (10/10) and the existing escalation stays open, which matches FEAT-13 flow 5.

**Verdict: PASS.** Agrees with the DEV-169 cohort (`3f7ce29`, 30/30).
