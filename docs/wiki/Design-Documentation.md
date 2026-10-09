# Design Documentation

Team 6 | Farmclub | Iteration 1 | 9 October 2026

## Document Revision History

| Version | Date | Author | Major changes |
| --- | --- | --- | --- |
| 0.1 | 2026-10-07 | Team 6 | Initial sitemaps, flows, data model and order states |
| 0.2 | 2026-10-07 | Team 6 | Replace Django plan with FastAPI and operator API (ADR 0007/0008) |
| 0.3 | 2026-10-07 | Team 6 | Separate accounts, screen/state details and seed contracts |
| 0.4 | 2026-10-08 | Team 6 | Synchronize design frames with specs 1.2-1.5 |
| 1.0 | 2026-10-09 | Team 6 | Submission edition: architecture, ER diagrams, API, AI and concurrency details; distinguish implementation from planned integrations |

## 1. System Architecture

### 1.1 Baseline and architecture

This edition describes source commit **747f588**, including the backend and DEV-6 integration work. Farmclub uses two Expo web clients and one synchronous FastAPI application with PostgreSQL. The backend owns authorization, transaction rules, persistence and AI calls. The clients share visual components and an API package.

![I1 architecture and external boundaries](images/i1-architecture.png)

Figure 1. Arrows show the implemented local request/data path. The Claude path is conditional on server credentials. Deployment/observability items in the footer are planned architecture, not verified operational services.

| Component | Responsibility | Boundary / interface |
| --- | --- | --- |
| Consumer app | Discovery, checkout, orders, rooms, private chat and inquiries | REST/JSON through shared API package |
| Producer app | Approval gate, product/sales setup, dashboard, shipping and support | Same server, separate role and token namespace |
| Shared UI | Tokens, reusable controls, layouts and interaction patterns | React Native components |
| Shared API client | Typed endpoint wrappers, token storage, error mapping, real/Mock transport | fetch; Authorization bearer token; ApiError |
| FastAPI | Routing, validation, access checks and transaction orchestration | /api resources; /admin capacity endpoints |
| PostgreSQL | Accounts, catalog, orders, messages, private attachment bytes and idempotency | SQLAlchemy sessions and psycopg |
| AI adapter | Draft extraction, detail generation and question answering | Anthropic SDK, with rules/fallbacks described in section 5 |

### 1.2 Stack and deployment status

| Layer | Implemented dependency / mechanism | Status |
| --- | --- | --- |
| Web clients | Expo, React Native, Expo Router, TypeScript | Two web outputs |
| API | FastAPI, Pydantic v2, pydantic-settings, Uvicorn | Local real API implemented |
| Persistence | SQLAlchemy, psycopg, PostgreSQL 16 | Alembic revisions 0001-0005 |
| Authentication | PyJWT, seeded users, role dependencies | Mock-login flag defaults OFF |
| AI | Anthropic SDK; configured model claude-haiku-4-5 | Conditional external call; deterministic and failure paths supported |
| Private images | python-multipart, format validation and EXIF sanitization | Bytes stored in PostgreSQL in I1 |
| Hosting target | Vercel for clients; Railway for server/database | Intended deployment topology; no live deployment claim here |
| Object storage | Cloudflare R2 / boto3 in the architecture plan | No R2 adapter in this inspected backend |
| Observability | PostHog, Sentry and Langfuse in the stack plan | Analytics module is a scaffold; no completed SDK wiring established |
| Payments | Payment rows with MOCK provider | No real payment gateway integration |

Dependency manifests and lockfiles define exact installed versions. This table distinguishes a design choice from an operational integration.

### 1.3 Decisions and rationale

| Decision | Reason | Implementation consequence |
| --- | --- | --- |
| Two web apps (ADR 0001/0010) | Distinct consumer/producer tasks and permissions | Separate routes and token namespaces; server still checks roles |
| FastAPI modular backend (ADR 0007) | Typed requests/responses and generated OpenAPI | Domain routers, schemas, services and models |
| REST and polling | Existing clients use request/response resources; no WebSocket implementation | Focused screens refresh and merge responses; no push delivery guarantee |
| PostgreSQL transactions | Payment, capacity and order state must remain consistent | Row locks and transactional changes |
| Shared AI adapter (ADR 0004) | Keep provider details and credentials out of UI/domain callers | One module controls generation, validation and fallback |
| Mock login (ADR 0009) | Reproduce role/approval states without external identities | Seed accounts only; explicit enable flag; no admin in selectable demo accounts |
| Operator API first (ADR 0008) | Avoid building an operator UI in I1 | Capacity approvals are implemented; other operator functions remain gaps |
| Order snapshots | Later product/address edits must not rewrite paid history | Copy price, weight, address and delivery fields into Order |

