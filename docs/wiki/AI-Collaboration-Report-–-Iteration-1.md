# AI Collaboration Report – Iteration 1 (2026-09-28 ~ 2026-10-11)

Written by: Team 6 | Contributors: Hyun Park, Jinwoo Jang, Zahra Gholami, Minsun Kim

Tools used: Claude Code (Claude Opus 5.5), Claude Design canvas, Codex (GPT-6), ChatGPT (GPT-5.6 Sol)

Each member's raw prompts and notes are in the [[Prompt Log|AI-Collaboration-Report-–-Iteration-1-–-Prompt-Log]].

## 1. Where AI Was Used

| Member | Work with AI | Tool | PRs |
| -- | -- | -- | -- |
| Hyun Park | AI rules and skills, spec migration and wiki summaries, implementation skeleton, CI, final screen spec, screen design on the canvas, design sync | Claude Code, Claude Design | #15, #16, #18, #20, #22, #23, #25, #28, #47 |
| Jinwoo Jang | Producer survey analysis and interview prep, specs 1.2-1.5, consumer and producer frontend, submission docs | Codex | #38-#46, #58 |
| Zahra Gholami | FastAPI backend for specs 1.1-1.5, real-stack integration tests, CI integration job | Codex | #48-#53, #55, #61 |
| Minsun Kim | Small behavior-preserving refactor of the order history screen | ChatGPT | #66 |

Recorded time: #28 3h, #40 0.3h, #41 0.7h, #42 0.15h, #47 1.5h (1.1M tokens); other PRs did not measure it.

**Where we did not use AI:** producer interviews (in person), Minsun's survey, wireframe and screen specification, team decisions such as the tech stack and account separation, the visual direction, deployment, and PR approval and merging.

## 2. Prompt History

1. 2026-10-08 · Codex · DEV-4 backend (Zahra) — "please read the repo, the codebase fully and understand all the rules. then read notion. and look at my recent acitivity and commit history to catch up. ask me questions if you need"
2. 2026-10-09 · Codex · DEV-25 / PR #61 (Zahra) — "plan out a new pr, that is the comprehensive integration test and includes the tests that dev7 did not have. since that one is already merged, this one needs to build on it seperately"
3. 2026-10-07 · Claude Code · PR #25 (Hyun, translated from Korean) — "This message is 1/2. Until you receive 2/2, only read; do not change files. … Team decisions (I1; this table has the highest priority) …"
4. 2026-10-05 · Codex · interview prep (Jinwoo, translated from Korean) — "Focus the interview questions on what the survey has not established and what still needs to be asked."

## 3. What AI Did Well

- **Bugs caught before merge (PR #41).** Self-review found rejected decimal weights, a retry that created a new idempotency key, and a delivery change not linked to buyer consent (`packages/api/src/mock/catalog.ts:318`). Regression tests were added.
- **A missing API found by integration tests.** The real-stack suite exposed bug #54, fixed in PR #55 and rechecked in PR #53.
- **Large updates in parallel (PR #47).** Four sub-agents synced the design canvas to specs 1.2-1.5 in about 1.5 hours.

## 4. Hallucinations

- **Wrong task context (Zahra):** the AI followed the wrong issue instead of I1-P26/#7 until Zahra corrected it.
- **Invented UI in tests (Zahra):** browser tests assumed orders and controls the UI did not show; Playwright traces exposed it.
- **Misread interview data (Jinwoo):** a summary confused the amount sold through the service with total production; human review fixed it.
- **Stale link (Hyun, PR #28):** after a board rename, the export still linked flow F-1 to the old name; the link check caught it.

## 5. Prompt Revisions

- **Hyun:** a long instruction got cut off → split into "1/2, only read and report until 2/2", so questions were answered before edits.
- **Zahra:** "continue integration testing" → a plan tied to I1-P26/#7 with named scenarios and separate fix PRs, so done was checkable.
- **Jinwoo:** general survey analysis → questions on unresolved hypotheses only, which stopped generic rewrites.
- **Minsun:** "refactor the frontend" → one behavior-preserving change with UI, copy and API fixed, so the diff stayed in one file.

## 6. Manual Fixes and Why

- Hyun wrote the history-rewrite commands for `docs/design/feedback.md` and the PR #25 decision table himself; history and product decisions are not left to AI.
- Zahra split the automation into its own PR (#61) and deployed by hand.
- Jinwoo corrected interview summaries directly and kept product decisions human-owned.
- Minsun kept product and UX decisions out of the refactor in PR #66, so it changes code quality only.

## 7. Takeaway for Iteration 2

Give AI a fixed scope and a decision table before it edits anything, and record agent time and tokens in every PR so the next report has numbers instead of estimates.

## AI-generated Code Markers

No file on `main` carries an AI-generated comment marker at the end of Iteration 1. From Iteration 2 we will mark AI-written code as `AI-generated with <tool>, <date>, reviewed by <name>` and list each place here.

| File:line | Marker text | Reviewed by |
| -- | -- | -- |
| (none in I1) | | |
