# AI Collaboration Report – Iteration 1 – Prompt Log

Back to [[AI Collaboration Report – Iteration 1|AI-Collaboration-Report-–-Iteration-1]]

## How to write in this log

- **Edit only your own section.** Each person commits their own section, so the commit history shows who wrote what.
- **Quote prompts verbatim.** Copy the exact text you sent, typos included. Do not clean it up or summarize it.
- **Tag every entry** with the date, the tool/model, and the target file or PR, e.g. `2026-10-07 · Claude Code (Claude Opus 5.5) · PR #28`.
- Leave a slot empty rather than guessing.

---

## Hyun Park

Period: Oct 6–8, 2026. I used Claude Code (Claude Opus 5.5) for repo work and the Claude Design canvas for the screens. I wrote my prompts in Korean, so the ones below are my own English translations. I kept them close to what I actually typed.

### Prompts (English translation of what I sent)

**Process and AI rules (PR #15, DEV-10)**
- 2026-10-06 · Claude Code · DEV-10 — "We are starting development work on farmclub. All work follows this order: Linear issue (the issue itself is the proposal) → branch → AI creates tasks.md (spec file) and pushes → draft PR to main → action → PR → review → merge (main into branch, then branch into main, then GitHub Actions deploys). Everything is spec-anchored: the spec file lives in the work folder and the diff goes to the AI. Actively borrow current AI development practice. The team of four should share one set of skills."

**Specs and wiki (PRs #16, #18)**
- 2026-10-06 · Claude Code · `docs/wiki/` — "Read docs/spec/README.md, then prd.md, ia.md, functional/README.md and the FEAT files, and tech-design/README.md. Update these existing pages in docs/wiki/ in English … Do not include fee rates, settlement cycle, suspension criteria or any content from policy.md. Do not include Notion links. End every page with one line: 'Source of truth: `docs/spec/...` (Korean).' Edit files only; do not commit." (sent in English)
- 2026-10-06 · Claude Code · `docs/specs/i1` vs `docs/spec` — "Compare the old P14–P17 docs with the new docs/spec. Do not edit files. Output three Korean tables: (1) decisions, rules or features only in the old docs, (2) things the two decide differently (old value / new value), (3) remaining to-dos in the old tasks.md. Leave out wording differences and places where the new source is simply more detailed."
- 2026-10-06 · Claude Code · PR #18 (ADR 0007/0008) — "Read adr/0007-backend-fastapi.md and 0008-operator-admin-api.md first. Apply the decision to switch the backend from Django to FastAPI, and operator handling from Django Admin to 'admin API + Swagger UI (screens in I2)', across all docs. Step 1: `grep -rn -i "django\|simplejwt\|django-storages\|drf" docs/` to find every mention. … Do not commit."

**Implementation skeleton and CI (PRs #20, #22, #23)**
- 2026-10-07 · Claude Code · PR #20 (DEV-12) — "Do DEV-12: create the implementation skeleton (apps, packages, server) and a spec.md/tasks.md per folder. Do not implement features. Read in this order: AGENTS.md, docs/spec/README.md, stack.md chapters 3–4, tech-design/README.md, ia.md chapters 2 and 4, the spec skill and its two templates. Before starting, check `git branch --show-current`; if it differs, stop and ask. One commit per step … Step 1: spec.md and tasks.md first (first commit, push right away) …"
- 2026-10-07 · Claude Code · PR #23 (DEV-9) — "Continue. Pin setup-uv to the full version tag as upstream recommends instead of @v7 (check the latest v10 tag that actually exists). Other actions with a major tag keep the major tag. Update the tasks.md decisions too. Adding timeout-minutes is good: 15 minutes per job. Add .github/dependabot.yml for the github-actions ecosystem only, weekly (no npm or pip for now). If you need to wait for CI results, stop and tell me."

**Final screen spec (PR #25, SWPP-26)**
- 2026-10-07 · Claude Code · PR #25 — "Work on SWPP-26 (P22 spec finalization): merge Minsun's P21 screen spec with the confirmed spec in docs/spec … This message is 1/2. Until you receive 2/2, only read; do not change files. … Team decisions (I1; this table has the highest priority): follow P21 for 1–7 … follow docs/spec for 8–14 … Now: read everything and report a P21 ↔ ia.md SCR mapping draft, the files that must change with one line each, and any decisions that conflict or that I need to make."
- 2026-10-07 · Claude Code · PR #25 — "Change the Must rule. Keep follow/unfollow APIs as Must; move like and start-chat APIs down to Should. Add one line to screens.md: 'Buttons that use a Should API stay hidden in the frontend until the API is ready.' Fix the Must API count above the table and record it in tasks.md decisions. Commit, push, and when CI finishes, check the result and report."

**Screen design on the canvas (feeds PR #28)**
- 2026-10-07 · Claude Design canvas — "Create a new canvas 'farmclub design'. Skip the lo-fi stage and go straight to finished screen design. … farmclub is not a store that sells tangerines; it is an app where you follow a farm you support until harvest. … Stage 1: draw SCR-03 and SCR-04 in three visual directions (A field journal, B fan app, C calm precision). Stop after stage 1 and tell me the differences and which direction you recommend, with reasons."
- 2026-10-07 · Claude Design canvas — "The type sizes are right, but the producer screens still look like a different app. Match the way screens are built to the consumer app: 1. Accent-color buttons only at the bottom of the screen, like the consumer app. … Scope: producer screens, producer state frames and producer sheets only; leave consumer screens as they are. When done, check on a comparison board whether status, product list, shipping and inbox look like the same app as consumer home, checkout and chat, and report."

### Did well
- PR #47 (Oct 8): I split the canvas sync into four screen groups and ran one sub-agent per group. The whole canvas caught up with specs 1.2–1.5 in about an hour and a half.
- PR #25 (Oct 7): I asked for a read-only first pass. It came back with a mapping of the 10 P21 screens to our SCR list and the decisions that clashed, so I could settle those before anything was edited.
- PR #23 (Oct 7): The CI workflow came out the way I asked: setup-uv pinned to a full tag, major tags for the other actions, 15-minute timeouts, Dependabot only for actions. It was green on the PR before I started reviewing.

### Hallucinations and AI errors
- PR #28 (Oct 7): After I renamed the producer login board (P-SCR-05 to P-SCR-19), the export still pointed flow F-1 at the old name. The broken-link check caught it and I had to export again.
- PR #28 (Oct 7): The first export commit included `docs/design/feedback.md`, which is the evaluation source and should never be in the repo. I had to get it taken out of the history.

### Prompt revisions (before → after)
- PRs #23, #25: A long DEV-9 instruction got cut off when I pasted it, and that step stalled until I sent the rest. After that I split long instructions into parts ("this is 1/2, only read and report until 2/2"). I got a report first and could answer questions before any file changed.
- PR #28: I first said to edit the HTML in docs/design directly. I changed it to "the canvas is the source, re-export it and just list what doesn't match". That kept the design in one place, and the next export didn't wipe out hand edits.

### Manual fixes
- PR #25: I wrote the 14-row decision table (which items follow P21 and which follow docs/spec) and the Must/Should API rule.
- PR #47: Where the implemented app broke the design rules, I decided the canvas follows the rules, not the app.

### Where AI was NOT used
- Creating Linear issues, picking issue keys and branch names, approving and merging PRs.
- Team decisions: the tech stack (FastAPI, ADR 0007/0008), the P21 vs. spec table, account separation, Must/Should scope.
- Picking the visual direction. The canvas showed three and I chose B.

### Tools, time, tokens recorded in PRs
- PR #28: Claude Code (Claude Opus 5.5), about 3h, tokens not measured.
- PR #47: Claude Code (Claude Opus 5.5) with 4 sub-agents, about 1.5h, about 1.1M tokens.

---

## Jinwoo — AI Collaboration (Iteration 1)

**Period covered:** October 1–9, 2026 (KST)

**Tool / model:** Codex / `gpt-6-astra` (session records). Prompt excerpts below are English translations.

### 1. Where AI Was Used

AI supported three connected workstreams: producer survey analysis and interview preparation; frontend implementation and specification refinement; and submission documentation. Its contributions included organizing research notes, drafting interview questions, implementing interfaces, synchronizing specifications, and structuring Wiki documents.

Producer interviews were conducted personally. AI assisted with preparation and subsequent analysis rather than replacing the conversations. Interpretation of interview findings and final product decisions remained subject to human review.

### 2. Prompt History

- **Producer research, October 1–7 — survey analysis, interview questions, and summaries:** An initial request to analyze survey results developed into interview preparation and follow-up. On October 5, the scope was refined: “Focus the interview questions on what the survey has not established and what still needs to be asked.”
- **Frontend and specifications, October 7–8 — PRs #39–41:** The initial task was to implement the frontend from the supplied prototype. A follow-up established the workflow: “Make the specification changes on a separate branch and merge them before changing the frontend, since someone else is also working on the backend.”
- **Submission documentation, October 9 — PR #58:** “Keep filling in the documents that can be completed without additional confirmation.” Subsequent feedback requested clearer lists and tables, consolidation of the proposal, and deferred PDF export.

### 3. What AI Did Well

Survey findings and interview notes were converted into reusable questions and concise summaries. Follow-up instructions were incorporated into the same research workflow, allowing revisions to build on the existing material.

For development, revised navigation and supply-approval decisions were carried through specifications and frontend implementation. [PR #41](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/41) records passing type checks across four workspaces, eight Mock tests, and both web exports. [PR #58](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/58) records 19 user stories with acceptance scenarios and documentation checks against implementation. These are historical verification results. Time saved and total usage were not separately measured.

### 4. Hallucinations / Errors

An interview summary confused quantities intended for sale through the service with total production. Human review identified the distinction, and the October 6 summaries were revised. Participation wording was also challenged and then clarified to distinguish participating and non-participating interviewees. On October 7, a wholesale-related constraint was initially interpreted as uncertainty about when a producer would switch channels. The interpretation was corrected before the final summary was saved.

Documentation checking found `VERSION_CONFLICT` where the implementation used `STALE_VERSION` (PR #58). That correction came from AI-assisted code comparison. The research errors required additional clarification and revision; correction time was not separately measured.

### 5. Prompt Revisions

**Research:** General survey analysis → interview preparation → questions focused on unresolved hypotheses and individual experience. The revisions supplied a concrete research objective instead of requesting repeated generic rewrites.

**Frontend:** Prototype-based implementation → explicit navigation changes → approval of initial supply capacity and additional approval for increases. [PR #39](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/39) and [PR #40](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/40) record the specification changes. These were product decisions and workflow improvements, not all model hallucinations.

### 6. Human Verification / Correction

Outputs were checked against interview context and the intended service flow. Corrections distinguished sales intentions from production capacity and clarified participation statements. Interface review identified fragmented news and messaging, unclear access to orders, and product grouping that needed revision. Approval policy was reconsidered so that an approved supply limit could be managed without repeated approval for routine changes.

AI implemented the resulting specification, interface, and documentation edits following this feedback. These examples demonstrate human-directed verification and correction; they do not establish direct hand-editing of code. Product decisions and factual corrections remained separate from AI's own code checks.

### 7. Takeaway

Retain human control over research interpretation and product decisions. Give AI specific corrections, update shared specifications before implementation, and verify the resulting behavior and documents against those decisions.

---

## Zahra Gholami

### Prompts (verbatim)
- 2026-10-08 · Codex · DEV-4 backend — "please read the repo, the codebase fully and understand all the rules. then read notion. and look at my recent acitivity and commit history to catch up. ask me questions if you need"
- 2026-10-09 · Codex · DEV-6 integration testing — "please plan all the tests needed to make sure that the integration is intact and also pr/issue/commit stages"
- 2026-10-09 · Codex · DEV-25 integration automation — "plan out a new pr, that is the comprehensive integration test and includes the tests that dev7 did not have. since that one is already merged, this one needs to build on it seperately"

### Did well
- AI implemented and tested the FastAPI backend through specs 1.1–1.5, including migrations, seed conversion, authorization, messaging, capacity-safe orders, detail content, and acceptance-criteria tests (PRs #48–#52).
- AI created and ran the real FastAPI/PostgreSQL integration smoke suite and browser matrix. This exposed the missing producer-application API as Bug #54; the fix was isolated in PR #55 and verified again in PR #53.
- Human feedback that the first integration pass was not sufficiently repeatable led to DEV-25. AI then added deterministic real-stack orchestration, expanded API coverage, Playwright cross-app tests, failure artifacts, and the `integration` CI job (PR #61: API 7/7, Chromium 8/8).

### Hallucinations
- During integration work, AI initially followed the wrong issue context instead of I1-P26/#7. Zahra corrected the task identity before implementation continued.
- The first DEV-25 branch name did not follow the requested team prefix and English naming. Correcting it caused GitHub to close the original PR during the rename, so PR #61 had to replace it.
- Some generated browser-test assumptions did not match the implemented UI, including which orders appeared in the producer fulfillment flow and how controls behaved after saving shipment data. Playwright traces and the accessibility tree exposed the mismatch, and the tests were corrected without changing product behavior.

### Prompt revisions (before → after)
- A general request to continue integration testing was refined into a plan tied to I1-P26/#7, the real FastAPI/PostgreSQL stack, explicit browser scenarios, defect isolation, and PR/issue/commit stages. This removed task ambiguity and made completion verifiable.
- The initial API-smoke and manual-browser scope was revised into a separate comprehensive automation task after human review identified missing repeatable browser regression coverage. The revised prompt defined Playwright, CI, failure artifacts, allowed paths, and separation of product fixes from test automation.

### Manual fixes
- Zahra manually corrected the integration task identity and required the comprehensive automation work to be created as a separate task and PR, preventing it from being mixed into already-merged DEV-6 or the Bug #54 fix.
- Zahra reviewed the pretotype output from Claude Design and performed the deployment manually because deployment and account access remained a human responsibility.

### Where AI was NOT used
- Zahra personally read the repository code, Markdown specifications, frontend contracts, and commit history to understand the architecture, define the backend scope, and verify the implementation pipeline before directing AI work.
- Final scope decisions, test-completeness judgment, issue/PR separation, deployment, and acceptance of the results remained human decisions.

---

## Minsun Kim — AI Collaboration (Iteration 1)

**Period covered:** October 9, 2026 (KST)

**Tool / model:** ChatGPT / GPT-5.6 Sol

My primary Iteration 1 contribution was product work rather than implementation: product survey, wireframe, and screen specifications. I therefore did not invent a coding history for those artifacts. To add a concrete, reviewable AI-collaboration case, I used AI for a deliberately small frontend refactor in PR #66, with the existing product behavior and screen specification treated as hard constraints.

### 1. Where AI Was Used

AI reviewed the consumer order-history frontend and selected a low-risk maintainability improvement in `apps/consumer/src/app/(tabs)/orders/index.tsx`. The scope was intentionally narrow: remove repeated derived-data lookups while preserving the UI, Korean copy, routing, API behavior, order grouping, and screen specification. The result is isolated in draft PR #66 / commit `a19a618` (12 additions, 5 deletions).

### 2. Prompt History

- **2026-10-09 · ChatGPT (GPT-5.6 Sol) · PR #66** — “뭐래 너가 지금 해 당장”
- The preceding context constrained the task to a small frontend refactor that would not redesign the screen or introduce new functionality. I explicitly wanted a real PR that could be reviewed rather than a fabricated development contribution.

### 3. What AI Did Well

AI found a contained refactoring opportunity instead of expanding the task. Previously, the component repeatedly filtered the full order list inside each tab render to calculate counts and separately searched `orderGroups` again when constructing the empty-state label. PR #66 derives `groupCounts` and `selectedGroupLabel` once and reuses them. The change stays within one screen file and leaves the existing `orderGroup`, `selectedOrderGroup`, and `compareOrders` domain logic untouched. This made the diff small enough to audit directly against the screen specification.

### 4. Hallucinations / Errors

No model hallucination was identified in this refactoring pass. I am recording that explicitly rather than manufacturing an error for the report. There is, however, a review limitation: the refactor has not been merged, and PR #66 remains a draft pending team review. Therefore the AI output should be treated as a proposed maintainability improvement, not as evidence that product behavior has been independently revalidated.

### 5. Prompt Revision / Scope Control

The useful revision was not “ask for more code,” but narrow the role of AI. A generic request to “refactor the frontend” could easily produce unnecessary component extraction or behavioral cleanup. The working scope was reduced to a **small, low-risk, behavior-preserving refactor**. Product behavior, UI/UX, routing, API calls, Korean copy, and the existing screen specification were fixed constraints. This kept AI in a code-review/refactoring role rather than allowing it to reinterpret product requirements.

### 6. Human Verification / Manual Decisions

The product survey, wireframe, and screen specifications were my substantive Iteration 1 contributions; final product and UX decisions were not delegated to this refactoring pass. For PR #66, the human constraint was that refactoring must not change those decisions. The proposed diff is intentionally limited to derived presentation data: tab counts and the selected-group label. It does not modify the order status mapping, sorting rules, navigation, data loading, API calls, or displayed wording. Final acceptance and merge remain subject to human/team review.

### 7. Takeaway

AI was most useful when its authority was constrained: identify a small implementation-quality improvement, make the minimum change, and leave product intent untouched. For later iterations, I would keep the same pattern—use AI to surface and execute bounded technical improvements, while keeping requirements, UX trade-offs, and final acceptance explicitly human-owned.

