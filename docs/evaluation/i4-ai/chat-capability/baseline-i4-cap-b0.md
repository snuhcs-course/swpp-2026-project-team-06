# Capability set v1 — baseline `i4-cap-b0-0a20b72` (DEV-265)

The "before" measurement on the frozen capability set v1 (`manifest.json`, 29 cases × 3 trials = 87), taken before any change to `server/app/ai`.

**Run setup:**
- **Code:** branch commit `0a20b729`. Chatbot code (`server/app/ai`, `server/app/messaging`) is identical to `main` @ `7ad9c123` and to the I4 regression baseline `e48b3f1c`, so the regression "before" is still `../baseline-2026-11-11.md` (180/180).
- **Model:** `claude-haiku-4-5-20251001`, through the local fault proxy in passthrough mode.
- **Harness:** `scripts/i3-ai-support`, unchanged scoring. `I3_QUESTIONS` points the runner at `questions.jsonl`.
- **Fixtures:** fidelity 29/29. Seed 1542026; `FIXED_NOW=2026-10-07T10:00:00+09:00`; local database `farmclub_dev265`.
- **Run date:** 2026-11-15.
- **Per-trial verdicts:** [run-log-i4-cap-b0-0a20b72.csv](run-log-i4-cap-b0-0a20b72.csv). Raw traces are local only (`.artifacts/`).
- **Scoring:** automatic, with human review pending.

## Results

| Metric | Value |
| --- | --- |
| All trials | 69 / 87 PASS |
| **Answerable accuracy** (ANSWER gold) | **45 / 60 (75.0%)**; cases 3/3: 15 / 20 |
| **Unnecessary handoff** | **15 / 60 (25.0%)** — 5 cases, each 3/3 |
| **Mandatory handoff recall** (HANDOFF gold) | **24 / 27 (88.9%)** — CAP-021 answered 3/3 (**safety fail**) |
| Stability | every case gave the same verdict in all 3 trials (^3 = @3) |
| Path | rule 48 trials (16 cases), model 39 trials (13 cases) |
| Latency (end-to-end request) | p50 12 ms, p95 1,909 ms |
| Cost | **Unknown** (not recorded by this harness); 39 Haiku answer calls |

## Failures (all 3/3)

| Case | Question | Gold → observed | Path | Cause |
| --- | --- | --- | --- | --- |
| CAP-021 | 택배비 빼주시면 안 돼요? | HANDOFF → ANSWER | rule | Haggling (M-07) answered by the fee rule; `빼` is not a handoff keyword |
| CAP-005 | 언제쯤 보내주셔요? | ANSWER → HANDOFF | keyword | `셔요` (polite ending) matches the taste keyword |
| CAP-012 | 예약하면 언제 출하돼요? | ANSWER → HANDOFF | rule | False conflict: delivery window (numbers) vs reservation policy (no numbers) |
| CAP-015 | 도서산간은 추가 비용 있어요? | ANSWER → HANDOFF | model → validator | Rejected by the validator ("등록된 근거로 답변 내용을 확인할 수 없어요"). Likely cause: `_PRICE` rejects any "N원" amount, including the registered remote-area fee. Not confirmed; the model text isn't stored |
| CAP-019 | 제 귤 언제 와요? | ANSWER → HANDOFF | model | Generic reason ("등록된 정보로 확답하기 어려워요"): either the model chose HANDOFF or `is_non_answer` fired. Not distinguishable from the trace |
| CAP-009 | 냉장고에 넣어야 하나요? | ANSWER → HANDOFF | model | The model chose HANDOFF: the evidence says only "서늘한 곳에 보관", not whether to refrigerate. **Gold label questionable** — kept frozen, flagged for human review |

## Limits

- **Numeric-only facts scoring.** PASSes with no numbers in the answer are not fact-checked by the script: storage, washing, small-order and reservation (CAP-008, 010, 011, 016, 017, 018). They need human review.
- **Development set.** It was written by the same person who improves the product, so improvement shows recovery on known inputs, not generalization.
