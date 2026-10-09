# Testing Documentation

## Changes in this iteration

- I1 initial planning: wrote 50 acceptance criteria (Given / When / Then) for all 17 P0 features. This was a planning milestone, not an execution result. The completed DEV-6 run is recorded in the final section below.
- I1 (P22): now 62 criteria. Added AC-01-4–5 (mock login), AC-06-4–5 (home), AC-09-3 (idempotency), AC-12-4–5 (chat), AC-15-3–5 (likes), AC-17-4–5 (shipping). AC-13-5 and AC-17-1 are deferred to I2.
- I1 (SWPP-81): now 64 criteria, one retired. Consumer and producer accounts are separate (ADR 0010): AC-01-2 is retired and AC-01-6–7 are added. AC-06-5 and AC-17-2 follow screen spec 1.1. 61 criteria are tested in I1.

## 1. Testing Plan and Results (Iteration 2~)

## 2. AI Module Testing (Iteration 3~)

## 3. Acceptance Testing (Iteration 4)

Each criterion has an ID `AC-<feature>-<n>`. Test names include the AC ID (for example `test_AC_09_1_last_item_concurrent_payment`). Screen IDs (SCR-xx) refer to the sitemap in Design Documentation.

### FEAT-01 Sign-up and login

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-01-1 | A logged-out user is on a product detail page | They tap "Reserve" and log in with a test account | Checkout (SCR-10) opens |
| ~~AC-01-2~~ | ~~A test account is logged in to the consumer app~~ | ~~The same account logs in to the producer app~~ | ~~They log in as the same user, with no new account~~ — retired (SWPP-81, ADR 0010); replaced by AC-01-6 |
| AC-01-3 | A producer is not yet approved | They open SCR-22–30 or call a producer API | They are sent to SCR-21 and the API refuses the call |
| AC-01-4 | Mock login is on | The test-login API is called with a user ID that is not a seeded test account | It is refused and no account is created |
| AC-01-5 | Mock login is off | The test-account list or test-login API is called | Both are refused |
| AC-01-6 | There is a consumer account token and a producer account token | The producer login (SCR-19) account list is opened, a producer API is called with the consumer token, or a consumer API (for example creating an order) is called with the producer token | The producer list shows only producer accounts, and both calls are refused with 403 `WRONG_APP` |
| AC-01-7 | A consumer is logged in to the consumer app | They tap "Start as a farm" in My info | A notice says the producer app needs its own sign-up, then the producer app sign-up opens; no producer role is added to the consumer account |

### FEAT-02 Farm profile

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-02-1 | An approved producer | Changes the farm name and saves | SCR-02 and SCR-03 show the new name |
| AC-02-2 | The farm name is empty | The producer taps Save | Nothing is saved and the empty field is marked |

### FEAT-03 AI product draft

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-03-1 | The text has no sweetness or delivery time | A draft is made | Those two fields stay empty and are marked as blanks |
| AC-03-2 | The text contains "5kg 25,000 won" | A draft is made | The price is not filled in |
| AC-03-3 | The AI call fails | The producer taps "Make draft" | An empty edit screen opens for manual input |

### FEAT-04 Product edit and publishing request

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-04-1 | The delivery window is empty | The producer tries to request publishing | The button is disabled and the missing fields are shown |
| AC-04-2 | A product is pending approval or rejected | A consumer looks for it in the consumer app | It is not visible |
| AC-04-3 | A product is pending approval | The operator approves it through the admin API | It becomes "on sale" and appears on SCR-03 |
| AC-04-4 | A product is on sale | The producer changes the price and saves | Consumers still see the old price until it is approved again |

### FEAT-05 Stage, price, and quantity setup

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-05-1 | Stage 2 for 5 kg is 25,000 won | The producer enters 27,000 won for stage 1 5 kg and saves | Nothing is saved and the reason is shown |
| AC-05-2 | Stage 1 runs Oct 7–20 | The producer sets stage 2 to start Oct 15 | The periods overlap, so nothing is saved |
| AC-05-3 | A new product is being configured | The screen opens | One blank date range is shown; add/remove ranges without numbered stages or fixed presets |

### FEAT-06 Farm search and follow

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-06-1 | Farm A's stage ends tomorrow and farm B's ends next week | The farm list opens | A is shown above B |
| AC-06-2 | A farm has Hallabong as a variety | The user searches "Hallabong" | Only that farm appears |
| AC-06-3 | A logged-in consumer | Follows a farm | The farm appears in My info, and its news appears in Chat > News Rooms |
| AC-06-4 | Product A's stage ends tomorrow and product B's ends next week, both on sale | Home opens | A is shown before B in the recommended products |
| AC-06-5 | No product is on sale | Home opens | "No products open for reservation" is shown, and the farm cards (browse farms) still show |

