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

## Live setup (DEV-55, 2026-10-18)

Redacted configuration; key values are never recorded here.

- Provider/model: Claude Messages API, `SPEC_CHECK_MODEL=claude-sonnet-5-5` (environment variable on `spec-check`). Model choice was posted to DEV-55 for Minsun Kim to confirm against `claude-haiku-4-5`.
- Credential owner: Hyun Park (nemodleo). Secret `SPEC_CHECK_API_KEY` exists only on the `spec-check` environment and is separate from the product key.
- Repository administrator who configured it: nemodleo.
- Protection: Required reviewers = nemodleo, jangjinuite, xozier, llovablanche. Prevent self-review is off by team decision (PR #147). Administrator bypass is off.
- Enable switch: repository variable `SPEC_CHECK_ENABLED=true` since 2026-10-18 11:50 UTC.

## Genuine run record

Owned by DEV-55. Populate only after inspecting actual reports. Keep both reports before artifact expiry.

- Core implementation PR: snuhcs-course/swpp-2026-project-team-06#107
- Follow-up live-evidence PR (record actual PR): snuhcs-course/swpp-2026-project-team-06#150
- Reviewed commit: aee76a0 (head of #150 at the run)
- API key/billing owner (name only): Hyun Park (nemodleo)
- Approved model ID: claude-sonnet-5-5 (confirmation requested from Minsun Kim on DEV-55)
- Mismatch run URL / artifact / finding: https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39124913548, job "Live model demo (mismatch)", artifact `spec-code-demo-mismatch-39124913548-1`. Status MISMATCH (red job). Finding SC-001 cites `.github/spec-check/fixtures/quantity/spec.md` line 3 "quantity 0 must be rejected" and `.github/spec-check/fixtures/quantity/mismatch.py` line 2 "return quantity >= 0".
- Matched run URL / artifact: https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39124913548, job "Live model demo (matched)", artifact `spec-code-demo-matched-39124913548-1`. Status PASS (green job) for `return quantity > 0`.
- Model/prompt version and usage: claude-sonnet-5-5, prompt `dev40-v1`. Mismatch 1,400 input / 469 output tokens; matched 1,389 input / 202 output tokens.
- Did the normal whole-PR check complete? No. Same run, job "spec-code-review", artifact `spec-code-review-39124913548-1`: INCOMPLETE "Prompt plus complete context exceeds 60 KiB; split the PR." No model call was made. The PR changes only two files, but the checker sends the complete referenced files (`tasks.md`, `README.md`, `EVIDENCE.md`), which exceed the budget.
- Limitations or false findings: no false finding in the two demo runs. The 60 KiB budget makes whole-PR review INCOMPLETE even for small PRs that touch long tasks/README files; this needs a team decision (larger budget or excerpted context) and is tracked on DEV-55.

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
