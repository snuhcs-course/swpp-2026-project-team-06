# AI Collaboration Report – Iteration 2 (2026-10-11 ~ 2026-10-23)

Contributors: Minsun, Hyun, Jinwoo, Zahra

Tools and models used: Minsun — ChatGPT/Codex (GPT-6.1 Sol); Hyun — Claude Code (Claude Opus 5.5, and Claude Fable 5.1 for the first PRs of Oct 16–17) with Playwright; [add other members’ tools/models].
Tools and models used: Jinwoo — Codex (GPT-6 per PR bodies, Oct 13–15; GPT-6 Astra, Oct 16–18, and GPT-6.1 Sol, Oct 19, per session metadata), Claude Code (Claude Opus 5.5, Oct 21–23); Zahra — Codex (GPT-5.6 Sol, Oct 13–16; GPT-6 Luna, Oct 16–17), Claude Code (Claude Opus 5.5, Oct 13–23); product AI: Gemini 3 Flash Preview via OpenRouter; [add other members’ tools/models].

> Keep the completed report to roughly one page (500–700 words). This is a team report: collect each member’s input prompts and notes, review the team’s relevant AI-agent interaction histories, and write findings supported by verifiable evidence. Be candid; “no AI used” and “output was unusable” are valid findings. Do not include full agent responses or a full interaction transcript.

## 1. Where AI Was Used

