# Farmclub — Iteration 2 working demo

SNU SWPP 2026 · Team 6 · Implementation & Testing · Prepared 22 October 2026

Farmclub connects consumers with Jeju citrus farms through advance reservations, farm updates and private conversations. This branch contains both applications, the API, the source-analysis worker and operator tools. The product snapshot is [`691949e985080f372a45d54fa950191e88adb8ce`](https://github.com/snuhcs-course/swpp-2026-project-team-06/commit/691949e985080f372a45d54fa950191e88adb8ce); this README describes the I2 demo, rather than claiming to be the final 23 October deadline snapshot.

## 1. Watch the four demo videos

All four recordings are available without installing the project. They are silent walkthroughs with controlled demonstration data. The presentation's demo link resolves to [the demo viewer](https://demo.farmclub.kr/); direct MP4 links are provided as well. Durations below follow the viewer's labels. Video availability was checked on 22 October (HTTP 206, `video/mp4`).

| Recording | Watch | Approx. duration | What to observe |
| --- | --- | --- | --- |
| **Overall flow** | [Viewer](https://demo.farmclub.kr/) · [MP4](https://demo.farmclub.kr/videos/story.mp4) | 4:55 | Producer joins → operator approves → producer configures farm/product/supply → operator approves capacity → consumer discovers/reserves → farm confirms deposit → updates/private AI handoff and producer reply |
| **Consumer** | [Viewer](https://demo.farmclub.kr/consumer) · [MP4](https://demo.farmclub.kr/videos/consumer.mp4) | 1:53 | Kakao entry, discovery/following, product quality and price, checkout consents/address, deposit instructions, reserved order, news reaction and private question |
| **Producer** | [Viewer](https://demo.farmclub.kr/producer) · [MP4](https://demo.farmclub.kr/videos/producer.mp4) | 2:32 | Application/pending gate, profile/bank account/share, AI text draft and review, period pricing/supply request, deposit confirmation, news and handoff reply |
| **Operator** | [Viewer](https://demo.farmclub.kr/admin) · [MP4](https://demo.farmclub.kr/videos/admin.mp4) | 0:30 | Password-session entry, producer application decision and initial product capacity approval with confirmation |

### Suggested viewing sequence

1. **Overall:** follow the same transaction across all three roles. Approval and deposit confirmation are distinct decisions; a buyer declaring a transfer does not confirm it.
2. **Consumer:** inspect the information shown before reserving and the transition from awaiting deposit to reserved. The four consents, copied deposit account/order number and private conversation are key interactions.
3. **Producer:** inspect manual control over the generated draft, commercial terms and approval request. The farm—not Farmclub—checks its bank statement and confirms the deposit.
4. **Operator:** inspect both approval gates. The 30-second recording covers these gates; newer inbox/user/test-farm tools in the snapshot are additional implemented functionality, not footage shown in this clip.

The recordings demonstrate the workflow and do not establish that money moved. They omit shipment: the current producer UI has no `RESERVED` → `PREPARING` button. The retained harvest API and shipping of already preparing orders are documented separately. The recording's text-draft flow also does not demonstrate the newer full private document workspace.

## 2. What Iteration 2 implements

| Area | Major progress since I1 | Relevant features |
| --- | --- | --- |
| Consumer | Kakao onboarding/profile/consents/address book; conversation-based discovery, fixed product actions, bank-transfer instructions/reporting and status display | FEAT-01, 06–13, 15, 33 |
| Producer | Kakao application and account-state routing, bank account registration, direct deposit/refund confirmation, draft/error recovery, private source-assisted page editing and explicit apply, guided help and farmclub support | FEAT-01–05, 14, 17, 19, 32, 34; AC-SRC-1–11 |
| Operator | Session-protected browser tools for producer/capacity decisions, controlled test-farm hiding, privacy-limited user/order lookup and producer support inbox | Operator APIs and FEAT-34 |
| AI and media | Separately deployed source worker, evidence/candidate validation, private source storage, original-photo placement, public media and Open Graph previews; wrong-answer reports and producer takeover | Source integration; FEAT-03, 07, 13, 19 |
| Engineering | Schema migrations through 0019, CI-driven deployments, optional masked PostHog instrumentation, expanded unit/API/browser regressions | See [Testing Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation) |

Availability is distinct from acceptance. The final internal workbook records environment-specific failures/blockers; later local regression does not automatically clear them. Automated bank matching, integrated payment/escrow, courier integration, push notifications and scheduled completion/refund jobs remain outside this demo. Producers review missing or potentially misread source facts before publication.

## 3. Environment

| Item | Development / execution environment |
| --- | --- |
| Clients | Node **24** (`.nvmrc`), npm workspaces, Expo / React Native Web / TypeScript; consumer and producer run independently |
| Backend | Python **3.12**, uv, FastAPI / SQLAlchemy / Alembic; PostgreSQL **16** |
| Local validation host | macOS, Apple Silicon; Node 24.19.0, npm 11.19.0, Python 3.12.14, uv 0.13.5, PostgreSQL 16.15; Chromium 156.0.8078.4 via Playwright 1.64.0 |
| Hosted implementation | Vercel consumer/producer/operator, Railway API and source worker, PostgreSQL, Cloudflare R2; Kakao OAuth; optional server AI providers and client PostHog |
| Dependency reproducibility | Root `package-lock.json`, `server/uv.lock`; install with `npm ci` and `uv sync --frozen` |

The optional OCR worker uses RapidOCR 3.10.0 / ONNX Runtime 1.31.0 and provisioned model assets. These are not required for the shared Mock route below.

## 4. Run locally — shared Mock (quickest)

### Shared local entry point (`make`)


The root `Makefile` is the single entry point for local work. It only calls the npm
scripts, `scripts/*.mjs`, and `server/` commands described below, and its checks run
the same commands as CI. Run `make` to list every target.

```bash
make setup          # npm ci (only when package-lock.json changed) + cd server && uv sync --frozen
make db             # local PostgreSQL 16 (server/docker-compose.yml); make db-down stops it
make migrate seed   # alembic upgrade head + demo seed, local database only (RESET=1 to reseed)
make dev            # both apps + Mock API (npm run dev); make dev-api runs FastAPI
make check          # before a PR: lint (ruff check) + test
```

- `make test` runs `test-server` (pytest + alembic check), `test-apps` (`npm run test:mock`,
  `npm run typecheck`) and `test-admin` (`node --test`). Each also runs on its own.
  `test-integration` and `test-e2e` are heavy and stay out of `make test`.
- `make coverage-producer` prints producer logic coverage; `make coverage-producer-ui` runs the
  real-stack suite with `FARMCLUB_COVERAGE=1` and writes `.artifacts/coverage/producer-ui/index.html`
  (heavy, reseeds the local database; see Testing Documentation 3.7).
- The local PostgreSQL container is shared by every worktree, so the `alembic check` in
  `test-server` fails on a `farmclub` database that another branch migrated. Use a database
  per branch: `docker compose -f server/docker-compose.yml exec db createdb -U farmclub farmclub_dev12`,
  then `DATABASE_URL=postgresql+psycopg://farmclub:farmclub@localhost:5432/farmclub_dev12 make test`.
- **Adding tests:** when you create a new test suite, add one line to the matching `test-*`
  target. Each person adds the tests for their own area.
- `make clean-worktrees` lists `.claude/worktrees/*` whose PR is merged; `CONFIRM=1` removes
  them. Worktrees with uncommitted changes are skipped and listed.
- Keep one `Makefile` at the root. If it grows past ~150 lines, move groups of targets into
  `make/*.mk` and add `include make/*.mk` to it. Do not add Makefiles in subfolders.
- Production commands (Railway, production deploys or databases) are not make targets.

Prerequisite: Node 24 and npm. From this branch:

```sh
npm ci
npm run dev
```

The launcher prints the actual addresses, normally consumer **http://localhost:8081** and producer **http://localhost:8082**, with the shared Mock service on port 8083. Choose seeded accounts from each application's login screen. Open the two apps in separate tabs to inspect shared orders and messages.

`npm run dev` deliberately forces the shared Mock transport. It needs no PostgreSQL, OAuth or AI key; it does not exercise real bank/provider calls, and its generated examples are not model-quality evidence. Mock state is stored under ignored `.expo/shared-mock/`. Stop with Ctrl+C. Use the real-API route below for server authorization, persistence, transactions and operator calls.

## 5. Run locally — real API with seeded identities

### A. Database and API

Prerequisites: Node 24/npm, Python 3.12/uv, PostgreSQL 16. Docker Compose is one way to start PostgreSQL. The commands below use the repository's **disposable local** database, not a deployed database.

```sh
# At repository root
npm ci
cd server
docker compose up -d
uv sync --frozen

export APP_ENV=local
export DATABASE_URL='postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub'
export MOCK_LOGIN_ENABLED=true
export FIXED_NOW='2026-10-07T10:00:00+09:00'
export CONSUMER_APP_URL='http://localhost:8081'
export PRODUCER_APP_URL='http://localhost:8082'
export SOURCE_ANALYSIS_ENABLED=false
export SOURCE_ANALYSIS_PROVIDER=mock
export SOURCE_STORAGE=local
export ANTHROPIC_API_KEY=''
export OPENROUTER_API_KEY=''
export OPENAI_API_KEY=''

uv run alembic upgrade head
uv run python -m app.core.seed --reset
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`--reset` clears that local database; use it only for this disposable demo. With an existing PostgreSQL installation, create a separate database and substitute its local URL; Docker is then unnecessary. Keep the database session timezone at UTC for consistent serialized test timestamps. The fixed clock preserves the seed's reservation periods.

Confirm [API health](http://localhost:8000/health) and [OpenAPI](http://localhost:8000/docs). Test login is enabled only for this local exercise. Live Kakao sign-in requires registered return addresses and server credentials; it is not configured by these commands.

### B. Consumer and producer (two new terminals)

From `apps/consumer`:

```sh
EXPO_PUBLIC_API_MOCK=0 \
EXPO_PUBLIC_API_URL=http://localhost:8000 \
EXPO_PUBLIC_CONSUMER_URL=http://localhost:8081 \
EXPO_PUBLIC_PRODUCER_URL=http://localhost:8082 \
EXPO_PUBLIC_SHARED_MOCK_URL='' EXPO_PUBLIC_POSTHOG_KEY='' \
node ../../node_modules/expo/bin/cli start --web --host localhost --port 8081
```

From `apps/producer`:

```sh
EXPO_PUBLIC_API_MOCK=0 \
EXPO_PUBLIC_API_URL=http://localhost:8000 \
EXPO_PUBLIC_CONSUMER_URL=http://localhost:8081 \
EXPO_PUBLIC_PRODUCER_URL=http://localhost:8082 \
EXPO_PUBLIC_SHARED_MOCK_URL='' EXPO_PUBLIC_POSTHOG_KEY='' \
node ../../node_modules/expo/bin/cli start --web --host localhost --port 8082
```

Select a consumer account in the consumer app and an approved producer in the producer app. Additional seeded states let you inspect pending/rejected/suspended gates. A deposit report and producer confirmation record the workflow only; local commands never move funds. Without an Anthropic key, unsupported AI questions hand off and failed text generation remains manually editable.

### C. Local operator UI

In another terminal with the same database/environment as section A, run `uv run python -m app.accounts.admin_token` from `server/`. Keep its output locally as `ADMIN_TOKEN`. Choose your own `ADMIN_WEB_PASSWORD`, then start from the repository root:

```sh
FARMCLUB_API_URL=http://localhost:8000 \
ADMIN_TOKEN="$ADMIN_TOKEN" ADMIN_WEB_PASSWORD="$ADMIN_WEB_PASSWORD" \
node scripts/admin-web/server.mjs
```

Open **http://127.0.0.1:8090/login**. Use the local password to inspect approvals, capacity, farms, user support and inbox. No shared production password/token is included in this branch. The proxy's default API is hosted, so the explicit local API URL above is required for this exercise.

### D. Optional private source analysis

Keep the same disposable DB and local storage. Set `SOURCE_ANALYSIS_ENABLED=true` on the API **and** worker, restart the API, and run `uv run python -m app.source_analysis.worker` in another server terminal. The local mock accepts only the exact documented fixture (copy without a trailing newline):

```text
테스트 감귤
제주산 감귤입니다.
서늘한 곳에 보관해 주세요.
```

Arbitrary documents do not become successful mock analyses. Image/PDF preprocessing needs the optional OCR environment and provisioned model manifest; real analysis needs server-only provider credentials, an explicit budget and storage configuration. Follow the **current-contract notices** in [source integration](docs/spec/source-integration.md), [source editor](docs/spec/source-editor.md) and [server deployment guide](server/README.md). The historical setup text in older documents does not supersede the current editor contract. A private save is distinct from explicit apply, and applying details does not approve a product for sale.

### E. Stop

Stop each local process with Ctrl+C. If using Docker, `cd server && docker compose stop` stops PostgreSQL and retains the local volume for the next run.

## 6. Hosted entry points and documentation

- [Consumer](https://farmclub.kr/) · [Producer](https://farm.farmclub.kr/) · [Operator login](https://admin.farmclub.kr/login)
- [Requirements & Specifications](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Requirements-and-Specifications)
- [Design Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Design-Documentation)
- [Testing Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation)
- [Daily standup source pages](docs/wiki/meetings/) · [Repository contribution instructions](AGENTS.md)

The hosted applications can evolve after this branch snapshot. Reproduce the checked-out code locally when comparing a result against a specific revision. Wiki synchronization occurs from the repository's main branch after the team's review process.