The historical Django decision (ADR 0002) is superseded by ADR 0007/0008. Kakao authentication remains a later-iteration decision, not the current login mechanism.

## 2. Component and Interaction Design

### 2.1 Frontend organization

| Area | Responsibility |
| --- | --- |
| apps/consumer | Expo Router screens for discovery, login, checkout, orders, Chat and Me |
| apps/producer | Login/application gates, dashboard, products, Chat and Settings |
| packages/ui | Shared design tokens and presentational components |
| packages/api | Client configuration, endpoint wrappers, API types, pagination and local Mock implementation |

- Each app configures its own storage namespace. Tokens persist in browser localStorage and are attached by the API client.
- EXPO_PUBLIC_API_MOCK=1 selects demo behavior. The shared Mock URL, when present, takes precedence over the normal API URL.
- For a real-backend run, disable Mock mode **and unset EXPO_PUBLIC_SHARED_MOCK_URL**; then set EXPO_PUBLIC_API_URL to FastAPI.
- The typed API layer is maintained in the repository. Do not describe it as automatically generated merely because FastAPI exposes OpenAPI.
- UI errors use the structured error message/reason; failed saves and sends retain local input.
- Role changes, logout and follow changes invalidate inaccessible room content rather than leaving stale private content visible.

### 2.2 Navigation and states

| Consumer tabs | Producer tabs |
| --- | --- |
| Discover | Dashboard |
| My Orders | Products |
| Chat: News Rooms / 1:1 | Chat: own room / 1:1 |
| Me | Settings: farm profile/link, AI settings, logout |

- **Orders:** Confirmed = COMPLETED; Unconfirmed = RESERVED/PREPARING/SHIPPED/DELIVERED; Canceled-Refunded = CANCELED/REFUNDED/PARTIALLY_REFUNDED. Exclude PENDING_PAYMENT. Preserve filter across detail/login return.
- **Products:** Selling, Under review, Draft, Paused and Ended are mutually exclusive presentation groups. Initial approval belongs under review; a pending increase stays in its current group.
- **Farm page:** Profile and actions, product list, then story blocks. News lives in its room rather than an inline farm-news tab.
- **Producer posting:** Entry is the own-farm room. Attached-media success returns to that room.
- **Layout:** 48px hit areas; 17px body, 16px inputs, 15px secondary text; 4px spacing grid; desktop content width capped at 480px.
- **Recovery:** Preserve edits on server failure; confirm replacement/unsaved exit; display stale-version conflicts; do not silently overwrite newer data.

### 2.3 Backend modules

| Module | Main responsibility | Collaborations |
| --- | --- | --- |
| core | Settings, DB session/Base, clock, IDs, JWT dependencies, error envelope, pagination, idempotency, masking/images | Shared infrastructure |
| accounts | Seed login, producer application state, saved addresses | Farm application/profile |
| farms | Public/owner profiles, follow, home, AI settings and story drafts | Catalog summary; AI preview/generation |
| catalog | Products/options/periods, supply requests, sales edits and product drafts | Orders for usage; AI for extraction |
| orders | Checkout/payment/cancellation, snapshots, dashboard, harvest/shipping and confirmation | Catalog locks/allocation; messaging inquiry entry |
| messaging | Broadcasts, private replies/chats, unread state, handoff, inquiries/attachments | Farms for permission/settings; orders for ownership; AI evidence |
| ai | Stateless model/rule adapter | Returns structured results; callers persist them |
| analytics | Intended event boundary | Scaffold in this baseline |

Routers validate inputs and dependencies, then call services. Cross-domain access is exposed through service functions. Services share a SQLAlchemy session where one transaction must cover multiple resources.

### 2.4 Reservation and payment sequence

![Reservation and payment sequence](images/i1-payment-flow.png)

Figure 2. Checkout creates an unpaid snapshot without holding stock. Payment is the point at which availability is rechecked and allocation is consumed.

1. The consumer selects an option/quantity and accepts four consents.
2. POST /api/orders validates ownership context, current period, price, limits and address; copies fields into PENDING_PAYMENT.
3. POST /api/orders/{id}/pay rechecks the order and current terms using the product/allocation lock.
4. A changed period/price or unavailable supply returns a conflict for reconfirmation; mock failure leaves allocation unchanged.
5. Success records Payment, paid_at and RESERVED and consumes quantity atomically.
6. Retrying an identical request/key returns its stored result rather than charging or allocating again.

