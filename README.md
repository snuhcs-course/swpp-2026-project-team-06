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
| Apps | Expo (React Native, TypeScript) with Expo Router. Two apps: consumer and producer, each exported for the web (Vercel) and built as native iOS/Android apps with EAS (ADR 0013) |
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

### Local run (`make`)

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
  (heavy, reseeds the local database; see Testing Documentation 3.6).
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

## Deployment

### Server on Railway (DEV-64)

`server/Dockerfile` and `server/railway.json` define the service. On every start the
container runs `alembic upgrade head`, then serves on Railway's `$PORT`; Railway checks
`/health`.

1. Create a Railway project, add a service from this GitHub repo, set its **root
   directory** to `server` and its deploy branch to `main`. If Railway does not pick up
   the config, set the config file path to `/server/railway.json`.
2. Add a **PostgreSQL** database to the same project.
3. Set these variables on the server service:

| Variable | Value |
| -- | -- |
| `DATABASE_URL` | Reference the database's `DATABASE_URL`. The `postgresql://` form is accepted as is. |
| `APP_ENV` | `production` |
| `JWT_SECRET` | A long random string. The server does not start without it outside `local`. |
| `CONSUMER_APP_URL` | `https://farmclub.kr` (CORS, share-link redirects, Kakao return address). No trailing slash. |
| `PRODUCER_APP_URL` | `https://farm.farmclub.kr` |
| `SHARE_BASE_URL` | `https://farmclub.kr`. Set it after the consumer app with the `/s/*` proxy is live (see Domains). Empty: share links use the server's own address. |
| `MOCK_LOGIN_ENABLED` | `true` while test accounts are used (Kakao login is not built yet) |
| `ANTHROPIC_API_KEY` | Optional. Without it, AI answers come from registered rules and other questions go to the producer. |

4. Deploy, then generate a public domain under the service's networking settings.
5. Load the seed data once from the service shell: `python -m app.core.seed`. It skips
   when data exists; `--reset` erases everything, so do not use it on a live database.

The project `farmclub` (service `farmclub-api`, domain
`https://farmclub-api-production.up.railway.app`) was created this way on 2026-10-17.

**Hiding a test farm (DEV-93).** Order from farms you create for live checks only with test
accounts. When the check is done, hide the farm from everyone from the service shell. Nothing is
deleted: the farm becomes `SUSPENDED`, which every public path already hides.

```bash
railway ssh --service farmclub-api -- .venv/bin/python -m app.admin.retire_test_farm <farmId>                     # dry run
railway ssh --service farmclub-api -- .venv/bin/python -m app.admin.retire_test_farm <farmId> --commit            # hide
railway ssh --service farmclub-api -- .venv/bin/python -m app.admin.retire_test_farm <farmId> --restore --commit  # undo
```

It refuses a farm that is not approved or has orders from real (non-test) accounts, since
suspension means refunding those (R-24). Each `--commit` writes one `ManagerEvent`.
Pre-shipment test orders are counted, not refused: they may stay open while the farm is hidden.
Orders whose buyer reported a deposit never auto-cancel and appear in `deposit-overdue` after the
deadline, so cancel them first if you want that list clean. `--restore` only reopens farms this
command hid; orders that expired in the meantime stay cancelled.
Permanently deleting data waits for the retention policy (PQ-06, DEV-94).

### Automatic deploys (DEV-65, DEV-66)

The repository belongs to the `snuhcs-course` organization, so the Railway GitHub App
cannot be connected without an organization admin. Instead,
`.github/workflows/deploy-railway.yml` deploys from GitHub Actions. It waits for the
**CI** workflow on `main` and runs only when CI succeeded, so a commit that fails tests
is never deployed. It checks out the exact commit CI tested, and if that commit touches
`server/**` (or the deploy workflow itself) it runs
`railway up ./server --path-as-root --service farmclub-api --environment production --ci`
and then polls `/health` until it answers; otherwise it skips the deploy and passes.
Changes are read from that single commit, which matches the squash-merge rule. The
workflow can also be started by hand from the Actions tab (**Run workflow**) with the
`main` branch selected, for example after a variable change; a manual run always deploys
the current `main`.

Both deploy workflows (this one and the Vercel one below) are locked to `main` (DEV-70):

- The job runs only when `github.ref` is `refs/heads/main`, so pressing **Run workflow**
  on another branch skips the deploy.
- The job uses the GitHub Environment `production`, which allows deployments from the
  `main` branch only, and the deploy tokens live in that environment. A branch that edits
  the workflow file still cannot read the tokens.

