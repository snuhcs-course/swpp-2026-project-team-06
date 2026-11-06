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

# AI Collaboration Report – Iteration 3 – Zahra Gholami

Personal contribution · Draft for review, November 6, 2026.

Period: October 28–November 6, 2026, Asia/Seoul, following the I3 project dates in Linear.

**Records reviewed.** TODO(Zahra): Session Exporter run (version/commit, `--from 2026-10-28 --to 2026-11-06`), number of selected sessions and input records, dry-run and final re-scan result. The prompts below come from the Claude Code session `eed73422` (November 5–6); confirm their times against the export and add prompts from earlier I3 sessions.

**Tools and models.** Claude Code with `claude-opus-5-5`. TODO(Zahra): add any other agent and model recorded in the export. Claude Haiku 4.5, which the product's AI support calls, is separate from these development agents and was the system under test, not a tool I used to write code.

## 1. Where AI Was Used

My I3 work was the AI customer-support evaluation and its fixes, plus the test setup and demo around it. I used a coding agent to build and run evaluation harnesses, implement fixes, merge and test branches, review PRs, and draft records. I set the scope, decided which results to trust, and approved what was merged.

- **Test environment and baseline** ([#371](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/371), DEV-165) and **evaluator test accounts for the HE in native builds** ([#373](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/373), DEV-200).
- **AI support evaluation, T09** ([#377](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/377), DEV-169): the frozen 60-question protocol (DEV-154) run three times per case. The first cohort scored **141/180** and failed 2 of 5 state and failure guards. It found three defects: a stale AI reply saved after the farm replied or switched mode, an 8.02 s timeout against an 8 s limit, and rule answers that ignored conflicting registered facts.
- **Fixes, T22** ([#387](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/387), DEV-180): the re-run on the same corpus, harness, model and prompt scored **180/180** with guards **5/5**. The log records 72 real model calls (`claude-haiku-4-5-20251001`), 99 rule-path answers and 9 injected faults.
- **PR responsibility rules** ([#382](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/382), SWPP-126): who does what in a PR, and human approval for high-risk paths.
- **Iteration 3 demo** ([#466](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/466), DEV-181): the `iteration-3-demo` branch and README, and the recording script updated for I3 screens.

## 2. How I Revised the Prompts and Scope

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
- **Limits of the evaluation.** The 60 routine and conflicting-fact trials all used the rule path with no model call, so they test the guard logic, not model answer quality. Model answers were exercised mainly by the 60 missing-evidence and ambiguous trials. The fixtures are synthetic. Human sign-off on the b2 verdicts was still pending when this was written.

## 5. Human Decisions and Review

- I chose to merge #387 before the teammate's #464, and to keep its fix conservative: one-sided numbers are handed to the farm, at the cost of also handing over equivalent pairs such as `무료배송` and `배송비 0원`.
- I checked the production timeout variable on Railway myself. The agent is not allowed to read production variables, so it only prepared the command. The variable was not set, so the new 7.5 s default applies.
- #387 changes high-risk paths (`server/app/ai/**`, `server/app/core/config.py`). Under our SWPP-126 rule, my code review recorded in the PR description counts as the human review, and I put it in the merge queue myself.
- The agent ran the review, tests and evaluation scripts. I did not run every test by hand.

TODO(Zahra): human hours and agent hours. Do not add up session lengths; if they were not measured, say so.

## 6. Lessons and Next Steps

A passing score has to say what was exercised. Separating rule-path answers from real model calls in the log made 180/180 interpretable. Without that split, a high score could hide that the model was barely involved.

A fix is a claim too. My own conflict check passed its tests and still had a gap that another person's work exposed. In the next iteration I want each evaluation fix reviewed against cases written by someone other than its author, and the b2 verdicts signed off by a person before they are reported as final.

## Evidence and Session Review

- [#377: T09 evaluation](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/377), results [`results.md`](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/evaluation/i3-ai-support/results.md)
- [#387: T22 fixes](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/387), re-run [`results-i3-b2.md`](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/evaluation/i3-ai-support/results-i3-b2.md)
- [#371](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/371), [#373](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/373), [#382](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/382), [#466](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/466), [`iteration-3-demo`](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-3-demo)
- TODO(Zahra): Session Exporter result, privacy check and exclusions. Original logs, ZIPs, credentials and teammates' personal records are not included.

## Representative Prompts

Times are in Asia/Seoul. Session identifiers are shortened to eight characters. TODO(Zahra): confirm the times against the export and add prompts from earlier I3 sessions (T03, T09, SWPP-126).

- **2026-11-05 · Claude · `eed73422`:** check the latest changes on the repo as well as my latest works and update me on what there is to do
- **2026-11-05 · Claude · `eed73422`:** between 387 and 464 which one do you think should be merged first
- **2026-11-05 · Claude · `eed73422`:** no need to tell jinu, just add a comment in their pr
- **2026-11-05 · Claude · `eed73422`:** can you not check railway yourself
- **2026-11-06 · Claude · `eed73422`:** there are problems with the video. don't show the log in everytime. actually the log in is through kakaotalk, so remove taht flow entirely, it is for testing.
- **2026-11-06 · Claude · `eed73422`:** I need to do the reports the same way it was done for i2 and i1. i don't remember what reports there are exactly
