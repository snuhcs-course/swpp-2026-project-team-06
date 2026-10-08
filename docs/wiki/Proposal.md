# Proposal

## 0. Team Information

## 1. Project Name

**Farmclub**: a direct-trade service. Consumers reserve Jeju tangerines before harvest, talk directly with the farm, and receive the fruit in season.

Iteration 1 (I1) builds a prototype where the three key ideas (reservation sales, farm communication, and AI) work as one flow. Payment is mocked.

Farmclub buys from farms and resells (direct purchase). Farmclub is the seller and is responsible for refunds. Producers set prices and quantities by date range, within a product-level approved supply weight. Farmclub approves initial capacity and increases only.

## 2. Target Customers

There are three account roles: consumer, producer, and operator. There are two apps, a consumer app and a producer app. Consumer and producer accounts are separate (I1 app-specific test accounts; Kakao starts in I2). Producers need a consumer account to order. The producer app opens only after approval.

| Role | Who | What they need |
| -- | -- | -- |
| Consumer (primary) | People in their 40s–50s, mostly women. They have buying power and make the decision, and are likely to talk with farms | Few steps to reserve, sweetness, delivery time, and price at a glance, large text |
| Consumer (indirect) | People in their 20s–30s. Little direct-trade experience, dislike searching for information. Often order for their parents | A separate recipient field, product info that needs no comparison |
| Producer | Jeju tangerine farms. They sold through KakaoTalk and Band and rarely take photos. They can measure sweetness at harvest | Register products by pasting text, set reservation dates, prices, total quantity limits and pause/resume sales, hand off repeated questions, see demand early, share a link with regular customers |
| Operator | The Farmclub team | Approve producers, product supply capacity, handle refunds and exceptions. No operator screen in I1 |

A producer has one farm and cannot access other farms' products, orders, or messages. A consumer can see only their own orders and conversations.

## 3. Motivation

Consumers hesitate to reserve because they cannot check quality in advance. Producers find it hard to find customers, answer repeated questions, and make sales content on their own.

**Key user study findings (as of Oct 4)**

| Group | Finding | What it means for the product |
| -- | -- | -- |
| Consumer | Buying criteria: taste and sweetness >> freshness = quality > price | Sweetness is the center of product info |
| Consumer | The biggest barrier to reserving is not knowing the quality in advance | Build trust with growing news and quality standards |
| Consumer | Little experience buying direct from farms; shorter waits are preferred | Always show the expected delivery window |
| Consumer | Growing and harvest content is most attractive; quality matters more than variety stories | Share farm news; variety is secondary |
| Consumer | They do not buy above normal online prices | Position: normal price, high quality |
| Producer | Little experience with reservation sales; rarely take photos | Text-first input, as few steps as possible |
| Producer | Of 14 farms contacted, 4 joined the beta and 2 more may join (Oct 2) | Real farm text can be used in the demo |

The working conclusion is "Go with a narrower scope" (tangerines only, high quality at normal prices). It will be confirmed in P13 (SWPP-17). Per-hypothesis verdicts are in User Study Results.

**Alternatives**: Smart Store and Allways sell stock after harvest and offer no contact with the farm. Nongsa Fund and Wadiz are crowdfunding, so buyers get a reward, not a product purchase.

## 4. Main Features

| Key idea | How it appears in the product |
| -- | -- |
| Reservation sales | Date-based pricing: the earlier you reserve, the cheaper it is. Producers set date ranges, prices, quantities, and total sales limits |
| Communication | Like Bubble, a farm sends 1:N messages to its followers. Replies are visible only between the consumer and the farm (1:1) |
| AI | Drafts product pages, gives first answers to repeated questions, and forwards only questions that need the farm's judgment |

- **Consumers** reserve high-sugar tangerines from a farm they trust, before harvest, at or below normal online prices, while watching the fruit grow.
- **Producers** paste the KakaoTalk or Band text they already use. AI handles the product page and repeated questions, and reservations show demand before harvest.

## 5. MVP Scope & Potential Accessory Features

**I1 goals**

