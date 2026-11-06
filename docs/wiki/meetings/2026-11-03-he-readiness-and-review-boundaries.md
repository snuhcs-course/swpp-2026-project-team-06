## 2026-11-03 — HE readiness review and human–agent responsibilities

- **Contributors**: Minsun Kim, Jinwoo Jang, Hyun Park, Zahra
- **Record type**: Retrospective summary of development coordination in the supplied Kakao export; attendance and duration are not inferred.
- **Source**: CSV rows 1480–1513 (header is row 1), messages dated 2026-11-03; times retain the export's display. Personal conversation, credentials and private meeting links are excluded.
- **Related work**: [Daily log and schedule, #309](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/309)

### Agenda

- Review evaluator access, sample data and devices before the HE deadline.
- Respond to feedback on evaluation evidence and human responsibility.

### Discussion

- **Progress reported:** the team selected a 22:00 remote review and agreed to submit web evaluator links with prepared producer data; Hyun also shared an internal Android release. Hyun reported manually trying consumer/producer login, browsing, orders and chat, while noting remaining wording/state/keyboard problems. Jinwoo shared the HE package and deterministic draft-scoring method, including its semantic/fluency limitations. Minsun announced the revised HE package and intention to submit at 23:59:36; the CSV does not contain an independently verified eTL receipt.
- **Next:** repair the remaining reported issues, strengthen per-role evaluation plans, and make the human/agent split explicit in the repository and reports.
- **Blockers:** setup problems and some UI defects remained under repair. Positive walkthrough feedback is not a pass for every matrix case or live payment.

### Decisions

- Keep a human accountable for scope, design, understanding the diff, review and release decisions; agents may investigate, draft, implement and report tests.
- Apply stronger human review to high-risk data/authentication/migration/AI changes.
- Distinguish deterministic scoring, semantic review, actual provider calls and demonstrations when reporting AI quality.

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Publish the responsibility/risk-review policy | Zahra / team | Repository review-policy workstream |
| Reconcile per-role user-story evaluation plans | Minsun Kim / feature owners | I3 evaluation workstreams |
| Repair and verify remaining HE readiness issues | Feature owners | HE follow-up register |

