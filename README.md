# farmclub · Iteration 1 Demo

> This is the `iteration-1-demo` branch. It is `main` at the end of Iteration 1 plus the demo videos, a one-command demo launcher, and the scripts used to record the videos. The rest of this README (below the demo section) is the regular project README.

## Demo videos

farmclub has two apps, so there are two videos. Both run against the real stack: FastAPI + PostgreSQL, no Mock data layer.

| App | Video | Length | What it shows |
| --- | --- | --- | --- |
| Consumer | [iteration1-consumer-demo.mp4](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/iteration-1-demo/demo/iteration1-consumer-demo.mp4) | 1:51 | Discovery home → farm page → public news room → test login → product detail with stage pricing → reservation order and mock payment → order history and cancellation before shipping → follow a farm → like and private reply in the news room → 1:1 chat with AI answers |
| Producer | [iteration1-producer-demo.mp4](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/iteration-1-demo/demo/iteration1-producer-demo.mp4) | 2:42 | Farm sign-up request and pending state → dashboard → AI product draft from pasted KakaoTalk/BAND text (Claude Haiku 4.5) → filling the remaining fields → reservation stages and prices → supply capacity request → operator approval through the admin API → sales open → posting a farm update → answering a forwarded chat question → harvest, tracking number, and shipping |

Each step in the videos is captioned with the feature and screen IDs from [`docs/spec/`](docs/spec/README.md) (`FEAT-xx`, `SCR-xx`).

## Environment used for the demo

