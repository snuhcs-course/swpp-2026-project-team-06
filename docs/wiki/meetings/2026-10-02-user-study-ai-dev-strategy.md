## 2026-10-02 — User study check-in & AI development strategy

- **Attendees**: Hyun Park, Minsun Kim, Jinwoo Jang, Zahra
- **Linear**: SWPP-71

### Agenda

- User study: progress, direction, schedule, and blockers
- AI development strategy (I1-P4)
- Linear ↔ GitHub integration issue
- Business model candidates
- PM reminder routine

### Discussion

**User study progress**

- Producers (Jinwoo Jang): contacted 14; 4 joined the beta, 2 said they would try after reviewing
- Consumers (Minsun Kim): distributed to acquaintances from 10/01, target 50 responses; the number looks achievable
- Pretotype (Zahra): not recorded

**How each member currently develops with AI**

| Member | Tools | Workflow | Pain points |
| -- | -- | -- | -- |
| Zahra | Claude Code, Codex (when tokens run out) | Plan mode back-and-forth → spec file kept updated by the agent, `handoff.md`, a tree of markdown docs handled by a separate agent | Agent changes parts it should not touch |
| Jinwoo Jang | Codex | Writes as many READMEs as possible, placed in the target directories; plan mode; image generation AI and component-level work for frontend | Sometimes skips planning and vibe-codes directly |
| Minsun Kim | Codex (school account for coursework, personal account for parallel tasks) | Simple specs | None reported |
| Hyun Park | Claude Code | Plan/act in Claude Code, cross-checked by a separate GPT agent that reviews and suggests; reviews via `git diff`; follows an in-tool flow | Agent loses context; long dead ends → solved by proposing the direction directly |

**Open questions on AI development**

- Context markdown: each member controls their own, or one shared file?
- How much freedom each member has in development
- Review process
- Flow for resolving problems

**Proposed workflow (Spec-Anchored)**

1. Create a Linear issue (used as the work order) → notify related members
2. Create a branch
3. Generate an AI `tasks.md` (spec file) and push it; the spec lives in the folder being worked on, and diffs are fed back to the AI
4. Open a draft PR from branch to `main` → notify related members
5. CI runs (GitHub Actions)
6. Draft PR → ready for review, request reviewers
7. Address review comments
8. Merge (`main` → branch, then branch → `main`) → GitHub Actions deploy (CI/CD)

- Shared rules as files in the repo (PR context, review, file structure) under `.agents/skill`
- Branch strategy still open: `main` + feature branches only, or add a `dev` branch with a dev server (branch → `dev` → test on dev server → `main` → retest)

### Decisions

- Every member writes up their AI development approach
- Linear ↔ GitHub integration still unresolved (resolved on 10/06)
- Each member adds business model candidates to the shared list
- PM reminder routine: remind the day before and 5 minutes before each meeting; morning daily status briefing (today's tasks and deadlines). The PM is building an AI service to automate the briefing

### Action Items

| Item | Owner | Issue |
| -- | -- | -- |
| Write up each member's AI development approach | All | SWPP-54 |
| Decide open questions on AI development | All | SWPP-55 |
| Finalize the task workflow | Hyun Park | SWPP-56 |
| Write shared AI rule files | Hyun Park | #11 |
| Decide branch strategy | Hyun Park | SWPP-58 |
| Set up CI/CD pipeline | Hyun Park | #10 |
| Collect business model candidates | All | SWPP-60 |
| Run PM reminder routine | Hyun Park | SWPP-61 |
| Build daily briefing AI | Hyun Park | SWPP-62 |
| Continue user studies | Jinwoo Jang, Minsun Kim | SWPP-12, SWPP-13 |