### FEAT-07 Product detail

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-07-1 | The current stage has 0 left | The product detail opens | "Sold out" and the next stage's start date are shown, and "Reserve" cannot be tapped |
| AC-07-2 | A measured sweetness is registered | The product detail opens | The measured value is shown instead of the expected value |

### FEAT-08 Reservation order

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-08-1 | One of the four consent boxes is not checked | The consumer taps "Pay" | They cannot move on |
| AC-08-2 | The maximum quantity per order is 3 | The consumer picks a quantity | 4 or more cannot be chosen |
| AC-08-3 | The product has a separate shipping fee | Checkout opens | Product amount, shipping fee, and total are shown separately |
| AC-08-4 | The delivery address is in a remote area set by the producer | The address is entered | The extra shipping fee is added to the total |
| AC-08-5 | The consumer saved a delivery address in My info | Checkout opens | Recipient, phone number, and address are filled in and can be edited |

### FEAT-09 Card payment (mock)

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-09-1 | Only 1 unit is left | Two people pay at the same time | Only one succeeds; the other gets a sold-out notice |
| AC-09-2 | An order is pending payment | The consumer picks "fail" | The remaining quantity does not drop and they return to checkout |
| AC-09-3 | A payment request was sent | It is sent again with the same idempotency key | Payment and stage quantity change happen only once, with the same result |

### FEAT-10 Order history and detail

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-10-1 | An order's delivery window has changed | Order history opens | That order is at the top and stays there until the consumer accepts or takes a refund |
| AC-10-2 | 8 days have passed since delivery | The consumer has not confirmed the purchase | The purchase is confirmed automatically |
| AC-10-3 | An order was refunded because the farm was suspended | The order detail opens | The refund reason is shown |

### FEAT-11 Cancel before shipping

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-11-1 | An order is reserved | The consumer cancels | It is fully refunded and that stage's remaining quantity goes up |
| AC-11-2 | An order has shipped | The order detail opens | There is no cancel button |

### FEAT-12 1:N news and 1:1 chat

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-12-1 | Consumer A asked a farm in chat | Consumer B opens the same farm chat or calls the API | A's reply does not appear anywhere |
| AC-12-2 | The message body has "Call me at 010-1234-5678" | It is sent | The number is masked when stored and shown |
| AC-12-3 | A news post is marked public | It is posted | It appears in followers' Chat > News Rooms and in the farm page news tab |
| AC-12-4 | A logged-in consumer does not follow a farm | They tap "Chat" | They see "Follow and start chatting", the farm is followed, and the chat opens |
| AC-12-5 | A followed farm posted news | The Chat tab and that farm's chat open | The news is not shown; only 1:1 Q&A is |

### FEAT-13 AI reply, forwarding, and producer answer

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-13-1 | Farm AI is ON, thread is AUTO, and the product has a delivery window | A consumer replies "When will it ship?" | The AI answer gives that window |
| AC-13-2 | Even if the product description mentions growing methods | A consumer replies "How much pesticide do you use?" | AI does not answer and the question goes to the needs-reply chat list |
| AC-13-3 | Farm AI is ON, thread is AUTO, and only expected sweetness is registered | A consumer replies "What is the registered Brix value?" | AI answers and says it is an expected value |
| AC-13-4 | AI sent an answer | The conversation opens | The answer has an "AI answer" label |
| AC-13-5 (I2) | AI answered "ships in mid-January" | The consumer taps "This is wrong" | The question appears in the farm's needs-reply chat list (SCR-28), marked as a wrong answer |

### FEAT-14 Producer dashboard

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-14-1 | The producer is viewing the dashboard | A new order is paid | On reopening, that stage's reservation count is up and remaining quantity is down |
| AC-14-2 | An order has been delivered | The producer views it on the dashboard | Address and phone number are hidden |

### FEAT-15 Farm news and likes

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-15-1 | A message was sent as private | The news tab opens | That message is not shown |
| AC-15-2 | The user is logged out | The news tab opens | Public news is shown |
| AC-15-3 | A logged-in consumer sees a post with 3 likes | They tap Like, then tap it again | First 4 with their like shown, then back to 3 |
| AC-15-4 | A logged-out user sees a public post | They tap Like and log in | They return to that post and the like is applied |
| AC-15-5 | A followers-only post from a farm the user does not follow | The like API is called | It is refused and the count does not change |

