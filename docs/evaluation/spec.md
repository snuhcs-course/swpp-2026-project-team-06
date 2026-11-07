# Defect regression evidence

Product behavior is defined by `docs/spec/`. This folder records the evidence used to evaluate that behavior. Issue-specific implementation scope and work records live in `tasks/<DEV-ID>.md`.

| Implementation decision | Reason / references |
| --- | --- |
| Keep dated baseline failures, fixed local results, and deployment observations separate. | A local fix does not establish that the deployed app contains it. See DEV-249 and DEV-253. |
| Use real API + browser integration with guarded, branch-specific local data. | FEAT-12 / AC-12-1, AC-12-8, AC-12-9; FEAT-33 / AC-33-2, AC-33-4. Do not create payments, orders, messages, or private photos in production for regression evidence. |
| Confirm an empty, unfollowed first-order conversation fixture before each entry case; restore AI settings and clean synthetic chat rows afterwards. | Seeded threads, follows, or formal inquiries can conceal DEV-242. Order eligibility is established through real checkout and admin endpoints; the fixture does not rewrite global order ownership. |
| Integrate new `scripts/e2e/*.spec.ts` cases through the existing Playwright discovery and root `make test-e2e` target. | Existing test entry points include the closure spec without a second runner or an unregistered command. |
| Record only synthetic text and safe metadata in committed reports. | M-02, N-05, N-06. Exclude tokens, private image bytes, delivery addresses, unrelated chat bodies, and raw browser traces. |
| Treat discovery, type checks, simulated focus changes, and native execution as distinct evidence. | A discovered test is pending until executed; desktop browser tests do not prove native app background behavior. |
| Keep the saved message sequence contract and KST date grouping. | DEV-235 / DEV-223. DEV-244 is a separate frozen-oracle decision, outside these defect fixes. |
| Keep closure open until required regressions, human review, merge, and read-only deployment confirmation are recorded. | `AGENTS.md`; model/migration changes require human review. |

Current records: [DEV-242 first-order conversation](dev-242-order-chat-regression.md), [DEV-249 task](tasks/DEV-249.md), [DEV-253 task](tasks/DEV-253.md).
