# AI Collaboration Report – Iteration 4 – PM Evidence

Personal contribution for Team 6, ordered by when the work landed. Representative prompts are quoted in the original Korean.

## November 10–12 · UAT preparation and pilot analytics

**Work.** I used Claude Code (Opus 5.5) to prepare UAT account seeding and add producer-app events for the pilot. I chose to keep seeded farms hidden initially, defined the events and metrics, and reviewed the account-related changes. I also updated our PR and Linear templates to record human and agent effort separately. [#560](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/560) · [#568](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/568) · [#582](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/582)

**Representative prompt.**

> 그러면 파일럿 테스트하고 posthog 뜯어서 분석하는걸 목표로 해야겟네. 그래야 정성/정량적 지표가 나올거같아. 그렇지 않냐

**Result and review.** The analytics change gave us a way to read what producers did in the app alongside what they told us in the pilot. The Mock suite passed 313 tests, including 15 for the new event tracking. [#582](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/582)

## November 15–18 · Pilot follow-up, bank transfers, and evaluation

**Work.** The farmer pilot surfaced confusion about whether edits had saved. I used Claude Code to add save and apply feedback and reviewed the Figma version against existing app patterns. In UAT, a producer could match a transfer with a different depositor name only by elimination. I asked the agent to revisit both the bank transfer and the producer's reconciliation flow. [Pilot notes](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/wiki/meetings/2026-11-15-progress-for-ta-meeting-and-uat.md) · [#607](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/607) · [#648](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/648)

**Representative prompts.**

> 문구랑 흐름은 괜찮은데 토스트가 검정색인게 좀 어색하지 않나? 지금 다른 토스트 없나 우리 앱에?

> ㅇㅋ 우린 342 계획하고 있자. 입금자명 오작성 등을 했을때 어떻게 방어할 수 있으려나 ux적으로.. 그리고 궁금한게 지금 12자리 코드를 입금자 명으로 적게 시키는데 이거 애초에 불가능하지 않나 지금

**Result and review.** I had given the agent too little context about what fit in the bank's recipient-side label. The old order code was 12 characters, and the agent suggested a 10-character depositor name that still ignored that constraint. I chose a shorter nickname-based code and gave producers a way to ask the buyer about the transfer from the order. I should have checked both sides of the transfer before asking the agent for a design. After the TA meeting, I also asked Claude Code to document the next evaluation plan using capability tasks based on observed failures and regression tests for existing behavior. [#648](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/648) · [#672](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/672)

## November 19 · Resuming edits in the unified product editor

**Work.** I asked Claude Code to bring the different entry points into the same product editor. Claude Code and Codex also worked on saving and resuming edits and on the browser tests for those flows. [#653](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/653) · [#673](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/673)

**Representative prompt.**

> 걍 이번거에서 같이 맞춰버리자. 애초에 왜 얘네가 달라야되는지 잘 모르겠음.. 반려된 상품도 새로 만들기 화면으로 열게 하삼 (뭐 별로 중요한건 아닌거 같고.) 초안 카드 버튼 이름 이어서 채우기로 바꾸삼 ㅇㅇ

**Result and review.** Several paths for resuming an edit were broken, including reopening a saved draft. I relied too heavily on the agent's checks without walking through the whole sequence myself. I should have made a change, saved it, left the editor, and reopened it to check that the work was still there. The browser suite now covers reopening a saved draft. I reviewed the final diff and approved the merge. [#673](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/673)

## November 19 · OneStore login, delivery privacy, and UAT access

**Work.** I used Claude Code and Codex to add operator-issued login for OneStore review and align the privacy policy with the login-attempt cleanup behavior. I chose a separate UAT environment with issued accounts and approved removing the old evaluator entry point and seed accounts from release builds. I also asked Codex to verify that masking recipient details after delivery would preserve producers' shipping workflow. [#675](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/675) · [#676](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/676) · [#680](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/680)

**Representative prompts.**

> 처리방침을 실제 정리 방식에 맞게 수정

> 생산자가 배송하고 송장뽑는데는 문제없는거임?

**Result and review.** An independent agent wrote tests from the shipping specification. All 26 targeted API tests passed, and browser tests covered tracking entry and dispatch. I reviewed the login, privacy, and UAT access changes and approved the merges. [#675](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/675) · [#676](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/676) · [#680](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/680)

## November 19 · Feedback when adding a content block

**Work.** After a producer said they could not tell where a new block had appeared, I asked Codex to scroll to it and highlight it. After seeing the interaction, I specified which area should be highlighted and how the section label should look. [#687](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/687)

**Representative prompts.**

> 그리고 그 편집기 내부에서 칩 추가하면 본문으로 슈루룩 올라가면서 어느 부분 추가된건지 좀 표시됐으면 좋겠음. 파악이 안된다는 피드백을 받았어

> 상품 소개는 왜 상품소개라고 회색으로 안적혀있으며, 왜 해당 영역이 아니라 더 넓은 영역을 강조하는 것이며... 통일성 좀 맞춰라 제발

**Result and review.** The revised editor scrolls to the new text or photo input and briefly outlines only that input. I checked the revised interaction. The PR records a check at a 390 px viewport and 12 passing browser cases. [#687](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/687)

## Takeaway

The farmer pilot, participant UAT, and repeated tests by our team caught problems across checkout, deposit matching, and producer editing. Testing full workflows showed us problems that checks of individual screens could miss. I also studied open-source references from Daangn and Meta to see how they maintain design templates. That helped me decide which parts of a template to share across screens and where to let a screen adapt. Next iteration, I want to give the agent the constraints of the whole workflow up front and then test that workflow myself.
