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
- Updates feed with likes, and 1:1 chat with AI answers and hand-off to the farm

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
| CI | GitHub Actions: server lint, tests, and migration check; app type check and web build |

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
uv run uvicorn app.main:app --reload
```

- Health check: http://localhost:8000/health returns `{"status": "ok"}`
- API docs (Swagger UI): http://localhost:8000/docs
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
# server/
uv run ruff check .
uv run pytest
uv run alembic check          # needs the database running

# apps/consumer and apps/producer
npm run typecheck
npx expo export -p web
```

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