### 2.5 Fulfillment and cancellation

| From | Action | To | Capacity effect |
| --- | --- | --- | --- |
| PENDING_PAYMENT | Successful mock payment | RESERVED | Reserve boxes and their weight |
| RESERVED | Producer starts harvest | PREPARING | No release |
| RESERVED / PREPARING | Consumer cancels | REFUNDED | Release eligible unshipped quantity once |
| PREPARING | Producer confirms shipment | SHIPPED | Weight moves from reserved to shipped; stays consumed |
| SHIPPED | Delivery confirmation | DELIVERED | Intended operator/courier transition; not exposed by baseline operator API |
| DELIVERED | Consumer confirms | COMPLETED | No release |

- State changes outside authorized transitions are rejected.
- Bulk shipment UI repeats the per-order ship call; it is not one atomic bulk transaction.
- Refund status/reason/time are stored on Order and the payment state. There is **no separate Refund table** in this baseline.
- Eight-day automatic confirmation, suspension-triggered refunds and operational refund jobs are product requirements without a corresponding scheduler/operator implementation here.
- Seeded delivered/refunded examples are not evidence that all transitions have operational endpoints.

## 3. Data Design

### 3.1 Account and commerce schema

![Account and commerce ER diagram](images/i1-commerce-erd.png)

Figure 3. Implemented tables and their principal cardinalities. PK = primary key, FK = foreign key, UK = unique constraint. Optional child rows are shown as 0..N or 0..1. The diagram omits routine timestamps and display fields.

| Entity | Important stored data | Key / relationship |
| --- | --- | --- |
| User | Role, test-account flag, name/phone, optional Kakao ID | String PK; unique (kakao_id, role) |
| ShippingAddress | Recipient and full address, default flag | User 1:N addresses; Order copies values |
| Farm | Producer, approval status/reason, profile and detail JSON | Unique producer_id; user 1:0..1 farm |
| Follow | Consumer/farm IDs and creation time | Composite PK prevents duplicate follows |
| Product | Farm, quality, delivery, fees, status, capacity, version and detail JSON | Farm 1:N products |
| ProductOption | Option ID, weight_kg, label and sort order | Composite PK (product_id, id) |
| Stage | Product, inclusive start/end dates and sort sequence | Product 1:N periods |
| StagePrice / StageAllocation | Price; box quantity/reserved_count | PK (stage_id, option_id); composite option FK includes product_id |
| CapacityRequest | Kind, requested_total_grams, decision/status/version | Product 1:N history entries |
| Order | Buyer, product/option/period, quantity, price/weight/address snapshots, consent, state | Composite option FK; unique order_no |
| Payment | Order, method/provider, amount, status/time | Unique order_id: order 1:0..1 payment |
| ProductDraft | Original input, structured output, missing fields and failure flag | Farm-owned draft records |
| IdempotencyRecord | User, scope, key, body hash, result/status and timestamp | UK (user_id, scope, key); 24-hour retention |

### 3.2 Communication schema

![Communication ER diagram](images/i1-messaging-erd.png)

Figure 4. Broadcasts/room replies are separate from Thread/ThreadMessage. Attachment order/thread references are checked by services; not every logical link is a database FK.

| Entity | Data and constraint |
| --- | --- |
| Broadcast | Farm, body/media URLs, PUBLIC/FOLLOWERS visibility and reaction count |
| Reaction | Composite PK (broadcast_id, user_id); one like per accessible broadcast/user |
| RoomReply | Farm and consumer FKs, masked text and timestamp; own-consumer visibility |
| Thread | UK (farm_id, consumer_id); AUTO/HUMAN, mode version and per-role read positions |
| ThreadMessage | Thread FK, monotonic unique sequence, sender type, masked body, attachments, evidence and handoff state |
| Escalation | Thread/message FKs, reason/question, OPEN/ANSWERED and producer response |
| FarmAiSettings | Farm PK, enabled, version, policies, FAQs and handoff topics |
| FarmAiSettingsHistory | Farm/version snapshot, saving user and timestamp |
| OrderInquiry | Order/thread/message FKs, problem type, OPEN/RESOLVED and version |
| PrivateAttachment | Uploader FK, logical order/thread context, MIME, bytes, bound flag and timestamp |

### 3.3 Invariants and units

