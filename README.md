# Farmclub — Iteration 4 working demo

SNU Software Development Principles and Practice · Team 6

Farmclub connects consumers and small Jeju citrus farms through advance reservations, farm updates and direct communication. This branch pins the application source at [`77b2be33`](https://github.com/snuhcs-course/swpp-2026-project-team-06/commit/77b2be3326ebed5fd728c93669c202eec4a1cd1b).

## Demo videos

- [Consumer walkthrough · 1:33](docs/demo-i4/consumer.mp4). Login and reserve, confirm the displayed amount and short depositor name, ask the farm a routine question and inspect the handoff.
- [Producer walkthrough · 1:59](docs/demo-i4/producer.mp4). Fill a product draft, observe revised photo-loading behavior and reopen a saved draft to continue editing.

The videos compare I3 with earlier I4 local recordings. The live branch also includes operator-created ID accounts and first-login password changes, the producer's consumer-page preview link, and the latest editor-field navigation and highlighting. Use the branch to see those later changes.

## Run locally

Environment used for verification: macOS, Node.js 24, Python 3.12 managed by uv, Docker with PostgreSQL 16, Expo web and Chromium. The walkthrough uses a disposable local database and synthetic accounts. A fixture-backed product-draft run demonstrates the editor flow without any paid-model key. Bank transfers and shipping in this demo are simulated actions.

Clone and prepare the branch from a terminal.

```sh
git clone --branch iteration-4-demo https://github.com/snuhcs-course/swpp-2026-project-team-06.git farmclub-i4-demo
cd farmclub-i4-demo
make setup
make db
docker compose -f server/docker-compose.yml exec -T db createdb -U farmclub farmclub_i4_demo
export DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_i4_demo
export FIXED_NOW=2026-10-07T10:00:00+09:00
make migrate seed
```

If the local demo database already exists, skip `createdb` and continue with the existing database. Export the same database URL and fixed clock in both server terminals. From the repository root, start these processes in separate terminals.

**API**

```sh
export DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_i4_demo
export FIXED_NOW=2026-10-07T10:00:00+09:00
SOURCE_ANALYSIS_ENABLED=true SOURCE_ANALYSIS_PROVIDER=mock make dev-api
```

**Draft-analysis worker**

```sh
cd server
export DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_i4_demo
export FIXED_NOW=2026-10-07T10:00:00+09:00
SOURCE_ANALYSIS_ENABLED=true SOURCE_ANALYSIS_PROVIDER=mock uv run python -m app.source_analysis.worker
```

**Consumer web**

```sh
cd apps/consumer
EXPO_PUBLIC_API_MOCK=0 EXPO_PUBLIC_API_URL=http://localhost:8000 EXPO_PUBLIC_CONSUMER_URL=http://localhost:8081 EXPO_PUBLIC_PRODUCER_URL=http://localhost:8082 npx expo start --web --host localhost --port 8081
```

**Producer web**

```sh
cd apps/producer
EXPO_PUBLIC_API_MOCK=0 EXPO_PUBLIC_API_URL=http://localhost:8000 EXPO_PUBLIC_CONSUMER_URL=http://localhost:8081 EXPO_PUBLIC_PRODUCER_URL=http://localhost:8082 npx expo start --web --host localhost --port 8082
```

Open the [consumer app](http://localhost:8081/login) and select **이서준**. Open the [producer app](http://localhost:8082/login) and select **강영수**. Development seed login is local to this demonstration. Operator-created password accounts are covered separately by the [ID login browser tests](scripts/e2e/password-login.spec.ts).

1. On the consumer app, choose a product from 강씨네 귤밭, reserve one box, compare the price and short depositor name, then report a simulated deposit.
2. On the producer app, open the deposit queue and confirm the matching order. The consumer can check its updated status. Use the producer's reservation and shipping views to demonstrate harvest and tracking.
3. Ask the farm a routine delivery question in consumer chat, then ask whether it can reduce the delivery fee. Inspect the handoff in the producer inbox.
4. In the producer app, open **상품 → 새 상품 → 사진·자료 → 텍스트 추가**. Paste exactly the sample below and enter **궁천조생** as the fruit variety. Click **AI로 채우기** and review the private draft. Add a content chip to see the matching field scroll into view. Public application requires its normal validation and approval flow.

```text
테스트 감귤
제주산 감귤입니다.
서늘한 곳에 보관해 주세요.
```

## Verification

The four specifications below passed all 16 cases on the local stack. Run them from the repository root after setup, with ports 8000, 8081 and 8082 free and the disposable database URL exported. The runner reseeds that database and starts its own API and apps.

```sh
npx playwright install chromium
FARMCLUB_INTEGRATION_SKIP_DOCKER=1 FARMCLUB_INTEGRATION_API=0 \
  node scripts/run-integration.mjs scripts/e2e/password-login.spec.ts \
  scripts/e2e/producer-consumer-link.spec.ts scripts/e2e/source-editor.spec.ts \
  scripts/e2e/deposit-code.spec.ts
```

See the [product specification](docs/spec/README.md) and the [GitHub Wiki](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki) for implementation and testing evidence.
