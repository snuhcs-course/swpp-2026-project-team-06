# AI Collaboration Report – Iteration 1 – Prompt Log

Back to [[AI Collaboration Report – Iteration 1|AI-Collaboration-Report-–-Iteration-1]]

## How to write in this log

- **Edit only your own section.** Each person commits their own section, so the commit history shows who wrote what.
- **Quote prompts verbatim.** Copy the exact text you sent, typos included. Do not clean it up or summarize it.
- **Tag every entry** with the date, the tool/model, and the target file or PR, e.g. `2026-10-07 · Claude Code (Claude Opus 5.5) · PR #28`.
- Items marked **"Draft from PR #n — confirm"** were copied from that PR's "AI 사용" section or AI review comment. Confirm, correct or delete them, then remove the marker.
- Leave a slot empty rather than guessing.

---

## Hyun Park

### Prompts (verbatim)
- <date · tool · target> — "<verbatim prompt>"

### Did well
- <case · evidence (file:line, commit, PR)>

### Hallucinations
- After the producer login board was renamed, flow F-1's link broke and had to be exported again. **Draft from PR #28 — confirm**

### Prompt revisions (before → after)
- <before> → <after> — <why it worked>

### Manual fixes
- Told the AI to remove the evaluation source file that was included in the first commit from the history; decided account separation and the 5 producer seed accounts; approved the badge-number exception (15px bold). **Draft from PR #28 — confirm**
- Decided that frames follow the design rules where the implementation broke them; chose the branch and issue key. **Draft from PR #47 — confirm**

### Where AI was NOT used
- <TBD>

### Tools, time, tokens recorded in PRs
- PR #28: Claude Code (Claude Opus 5.5); about 3h agent time; tokens not measured. **Draft from PR #28 — confirm**
- PR #47: Claude Code (Claude Opus 5.5), 4 sub-agents for screen groups; about 1.5h; about 1.1M tokens. **Draft from PR #47 — confirm**

---

## Jinwoo Jang

### Prompts (verbatim)
- PR #39 records a summarized instruction ("대표 지시"), not the original prompt — replace with the verbatim prompt.
- PR #40 records a summarized instruction ("대표 지시"), not the original prompt — replace with the verbatim prompt.
- PR #43 records a summarized request ("사용자 요청"), not the original prompt — replace with the verbatim prompt.
- <date · tool · target> — "<verbatim prompt>"

### Did well
- Self-review in the frontend PR fixed decimal-weight rounding (`packages/api/src/mock/catalog.ts:318`), reused the idempotency key on PATCH retry (`apps/producer/src/app/(tabs)/products/[id]/edit.tsx:268`), linked delivery-window changes to existing orders' consent (`packages/api/src/mock/catalog.ts:370`), fixed a login/async response race, removed an intermediate redirect, and fixed a test delivery-date fixture. **Draft from PR #41 — confirm**
- Self-verification found the nested layout's local search params lost the filter after login; fixed with global search params (`apps/consumer/src/app/(tabs)/orders/_layout.tsx:12`). **Draft from PR #42 — confirm**
- Review caught that HUMAN→AUTO / OFF→ON could save a stale AI answer; the contract now compares thread and AI-settings versions (`docs/spec/contracts-1.2.md:103`). **Draft from PR #38 — confirm**
- Fixed during AI review: old preset/question-inbox text, "needs answer" when AI is OFF, table column counts and price-reconfirmation wording. **Draft from PR #38 — confirm**
- Narrowed the old AC that banned news in the chat tab to 1:1 conversations only (FEAT-12 AC-12-5). **Draft from PR #39 — confirm**
- Verification found and fixed a missing back destination after direct URL entry, optional-field differences on retry, and a product-row layout overlap. **Draft from PR #45 — confirm**

### Hallucinations
- <TBD>

### Prompt revisions (before → after)
- <before> → <after> — <why it worked>

### Manual fixes
- The user set the direction of per-product total limits and spec-first branches. **Draft from PR #38 — confirm**
- No human fixes recorded. **Draft from PR #46 — confirm**

### Where AI was NOT used
- <TBD>

### Tools, time, tokens recorded in PRs
- PR #38, #39: Codex / GPT-6; time and tokens not measured. **Draft from PR #38, #39 — confirm**
- PR #40: Codex; about 0.3h (work log); tokens: no measuring tool. **Draft from PR #40 — confirm**
- PR #41: Codex / GPT-6 (exact backend model ID not shown); about 0.7h for this work, earlier frontend sessions not measured; tokens not measured. **Draft from PR #41 — confirm**
- PR #42: Codex; about 0.15h; tokens not measured. **Draft from PR #42 — confirm**
- PR #43, #44, #45, #46: Codex; exact time and tokens not available. **Draft from PR #43–#46 — confirm**

---

## Zahra Gholami

### Prompts (verbatim)
- <date · tool · target> — "<verbatim prompt>"

### Did well
- <case · evidence>

### Hallucinations
- <claim · why wrong · how found · cost>

### Prompt revisions (before → after)
- <before> → <after> — <why it worked>

### Manual fixes
- <what · why>

### Where AI was NOT used
- <TBD>

---

## Minsun Kim

### Prompts (verbatim)
- <date · tool · target> — "<verbatim prompt>"

### Did well
- <case · evidence>

### Hallucinations
- <claim · why wrong · how found · cost>

### Prompt revisions (before → after)
- <before> → <after> — <why it worked>

### Manual fixes
- <what · why>

### Where AI was NOT used
- <TBD>
