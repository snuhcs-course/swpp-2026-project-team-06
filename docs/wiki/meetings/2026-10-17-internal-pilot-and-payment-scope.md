## 2026-10-17 — Internal pilot, payment scope, and integration priorities

- **Contributors**: Minsun Kim, Hyun Park, Jinwoo Jang, Zahra
- **Related work**: Internal Test 1; payment scope; [DEV-68 / #141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141)

### Agenda

- Decide whether the first planned external user test is ready.
- Reduce dependencies blocking the connected service.
- Resolve the payment and iteration scope.

### Discussion

- Hyun reported checkout, Kakao login, and sandbox work ready for PR submission, while the deployment still used the earlier Mock flow. Android packaging and physical-device checks were not complete.
- Minsun changed the first test to an internal pilot. Pending merges, producer/backend integration, and incomplete deployment verification made full external E2E conclusions premature.
- The revised sequence was internal checks on 17 October, integration/fixes and deployed verification on 18–19 October, and an external test on 20 October only if the core journey became ready.
- The team reviewed direct transfer to the farm as an alternative to payment-provider dependencies. Discussion separated the essential order/deposit workflow from additional business expansion.
- Manual producer confirmation after comparing the received transfer with an order was proposed. Attribution of the confirming actor still required clarification and was resolved the following day.
- The team agreed to prioritize a working service and useful user feedback within available development capacity.

### Decisions

- Replace the first external session with an internal pilot and record real status, environment, evidence, and next steps.
- Keep the 20 October external-test scope conditional on integrated/deployed readiness.
- Proceed without listing or transaction fees in the current project scope; concentrate on core implementation and testing.
- Use direct farm payment as the implementation direction; finalize deposit-confirmation responsibility before completing the workflow.
- Broaden recruitment beyond the original consumer age focus where needed without claiming the customer hypothesis has been revalidated.

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Run component checks and enter actual outcomes | Hyun Park, Jinwoo Jang, Zahra | Internal Test 1 |
| Verify integrated journeys and decide external-test scope | Minsun Kim | PM integration |
| Implement the agreed direct-transfer ordering workflow after actor confirmation | Hyun Park | [#141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141) |
| Prioritize integration, fixes, and deployment checks on 18–19 October | Team | Iteration 2 |