- MacBook (Apple silicon), macOS
- Node.js 24 (`.nvmrc`), npm 11
- Python 3.12 through [uv](https://docs.astral.sh/uv/) 0.12
- Docker Desktop 28 (local PostgreSQL 16)
- Chromium (Playwright) for recording; any recent Chrome works for trying the apps

## Run the demo

### 1. Install

```bash
git clone https://github.com/snuhcs-course/swpp-2026-project-team-06.git
cd swpp-2026-project-team-06
git checkout iteration-1-demo
npm ci
cd server && uv sync --frozen && cp .env.example .env && cd ..
```

Optional: put an Anthropic API key in `server/.env` as `ANTHROPIC_API_KEY=...` to use the real AI product draft (FEAT-03), as in the producer video. Without a key, the app shows its documented fallback ("초안을 만들지 못했어요", AC-03-3) and the producer types the fields in by hand. Routine chat answers (FEAT-13) work without a key because they come from the farm's registered data. Never commit `server/.env`.

### 2. Start everything

Docker must be running, and ports 8000, 8081, and 8082 must be free.

```bash
npm run demo
```

This starts PostgreSQL (`docker compose`), applies migrations, **resets the I1 seed data**, then runs FastAPI and both Expo web apps with the demo date fixed to 2026-10-07. When everything is ready it prints:

| | URL |
| --- | --- |
| Consumer app | http://localhost:8081 |
| Producer app | http://localhost:8082 |
| API docs (Swagger UI) | http://localhost:8000/docs |
| Operator (admin) token | printed in the terminal |

Stop with Ctrl+C. Running `npm run demo` again starts from fresh seed data.

### 3. Reproduce the videos

Test login is mocked in I1: pick a seeded account on each app's login screen.

| App | Account | Used for |
| --- | --- | --- |
| Consumer | 김민지 | Ordering, follows, news room, 1:1 chat |
| Producer | 신규 생산자 | Farm sign-up request (→ pending) |
| Producer | 강영수 (강씨네 귤밭, approved) | Everything else in the producer video |

Operator approval has no screen in I1 (planned for I2). It is a call to the admin API with the operator token printed by `npm run demo`:

```bash
curl -X POST "http://localhost:8000/admin/products/<productId>/capacity-requests/<requestId>/approve" \
  -H "Authorization: Bearer <operator token>" -H "Content-Type: application/json" \
  -d '{"version": <request version>}'
```

The videos were recorded with Playwright scripts that click through the apps exactly as shown. With `npm run demo` running in another terminal (and Playwright's Chromium installed once with `npx playwright install chromium`):

```bash
npm run demo:record:consumer
FARMCLUB_ADMIN_TOKEN=<operator token> npm run demo:record:producer
```

Each script writes a `.webm` to `demo/.raw/`. Restart `npm run demo` (fresh seed) before each recording, because the scripts change data (orders, follows, products).

---

# farmclub

**Reserve Jeju citrus before harvest, follow the farm while it grows, and get it in season.**

farmclub is a direct-to-consumer pre-order platform for small farms. Consumers follow a farm, watch the crop grow through short updates from the farmer, and reserve produce before harvest. The earlier they reserve, the less they pay. Farmers learn demand early, and AI takes over the repetitive work of writing product pages and answering common questions.

SNU Software Development Principles and Practices (SWPP) 2026, Team 6.

> **Status:** Iteration 1 (prototype). The app skeleton, CI, and specifications are in place, and the I1 features are being implemented. Payment and login are mocked in I1.

## How it works

| | What it means for users |
| --- | --- |
| **Stage pricing** | Each product is sold in stages before harvest. Earlier stages cost less, and the price is locked at the time of the order. |
| **Farm updates** | Farms post short updates with photos (growth, sugar level, harvest timing) to their followers, like an artist posting to a fan community. Followers can react with a like. |
| **1:1 chat with AI support** | Consumers ask a farm questions in a private chat. AI answers routine questions (delivery, storage, crop status) from the farm's own data, and hands anything that needs the farmer's judgment over to the farm. |
| **AI product drafts** | Farmers paste the text they already use on KakaoTalk or BAND, and AI turns it into a product page draft. Nothing is published until the farmer reviews it and farmclub approves it. |

The first product category is premium Jeju citrus.

## Features in Iteration 1

**Consumer app**
- Home and discovery: seasonal highlight, products closing soon, updates from followed farms
- Farm page with products and updates; follow a farm
- Product detail with the current stage price, the next stage price, and the expected delivery window
- Reservation order and payment (mock), order history, cancellation before shipping
- Farm news rooms with likes and private consumer replies, and 1:1 chat with AI answers and hand-off to the farm

**Producer app**
- Sign-up request and approval
- AI product draft from pasted text, product editing, stage, price, and quantity setup, then a publish request
- Dashboard with reservations per stage and orders to ship
- Posting updates, answering questions in the inbox, shipping status and tracking number

**Operators**
- Admin API with Swagger UI for approving producers and products and handling orders (a dedicated admin screen comes in I2)

Planned for I2 and later: Kakao login, real payment (PortOne), notifications, native Android and iOS builds, and AI-assisted shipping input. The full scope and priorities are in the [PRD](docs/spec/prd.md).

## Tech stack

| Area | Choice |
| --- | --- |
| Apps | Expo (React Native, TypeScript) with Expo Router, web output. Two apps: consumer and producer |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL (Docker locally) |
| Auth | I1: mock login with seeded test accounts and a server-issued JWT. I2: Kakao login |
| AI | Claude Haiku 4.5, called only through one adapter in `server/app/ai`. Personal data is removed before any AI call |
| Observability | PostHog (product metrics), Sentry (errors), Langfuse (AI traces) |
| Files | Cloudflare R2 |
| Hosting | Vercel (apps), Railway (API and database) |
| CI | GitHub Actions: server lint/tests/migrations; app typecheck/web build; real-stack API and Chromium integration |

Architecture decisions are recorded in [`docs/spec/tech-design/adr/`](docs/spec/tech-design/adr/).

## Repository layout

```
apps/
  consumer/        Consumer app (Expo Router, web)
  producer/        Producer app (Expo Router, web)
packages/
  ui/              Shared components and design tokens (@farmclub/ui)
  api/             API client and types (@farmclub/api)
server/            FastAPI server
  app/             Domain modules: core, accounts, farms, catalog, orders, messaging, ai, analytics
  migrations/      Alembic migrations
  tests/           pytest
docs/
  spec/            Product specification (Korean, source of truth)
  wiki/            Course documentation (English, synced to the GitHub Wiki)
.agents/skills/    Shared skills for AI coding agents
.github/           CI workflow, Dependabot, PR template
```

Each code folder has a `spec.md` (implementation decisions) and a `tasks.md` (a log of work per issue).

## Getting started

### Prerequisites

- [Docker](https://www.docker.com/) for the local PostgreSQL database
- [uv](https://docs.astral.sh/uv/) for the Python server (Python 3.12 is installed by uv)
- [Node.js](https://nodejs.org/) 24 (see `.nvmrc`) and npm

### Server

```bash
cd server
docker compose up -d          # local PostgreSQL 16
cp .env.example .env          # fill in only what you need; empty values fall back to app/core/config.py
uv sync
uv run alembic upgrade head
uv run python -m app.core.seed            # I1 demo data (add --reset to start over)
MOCK_LOGIN_ENABLED=true uv run uvicorn app.main:app --reload
```

- Health check: http://localhost:8000/health returns `{"status": "ok"}`
- API docs (Swagger UI): http://localhost:8000/docs. This is the API reference for the apps.
- Test login (I1): `MOCK_LOGIN_ENABLED=true` turns on `GET /api/auth/test-accounts` and `POST /api/auth/test-login`. It is off by default and must stay off in production.
- Demo date: set `FIXED_NOW=2026-10-07T10:00:00+09:00` so stages and D-days match the seed.
- Operator token for the `/admin` API: `uv run python -m app.accounts.admin_token`, then paste it into **Authorize** in Swagger UI.
- Outside `APP_ENV=local`, the server refuses to start without `JWT_SECRET`.
- Never commit `.env`.

### Apps

Run from the repository root (npm workspaces):

```bash
npm install
npm run web -w apps/consumer                  # consumer app, http://localhost:8081
npm run web -w apps/producer -- --port 8082   # producer app, http://localhost:8082
```

The apps call the server at `EXPO_PUBLIC_API_URL` (default `http://localhost:8000`).

### Checks

These are the same checks CI runs on every pull request.

```bash
# server/ (pytest uses a separate <db>_test database on the same PostgreSQL)
uv run ruff check .
uv run pytest
uv run alembic check          # needs the database running

# apps/consumer and apps/producer
npm run typecheck
npx expo export -p web
```

### Real-stack integration

Install dependencies once with `npm ci`, `cd server && uv sync --frozen`, and
`npx playwright install chromium`. Docker must be running and ports 8000, 8081,
and 8082 must be free.

```bash
# Reset PostgreSQL, start FastAPI and both Expo web apps, run API + Chromium tests,
# then stop every child process. This is the same entry point used by CI.
npm run test:integration:full

# Run only the API smoke against an already-running local FastAPI server.
FARMCLUB_ADMIN_TOKEN="$(cd server && uv run python -m app.accounts.admin_token)" \
  npm run test:integration

# Run only Chromium against an already-running, reset real stack.
npm run test:e2e
```

The integration commands reject non-localhost targets. The full runner fixes the
server clock, disables Mock mode, resets the I1 seed before both phases, and keeps
process logs under `.artifacts/integration/`. Playwright reports, traces, videos,
and screenshots are written to `playwright-report/` and `test-results/`.

## Documentation

| Where | What |
| --- | --- |
| [`docs/spec/`](docs/spec/README.md) | Product specification in Korean: PRD, information architecture, screen specs and API contract, functional specs with acceptance criteria, service policy, tech design. This is the source of truth. |
| [GitHub Wiki](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki) | Course documentation in English: proposal, requirements, design, testing, user study, risk management, AI collaboration report, meeting logs. Edited in [`docs/wiki/`](docs/wiki/README.md) and synced on merge. |
| [`AGENTS.md`](AGENTS.md) | Team workflow and rules for humans and AI coding agents |

## How we work

1. Every change starts from an issue in Linear, synced with GitHub Issues.
2. Branch from `main` using the issue's branch name. Issue keys go in branch names, commits, and PR titles, for example `[DEV-12] ...`.
3. Record scope and decisions in the code folder's `tasks.md`, then open a draft PR.
4. Run an AI first-pass review, then get one human approval. CI must pass before merge.

Features are written against IDs in the spec (`FEAT-xx`, rules `R-xx` and `M-xx`, screens `SCR-xx`), and test names include acceptance criteria IDs, for example `test_AC_09_1_...`. Details are in [`AGENTS.md`](AGENTS.md).

## Team

Team 6: Hyun Park, Minsun Kim, Jinwoo Jang, Zahra


## Local prototype preview (DEV-3)

The frontend uses the reference prototype by Hyun Park (`farmclub-proto-ref.zip`).
It implements the consumer/producer flows and the merged specifications through 1.4.

```sh
npm install
npm run dev
```

The launcher runs the consumer app at http://localhost:8081 and the producer app at
http://localhost:8082. If a port is occupied, it prints the selected available URL.
Both apps run with `EXPO_PUBLIC_API_MOCK=1`; no FastAPI service or database installation is required.
App links and Mock farm sharing point to the local consumer/producer URLs.
Edit the source while the servers are running to use Fast Refresh. Stop with Ctrl+C.

Local development shares Mock state between both apps through a loopback server.
Payments and AI responses remain simulated. Exported standalone demos use browser localStorage.
The reference seed date remains 2026-10-07. Demo reset controls restore the seed data.

```sh
npm run typecheck
npm run build:web
```

These commands work in PowerShell as well as Unix shells. Web exports go to each
app's ignored `dist` directory; they do not deploy anything.


Local shared Mock: `npm run dev` compiles the API fixtures and starts a loopback-only HTTP backend plus both apps. State and uploaded media persist under ignored `.expo/shared-mock/`. Each app has its own login token. The reset action clears shared data and invalidates both apps’ tokens. Exported demos retain standalone browser Mock mode. Run `node node_modules/typescript/bin/tsc -p scripts/mock-tsconfig.json && node --test scripts/test-news-rooms.mjs` to verify room privacy using isolated test storage.

### Spec 1.4 frontend and Mock

- Consumer: discovery / orders / chat / profile. Chat combines farm news rooms and private 1:1 conversations. Orders requiring action are labeled **미확정 주문**.
- Producer: dashboard / products / chat / settings. Product filters: **판매 중 → 심사 중 → 작성 중 → 판매 중지 → 판매 종료**. Farm profile and AI settings live under settings; news is written from the farm room.
- Supply approval is per product, entered in kg and stored as integer grams. Initial approval opens sales; only additional capacity requires another request. Approval and the producer's sales limit are separate. Pending increases keep existing sales open.
- Date-based reservation periods, immediate prices for new orders, per-order box limits, pause/resume, mixed-weight capacity accounting. Paid orders retain price/weight snapshots; pre-shipping cancellations restore capacity once.
- Order problem inquiries support private photos, participant-only access and producer handoff. AI replies and previews are deterministic Mock behavior.
- `npm run test:mock` checks isolated fixtures/storage; it does not reset the running demo. CI also runs these contracts. `npm run typecheck` and `npm run build:web` check both apps.
- Changes to `packages/api/src/mock` require restarting `npm run dev` to recompile the shared backend. Frontend/UI edits use Fast Refresh. Stop the existing launcher first to retain ports 8081/8082/8083.
- Mock schema 7 requires explicit local migration/reset on a schema mismatch. Existing local orders/messages were backed up and converted once; no legacy schema compatibility is shipped. Do not commit `.expo`, tokens or backups.
- Scope: frontend + local Mock. DEV-4 implements the corresponding FastAPI endpoints and production transactions. These tests do not verify real payments, AI or server API implementation. Admin approval is a management API, never a producer self-approval button.
