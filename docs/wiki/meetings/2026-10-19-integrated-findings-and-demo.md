## 2026-10-19 — Integrated findings, operator access, and midterm demo

- **Contributors**: Minsun Kim, Hyun Park, Jinwoo Jang, Zahra
- **Related work**: PM integration; [#168](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/168), [#113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113), DEV-85, DEV-87, DEV-90

### Agenda

- Finalize the midterm narrative and role-based demo.
- Verify new-producer and operator paths in deployment.
- Reconcile reported completion with unresolved integration failures.

### Discussion

- Consumer testing still excluded an unverified Android package; TWA packaging was being considered. Physical-device availability remained a constraint.
- Minsun prepared the midterm presentation. Jinwoo requested less text and clearer separation of the two AI features. Zahra confirmed AI customer support was deployed and added its technical explanation.
- A new operator approval page became usable in the afternoon. Minsun verified farm approval and one operator history record, then found approved-producer New product entry and Kakao re-login failures.
- The PM record was updated to 9 PASS, 6 FAIL, and 3 BLOCKED. Public product-edit propagation, manager refund/recovery, and physical-device journeys remained blocked. These were the recorded results at that time.
- Later, Hyun reported fixes for product entry and capacity-approval tooling and requested deployed verification. This report did not itself clear the earlier test cases.
- The team identified a mismatch between the documented source-analysis deployment state and implementation. Jinwoo confirmed implementation availability and took responsibility for enabling/checking it; source functionality and quality validation remained separate.
- The agreed logo was integrated. Minsun fixed the presentation UI scope for the submission, coordinated overall/role recordings, and submitted the midterm deck before midnight.

### Decisions

- Present implemented AI drafting and AI customer support separately and describe order consistency as a distinct technical issue.
- Include operator approval in the connected demo.
- Record defects and retests explicitly rather than overwrite earlier failures with a general completion message.
- Use stable role-based demo links while recordings are finalized.

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Retest new-product entry and approved-producer re-login after fixes | Hyun Park, Minsun Kim | F-07 / F-08; PM tracker |
| Verify deployed capacity approval and source-analysis availability | Hyun Park, Jinwoo Jang | DEV-87 / DEV-90 |
| Complete consumer/producer/operator recordings and final narrative | Minsun Kim, Hyun Park, Jinwoo Jang, Zahra | Midterm demo |
| Preserve blockers and arrange real-device follow-up | Minsun Kim, Hyun Park | DEV-41 / PM integration |
