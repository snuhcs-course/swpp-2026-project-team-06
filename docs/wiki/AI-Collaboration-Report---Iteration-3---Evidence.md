# AI Collaboration Report – Iteration3 – Member Evidence and Selected Inputs

The first three contributions below are preserved from repository revision28feb94. Their dated observations and limitations are the authors’ records; retaining them does not establish a new central full-history audit. Minsun’s selected contribution follows. Only curated input examples are published; full raw transcripts remain private.

[Return to the team report](AI-Collaboration-Report---Iteration-3).

---

# AI Collaboration Report – Iteration 3 – Jinwoo Jang

Personal contribution · Review feedback incorporated on November 6, 2026.

Period: October 28–November 6, 2026, Asia/Seoul, following the I3 project dates in Linear.

**Records reviewed.** I used the course Session Exporter 0.1.0 (commit `3251f6338e647fda5e7abb6f6108f6f176b5ae9f`). After choosing a partial export, I selected two project sessions: one Claude Code conversation about the architecture early in I3, and one Codex conversation about HE follow-up and AI evaluation later in I3. The input-only derivatives contain 64 user-role text records (58 + 6). The official tool completed a dry run, local ZIP export, and final re-scan of these derivatives. This is not a review of the entire iteration, every team member, or all model responses.

The initial discovery found 75 candidate sessions. I stopped the full-response export during its lengthy final regular-expression scan. A separate classroom-exercise session was excluded after checking that it was not project work. Tool responses, attached images, and file-history backups are excluded from the excerpts; student-ID patterns were additionally redacted. The successful privacy checks apply to the input-only excerpts, not the complete original histories. The local ZIP and original logs are not published.

**Tools and models.** The selected session metadata records Codex with `gpt-6.1-sol` and Claude Code with `claude-opus-5-5`. Gemini, which the product calls, is separate from these development agents.

## 1. Where AI Was Used

During I3, I used coding agents to address remaining heuristic-evaluation feedback, fix chat display errors, strengthen the AI evaluation system, and improve factual preservation in product drafts. The agents investigated code, implemented changes, ran regression tests and measurements, and drafted documentation. My role was to set the scope, question what the results meant, request evidence I could inspect, and decide what to accept after review.

