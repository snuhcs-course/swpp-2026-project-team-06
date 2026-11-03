# I3 test environment — baseline `i3-b1-eb727b6`

Execution issue: [DEV-165](https://linear.app/sswp6/issue/DEV-165) (I3-T03). Follows `../i3-journeys/protocol.md` (environment section) and `../i3-ai-support/protocol.md`. Use this baseline ID in place of `<baseline>` in `../i3-journeys/matrix.csv` evidence paths. Machine-readable copy: `manifest.json`.

**Status: READY with listed gaps.** Core accounts, role separation, order consistency, operator API and one live AI answer pass the smoke check twice from a fresh reset. AI fault/transition hooks and the DEV-154 `eval-` fixtures are not available yet (see Blockers); the affected rows stay `BLOCKED`/`NOT_READY` and never count as passes.

## Build

| Field | Value |
| --- | --- |
| Product code | `main` @ `eb727b6d5808c1a3b209f851db4d5f8e18f0b0f2` ([DEV-33] EAS native builds, #270). API, consumer and producer run from this one checkout; no per-service deploy hashes. |
| Environment branch | `zahra/dev-165-i3-test-environment` (adds only `docs/evaluation/i3-env/**`, `scripts/i3-env-smoke.mjs`, one Makefile target) |
| Database | Local PostgreSQL 16.15 (Docker, `server/docker-compose.yml`), database **`farmclub_i3`** (pytest uses `farmclub_i3_test`). Alembic head **`0024`**. |
| Clock | `FIXED_NOW=2026-10-07T10:00:00+09:00` (seed demo date; same as DEV-171). Smoke timestamps below are real UTC wall time. |
| Login | `APP_ENV=local`, `MOCK_LOGIN_ENABLED=true` (seeded test accounts; Kakao off locally) |
| Tooling | Node v26.0.0, uv 0.10.12, Python 3.12.13, Expo CLI 57.0.28, Playwright 1.64.0 (Chromium build 1248, desktop headless) |

## URLs

| Role | Isolated (use for all I3 runs) | Production (read-only; never mutate) |
| --- | --- | --- |
| API | http://localhost:8000 (`/docs` Swagger) | https://api.farmclub.kr |
| Consumer web | http://localhost:8081 | https://farmclub.kr (`/login?evaluator=1` shows test accounts, DEV-198) |
| Producer web | http://localhost:8082 | https://farm.farmclub.kr |
| Operator | API with local operator token (below); admin web via `scripts/admin-web/server.mjs` with **`FARMCLUB_API_URL=http://localhost:8000`** — its default is production | https://admin.farmclub.kr |

## AI and source-analysis versions

| Field | Value |
| --- | --- |
| AI customer support | Anthropic, `AI_MODEL=claude-haiku-4-5` (default), answer timeout 8 s, `max_tokens` 512; prompt `_ANSWER_SYSTEM` in `server/app/ai/service.py` (last changed `0e852fc`, 2026-10-24). Farm `f-kang` AI settings `enabled=true`, version 1. Rule-matched questions (shipping, delivery, Brix, FAQ) are answered without a model call; all others go to the model; model errors become a handoff. |
| Key | Live key present in local `server/.env` (copied from Railway; production account — usage is billed there). Never committed. |
| Source analysis | Off by default locally (`SOURCE_ANALYSIS_ENABLED=false`, provider `mock`). Versions: preprocess `source-parser-v4`, stage 1 `source-v8-exact-numbers`, stage 2 `source-refine-v7-farm-common`, scorer `dev193-number-evidence-v1`, holdout `v2`, OCR RapidOCR models `v3.10.0` (tag `ocr-models-v3.10.0`). |

## Accounts and fixtures (all synthetic, from `server/app/core/seed.py`)

| Need (protocol) | Fixture | How to sign in |
| --- | --- | --- |
| Consumer A / B | `u-minji` / `u-seojun` | Mock login, consumer app |
| Producer A (approved farm) | `u-kang` → farm `f-kang` (6 products incl. `p-house`) | Mock login, producer app |
| Producer B | `u-misook` → farm `f-wimi` (PENDING) | Mock login, producer app |
| Second approved farm | `f-halla` (`p-noji`), also `f-hyodon`, `f-namwon` | Consumer-side only — owner `u-halla` has **no** test login (see gap G-4) |
| Onboarding / rejected / suspended producers | `u-new` / `u-soonja` (`f-reject`) / `u-taeho` (`f-stop`) | Mock login, producer app |
| Operator | `u-admin` | `cd server && uv run python -m app.accounts.admin_token` (local JWT secret; local only). No test login, by design (ADR 0009). |
| Orders | 14 seeded; e.g. `o-42` (`u-minji`, `f-kang`, RESERVED), `o-07` DELIVERED, `o-03` REFUNDED, `o-11` (`f-halla`, RESERVED) | — |
| Bank-transfer data | Synthetic farm account numbers in the seed; deposit confirmation is a simulated state action (`/api/orders/{id}/confirm-deposit`) — no money moves | — |
| Manager exceptions | None seeded; created during runs (e.g. refund request in chat) | — |

## Reset, run, clean up

```bash
# once
open -a Docker && make db
docker compose -f server/docker-compose.yml exec -T db createdb -U farmclub farmclub_i3
docker compose -f server/docker-compose.yml exec -T db createdb -U farmclub farmclub_i3_test
# server/.env: APP_ENV=local, DATABASE_URL=postgresql+psycopg://farmclub:farmclub@localhost:5432/farmclub_i3,
#              MOCK_LOGIN_ENABLED=true, FIXED_NOW=2026-10-07T10:00:00+09:00, ANTHROPIC_API_KEY=<from Railway, never commit>
make migrate
# before every run (reset)
make dev-api            # terminal 1
make i3-smoke           # reseeds farmclub_i3, then runs scripts/i3-env-smoke.mjs
make dev                # apps, if the run needs the web UI (real-stack runs: node scripts/run-integration.mjs <spec>)
# clean up
docker compose -f server/docker-compose.yml exec -T db dropdb -U farmclub farmclub_i3
```

`make` needs the Xcode license accepted on macOS (`sudo xcodebuild -license`). `I3_SMOKE_SKIP_AI=1` skips the live model call. Running pytest with a live key in `.env` sends the AI-draft tests down the live path (3 tests then fail by design, as CI has no key). For a CI-equivalent run, move `server/.env` aside, export `APP_ENV=local MOCK_LOGIN_ENABLED=true DATABASE_URL=…/farmclub_i3`, and run `uv run pytest` **from `server/`** (from the repo root, 31 source tests fail on relative paths).

## Smoke evidence

Run `.artifacts/i3-env/smoke-i3-b1-eb727b6-20261103T114000308Z.json` (local, not committed), UTC 2026-11-03T11:39:58.623Z – 11:40:02.785Z, executor Zahra Gholami with Claude Code (agent). Reset → smoke was repeated three times on 11/03 with identical non-AI observations, and `make i3-smoke` passed 12/12 afterwards.

| ID | Check | Verdict | Observed |
| --- | --- | --- | --- |
| ENV-01 | API health | PASS | 200 |
| ENV-02 | Test accounts listed per app | PASS | consumers `u-minji`, `u-seojun`; producers incl. `u-kang` APPROVED, `u-misook` PENDING |
| ENV-03 | Mock login for 2 consumers + 2 producers; operator has no test login | PASS | 4/4 tokens; `u-admin` test login 404; local operator token issued |
| ENV-04 | Public farms are approved only | PASS | `f-halla`, `f-hyodon`, `f-kang`, `f-namwon`; no pending/rejected/suspended |
| ENV-05 | Consumer → operator API | PASS | 403 |
| ENV-06 | Producer B reads / edits producer A's product | PASS | 403 / 403 |
| ENV-07 | Consumer B opens consumer A's order | PASS | 404 |
| ENV-08 | `o-42` status same for consumer and producer A; hidden from producer B | PASS | RESERVED = RESERVED; producer B 403 (farm pending) |
| ENV-09 | Operator sees pending application and exception list | PASS | `f-wimi` PENDING; exceptions 200 |
| ENV-10 | Farm A AI support on and versioned | PASS | enabled, version 1 |
| ENV-11 | Rule question answered without a model call | PASS | AI answer, 0 model calls |
| ENV-12 | One live model call through consumer chat | PASS | AI reply, handoff `FORWARDED` (no storage evidence → correct), settings v1, 2362 ms, 465 in / 68 out tokens, $0.000805 |

## Existing suites on this baseline (11/03)

| Command | Result |
| --- | --- |
| `uv run ruff check .` | All checks passed |
| pytest, live key present | 1449 passed, 3 failed, 1 skipped — the 3 AI-draft tests expect the no-key mock path |
| pytest from `server/`, no key (CI condition) | 1452 passed, 0 failed, 1 skipped |
| `alembic upgrade head && alembic check` | No new upgrade operations |
| `npm run test:mock` | 62 passed, 0 failed |
| Typecheck `packages/api`, `packages/ui`, `apps/consumer`, `apps/producer` (`tsc --noEmit`, as CI) | All exit 0 (after removing a stale local `apps/consumer/.expo/types` from 10/20) |
| `node --test scripts/admin-web/admin.test.mjs` | 21 passed, 0 failed |
| `node scripts/run-integration.mjs scripts/e2e/mock-login.spec.ts scripts/e2e/evaluator-login.spec.ts` on `farmclub_i3` | 7 real-server scenarios passed; Playwright 4 passed, 2 skipped (`mock-login` needs the shared Mock server, not the real stack) |

## Coverage of the journey matrix environments

| Matrix `environment` | Rows | Status |
| --- | --- | --- |
| consumer web + isolated API, two approved farms/products, test consumer | 5 | READY |
| consumer web + isolated API, approved product with bank-account fixture, no real transfer | 5 | READY |
| consumer and producer web + isolated API, two consumers and two farms | 5 | READY (producer B is `u-misook`, pending farm — see G-4) |
| producer and consumer web + isolated test orders; transfer confirmation simulated | 5 | READY |
| admin UI/API + isolated admin/producer/consumer accounts, approval/refund fixtures | 5 | READY via API; admin web needs `FARMCLUB_API_URL=http://localhost:8000` (not smoke-tested) |
| producer and consumer web + isolated source worker, text/image/long-image/PDF fixtures | 8 | READY with mock provider (`SOURCE_ANALYSIS_ENABLED=true`); live source model NOT READY (G-3) |
| isolated consumer/producer chat + DEV-154 corpus; pinned model/prompt; fault hook | 6 | PARTIAL — live model READY; `eval-` fixtures NOT READY (G-2); fault hooks BLOCKED (G-1) |
| isolated web + API, two consumers, two farms, pinned AI cohort, fault/transition hooks | 5 | PARTIAL — same as above |

## Blockers and gaps

| ID | Gap | Affects | Status | Owner | Next action |
| --- | --- | --- | --- | --- | --- |
| G-1 | No runtime hook to inject AI provider `timeout` / `malformed_json` / `network_error` or to pause for `change_during_generation`; model errors are caught and turned into a handoff | DEV-154 cases with those runtimes (6 cases = 18 of 180 trials) | BLOCKED | Zahra (DEV-169) | Add a local-only fault/transition hook in `server/app/ai`, or run those cases at the pytest level and disclose the method; until then record BLOCKED |
| G-2 | DEV-154 `eval-` fixtures (`p-eval-citrus`, `P1/P2/P3/FARM_ONLY/MULTI_NO_CONTEXT/ORDER`) do not exist in any database | All 60 AI-support cases | NOT READY | Zahra (DEV-169) | Local fixture loader that creates the `eval-` farm, products and order from `questions.jsonl` evidence |
| G-3 | No OpenRouter/OpenAI key locally for live source analysis | Live source-format runs | NOT READY | Jinwoo (DEV-170 owner) | Reuse Jinwoo's live evaluation setup; mock runs are unaffected |
| G-4 | The owners of approved farms other than `f-kang` have no test login | UI runs needing two approved producers | Gap | Zahra | Use `u-misook` (pending farm) as producer B, or a local-only token for `u-halla` in API checks; a seed change is out of T03 scope |
| G-5 | Android / native device builds | Device-specific checks | NOT READY | Minsun / Hyun | Native builds just landed (DEV-33); I3 runs use desktop Chromium unless a device row is added |
| — | Real payment, real transfer, production writes | — | Out of scope | — | Protocols forbid them |
