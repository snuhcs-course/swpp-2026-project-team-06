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


## DEV-238 local OpenRouter compatibility mode

The production adapter stays Anthropic. If direct Anthropic credentials are unavailable,
the isolated fault proxy may use `I3_AI_PROVIDER=openrouter` to forward the same Messages
request to OpenRouter's `/api/v1/messages` with the fixed model
`anthropic/claude-haiku-4.5`, fallback disabled and the existing 1/5 USD-per-million
price caps. This is a distinct evaluation cohort, never pooled with direct Anthropic.
`I3_PROXY_PORT` defaults to 8787. API `ANTHROPIC_BASE_URL` must point at that proxy.

`/_stats` exposes trial-scoped upstream status, response ID, actual model and usage;
`upstream_requests` is cumulative and each trace records its before/after delta. A mode
change resets trial metadata and advances an epoch. Late responses cannot overwrite
another trial's evidence. Provider failures are BLOCKED, not successful model answers.
A successful model-backed smoke with model/response ID/tokens/request delta is required
before a full quality run; use the DEV-241 v2 orchestrator for that gate.

The first DEV-238 direct-credential attempt returned 401. Its 141/180 automatic outcome
score is retained as a fallback/system regression cohort, **not live model quality**.
Private raw traces stay in `.artifacts` and no private holdout data belongs here.
