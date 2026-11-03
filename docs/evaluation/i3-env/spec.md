# I3 test environment baseline

This folder records the reproducible environment for DEV-165 (I3-T03). The I3 evaluation issues (DEV-152 journey matrix, DEV-154 AI support corpus, and their execution issues) cite a baseline ID from here in place of `<baseline>` in `docs/evaluation/i3-journeys/matrix.csv` evidence paths.

| Decision | Reason |
| --- | --- |
| Run evaluations on an isolated local stack with its own database (`farmclub_i3`) | No staging environment exists (README: `dev`/`staging` reserved); the protocols forbid shared production mutations. |
| Use the repository seed (`server/app/core/seed.py`) as the fixture source | Synthetic accounts, farms, products and orders already exist and reset with one command. |
| Pin the clock with `FIXED_NOW` | Order deadlines and AI-support delivery dates depend on "now"; a fixed clock makes reruns comparable. |
| Production URLs are listed read-only | Evaluators may observe production, but nothing in I3 writes to it. |
| Unavailable prerequisites are listed as BLOCKED with owner and next action | Protocol rule: a blocked dependency is never a pass. |

`README.md` is the human-readable environment record; `manifest.json` is the machine-readable copy. `scripts/i3-env-smoke.mjs` (`make i3-smoke`) is the reproducible smoke check. Secrets are never recorded here.