| Member | Feature, files, or task | Tool and model/version | Evidence (file/lines, commit, PR, or issue) |
| -- | -- | -- | -- |
| Minsun Kim (PM) | Task decomposition, role/dependency mapping, effort tracking, review governance (SWPP-89/90), checker delivery (DEV-40/55), and internal testing | ChatGPT/Codex; GPT-6.1 Sol | E1–E4 and P1–P12 in Section 2; PRs #106/#107; I2 Linear project; October 19 PM testing artifacts |
| Hyun Park | Kakao login (DEV-32/74/108/112), bank-transfer payment (DEV-68), deploy workflows and domain (DEV-65/66/67/69/70), PostHog (DEV-71/104), admin web (DEV-82/83/87/98/106/107/114), live fix (DEV-84), spec-check and team AI rules (DEV-55/79/80, SWPP-119) | Claude Code; Claude Opus 5.5, Claude Fable 5.1 | 25 merged PRs (Oct 17–22), e.g. [#121](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/121), [#141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141), [#174](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/174), [#212](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/212), [#213](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/213); the "AI 사용" block in each PR body |
| Jinwoo Jang | Figma v6 frontend for both apps (DEV-51), source-analysis backend and producer source upload / page editor (DEV-54/56/57/58), producer drafts and shipping (DEV-29), logo (DEV-85), production worker and upload race (DEV-90/92), profile photo 500 fix (DEV-102), help tour (DEV-109), farmclub inquiry room (DEV-111), producer coverage (DEV-118) | Codex (GPT-6 Astra, GPT-6.1 Sol); Claude Code (Claude Opus 5.5) | 11 merged PRs (Oct 13–22) plus [#238](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/238)/[#239](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/239) (merged Oct 23 KST), e.g. [#98](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/98), [#104](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/104), [#113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113), [#130](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/130), [#205](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/205), [#218](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/218), [#221](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/221); the "AI 사용" block in each PR body |
| Zahra Gholami | Manager APIs (DEV-30), AI safety and grounding (DEV-31), manager exception history and recovery (DEV-35), AI answer feedback (DEV-39), manager/AI checklist and regression (DEV-44/50), AI draft grounding fix (DEV-59), "no basis" answers go to the producer (DEV-47), Railway deploy setup (DEV-64), live-server operator check (SWPP-118), test-farm hiding (DEV-93), chat product context (DEV-97), AI CS wiki page (SWPP-116), agent verification rules (SWPP-114) | Codex (GPT-5.6 Sol, GPT-6 Luna); Claude Code (Claude Opus 5.5) | PRs [#96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96), [#99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99), [#114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114), [#116](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/116), [#117](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/117), [#118](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/118), [#119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119), [#128](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/128), [#140](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/140), [#144](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/144), [#165](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/165), [#189](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/189), [#192](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/192), [#197](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/197), [#198](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/198) |
| [Other member] | [Specific work; include file paths] | [Tool / model] | [Link or reference] |

**Minsun:** As Iteration 2 PM, I used ChatGPT/Codex for task decomposition, ownership and dependency mapping, effort-record standardization, review-process design, and internal-test execution and reporting. The central management problem was establishing what the team could deliver and demonstrate under changing technical and coordination constraints. AI supplied drafts, explanations, and test evidence; I supplied contextual corrections, priorities, access decisions, and scope boundaries. [E1–E4]

**Hyun:** I used Claude Code for nearly all of my I2 implementation. Each time I wrote the Linear issue; the agent wrote the `tasks.md` section, opened a draft PR, implemented, ran the tests and the `pr-review` skill; then I reviewed. Each PR body has an "AI 사용" (AI use) block. Of my 25 merged I2 PRs, 23 record agent time (about 25 hours in total) and 12 record tokens (about 14M), so the token figure is a lower bound. Where Linear and the PR body disagree (DEV-32: about 5h in [#121](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/121), 7h in Linear), I use the PR body.

**Where we deliberately did not use AI:** Minsun retained ownership of priorities, role corrections, scope decisions, and approval. AI did not substitute for human PR approval, Kakao authentication, or actual Android/iPhone checks; unavailable execution remained explicitly incomplete. Hyun kept the payment rules in DEV-68 (refund to the paying account, 24-hour deposit deadline), the production database backfill (run by hand in the Railway console instead of the agent's PR #149), moving the deploy tokens into the `production` Environment (DEV-70), and the APK signing passwords (DEV-33). [Other members: add decisions/work retained by humans.]
**Jinwoo:** I used a coding agent for almost all of my I2 implementation: Codex until Oct 19, then Claude Code. My part was deciding scope, cost, and what the producer screens should look like, and checking the result in the browser before merge. Only three of my PRs record agent time, all as approximations: [#205](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/205) (about 1.5h, 0.6M tokens), [#238](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/238) (about 1.0h) and [#239](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/239) (about 0.2h), so I do not give totals.

**Zahra:** I used two agents on purpose. I drafted the plan for each backend issue with Codex, pasted it into Claude Code for review, pasted the review back, and repeated until the review found nothing that would break (3–6 rounds for DEV-31, DEV-35, DEV-39 and DEV-44). Then Codex implemented it and Claude Code checked the result. I also used Claude Code for live-server checks, Linear/PR housekeeping, and drafting and translating team messages.

**Where we deliberately did not use AI:** Minsun retained ownership of priorities, role corrections, scope decisions, and approval. AI did not substitute for human PR approval, Kakao authentication, or actual Android/iPhone checks; unavailable execution remained explicitly incomplete. Jinwoo kept the model and budget choice for source analysis (OpenRouter first, Gemini for cost, a stronger model only where vision is needed), left the AI chat feature to its owner, and did the Railway login and SSH key registration himself. [Other members: add decisions/work retained by humans.]

**Zahra — where I deliberately did not use AI:** Railway login, SSH key registration and the operator token (my account); looking at the producer and consumer apps on screen; deciding what may change on the shared live server ("don't touch other people's test farms"); merge decisions.

## 2. Prompt History

Record the input prompts actually sent, quoted verbatim. Do not clean up wording. Include member, date, tool/model, and task or PR/issue context. Record prompts only; responses and full transcripts are not required. If the prompt history does not fit the one-page report, put the full input-prompt log on a linked Wiki sub-page and summarize the relevant examples here.

- **Minsun · 2026-10-11, 21:28:14 KST · ChatGPT/Codex (GPT-6.1 Sol) · task quality and human review · E1/P1, turn `01a12aef-6707-7ad0-864c-011e5da61280` — verbatim excerpt:** “please suggest a list of user stories we MUST consider, then create a list of tasks (small enough to estimate, has one clear owner, has an observable completion state, and produces visible output) for our second iteration. The list of tasks should be good enough quality to actually use in our iteration, so please take your time to think and logically create results. before uploading to the excel sheet, please give it to me first, I will review the quality then upload.”
- **Minsun · 2026-10-11, 22:28:58 KST · ChatGPT/Codex (GPT-6.1 Sol) · implementation baseline and scope prioritization · E1/P12, turn `01a12b27-00ee-7a72-9cf1-60a7b9c5a591` — complete request:** “can you check which user stories are already implemented, and what user stories should be classified as main function/supplementary functions”
- **Minsun · 2026-10-12, 00:37:34 KST · ChatGPT/Codex (GPT-6.1 Sol) · staged user testing and review gate · E1/P11, turn `01a12b9c-bc7d-7f63-a10c-72331a4e64b5` — verbatim excerpts:** “-testing 2: the same pool of consumers will be asked to test all consumer functions once again, but this time, including actual payment for at least 1 order.” / “workflow revisions: pm needs to check sync for all (spec file)<→2(code) before review-> add as task”
- **Minsun · 2026-10-12 · ChatGPT/Codex (GPT-6.1 Sol) · cross-role testing:** “good job, but after the two consumer tests, related producer functions and app manager functions should also be monitored, so add this each to zahra and jinwoo for both tests.”
- **Minsun · 2026-10-19 · Codex (GPT-6.1 Sol) · operator-access limitation:** “Record the operator tests as blocked”
- My other prompts are in the [Prompt Log, Minsun Kim section]([https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log#minsun-kim](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log#minsun-kim)).

- **Hyun · 2026-10-18, 21:09–21:11 KST · Claude Code (Claude Opus 5.5) · DEV-72, PR #149 (sent in Korean, my translation in brackets):** “db 백필만 하는거 아니었어?” … “백필 SQL은 내가 Railway 콘솔에서 직접 실행할게. SQL만 다시 정리해줘.” [Wasn't this only a DB backfill? … I'll run the backfill SQL in the Railway console myself. Just clean up the SQL.]
- **Hyun · 2026-10-21, 14:30 KST · Claude Code (Claude Opus 5.5) · DEV-104, PR #212:** “농가가 적은 입금 미확인·환불 지연 사유 -> 이런거는 가릴이유가 없잖아? 법적으로 문제되지 않는 정도 빼고는 모두 열어” [Reasons a farm wrote for an unconfirmed deposit or a late refund: there's no reason to hide those, right? Unmask everything except what is legally a problem.]
- My other prompts are in the [Prompt Log, Hyun Park section](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log#hyun-park).
- **Jinwoo · 2026-10-17, 19:02 → 20:07 KST · Codex (GPT-6 Astra) · DEV-56, PR #113:** see Section 5 (before → after).
- **Jinwoo · 2026-10-21, 13:16 KST · Claude Code (Claude Opus 5.5) · DEV-102, PR #205:** “다른 부분에도 비슷한 문제 생길일없냐” [Could the same problem happen anywhere else?]
- My other prompts are in the [Prompt Log, Jinwoo Jang section](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log#jinwoo-jang).
- **Zahra · 2026-10-13 · Claude Code (Opus 5.5) · DEV-31 plan review:** "what do you think of this updated plan? what did i miss? [Pasted text #3 +65 lines]"
- **Zahra · 2026-10-16 · Claude Code (Opus 5.5) · DEV-39 review:** "are you absolutely sure about your claims??? double check?"
- **Zahra · 2026-10-16 · Claude Code (Opus 5.5) · DEV-39, cross-check of Codex:** "okay now take a look at what codex did on issue 39. did it make any mistakes? are the tests done right? cross examine"
- **Zahra · 2026-10-20 · Claude Code (Opus 5.5) · SWPP-118:** "is this true??? Today's live server check (SWPP-118) caught it: the operator refunded ₩500, then did the final refund. The producer only saw a single ₩1,000 item, and only after that final refund."
- My other prompts are in the [Prompt Log, Zahra Gholami section](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log#zahra-gholami).

**Full input prompt log:** [Iteration 2 – Prompt Log](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log) ([branch/repository source](AI-Collaboration-Report---Iteration-2---Prompt-Log.md)). The page contains 141 privacy-redacted input records from the October 22 export snapshot. The eTL report can cite this Wiki URL without duplicating the full log. The selected examples and evidence register below remain for analysis.

### Source register

| ID | Exact conversation / artifact | What it supports and its limits |
| --- | --- | --- |
| E1 | [Plan iteration two tasks](codex://threads/01a12ada-447c-7860-8017-6e6bd4081482); turns listed under P1–P4 and P11–P12 | Initial plan, incorrect approval ownership, human corrections, and expanded monitoring. Local workbook: `outputs/iteration2_plan/farmclub_iteration2_plan.xlsx` in the coursework directory. This is a planning artifact, not proof the planned user tests occurred. |
| E2 | [Sync iteration 2 tasks to Linear](codex://threads/01a132ed-da89-70a1-8e75-49f59550f6fa); [I2 project](https://linear.app/sswp6/project/i2-b544a635c001); local `outputs/linear_i2/verification_summary.json` and `outputs/effort_format_2026-10-14/completion_summary.json` | October 13 import snapshot: 51 tasks, 77 dependency links, ten milestones, 25 stories. October 14 final verification: 128 effort-format changes across I1/I2. Planning and import counts describe different snapshots; no missing-task claim is inferred from their difference. |
| E3 | [Sync iteration 2 tasks to Linear (2)](codex://threads/01a143de-a800-7c41-9e9b-55bd3e803b58), and E2 review turns; [PR #106](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/106), [PR #107](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/107), [SWPP-89](https://linear.app/sswp6/issue/SWPP-89), [SWPP-90](https://linear.app/sswp6/issue/SWPP-90), [DEV-55](https://linear.app/sswp6/issue/DEV-55) | Review checklist, incomplete-description finding, checker implementation, and human-directed delivery split. Local `outputs/dev40-author-review.txt` records 26 contract checks with live jobs skipped. Archived `outputs/dev40-evidence/38878110841/spec-code-demo-matched-38878110841-1/report.md` says INCOMPLETE / model unconfigured. These historical artifacts establish neither current PR status nor a successful live model evaluation. |
| E4 | [Conduct PM internal testing](codex://threads/01a150e5-6ad8-7443-a3d3-fceca6abad88); [testing tracker](https://docs.google.com/spreadsheets/d/1hBCGjClrPTwlRG03FLmT1umpAaCCf6jKw1fsG7x2zog/edit); local `outputs/pm-testing-2026-10-19/pm-results.json`, `workbook-verification.json`, and `PM_Test_Report.html` | Final retained PM snapshot: 9 PASS / 6 FAIL / 3 BLOCKED; I-18 distinguishes readiness assessment from GO authorization. Earlier 3/1/14 and 9/3/6 results are intermediate snapshots. Eight recorded defect findings are not eight failed scenarios. |
| E5 | Current conversation, “Update Iteration 2 documentation” | Schedule reconciliation, PR #166 questions, and presentation preparation are secondary PM activities. The present report-writing requests are excluded from the representative activity prompts. |

Local artifact paths in E2–E4 are relative to the supplied ChatGPT-project workspace; E1's workbook is relative to the supplied coursework directory. Raw sessions, credentials, and account details are not reproduced.

### P1 — Request a substantive Iteration 2 plan

**Date:** 2026-10-11, turn start 21:09:44 KST. **Source:** E1, turn `01a12ade-748f-7062-87da-e1b2ce2f5d07`. **Tool/model:** ChatGPT/Codex; GPT-6.1 Sol

**Verbatim excerpt:**

> this is the schedule per iteration we have currently for our project. Our first iteration is ending today, and i'm the PM for the second iteration. below is a description of what the PM should do, and what we should be doing for the second iteration. Please suggest a plan for a list of appropriate tasks accordingly, as a highly skilled project manajer would, for the upcoming second iteration.

**Before → after:** The initial broad request was refined on 2026-10-11 at 21:28:14 KST, E1 turn `01a12aef-6707-7ad0-864c-011e5da61280`. The following complete request constrained both task quality and the review process:

> I like the workflow.
>
> based on our&#x20;
>
> - demo : [https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-1-demo/demo](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-1-demo/demo)
> - github : [https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-1-demo](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-1-demo)
> - proposal (in pdf files)
>
> please suggest a list of user stories we MUST consider, then create a list of tasks (small enough to estimate, has one clear owner, has an observable completion state, and produces visible output) for our second iteration. The list of tasks should be good enough quality to actually use in our iteration, so please take your time to think and logically create results. before uploading to the excel sheet, please give it to me first, I will review the quality then upload.

**Analysis:** The revision specifies estimability, single ownership, observable completion, and visible output. It also reserves human review before upload. These are actionable planning criteria against which an AI-generated plan can be evaluated.

### P2 — Correct accountability for approvals

**Date:** 2026-10-11, turn start 22:23:04 KST. **Source:** E1, turn `01a12b21-9967-7522-b928-c39ed2a20b78`. **Tool/model:** ChatGPT/Codex; GPT-6.1 Sol. **Complete request:**

> not jinwoo, hyun is in charge of the business approvals as our company is under his name.

**Analysis:** The preceding AI plan assigned the approvals incorrectly; the next response acknowledged and corrected that assignment. This is an observed error and human correction, not a hypothetical risk.

### P3 — Supply authoritative roles and story classifications

**Date:** 2026-10-11, turn start 22:42:21 KST. **Source:** E1, turn `01a12b33-3e46-7d23-a790-e42d1e693c80`. **Tool/model:** ChatGPT/Codex; GPT-6.1 Sol. **Complete request:**

> sorry these are the right roles. please re-coordinate and assign workers to the tasks, and give me the result in excel file format.
> zahra -> backend implementation (ai feature, app managing/manager's functions) + sns advertisement
> hyun ->  frontend implementation(consumer page) + backend implementation (consumer functions, payment) + accounting/financial/legal
> minsun -> pm + consumer communication
> jinwoo -> frontend implementation(producer page) + backend implementation(producer functions) + producer communication
>
> and please add a new classification for the user stories. label the user stories as: consumer, producer, app manager.

**Analysis:** This revision replaced incomplete role assumptions with explicit ownership and a common classification for planning.

### P4 — Extend testing beyond the consumer interface

**Date:** 2026-10-12, turn start 00:49:33 KST. **Source:** E1, turn `01a12ba7-b5be-7cd0-90f1-6739d6841a22`. **Tool/model:** ChatGPT/Codex; GPT-6.1 Sol. **Complete request:**

> good job, but after the two consumer tests, related producer functions and app manager functions should also be monitored, so add this each to zahra and jinwoo for both tests.

**Analysis:** The assistant added four monitoring tasks. This shows Minsun expanding the validation boundary to the effects of consumer activity on other roles; it does not prove the proposed tests were later conducted.

### P5 — Transfer agreed work into the team's tracking system

**Date:** 2026-10-13. **Source:** E2, turn `01a132ee-467a-7742-bbfc-e81e0e1ce59f`; preceding source link points to the planning sheet. **Tool/model:** ChatGPT/Codex; GPT-6.1 Sol. **Verbatim request-text excerpt:**

> can you update all the tasks for iteration 2 made here, into our group's linear?

**Analysis:** The transfer initially stalled on tool access. The later import and verification artifacts, rather than the request alone, support the recorded task/dependency counts.

### P6 — Make human and agent effort separately visible

**Date:** 2026-10-14. **Source:** E2, turn `01a139bd-3e20-7293-af63-c262177898f6`. **Tool/model:** ChatGPT/Codex; GPT-6.1 Sol. **Verbatim excerpts from one request:**

> For each issue we created for iteration 2, I want to make it easier to mark effort. Therefore, for all of the iterations, I want to change the content as below, all into the same format. please do so:&#x20;

> ### **Effort: Estimated (Human: 3 / Agent: 0) → Real (Human: / Agent: )**

**Analysis:** The final verification distinguishes 128 updated I1/I2 issues and preserves unknown values. The format supports later evaluation; it does not establish that actual hours were filled in or that AI saved a measurable amount of time.

### P7 — Request a review tied to specifications and human verification

**Date:** 2026-10-16, turn start 17:00:02 KST. **Source:** E2, turn `01a143b9-a5d7-7833-bf05-5da6f38a7bff`. **Tool/model:** Codex; GPT-6.1 Sol. **Complete request:**

> Please perform the repository’s pr-review review of [https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/106](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/106).
> Read AGENTS.md, .agents/skills/pr-review/SKILL.md, the changed specification, and the SWPP-89 task section. Compare them with the PR changes and description.
> Check whether the checklist clearly records the applicable specification, implementation location, verification evidence, and actual human reviewer. Check that existing content is preserved and documentation-only PRs are handled.
> Return the review here using the repository’s must/should/nit format. Explain any required corrections in beginner-friendly language.

**Analysis:** The review of commit `5421832` found that the description lacked the completed checklist example and other required fields. On October 16, turn `01a143c2-e55d-7ee3-845a-c00840b3a405`, the assistant explicitly acknowledged that its earlier example left the description incomplete. The chat supports the correction request and revised guidance, without proving which text Minsun personally hand-edited.

### P8 — Remove an avoidable dependency without misrepresenting completion

**Date:** 2026-10-16. **Source:** E3, turn `01a14401-4f27-7a82-8e8f-fd77668afb6e`. **Tool/model:** Codex; GPT-6.1 Sol. **Complete request:**

> can we separate this part into a follow-up development task on linear, then merge the first development parts first into the main branch? further communication and meetings are needed to go on with the Claude API key, but I dont want this to be stopping other developments

**Analysis:** The subsequent record separates disabled core infrastructure in DEV-40 from live API/model evidence in DEV-55 and retains human approval as a merge requirement. This is a substantive PM decision about delivery scope, not evidence that live AI checking succeeded.

### P9 — Execute internal tests while preserving failure evidence

**Date:** 2026-10-19, containing turn start 06:22:55 KST. **Source:** E4, turn `01a150e5-6d47-7d11-9e77-801c1cdaf407`. **Tool/model:** Codex; GPT-6.1 Sol. **Verbatim excerpt:**

> After performing all tests, please follow the guide to provide detail on test results and possible failure. If any tests fail, please flag them first without making any changes.

**Analysis:** The request covered repository and deployed-site testing. The report records failures and missing access rather than treating the requested scope as completed execution.

### P10 — Preserve an unresolved access limitation

**Date:** 2026-10-19, containing turn start 06:47:03 KST. **Source:** E4, turn `01a150fb-83cf-77e1-a53a-dba5c72dea16`, user reply to operator-access question `call_4lussSUxJwZuu1tvOAUUU1Xh`. **Tool/model:** Codex; GPT-6.1 Sol. **Complete user answer:**

> Record the operator tests as blocked

**Analysis:** The user also completed Kakao authentication during this turn and later supplied access to an approval page. The final report still kept unsupported refund/recovery and physical-device checks blocked. Access to one operator function was not generalized to assurance over all operator functions.

### P11 — Specify the delivery timeline, two test rounds, and a specification-to-code review gate

**Date:** 2026-10-12, turn start 00:37:34 KST. **Source:** E1, turn `01a12b9c-bc7d-7f63-a10c-72331a4e64b5`. **Tool/model:** ChatGPT/Codex; exact GPT-6.1 Sol. **Complete substantive request:** The source’s original escaping and entity text are preserved below; a separate empty user message in the same turn is omitted.

```text
please revise the excel plan by taking all these revising considering all of these new decisions:



\- Timeline overview:\
&#x20; 1\. 10/11\~12: finalize functions/scope/user stories/acceptance criteria, schedule + task coordination\
&#x20; 2\. 10/13\~16: finish main implementation(13), finish supplementary implementation(14,15), producer data loading + internal mock testing (16)\
&#x20; 3\. 10/17: user testing 1 (payment X)\
&#x20; 4\. 10/18\~19: revise through feedback\
&#x20; 5\. 10/20: check PG approval, user testing 2 (payment O), finalize\
&#x20; 6\. 10/21: midterm presentation\
&#x20; 7\. 10/22: final revision, review meeting, etc..\
&#x20; 8\. 10/23: submit



-testing 1: a pool of consumers consisted of 6\~10 people will be given a link to download the app, and will be asked to test all the consumer functions, excluding the payment function.

-testing 2: the same pool of consumers will be asked to test all consumer functions once again, but this time, including actual payment for at least 1 order.

consumer functions will be checked by hyun, producer functions by jinwoo, app manager functions by zahra, minsun will be the coordinator and organizer, manager(testing environment, contact, conduct)



workflow revisions: pm needs to check sync for all (spec file)<→2(code) before review-> add as task

1. 코드 작업(커밋) 부분
   1. spec file
   2. code (dev)
2. 1(spec file)<→2(code) sync 되어야 하는데, 아닌 경우가 발생
   1. (권장) 1 진행 → 2 진행
      1. 2부터 해도 되는데, review 전에는 sync 맞춰야함
   2. git action에서 ai 확인해줬으면 함. → iter2 pm(@violetsunshades )
```

**Analysis:** This prompt provides dates, two distinct test scopes, participant continuity, role ownership, and a review prerequisite. It connects implementation to feedback and re-testing, while explicitly requiring specification/code alignment before review. The subsequent response records a revised workbook with separate October 17/20 tests and the AI-assisted review task; it keeps unavailable live payment as a blocker. This is evidence of the resulting plan, not of completed participant testing or successful payment.

### P12 — Establish implementation status before assigning scope

**Date:** 2026-10-11, turn start 22:28:58 KST. **Source:** E1, turn `01a12b27-00ee-7a72-9cf1-60a7b9c5a591`. **Tool/model:** ChatGPT/Codex; GPT-6.1 Sol. **Complete request:**

> can you check which user stories are already implemented, and what user stories should be classified as main function/supplementary functions

**Analysis:** The request asks AI to distinguish the existing implementation baseline from the priority of remaining work. The response separates implemented, partially implemented, and unimplemented stories, and states that it inspected the repository/demo rather than executing the service. This distinction helps prevent code inspection from being reported as runtime verification.

</details>

## 3. What AI Did Well

**Minsun — planning and coordination:** The initial planning request became more useful through correction. AI incorrectly assigned business and PG approvals to Jinwoo; I corrected ownership to Hyun and subsequently supplied the complete role allocation. I required estimable tasks with one owner, observable completion, and visible output, reserving review before upload. I also required consumer, producer, and manager story classifications, then added producer and manager monitoring after both consumer tests. These interventions changed the plan from a collection of individual tasks into a coordinated workflow across roles. The October 13 transfer record verifies 51 tasks, 77 dependency links, ten milestones, and 25 stories. A separate October 14 record verifies effort-format updates across 128 I1/I2 issues; that number must not be presented as 128 Iteration 2 tasks. [P2–P6; E1–E2]

**Minsun — review governance and delivery scope:** For SWPP-89, I requested explanations before applying the specification-to-code checklist and asked for review against the repository rules. This exposed a concrete weakness: the AI’s earlier PR-description guidance had left required information incomplete. The subsequent review required the missing evidence and reviewer fields. For DEV-40, AI implemented checker infrastructure and recorded 26 local contract checks, but genuine model validation remained unavailable. I requested a separate follow-up, DEV-55, so API-access discussions would not block the disabled core infrastructure. This preserved the distinction between tested infrastructure, successful model evaluation, and human approval. It did not establish that the checker could already detect real specification mismatches. [P7–P8; E3]

**Minsun — internal testing and limits of assurance:** I directed AI to test the deployed consumer and producer flows and report failures before making changes. When operator access was unavailable, I explicitly chose “Record the operator tests as blocked”; testing resumed when an approval page became available. The retained October 19 evidence records 18 PM scenarios: nine PASS, six FAIL, and three BLOCKED. Approval succeeded, while product creation and approved-producer re-login failed; public-product editing, operator refund/recovery, and physical-device checks remained blocked. Crucially, the readiness-assessment scenario’s PASS meant that assessment was performed, not that release readiness was established. The report withheld full sign-off. These results strengthened visibility into risk without converting limited execution into comprehensive assurance. [P9–P10; E4]

**Hyun — admin web in four days:** At the start of I2 there was no operator screen; operators used Swagger. Between Oct 19 and 22 the agent built producer approval, supply approval, test-farm hiding, the user list and user detail, and then CI and auto-deploy for the admin web ([#168](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/168), [#170](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/170), [#179](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/179), [#202](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/202), [#211](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/211), [#213](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/213), [#228](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/228)). The six PRs with numbers record about 6.9 agent hours and 10.3M tokens. AI helped most here because the screens share one pattern and the server rules already existed.

**Hyun — live bug and self-checks:** Producers could not add a new product on the live server because source analysis is off there; the agent found the cause and routed new products back to the manual flow ([#174](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/174), DEV-84; Linear: Human 0.2h / Agent 1.3h). Tests also caught the agent's own slips: in DEV-68 ([#141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141)) it overwrote `done.tsx` with an empty file and the e2e run failed before I reviewed.
**Jinwoo — source-analysis pipeline:** Over Oct 14–17, Codex built the grounded extraction backend and then upload, Gemini OCR, a budget cap, and the producer review and editing screens ([#104](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/104), [#113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)). It kept a cost log for every paid call: the checked UI run cost $0.011 for 6 OCR calls and one extraction, and after [#130](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/130) the cumulative paid total was $0.060 under a $0.50 cap (#130 itself added $0.035). When I asked it to find "anything that can certainly be fixed" in the OCR errors, it added per-candidate checks and blocked contact details from leaking into fields; candidate precision on the same fixed set went from 7/8 to 17/18, while OCR misreads it could not ground were left as they were rather than auto-corrected ([#130](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/130)). These are repeated development sets, not an independent accuracy test, and the PR does not claim the change caused the gain.

**Jinwoo — production bug from a one-line report:** A producer said the farm photo upload "says the connection is unstable." Claude Code read the production logs and database read-only, found the 500 (the app saved the photo as a base64 data URL in the profile field), and added a public upload API. When I asked whether the same problem could happen elsewhere, it found the same pattern in product photos and news attachments, made those fields reject data URLs with 400 instead of 500, and added a migration for existing base64 photos. Chat attachments (still in Postgres) and the remaining checks I split off as DEV-103/105 ([#205](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/205)).

**Zahra — one agent reviewing the other's plan:** Each review round checked the plan against the code, not just the text, and found problems before any code existed. Examples: DEV-35 "Payment.status can't hold PARTIALLY_REFUNDED" (fixed in the plan before [#114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114)); DEV-39 "AC-32-4 verification is backwards" (fixed before [#119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119)). Time saved: not measured.

**Zahra — test data on the live server (DEV-93):** I had a purge command and a plan for an extra guard flag, and asked: "I think I may be complicating things. how would you recommend addressing this issue? what is the common practice?" Claude Code recommended hiding test farms instead of deleting them, which became `retire_test_farm` ([#192](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/192)); a delete API is left until the policy is decided.

**Estimated time saved:** Not measured. The retained verification files establish the reported task and test counts; these counts do not establish causal productivity gains. [Other members: add cases and verification.]

## 4. Hallucinations / Errors

**Minsun — incorrect accountability:** The initial AI plan assigned business/PG approvals to Jinwoo. I caught the contextual error and corrected ownership to Hyun, under whose name the company was registered. The next response acknowledged the error; the role allocation was revised (E1/P2–P3).

**Minsun — incomplete review guidance:** The PR #106 review found that the earlier AI-guided description omitted required evidence and reviewer fields. Follow-up guidance acknowledged the incomplete example and supplied the missing structure (E3/P7). Both cases caused clarification and rework; elapsed cost was not measured. [Other members: add errors or the reviewed basis for identifying none.]

**Hyun — wrong safety comment on deploys:** In DEV-65/66 the agent's workflow comments said a manual run deploys `main`; it actually deploys whichever branch is picked. A teammate noticed. [#143](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/143) (DEV-70) added a `main` check and a `production` Environment, and I moved the tokens myself.

**Hyun — order-dependent tests:** Twice the agent compared `created_at` order under a fixed test clock, where rows share a timestamp ([#123](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/123); [#213](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/213), which failed only in the full run). Both now compare by ID or as a set.

**Hyun — other errors:** The DEV-86 runbook ([#177](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/177)) described a masking confirmation screen the product does not have. In [#212](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/212) a `sed` also changed another issue's status line and Prettier reformatted whole files; both were reverted. Once, updating a PR body, it replaced the whole body and deleted an image I had uploaded. There is no repository record of that one; it led to the "read the current body first" rule in [#231](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/231).
**Jinwoo — "done" while image/PDF quality was unchecked:** On Oct 16 Codex reported #113 as implemented with CI green. The text cases passed, but the two simplest image and PDF fixtures ("감귤 5kg") produced no accepted result. It had noted image/PDF checking as "remaining" but did not say the simple cases already failed. I caught it by asking to see the generated output. Cost: the OCR fix and re-evaluation took the rest of the evening and the next afternoon (session `01a1442e`, Oct 16–17).

**Jinwoo — wrong claim about storage:** In DEV-102 Claude Code first said chat attachments use R2. It guessed before reading the code; reading the code showed they are Postgres `bytea`. It corrected itself in the same session, so the cost was small (not measured), and the storage move became DEV-103 ([#205](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/205) PR body).

**Jinwoo — tour written for the Mock screen:** The text the agent first wrote for step 4 of the DEV-109 help tour (and step 5 with it) described the Mock UI, not the deployed one (no photo/source slots in "new product"), because it had developed and checked the tour in Mock mode. I noticed in the running app ("이거 지금 메인 ui맞냐?"); the cost was rewriting those steps against the real screen (time not measured) ([#218](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/218) PR body).

**Zahra — "cases are in place" read as done, but no test had run:** Codex worked in a new worktree without `node_modules` or `server/.venv`, so `npm run test:mock` and `pytest` stopped before running. It did say it couldn't run the suites, but its summary led with "I implemented the report flow…" and ended "The new pytest, Mock, and Playwright cases are in place," which reads like a pass. When Claude Code ran them, 4 of the new server tests failed (207 passed); the migration was still pending, as Codex had noted. I caught it by asking Claude Code to cross-examine Codex's work. Cost: a fix round on [#119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119); it also became two team rules in `AGENTS.md` (prepare the worktree first; tests written but not run = not done), [#117](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/117).

**Zahra — review claims from skimming:** In the DEV-39 plan review Claude Code said tests should be named by story ID "as in the rest of the suite" (backwards: 128 server tests use `test_AC_xx_y_…`, 9 use story IDs) and suggested attaching reports to a Langfuse score (Langfuse is not wired into the server). After "are you absolutely sure about your claims??? double check?" it re-read the code and withdrew both. Cost: a few minutes; without the check, both would have gone into the plan.

**Zahra — inference written as observation:** The SWPP-118 report said the producer "only saw a single ₩1,000 item, and only after that final refund." The ₩1,000 line was in my screenshot, but nobody opened the producer app between the partial and the final refund; the "only after" part came from reading the code (`apps/producer/src/app/ship.tsx:123` lists only `REFUNDED` orders). I caught it by asking "is this true???". Corrected in [#198](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/198) to say it was confirmed from code.

**Zahra — wrong iteration dates for the session export:** When I asked Claude Code to run the Session Exporter, it guessed the I2 range as Oct 18–23 from the tutorial's example dates instead of checking the I2 project in Linear (Oct 11–23). That dropped 14 sessions, including all my Codex sessions. I noticed my Codex sessions were missing; checking the I2 project in Linear gave Oct 11–23. Cost: about 15 minutes and a second dry run.

## 5. Prompt Revisions

**Minsun · 2026-10-11 · ChatGPT/Codex (GPT-6.1 Sol) · planning (E1/P1):**

- **Before — verbatim excerpt:** “Please suggest a plan for a list of appropriate tasks accordingly, as a highly skilled project manajer would, for the upcoming second iteration.”
- **After — verbatim excerpt:** “please suggest a list of user stories we MUST consider, then create a list of tasks (small enough to estimate, has one clear owner, has an observable completion state, and produces visible output) for our second iteration.”
- **Why the revision worked:** It made task quality assessable through size, ownership, completion evidence, and visible outputs. The same revised request reserved review before upload. Subsequent prompts corrected role assignments and added producer/manager monitoring; the generated workbook and transfer records document the resulting plan (P1–P6). [Other members: add revisions.]

**Hyun · 2026-10-18 → 2026-10-21 · Claude Code (Claude Opus 5.5) · PostHog masking (DEV-71 → DEV-104):**

- **Before (sent in English):** “Add any new producer screens that show personal data to the masking list, then rerun the tests and the AI first-pass review.”
- **After (sent in Korean):** “너무 다 지운거 아닌가?” / “개인정보만 가리게끔한다.” / “법적으로 문제되지 않는 정도 빼고는 모두 열어” [Isn't too much blanked out? / Mask personal data only. / Unmask everything except what is legally a problem.]
- **Why the revision worked:** “Screens that show personal data” let the agent mask whole screens by path, labels and buttons included. The legal line gave it a test it could apply field by field. In [#212](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/212) only names, contacts, addresses, delivery notes, tracking numbers and account numbers are masked; labels, buttons, the seller's public details and the reasons farms write stay visible.
**Jinwoo · 2026-10-17 · Codex (GPT-6 Astra) · producer page editor (DEV-56, PR #113):**
- **Before:** “그리고 이거 내용 수정하는거 걍 미리보기 화면 쭈루룩 나오고 그 화면에서 바로 고칠수있는 스타일로 다시 만들어봐.. 지금 너무 시안성이 떨어진다” [Rebuild the content editing so the preview runs down the page and you edit right there. It's too hard to read now.]
- **After:** “걍 그 점선 둥근 사가경에 + 가운데 박아놓고 추가하세요 그 ux 모름? 글케 하면 되잖아..” / “연필이랑 x는 그 카드 최상단에 오버레이 해놓으삼. 뭔말알? 카드에 텍스트/파일 꽉차게 하라고. 카톡 첨부파일 넣을때처럼..” [Just put a + in the middle of a dashed rounded box, the usual "add" UX. / Overlay the pencil and x at the top of the card; fill the card with the text/file, like adding an attachment in KakaoTalk.]
- **Why the revision worked:** Asking for an editor-like view left the layout to the agent, and between 19:02 and 21:16 it took eight plan → implement rounds. Naming a UI the agent already knows (dashed "+" box, KakaoTalk attachment card) gave it a concrete target, and the later rounds were small fixes (icon position, placeholder text).

**Jinwoo · Oct 16–19 · Codex · plan mode when I could not name what I wanted:** Often I did not know the right term for a UI part or a technical option. Instead of guessing a name and getting the wrong thing built, I switched to plan mode: the agent wrote down what it would build, naming the parts in its own words, and I corrected the plan in plain language before any code was written. I approved 23 plans this way ("Implement the plan."), and when a request was still vague I asked for the plan first: “계획 세우고 해” [Make a plan first] (Oct 17, 20:37) and “계획한 다음에 ㄱㄱ” [Plan it, then go] (Oct 19, 23:03).

**Zahra · 2026-10-18 · Claude Code (Opus 5.5) · message to the PM about test scope:**
- **Before:** "can you write a message I could clarify the extent of the tests I have done"
- **After:** "say it like this: I have just updated the test results on the google sheets and everything passes now. Just to clarify, the tests are done locally and I have not done data-changing actions on Railway to keep the shared seed clean for Test 2. […]"
- **Why it worked:** The first version left the agent to guess what "extent" meant. Giving the actual facts (local only, no data changes on Railway, why operator records can't be checked yet) left it only the translating and shortening.

**Zahra · 2026-10-20 · Claude Code (Opus 5.5) · DEV-93:**
- **Before:** "examine the pr and the workflow of how deletion works very carefully … and then examine this plan and see if it makes sense"
- **After:** "I think I may be complicating things. how would you recommend addressing this issue? what is the common practice?"
- **Why it worked:** The first prompt asked the agent to check my solution, so it reviewed the purge script in detail. Asking for the common practice let it question the approach itself, and the answer (hide, don't delete) was smaller and safer.

## 6. Manual Fixes and Why

**Minsun:** The ownership error required re-planning; incomplete PR guidance required clarification and description rework. Their elapsed costs were not measured. My corrections were made through explicit instructions; the accessible record does not establish which final repository lines I edited manually. Assistant-authored review fixes must therefore not be reported as my manual code fixes. Likewise, no defensible time-saving estimate follows from task counts or test counts. The evidence supports improved organization and traceability, while causal productivity gains and full-team session coverage remain unmeasured. [E1–E4]

The documented human interventions changed ownership, validation scope, and the DEV-40/DEV-55 delivery boundary through prompts. No specific hand-edited repository lines can be attributed to Minsun from these records. [Other members: add manual edits with file/line or PR evidence.]

**Hyun:**

- **Payment rules (DEV-68, [#141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141)):** at the proposal stage I dropped collecting a refund account from each buyer and decided refunds go back to the account the money came from, with a 24-hour deposit deadline and no approval request for a farm without an account.
- **Production data (DEV-72):** the agent wrote a guard PR ([#149](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/149)), but the cause was seed farms approved before DEV-68 with no account. I closed it and ran the backfill SQL in the Railway console myself.
- **Test accounts (DEV-107, [#213](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/213)):** the plan reused `is_test_account`, which also allows Mock login by ID alone; setting it on a real user would have opened their account. It became a separate column.
- **Stacked PRs:** I ran admin-web work in parallel sessions, and some PRs were based on another work branch instead of `main` ([#179](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/179), [#211](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/211), [#213](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/213)). After squash merges this gave conflicts, one merge without CI re-running, and colliding Alembic numbers (0017 → 0018 in #213, 0014 → 0016 in #121). I sorted these out by hand and then wrote the no-stacking and `alembic heads` rules ([#231](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/231)).
**Jinwoo:** I did not edit product code by hand in I2; changes went through prompts, and one PR body says so explicitly ([#104](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/104): "사람이 수정한 코드 없음"). What I did by hand:
- **Logo placement (DEV-85, [#173](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/173)):** the agent proposed placements; I picked the wordmark as default, rolled back the enlarged symbol, and nudged the combined logo 16px left by eye. These are recorded as human decisions in the PR body.
- **Effort hours (Oct 18):** the agent drafted Linear effort lines from the session logs but put agent time far too low for coding-agent work; I corrected the numbers in the markdown myself before they went to Linear.
- **Credentials:** Railway login and SSH key registration (Oct 19, 21), because they need my account.

**Zahra:** As far as my session records show, product code changes went through prompts. What I did by hand:
- **Railway access (Oct 19):** CLI login, a new SSH key registered with Railway, and getting the operator token, because they need my account.
- **Live-server check (SWPP-118, [#189](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/189)):** I checked the producer and consumer apps on screen and sent screenshots; the agent could only call the API.
- **Scope on shared data:** after hiding my test farm, the agent offered to hide the other members' test farms the same way. I said no ("don't touch other people's test farms").
- **Effort hours:** I gave the human and agent hours for DEV-93 and the live-server testing myself instead of letting the agent estimate them.
- **Test sheet:** pasted the results into the team Google Sheet myself.

## Session History and Privacy Review

Before drawing iteration-level findings, review relevant Codex and Claude Code interaction histories for **all team members**. The Session Exporter can help collect local sessions for the project and date range; it may not include Codex Cloud, Claude remote work, or Claude Cowork records. Keep those limitations in mind when describing the review.

- [ ] Used the team repository’s absolute path and the full iteration date range (local timezone; record timezone): [path/date range/timezone]
- [ ] Ran `export_sessions.py` with `--dry-run` first; reviewed selected and excluded sessions, exclusion reasons, privacy findings, and final re-scan.
- [ ] Exported only after review; inspected the temporary review folder and confirmed it before creating the ZIP.
- [ ] Checked for API keys, tokens, passwords, `.env` contents, names, student IDs, other personal information, and `omitted_line` records. Add `--redact-term` for sensitive terms not detected automatically; rerun and review the new export.
- [ ] Confirmed the final ZIP contents and manifest privacy summary; did not rely on automated redaction alone. If an actual secret was exposed, revoked and replaced it.

**Minsun’s review record:** Prepared on 2026-10-21, Asia/Seoul, from selected records dated October 11–21. This is a member contribution draft, not the October 23 deadline snapshot or a completed team report.

The reviewed records are E1–E5, with the specific quoted turns and local verification artifacts above. **October 22 export update:** the course Session Exporter (0.1.0, commit `3251f6338e647fda5e7abb6f6108f6f176b5ae9f`) was used to stage and review 20 relevant local sessions plus one explicitly labelled supplemental continuation for the October 12–23 window (Asia/Seoul). The local snapshot contains activity through October 22; final re-scan and archive-integrity checks passed, with no unreadable lines omitted. The [input-only Prompt Log](AI-Collaboration-Report---Iteration-2---Prompt-Log) contains 141 retained records with additional device/proxy redactions for publication. Raw session ZIP/JSONL and responses remain private. This is not a completed all-members or deadline-final review; the team-level checklist above remains unchecked.

The supplied shared URLs [6ad858b0…](https://chatgpt.com/share/e/6ad858b0-e5b0-8342-805d-20685f154aa1) and [6ad85923…](https://chatgpt.com/share/e/6ad85923-43c4-8343-86d4-10ebb491cca5) could not be read: the first reached an authentication error and the second displayed a login dialog. No claims or quotations are attributed to their unseen contents, and no equivalence with a native thread is assumed. The supplied filesystem paths identify workspaces, not independent chat transcripts.

**Hyun's review record:** Prepared on 2026-10-22, Asia/Seoul. I have not run the Session Exporter yet. I read the 12 Claude Code session files kept locally for this repository's worktrees; they only cover Oct 18–22, so for Oct 12–17 (DEV-32, DEV-60, DEV-65 to DEV-69) I rely on the PR bodies and Linear. Prompts that contained contact details or a business document are left out of this report and the Prompt Log.
**Jinwoo's review record:** Prepared on 2026-10-23, Asia/Seoul, with Session Exporter 0.1.0 (commit `3251f63`). `--repo` pointed at the project folder that contains the repository, because my sessions start there and move into worktrees; with `--repo` set to the repository itself all four candidate sessions were excluded for that reason. The export selected 10 sessions (3 Codex, Oct 16–19; 7 Claude Code, Oct 21–23) with 376 input records. Oct 11–15 (DEV-51/52/54) is not in my local history; for that work I rely on the PR bodies cited in Section 1. The automatic redaction missed one team API key pasted into a prompt; that prompt is not quoted anywhere, and I deleted the ZIP after the review. Prompts with credentials, links to team documents, production data, or rude wording are left out of the Prompt Log.

**Zahra's review record:** Prepared on 2026-10-23, Asia/Seoul, with Session Exporter 0.1.0 (commit `3251f63`), `--repo` set to the repository, Oct 11–23 (local time). The export selected 22 sessions: 13 Codex (9 of them Codex's automatic approval-review subagents) and 9 Claude Code, about 300 input records. I left out three sessions that were not project work (translating team chat, a study-guide prompt for another class, and the export session itself) by pointing `--claude-home` at a copy without them. Added `--redact-term` for my full name. Final re-scan passed; 3 `omitted_line` records; a manual search found no remaining API keys, tokens or database passwords. The ZIP is kept privately. Prompts with credentials, links to team documents, or teammates' messages are left out of the Prompt Log.

[Add team reviewers, exporter version/commit, full iteration range, private export location, and completed privacy-review details when available. Do not publish raw session ZIPs or credentials.]

## 7. Takeaway for Iteration 3 (optional)

**Minsun’s reflection:** This collaboration illustrates how AI can support the development of engineering judgment when students actively interrogate its output. Correcting ownership exercised contextual reasoning; defining dependencies required prioritization; retaining BLOCKED results required an honest account of uncertainty. Academic progress should be assessed through these decisions, their evidence, and the student’s ability to explain them. In the next iteration, I will record rationale and actual effort alongside AI-assisted work, verify claims against project artifacts, and preserve unresolved cases. AI is most educationally useful when its suggestions become material for criticism, testing, and revision, with students retaining authorship of the reasoning and responsibility for the outcome.

**Hyun's reflection:** Most of what went wrong for me in I2 was process, not code: stacked PRs, colliding migration numbers, tests that depend on row order, a PR body overwritten. Most of these happened two or more times before I turned them into rules ([#231](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/231)). In I3 I want to write the rule after the first repeat. I also want tokens recorded in every PR; about half of mine have none, which is why the totals above are lower bounds.
**Jinwoo:** Describe UI by pointing at a pattern the agent already knows instead of adjectives; when I can't name it, start in plan mode and fix the plan, not the code. Ask the agent to list what it has not verified before it says "done."

**Zahra:** Before accepting a report, ask the agent which parts it ran or saw and which it inferred from code. Have one agent check the other's work, but only after the worktree has its dependencies installed.

[Other members: add a takeaway; consolidate the final team conclusion before submission.]