### FEAT-17 Shipping

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-17-1 (I2) | AI found an order and asked for confirmation | Before the producer taps confirm | No order changes state |
| AC-17-2 | An order is preparing shipment | The producer taps confirm | The consumer's order detail shows "In delivery" (state `SHIPPED`) and the cancel button disappears |
| AC-17-3 | A product has 3 reserved orders | The producer taps "Start harvest" | All 3 become "preparing shipment", and consumers can still cancel |
| AC-17-4 | An order has shipped | The producer sends a request to mark it delivered | It is refused and the order stays shipped |
| AC-17-5 | Tracking number "123-456" is entered on a preparing order | It is marked shipped | The ship date and tracking number are saved and shown on the consumer's order detail |

### FEAT-19 Farm link sharing

| ID | Given | When | Then |
| -- | -- | -- | -- |
| AC-19-1 | A link to an approved farm | It is opened in a logged-out browser | That farm page shows right away |
| AC-19-2 | A link to a farm whose approval was revoked | It is opened | A "farm not found" notice is shown, then the farm list |
| AC-19-3 | A share link to an approved farm | It is pasted into a KakaoTalk chat | A preview with the farm name and main photo is shown |

## 4. Alpha and Beta Testing (Iteration 5)

Source of truth: `docs/spec/functional/` (Korean).

## Specification 1.2 Acceptance Plan

These are required checks for follow-up implementation, not executed test results from the documentation PR. Detailed AC IDs live in the Korean functional specifications.

| Coverage | Required observation |
| --- | --- |
| FEAT-04, 07–09; R-26·27 | Distinct products have independent caps; all options/periods of one product share its box cap. The per-order cap is separate. A cap below sold quantity is rejected. Pause after checkout blocks payment, but paid orders can ship. |
| FEAT-09·11 | Two payments for the last box produce exactly one success. Duplicate payment/cancellation returns the original result and changes counters only once. Post-shipping refund does not restore stock. |
| AC-05-3~5 | Blank/addable date ranges, strictly increasing prices, no overlap, stable IDs after reordering, locked sold periods, and no public exposure of unapproved edits. |
| AC-12-6~8 | A consumer never sees another consumer's room reply through messages, previews, or cursors. Producers see every own-farm conversation. Active polling and pagination do not duplicate messages or move a reader's scroll position. |
| AC-13-6~8 | HUMAN transition races with AI completion safely. Thread/settings version checks also reject old answers after HUMAN→AUTO or OFF→ON round trips and preserve unanswered work. Farm OFF overrides AUTO. Subjective taste, quality, and damage require handoff. |
| AC-32-1~4 | Versioned settings survive reload; conflicting/stale/foreign writes fail; preview does not save settings, messages, inquiries, or mode changes. |
| AC-33-1~4 | Own paid-order inquiry works after unfollow; another buyer/farm cannot read the order/photo or rebind an attachment. Retry creates one inquiry. Resolution does not change order/refund state. |
| Layout | 360/390/430/1440px, long text, big counts, photos, empty/loading/error states, keyboard, composer/tab overlap, and historical-message scrolling. |

DEV-4 owns transaction, migration, authorization, API and AI boundary tests. DEV-3 owns the clients, shared Mock behavior, components and browser checks. An accepted spec does not close either entire implementation issue.

## Spec 1.3 acceptance scenarios (planned, not executed)

| AC | Scenario | Expected |
| --- | --- | --- |
| AC-02-3 | Producer fourth tab | Settings leads to profile/link, AI settings, logout |
| AC-04-7 | Mixed product states across pages, pause/resume, reapproval | Exactly one group per product, full counts; reapproval keeps current group |
| AC-10-5 | Second consumer tab, payment, inquiry, login from deep link | `/orders` routes, correct return and order context |
| AC-12-9 | Follow two farms, switch rooms, return | Third Chat tab, News Rooms/1:1, circular avatars, selection/scroll and privacy preserved |
| AC-12-10 | Dashboard/profile; post text/media in own room | No duplicate news button, media success returns to room |

Check 360/390/430px and desktop, long names, composer/keyboard overlap, empty/loading/error, paid-order inquiry after unfollow and pagination beyond 50 rows. Existing API/privacy tests remain required.


## Supply capacity approval (spec 1.4)

