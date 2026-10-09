# AI Collaboration Report – Iteration 1 (2026-09-28 ~ <마감일 TBD>)

Written by: <TBD> | Contributors: Hyun Park, Jinwoo Jang, Zahra Gholami, Minsun Kim

Tools used: <TBD>

> How to fill this page: keep the body to 500–700 words of analysis. Put raw prompts and per-person notes in the [[Prompt Log|AI-Collaboration-Report-–-Iteration-1-–-Prompt-Log]] and link to them here. Every claim needs something a reader can check: a file path with line number, a commit hash, a PR number or an issue link.
>
> Items marked **"Draft from PR #n — confirm"** were copied from the "AI 사용" section or the AI review comment of that PR. The PR author should confirm, correct or delete each one, then remove the marker. Do not invent anything to fill an empty slot.

## 1. Where AI Was Used

_Which features, files and tasks used AI, with which tool and model. Also list where we deliberately did **not** use AI, and why._

| Area / task | Tool / model | PR / commit | Owner |
| -- | -- | -- | -- |
| Design review follow-up: Claude Design canvas edits, export to `docs/design/`, check scripts, spec sync incl. account separation | Claude Code (Claude Opus 5.5) | #28 · `bccb29a` | Hyun Park — **Draft from PR #28 — confirm** |
| Spec 1.2: sales operations, farm chat, AI settings (`docs/spec/contracts-1.2.md` etc.) | Codex / GPT-6 | #38 · `068f756` | Jinwoo Jang — **Draft from PR #38 — confirm** |
| Spec 1.3: symmetric tabs, messenger, product groups | Codex / GPT-6 | #39 · `d3aed0d` | Jinwoo Jang — **Draft from PR #39 — confirm** |
| Spec 1.4: per-product supply capacity approval | Codex | #40 · `3b648e0` | Jinwoo Jang — **Draft from PR #40 — confirm** |
| Consumer and producer apps + capacity approval (frontend + Mock) | Codex / GPT-6 (exact backend model ID not shown) | #41 · `3cc2332` | Jinwoo Jang — **Draft from PR #41 — confirm** |
| Consumer order status tabs (FEAT-10) | Codex | #42 · `470cba5` | Jinwoo Jang — **Draft from PR #42 — confirm** |
| Order tab display order | Codex | #43 · `513ff83` | Jinwoo Jang — **Draft from PR #43 — confirm** |
| Spec 1.5: farm/product detail and public news room | Codex | #44 · `69289f7` | Jinwoo Jang — **Draft from PR #44 — confirm** |
| Detail editing and public news room (frontend + Mock) | Codex | #45 · `12251d2` | Jinwoo Jang — **Draft from PR #45 — confirm** |
| Squash-merge rule in `AGENTS.md` | Codex | #46 · `309f520` | Jinwoo Jang — **Draft from PR #46 — confirm** |
| Design canvas synced to specs 1.2–1.5 from the implemented apps (4 sub-agents, one per screen group) | Claude Code (Claude Opus 5.5) | #47 · `62e4745` | Hyun Park — **Draft from PR #47 — confirm** |
| <other tasks — Zahra Gholami> | | | |
| <other tasks — Minsun Kim> | | | |

**Time and tokens recorded in PRs** (most PRs say exact numbers were not measured):
- #28: about 3h agent time, tokens not measured. **Draft from PR #28 — confirm**
- #40: about 0.3h (from work log), tokens: no measuring tool. **Draft from PR #40 — confirm**
- #41: about 0.7h for this capacity spec and implementation; earlier cumulative frontend sessions not measured; tokens not measured. **Draft from PR #41 — confirm**
- #42: about 0.15h, tokens not measured. **Draft from PR #42 — confirm**
- #47: about 1.5h, about 1.1M tokens. **Draft from PR #47 — confirm**

**Where AI was NOT used (on purpose):**
- <TBD>

## 2. Prompt History

_Quote 3–5 representative prompts exactly as sent (no clean-up), with date, tool and target file/PR. Put the rest in the [[Prompt Log|AI-Collaboration-Report-–-Iteration-1-–-Prompt-Log]]._

No PR quotes a prompt verbatim. PRs #39, #40 and #43 record **summarized** instructions only; replace them with the original prompt text from the session history:
- PR #39 "대표 지시" (summary, not verbatim) — replace with the original prompt.
- PR #40 "대표 지시" (summary, not verbatim) — replace with the original prompt.
- PR #43 "사용자 요청" (summary, not verbatim) — replace with the original prompt.

1. <date · tool · target> — "<verbatim prompt>"
2. <date · tool · target> — "<verbatim prompt>"
3. <date · tool · target> — "<verbatim prompt>"

## 3. What AI Did Well

_Concrete cases with evidence: file, PR, time saved._

- Self-review caught real bugs before merge in the frontend PR: floating-point kg × 1000 rejected valid decimal weights (`packages/api/src/mock/catalog.ts:318`), a retry after a lost save response generated a new idempotency key (`apps/producer/src/app/(tabs)/products/[id]/edit.tsx:268`), and a delivery-window change was not linked to existing orders' consent (`packages/api/src/mock/catalog.ts:370`). Regression tests were added. **Draft from PR #41 — confirm**
- Self-verification found that the nested layout's local search params lost the `filter` after login; fixed with global search params and checked `/orders?filter=confirmed` → login → Confirmed tab in a real browser (`apps/consumer/src/app/(tabs)/orders/_layout.tsx:12`). **Draft from PR #42 — confirm**
- Review of the spec found that switching HUMAN→AUTO or OFF→ON could save a stale AI answer; the contract now compares thread and AI-settings versions (`docs/spec/contracts-1.2.md:103`). **Draft from PR #38 — confirm**
- <time saved — TBD>

## 4. Hallucinations

_What the model claimed, why it was wrong, how we found out, and what it cost._

- After the producer login board was renamed (P-SCR-05 → P-SCR-19), the AI's export left a broken link in flow F-1, which had to be exported again. **Draft from PR #28 — confirm** (this is an AI error; decide whether it counts as a hallucination)
- <TBD>

## 5. Prompt Revisions

_Before → after, and why the new version worked better._

- <before> → <after> — <why it worked>

## 6. Manual Fixes and Why

_Where we stopped prompting and fixed things by hand, and why._

- A human told the AI to remove the evaluation source file that had been included in the first commit from the history; account separation and the 5 producer seed accounts were human decisions; the badge-number exception (15px bold) was human-approved. **Draft from PR #28 — confirm**
- The direction of per-product total limits and spec-first branches was set by the user. **Draft from PR #38 — confirm**
- The rule of drawing to the design rules when the implementation broke them, and the branch/issue key, were human decisions. **Draft from PR #47 — confirm**
- <TBD>

## 7. Takeaway for Iteration 2

_1–2 lines: what we will change next iteration._

- <TBD>

## AI-generated Code Markers

_List every place in the code that carries an AI-generated comment, e.g. `AI-generated with Claude, 2026-10-07, reviewed by Alice`._

| File:line | Marker text | Reviewed by |
| -- | -- | -- |
| <TBD> | | |
