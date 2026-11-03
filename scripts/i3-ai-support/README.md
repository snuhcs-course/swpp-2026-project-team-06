# I3 AI customer-support evaluation harness (DEV-169)

Runs the frozen DEV-154 corpus (`docs/evaluation/i3-ai-support/`) and the I3-AIGUARD rows of the DEV-152
journey matrix through the **real consumer chat path** on the isolated local stack from DEV-165
(`docs/evaluation/i3-env/README.md`). No product code is changed: provider faults are injected by a
local proxy that the Anthropic SDK reaches through `ANTHROPIC_BASE_URL`.

| File | Role |
| --- | --- |
| `fixtures.py` | Per-trial reset of the synthetic farm `f-eval`, products `p-eval-*`, paid orders `o-eval-*`, farm AI settings and a fresh consumer + thread, from each row's `evidence`/`runtime`. Fidelity check: `build_evidence` must reproduce the row's evidence (60/60), otherwise the trial is BLOCKED. |
| `fault_proxy.py` | `127.0.0.1:8787`: `passthrough` (real API), `hang` (12 s > 8 s timeout), `malformed` (non-JSON text), `drop` (connection closed), `pause`/`release` (change during generation). |
| `run.py` | 60 × 3 trials, order shuffled with seed 1542026, auto-scored on the protocol dimensions, raw traces in `.artifacts/i3-ai-support/<baseline>/`, verdicts and references in `run-log.csv`. |
| `guards.py` | I3-AIGUARD-01..05, one planned execution each. |

```bash
make db && make dev-api   # once, or as below with the proxy
python3 scripts/i3-ai-support/fault_proxy.py &
cd server && ANTHROPIC_BASE_URL=http://127.0.0.1:8787 APP_ENV=local MOCK_LOGIN_ENABLED=true uv run uvicorn app.main:app --port 8000 &
uv run python ../scripts/i3-ai-support/fixtures.py   # fidelity check, no model calls
uv run python ../scripts/i3-ai-support/run.py        # all 180 trials (about $0.20 of Haiku)
uv run python ../scripts/i3-ai-support/guards.py     # after run.py, never at the same time
```

Local only: every script refuses a non-local `DATABASE_URL`. Scores are automatic and marked
"human review pending"; a FAIL or BLOCKED is never upgraded by the script.
