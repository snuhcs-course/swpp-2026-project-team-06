## 2026-10-16 — Test readiness, review bottlenecks, and refund behavior

- **Contributors**: Minsun Kim, Jinwoo Jang, Hyun Park, Zahra
- **Related work**: [#96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96), [#99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99), [#113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113), [#114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114), [#116](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/116)

### Agenda

- Establish what can actually be tested the following day.
- Address review delays and integration dependencies.
- Confirm partial-refund state behavior.

### Discussion

- Minsun requested an evidence-based update by 23:00: current issue/PR state, remaining blockers or assistance, and when a working build could be verified. “Implemented” and “installed/deployed and verified” needed separate labels.
- Jinwoo reported producer frontend completion with backend integration still required; the AI sales-page interface also needed further verification. Review delay was preventing subsequent work.
- The team discussed temporarily relying on each author to inspect their own changes, with additional coordination for overlapping areas. Minsun accepted an interim approach pending a fuller process review; it was not presented as a permanent replacement for the repository policy.
- Zahra reported manager approval/access, AI grounding/handoff, exception/refund history, and weight/Brix fixes merged with CI passing. Deployment behavior was still unverified. DEV-39 had test-setup and migration-numbering issues; DEV-44's checklist had not yet been executed.
- Partial refunds keep Order.status and fulfillment unchanged. Payment/refund history carries the partial-refund state; refundable balance includes product, delivery, and remote-area fees.

### Decisions

- Determine external-test readiness from a working build and actual verification, with proceed/reduce/postpone options.
- Prioritize backend integration and internal testing. Carry social-media work to a later iteration.
- Coordinate migration 0008 before merging overlapping work; keep DEV-39 outside the next external-test scope until verified.

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Consolidate component readiness and decide the test format | Minsun Kim | Internal test preparation |
| Complete producer/backend integration and resolve review dependencies | Jinwoo Jang, Hyun Park | [#98](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/98), [#113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113) |
| Resolve feedback-test setup and migration ordering | Zahra, Jinwoo Jang | DEV-39 / [#119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119) |
| Execute and record manager/AI checks | Zahra | DEV-44 |
