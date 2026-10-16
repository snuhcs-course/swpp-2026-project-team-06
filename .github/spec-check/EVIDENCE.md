# DEV-40 evidence

## Current result

Implementation is in draft PR [#107](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/107).
The checker contract can be verified without API access. Genuine model evidence and human review remain pending.
No human approval, model availability, billing ownership or completed live run is claimed.

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