Product-level kg capacity is approved once, with a new request only to increase it. Integer grams are used internally; orders and period allocations remain in boxes. Approved capacity and the producer sales limit are separate. Reserved plus shipped grams cannot exceed the sales limit, which cannot exceed approved capacity. First approval publishes the product and sets both limits; later approval increases only approved capacity. Pending/rejected increases do not interrupt current sales. Prices update immediately for new orders; paid price/weight snapshots remain unchanged and unpaid orders must reconfirm changed terms. Existing-order period dates/deletion and option weights remain locked. Pre-shipping returns restore weight exactly once; post-shipping refunds do not restore it.

The product filter order is Selling / Under review / Draft / Paused / Ended. Only initial requests are under review; increases use a badge in the existing group. My Orders uses Confirmed / Unconfirmed / Canceled·Refunded tabs with complete-list counts, defaulting to Unconfirmed. Unconfirmed covers RESERVED, PREPARING, SHIPPED and DELIVERED; Confirmed covers COMPLETED; Canceled·Refunded covers CANCELED, REFUNDED and PARTIALLY_REFUNDED. Pending payment stays excluded and the API return scope is unchanged. Action-needed orders come first within Unconfirmed, followed by newest first. The selected filter survives detail navigation and login; confirmation/refund refreshes membership and counts. Producer screens show approved weight, sales limit, reserved, shipped and available-to-reserve kg. There is no producer self-approval button.

[Capacity contract](../spec/capacity-1.4.md) defines request history/withdrawal and ADMIN approval/rejection, optimistic versions and idempotency, locked payment/cap updates, and explicit migration without guessing real approved kg from boxes. AC-04-8/9, AC-05-6, AC-09-6, AC-10-6 cover approval lifecycle, permissions, mixed weights, last-capacity concurrency, cancellation/shipping, price snapshots and UI. DEV-3 implements frontend/Mock; DEV-4 implements the actual server. This replaces earlier recurring product/price approval and box-cap statements; the seller/settlement business model is unchanged.

## Storefront and public news rooms (spec 1.5)
Keep four bottom tabs. Farm pages show a compact profile, Followers / Enter news room / 1:1 chat, products, then a long-form farm story. Remove inline news previews and the Products/News switch. Product pages show long-form images and text below purchase information, preserving disclosures and the reservation CTA.
Producers generate a detail draft from their supplied text/photos and registered facts, edit/reorder blocks, preview and explicitly save. Failed generation/save preserves edits; regeneration asks before replacing edits. Missing facts are not invented and transactional prices/dates stay in sales settings. Existing intro/description remains available when detail content is absent. DEV-3 implements UI/client/Mock, while actual AI and persistence are DEV-4.
Anonymous/non-followers may read public broadcasts in the room; followers see all broadcasts plus only their replies; owners see all replies. Filter before pagination and summaries; clear inaccessible cached content after access changes. Writing remains gated and reading never follows automatically. Test role isolation, failed draft/save recovery, persisted content, navigation/login return and 360/390/430px layouts. The current source is [spec 1.5](../spec/storefront-1.5.md), superseding earlier inline farm-news and recurring price-approval descriptions.

Storefront implementation checks: 11 Mock regression cases pass; browser checks cover farm/product draft generation, preview and public rendering after save, failed generation/save preserving edits, replacement cancellation, unsaved-exit confirmation, anonymous reading, login return and following to reply. Farm layouts pass 360/390/430/1440px width checks; editor layouts pass 360/390/430px. Onboarding policy copy now reflects initial/increased capacity approval only, and login uses a neutral continuation title. Real AI remains a backend integration task.

## I1 Real-Backend Integration Test (DEV-6, 2026-10-09)

DEV-6 connects both Expo web apps to the local FastAPI/PostgreSQL stack. Mock mode is disabled. The database is migrated through `0005`, reset to the I1 seed, and the server clock is fixed at `2026-10-07T10:00:00+09:00`.

### Repeatable setup

```bash
cd server
docker compose up -d
uv run alembic upgrade head
uv run python -m app.core.seed --reset
MOCK_LOGIN_ENABLED=true FIXED_NOW=2026-10-07T10:00:00+09:00 \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# In another terminal from the repository root
FARMCLUB_ADMIN_TOKEN="$(cd server && uv run python -m app.accounts.admin_token)" \
  npm run test:integration

EXPO_PUBLIC_API_MOCK=0 EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 \
  npm run web -w apps/consumer -- --port 8081
EXPO_PUBLIC_API_MOCK=0 EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 \
  npm run web -w apps/producer -- --port 8082
```