- Money is stored as integer KRW. Capacity limits and order unit-weight snapshots use integer grams; ProductOption retains weight_kg.
- Product capacity usage is derived from paid orders, their unit_weight_grams and released_quantity.
- A paid order's allocated quantity is max(0, quantity - released_quantity). shipped_at determines whether that weight is reserved or shipped.
- **reservedGrams + shippedGrams <= salesLimitGrams <= approvedSupplyGrams**.
- StageAllocation enforces a separate box limit for a period/option.
- A post-shipping refund never releases capacity merely because its status changed.
- Existing order addresses do not reference mutable ShippingAddress rows.
- Period start/end are inclusive KST dates; business clock helpers use FIXED_NOW only for controlled demos/tests.

### 3.4 Schema evolution

| Revision | Purpose |
| --- | --- |
| 0001 | Initial accounts, farm, catalog and order model |
| 0002 | Messaging and room/thread structures |
| 0003 | AI settings, order inquiries and private attachments |
| 0004 | Weight-based supply/capacity requests and order accounting |
| 0005 | Farm/product detail content |

Use Alembic migrations for an existing database. Do not infer approved supply from legacy box counts. Destructive seed reset is for a disposable local integration database, not deployed data.

## 4. API and Authorization

### 4.1 Common contracts

- App resources are under /api; capacity decisions under /admin/products. GET /health and GET /openapi.json are root paths.
- JSON uses the schemas' camelCase aliases. Requests use Authorization: Bearer for protected resources.
- Error body: {code, message, details}. Invalid input is 400 VALIDATION_ERROR, missing login 401, forbidden role 403, hidden/missing resource 404, conflict 409.
- WRONG_APP is a details.reason under FORBIDDEN. Business conflicts use code CONFLICT with details.reason such as STAGE_CHANGED, SOLD_OUT, INVALID_TRANSITION, STALE_VERSION or IDEMPOTENCY_MISMATCH where applicable.
- Paged resources use limit (default 20, maximum 50) and opaque cursor, returning items and nextCursor. Some small resources, such as test accounts and saved addresses, return arrays.
- Idempotency-Key is required on endpoints wired through run_idempotent, including order creation/payment and versioned catalog/settings mutations.
- CORS allows the configured consumer and producer origins. Local URLs and ports must match those settings.
- FastAPI generates OpenAPI from routers and Pydantic schemas. The source schemas, rather than this summary, define every field.

### 4.2 Main endpoint groups

Paths use {id} as a readable placeholder; source routers use names such as {product_id}.

| Method and path | Caller | Input / result |
| --- | --- | --- |
| GET /api/auth/test-accounts | Public when enabled | app -> role-filtered seed accounts |
| POST /api/auth/test-login | Public when enabled | userId, app -> JWT and user |
| GET /api/auth/me | Authenticated | Current account |
| GET / POST /api/auth/producer-application | Producer | Read/submit application; NONE read returns 404 |
| GET / POST /api/auth/me/addresses | Consumer | List/save recipient address |
| GET /api/home | Public | Hero, products and farm summaries |
| GET /api/farms/{id} | Public | Approved farm detail |
| GET / PATCH /api/farms/me | Producer owner | Own profile and detailContent |
| PUT / DELETE /api/farms/{id}/follow | Consumer | Follow state |
| GET /api/products/{id} | Public | Published product detail |
| GET /api/products/mine | Approved producer | Paged own product summaries |
| POST /api/products/drafts | Approved producer | inputText -> draft/missingFields/failed |
| POST /api/products | Approved producer | New product |
| PATCH /api/products/{id} | Owner | Versioned product changes |
| PUT /api/products/{id}/stages | Owner | Reservation periods/prices/allocations |
| PUT /api/products/{id}/sales-settings | Owner | Capacity limit/pause settings |
| GET / POST /api/products/{id}/capacity-requests | Owner | Request history / new initial or increase request |
| POST /api/products/{id}/capacity-requests/{requestId}/withdraw | Owner | Withdraw pending request |
| POST /admin/products/{id}/capacity-requests/{requestId}/approve | Admin | Approve requested capacity |
| POST /admin/products/{id}/capacity-requests/{requestId}/reject | Admin | Reject with reason |

### 4.3 Orders, communication and AI endpoints