1. G1. A consumer can follow a farm and complete a reservation order for tangerines at the price for the reservation date.
2. G2. A producer can register a product using only their existing text.
3. G3. A farm can send news to its followers. AI answers consumer questions first and forwards only what needs the farm.
4. G4. A consumer can check sweetness, grade, and expected delivery window before paying.
5. G5. We can measure the success metrics and use them to set the direction for I2. The metrics are listed in Requirements and Specifications (1.1).

**Non-goals**

- Real money flow: real payment and payment gateway, farm settlement, prepayment management
- Logistics: shipping and tracking-number integration
- Operations tools: operator screens
- Product expansion: items other than tangerines, non-standard produce, farm experiences, contract farming and CSA
- Community: conversations between consumers
- AI content generation from photos or videos

## 6. Device Needed

## 7. Test & Demo Plan

Source of truth: `docs/spec/prd.md` (Korean).

## Navigation refinement (spec 1.3)

Consumer: Discover / My Orders / Chat / Me. Producer: Dashboard / Products / Chat / Settings. Chat is third, with separate News Rooms and 1:1 Chat views. Consumers follow multiple farms and choose their rooms in a messenger list. Producers publish news from their own room. This refines reservation, communication and AI without changing the business scope or adding consumer-to-consumer chat.


## Supply capacity approval (spec 1.4)

Product-level kg capacity is approved once, with a new request only to increase it. Integer grams are used internally; orders and period allocations remain in boxes. Approved capacity and the producer sales limit are separate. Reserved plus shipped grams cannot exceed the sales limit, which cannot exceed approved capacity. First approval publishes the product and sets both limits; later approval increases only approved capacity. Pending/rejected increases do not interrupt current sales. Prices update immediately for new orders; paid price/weight snapshots remain unchanged and unpaid orders must reconfirm changed terms. Existing-order period dates/deletion and option weights remain locked. Pre-shipping returns restore weight exactly once; post-shipping refunds do not restore it.

The product filter order is Selling / Under review / Draft / Paused / Ended. Only initial requests are under review; increases use a badge in the existing group. My Orders uses Unconfirmed / Confirmed / Canceled·Refunded tabs with complete-list counts, defaulting to Unconfirmed. Unconfirmed covers RESERVED, PREPARING, SHIPPED and DELIVERED; Confirmed covers COMPLETED; Canceled·Refunded covers CANCELED, REFUNDED and PARTIALLY_REFUNDED. Pending payment stays excluded and the API return scope is unchanged. Action-needed orders come first within Unconfirmed, followed by newest first. The selected filter survives detail navigation and login; confirmation/refund refreshes membership and counts. Producer screens show approved weight, sales limit, reserved, shipped and available-to-reserve kg. There is no producer self-approval button.

[Capacity contract](../spec/capacity-1.4.md) defines request history/withdrawal and ADMIN approval/rejection, optimistic versions and idempotency, locked payment/cap updates, and explicit migration without guessing real approved kg from boxes. AC-04-8/9, AC-05-6, AC-09-6, AC-10-6 cover approval lifecycle, permissions, mixed weights, last-capacity concurrency, cancellation/shipping, price snapshots and UI. DEV-3 implements frontend/Mock; DEV-4 implements the actual server. This replaces earlier recurring product/price approval and box-cap statements; the seller/settlement business model is unchanged.

## Storefront and public news rooms (spec 1.5)
Keep four bottom tabs. Farm pages show a compact profile, Followers / Enter news room / 1:1 chat, products, then a long-form farm story. Remove inline news previews and the Products/News switch. Product pages show long-form images and text below purchase information, preserving disclosures and the reservation CTA.
Producers generate a detail draft from their supplied text/photos and registered facts, edit/reorder blocks, preview and explicitly save. Failed generation/save preserves edits; regeneration asks before replacing edits. Missing facts are not invented and transactional prices/dates stay in sales settings. Existing intro/description remains available when detail content is absent. DEV-3 implements UI/client/Mock, while actual AI and persistence are DEV-4.
Anonymous/non-followers may read public broadcasts in the room; followers see all broadcasts plus only their replies; owners see all replies. Filter before pagination and summaries; clear inaccessible cached content after access changes. Writing remains gated and reading never follows automatically. Test role isolation, failed draft/save recovery, persisted content, navigation/login return and 360/390/430px layouts. The current source is [spec 1.5](../spec/storefront-1.5.md), superseding earlier inline farm-news and recurring price-approval descriptions.