For HE follow-up, the agent fixed the analysis button remaining disabled until the first text input lost focus, and moved error feedback closer to the next-step controls ([#458](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/458)). For chat, it used the server's stored sequence to prevent a question and its AI reply from swapping positions when they shared a timestamp, and hid internal handoff reasons from message bubbles ([#463](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/463)). The evaluation tool checks actual model calls and code, data, and runtime versions, and reports repeated trials separately from persisted outcomes ([#465](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/465)).

I later separated draft improvement from chat improvement. The draft instructions were changed to require every number and unit in a generated sentence to cite its supporting candidates, and to preserve safe facts even when their candidate had already been cited elsewhere. Existing checks for money, health claims, personal information, and unsupported numbers were retained. These changes are under review in [#464](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/464); they are not reported as merged or deployed.

## 2. How I Revised the Prompts and Scope

The initial request was to resolve remaining HE issues and show numerical improvements in AI chat and draft generation. As work progressed, I asked whether the measurements used a development set, whether chat had a holdout set, and whether evaluation inspected the internal execution process. A claim that the results were better did not explain which capability had improved.

When the evidence was insufficient, I asked for root-cause analysis first. That investigation separated unnecessary chat handoffs from missing draft citations. I then narrowed the next change to drafts only so that a smaller treatment could be compared under the same conditions. Results from a development set used for improvement should not be presented as fresh independent validation.

I applied the same approach to documentation and recordings. I requested a visible sequence of uploading an image, extracting text, editing it manually, publishing it, and checking the consumer result. I also requested Korean drafts of the HE and AI collaboration reports for review before publication. This kept the agent's investigation and execution separate from the human decisions about acceptance and publication.

## 3. What AI Did Well

AI was useful for tracing a problem across multiple layers. The chat ordering investigation connected identical server timestamps with the UI's secondary sorting by random message ID. For drafts, the agent followed information from the source through extracted candidates, citations, rejected sentences, and the final output to locate where facts were lost.

Keeping execution evidence alongside tests was also useful. The independent failure-diagnostic tests produced 54 failures and 14 passes on the old implementation, then 68 passes after the change. The related regression suite passed 812 tests. These results support the diagnostic change and regression checks; they do not establish the semantic accuracy of generated answers.

For draft-stage measurements, the extracted candidates from the existing 47 materials were frozen and each arm was run three times. Under the unchanged scorer, fact hits increased from **683/1062 to 699/1062**, and critical-fact hits from **313/462 to 321/462**. Forbidden-content detector counts changed from **6 to 5**, while unsupported tokens remained **2 to 2**. The denominators repeat 354 facts and 154 critical facts three times; they are not counts of distinct new facts.

This was an observed development-set improvement at the refinement stage, not proof of full image-analysis quality, holdout acceptance, or production accuracy. I subsequently asked to prioritize the reports and stop further performance work. Existing full-pipeline logs were preserved; this report presents only the checked refinement-stage comparison. Semantic review also found an upper count bound being rewritten as an approximate count. We therefore did not treat the higher surface score as proof that semantic quality had not regressed. A follow-up qualifier-preservation check was implemented, but paid evaluation of that version was not started before work stopped.

## 4. Errors and Limitations

The main risk was confusing successful execution, passing tests, and model quality. An early chat measurement included safe fallback responses after a provider authentication error. Without separating those from successful model responses, the score could be mistaken for model quality. The evaluation was strengthened to check the actual model, response ID, usage, and route, and the earlier record was not treated as valid model-quality evidence.

All 30 answerable-question trials in the public chat development set took the rule path. Their high score therefore did not establish that model-generated answers were being validated well. Independent evaluation still found unnecessary handoffs on answerable questions. Some post-model handoffs could not be fully diagnosed because the original model response and guard-specific rejection codes had not been retained.

The earlier draft decrease from **222 to 218/354** also could not be explained by the aggregate score alone: it included OCR and extraction failures. In another case, the model combined package weights with piece counts but omitted the weight candidates from its citations, causing the sentences to be rejected. The appropriate fix was more complete generated citations, rather than removing the validator. The strict scorer can also miss equivalent Korean wording or spelling variants, so its score was not presented as complete semantic accuracy.

Evaluation setup itself caused rework. The first refinement run preceded corrections to the gold-file connection and common runner. Its outputs and cost were retained as diagnostic evidence and excluded from the paired comparison. This exclusion was based on the execution protocol, not on selecting a favorable score.

## 5. Human Decisions and Review

I asked the agent to establish the current status before assigning more work. I deferred onboarding and post-change user testing to the next iteration, and focused this iteration on bugs and AI measurements. I also questioned the source of benchmark numbers and the meanings of development sets, holdouts, repeated trials, and internal-process evaluation.

I confirmed that I had read the diffs for #458, #463, and #465 and approved their merges. I kept #464 on hold when its quality evidence was insufficient. After reviewing the root-cause findings, I narrowed the next improvement to drafts. I did not write every implementation line or manually execute every test. The agents performed implementation and measurements; scope, priorities, review, and publication decisions remained my responsibility.

Human hours, active agent hours, and total tokens were not measured precisely for this work, so I do not invent totals. Session elapsed time is not treated as active work time, and token totals from overlapping agents or resumed sessions are not added without checking for duplication.

## 6. Lessons and Next Steps

I learned that evaluating AI agents requires several methods together. Regression tests check existing behavior; repeated measurements under the same conditions expose variation; execution traces and semantic review help explain what the outputs actually mean. The draft score increased, but numerical metrics alone missed an upper bound becoming an approximation. Code tests, quantitative metrics, failure analysis, and semantic review each found different problems.

I also learned that simply telling AI to “improve it” is not very helpful. I needed to specify what was wrong, what conditions must remain unchanged, and what observable result would count as an improvement. Investigating the cause, narrowing the scope to drafts, and comparing the same inputs with the same scorer produced results that were easier to explain. A higher score alone still does not tell me whether a feature has become useful enough.

In the next iteration, I want to combine these evaluation methods with real user evaluation to build meaningful features. Observing users perform tasks should help establish whether the remaining HE feedback identifies real problems and whether the completed fixes reduce confusion and errors. Rather than simply expanding what AI can implement quickly, I want to use it to find features users need and changes that make a measurable difference to their experience.

## Evidence and Session Review

- [#458: HE follow-up](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/458)
- [#463: chat ordering and handoff display](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/463)
- [#465: evaluation system](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/465)
- [#464: changes under review](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/464). Original local logs remain private.
- The refinement comparison uses frozen development candidates and three trials per arm. The reported figures were checked against the local aggregates.
- [Course Session Exporter](https://github.com/snuhcs-course/session-exporter), commit `3251f6338e647fda5e7abb6f6108f6f176b5ae9f`.
- The input-only excerpts passed the exporter's final re-scan. Original logs, ZIPs, credentials, and teammates' personal records are not included. PRs, commits, and measurements provide supplementary evidence for work outside the selected sessions.

## Representative Prompts

These examples show requests used to direct the work and review its results. Times are in Asia/Seoul; session identifiers are shortened to eight characters.

- **2026-10-28 15:29:31 · Claude · `5b2aa563`:** Please explain the architecture of AI chat and editing.
- **2026-10-28 15:35:45 · Claude · `5b2aa563`:** Please explain why OCR preprocessing is necessary.
- **2026-11-05 21:17:47 · Codex · `01a1ab7c`:** Are the current measurements being run on the development set?
- **2026-11-05 21:18:11 · Codex · `01a1ab7c`:** Does AI chat have a holdout dataset? If not, please create a separate one.
- **2026-11-06 16:13:28 · Codex · `01a1ab7c`:** Does the evaluation also inspect the internal execution process? Please explain the current problem.
- **2026-11-06 16:14:05 · Codex · `01a1ab7c`:** Please analyze the root cause before making further improvements.

---

# AI Collaboration Report – Iteration 3 – Hyun Park

Personal contribution · November 6, 2026.

Period: October 28–November 6, 2026, Asia/Seoul, following the I3 project dates in Linear.

**Records reviewed.** I did not use the Session Exporter for this section. It is based on the "AI 사용" block in each of my PR bodies, the Linear issues, and the evaluation records in `docs/evaluation/`. The prompts quoted at the end are my own instructions from the Claude Code sessions. Original session logs are not published.

**Tools and models.** Claude Code. I used Claude Fable for planning and coordination, and Claude Opus 5.5 subagents for code, documents and evaluation runs. The product's chat model under evaluation (`claude-haiku-4-5-20251001`) is separate from these development agents.

## 1. Where AI Was Used

Almost all of my I3 implementation and evaluation work was done by agents. From November 4 I split the work explicitly: the main session only plans, coordinates and reports, and every code, document or evaluation task goes to an Opus subagent with a written brief. I wrote or approved the Linear issue, the agent made the task file, branch and draft PR, implemented and tested, and I reviewed the diff and merged through the merge queue. Agents did not merge.

I have 50 merged PRs in the period. 49 are I3 work (#265 only updated my I2 report section). Every one of the 49 records agent time in its "AI 사용" block, about 51 hours in total. 43 also record tokens, about 14M, so the token figure is a lower bound. These are the agents' own estimates written into the PR body, not measured active time. My own hours were not measured.

The work fell into four groups:

- **Consumer evaluation (I3-T04/T05/T08/T15).** Discovery journey rows ([#402](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/402), DEV-166), preorder and order-state rows ([#406](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/406), DEV-168), 90 AI answer trials with a trace review of every persisted answer ([#401](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/401), DEV-167), and my consumer heuristic inspection ([#459](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/459), DEV-175).
- **Fixes from the HE and the evaluation runs.** DEV-207 to DEV-210 before the HE ([#393](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/393)–[#396](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/396)), the defects the journey runs found (DEV-214 [#411](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/411), DEV-215 [#410](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/410), DEV-216/218 [#412](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/412), variety search DEV-217 [#450](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/450)), the HE follow-ups DEV-222 to DEV-233 ([#431](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/431)–[#442](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/442)), Brix prefill DEV-228 ([#451](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/451)), and Android keyboard and help tour fixes DEV-205/206 ([#460](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/460), [#461](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/461)).
- **How the team works in parallel.** Per-issue task files (DEV-219, [#414](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/414)), gated CI with a merge queue (DEV-234, [#444](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/444)), Mock tests on free ports (DEV-221, [#449](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/449)), the spec-check review fixes (DEV-196/197/199/211, [#365](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/365), [#367](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/367), [#375](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/375), [#398](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/398)) and the main CI repair (DEV-177, [#446](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/446)).
- **Builds, deploy and demo.** EAS native builds (DEV-33, [#270](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/270)), deploy checks (DEV-139, [#374](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/374), [#381](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/381)), Vercel test addresses (DEV-236, [#453](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/453)), simpler sign-up (DEV-142, [#291](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/291)) and the demo record/publish commands (DEV-134, [#481](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/481)).

## 2. How I Revised the Prompts and Scope

In I3 I separated planning from execution. The planner writes a brief with the issue, the allowed paths, what is out of scope and how to verify; the executing agent sees only that brief. When a result came back, I read it against the brief, not against the agent's summary.

For anything that changes a screen, I made the order explicit: design proposal board first, my approval, then development. DEV-217 is an example. The agent first wrote a proposal with options, I approved option A, and only then gave the instruction "server variety search, only varieties on sale in Mock, AC-06-2 test" ([#450](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/450)). I also asked for before/after screenshots in the PR and in Linear when that was possible and useful, and had that rule written into the agent instructions.

Near the end of the iteration I cleaned up the backlog in one instruction: close what we had put on hold, do quickly what still had to be done, and mark as done what no longer had a reason to exist. The agent proposed which issue went where; I confirmed the list.

## 3. What AI Did Well

Running the evaluation protocol exactly as frozen. For the journey rows, the agent wrote a scripted run per row, recorded the build, database revision and fixed clock, and kept FAIL as FAIL. I3-DISC-03, I3-DISC-05 and I3-PRE-05 failed on their first planned run, each with a precise cause and file, and each became a fix issue (DEV-214, DEV-215, DEV-216). For DEV-167 it did not stop at the automatic score: it read every one of the 90 persisted answers and split the 30 conflicting-fact failures into three classes, six of them safety failures where the AI adopted a conflicting FAQ statement as a promise.

Finding things outside the planned check without mixing them into the verdict. During I3-DISC-01 it noticed that a cultivar stored only in a product's `variety` was not searchable. That stayed outside the PASS verdict and became DEV-217.

Infrastructure work with a measurable before state. For DEV-234 it first measured ten successful CI runs from November 4 and the integration log timestamps, then changed the pipeline ([#444](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/444)).

## 4. Errors and Limitations

**Wrong root cause copied from the issue (DEV-228).** The agent first explained the missing Brix value with the diagnosis in the issue body, that a regular expression threw the value away. The investigation for the proposal showed the real cause: the current flow had no path that carried the Brix value from the analysed source into the form. The PR body records this as an AI error ([#451](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/451)). I approved the fix only after the corrected cause.

**A fact missed in the first plan (DEV-236).** When I asked for new legal-page rules, the first plan missed that the default Vercel addresses redirect to the official domains (that redirect came from DEV-127 in I2). The executing agent checked, found it, and stopped instead of working around it. I decided that a Vercel address should stay on its own host, and [#453](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/453) removed the redirect.

**A file that hid the repository front page.** The DEV-234 PR added the CI guide as `.github/README.md`. GitHub shows that file on the repository front page instead of the root README. [#447](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/447) renamed it to `.github/CI.md` and updated every path that pointed to it.

**A wrong deletion during Figma sync.** An agent syncing screens with Figma removed the "↪ 농가에 전달했어요" (forwarded to the farm) line, which is part of the chat design. I noticed and had it restored.

**Agents stopping halfway.** Some agents stopped halfway because the disk was full (too many worktrees) or because of network errors, and the work had to be restarted from the task file. This is part of why I now remove worktrees after merge.

**Parallel PRs colliding.** With several agents working at once, PRs kept conflicting on the shared `tasks.md` files, and merged PRs broke `main` CI together even when each was green alone ([#446](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/446), after DEV-229 and DEV-225). I approved splitting task notes into one file per issue (DEV-219, ADR 0014, [#414](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/414)) and moving merges to a merge queue (DEV-234, [#444](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/444)).

**Spec text that was too loose (DEV-217).** The automatic spec-check review flagged that FEAT-06 did not say which varieties count. The agent added the rule (only varieties on sale, including paused products) to FEAT-06 flow 3, AC-06-2, `ia.md` and the wiki, and re-ran the tests after the spec commit ([#450](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/450)).

**What is still not done.** The trace review in DEV-167 was done by an agent, and my human sign-off on those 90 verdicts is still pending. The journey rows still wait for the named reviewers. I3-DISC-03 and I3-PRE-05 have no recorded re-run after their fixes merged; only I3-DISC-05 was re-run (PASS on `0842d0b`).

## 5. Human Decisions and Review

I approved every design proposal before screen work started. The DEV-219 file layout (option A) was approved with the PM on November 4. I read the diffs and merged the PRs myself. In DEV-175 I reviewed the agent's 21 findings and confirmed their adoption and severity (2026-11-05).

Some work stayed with people on purpose: the production database and Railway variables, the Kakao developer console, the Figma account and password, and the APK signing secrets. Agents never received those values.

## 6. Lessons and Next Steps

Splitting planning from execution helped most when the brief was strict about scope and verification. It did not protect against a wrong premise in the brief itself (DEV-228, DEV-236). The useful safeguard was an agent that is allowed to stop and report when what it finds disagrees with the brief.

Most of the time lost in I3 came from parallel work, not from wrong code: conflicts, CI breaking only after merge, full disks. Per-issue task files and the merge queue fixed the conflicts, but they came late in the iteration.

In I4 I want to sign off the DEV-167 review myself, re-run I3-DISC-03 and I3-PRE-05 on a fixed build, and start acceptance testing with real users so that the evaluation is not only agents checking agents.

## Evidence and Session Review

- Evaluation records: `docs/evaluation/i3-journeys/results/i3-b2-87792b7/`, `docs/evaluation/i3-ai-support/results.md` (DEV-167 section), `docs/evaluation/i3-t15-consumer-heuristics.md`.
- PR bodies: the "AI 사용" block in each PR (agent time, tokens, AI errors), e.g. [#401](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/401), [#451](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/451), [#453](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/453).
- Original logs, credentials and teammates' records are not included.

## Representative Prompts

My own instructions, in Korean, with an English translation. I did not record their exact times.

- "지금부터 진행되는거 계획만 Fable로 하고 나머지 작업들은 opus 가 한다" (From now on, only planning is done with Fable; Opus does the rest of the work.)
- "before after(screenshot or else)에 대해서 git pr, linear에 가능하고 효과적이면 추가하는걸로. agent에도 명시해줘" (Add before/after screenshots or similar to the PR and Linear when possible and useful. Write that into the agent instructions too.)
- "뭐가 되었든 vercel주소는 vercel주소 안에서 이동하는게 맞아. 진행해" (Whatever the case, a Vercel address should stay within the Vercel address. Go ahead.)
- "보류한 것은 닫고, 해야 하는 것은 빨리 진행하고, 이미 할 이유가 없는 것은 완료 처리" (Close what is on hold, do quickly what has to be done, and mark as done what no longer has a reason to be done.)

---

# AI Collaboration Report – Iteration 3 – Zahra Gholami

Personal contribution · Draft for review, November 6, 2026.

Period: October 28–November 6, 2026, Asia/Seoul, following the I3 project dates in Linear.

**Records reviewed.** I used the course Session Exporter 0.1.0 (commit `3251f6338e647fda5e7abb6f6108f6f176b5ae9f`) with `--tool both --from 2026-10-28 --to 2026-11-06 --timezone Asia/Seoul`. The dry run selected six sessions in this repository: four Claude Code sessions and two Codex sessions, one of which is an automatic review sub-session with no input from me. Two more Claude Code sessions were excluded because their working directory moved outside the repository. The final re-scan passed. From the selected sessions I read 50 input records I typed (44 Claude Code, 6 Codex), all from November 3–6. I have no agent sessions in this repository from October 28 to November 2. Tool responses, file-history backups and pasted teammate text are not quoted. The original logs are not published.

**Tools and models.** The session metadata records Claude Code with `claude-opus-5-5` (four sessions) and Codex with `gpt-6-luna` (one session). Claude Haiku 4.5, which the product's AI support calls, is separate from these development agents and was the system under test, not a tool I used to write code.

## 1. Where AI Was Used

My I3 work was the AI customer-support evaluation and its fixes, plus the test setup and demo around it. I used a coding agent to build and run evaluation harnesses, implement fixes, merge and test branches, review PRs, and draft records. I set the scope, decided which results to trust, and approved what was merged.

- **Test environment and baseline** ([#371](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/371), DEV-165) and **evaluator test accounts for the HE in native builds** ([#373](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/373), DEV-200).
- **AI support evaluation, T09** ([#377](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/377), DEV-169): the frozen 60-question protocol (DEV-154) run three times per case. The first cohort scored **141/180** and failed 2 of 5 state and failure guards. It found three defects: a stale AI reply saved after the farm replied or switched mode, an 8.02 s timeout against an 8 s limit, and rule answers that ignored conflicting registered facts.
- **Fixes, T22** ([#387](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/387), DEV-180): the re-run on the same corpus, harness, model and prompt scored **180/180** with guards **5/5**. The log records 72 real model calls (`claude-haiku-4-5-20251001`), 99 rule-path answers and 9 injected faults.
- **PR responsibility rules** ([#382](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/382), SWPP-126): who does what in a PR, and human approval for high-risk paths.
- **Iteration 3 demo** ([#466](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/466), DEV-181): the `iteration-3-demo` branch and README, and the recording script updated for I3 screens.

## 2. How I Revised the Prompts and Scope

When the TA asked us to define which PR work goes to the agent and which to a person, I asked the agent what common practice is before writing rules. I limited mandatory human approval to a high-risk tier, which the team had agreed on. When its follow-up procedure for the spec-check comment became hard to follow, I said it was getting too complicated and asked how large companies handle it. I read the revised version before telling it to go ahead.

When I asked Codex to check a README draft about AI support, I disagreed with its reading of the evidence-agreement check. Rather than argue the point, I narrowed the request to adding only the missing evaluation scope, then asked it to list the exact lines it had added.

I started sessions by asking the agent to check the repository and Linear and tell me what was left, instead of assuming. When it proposed an order, I asked for a recommendation and the reason, then decided.

When a teammate's draft PR (#464) reused my unmerged fix, I asked which PR should merge first. The agent recommended merging mine first and pointed out a real gap that #464 had found in my conflict check. I asked it to add a conservative fix to my PR and to leave a comment on #464 instead of messaging the teammate directly.

For the demo video, I first chose to re-record with the repository's script. After watching the result, I asked to remove every login scene, because the real sign-in is Kakao and the test-account screen is a testing tool. Later I handed the recording to a teammate and asked the agent to leave a step-by-step note instead.

## 3. What AI Did Well

The agent connected each failure to a cause I could check. For the stale reply, it showed that the consumer request held the conversation row lock during the whole model call, so the farm's reply waited behind it. For the conflict defect, it showed that the rule path returned the first matching fact without comparing it with the others.

It kept checks tied to evidence. After my conservative fix, it ran all 60 corpus questions through the rule path before and after the change and confirmed that no outcome changed, so the 180/180 result still held. It wrote a regression test that failed without the fix and passed with it.

It also caught a mistake of its own. It noticed that the demo had been recorded on code from before #387 merged, stopped the recording and recorded again on the right snapshot.

## 4. Errors and Limitations

- **A gap in the AI-written fix.** My conflict check treated evidence with numbers and evidence without numbers as agreeing (for example `배송비 3,500원` and `무료배송이에요`), because an empty set counts as contained in any other set. A teammate found it in #464. It was fixed in #387 with a regression test before merge.
- **Misread test failures.** Locally, two tests failed because my `.env` contains an AI key, which CI does not have. The agent's first attempt to imitate CI produced 48 unrelated failures from how it ran the tests. It reported these as a setup effect without confirming on `main`. CI on the PR was the real check, and it passed.
- **A silent skip in the demo script.** The recording script skipped the farm's deposit approval without failing, which would have shown "reservation complete" for an unapproved order. A later step failed, which exposed it. The script now stops when the approval does not happen.
- **An invented number.** When closing DEV-180 in Linear, the agent estimated my hours as "Human ~2h" without asking. I treat that figure as unverified.
- **Limits of the evaluation.** The 60 routine and conflicting-fact trials all used the rule path with no model call, so they test the guard logic, not model answer quality. Model answers were exercised mainly by the 60 missing-evidence and ambiguous trials. The fixtures are synthetic. I signed off the b2 verdicts on November 6 after reviewing the results and run log.

## 5. Human Decisions and Review

- I chose to merge #387 before the teammate's #464, and to keep its fix conservative: one-sided numbers are handed to the farm, at the cost of also handing over equivalent pairs such as `무료배송` and `배송비 0원`.
- I checked the production timeout variable on Railway myself. The agent is not allowed to read production variables, so it only prepared the command. The variable was not set, so the new 7.5 s default applies.
- #387 changes high-risk paths (`server/app/ai/**`, `server/app/core/config.py`). Under our SWPP-126 rule, my code review recorded in the PR description counts as the human review, and I put it in the merge queue myself.
- The agent ran the review, tests and evaluation scripts. I did not run every test by hand.

I did not measure human hours, active agent hours or total tokens for this work, so I do not report totals. Session length is not active work time, and parallel sessions overlap.

## 6. Lessons and Next Steps

A passing score has to say what was exercised. Separating rule-path answers from real model calls in the log made 180/180 interpretable. Without that split, a high score could hide that the model was barely involved.

A fix is a claim too. My own conflict check passed its tests and still had a gap that another person's work exposed. In the next iteration I want each evaluation fix reviewed against cases written by someone other than its author, and verdicts signed off by a person before they are reported as final, as I did for b2.

## Evidence and Session Review

- [#377: T09 evaluation](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/377), results [`results.md`](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/evaluation/i3-ai-support/results.md)
- [#387: T22 fixes](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/387), re-run [`results-i3-b2.md`](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/evaluation/i3-ai-support/results-i3-b2.md)
- [#371](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/371), [#373](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/373), [#382](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/382), [#466](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/466), [`iteration-3-demo`](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-3-demo)
- [Course Session Exporter](https://github.com/snuhcs-course/session-exporter), commit `3251f6338e647fda5e7abb6f6108f6f176b5ae9f`: six sessions selected, two excluded (working directory outside the repository), final re-scan passed. The quoted prompts are my own input records. Original logs, credentials and teammates' personal records are not included.

## Representative Prompts

Times are in Asia/Seoul. Session identifiers are shortened to eight characters. Typos are kept as typed.

- **2026-11-03 22:30:49 · Claude · `9d14a662`:** this is a feedback fromthe ta. [TA feedback: set clear criteria for which PR work goes to the agent and which to a person] what do you think? what is the common practice? how can we address this?
- **2026-11-03 22:35:02 · Claude · `9d14a662`:** yes I talked with the team. go ahead. the human approval should be for the high risk tier especially
- **2026-11-03 23:12:31 · Claude · `9d14a662`:** I don't udnerstand. I think it is getting overly complicated. how is this usually handled in big tech?
- **2026-11-03 23:49:43 · Codex · `01a1a1de`:** can you check to see if this is accurate and covers everything [about an AI support README draft]
- **2026-11-03 23:54:49 · Codex · `01a1a1de`:** forget about it. can you edit the readme i sent and ONLY add the missing scope of the evaluation?
- **2026-11-05 22:08:51 · Claude · `eed73422`:** check the latest changes on the repo as well as my latest works and update me on what there is to do
- **2026-11-06 15:41:56 · Claude · `eed73422`:** there are problems with the video. don't show the log in everytime. actually the log in is through kakaotalk, so remove taht flow entirely, it is for testing.


---

# AI Collaboration Report – Iteration 3 – Minsun Kim

Personal contribution · Draft for review, November 6, 2026.

Period: October 28–November 6, 2026, Asia/Seoul.

**Records reviewed.** This contribution uses six relevant Codex project threads: planning, ownership correction and protocol work, evaluator-guide preparation, AI-feature analysis, consumer chat evaluation/fixes, and its recovery continuation. Inputs, relevant agent outcomes and saved project evidence were checked together. The recovery thread repeats earlier turns; those are not counted as independent work. This is a curated account, not a complete transcript, an all-team session audit or a completed Session Exporter run. Original JSONL, raw tool output and private exports are not published. The selected inputs below exclude credentials, account details, attached documents, pasted teammate messages, unrelated conversation and ambient browser metadata. Grammar and typos in quoted text are retained; translations are labelled separately.

**Tools and models.** Local turn-context metadata records `gpt-6-luna` for planning and AI-feature analysis; `gpt-6-sol` for role correction and DEV-152/154; `gpt-6.1-sol` for evaluator-guide work; and `gpt-6-luna` followed by `gpt-6.1-sol` in the chat evaluation. These are development agents, separate from the product AI being evaluated.

## 1. Where AI Was Used

I used agents to turn the iteration goals into tasks, check workload and dependencies, prepare the common journey matrix and AI question protocol, and make the evaluator package easier to follow. DEV-152 produced a versioned 44-case matrix and protocol ([#336](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/336)); DEV-154 produced 60 synthetic questions, labels and scoring rules ([#334](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/334)). Those were preparation deliverables, not executed evaluations.

For DEV-153 I requested current-build chat tests, then a cause-based implementation plan. The two confirmed defects became DEV-245–253: paid-order initialization/authorization and historical reading-position restoration. Agents implemented, tested and drafted the records in [#482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482); [#500](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/500) consolidated the testing history. Scope and priority corrections were mine; I do not claim I wrote the implementation or ran each check manually.

## 2. How I Revised the Prompts and Scope

An ambiguous request to reduce Hyun’s hours was over-applied: the agent moved all six tasks to Zahra and reported a 63-hour/zero-hour human split. I clarified that the estimates should be similar, with Zahra only one or two hours higher. It reported 32 versus 31 hours afterwards. These are planning estimates, not measured effort. On October 31 I corrected my own mistaken consumer/producer allocation; the agent’s original role split had followed my instructions.

For the evaluator package, “structure by feature or flow” was too broad. I clarified that I wanted folders inside the ZIP, preserving the README. For DEV-153, I moved from requesting polished deliverables to explicitly requiring the Linear requirements, all five scenarios, diagnosis, small tasks and implementation in dependency order.

## 3. What AI Did Well

AI traced the order-entry failure through navigation, server authorization and the missing persisted context, and the reading-position failure through remounting, pagination and delayed layout. The final local run on `4c57556` passed seven API groups and 57 browser cases; ten measured round trips all returned at the original offset. The testing document preserves 43 retained log attempts, genuine failures, fixture errors and environment corrections instead of reporting only the final green run.

## 4. Errors and Limitations

The first evaluation stopped at setup blockers too early. The later 107 supporting checks did not answer the five broad scenarios, which still had to be executed. Their failures led to the actual fixes; controlled visibility signals never established genuine device backgrounding. Tests also needed corrections for a button arrow, the real 20-message pagination default and a mismatched seeded order/farm fixture. The CI demo failure was an outdated fixture assumption after accepted scenario changes; invalid specification-review JSON was a separate checker-format problem. Fixing either did not justify weakening assertions. No measured cost or time saving is available.

## 5. Human Decisions and Review

My interventions specified ownership, workload, evaluation completeness and task granularity. I asked for the existing task format, direct implementation requirements and accurate historical documentation. No specific hand-edited product-code lines can be attributed to me from these records. Earlier pending-review statements are dated snapshots; the checkout used for this report contains merged #482 (`86e5410`) and #500 (`28feb94`). Merge history does not independently establish deployed behavior or human approval provenance. Genuine mobile backgrounding, DEV-244’s ordering-oracle decision and the separate DEV-257 toast race remain distinct limitations.

## 6. Lessons and Next Steps

A detailed report is useful only when it separates what was planned, what ran and what remains unknown. I will make workload constraints and acceptance criteria explicit earlier, preserve failed attempts, and obtain independent human decisions rather than treating agent checking as final acceptance. Human hours, active agent time and total tokens were not measured consistently, so I do not invent totals.

## Evidence and Session Review

| Source | Local record / public verification is linked below | Boundary |
| --- | --- | --- |
| S1 | Plan Iteration 3 tasks (local thread 01a18092-f0c2-7163-9632-230633db3a87; not a public evidence link), October28–29 | Plan, estimated workload and correction; not proof planned tests happened. |
| S2 | Linear 역할 할당 수정 (local thread 01a1922b-f090-73c2-b01f-2ee196eb6464; not a public evidence link), October 31 | Own role correction, DEV-152/154 preparation; pasted teammate text excluded. |
| S3 | 작성자 AI 가이드 README 다듬기 (local thread 01a1a1c6-27b8-7fa2-9874-89a662a72444; not a public evidence link), November3 | Evaluator guide and folder-scope correction; full AI analysis execution was not claimed. |
| S4 | Analyze iteration AI features (local thread 01a1a608-d1f1-7903-8634-334c2700be49; not a public evidence link), November4 | Repository-based analysis and TA presentation support; not an independent new evaluation. |
| S5 | Evaluate consumer chat reliability (local thread 01a1a4e6-23a3-73b0-9f82-cb33d6cfe15d; not a public evidence link), November4–6 | Scenario execution, nine-task fixes, CI correction and testing documentation; primary activity record. |
| S6 | Evaluate consumer chat reliability(2) (local thread 01a1afdb-50a4-7991-af0b-e9b913f26a7e; not a public evidence link), November6 | Recovery and preservation of existing evidence; inherited turns deduplicated. |

The public verification paths are `docs/evaluation/dev-242-order-chat-regression.md`, `docs/evaluation/dev-243-scroll-restoration.md`, the DEV-245–253 task records, and `docs/wiki/Testing-Documentation.md`. The local transcript paths are private provenance, not public attachments. Teammates’ existing contributions retain their own session-review limits. This review does not assert that their raw histories were independently re-exported here.

## Representative Inputs

The following are selected neutral, software-development inputs. “Excerpt” means a contiguous portion of one original input; omitted context is not silently rewritten. No agent response is reproduced. Dates and model names are taken from recorded local messages/turn contexts.

### P1 — 2026-10-28 18:23:51 KST · S1 · gpt-6-luna

**Verbatim excerpt.** Turn `01a181d2-b193-7912-9588-1569739fd5bf`.

> based on this pdf and our github, please make most important key user journeys and evaluation targets. also
> analyze our 2 ai features, and please suggest the smartest, most detailed, high-quality success criteria for our AI features, and possible suggestions on how to enhance them

**Summary/analysis (not a quotation):** Move from broad iteration planning to key journeys and measurable success criteria for both AI features.

### P2 — 2026-10-29 13:31:33 KST · S1 · gpt-6-luna

**Verbatim excerpt.** Turn `01a185ed-6f99-70f2-9743-2afd3141fe14`.

> Now, last the last iteration, please convertiteration 3's plan into specific tasks, estimate human/agent work hours, and assign each task to a person. Make sure the tasks are well defined, detailed, and considering all important features needed for successful deliverables for this iteration. consumer-related tasks should be assigned to Jinwoo or Minsun, then assign producer-related tasks to Hyun or Zahra. for AI features, break up the tasks so that it can be separated by cosumer/producer to assign to each person.

**Summary/analysis (not a quotation):** Require detailed, individually assigned tasks and separate human/agent estimates. The consumer/producer allocation here was later corrected by Minsun; it is not treated as authoritative final ownership.

### P3 — 2026-10-29 15:08:14 KST · S1 · gpt-6-luna

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a18645-aac9-7a31-8af9-fde5e77db161`.

> please miimize hours for hyun, redistribute to zahra

**Summary/analysis (not a quotation):** Before: ambiguous workload reduction instruction. The agent over-applied it by moving all six Hyun tasks, producing an infeasible63h/0h human estimate split.

### P4 — 2026-10-29 15:12:32 KST · S1 · gpt-6-luna

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a18649-e7a3-7792-a91a-e3f904b5ff3f`.

> no make zahra. and hyun similar, just +1~2 hours to zahra

**Summary/analysis (not a quotation):** After: explicit relative workload constraint. Agent subsequently reported32 vs31 estimated human hours. Estimates are not measured work or productivity.

### P5 — 2026-10-31 22:35:17 KST · S2 · gpt-6-sol

**Verbatim excerpt.** Turn `01a1922b-f60c-70c1-857c-649b33c0967f`.

> 내가 착각했어, 진우와 자라에게 producer, 현과 민선한테 consumer 부여를 해야해. Linear에 접속해서 올바르게 role을 바꿔야해.

**English translation:** I was mistaken: producer work should go to Jinwoo and Zahra, and consumer work to Hyun and Minsun. Access Linear and correct the roles. [Translation; the Korean above is the verbatim source.]

**Summary/analysis (not a quotation):** Minsun corrects her own previous role mapping. Pasted teammate text preceding this excerpt is deliberately excluded; this is not attributed as an AI hallucination.

### P6 — 2026-10-31 22:45:42 KST · S2 · gpt-6-sol

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a19235-82b4-7ff0-9d2e-d5d49e45074f`.

> help me finish DEV-154, precisely and accurately, all requirements correctly implemented. please make sure to produce high quality deliverables.

**Summary/analysis (not a quotation):** Request the frozen AI question/rubric deliverables. The returned60-question protocol is preparation, not evidence of model performance.

### P7 — 2026-10-31 23:26:24 KST · S2 · gpt-6-sol

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a1925a-c28b-76c1-95a2-1d8134c2c475`.

> help me finish I3-T02, precisely and accurately, all requirements correctly implemented. please make sure to produce high quality deliverables.

**Summary/analysis (not a quotation):** Request the common journey matrix. Its44 cases and scoring protocol are a plan, not44 executed tests.

### P8 — 2026-11-03 23:50:26 KST · S3 · gpt-6.1-sol

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a1a1e3-da92-7360-a701-8205327a60ff`.

> 조금 난잡한것 같아서 feature 나 flow 별로 파일에 담아서 잘 구조화하고 정리해줘

**English translation:** It seems a little disorganized, so please structure and organize the files by feature or flow. [Translation.]

**Summary/analysis (not a quotation):** Before: a broad request to organize by feature/flow was interpreted as a document rewrite.

### P9 — 2026-11-03 23:51:52 KST · S3 · gpt-6.1-sol

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a1a1e5-210a-7881-9224-4d97c3b175b8`.

> readme 바꾸지 말고 zip file 을 폴더를 이용해 구조화해달라구

**English translation:** Do not change the README; structure the ZIP file using folders. [Translation.]

**Summary/analysis (not a quotation):** After: clarify that ZIP folder structure, rather than README content, is the requested change. This is the corrected continuation input, not the earlier superseded edit.

### P10 — 2026-11-06 15:26:17 KST · S5 · gpt-6-luna

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a1af87-ec87-7371-a1a5-4e65d4115c0c`.

> Please carefully review everything stated in the linear task first, before going on with implementation. All requirements should be directly, correctly resolved

**Summary/analysis (not a quotation):** Require the exact Linear task and all requirements to be reviewed before implementation.

### P11 — 2026-11-06 16:20:36 KST · S5 · gpt-6.1-sol

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a1afbb-16c9-7ef1-9b67-c9984e55d3b2`.

> please execute the 5 broad scenarios to your fullest. It is okay to take time, the important part is accurately executing a detailed test that shows the exact current state of the app.

**Summary/analysis (not a quotation):** Replace supporting checks alone with complete current-build execution of the five broad scenarios.

### P12 — 2026-11-06 17:36:00 KST · S5 · gpt-6.1-sol

**Verbatim excerpt.** Turn `01a1b000-2025-7d23-9549-be58ea31b836`.

> first, plan the best strategy to fix this problem. It is okay to take time, carefully analyze why the defect is happen, what needs to be fixed or built. then divide the strategy into small steps, address one step to one liner task. When making linear tasks, make sure to check other linear tasks made prior, and follow a similar format. The linear task should be very specific, so that direct implementation of the plan spcified by the task would lead to successful fixation of the current app defects.

**Summary/analysis (not a quotation):** Require diagnosis before implementation and small, executable tasks using the team’s established format.

### P13 — 2026-11-06 19:12:38 KST · S5 · gpt-6.1-sol

**Complete substantive input (ambient ui wrapper excluded).** Turn `01a1b058-98e7-7412-8f23-3bb0b3978b8a`.

> please start the implementation right now. follow the linear tasks we made in the correct order, for each implementation step make sure to accurately implement everything following all requirements. The final implementation should fix the two app defects we just found

**Summary/analysis (not a quotation):** Authorize implementation in dependency order with each step checked against the saved requirements.

### P14 — 2026-11-06 21:56:33 KST · S5 · gpt-6.1-sol

**Verbatim excerpt.** Turn `01a1b0ee-a91f-7f52-8fa9-0e059d7a5194`.

> please check and fix the 2 check failures in merge request.

**Summary/analysis (not a quotation):** Ask for correction of the two actual CI failures. The stale demo oracle and invalid review JSON were different failures; neither justified weakening product permission checks.

### P15 — 2026-11-06 22:19:00 KST · S5 · gpt-6.1-sol

**Verbatim excerpt.** Turn `01a1b103-389c-7bd2-bd6f-ec778e4e553d`.

> please analyze the testing document first, follow the original format to update the EVERY testing we did in this entire chat to the testing report.

**Summary/analysis (not a quotation):** Require documentation to retain the established format and every test attempt. This supports the historical ledger, not a new execution claim.

