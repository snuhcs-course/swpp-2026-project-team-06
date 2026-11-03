## 2026-10-21 — Controlled rollout, test-data visibility, and review limits

- **Contributors**: Minsun Kim, Jinwoo Jang, Zahra, Hyun Park
- **Related work**: [Test-farm retirement, issue #190](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/190); farm-photo upload; operator tools; spec/code review

### Agenda

- Verify one connected producer/consumer journey before wider outreach.
- Remove artificial test listings from public discovery safely.
- Diagnose incomplete automated spec/code review.

### Discussion

- Producer outreach was underway. Minsun asked to verify a small initial set before contacting the remaining farms. Jinwoo reported farm approvals and paused wider outreach pending that check.
- Public discovery still showed artificial test farms. Sales pause alone did not hide them. Zahra pointed to the existing retirement/hide command, which preserves records while removing public visibility; deletion was deferred.
- Jinwoo reported a farm-profile photo-upload defect under repair. Hyun planned further operator-page functionality. Neither update was recorded as completed solely from that intention.
- Zahra explained that approved spec/code reviews were often ending INCOMPLETE because their inputs exceeded the configured limit. The team distinguished this optional AI review from mandatory CI.
- Minsun clarified that the limit was 60 KiB of UTF-8 input, not a character count. It was a local operating choice without a separate measurement justifying that exact value. Alternatives were to reduce irrelevant context or revise the limit.

### Decisions

- Validate a controlled producer/consumer sample before extending recruitment.
- Use the supported hide/retire path for test farms; do not treat sales pause as removal from discovery.
- Keep INCOMPLETE visible as an incomplete review, not a PASS.
- Preserve the safety purpose of bounded review inputs while assessing the appropriate context-selection and size policy.

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Verify the initial connected journey before further invitations | Minsun Kim, Jinwoo Jang | External test follow-up |
| Hide artificial test farms using supported operational tooling | Hyun Park, Zahra | [#190](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/190) |
| Complete and verify the farm-photo upload correction | Jinwoo Jang | Farm media workstream |
| Continue operator-tool implementation | Hyun Park | Operator workstream |
| Compare context reduction with a revised review-size limit | Minsun Kim, Hyun Park, Zahra | Spec/code review follow-up |