`scripts/test-integration.mjs` has no added dependency and refuses non-localhost API URLs. It creates uniquely named test data after a seed reset and covers seven sequential real-server flows.

### Automated results

| Check | Result | Evidence |
| --- | --- | --- |
| Real API smoke | PASS | 7/7: health/auth/gates; product/detail/capacity approval; payment/capacity release; fulfillment; news privacy; AI chat/handoff; farm detail draft/save |
| Server lint | PASS | `uv run ruff check .` |
| Server tests | PASS | 133 pytest tests |
| Database | PASS | Alembic upgrade through `0005`; `alembic check` reports no new operations |
| Frontend types | PASS | Consumer, producer, API and UI workspaces |
| Mock contracts | PASS | 11/11 Node test scenarios |
| Web exports | PASS | Consumer and producer Expo web exports |

The smoke suite verifies app-separated account lists and `WRONG_APP`, all producer gates at the API boundary, pending/rejected application details, the no-application 404, version/idempotency rules, explicit initial capacity approval, public visibility, exact gram reservation/release, pause blocking, immutable paid snapshots, producer fulfillment, consumer confirmation, public/follower news privacy, private replies, reactions, chat auto-follow, factual AI evidence, sensitive-topic handoff, and explicit detail publication. Expected 400/403/404/409 responses are asserted; no unexpected 5xx occurred.

### Browser matrix

| Scenario | Expected | Actual | Result |
| --- | --- | --- | --- |
| Anonymous discovery | Home → farm → product and public room work logged out; participation returns through login | Public content loaded from FastAPI; follower-only posts stayed hidden; login returned to the same room | PASS |
| Consumer checkout | Logged-in consumer selects an option, accepts four consents, pays, and sees history/detail | Order `FC-1007-1009` was paid against PostgreSQL and displayed in order detail | PASS |
| Cross-app fulfillment | Producer sees the same order, starts harvest, adds carrier/tracking, and ships; consumer loses cancel | Producer shipped with CJ tracking; consumer showed `SHIPPED`, tracking, and no cancel action | PASS |
| Producer product flow | Product data, capacity state, public visibility and sales controls use the real API | API flow created/configured/approved a product; producer and consumer UIs displayed the same product and gram state | PASS |
| Farm/product storytelling | Generate does not auto-publish; reorder/preview/save publishes; failed save retains edits | Unsaved generated text stayed private; reordered preview saved and rendered publicly; stopped-API save retained edits and one retry succeeded | PASS |
| News-room privacy | Anonymous/unfollowed users see public posts; follower sees own replies; owner sees all | Real API smoke covered two consumers/owner and reaction authorization; browser covered anonymous and followed return flows | PASS |
| 1:1 chat and inquiry | Auto-follow, factual AI, handoff, and paid-order inquiry isolation | Browser displayed factual evidence and handoff; API/pytest cover auto-follow, inquiry and private attachment ownership/isolation | PASS |
| Producer account gates | Approved, pending, rejected, suspended and new accounts reach their proper screens | All five gates pass. After #55, pending shows the application timeline and read-only details; rejected shows the reason and a prefilled reapplication form. The API returned 200 and browser error logs were empty | PASS |
| Resilience and layout | Reload persists sessions; failed edit/send keeps input; retry succeeds; 390px and 1440px remain usable | Both sessions survived reload. Chat and detail input survived API shutdown and succeeded after one retry. Core pages rendered at both widths | PASS |

FastAPI access logs show the browser clients calling port 8000. No `/__mock` traffic was observed. Browser error logs were empty; the development build emitted only the known React Native Web warnings about a require cycle and deprecated `pointerEvents` prop.

### Resolved defect and release decision

- [#54](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/54) was fixed by [#55](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/55). DEV-6 merged the resulting `main`, reset the database, and added the missing producer-application checks to the reusable smoke suite.
- Post-fix validation passed: real API smoke 7/7, Ruff, 133 pytest tests, Alembic upgrade/check, all workspace typechecks, Mock contracts 11/11, and both Expo web exports.
- The previously blocked browser scenario was rerun against FastAPI: pending and rejected applications rendered their expected content, the rejected form was prefilled, browser error logs were empty, and FastAPI logged `GET /api/auth/producer-application` as 200.
- No release-blocking defect remained in the executed DEV-6 matrix. PR #53 was merged on 2026-10-09 KST (main 747f588). This is the result for that matrix, not a claim that every product requirement or planned external integration is complete.
