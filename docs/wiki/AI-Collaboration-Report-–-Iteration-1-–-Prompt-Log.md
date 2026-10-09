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
