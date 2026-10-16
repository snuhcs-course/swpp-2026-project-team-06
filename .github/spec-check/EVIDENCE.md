# DEV-40 evidence

## Current result

Implementation is in draft PR [#107](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/107).
The checker contract can be verified without API access. Genuine model evidence and human review remain pending.
No human approval, model availability, billing ownership or completed live run is claimed.

User decision (2026-10-16): **Keep live runs pending for now.** Live jobs now require repository variable `SPEC_CHECK_ENABLED=true`; it has not been enabled. Skipped model jobs are not a model PASS.

## Verified execution evidence

- Local: 26 contract tests passed. actionlint v1.7.12 workflow syntax validation passed with external shellcheck disabled/unavailable.
- GitHub contract tests passed at commit `ae88c9e220f2b9f01305a8a03392c0c571215c8e`: [run 38878210961](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878210961).
- Existing server/apps/integration checks passed at that commit: [run 38878211077](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878211077). Their existing path filters can skip work on unrelated paths; this is not a claim of rerunning all application tests.
- Negative-path CI evidence: live jobs reported INCOMPLETE because SPEC_CHECK_API_KEY/SPEC_CHECK_MODEL were absent. [Run 38878110841](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/38878110841) retained all three JSON/Markdown report artifacts; inspected reports identify the missing configuration. These are **not** the required genuine mismatch/PASS examples.
- The complete implementation PR's declared mapping covers all 14 changed files. Its complete context exceeds 60 KiB and correctly requests a smaller PR/manual review instead of silently truncating. The fixture demo is explicitly a separate review scope.
- The subsequent enable-control change is verified in the final PR Checks. Historical run links above refer to their exact captured revisions.

| Required deliverable | Evidence | State |
| --- | --- | --- |
| Workflow PR | #107, `.github/workflows/spec-check.yml` | Draft implementation |
| Mismatch reported on a PR | Live model demo mismatch report/run URL | Pending model access |
| Matched sample passes | Live model demo matched report/run URL | Pending model access |
| Reviewer resolution documented | Named human disposition with requirement/code evidence | Pending actual review |
| Error handling | `test_check.py`: 26 local contract tests passed; actionlint v1.7.12 syntax validation passed (external shellcheck unavailable) | Local passed; CI run pending |
| Human approval/merge | Actual reviewer approval and merge commit | Pending |

## Genuine run record

Populate only after inspecting actual reports. Keep both reports before artifact expiry.

- Repository/PR: snuhcs-course/swpp-2026-project-team-06#107
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
