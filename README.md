# Farmclub — Iteration 4 working demo

SNU Software Development Principles and Practice · Team 6

Farmclub connects consumers and small Jeju citrus farms through advance reservations, farm updates and direct communication. This branch pins the application source at [`77b2be33`](https://github.com/snuhcs-course/swpp-2026-project-team-06/commit/77b2be3326ebed5fd728c93669c202eec4a1cd1b).

## One farm, two perspectives

In Farmclub, growers build a following by sharing the season as it happens. In this story, Minji discovers Kang’s citrus farm through its orchard updates. The grower shares the season with followers and replies to Minji personally. When Minji sends a box to her parents, she already knows the farm behind it.

- [Consumer story · 0:47](docs/demo-i4/consumer.mp4) follows Minji from discovery and the first harvest update through a private reply and reservation.
- [Producer story · 1:01](docs/demo-i4/producer.mp4) follows the grower as they send that update, find Minji’s reply, answer her and confirm the simulated deposit. It ends with the grower preparing the next listing.

Both clips use the application source pinned on this branch and include on-screen English captions. The transaction uses a simulated bank transfer and the editor uses a fixture-backed source-analysis provider.

## AI feature walkthroughs

- [Consumer AI chat · 0:17](docs/demo-i4/consumer-ai-chat.mp4). A small-order question receives an answer from the farm's saved policy. A request for a shipping discount is forwarded to the grower.
- [Producer AI draft · 0:17](docs/demo-i4/producer-ai-draft.mp4). The grower adds source notes, fills the listing draft and reviews the editable fields. This recording uses a fixture-backed provider.

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

## Walk through the story

Open the [consumer app](http://localhost:8081/login) as **김민지** and the [producer app](http://localhost:8082/login) as **강영수**. Both are local seed accounts. The seed may already have Minji following the farm. To replay the first follow, toggle **팔로잉** off and select **팔로우** again.

### 1. Minji finds a farm to follow

In the consumer app, open **홈 → 농가 소식 → 강씨네 귤밭** and select **팔로우**. The news room gives Minji a place to come back for this farm’s harvest updates.

### 2. The grower shares the first harvest

In the producer app, open **채팅 → 내 소식방**. In **모두에게 보낼 소식**, write “오늘은 하우스 감귤을 처음 따 봤어요. 올해 첫 수확 모습을 팬분들께 먼저 전해요 🍊” and select **전송 → 확인 · 보내기**. The confirmation shows who will receive the update.

### 3. The two sides talk

As Minji, reopen the farm’s news room and read the new post. In **농가에 답장**, write “첫 수확 소식 기다렸어요! 부모님께도 이 감귤을 보내고 싶어요.” The reply goes to the farm. As the producer, reopen **내 소식방**, select the reply count below the post and find Minji’s message. Tap **1:1 채팅** and send a personal reply. Return to the consumer’s chat to read it.

### 4. Minji reserves a box

As Minji, open **판매 품목** in the farm’s news room, pick **하우스 감귤**, and reserve one box. Use the short depositor reference shown in the instructions and report a simulated transfer. As the producer, open **주문 현황 → 입금 대기**, compare the reference and amount, and approve the matching order. Minji can then check the Reserved status. The producer’s reservation and shipping views also support harvest and tracking.

### 5. The grower prepares the next listing

In the producer app, open **상품 → 새 상품 → AI 초안**. Add a text source under **사진·자료 → 텍스트 추가**, fill **궁천조생** as the variety, and choose **AI로 채우기**. Review the populated draft, then add a chip such as **상품 구성** and follow the highlight to its field. To show how a grower comes back later, edit a selling product, select **임시 저장하고 나가기**, and reopen it to see the saved changes.

```text
테스트 감귤
제주산 감귤입니다.
서늘한 곳에 보관해 주세요.
```

## Verification

A fresh clone launched through the steps above passed four walkthrough checks covering reservation, deposit confirmation, the standalone draft worker, chat and shipment. The fan story also passed across both app roles on the local stack.

The four specifications below passed all 16 cases on the local stack. Run them from the repository root after setup, with ports 8000, 8081 and 8082 free and the disposable database URL exported. The runner reseeds that database and starts its own API and apps.

```sh
npx playwright install chromium
FARMCLUB_INTEGRATION_SKIP_DOCKER=1 FARMCLUB_INTEGRATION_API=0 \
  node scripts/run-integration.mjs scripts/e2e/password-login.spec.ts \
  scripts/e2e/producer-consumer-link.spec.ts scripts/e2e/source-editor.spec.ts \
  scripts/e2e/deposit-code.spec.ts
```

See the [product specification](docs/spec/README.md) and the [GitHub Wiki](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki) for implementation and testing evidence.
