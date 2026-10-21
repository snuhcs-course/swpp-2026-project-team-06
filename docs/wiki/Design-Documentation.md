# Design Documentation

> Current frontend: [UI 1.6](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/spec/conversation-ui-1.6.md), DEV-51, 13 October 2026. API/state contracts below are unchanged. The retained harvest endpoint is not called by the current UI. Earlier I1 screenshots and diagrams are historical.

Team 6 | Farmclub | Iteration 1 | 9 October 2026

This page is for the development team. It explains how the system is built so we can split work and so another developer can run and extend it. Test plans and results are in [Testing Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation).

## Table of Contents

- [Document Revision History](#document-revision-history)
- [1. System Architecture](#1-system-architecture)
- [2. Design Details](#2-design-details)
  - [2.1 Frontend class diagram](#21-frontend-class-diagram)
  - [2.2 Backend class diagram](#22-backend-class-diagram)
  - [2.3 Database model](#23-database-model)
  - [2.4 API specification](#24-api-specification)
  - [2.5 Key flows](#25-key-flows)
  - [2.6 AI components](#26-ai-components)
  - [2.7 Implementation decisions](#27-implementation-decisions)
- [3. Design Patterns](#3-design-patterns)
- [4. Implementation Status](#4-implementation-status)
- [5. Running Locally and Source Map](#5-running-locally-and-source-map)

## Document Revision History

| Version | Date | Author | Major changes |
| --- | --- | --- | --- |
| 0.1 | 2026-10-07 | Team 6 | Initial sitemaps, flows, data model and order states |
| 0.2 | 2026-10-07 | Team 6 | Replace Django plan with FastAPI and operator API (ADR 0007/0008) |
| 0.3 | 2026-10-07 | Team 6 | Separate accounts, screen/state details and seed contracts |
| 0.4 | 2026-10-08 | Team 6 | Synchronize design frames with specs 1.2-1.5 |
| 1.0 | 2026-10-09 | Team 6 | Submission edition: architecture, ER diagrams, API, AI and concurrency details |
| 1.1 | 2026-10-09 | Team 6 | Table of contents, frontend and backend class diagrams, AI answer sequence diagram, API request/response examples, design-pattern section, restructured to the course guideline |
| 1.2 | 2026-10-18 | Team 6 | DEV-68: bank transfer to the farm's account replaces the simulated card payment. `AWAITING_DEPOSIT` state, deposit deadline, producer deposit confirmation, refund settlement by the farm, farm bank account fields |
| 1.3 | 2026-10-18 | Team 6 | PostHog analytics in both web apps (DEV-71): US Cloud, screen events, purchase funnel up to the deposit report, masked session replay |

## 1. System Architecture

Farmclub is a client-server system. Two Expo web apps (consumer and producer) talk to one FastAPI server over REST/JSON. The server owns every business rule, permission check, database write and AI call. The two apps share a UI package and an API client package. This page describes the code on `main` (commit 8f2b8a5); product code has not changed since the I1 baseline 747f588.

![I1 architecture and external boundaries](images/i1-architecture.png)

Figure 1. Request and data flow. The call to Claude only happens when the server has an API key. Hosting and monitoring services at the bottom are the planned production setup.

| Component | Responsibility | Interface |
| --- | --- | --- |
| Consumer app | Discovery, checkout, orders, news rooms, private chat, order inquiries | REST/JSON through `packages/api` |
| Producer app | Approval gate, products and sales settings, dashboard, shipping, chat | Same server; separate account role and token storage |
| `packages/ui` | Design tokens and shared components (bars, chat, news room, story) | React Native components |
| `packages/api` | Typed endpoint functions, token storage, error mapping, demo (mock) transport | `fetch` with `Authorization: Bearer`; `ApiError` |
| FastAPI server | Routing, validation, access checks, transactions | `/api/...` resources; `/admin/...` capacity decisions |
| PostgreSQL | Accounts, catalog, orders, messages, private attachments, idempotency records | SQLAlchemy 2.0 + psycopg |
| AI adapter (`server/app/ai`) | Product draft extraction, story drafts, question answering | Anthropic SDK (Claude Haiku 4.5) with rule-based fallback |

### 1.1 External libraries

| Layer | Libraries | Notes |
| --- | --- | --- |
| Web clients | Expo, React Native, Expo Router, TypeScript | Two web builds |
| Server | FastAPI, Pydantic v2, pydantic-settings, Uvicorn | OpenAPI generated from routers and schemas |
| Database | SQLAlchemy 2.0, psycopg, Alembic, PostgreSQL 16 | Migrations 0001-0005 |
| Auth | PyJWT | I1 uses seeded test accounts; Kakao login is planned for I2 |
| AI | Anthropic SDK | Model `claude-haiku-4-5` |
| Images | python-multipart, image validation and EXIF removal | Private inquiry photos are stored in PostgreSQL in I1 |
| Analytics | posthog-js (`packages/analytics`) | Web apps only, on when a project key is set at build time (DEV-71) |
| Planned | Vercel (apps), Railway (server, DB), Cloudflare R2, PostHog server events, Sentry, Langfuse | Chosen in the stack; not wired up yet (see section 4) |

Exact versions are in `package-lock.json` and `server/uv.lock`.

### 1.2 Architectural decisions

| Decision | Why | What it means in the code |
| --- | --- | --- |
| Two web apps instead of one (ADR 0001/0010) | Consumers and producers do different jobs and need different permissions | Separate routes and token storage; the server still checks the role on every call |
| Client-server, all rules on the server | Payment, stock and order state must stay consistent across both apps | Apps never decide prices or stock; they show what the server returns |
| FastAPI modular backend (ADR 0007) | Typed requests and responses and generated API docs | One folder per domain with `router`, `schemas`, `service`, `models` |
| REST + polling, no WebSocket | Chat volume is small in I1 and REST is simpler to test | Open chat screens refresh every 2 seconds; no push delivery |
| PostgreSQL transactions and row locks | Two people must never buy the same last box | Payment locks the product and period allocation before checking stock |
| One AI adapter (ADR 0004) | Keep the API key and prompt details out of the rest of the code | Only `server/app/ai` calls the model; callers get structured results |
| Seeded test login (ADR 0009) | Reproduce every account state (pending, rejected, suspended) without real identities | Test accounts only, behind an explicit on/off flag |
| Operator API before operator UI (ADR 0008) | An operator screen is not needed to demo I1 | Capacity approval works through `/admin` and Swagger UI |
| Copy order data at payment | Later edits to a product or address must not change paid orders | Price, weight, address and delivery window are copied into `Order` |
| One domain, DNS on Cloudflare (ADR 0012) | Share links, Kakao login return addresses and the payment webhook all depend on fixed addresses | `farmclub.kr` serves the consumer app, `farm.farmclub.kr` the producer app and `api.farmclub.kr` the server. The consumer app proxies `/s/*` to the server, so farm links read `https://farmclub.kr/s/farms/{id}` (`SHARE_BASE_URL`) |

ADR 0002 (Django) was replaced by ADR 0007/0008.

## 2. Design Details

### 2.1 Frontend class diagram

Both apps are built from Expo Router screens. A screen loads data with the `useAsync` or `useLiveList` hook, calls an endpoint group from `packages/api`, and draws itself with components from `packages/ui`. The diagram shows the main classes and modules, not every file.

![Frontend class diagram](images/i1-frontend-class.png)

Figure 2. Frontend classes and modules. Arrows point from the caller to what it uses; the dashed arrow is used only in demo mode.

| Module | What it does |
| --- | --- |
| `configureApi(namespace)` | Each app calls it once with `consumer` or `producer`, so the two apps keep separate tokens in `localStorage` |
| `request<T>()` | Adds the bearer token, sends JSON, and turns error responses into `ApiError` (status, code, message, details) |
| `Endpoints` | One object per server domain (`auth`, `farms`, `catalog`, `orders`, `messaging`). Order creation and payment add an idempotency key automatically |
| `useAsync` | Loads screen data and keeps what is already shown if a reload fails |
| `useLiveList` | Polls an open chat or room every 2 seconds and merges new messages by ID |
| `UIComponents` | Shared layout and chat components so both apps look like one product |

### 2.2 Backend class diagram

The server is split into domain modules. Each module has a `router` (HTTP and permission checks), `schemas` (Pydantic request/response models), `service` (business logic as functions) and `models` (SQLAlchemy tables). Modules call each other only through service functions. `core` holds shared infrastructure.

![Backend class diagram](images/i1-backend-class.png)

Figure 3. Backend domain modules and their main service functions. Arrows point from the caller to the module it calls.

| Module | Main tables it owns | Talks to |
| --- | --- | --- |
| `core` | `IdempotencyRecord` | Used by every module |
| `accounts` | `User`, `ShippingAddress` | `farms` for producer applications |
| `farms` | `Farm`, `Follow`, `FarmAiSettings`, `FarmAiSettingsHistory` | `catalog` for product summaries, `ai` for story drafts and previews |
| `catalog` | `Product`, `ProductOption`, `Stage`, `StagePrice`, `StageAllocation`, `CapacityRequest`, `ProductDraft` | `orders` for usage, `ai` for draft extraction |
| `orders` | `Order`, `Payment` | `catalog` for locks and allocation, `messaging` for inquiries |
| `messaging` | `Broadcast`, `Reaction`, `RoomReply`, `Thread`, `ThreadMessage`, `Escalation`, `OrderInquiry`, `PrivateAttachment` | `farms`, `orders`, `ai` |
| `ai` | None (stateless) | Returns structured results; the caller saves them |

When one action touches several modules (for example, payment updates `Order`, `Payment` and `StageAllocation`), the services share one SQLAlchemy session so everything commits or rolls back together.

### 2.3 Database model

#### Accounts and commerce

![Account and commerce ER diagram](images/i1-commerce-erd.png)

Figure 4. PK = primary key, FK = foreign key, UK = unique constraint. Timestamps and display-only fields are left out.

| Table | Key data | Keys and relationships |
| --- | --- | --- |
| `User` | Role (consumer or producer), test-account flag, name, phone | String PK; one role per account |
| `ShippingAddress` | Recipient, phone, address, default flag | User 1:N; orders copy the values |
| `Farm` | Owner, approval status and reason, profile, story blocks (JSON) | UK producer_id; user 1:0..1 farm |
| `Follow` | Consumer, farm, created time | PK (consumer_id, farm_id) blocks duplicate follows |
| `Product` | Farm, quality, delivery window, fees, status, capacity, version, story blocks | Farm 1:N |
| `ProductOption` | Weight in kg, label, sort order | PK (product_id, id) |
| `Stage` | Start and end date (inclusive), order | Product 1:N |
| `StagePrice` / `StageAllocation` | Price; box quantity and reserved count | PK (stage_id, option_id) |
| `CapacityRequest` | Initial or increase, requested grams, decision, status, version | Product 1:N history |
| `Order` | Buyer, product, option, period, quantity, copied price/weight/address, consents, status | UK order_no |
| `Payment` | Method (BANK_TRANSFER), provider (FARM_ACCOUNT), amount, status, confirmation time | UK order_id; order 1:0..1. Created when the producer or an operator confirms the deposit (DEV-68) |
| `ProductDraft` | Pasted text, extracted fields, missing fields, failed flag | Farm-owned |
| `IdempotencyRecord` | User, scope, key, body hash, stored response | UK (user_id, scope, key); kept 24 hours |

#### Communication

![Communication ER diagram](images/i1-messaging-erd.png)

Figure 5. News (broadcasts and room replies) and 1:1 chat (threads) are stored separately. Some links, such as an attachment's order or thread, are checked in the service instead of by a database FK.

| Table | Key data and constraints |
| --- | --- |
| `Broadcast` | Farm, text, media URLs, PUBLIC or FOLLOWERS, like count |
| `Reaction` | PK (broadcast_id, user_id): one like per person per post |
| `RoomReply` | Farm, consumer, masked text; only that consumer and the farm can read it |
| `Thread` | UK (farm_id, consumer_id); AUTO or HUMAN mode, mode version, read positions |
| `ThreadMessage` | Thread, increasing sequence number, sender type, masked text, attachments, AI evidence, handoff state |
| `Escalation` | Question handed to the producer: reason, OPEN or ANSWERED, reply |
| `FarmAiSettings` / `FarmAiSettingsHistory` | On/off, version, guidelines, FAQs, handoff topics, and each saved version |
| `OrderInquiry` | Order, thread, problem type, OPEN or RESOLVED, version |
| `PrivateAttachment` | Uploader, order or thread, MIME type, bytes, bound flag |

#### Rules the data must keep

- Money is an integer in won. Supply limits and the weight copied into an order are integers in grams; `ProductOption` keeps `weight_kg` for display.
- `reservedGrams + shippedGrams <= salesLimitGrams <= approvedSupplyGrams`. Usage is calculated from paid orders, their `unit_weight_grams` and `released_quantity`.
- A paid order holds `max(0, quantity - released_quantity)` boxes. `shipped_at` decides whether that weight counts as reserved or shipped.
- `StageAllocation` adds a separate box limit per period and option.
- A refund after shipping never gives capacity back.
- Period dates are inclusive and in KST. `FIXED_NOW` pins the clock for demos and tests.

| Migration | Adds |
| --- | --- |
| 0001 | Accounts, farms, catalog and orders |
| 0002 | Messaging: rooms and threads |
| 0003 | AI settings, order inquiries, private attachments |
| 0004 | Weight-based supply and capacity requests |
| 0005 | Farm and product story content |

### 2.4 API specification

#### Common rules

- App endpoints are under `/api`; operator capacity decisions are under `/admin/products`. `GET /health` and `GET /openapi.json` are at the root, and Swagger UI is at `/docs`.
- JSON fields are camelCase. Protected endpoints need `Authorization: Bearer <token>`.
- Errors always look like `{ "code", "message", "details" }`: 400 `VALIDATION_ERROR`, 401 not logged in, 403 `FORBIDDEN` (with `details.reason = WRONG_APP` for the other app's account), 404 not found or hidden, 409 `CONFLICT` with a reason such as `STAGE_CHANGED`, `SOLD_OUT`, `INVALID_TRANSITION`, `STALE_VERSION` or `IDEMPOTENCY_MISMATCH`.
- Lists use `limit` (default 20, max 50) and an opaque `cursor`, and return `{ items, nextCursor }`.
- Order creation, payment and versioned edits require an `Idempotency-Key` header.

#### Example: create an order and pay

`POST /api/orders` (consumer, `Idempotency-Key` required)

```json
{
  "productId": "p-house",
  "optionId": "opt-5",
  "quantity": 1,
  "recipientName": "Kim Minji",
  "recipientPhone": "010-0000-0000",
  "postalCode": "04001",
  "address": "Seoul, Mapo-gu ...",
  "addressDetail": "302",
  "deliveryNote": "Leave at the door",
  "consents": { "deliveryWindow": true, "delayRefund": true, "shortage": true, "cancelPolicy": true },
  "consentVersion": "2026-10-07",
  "saveAddress": true
}
```

Response `200`: an unpaid order with the server's price.

```json
{
  "orderId": "o-...",
  "orderNo": "FC-1007-4831",
  "status": "PENDING_PAYMENT",
  "quantity": 1,
  "unitPrice": 29000,
  "shippingFee": 0,
  "remoteAreaFee": 0,
  "totalAmount": 29000,
  "deliveryWindow": { "start": "2026-11-10", "end": "2026-11-20" }
}
```

`POST /api/orders/{orderId}/deposit` (idempotency key required) takes the stock and returns the same order with `status: "AWAITING_DEPOSIT"`, `depositAccount` (bank, account number, holder), `sellerInfo`, and `depositDueAt` 24 hours later. The producer later calls `POST /api/orders/{orderId}/confirm-deposit`, which sets `RESERVED` and the payment date (DEV-68). If the period or price changed, or the last box was just sold, the deposit request returns:

```json
{ "code": "CONFLICT", "message": "이 단계 물량이 다 팔렸어요.", "details": { "reason": "SOLD_OUT", "productId": "p-house" } }
```

#### Example: AI product draft

`POST /api/products/drafts` (approved producer) with `{ "inputText": "[강씨네 귤밭] 올해 하우스 감귤 ... 5키로 3만원" }` returns the extracted fields, a `missingFields` list and a `failed` flag. A price in the text is never copied into the draft. If the model fails or times out, `failed` is true and the producer fills in the product by hand.

#### Example: log in with a test account

`POST /api/auth/test-login` (only when test login is on)

```json
{ "userId": "u-minji", "app": "consumer" }
```

Response `200`: `{ "accessToken": "<JWT>", "user": { "userId": "u-minji", "name": "김민지", "role": "CONSUMER", ... } }`. Logging in to the producer app with a consumer account returns 403 with `details.reason = "WRONG_APP"`.

#### Example: ask a farm a question

`POST /api/messaging/chats/f-kang/messages` (consumer who follows the farm, or has a paid order with it)

```json
{ "text": "배송은 언제예요?", "attachmentIds": [], "orderId": null }
```

Response `200` when AI answers:

```json
{
  "message": { "messageId": "m-...", "senderType": "CONSUMER", "body": "배송은 언제예요?", "masked": false, "handoffStatus": null },
  "reply": { "messageId": "m-...", "senderType": "AI", "body": "11월 10일~20일 사이에 도착해요.", "sourceSummary": "Product delivery window", "needsHuman": false }
}
```

For a handoff topic (for example "농약은 얼마나 치세요?") the question is saved with `"handoffStatus": "FORWARDED"` and `reply` is `null`; the producer sees it under Needs reply. If the farm has AI off or the producer has taken over, `reply` is also `null`.

#### Example: ship an order

`POST /api/orders/{orderId}/ship` (owning producer)

```json
{ "carrier": "CJ", "trackingNumber": "123-456" }
```

Response `200`: the order with `"status": "SHIPPED"`, the ship time, carrier and tracking number. Shipping an order that is not `PREPARING` returns 409 with `details.reason = "INVALID_TRANSITION"`.

#### Endpoint groups

Paths use `{id}` as a placeholder.

| Method and path | Caller | Purpose |
| --- | --- | --- |
| GET /api/auth/test-accounts · POST /api/auth/test-login | Anyone, when test login is on | Account list for the app; login returns a JWT |
| GET /api/auth/me | Logged in | Current account |
| GET · POST /api/auth/producer-application | Producer | Read or submit the farm application |
| GET · POST · PATCH · DELETE /api/auth/me/addresses | Consumer | Address book |
| GET /api/home · GET /api/farms · GET /api/farms/{id} | Anyone | Home, farm list, farm page |
| PUT · DELETE /api/farms/{id}/follow | Consumer | Follow and unfollow |
| GET · PATCH /api/farms/me | Farm owner | Own profile and story |
| GET · PUT /api/farms/me/ai-settings · POST .../preview | Farm owner | AI settings and preview |
| GET /api/products/{id} | Anyone | Published product |
| GET /api/products/mine · POST /api/products/drafts · POST /api/products | Approved producer | Own products, AI draft, new product |
| PATCH /api/products/{id} · PUT /api/products/{id}/stages · PUT .../sales-settings | Owner | Edit product, periods and prices, sales limit and pause |
| GET · POST /api/products/{id}/capacity-requests · POST .../{requestId}/withdraw | Owner | Supply requests |
| POST /admin/products/{id}/capacity-requests/{requestId}/approve · .../reject | Operator | Approve or reject supply |
| POST /api/orders · POST /api/orders/{id}/deposit · POST .../deposit-reported | Consumer | Create order, request deposit instructions (takes stock), report the deposit |
| POST /api/orders/{id}/confirm-deposit · POST .../refund-settled | Approved producer (own farm) | Confirm a deposit, mark a refund as sent |
| POST /admin/orders/{id}/confirm-deposit · POST /admin/orders/expire-deposits | Operator | Confirm on behalf of a farm, expire overdue deposits |
| GET /admin/farms · GET .../{id}/preview · POST .../{id}/retire · .../restore | Operator | Hide a test farm from every public screen or show it again; refused when a non-test consumer has ordered (DEV-98) |
| GET /api/orders · GET /api/orders/{id} | Order owner | History and detail |
| POST /api/orders/{id}/cancel · .../confirm · .../delivery-window-response | Order owner | Cancel, confirm receipt, answer a window change |
| GET /api/orders/producer/dashboard · GET /api/orders/producer | Approved producer | Dashboard and orders to ship |
| POST /api/orders/producer/harvest-start · POST /api/orders/{id}/ship | Owning producer | RESERVED → PREPARING → SHIPPED |
| GET · POST /api/messaging/rooms/{farmId}/messages · POST /api/messaging/news | Follower / owner | Room page, private reply, broadcast |
| PUT · DELETE /api/messaging/news/{id}/reaction | Consumer | Like and unlike |
| GET · POST /api/messaging/chats · .../chats/{farmId}/messages | Consumer | Chat list, start, history, send; AI message rows include server-derived `reported` |
| POST /api/messaging/chats/{farmId}/messages/{messageId}/report | Owning consumer | Report an AI answer as an open `WRONG_ANSWER` escalation; duplicate reports return the existing escalation |
| GET · POST /api/messaging/producer/chats/{consumerId}/messages · PUT .../ai-mode | Owning producer | AI message rows include server-derived `reported`; reply; switch AUTO or HUMAN |
| POST /api/orders/{id}/inquiries | Paid-order owner | Order problem inquiry |
| POST /api/messaging/attachments · GET .../{id} | Participants | Upload and read a private photo |

Room lists, read positions, question lists and inquiry status endpoints are also available; the full list is in OpenAPI at `/docs`.

### 2.5 Key flows

#### Reservation and payment

![Reservation and payment sequence](images/i1-payment-flow.png)

Figure 6. Checkout creates an unpaid order without holding stock. Stock is taken when the deposit instructions are issued, and the order becomes reserved when the producer confirms the deposit (DEV-68; the figure still shows the earlier card step).

1. The consumer picks an option and quantity and accepts four consents.
2. `POST /api/orders` checks the current period, price, limits and address, and copies them into a `PENDING_PAYMENT` order.
3. `POST /api/orders/{id}/deposit` locks the product and period allocation, checks the order against the current terms and the farm's bank account, takes the stock and sets `AWAITING_DEPOSIT` with a deadline 24 hours later.
4. If the period or price changed or stock ran out, it returns 409 and the app asks the user to confirm again.
5. The consumer transfers the amount to the farm's account with the order number as the depositor name. `POST .../deposit-reported` only records a hint.
6. `POST /api/orders/{id}/confirm-deposit` (producer of that farm, or the operator route) records `Payment`, sets `RESERVED` and the payment date. Overdue orders are canceled and their stock released when they are loaded or when the operator runs `expire-deposits`.
7. Sending the deposit request again with the same key returns the saved result, so stock is never taken twice.

#### Order states

| From | Action | To | Stock |
| --- | --- | --- | --- |
| PENDING_PAYMENT | Deposit instructions issued | AWAITING_DEPOSIT | Boxes and weight reserved |
| AWAITING_DEPOSIT | Producer or operator confirms the deposit | RESERVED | No change |
| AWAITING_DEPOSIT | Consumer cancels, or the 24-hour deadline passes | CANCELED | Quantity released once, no refund |
| RESERVED | Existing harvest API (not exposed in v6 UI; no automatic transition) | PREPARING | No change |
| RESERVED / PREPARING | Consumer cancels | REFUNDED | Unshipped quantity released once |
| PREPARING | Producer ships | SHIPPED | Weight moves from reserved to shipped |
| SHIPPED | Delivery confirmed | DELIVERED | No change (operator/courier step, not in the I1 operator API) |
| DELIVERED | Consumer confirms receipt | COMPLETED | No change |

- Any other transition is rejected with `INVALID_TRANSITION`.
- Shipping several orders at once calls the ship endpoint once per order; it is not one bulk transaction.
- Refunds are sent by the farm to the account the buyer paid from; the producer marks them settled (`Refund.settledAt`). Every refund path writes a `Refund` history row and updates `Payment.status`. A partial refund leaves `Order.status`, its refund fields, and fulfillment unchanged; only a final full refund marks the order refunded and releases unshipped stock once.

### 2.6 AI components

#### Product draft and story draft

1. The producer sends text through a farm or catalog endpoint.
2. `strip_personal_info()` removes phone numbers and account numbers. Prices and dates stay in sales settings, never in generated text.
3. `draft_product()` asks Claude for a fixed JSON schema. No key, invalid output or a timeout returns a failed draft so the producer can fill it in by hand (N-04, 20-second budget).
4. `detail_draft()` builds a rule-based story from the farm's own data first, then asks Claude to improve it when a key is set. Output blocks and chosen photo URLs are validated. The response says `mode: ai` or `mode: mock`.
5. Nothing is published until the producer saves.

#### Question answering and handoff

![AI question answering sequence](images/i1-ai-answer-sequence.png)

Figure 7. What happens when a consumer sends a 1:1 question. The thread row stays locked until the answer or handoff is saved.

1. Check that the farm has AI on and the thread is AUTO.
2. Questions on fixed handoff topics go straight to the producer: pesticide and growing claims, refunds, compensation, subjective taste, damage, delivery promises.
3. Simple facts are answered by rules first: delivery window and fee, measured or expected sweetness, FAQ, policy text.
4. Otherwise Claude is called with selected evidence only. Shipping details and private photos are never sent.
5. The model returns ANSWER or HANDOFF. No key, a model error or weak evidence means HANDOFF.
6. Before saving the answer, the service checks that the thread mode and AI settings version have not changed. A producer reply switches the thread to HUMAN; turning AUTO back on only affects later messages.

The answer is generated inside the request while the thread row is locked. This keeps ordering simple in I1, but a slow model call makes the request slower. Moving it to a background worker is a candidate for a later iteration.

### 2.7 Implementation decisions

| Problem | What we do | Why |
| --- | --- | --- |
| Two buyers, one box left | Lock the product, then the period/option allocation, then recheck usage | Only one payment can take the last box |
| Product edits after payment | Copy unit price and unit weight into `Order` | Paid orders never change |
| Cancel pressed twice | `released_quantity` and `shipped_at` guard the release | Stock is given back once, and never after shipping |
| Two people editing the same product or settings | Version number on product, capacity request and AI settings | The second save gets `STALE_VERSION` instead of overwriting |
| Retried requests | Store user + scope + key, a hash of the body, and the response | Same request gets the same answer; a changed body is rejected |
| Old idempotency records | Kept 24 hours, cleaned up when touched | Keeps the table small |
| Late AI answer after the producer takes over | Thread lock plus mode and settings versions | A stale AI answer is never saved |
| Message order in chat | Unique sequence number per thread | Stable read positions and page merging |
| Privacy in rooms | Filter by viewer before paging and previews | Other buyers' replies never leak into counts or previews |
| Private photos | MIME and size checks, EXIF removed, served only after an access check, unbound files expire after 24 hours | Inquiry photos stay between buyer and farm |
| Chat updates | Poll every 2 seconds on open screens only | Simple and enough for I1 traffic; no socket server to run |

## 3. Design Patterns

Detailed write-ups are due in Iteration 5. Patterns already in the code that we plan to document:

- **Adapter:** `server/app/ai` hides the Anthropic SDK behind `draft_product()`, `detail_draft()` and `answer_question()`, with a rule-based fallback.
- **Service layer:** routers only validate and check permissions; business logic lives in each module's `service.py`.
- **Idempotency key:** `core/idempotency.py` replays a stored response for a repeated request.
- **Optimistic concurrency:** version numbers on products, capacity requests and AI settings.
- **Snapshot:** orders copy price, weight and address at payment time.

## 4. Implementation Status

Working in I1 against the real server: reservation, simulated payment, fulfillment, capacity approval, private messaging, AI settings, order inquiries and farm stories.

Not built yet:

| Planned | Current state |
| --- | --- |
| Dedicated operator UI | Approval, delivery, refund-history and exception-recovery APIs exist; a dedicated UI is not assigned |
| Automatic purchase confirmation after 8 days, scheduled refunds | No scheduler yet |
| Cloudflare R2 for private photos | Public media (farm, product, news and detail photos, news video) is uploaded with `POST /api/media` and stored in R2 (DEV-102). Private chat and inquiry photos are still stored in PostgreSQL (DEV-103) |
| PostHog | The two web apps send page views, the purchase funnel (product → order form → deposit instructions → "I've paid": `product_viewed` → `checkout_started` → `checkout_submitted` → `deposit_reported`), session replays and heatmaps to PostHog US Cloud when the `APP_POSTHOG_KEY` build variable is set. Users are identified only by internal user ID. Replays mask every input, all text on checkout, deposit instructions, order, chat, account and the producer's bank account screens, plus chat and news message areas and the bank account row on the farm profile; network and console are not recorded. Server events (`order_paid` etc.) are not connected yet |
| Sentry, Langfuse | Chosen in the stack; not connected |
| Producer-specific remote delivery areas | Uses an example postal-code rule |

## 5. Running Locally and Source Map

### 5.1 Setup

1. Node.js from `.nvmrc` with npm workspaces; Python 3.12 with uv; PostgreSQL 16 from `server/docker-compose.yml`.
2. Server: `uv sync`, `docker compose up -d`, `uv run alembic upgrade head`.
3. Demo data (local database only): `uv run python -m app.core.seed --reset`.
4. Set `MOCK_LOGIN_ENABLED=true` and `FIXED_NOW=2026-10-07T10:00:00+09:00` for the seeded scenario.
5. Start the server from `server/`: `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`.
6. Start each app with `EXPO_PUBLIC_API_MOCK=0`, `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` and no `EXPO_PUBLIC_SHARED_MOCK_URL`, on ports 8081 and 8082.
7. Outside local runs, set `JWT_SECRET`. An Anthropic key is only needed for real AI generation. Never commit secrets.

### 5.2 Where to look in the code

| Topic | Files |
| --- | --- |
| Routers and CORS | `server/app/main.py` |
| Login and roles | `server/app/core/security.py`, `server/app/accounts/router.py` |
| Orders, stock and capacity | `server/app/orders/service.py`, `server/app/catalog/service.py` |
| Idempotency and errors | `server/app/core/idempotency.py`, `server/app/core/errors.py` |
| Chat, privacy and attachments | `server/app/messaging/service.py`, `server/app/messaging/models.py` |
| AI | `server/app/ai/service.py` |
| Database | `server/app/*/models.py`, `server/migrations/versions/0001-0005` |
| Frontend API client | `packages/api/src/client.ts`, `packages/api/src/endpoints.ts` |
| Shared UI | `packages/ui/src/` |
| Screen designs | `docs/design/README.md`, `docs/design/screens/` |

Product behavior is defined in [docs/spec](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/main/docs/spec).

## UI 1.6 implementation decisions (DEV-51)

- Shared `Storefront` components provide independently scrolling news/product carousels, same-option comparison prices, product shelves, chat choices, and brand headers. Pretendard and orange remain; type sizes are 28/22/17/15/13px, metrics 40px, with 48px minimum targets.
- `/farms/:id` and legacy `/news/:id` render the same consumer room. Short information is at `/farms/:id/info`. Room replies stay in the room; authorization, cursor paging, polling and retry keys remain unchanged.
- Product detail moves into the tab layout without changing `/products/:id`. Purchase actions sit above the fixed 72px tabs. Existing detail blocks render at original image aspect ratio. No live content is replaced with the demo sample.
- The producer chat tab embeds its own room directly; it starts with the shelf collapsed, while consumers start expanded. Collapsing preserves the composer. The broadcast notice scrolls with messages. Hidden own-room polling stops in private-chat view.
- Dashboard counters aggregate all order pages. Reserved orders are read-only. Invoice editing and shipping use the existing preparing-order flow. No server, order-state or approval changes are introduced.


## Approved brand assets (DEV-85)

The consumer home uses the FARM CLUB wordmark beside the existing search action. The producer dashboard uses the standalone symbol beside its title at the approved original size (36×40 px). Producer login removes the upper wordmark and places the full logo beside its two-line heading. The approved 30/32 px heading and 172×129 px logo align the visible FARM/CLUB lines using a −16/−10 px optical offset; the image scales proportionally on narrower screens. Kakao/test-account login and account-state routing remain unchanged. Four original transparent PNGs live in `packages/ui/assets/brand/`; the portable static review is in `docs/design/brand-review/index.html`.
