# Assigned work review — 17 November 2026

The complete Linear query for assignee “me” returned 60 issues with no next page. Twenty remain in an open status. Closed, completed and duplicate issues were reviewed as history, not reopened. This record distinguishes code delivery from external acceptance. Figma work was initially held at the user's request and resumed after the user confirmed access on 17 November; current design evidence is recorded per issue below.

| Assigned open issues | Verified disposition / next action |
| --- | --- |
| DEV-336 | Stage identity, reservation counts, order locks, invalid IDs and sequential labels implemented and locally tested. Production p-uat-1a reset is a human-operated November 18 setup step. |
| DEV-337 | Home/product focus refresh and availability guard implemented; initial checkout price mismatch notice added; existing explicit server conflict reconfirmation verified. Figma synchronization is on hold. |
| DEV-340 | Chat header consumes back history; direct URLs replace the source fallback. Repeated home/product/chat/back/back and direct-entry cases pass. |
| DEV-244 | Existing sequence behavior documented; prospective v1.1 matrix and digests prepared. Original v1.0 files/results unchanged. PM adoption for UAT remains required. |
| DEV-277 | Actual contribution draft is i4-minsun-ai-contribution.md. Link to DEV-271 and author final confirmation remain separate from writing the draft. |
| DEV-319 | Four editable inquiry/order refresh states are [ready for review in Figma](https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=708-3656). Source, screenshot and metadata checks are recorded in [the design evidence](figma-recovery-2026-11-17.md); human review and documentation merge remain pending. |
| DEV-321 | Checkout reservation-recovery Figma states are currently being verified after access was restored. |
| DEV-262 | Existing neutral task/session template retained. Participant recruitment/consent/device/timing data and complete human UAT results are not supplied; DEV-260 and the ordering decision remain prerequisites. The walkthrough supplies useful issue observations, not a complete participant-session record. |
| DEV-160 | Merged documentation retains 13 dated daily records and the historical schedule reconciliation. Existing native readback records 383 issues and zero reconciliation errors; the final six-file artifact hash is preserved. No historical actual effort or meeting is invented. |
| DEV-163 | Preserved November 6 reports/workbooks match all six original manifest hashes; exact-name ZIP rebuilt and read back locally. See audit below. |
| DEV-164 | Requires a teammate's independent review and a real eTL receipt. Neither is inferred from the package or an announced submission. The November 6 deadline and preserved snapshot remain historical facts. |
| DEV-242, DEV-243, DEV-246, DEV-247, DEV-248, DEV-249, DEV-250, DEV-251, DEV-252 | Implementations already merged in PR #482 at 86e541097314a78ffd636cbbb4500abfcaeef41a (6 November 2026 13:25:17 UTC). No duplicate implementation added. Existing issue descriptions still await review/deployment closure evidence; merge alone does not establish native or authenticated production acceptance. |

## Current implementation checks

- Isolated PostgreSQL on loopback port 5446; branch-specific database farmclub_dev336, with a separate test database. No production data mutation.
- Full server: PGTZ=UTC DATABASE_URL=<isolated-local-db> .venv/bin/python -m pytest -q — **1,835 passed, 1 skipped**. Initial host-timezone formatting failures disappear with CI's UTC database setting; no account code/test assertion changed.
- Mock: npm run test:mock — **339 passed, 1 skipped**.
- Workspace types: npm run typecheck — all five workspaces passed after installing the locked dependencies and regenerating route types through normal app startup.
- Real API integration: **7/7 scenarios passed**.
- Browser: back-rules.spec.ts and checkout-stage-changed.spec.ts — **13/13 passed**, no retries. Failed earlier runs are not counted as passing.
- Both oracle revisions validate **44 cases**, retaining the original v1.0 digests and failure. A candidate oracle is not a new product-test result.
- Changed server files pass ruff; diff whitespace check passes.

## Historical package audit (DEV-163)

Re-audited against the preserved submission-manifest.json created 6 November 2026 at 14:58:34 UTC. All six file hashes match it exactly. PDFs retain valid PDF signatures; XLSX containers retain workbook.xml and pass ZIP integrity. The re-created archive contains only:

1. team06-iter3-reqspec.pdf
2. team06-iter3-design.pdf
3. team06-iter3-testing.pdf
4. team06-iter3-AI-collaboration-report.pdf
5. team06-iter3-he.xlsx
6. team06-iter3-schedule.xlsx

New local ZIP: outputs/assigned-issues-2026-11-17/team06-iter3.zip in the ChatGPT project workspace (outside this repository checkout), 8,391,769 bytes; SHA-256 80a95ed78577749f30c7376b20b1f138a32badd734a0b959815d0354b8b47ad6. Repacking changes ZIP metadata/checksum; file contents remain the historical snapshot. The original documented schedule limitations remain preserved. No new eTL upload, teammate sign-off or receipt is claimed.
