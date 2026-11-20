# AI Collaboration Report – Iteration 4 – Member Evidence and Selected Inputs

**Team 6 — Farmclub | Review draft**

This appendix accompanies the [team report](AI-Collaboration-Report---Iteration-4). Each entry identifies the source, preserves the contributor’s account and keeps their selected prompts in the original language. Status notes date later changes or distinguish them from the contributor’s own account.

## Jinwoo Jang

[Original contribution](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/AI-Collaboration-Report---Iteration-4---PM-Evidence)

Personal contribution for Team 6, ordered by when the work landed. Representative prompts are quoted in the original Korean.

### November 10–12 · UAT preparation and pilot analytics

**Work.** I used Claude Code (Opus 5.5) to prepare UAT account seeding and add producer-app events for the pilot. I chose to keep seeded farms hidden initially, defined the events and metrics, and reviewed the account-related changes. I also updated our PR and Linear templates to record human and agent effort separately. [#560](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/560) · [#568](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/568) · [#582](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/582)

**Representative prompt.**

> 그러면 파일럿 테스트하고 posthog 뜯어서 분석하는걸 목표로 해야겟네. 그래야 정성/정량적 지표가 나올거같아. 그렇지 않냐

**Result and review.** The analytics change gave us a way to read what producers did in the app alongside what they told us in the pilot. The Mock suite passed 313 tests, including 15 for the new event tracking. [#582](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/582)

### November 15–18 · Pilot follow-up, bank transfers, and evaluation

**Work.** The farmer pilot surfaced confusion about whether edits had saved. I used Claude Code to add save and apply feedback and reviewed the Figma version against existing app patterns. In UAT, a producer could match a transfer with a different depositor name only by elimination. I asked the agent to revisit both the bank transfer and the producer's reconciliation flow. [Pilot notes](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/wiki/meetings/2026-11-15-progress-for-ta-meeting-and-uat.md) · [#607](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/607) · [#648](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/648)

**Representative prompts.**

> 문구랑 흐름은 괜찮은데 토스트가 검정색인게 좀 어색하지 않나? 지금 다른 토스트 없나 우리 앱에?

> ㅇㅋ 우린 342 계획하고 있자. 입금자명 오작성 등을 했을때 어떻게 방어할 수 있으려나 ux적으로.. 그리고 궁금한게 지금 12자리 코드를 입금자 명으로 적게 시키는데 이거 애초에 불가능하지 않나 지금

**Result and review.** I had given the agent too little context about what fit in the bank's recipient-side label. The old order code was 12 characters, and the agent suggested a 10-character depositor name that still ignored that constraint. I chose a shorter nickname-based code and gave producers a way to ask the buyer about the transfer from the order. I should have checked both sides of the transfer before asking the agent for a design. After the TA meeting, I also asked Claude Code to document the next evaluation plan using capability tasks based on observed failures and regression tests for existing behavior. [#648](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/648) · [#672](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/672)

### November 19 · Resuming edits in the unified product editor

**Work.** I asked Claude Code to bring the different entry points into the same product editor. Claude Code and Codex also worked on saving and resuming edits and on the browser tests for those flows. [#653](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/653) · [#673](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/673)

**Representative prompt.**

> 걍 이번거에서 같이 맞춰버리자. 애초에 왜 얘네가 달라야되는지 잘 모르겠음.. 반려된 상품도 새로 만들기 화면으로 열게 하삼 (뭐 별로 중요한건 아닌거 같고.) 초안 카드 버튼 이름 이어서 채우기로 바꾸삼 ㅇㅇ

**Result and review.** Several paths for resuming an edit were broken, including reopening a saved draft. I relied too heavily on the agent's checks without walking through the whole sequence myself. I should have made a change, saved it, left the editor, and reopened it to check that the work was still there. The browser suite now covers reopening a saved draft. I reviewed the final diff and approved the merge. [#673](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/673)

### November 19 · OneStore login, delivery privacy, and UAT access

**Work.** I used Claude Code and Codex to add operator-issued login for OneStore review and align the privacy policy with the login-attempt cleanup behavior. I chose a separate UAT environment with issued accounts and approved removing the old evaluator entry point and seed accounts from release builds. I also asked Codex to verify that masking recipient details after delivery would preserve producers' shipping workflow. [#675](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/675) · [#676](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/676) · [#680](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/680)

**Representative prompts.**

> 처리방침을 실제 정리 방식에 맞게 수정

> 생산자가 배송하고 송장뽑는데는 문제없는거임?

**Result and review.** An independent agent wrote tests from the shipping specification. All 26 targeted API tests passed, and browser tests covered tracking entry and dispatch. I reviewed the login, privacy, and UAT access changes and approved the merges. [#675](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/675) · [#676](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/676) · [#680](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/680)

### November 19 · Feedback when adding a content block

**Work.** After a producer said they could not tell where a new block had appeared, I asked Codex to scroll to it and highlight it. After seeing the interaction, I specified which area should be highlighted and how the section label should look. [#687](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/687)

**Representative prompts.**

> 그리고 그 편집기 내부에서 칩 추가하면 본문으로 슈루룩 올라가면서 어느 부분 추가된건지 좀 표시됐으면 좋겠음. 파악이 안된다는 피드백을 받았어

> 상품 소개는 왜 상품소개라고 회색으로 안적혀있으며, 왜 해당 영역이 아니라 더 넓은 영역을 강조하는 것이며... 통일성 좀 맞춰라 제발

**Result and review.** The revised editor scrolls to the new text or photo input and briefly outlines only that input. I checked the revised interaction. The PR records a check at a 390 px viewport and 12 passing browser cases. [#687](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/687)

### Takeaway

The farmer pilot, participant UAT, and repeated tests by our team caught problems across checkout, deposit matching, and producer editing. Testing full workflows showed us problems that checks of individual screens could miss. I also studied open-source references from Daangn and Meta to see how they maintain design templates. That helped me decide which parts of a template to share across screens and where to let a screen adapt. Next iteration, I want to give the agent the constraints of the whole workflow up front and then test that workflow myself.

## Minsun Kim

[Original contribution](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/minsunkim/dev-336-assigned-uat-fixes/docs/evaluation/i4-minsun-ai-contribution.md)

**Status at compilation.** The implementation PR #649 and the shared history PR #677 are merged. The original draft below remains the source for this individual account.

Prepared 17 November 2026 for DEV-277 / DEV-271. This is an evidence-backed contribution draft for the team report. Author confirmation and the November 19 final check remain open.

### Work and evidence

I asked Codex to review all issues assigned to me, implement the pending code tasks on a new branch, commit each task separately and open a PR. The resulting branch is minsunkim/dev-336-assigned-uat-fixes. DEV-336 preserves reservation-period identity and order locks; DEV-337 refreshes consumer prices when returning to a screen and retains checkout price reconfirmation; DEV-340 fixes the product/chat Back loop. DEV-244 prepares a versioned sequence-order oracle without rewriting its original failed result. Per-issue task files and commits retain the implementation decisions.

Tools/model: Codex, GPT-6.1-sol; Linear for requirements/status; Figma for editable design synchronization; Git/GitHub for source history and the PR; local PostgreSQL, pytest, Mock contracts, TypeScript and Playwright for verification. No paid product-AI call was needed for these fixes.

### Representative Prompts

> please create a new local branch, solve all the tasks step-by-step, commit after each task, create a pull request when all edits are finished.

This excerpt is from the implementation request in this conversation. It is not a reconstructed example or a full conversation export.

### What helped

Reading the issue and contract together exposed that the server accepted stageId but still reused periods by array position. The agent could trace this mismatch through reservation counts, order locks and the current UI payload, then test identity preservation rather than only the visible row order. It also identified that several In Review issues already had merged implementations, avoiding duplicate changes. Separate commits make each issue's code and evidence reviewable.

### Failures and corrections

The agent's first invalid-ID test compared two different response shapes: the producer detail contains extra counters that the period-save response omits. It corrected the fixture comparison to compare the same endpoint before/after and retained full atomicity assertions.

Initial browser assertions assumed paused products still display prices, that a farm room exposes tabs, and that the chat tab's accessible name excludes its unread count. Inspection of the actual UI and current components corrected these assumptions. Final cases independently verify live price refresh, disabled reservation during a pause, the accessible tab-root action, direct-entry fallbacks, repeated Back navigation and the existing explicit price-change gate. The failed runs remain local; only the final measured results are described as passing.

After the user restored Figma access, the editing service could not load Pretendard Variable or override text properties bound to that missing font. The agent verified the app’s explicit Noto Sans KR fallback, created editable state copies with that supported family, and preserved the source screens/library. Independent design review caught missing uploaded-photo preview/delete controls and the wrong timeout icon; these and a loading-indicator alignment issue were corrected before final visual/readback verification. The font/component-copy limitation remains explicit in the design evidence.

The broader CI run then exposed a latent test-data error: a random UUID sometimes resembled a bank account, so the existing privacy filter masked the message and the exact raw-text locator failed. The screenshots and unchanged local reproduction distinguished this from message-order loss. Public fixture suffixes were changed to an injective letter-only encoding while retaining all assertions and UUID idempotency keys. The corrected two-case spec passed all six cases over three repetitions, and seven API scenarios passed again.

### Verification and human boundary

The initial implementation gates at d2386f3 were 1,835 server tests passed / 1 skipped with the UTC database setting used by CI; 339 Mock tests passed / 1 skipped; all five workspace typechecks; seven real API integration scenarios; and 13 browser cases. The original v1.0 and proposed v1.1 matrix validators each validate 44 cases. These are local synthetic checks, not participant UAT, production deployment or native-device acceptance.

After main advanced, the agent integrated 923a2eb, preserved follower metadata and first-reservation UX, and updated the design states for the added deposit guidance/order-status line. The merged client passed all five workspace typechecks, 381 Mock tests with 1 skip, seven real API scenarios and 21 browser cases. A price assertion was scoped to the selected option after the new price stair made the original locator ambiguous; its exact old/new price assertion was retained.

The user provided the requirements, initially held Figma work, then verified access and resumed it. DEV-319/321/337 now have reviewed editable design states linked in figma-recovery-2026-11-17.md. No personal diff review or manual code correction by the user has been observed in this session. Human review, PM adoption of the prospective oracle, production UAT reset, participant UAT and submission evidence remain distinct requirements.

Effort: Agent approximately 2.5h of elapsed session time (approximately 1.5h implementation plus 1h resumed Figma/integration work), estimated from recorded work timestamps and including an interruption; active model time was not isolated. Human time is unconfirmed. Tokens are not supplied by the session and are left unrecorded. No time-saved or productivity percentage is inferred.

## Zahra Gholami

[Original contribution](https://linear.app/sswp6/issue/DEV-271/i4-collect-individual-ai-collaboration-contributions-and-compile-the#comment-a1191702-2758-4e2f-b645-ec350f25a31e)

**Status at compilation.** PR #661 is merged. PRs #663 and #668 are open and ready for review. The recommendation below for another sealed set is part of the original author account. The team’s later decision for I5 is to use capability and regression suites. [Team decision](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/672)

Personal contribution · Updated November 18, 2026.

Period: November 7–19, 2026, Asia/Seoul — everything after I3 ended on November 6.

**Records reviewed.**
- I used the course Session Exporter 0.1.0 (commit `3251f6338e647fda5e7abb6f6108f6f176b5ae9f`) with `--tool both --from 2026-11-07 --to 2026-11-19 --timezone Asia/Seoul`.
- It selected three Claude Code sessions in this repository: `7956eb70` (from November 11), `6260e705` (a short continuation on November 15) and `eed73422`. The last one runs from November 5 to 8, so it spans the end of I3, but none of my typed input in it falls on or after November 7.
- Two more sessions were excluded because their working directory moved outside the repository.
- There are no Codex sessions in this period.
- The final re-scan passed. The redacted archive is kept privately, outside the repository (SHA-256 `73dbcba43c95a221ceb146384748a1ef4cb2411ecab38ec5911f326319dde1e7`).
- From the selected sessions I read the 58 messages I typed, all in `7956eb70` and `6260e705`, November 11–17. Automatic continuation and usage-limit notices are left out. Some answers I gave through the agent's on-screen choice dialogs are not in that count.
- The archive was made on November 17. The work on November 17–18 after it (holdout v2, DEV-355, the demo) is described from the PRs, issue files and Linear records, not from the archive.
- Tool output, pasted teammate text and the original logs are not published.

**Tools and models.**
- The development agent was Claude Code with `claude-opus-5-5`, as recorded in the session metadata.
- The products' own models were the systems under test, not tools I wrote code with:
  - Claude Haiku 4.5 for chat answers
  - Gemini 3 Flash Preview for draft filling and OCR, and for the new evaluation judge
  - a GPT stage-2 model, tried only in the DEV-355 evaluation runs, not in the product

### 1. Where AI Was Used

My I4 role was testing and improving the two AI features, and proving any improvement with numbers. I used the agent to:
- write evaluation criteria and frozen question sets
- run paid evaluations and analyse failures
- implement fixes and run the test suites
- open PRs and run the first AI review
- record the working demo
- draft messages to the PM

I set scope, chose which results to trust, made the product and privacy decisions, and approved merges.

- **Evaluation criteria and baselines** ([#580](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/580), DEV-263, merged):
  - Pass lines agreed with the PM before any improvement and never lowered.
  - Chat regression baseline: 180/180.
  - Draft-filling baseline on 23 synthetic sources.
  - The public draft baseline on 24 sources is a follow-up, [#636](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/636), merged: 60.2% of facts, 64.2% of critical facts.
- **Chat answer quality** ([#591](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/591), DEV-265, merged):
  - Measured on a frozen 29-question capability set written before any fix.
  - Answerable accuracy 75.0% → 98.3%.
  - Mandatory handoff 88.9% → 100%. This closes a safety failure where "택배비 빼주시면 안 돼요?" was answered instead of being sent to the farmer.
  - Regression 180/180 and guards 5/5 kept. 17 trials went FAIL→PASS and none went PASS→FAIL.
- **Draft filling** ([#637](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/637), DEV-264, merged). Two runs of the final code on the 24 public sources:
  - Facts 60.2% → 67.7%, critical facts 64.2% → 75.4%.
  - Semantic recall 67.3% → 74.8%.
  - All 24 sources fully read, against 22 before.
  - The 95% and zero-forbidden pass lines are still not met.
- **Holdout v2** ([#661](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/661), DEV-264, awaiting the PM's review): run once on the merged code, 12 unseen sources.
  - Facts 75/134 (56.0%), critical 25/33 (75.8%), semantic 95/134 (70.9%), forbidden 3, unsupported 2.
  - Critical facts held at the development level (75.8% vs 75.4%), but total facts were about 12 points lower, and safety was worse on unseen material.
- **Draft-filling follow-ups** ([#663](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/663), DEV-355, draft, in progress):
  - Because the holdout showed that the prompt's safety rules don't hold on new material, the safety rules moved into code checks: Korean-form ranges, farm product line-ups, other products' packages, and "건강한 … 먹거리" as a health claim.
  - A stage-2 model trial on the development sets gave +8 facts on average but −2.5 critical facts. Forbidden was 1 in both runs and unsupported 0 in both. The checks and the model changed together, so this does not isolate either one.
  - A stage-1 prompt change (v10) was tried and reverted because total facts fell from 254.5 to 244.
- **Working demo** ([#668](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/668), DEV-282, awaiting the PM's review): an automated, captioned 43-second recording on the local server. It shows the chat rule answers and the haggling handoff, and draft filling leaving out five unsafe phrases. It uses the mock analyser and makes no model calls. The video is in DEV-282's Resources.
- **Follow-ups:**
  - DEV-333: compare regex and cheap-model question classification for chat.
  - DEV-355: finish the work above.

### 2. How I Revised the Prompts and Scope

At the start I asked the agent to read Linear and tell me what was urgent, rather than assuming. When I lost track of the PM's questions, I asked it to explain them simply, then to "write a whole explanation … so I can send to jinu and ask point by point". The PM answered each point in writing, and those answers became the recorded decisions.

I asked for merges in a safe order instead of rushing to the next result. For example: "shouldn't we resolve the two prs before running the draf-filling??" I asked "can I approve them myself" before merging, and recorded my own diff review in the PR, as our high-risk rule allows.

When the first draft results came back low, I asked what to do. I then chose to push further rather than carry a half-finished benchmark into I5. I asked for a plan that implements fixes "one-by-one" and validates each one before starting the next. That rule shaped the rest of the work:
- every change got its own test run and a keep-or-revert gate
- one change was reverted in DEV-264, and another (the v10 prompt) in DEV-355

When a plan reversed a privacy decision, I stopped it and asked why the name had not been sent in the first place, and whether sending it was a big issue, before approving. When I asked for the session record, I corrected the agent's date range to start right after I3 ended.

For the demo, I chose the format myself (an automated recording with the mock analyser, like 김민선's), watched the video, and asked for longer caption pauses because the first version was too fast to read.

### 3. What AI Did Well

- **It traced failures to checkable causes.** For draft filling, it sorted every missed gold fact by where it was lost, without paying for new runs. That showed a hidden 40-candidate cap was cutting long PDFs mid-document, and that our own number check was rejecting combined facts like "2kg: 8~18과".
- **It kept the measurement honest.**
  - It found that 50 of 72 model-routed chat trials in the 11/11 baseline had never reached the model, and wrote a correction.
  - It found a scorer bug ("Since 1966," read as an unsupported number).
  - It reported the final draft result as a two-run mean after showing that two runs of the same code differ by about ±35 facts.
- **It found that our evaluation database's budget ledger was almost full,** with $4.65 of past spending against a $5 limit. Without that, the single holdout attempt would have aborted and been wasted.

### 4. Errors and Limitations

- **It misread the 11/11 chat baseline.** It first reported "fewer model calls" as a finding, but most calls had failed before reaching the model. It found this itself later and the record was corrected (#580).
- **It wrote over-matching chat rules three times.** Each was caught by review, not by the agent while writing:
  - "너무 달아요" got the Brix answer (AI first review)
  - "다음 예약 언제 오픈해요?" got delivery dates (PM review)
  - "얼마나 달라요?" got the Brix answer (spec-check)

  All were fixed with tests before merge.
- **It stated a wrong fact about our product:** that the app sends the product name to the model. The worker actually removes it. It corrected this before implementing, and I made the decision again on the right facts.
- **It picked the wrong cause or impact three times:**
  - It blamed aborted runs on the run's `--max-usd` cap, when the real cause was the global spend ledger.
  - It blamed one reverted change for two safety items that then appeared again without that change, which means they were run-to-run noise.
  - It told the PM that existing drafts would be re-processed on deploy. They aren't. They only stop showing the polished text until the producer re-runs analysis.

  All three were corrected in the records.
- **It over-reported single-run peaks** (74.1% facts, 86.6% critical) as improvements. The honest final number, from two runs, is lower.
- **The demo captions were wrong twice before sharing.** It first credited the DEV-355 code checks, which are not merged and not in the recorded code; it caught this when reviewing its own screenshots. Its first AI review of #668 then found another caption saying server validation removed the unsafe text, when in the mock recording the mock stage 2 does that with the same check functions. The caption was fixed and the video re-recorded.
- **A test-environment problem found during DEV-355:** `conftest.py` clears `ANTHROPIC_API_KEY` with an empty value, but the settings ignore empty values, so the local key stayed active. Three endpoint tests may have called the live model. This is unresolved, and usage from those runs is unknown.
- **Smaller slips:**
  - two commits went in with failing tests or lint and were fixed before the PR
  - an automatic formatter changed unrelated lines, which were reverted
  - a shell quoting bug and a missing `--yes` flag stopped two runs before any cost
  - it gave me an `--estimate-only` command without `--out`, which failed before any cost (#661)
  - a check run it started emptied `test-results/` and deleted the first demo recording; it was recorded again and a copy kept elsewhere
- **Limits of the results:**
  - All improvements were tuned on development sets that I could see. The chat capability questions were written by our team, not real users.
  - The draft results are automatic scores; human review of the drafts is pending (PM).
  - Holdout v2 is now used. Any new claim that the gains hold on unseen material needs a new sealed set.

### 5. Human Decisions and Review

- **Pass lines** were agreed with the PM before improvements and kept, even though the draft results don't meet them.
- **CAP-009 ("냉장고에 넣어야 하나요?")**: I first thought it should go to the farmer. After seeing that the answer quotes the farm's own FAQ, I kept the gold as "answer". I also reviewed 18 chat answers by hand.
- **I decided:**
  - to send the masked product name to the draft model (approved by the PM on 11/17, because it reverses an earlier privacy decision)
  - to reject clear policy text (refund, compensation, sales ended)
  - to treat "건강함을 담" and "건강한 제주 먹거리" as health claims, following the gold
  - to revert the v10 stage-1 prompt after reviewing the two-run numbers
  - a $6 budget for the paid evaluation runs
- **Semantic judge on the holdout:** the PM approved it on four conditions. No-training providers only (enforced in code), only totals shared, strict recall stays the pass line, and one run.
- **Holdout rules from the PM:** no AI agent may open the holdout folder. I ran it myself in my own terminal and gave the agent only totals. The first attempt stopped before any model call because of an old 11/05 incomplete-attempt marker; I decided to record the second attempt with `--force-rerun` and its reason.
- **Merges:** #580, #591, #636 and #637 were merged on my instruction after I read the diffs. #591 and #637 are high-risk (`server/app/ai/**`), and my review is recorded in each PR. #661 and #668 are waiting for the PM's review; #663 is still a draft.
- **Hours.** Human hours are my own estimates, as recorded in the PRs: #580 4h, #591 4h, #636 4h, #637 5h, #661 4h, #663 6h so far, #668 1h. Agent hours in the PRs are the agent's estimates ("약"). I did not measure tokens.

### 6. Lessons and Next Steps

- **One run is not a result.** Two runs of identical code moved 35 facts each way. Comparisons need repeated runs, paired per-fact counts and a fixed denominator, or the numbers flatter us.
- **A gate per change made it possible to throw work away.** The "keep source wording" change raised recall in its run, but it lowered critical facts. The v10 prompt helped PDFs in one run but lowered total facts. Because each step had its own gate, both were easy to revert.
- **Unseen data tells a different story.** The prompt's safety rules held on the development sets but not on holdout v2, which is why they are moving into code.
- **Evaluation infrastructure needs checking like product code:** the scorer, the spend ledger, whether calls really reached the model, and the test environment's API key all needed it.
- **Next:**
  - get the PM's human review of the drafts, #661 and #668
  - DEV-355: fix the test environment, then a confirmation pair on the product setup
  - a new sealed set before any new generalisation claim

### Evidence and Session Review

- [#580](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/580): criteria and baselines, including the 11/11 correction
- [#591](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/591): chat results, `docs/evaluation/i4-ai/chat-capability/results-2026-11-15.md`
- [#636](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/636): public draft baseline
- [#637](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/637): draft results `docs/evaluation/i4-ai/draft-results-2026-11-18.md`, step-by-step record `server/tasks/DEV-264.md`
- [#661](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/661): holdout v2 result
- [#663](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/663): DEV-355 follow-ups, record `server/tasks/DEV-355.md`
- [#668](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/668): working demo, `docs/evaluation/i4-ai/demo-segment.md`; video in DEV-282
- [Course Session Exporter](https://github.com/snuhcs-course/session-exporter), commit `3251f6338e647fda5e7abb6f6108f6f176b5ae9f`, range 2026-11-07 – 2026-11-19 (Asia/Seoul):
  - three Claude Code sessions selected (`7956eb70`, `6260e705`, `eed73422`), two excluded because their working directory left the repository
  - final re-scan passed; archive SHA-256 `73dbcba4…de1e7`, kept privately
  - quoted prompts are my own input records; logs, credentials, holdout material and teammates' records are not included

### Representative Prompts

Times are Asia/Seoul as recorded in the session log. Typos are kept as typed.

- **2026-11-11 22:23:42 · `7956eb70`:** new iteration has begun. get the updates from linear and tell me what my most urgent tasks are
- **2026-11-15 18:45:41 · `7956eb70`:** I need you to write a whole explanation like you just did for me so I can send to jinu and ask point by point with the sufficient explanation
- **2026-11-15 19:49:08 · `7956eb70`:** put jinu as the reviewer. shouldn't we resolve the two prs before running the draf-filling??
- **2026-11-15 19:54:01 · `7956eb70`:** now I am not sure. the answers that the model gave seem like common sense. maybe there isn't a need to hand it off to the farmer because it seems like an answer any farmer would give. what do you think? what is your judgement here
- **2026-11-16 22:32:09 · `7956eb70`:** can I approve them myself
- **2026-11-17 03:00:52 · `7956eb70`** (typed when rejecting a plan): why was the name not sent in the first place? if we do send names, is it a big issue?
- **2026-11-17 03:22:48 · `7956eb70`:** if I were to grind and try to fix it before the deadline for i4, what should be done? i want to raise it as much as possible and not bring half done benchmark to i5.
- **2026-11-17 03:25:13 · `7956eb70`:** write a plan to implement all one-by-one. validate each one after implementation before starting the next one

## Hyun Park

Personal contribution · November 20, 2026 · DEV-279.

I wrote this from the messages I typed in my Claude Code sessions and from the PR and Linear records. The full conversations are not published.

Period: November 7–20, 2026, Asia/Seoul.

### Work and evidence

On November 11 I decided to take a free role this iteration and work on the rebrand and the first-reservation UI/UX. Before that, from November 7 to 10, I cleaned up after the I3 deadline and handled operations work.

- November 7–9: country-of-origin notice and its placement under the product name, a demo-record test fix, the iteration-3-demo sync, the Kakao login button moved into the page body in both apps, and the PostHog retention period in the privacy policy matched to the actual setting. [#497](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/497) · [#499](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/499) · [#504](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/504) · [#533](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/533) · [#534](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/534) · [#554](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/554)
- November 10: easel-canvas bumped to 0.1.1 (DEV-26). [#561](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/561)
- November 17: a brand direction proposal (DEV-311) and an audit of the first-reservation flow with UX fixes (DEV-268). [#578](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/578) · [#579](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/579)
- November 17: the fixes from that audit. A "지금 예약" label, a price stair by period and trust rows on product detail and home (DEV-348); first-reservation UX on login, checkout and deposit instructions (DEV-356); and requesting the Kakao phone-number consent item and prefilling the phone number (DEV-78). [#647](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/647) · [#651](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/651) · [#652](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/652)
- November 19: the integrated brand applied to app icons, the default share card and page meta (DEV-358). [#662](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/662)
- Operations work outside PRs. On November 7 I built the consumer and producer Android APKs with the EAS internal profile and uploaded them to the GitHub Release `apk-internal-2026-11-07`. On November 10 the Kakao business app review was rejected because the service was still in preparation. The agent prepared one screen of the user flow and a test product, I applied again, and it was approved on November 12. On November 15 I applied for review of the Kakao Account phone-number consent item, which #652 needed. I did the console logins and submitted the applications myself.

Tools: Claude Code desktop. The main session ran Claude Fable 5.2 for planning, briefs and review, and handed code, document and design work to Opus 5.5 subagents. I have used this split in this repository since November 4. Design proposal boards were in an Easel canvas and issues in Linear. I only have View access to Figma v6, so I read it but did not edit it. Updating it is a follow-up, DEV-357.

### Representative Prompts

> 이번 이터레이션 내가 프리롤로 작업할예정인데,  어떤거 하는게 좋아보여? 리브랜딩? ui/ux 개선? sns운영? 광고? 등등?

November 11. I asked this before picking my scope. From the answer I chose the rebrand and the first-reservation work.

> 일단 리디자인/uiux 바로 진행하도 될거 같다. 진행후 충돌나면 해결하면되지.  작업 어떻게 진행되고 있었는지, 어떤순서로 진행되고, 그래서 예상결과는 무엇인지. 내가 원하는 수준이 되는 진행과정인지 판단해

November 15. I decided not to wait on other open work and asked the main session to lay out the order and expected result, so I could judge the plan before any code.

> 주문서 입금안내에서 기존 정보 입력빠지면안됨. 그리고 막대 그래프 너무 딱딱한데 더 나은거 없나

November 16. Feedback on the design board. The draft had dropped existing fields, and the price stair looked too stiff.

> 취소선 정가가 뭔제, 그리고  첨부한 이미지에서 10월 17일, 11월 1일에 가격이 안오르는데 왜 있는거야?

November 17. I questioned two parts of the price stair from a screenshot before approving it.

> 좋은데, 단계 디자인 더 눈에 들어오게. 이상하게 촌스럽게 말고. 뉴욕 에이전시 터치

November 15. This is how I sent back an early price stair mark, one of the rounds described under Failures and corrections.

### What helped

- Screen changes went through a design board, my approval, implementation, and then before/after captures in the PR and Linear. I could see and fix a screen before any code was written.
- The first-reservation audit (DEV-268) went through login, product detail, checkout and deposit instructions in one pass and summarized seven fixes. Those became the scope of #647 and #651.
- In DEV-358 the agent redrew the icons and share card with a script (`scripts/generate-brand-icons.mjs`) and left a test (`scripts/test-brand-meta.mjs`, 11 cases) that compares declared sizes with the actual PNG sizes and checks the safe zone.
- After merges, deployment was checked from the deploy logs and the production responses (curl, file hash comparison), not from the Actions label.

### Failures and corrections

- The integrated design draft removed some existing fields from checkout and deposit instructions. I caught it on the board. I set the rule that a combined proposal only adds to the current screen and never removes information, inputs or consent items, and it is recorded in `docs/design/tasks/DEV-268.md`.
- The first versions of the price stair mark looked stiff and dated. I sent them back several times. The final version uses three pill-shaped bars.
- In DEV-358, the first symbol size in the Android adaptive icon (62% of the canvas) went slightly past the safe zone when calculated: 31.6% against a 30.56% radius. It was reduced to 59%, and the test now checks this ratio.
- After pulling main, the local typecheck failed. The cause was a stale, gitignored Expo route type cache; CI was fine. During this the agent once misreported a rerun result and corrected it after reading the log.
- The agent is not allowed to touch the production database, production variables or the Kakao console login. It gave me the commands and how to check them, and I ran them.
- On November 20, in the first draft of this contribution, the agent wrote that none of the PRs touched `server/**`, but #652 changed two documents under that path. The main session checked the file lists with `gh pr view` and corrected it.

### Verification and human boundary

I decided the direction: the scope of my free role, the integrated proposal, version 5 of the stair mark, and keeping the '팬' label and the struck-through list price. I approved the boards. For #652 I read the diff and then told the agent to merge, with this prompt:

> 652 diff 읽었어 머지해

I put PRs in the merge queue, applied for Kakao business review and did the production console work. The design PRs (#647, #651, #662) stayed out of the high-risk path `server/**`. #652 changed two documents under `server/**`, so I read its diff before the merge.

Limits. The production screens for #647 and #651 were checked only through the bundle and responses; a person has not yet looked at them on a real screen. Updating Figma v6 is still open (DEV-357).

The PR numbers and dates in this section were checked against GitHub records: 13 PRs from #497 to #662, including #561.

Effort: #662 is recorded in the PR as Agent about 2.5h and Human about 0.5h, both estimates. Human time for the other PRs is not recorded. Tokens not recorded. No time-saved figure is inferred.