One-time setup (a human does this; never paste the token into the repo, an issue or a PR):

1. Railway → project `farmclub` → **Settings → Tokens** → create a **Project Token**.
2. GitHub → repository **Settings → Environments → production → Environment secrets** →
   add `RAILWAY_TOKEN`. Do not keep a repository-level copy.
3. Run the workflow once from the Actions tab and check that `/health` returns `{"status":"ok"}`.

Variables to add on the Railway service as features land, in merge order:

| When | Variables |
| -- | -- |
| Kakao login (PR #121) | `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, and register `https://farmclub.kr/auth/kakao` as a redirect URI in the Kakao console |
| PortOne payments (PR #124) | `PORTONE_STORE_ID`, `PORTONE_CHANNEL_KEY`, `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET`, and register `https://api.farmclub.kr/api/payments/portone/webhook` as the PortOne webhook |
| Before real users | `MOCK_LOGIN_ENABLED=false` (ADR 0009) |

### Apps on Vercel (DEV-67)

The Vercel projects `farmclub-consumer` and `farmclub-producer` are not connected to
GitHub; each deployment is an exported `dist/` uploaded with the Vercel CLI. Expo bakes
`EXPO_PUBLIC_*` values in at export time, so changing variables in the Vercel dashboard
has no effect.

`.github/workflows/deploy-vercel.yml` automates this. After **CI** succeeds on `main`, if
the tested commit touches `apps/`, `packages/`, the root `package*.json`, `.nvmrc`,
`scripts/legal-pages.mjs` or the workflow, it exports both apps and runs `vercel deploy --prod`, then checks that each site
answers 200. It can also be run by hand from the Actions tab with the `main` branch
selected; a manual run always deploys the current `main`.

| Setting | Where | Effect |
| -- | -- | -- |
| `VERCEL_TOKEN` | **Environment secret** in `production` (Vercel → Account Settings → Tokens) | Turns automatic app deploys on. Without it the workflow skips the deploy and passes. |
| `APP_API_URL` | Repository **variable** | Empty: mock build (data stays in each browser). Set to `https://api.farmclub.kr`: the apps call the server. |
| `APP_POSTHOG_KEY` | Repository **variable** | PostHog project API key (`phc_…`, public). Empty: no analytics or session replay. Set: screen events, replays and heatmaps go to PostHog (DEV-71). |
| `APP_POSTHOG_HOST` | Repository **variable** | Optional. Empty: `https://us.i.posthog.com` (US Cloud). |
| `BUSINESS_NAME` | Repository or `production` **variable** | Footer business info (DEV-113): trade name (상호), exactly as on the business registration certificate. |
| `BUSINESS_OWNER` | same | Representative (대표자). |
| `BUSINESS_REGISTRATION_NO` | same | Business registration number (사업자등록번호), e.g. `000-00-00000`. Also turns on the 사업자정보 확인 link (ftc.go.kr). |
| `BUSINESS_MAIL_ORDER_NO` | same | Mail-order business report number (통신판매업 신고번호), e.g. `제0000-서울00-0000호`. |
| `BUSINESS_ADDRESS` | same | Business address (주소). |
| `BUSINESS_PHONE` | same | Customer contact number (연락처). |
| `BUSINESS_EMAIL` | same | Contact email; also used for privacy requests. |
| `PRIVACY_OFFICER` | same | Privacy officer (개인정보 보호책임자), e.g. `이름 (직책)`. |

The business values are public on the live site but must never be committed (they are
personal/company details and the repository is mirrored publicly). Each one maps to
`EXPO_PUBLIC_<NAME>` at export time; an empty variable is left out of the footer, and with
none set the footer shows "farmclub · 테스트 서비스". After changing them, run the workflow
by hand so both apps are rebuilt. After `expo export`, `scripts/legal-pages.mjs` writes
`dist/privacy.html` and `dist/terms.html` (served at `/privacy` and `/terms` via
`vercel.json`) and puts the same footer in `index.html`'s `<noscript>`, so the pages read
without JavaScript.

Setting the token, or changing `APP_API_URL` and running the workflow, changes what live
users see. Do it outside user tests, and merge the server routes the apps call (for
example `GET /api/farms` and `/api/farms/following`, PR #123) before switching to the
server. To do the same by hand:

```
EXPO_PUBLIC_API_MOCK=0 EXPO_PUBLIC_API_URL=https://api.farmclub.kr \
  npx expo export -p web   # run inside apps/consumer and apps/producer
node ../../scripts/legal-pages.mjs dist   # static /privacy and /terms (DEV-113)
vercel deploy --prod       # from the exported dist/
```

With `EXPO_PUBLIC_API_MOCK=1` (what `npm run build:web` produces) the apps keep data in
each browser and never call the server.

### Native apps with EAS (DEV-33)

Both apps are also built as native iOS and Android apps from the same code
([ADR 0013](docs/spec/tech-design/adr/0013-eas-native-builds.md)). Native builds run on EAS
Build (cloud); JS changes ship with EAS Update and never need a store review. Identifiers are
`kr.farmclub.consumer` and `kr.farmclub.producer`; `apps/<app>/eas.json` has four profiles:
`development` (dev client), `internal` (installable Android APK and iOS simulator build for team
testing, channel `preview`), `preview` (channel `preview`, store-format build for TestFlight and
Play internal testing) and `production` (channel `production`). Build numbers auto-increment;
`version` in `app.json` is bumped by hand. The `development` profile points at `http://localhost:8000`,
which on a device is not your computer, and its Kakao return address is still the production
web page, so in a dev client use a test account (or set `EXPO_PUBLIC_API_URL` to your LAN address). Nothing native is built locally and no `ios/` or
`android/` folder is committed.

Web-only code is split by platform (`*.native.ts` next to the web file, or `Platform.OS`
branches). Tokens live in `expo-secure-store` on devices, analytics use `posthog-react-native`,
photos come from `expo-image-picker`. Kakao login keeps the server contract: the app opens the
Kakao page in an auth session with `state=app-…`, Kakao returns to the usual web page
`https://farmclub.kr/auth/kakao` (or `https://farm.farmclub.kr/auth/kakao`), and that page hands
the code to the app scheme (`farmclub-consumer://auth/kakao`). `scripts/test-native-config.mjs`
(part of `npm run test:mock`) checks the config files and that shared packages do not touch
`window`/`document`/`localStorage` outside the web-only files.

**First-time setup once the accounts exist (DEV-128; a human runs these, from `apps/consumer`
and again from `apps/producer`).** Secrets (certificates, `EXPO_TOKEN`, service-account keys)
stay in EAS and the team password manager; never in the repo, an issue or a PR.

```bash
npx eas-cli@latest login                       # Expo account (organization: see DEV-128)
npx eas-cli@latest init                        # done 2026-10-23 under the snu-omm organization (projectId is in app.json); only for a new project
npx eas-cli@latest update:configure            # done 2026-10-23 (updates.url in app.json); only for a new project
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_POSTHOG_KEY --value phc_... --visibility plaintext --environment production   # optional (DEV-71); production only, so internal/preview test builds send no analytics
npx eas-cli@latest credentials                 # Apple certificates / Android keystore, managed by EAS
npx eas-cli@latest build -p all --profile preview
npx eas-cli@latest submit -p ios --profile preview --latest       # TestFlight (internal testers, no review)
npx eas-cli@latest submit -p android --profile preview --latest   # Play internal testing (upload the first AAB by hand in Play Console if submit asks for it)
npx eas-cli@latest update --channel preview --message "first update"
```

**Internal testing without store accounts (I2).** Paid Apple and Play registration waits for
I3, so team testing uses the `internal` profile, which needs only the free Expo account: Android
phones install an APK from the build link, iPhone testing runs in the iOS Simulator on a Mac (a
real iPhone needs the Apple Developer Program). Merge and deploy the web apps first: the in-app
Kakao login returns through the web page `/auth/kakao`, which hands the code back to the app, so
the app cannot finish a login until that page is live.

```bash
# once per app (apps/consumer, apps/producer), after `eas login` (projects already exist under snu-omm)
npx eas-cli@latest build -p android --profile internal   # APK; the build page shows an install link and QR code
npx eas-cli@latest build -p ios --profile internal       # .app for the iOS Simulator (no Apple account needed)
npx eas-cli@latest update --channel preview --environment preview --message "..."   # later JS changes, no reinstall
```

`eas update` bundles with the EAS **environment variables** of the given environment, not with the
`env` block of `eas.json` (that block only applies to `eas build`). `EXPO_PUBLIC_API_URL`,
`EXPO_PUBLIC_API_MOCK`, `EXPO_PUBLIC_CONSUMER_URL` and `EXPO_PUBLIC_PRODUCER_URL` were created in
both projects' `preview` and `production` environments on 2026-10-23 (`eas env:list --environment
preview`); an update published without them would point the app at `localhost`.

Android: open the build link on the phone, allow installs from this source once, install.
The link works for anyone who has it. iOS Simulator: download the build, unpack it and drag
the `.app` onto a booted simulator (or `xcrun simctl install booted <path>.app`). Check, in this
order: install and launch, Kakao login and return to the app (on Android also that the screen
you came from and the pending action are kept), onboarding, home / farm / product / order /
chat, photo attachment in chat, and in the producer app sign-up and photo upload. Record each
device in DEV-41 (model, OS version, install, login, problems). These builds send nothing to
PostHog: the key is only set in the EAS `production` environment. Known limits: the ‘카카오톡으로
로그인’ button inside the auth session may not switch to the KakaoTalk app (Kakao account
login still works); producer source documents (PDF, text) attach on the web only.

After `eas credentials` the Android keystore has a SHA-256 fingerprint and the Apple account a
Team ID. Put them into `apps/<app>/public/.well-known/assetlinks.json` and
`apple-app-site-association` (replace the `REPLACE_WITH_…` placeholders; both files are public,
not secrets) and deploy the web apps, so `https://farmclub.kr/.well-known/...` serves them as
JSON (`vercel.json` sets the content type). Until then the files are placeholders and only the
app scheme is used for the Kakao return, which works without them.

Release flow after that: push JS changes with `eas update --channel production` (DEV-129 adds
this to the deploy workflow); when `app.json`, a native module or `eas.json` changes, run
`eas build -p all --profile production` and `eas submit`. Roll back a bad JS update by
republishing the previous one (`eas update:republish --channel production`). Free plan limits:
15 builds per OS per month and 1,000 monthly active update users.

### Domains (DEV-69)

`farmclub.kr` is registered with hosting.kr, a Korean registrar (Cloudflare Registrar does not sell
`.kr`) and its DNS is on Cloudflare. Decision, record table and cut-over order:
[ADR 0012](docs/spec/tech-design/adr/0012-domains-cloudflare.md).

| Address | Serves | Host |
| -- | -- | -- |
| `farmclub.kr` (`www` redirects here) | Consumer app and farm share links `/s/farms/<id>` | Vercel `farmclub-consumer` |
| `farm.farmclub.kr` | Producer app | Vercel `farmclub-producer` |
| `api.farmclub.kr` | FastAPI server, Swagger UI at `/docs` | Railway `farmclub-api` |
| `admin.farmclub.kr` | Operator admin page (`scripts/admin-web`): producer sign-ups, supply approvals, test farms, users, inbox | Vercel `farmclub-admin` |
| `demo.farmclub.kr` | Working demo site (videos), source in [`demo/`](demo/README.md) | Vercel `farmclub-demo`, deployed by the `deploy-demo` job (DEV-133) |

`dev` and `staging` are reserved; no DNS records exist until they have a target.
The Vercel default addresses `farmclub-consumer.vercel.app` and `farmclub-producer.vercel.app`
permanently redirect (308, path and query kept) to `farmclub.kr` and `farm.farmclub.kr` through a
host rule in each app's `vercel.json` (DEV-127). The API only allows the two official origins
(CORS) and Kakao only returns to them, so the apps do not work on the `vercel.app` addresses.
The consumer app's `vercel.json` proxies `/s/*` to `https://api.farmclub.kr/s/*`, so
KakaoTalk reads the server's OG page under the consumer domain. All five records (`@`,
`www`, `farm`, `api`, `admin`) are **proxied** through Cloudflare (orange cloud), so Vercel shows a
"Proxy Detected" warning; keep SSL/TLS mode **Full (strict)** and leave **Bot Fight Mode**
and **Rocket Loader** off, or KakaoTalk previews and the app break. If a Vercel or Railway
certificate stops renewing, switch that record to DNS only.

Accounts, purchases and console changes are done by a person. In order:

1. Buy `farmclub.kr` on hosting.kr, add it to Cloudflare (Free), and switch the registrar's name
   servers to the two Cloudflare ones.
2. Add the custom domains in Vercel (both projects) and Railway, copy the records they
   show into Cloudflare, and check `https://api.farmclub.kr/health`.
3. Change `CONSUMER_APP_URL` and `PRODUCER_APP_URL` on Railway, and add the new domains
   in the Kakao console (keep the old ones until the switch is done).
4. Merge the DEV-69 pull request. The deploy workflows and the apps now use the new
   addresses, so merging earlier makes the deploy checks fail.
5. Set `SHARE_BASE_URL=https://farmclub.kr` on Railway and send a farm link in KakaoTalk
   to check the preview.

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

현재 대화 중심 프론트의 동작·Figma 기준은 [UI 1.6 명세](docs/spec/conversation-ui-1.6.md)를 참고한다.
