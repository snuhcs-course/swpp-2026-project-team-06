## 2026-10-18 — Deployment alignment and producer-confirmed bank transfers

- **Contributors**: Hyun Park, Minsun Kim, Zahra, Jinwoo Jang
- **Related work**: [#131](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/131), [#141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141), DEV-67, DEV-70, DEV-71

### Agenda

- Connect deployment to verified main-branch changes.
- Resolve deposit-confirmation ownership.
- Align test URLs, result reporting, and observation tools.

### Discussion

- GitHub Actions was selected for Railway deployment because direct organization integration was unavailable. Zahra identified two necessary protections: deploy only after successful CI and restrict deployment to main. Hyun subsequently reported the deployment controls and Vercel automation completed.
- Zahra clarified whether the platform or producer confirms deposits. Hyun confirmed that the buyer transfers to the farm, and the producer checks the bank record and confirms the matching order in the app. Hyun continued implementation; Zahra offered review support.
- Manager/AI checks were reported passing in their stated environments. Mutating checks were local to protect shared seeds; deployed records were still empty while the frontend used Mock storage. These observations did not establish full deployed E2E readiness.
- Minsun requested continuous test-sheet updates and confirmed the new consumer/producer domains for participant instructions.
- Session replay was accepted for usability observation. The team also identified in-app policy notices as required implementation work.
- Owners were reminded to enter actual effort; newly added work was distinguished from the initial plan. Approval-gated AI spec/code review was introduced as an additional check, not a mandatory merge gate.

### Decisions

- Confirm deposits in the producer app; platform support APIs remain a separate operational path.
- Use farmclub.kr and farm.farmclub.kr in external-test instructions.
- Keep local, deployed, and Mock results distinct.
- Continue integrating before presenting the full journey as ready.

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Complete bank-transfer implementation and coordinate review | Hyun Park, Zahra | [#141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141) |
| Maintain main-only, CI-success deployment controls | Hyun Park | DEV-67 / DEV-70 |
| Update results, participant guidance, and actual effort records | Minsun Kim, all owners | Iteration 2 schedule / internal tracker |
| Complete the agreed analytics/privacy behavior and in-app notices | Hyun Park | DEV-71 and policy implementation |
