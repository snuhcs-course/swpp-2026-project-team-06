# AI Collaboration Report – Iteration 4

**Team 6 — Farmclub | November 2026**

**Contributions in this draft** — Jinwoo Jang, Minsun Kim and Zahra Gholami. **Development tools** — Claude Code (Opus 5.5) and Codex (GPT-6.1 Sol where recorded). [Member evidence and selected inputs](AI-Collaboration-Report---Iteration-4---Evidence).

## 1. Where AI Was Used

We used coding agents to fix transaction and producer workflows, implement regression checks, and diagnose failures in the app’s AI features. Jinwoo directed improvements to bank-transfer instructions, producer editing and account access. Minsun used Codex to preserve reservation-period identity, refresh checkout prices and repair chat navigation. Zahra used Claude Code to set up evaluation runs, investigate chat and draft failures, implement fixes and record a demo. Claude Haiku and Gemini were systems evaluated within Farmclub. The team retained decisions about product behavior, privacy and acceptance criteria. [#648](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/648) · [#649](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/649) · [#580](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/580)

## 2. Actual Prompts and Revisions

Minsun asked, “please create a new local branch, solve all the tasks step-by-step, commit after each task, create a pull request when all edits are finished.” Separate commits made each fix and its evidence reviewable. Jinwoo initially asked the agent to scroll to a newly added editor block and show where it appeared. After seeing the result, he clarified, “상품 소개는 왜 상품소개라고 회색으로 안적혀있으며, 왜 해당 영역이 아니라 더 넓은 영역을 강조하는 것이며... 통일성 좀 맞춰라 제발”. The revised editor matches the surrounding section labels and briefly outlines the new input. Zahra asked, “write a plan to implement all one-by-one. validate each one after implementation before starting the next one”. Individual checks gave her a basis for keeping or reverting each change. [#649](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/649) · [#687](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/687) · [#637](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/637)

## 3. What AI Did Well

Minsun’s agent found that the server accepted a period ID but still reused periods by their array position. Tracing that mismatch through order locks and reservation counts led to tests of period identity. Zahra’s agent traced missing draft facts to the candidate limit on long documents and identified numeric citations that the draft validator rejected. The resulting public development comparison moved strict fact recall from 60.2% to 67.7%, the mean of two runs after the changes. For delivery privacy, Jinwoo asked an agent to check that producers could still ship orders. An independent agent wrote tests from the specification, and all 26 targeted API cases passed. [#649](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/649) · [#637](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/637) · [#676](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/676)

## 4. Errors and Corrections

Early bank-transfer advice still proposed a ten-character depositor name because the agent had too little context about the bank field. Jinwoo chose a shorter reference after checking the payment flow. The unified editor also exposed how easy it was to miss broken draft reopening by relying on agent checks without walking through the complete flow. Minsun’s agent first compared responses from different endpoints in an atomicity test, then fixed the comparison. Zahra’s agent initially reported fewer model calls. It later found that the calls had failed before reaching the model and corrected the baseline record. [#648](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/648) · [#673](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/673) · [#649](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/649) · [#580](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/580)

## 5. Manual Decisions and Review

Jinwoo checked the editor interaction and reviewed the final changes. Minsun supplied requirements and directed the design review. Zahra reviewed 18 chat answers by hand, kept agreed pass criteria, and used paired results to revert a prompt change. These actions describe the team’s decisions and checks. The agents made the code edits described in these cases. [Member evidence](AI-Collaboration-Report---Iteration-4---Evidence)

## 6. Takeaway

Use the full user workflow when specifying a change and test it again after implementation. Following the TA discussion, the next iteration will turn concrete failures into capability cases and move reliably fixed cases into the regression suite. [#672](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/672)