| Method and path | Caller | Purpose |
| --- | --- | --- |
| POST /api/orders | Consumer | Create unpaid snapshot with consent |
| POST /api/orders/{id}/pay | Order owner | Mock payment and atomic allocation |
| GET /api/orders; GET /api/orders/{id} | Consumer owner | History/detail |
| POST /api/orders/{id}/cancel | Consumer owner | Eligible pre-shipping refund |
| POST /api/orders/{id}/confirm | Consumer owner | Confirm a delivered order |
| POST /api/orders/{id}/delivery-window-response | Consumer owner | Accept/reject proposed window |
| GET /api/orders/producer/dashboard | Approved producer | Own-farm demand and pending work |
| GET /api/orders/producer | Approved producer | Fulfillment orders |
| POST /api/orders/producer/harvest-start | Product owner | RESERVED -> PREPARING |
| POST /api/orders/{id}/ship | Owning producer | PREPARING -> SHIPPED |
| GET /api/messaging/rooms/{farmId}/messages | Visibility-dependent | Filtered room page |
| POST /api/messaging/rooms/{farmId}/messages | Follower / owner | Private consumer reply / producer broadcast |
| POST /api/messaging/news | Approved producer | Public/follower broadcast |
| PUT / DELETE /api/messaging/news/{id}/reaction | Eligible consumer | Like/unlike |
| GET / POST /api/messaging/chats | Consumer | Conversation list/start |
| GET / POST /api/messaging/chats/{farmId}/messages | Consumer participant | Private history/send |
| GET / POST /api/messaging/producer/chats/{consumerId}/messages | Owning producer | Private history/reply |
| PUT /api/messaging/producer/chats/{consumerId}/ai-mode | Owning producer | Versioned AUTO/HUMAN |
| POST /api/orders/{id}/inquiries | Paid-order owner | Idempotent contextual inquiry |
| POST /api/messaging/attachments | Authorized uploader | Upload one private file with order/thread context |
| GET /api/messaging/attachments/{id} | Participants | Read one private file after access checks |
| GET / PUT /api/farms/me/ai-settings | Owning producer | Read/save settings |
| POST /api/farms/me/ai-settings/preview | Owning producer | Side-effect-free preview |
| POST /api/farms/me/detail-draft | Owning producer | Generate farm detail without saving |
| POST /api/products/mine/{id}/detail-draft | Product owner | Generate product detail without saving |

The implementation also has room lists, read-position updates, question lists/answers and inquiry status endpoints. Full routes are discoverable through OpenAPI. A producer can never use a consumer token to bypass farm ownership.

### 4.4 Data shapes and privacy

| Shape | Key fields / constraint |
| --- | --- |
| Error | code, message, details; field errors or conflict reason |
| Paged result | items, nextCursor |
| DetailContent | blocks: text or image; <=30 blocks, unique block IDs |
| Text block | id, type=text, title <=100 chars, body <=3,000; at least one nonempty text field |
| Image block | id, type=image, uri, alt <=200; validated URI; no HTML execution |
| Detail draft | content, mode=ai or mock; no implicit save |
| Inquiry | orderId context, type, text, attachmentIds; resolving is not compensation approval |

- Filter room visibility **before** pagination, summaries and preview selection.
- Before binding a private attachment, verify uploader, order/thread participation and single-use binding.
- Private files are MIME/size checked and sanitized; they are not served through a public object URL.
- Unbound files expire after 24 hours. Upload-time cleanup removes old unbound rows; this is not a scheduled cleanup worker.
- An unfollowed consumer retains the ability to inquire about their own paid order. Ordinary new chat requires following.

## 5. AI and Implementation Decisions

### 5.1 Product and story generation

1. Accept producer source text and registered facts through authorized farm/catalog routes.
2. Remove contact/account information; keep transaction prices/dates in sales settings rather than generated detail.
3. For product extraction, call Claude with the fixed extraction schema. Missing credentials, invalid output or timeout returns a failed draft for manual completion.
4. For story blocks, build a deterministic fallback from supplied/registered data. With credentials, try Claude; validate output blocks and chosen photograph URLs.
5. Return mode=mock on missing credentials or invalid/failed detail generation. Return mode=ai only for accepted model output.
6. Save only on the producer's explicit profile/product update. Generation itself performs no publication.

These two failure behaviors differ deliberately: failed product extraction allows empty/manual completion, whereas detail generation can return a structured fallback.

### 5.2 Question answering and takeover

