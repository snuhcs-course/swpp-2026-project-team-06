# Baseline i3-main-57d4843 — regression re-run (DEV-177)

Re-run of the two I3 rows that failed on `i3-b2-87792b7` and were fixed in merged PRs, on merged `main` `57d4843` (2026-11-06 KST). The original results stay as they are (protocol: rerun on a new build without overwriting).

`matrix.csv` is frozen by the `manifest.json` digest, so its `execution_status` column is not edited. Row status for this baseline is recorded here.

| Case | Fix | Original (`i3-b2-87792b7`) | This run | Executor verdict | Reviewer decision / date |
| --- | --- | --- | --- | --- | --- |
| I3-DISC-03 | DEV-214 (#411) | FAIL 1/3 | [I3-DISC-03.md](I3-DISC-03.md) | PASS 3/3 | |
| I3-PRE-05 | DEV-216 (#412) | FAIL 3/4 | [I3-PRE-05.md](I3-PRE-05.md) | PASS 4/4 | |

Reviewer columns are left blank for the matrix reviewers (DISC: Minsun Kim, PRE: Zahra Gholami).
