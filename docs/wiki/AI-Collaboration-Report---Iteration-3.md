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
