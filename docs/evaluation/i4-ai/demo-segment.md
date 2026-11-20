# I4 AI demo segment — chat answers and draft filling (DEV-282)

Owner: Zahra Gholami. Related: DEV-273 (team demo, PM compiles 11/19), DEV-265 (chat), DEV-264 (draft filling).

This is a silent, captioned, automated recording of the two AI features I improved in I4. It runs on the real local FastAPI/PostgreSQL server with the real consumer and producer web apps, synthetic seed accounts and **no model calls**. It is technical evidence, not a participant or acceptance session.

## What the recording shows

| Scene | What happens on screen | What it demonstrates | Measured I4 change (from the evaluation docs, not from this recording) |
| --- | --- | --- | --- |
| 01 Chat — delivery | Consumer asks “언제쯤 보내주셔요?” in the farm chat | Answered at once with the registered delivery window and its source (“근거: 확정 배송 기간”) | Before DEV-265 this phrasing was handed to the farmer (CAP-005, 0/3 → 3/3) |
| 01 Chat — sweetness | “얼마나 달아요?” | Answered with the registered measured Brix (11.8), no taste judgement | CAP-031, 0/3 → 3/3 |
| 01 Chat — haggling | “택배비 빼주시면 안 돼요?” | No AI answer; the farmer is asked to reply (M-07) | Before DEV-265 the AI answered this (CAP-021, unsafe 0/3 → handed off 3/3) |
| 02 Draft filling — left out | Producer pastes a farm text with price, return fee, support hours, a delivery period and a health claim, then taps “AI로 채우기” | The editor lists the five left-out phrases by reason (금액, 팜클럽 정책, 건강 효능, 기간) | — |
| 02 Draft filling — filled | The draft editor after analysis | Product name, taste, composition and delivery are filled with wording from the source; none of the left-out text appears | — |

Chat totals (DEV-265, [results-2026-11-15.md](chat-capability/results-2026-11-15.md), PR #591, merged): answerable accuracy 75.0% → **98.3%**, mandatory handoff 88.9% → **100%**, unnecessary handoff 25.0% → 1.7%, I3 regression set 180/180 kept.

Draft-filling totals (DEV-264, [draft-results-2026-11-18.md](draft-results-2026-11-18.md), PR #637, merged), 24 public development sources, two-run mean: facts 60.2% → **67.7%**, critical facts 64.2% → **75.4%**, sources fully read 22 → 24 of 24. The 95% fact pass line is **not met**, and forbidden content was 0 in one run and 1 in the other (not stable). Holdout v2 (PR #661, not yet merged) scored 56.0% facts, 75.8% critical, forbidden 3, unsupported 2. Safety follow-ups are DEV-355 (in progress, not in this recording).

## Limits — say these when presenting

- **Draft filling uses the local mock analyser** (`SOURCE_ANALYSIS_PROVIDER=mock`). The extracted candidates and the stage-2 grouping are fixed mock steps, not real model output. The mock stage 2 sorts the left-out phrases with the same safety-check functions the server validator uses (`server/app/source_analysis/text_safety.py`); with a real model, the server validator is what drops unsafe text the model keeps. The editor, the left-out list screen and the saved draft are the real code.
- **Chat makes no model call.** All three questions are handled by the rule step or the mandatory-handoff rule. Questions that need the model (Claude Haiku 4.5) are not shown. `ANTHROPIC_API_KEY` is set to an invalid placeholder for the run, so an unexpected model call would fail instead of costing money.
- The code is `main` at the recorded commit. DEV-355 code checks and the stage-2 model trial are not in it.
- Synthetic seed accounts (이서준, 강영수/강씨네 귤밭), `FIXED_NOW=2026-10-07`. Login happens in a separate tab and is not in the video.
- No participant observations, comprehension results or acceptance decision.

## Run it

Prerequisites: `make setup`, `make db`, `npx playwright install chromium`, ports 8000/8081/8082 free.

```sh
# once: a separate local database (the runner resets it)
docker compose -f server/docker-compose.yml exec -T db createdb -U farmclub farmclub_dev282

FARMCLUB_AI_DEMO=1 \
DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_dev282 \
FARMCLUB_INTEGRATION_SKIP_DOCKER=1 FARMCLUB_INTEGRATION_API=0 \
ANTHROPIC_API_KEY=sk-ant-demo-disabled \
node scripts/run-integration.mjs scripts/e2e/ai-i4-demo.spec.ts
```

The spec is skipped unless `FARMCLUB_AI_DEMO=1`, because it adds chat messages and a draft to the shared seed that other specs count. It also refuses non-loopback service URLs.

Output (git-ignored) in `test-results/ai-i4-demo-*/`: `ai-i4-demo.webm` (1280×800, about 43 s; each caption holds 5 s), four screenshots, and `manifest.json` with the source commit, file hashes, browser, assertions passed and limitations. `video-1.webm` in the same folder is the login tab and is not part of the demo.

## Recorded run

18 November 2026, local: source commit `fc7b3420` (origin/main) plus the uncommitted demo spec. 1 passed (42.6 s), 7 assertions. Video 43.2 s (5 s caption pauses; the first 2.5 s version was too fast to read). API log had no 409 or 5xx responses. The first attempts failed on selectors and on one 409 conflict when the script edited the variety before the text source had finished saving. The script now waits for each save, as the existing composer spec does. That 409 is a script timing issue, not a product change made for the demo.
