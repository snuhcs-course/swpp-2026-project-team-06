## 2026-10-20 — External-test readiness and TA demo preparation

- **Contributors**: Minsun Kim, Hyun Park, Jinwoo Jang, Zahra
- **Related work**: [SWPP-118 / PR #189](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/189); producer recruitment; TA Meeting 2

### Agenda

- Confirm which payment path is available for participant testing.
- Prepare producer tasks and subsequent consumer checks.
- Finalize demo materials for the TA session.

### Discussion

- Minsun's daily plan flagged overdue issues and the external test's dependence on a usable payment flow. Because an earlier reminder still referenced PG approval, she requested explicit confirmation of the replacement bank-transfer behavior.
- Zahra confirmed the deployed operator/payment check recorded under SWPP-118: order → farm-account/deadline instructions → deposit confirmation → reservation complete. Producer confirmation and operator-assisted confirmation were distinguished; refund handling involved farm transfer and settlement marking.
- Minsun prepared producer instructions: enter real product information/photos/prices/quantity, save or request approval, report the exact step of any error, then inspect resulting orders and communication records after consumer testing.
- Jinwoo planned producer outreach. This planning update did not establish completed participant sessions or a successful real payment.
- Minsun coordinated integrated, producer, and consumer demo material. Existing producer footage was considered reusable; Hyun reported the consumer/demo slide update late in the day.

### Decisions

- Use the current bank-transfer flow in guidance; do not keep PG-dependent wording as the current implementation.
- Check the producer-to-consumer sequence and record exact failures.
- Prepare the TA presentation with the role-based recordings and their current limitations.

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Distribute producer instructions and confirm product availability | Jinwoo Jang | Producer testing |
| Coordinate consumer testing after products are ready | Minsun Kim | External test |
| Preserve the deployed operator/payment evidence | Zahra | [#189](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/189) |
| Complete the consumer/demo slide update and review the TA deck | Hyun Park, Minsun Kim | TA Meeting 2 |