1. Check farm AI enablement and thread mode.
2. Detect mandatory handoff topics, including pesticide/cultivation claims, refunds, compensation, subjective taste, damage and delivery promises.
3. Try deterministic answers for supported facts: delivery window/fee, measured or expected sweetness, eligible FAQ and policy text.
4. Otherwise, call Claude only when credentials exist. Provide selected evidence rather than shipping personal data or private photos.
5. Parse structured ANSWER/HANDOFF output. Missing credentials, model failure or inadequate evidence results in handoff.
6. Persist the consumer message and AI guidance or escalation. Recheck captured thread/settings versions before storing the answer.
7. An explicit producer reply changes the thread to HUMAN atomically; later AUTO applies only to subsequent messages.

The current send service runs synchronously while holding the thread transaction. It is not a background worker queue. Version checks exist, but model latency can extend transaction duration. The documentation does not present this as an asynchronous architecture.

### 5.3 Concurrency and idempotency

| Concern | Mechanism | Why |
| --- | --- | --- |
| Last capacity | Lock product, then period-option allocation; recheck current usage | Avoid two payments consuming the same capacity |
| Paid snapshots | Store unit price and integer unit weight on Order | Product edits cannot rewrite paid history |
| Repeated cancellation | released_quantity and shipped_at guard release | Restore only eligible unshipped quantity once |
| Stale edits | Product/request/settings version checks | Reject lost updates rather than overwrite |
| Retried writes | User + operation scope + key, body hash and stored result | Replay same request; reject changed body |
| Idempotency retention | 24-hour records; expired rows removed on use | Bound replay lifetime |
| AI takeover | Thread transaction, mode/settings versions, explicit AUTO | Prevent late stale answers after takeover |
| Message order | Unique sequence plus stable identifiers | Stable read positions and merged conversation pages |

Idempotency stores successful results and handled 409 responses. A changed payload needs a new key after the user has reviewed the changed operation.

### 5.4 Implementation gaps and planned services

| Requirement / plan | Inspected implementation | Consequence |
| --- | --- | --- |
| Server /s/farms/{id} OG page | No registered share-page route in main.py | Direct consumer navigation and server-generated preview are different; preview acceptance is not established |
| Operator approval/refund/delivery APIs | Only catalog capacity admin router registered | Do not claim full operator workflow coverage |
| Eight-day confirmation / automatic operational refunds | No corresponding job in orders/core | Seed states do not prove automated transitions |
| R2 and public media processing | No completed backend R2 upload integration | Private DB attachments do not establish production public-media handling |
| PostHog / Sentry / Langfuse | Planned stack, no completed integration in inspected modules | No telemetry delivery or trace-coverage claim |
| Configurable remote delivery areas | orders service uses example postal/address matching | Producer-specific region policy remains follow-up work |
| Dedicated Refund entity | Refund fields on Order plus Payment state | ERD reflects implemented storage rather than an unimplemented draft table |

These are documentation findings, not newly executed failure tests or fixes. Product requirements are retained; resolving implementation gaps is separate engineering work.

## 6. Reproduction and Source Map

### 6.1 Local prerequisites and startup

- Node.js version from .nvmrc; npm workspaces.
- Python 3.12 and uv; PostgreSQL 16 from server/docker-compose.yml.
- Server: uv sync; docker compose up -d; uv run alembic upgrade head.
- Disposable demo database only: uv run python -m app.core.seed --reset.
- Set MOCK_LOGIN_ENABLED=true and FIXED_NOW=2026-10-07T10:00:00+09:00 for the documented seed scenario.
- Start uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 from server/.
- Start each app with EXPO_PUBLIC_API_MOCK=0, EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 and no shared Mock URL. Use ports 8081 and 8082.
- Outside local mode, configure JWT_SECRET. Never commit credentials. Anthropic credentials are needed only for actual external generation.

### 6.2 Source map

| Subject | Repository source |
| --- | --- |
| Router registration and CORS | server/app/main.py |
| Auth and role dependencies | server/app/core/security.py; server/app/accounts/router.py |
| Transactions and capacity | server/app/orders/service.py; server/app/catalog/service.py |
| Idempotency and errors | server/app/core/idempotency.py; server/app/core/errors.py |
| Chat, privacy and attachments | server/app/messaging/service.py and models.py |
| AI behavior | server/app/ai/service.py |
| Database structure | server/app/*/models.py; server/migrations/versions/0001-0005 |
| Frontend transport | packages/api/src/client.ts and endpoints.ts |
| Visual design | docs/design/README.md; docs/design/screens/ |

The [repository](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/747f588) provides the reproducible baseline. [Product contracts](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/main/docs/spec) define intended behavior. Testing plans/results remain in [Testing Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation), separate from this design document. Detailed design-pattern reporting is due in Iteration 5.
