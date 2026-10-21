# AI Collaboration Report – Iteration 2 ([YYYY-MM-DD] ~ [YYYY-MM-DD])

Written by: [name(s)] | Contributors: [all team members]

Tools and models used: [tool — model/version; include versions where known]

> Keep the completed report to roughly one page (500–700 words). This is a team report: collect each member’s input prompts and notes, review the team’s relevant AI-agent interaction histories, and write findings supported by verifiable evidence. Be candid; “no AI used” and “output was unusable” are valid findings. Do not include full agent responses or a full interaction transcript.

## 1. Where AI Was Used

| Member | Feature, files, or task | Tool and model/version | Evidence (file/lines, commit, PR, or issue) |
| -- | -- | -- | -- |
| [Name] | [Specific work; include file paths] | [Tool / model] | [Link or reference] |

**Where we deliberately did not use AI:** [Name the work or decisions and why, or state “None.”]

## 2. Prompt History

Record the input prompts actually sent, quoted verbatim. Do not clean up wording. Include member, date, tool/model, and task or PR/issue context. Record prompts only; responses and full transcripts are not required. If the prompt history does not fit the one-page report, put the full input-prompt log on a linked Wiki sub-page and summarize the relevant examples here.

- **[Member] · [YYYY-MM-DD] · [Tool/model] · [task/PR/issue]:** “[Paste exact prompt here]”
- **[Member] · [YYYY-MM-DD] · [Tool/model] · [task/PR/issue]:** “[Paste exact prompt here]”

**Full prompt log (if needed):** [Wiki page link]

## 3. What AI Did Well

- **[Concrete case]:** AI [specific contribution] in [file/PR/issue]. Evidence: [reference]. Human verification: [how checked]. Estimated time saved: [amount, or “not measured”].

## 4. Hallucinations / Errors

- **[Claim or output]:** AI asserted/generated [what was wrong] in [file/PR/issue]. We caught it by [how/when]. It was wrong because [reason]. Cost or impact: [time, defect risk, rework, or “not measured”]. Resolution: [what changed].
- If none were identified, say so and describe what was reviewed to support that conclusion.

## 5. Prompt Revisions

- **Before:** “[Verbatim earlier prompt]”
- **After:** “[Verbatim revised prompt]”
- **Why the revision worked (or did not):** [Explain the change in specificity/context and its observed effect; cite evidence.]

## 6. Manual Fixes and Why

- **[Member] · [file:line / PR / commit]:** AI-produced or AI-assisted work was changed manually: [what changed]. We stopped prompting and edited it because [specific reason]. Evidence of the final result: [reference].
- If no manual code/content fixes were needed, state that explicitly; do not imply AI output was accepted without review.

## Session History and Privacy Review

Before drawing iteration-level findings, review relevant Codex and Claude Code interaction histories for **all team members**. The Session Exporter can help collect local sessions for the project and date range; it may not include Codex Cloud, Claude remote work, or Claude Cowork records. Keep those limitations in mind when describing the review.

- [ ] Used the team repository’s absolute path and the full iteration date range (local timezone; record timezone): [path/date range/timezone]
- [ ] Ran `export_sessions.py` with `--dry-run` first; reviewed selected and excluded sessions, exclusion reasons, privacy findings, and final re-scan.
- [ ] Exported only after review; inspected the temporary review folder and confirmed it before creating the ZIP.
- [ ] Checked for API keys, tokens, passwords, `.env` contents, names, student IDs, other personal information, and `omitted_line` records. Add `--redact-term` for sensitive terms not detected automatically; rerun and review the new export.
- [ ] Confirmed the final ZIP contents and manifest privacy summary; did not rely on automated redaction alone. If an actual secret was exposed, revoked and replaced it.

Session review record: [reviewer(s), date, exporter version/commit if available, tool(s), date range, output ZIP location/access controls, and any limitations]. Do not link or attach the raw session ZIP to the public Wiki. Never put secrets or unnecessary personal data in this report.

## 7. Takeaway for Iteration 3 (optional)

[One or two lines on what the team will change in its use of AI next iteration.]
