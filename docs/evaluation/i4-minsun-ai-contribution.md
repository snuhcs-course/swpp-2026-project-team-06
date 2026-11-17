# Minsun Kim — Iteration 4 AI collaboration contribution

Prepared 17 November 2026 for DEV-277 / DEV-271. This is an evidence-backed contribution draft for the team report. Author confirmation and the November 19 final check remain open.

## Work and evidence

I asked Codex to review all issues assigned to me, implement the pending code tasks on a new branch, commit each task separately and open a PR. The resulting branch is minsunkim/dev-336-assigned-uat-fixes. DEV-336 preserves reservation-period identity and order locks; DEV-337 refreshes consumer prices when returning to a screen and retains checkout price reconfirmation; DEV-340 fixes the product/chat Back loop. DEV-244 prepares a versioned sequence-order oracle without rewriting its original failed result. Per-issue task files and commits retain the implementation decisions.

Tools/model: Codex, GPT-6.1-sol; Linear for requirements/status; Figma for editable design synchronization; Git/GitHub for source history and the PR; local PostgreSQL, pytest, Mock contracts, TypeScript and Playwright for verification. No paid product-AI call was needed for these fixes.

## Representative actual prompt

> please create a new local branch, solve all the tasks step-by-step, commit after each task, create a pull request when all edits are finished.

This excerpt is from the implementation request in this conversation. It is not a reconstructed example or a full conversation export.

## What helped

Reading the issue and contract together exposed that the server accepted stageId but still reused periods by array position. The agent could trace this mismatch through reservation counts, order locks and the current UI payload, then test identity preservation rather than only the visible row order. It also identified that several In Review issues already had merged implementations, avoiding duplicate changes. Separate commits make each issue's code and evidence reviewable.

## Failures and corrections

The agent's first invalid-ID test compared two different response shapes: the producer detail contains extra counters that the period-save response omits. It corrected the fixture comparison to compare the same endpoint before/after and retained full atomicity assertions.

Initial browser assertions assumed paused products still display prices, that a farm room exposes tabs, and that the chat tab's accessible name excludes its unread count. Inspection of the actual UI and current components corrected these assumptions. Final cases independently verify live price refresh, disabled reservation during a pause, the accessible tab-root action, direct-entry fallbacks, repeated Back navigation and the existing explicit price-change gate. The failed runs remain local; only the final measured results are described as passing.

After the user restored Figma access, the editing service could not load Pretendard Variable or override text properties bound to that missing font. The agent verified the app’s explicit Noto Sans KR fallback, created editable state copies with that supported family, and preserved the source screens/library. Independent design review caught missing uploaded-photo preview/delete controls and the wrong timeout icon; these and a loading-indicator alignment issue were corrected before final visual/readback verification. The font/component-copy limitation remains explicit in the design evidence.

The broader CI run then exposed a latent test-data error: a random UUID sometimes resembled a bank account, so the existing privacy filter masked the message and the exact raw-text locator failed. The screenshots and unchanged local reproduction distinguished this from message-order loss. Public fixture suffixes were changed to an injective letter-only encoding while retaining all assertions and UUID idempotency keys. The corrected two-case spec passed all six cases over three repetitions, and seven API scenarios passed again.

## Verification and human boundary

The initial implementation gates at d2386f3 were 1,835 server tests passed / 1 skipped with the UTC database setting used by CI; 339 Mock tests passed / 1 skipped; all five workspace typechecks; seven real API integration scenarios; and 13 browser cases. The original v1.0 and proposed v1.1 matrix validators each validate 44 cases. These are local synthetic checks, not participant UAT, production deployment or native-device acceptance.

After main advanced, the agent integrated 923a2eb, preserved follower metadata and first-reservation UX, and updated the design states for the added deposit guidance/order-status line. The merged client passed all five workspace typechecks, 381 Mock tests with 1 skip, seven real API scenarios and 21 browser cases. A price assertion was scoped to the selected option after the new price stair made the original locator ambiguous; its exact old/new price assertion was retained.

The user provided the requirements, initially held Figma work, then verified access and resumed it. DEV-319/321/337 now have reviewed editable design states linked in figma-recovery-2026-11-17.md. No personal diff review or manual code correction by the user has been observed in this session. Human review, PM adoption of the prospective oracle, production UAT reset, participant UAT and submission evidence remain distinct requirements.

Effort: Agent approximately 2.5h of elapsed session time (approximately 1.5h implementation plus 1h resumed Figma/integration work), estimated from recorded work timestamps and including an interruption; active model time was not isolated. Human time is unconfirmed. Tokens are not supplied by the session and are left unrecorded. No time-saved or productivity percentage is inferred.
