# DEV-40 evidence

## Current result

Core implementation is delivered in PR [#107](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/107).
On 2026-10-16 the user approved splitting API access and genuine model acceptance into [DEV-55](https://linear.app/sswp6/issue/DEV-55). DEV-40 can merge as disabled-by-default infrastructure after human approval; it does not require live model evidence. DEV-55 retains all original live acceptance requirements.
No human approval, model availability, billing ownership or completed live run is claimed.

User decision (2026-10-16): **Keep live runs pending for now.** Live jobs now require repository variable `SPEC_CHECK_ENABLED=true`; it has not been enabled. Skipped model jobs are not a model PASS.

## Verified execution evidence

- Local: 26 contract tests passed. actionlint v1.7.12 workflow syntax validation passed with external shellcheck disabled/unavailable.
- GitHub contract tests passed at commit `ae88c9e220f2b9f01305a8a03392c0c571215c8e`: [run 38878210961](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878210961).
- Existing server/apps/integration checks passed at that commit: [run 38878211077](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878211077). Their existing path filters can skip work on unrelated paths; this is not a claim of rerunning all application tests.
- Negative-path CI evidence: live jobs reported INCOMPLETE because SPEC_CHECK_API_KEY/SPEC_CHECK_MODEL were absent. [Run 38878110841](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878110841) retained all three JSON/Markdown report artifacts; inspected reports identify the missing configuration. These are **not** the required genuine mismatch/PASS examples.
- The complete implementation PR's declared mapping covers all 14 changed files. Its complete context exceeds 60 KiB and correctly requests a smaller PR/manual review instead of silently truncating. The fixture demo is explicitly a separate review scope.
- The enable-control commit `32da7953ae4d0dd52923159cfe8f95fddf86df77` passed [checker workflow 38878477164](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878477164) and [existing CI 38878421426](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878421426). Live jobs were explicitly SKIPPED. Historical links refer to exact captured revisions; later scope/documentation changes use the current PR Checks.

| Required deliverable | Evidence | State |
| --- | --- | --- |
| DEV-40 core workflow PR | #107, `.github/workflows/spec-check.yml` | Implementation delivered; merge pending human approval |
| DEV-40 disabled default | No SPEC_CHECK_ENABLED=true configured; live jobs skipped in run 38878477164 | Verified; no model PASS claimed |
| DEV-40 error handling | 26 local/GitHub contract tests; actionlint syntax validation (external shellcheck unavailable) | Passed |
| DEV-40 human approval/merge | Actual core review and merge commit | Pending |
| DEV-55 mismatch reported on a PR | Genuine live-model mismatch report/run URL | Deferred to follow-up; not a core merge prerequisite |
| DEV-55 matched sample passes | Genuine live-model matched report/run URL | Deferred to follow-up |
| DEV-55 finding resolution | Named human disposition with requirement/code evidence | Deferred to follow-up |

## Genuine run record

Owned by DEV-55. Populate only after inspecting actual reports. Keep both reports before artifact expiry.

- Core implementation PR: snuhcs-course/swpp-2026-project-team-06#107
- Follow-up live-evidence PR (record actual PR):
- Reviewed commit:
- API key/billing owner (name only):
- Approved model ID:
- Mismatch run URL / artifact / finding:
- Matched run URL / artifact:
- Model/prompt version and usage:
- Did the normal whole-PR check complete? Record separately:
- Limitations or false findings:

## Reviewer resolution

- Finding ID and original run:
- Reviewed commit:
- Human reviewer:
- Outcome:
- Requirement/code/test evidence:
- Correction or explanation:
- Follow-up run:
- Remaining limitations:

The demo's corrected implementation is `fixtures/quantity/matched.py`.
Its existence is not a human reviewer decision and does not prove a live model pass.
