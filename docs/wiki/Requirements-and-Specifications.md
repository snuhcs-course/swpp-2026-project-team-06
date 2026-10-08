# Requirements and Specifications

## Document Revision History

| Version | Date | Author | Changes |
| -- | -- | -- | -- |
| 0.1 | 2026-10-07 | Team 6 | Initial draft from `docs/spec/` |
| 0.2 | 2026-10-07 | Team 6 | Separate consumer and producer accounts (ADR 0010), FEAT-01 criteria, UI requirements from the final design (SWPP-81) |

## 1. Project Abstract

Farmclub lets consumers reserve Jeju tangerines before harvest at stage prices, talk directly with the farm, and receive the fruit in season. AI drafts product pages and answers repeated questions for producers. I1 is a prototype with mock payment.

### 1.1 Success Metrics (I1)

I1 is for testing hypotheses. In I1 we only measure these metrics. Targets and Go/Pivot criteria will be set in I2 based on I1 results.

| Metric | Definition | Hypothesis tested |
| -- | -- | -- |
| Order conversion rate | Share of product detail views that end in a completed payment | CH1, CH2 |
| Early-stage order share | Share of all orders placed in the first stage | CH2 |
| Follow → order | Share of following consumers who placed an order | CH3, CH4 |
| Reply rate | Share of message recipients who sent a reply | CH4 |
| AI self-resolution rate | Share of consumer questions closed by an AI answer without forwarding | PH3 |
| AI draft publish rate | Share of AI drafts that get published, and how much producers edited them | PH1, PH5 |
| Pre-shipment cancel rate | Share of paid orders cancelled before shipping | CH2 |

Event definitions for these metrics go in the tracking plan (technical design). Measurement data must not contain personal data.

## 2. Customers

### 2.1 General Audience

### 2.2 Primary Customer Types

- Producers (farmers)
- Consumers

## 3. Competitive Landscape

| Service | What it does | How we differ |
| -- | -- | -- |
| Nongsa Fund | Crowdfunding for agricultural products | |
| Wadiz | General crowdfunding, includes produce | |
| Local Line | Online store platform for farms and food hubs | |

## 4. Functional Requirements

### 4.1 P0 Features (I1)

P0 means required for I1. Each feature's behavior, exceptions, and acceptance criteria are in its FEAT file.

| ID | Feature | User story | Related rules |
| -- | -- | -- | -- |
| FEAT-01 | Sign-up and login | As a consumer, I want to browse farms and products without signing up, and log in only when I order, follow, chat, or like (I1: pick a seeded consumer test account; Kakao login in I2). As a producer, I want to sign up in the producer app, which also creates my producer account, and start selling after Farmclub verifies my farm. Consumer and producer accounts are separate (ADR 0010) | R-22 |
| FEAT-02 | Farm profile | As a producer, I want to register my farm name, region, and introduction so consumers can see them | — |
| FEAT-03 | AI product draft | As a producer, I want to paste the text I already use and get a product page | M-10–M-13 |
| FEAT-04 | Product and weight option publishing | As a producer, I want to edit the draft, set weight options and the shipping fee type, and request publishing (public after Farmclub approval) | R-18, Q-21 |
| FEAT-05 | Stage, price, and quantity setup | As a producer, I want to add date ranges, prices, and quantities, and set a product-wide box limit | R-06, R-18 |
| FEAT-06 | Discovery (home), farm search and follow | As a consumer, I want a home screen with a season banner and products closing soonest, to see farms sorted by nearest reservation deadline, search by farm name, variety, or region, and follow them (region and variety filters in I2) | — |
| FEAT-07 | Product detail | As a consumer, I want to see quality, delivery window, and today's price before I decide | R-05, R-06, R-16 |
| FEAT-08 | Reservation order | As a consumer, I want to set the recipient, agree to the terms, and place an order | R-03, R-20, Q-14 |
| FEAT-09 | Card payment (mock) | As a consumer, I want to pay the full order amount by card at once | R-01, R-02, R-17 |
| FEAT-10 | Order history | As a consumer, I want to see my order status and expected delivery window | R-05 |
| FEAT-11 | Cancel before shipping | As a consumer, I want to cancel any time before shipping and get a full refund | R-07, R-08 |
| FEAT-12 | 1:N news and 1:1 chat | As a producer, I want to post news with text, photos, or video to all followers. As a consumer, I want to ask the farm in a private 1:1 chat | M-01–M-04, M-14, M-16 |
| FEAT-13 | AI reply and forwarding | As a producer, I want AI to handle repeated questions so I only answer the ones that need me ("This is wrong" button in I2) | M-05–M-09, M-15 |
| FEAT-14 | Producer dashboard | As a producer, I want to see reservations per stage and orders to ship | R-15 |
| FEAT-15 | Farm news and likes | As a consumer, I want to see a farm's public news on its page even before I follow it, and like a post | M-14 |
| FEAT-17 | Shipping | As a producer, I want to mark an order as shipped with its tracking number (typing a sentence like "Sent Kim's 5kg today" for AI to parse comes in I2) | R-19, Q-22 |
| FEAT-19 | Farm link sharing | As a producer, I want to send my farm link by SMS or KakaoTalk to bring in my regular customers | Q-17 |

### 4.2 Business Principles

Every feature follows these principles. The full rules (R-01–R-27, M-01–M-21) and their exceptions are in the functional spec. MUST NOT rules apply even with mock payment.

1. **Farmclub is the seller.** Farms and initial product supply capacity require approval. Only capacity increases need further approval; price, option and period edits apply immediately to new orders. (R-18, R-22, R-25, M-13)
2. **The full amount is paid by card at order time.** No split payment, escrow, or cash-like payment. (R-01, R-02)
3. **Terms are shown and agreed to before payment.** They cover the delivery window, delays, crop failure, and cancellation. If the promised window changes, the buyer chooses to accept it or get a refund. (R-03–R-05, R-21)
4. **Full refund any time before shipping.** Refunds are card cancellations only. No points, credits, or other money-like features. If a farm is suspended, its unshipped orders are fully refunded. (R-07–R-12, R-24)
5. **Earlier stages are cheaper, and we never sell more than the stage quantity.** Price/period changes before payment require reconfirmation; paid order prices are fixed. The producer sets the maximum quantity per order. (R-06, R-17, R-18, R-20, R-23)
6. **Farm settlement is fixed at purchase confirmation.** The producer marks shipping, and delivery is confirmed by courier tracking. (R-13, R-14, R-19)
7. **Communication is farm → followers (1:N news), and chat is private (1:1).** External contact details are masked automatically. (M-01–M-04, M-14, M-16)
8. **AI answers only what it has evidence for and forwards the rest to the farm.** AI does not set prices or statuses, does not publish, and does not pretend to be the farm. No personal data is sent to AI. A "This is wrong" button for consumers comes in I2. (M-05–M-13, M-15, M-17, M-18)
9. **Personal data is shown only as needed.** Producers see only what they need for shipping, and legal disclosure duties are met. (R-15, R-16)

### 4.3 Traceability

This table shows, for each feature, the PRD scenario it comes from, the screens it runs on, the rules it follows, and the acceptance criteria that check it. Test plans and code review use this table. It covers 17 P0 features and 62 acceptance criteria; AC-13-5 and AC-17-1 are deferred to I2.

| FEAT | PRD | Screens | Rules | Acceptance criteria |
| -- | -- | -- | -- | -- |
| FEAT-01 | S-1, S-2 | SCR-05, 17, 19, 20, 21 | R-22 | AC-01-1, 3–7 (AC-01-2 retired) |
| FEAT-02 | S-1 | SCR-30, 03 | — | AC-02-1–2 |
| FEAT-03 | S-1 | SCR-24 | M-10–12 | AC-03-1–3 |
| FEAT-04 | S-1 | SCR-23, 25 | R-18, 20, 21, 23, 25, M-13 | AC-04-1–4 |
| FEAT-05 | S-1 | SCR-26 | R-06, 17, 18, 25 | AC-05-1–3 |
| FEAT-06 | S-2 | SCR-01, 02, 03, 17 | — | AC-06-1–5 |
| FEAT-07 | S-2 | SCR-04 | R-05, 06, 16, 20, M-15 | AC-07-1–2 |
| FEAT-08 | S-2 | SCR-10, 17 | R-03, 06, 17, 20, 23 | AC-08-1–5 |
| FEAT-09 | S-2 | SCR-11, 12 | R-01, 02, 06, 13, 17 | AC-09-1–3 |
| FEAT-10 | S-2, S-4 | SCR-13, 14, 17 | R-05, 13, 14, 21, 24 | AC-10-1–3 |
| FEAT-11 | S-4 | SCR-14 | R-07, 08 | AC-11-1–2 |
| FEAT-12 | S-3 | SCR-03, 04, 15, 16, 18, 27 | M-01–04, 14, 16 | AC-12-1–5 |
| FEAT-13 | S-3 | SCR-16, 28 | M-05–09, 15, 18 (M-17 in I2) | AC-13-1–5 (AC-13-5 in I2) |
| FEAT-14 | S-4 | SCR-22 | R-15 | AC-14-1–2 |
| FEAT-15 | S-3 | SCR-01, 03, 18 | M-02, 03, 14 | AC-15-1–5 |
| FEAT-17 | S-4 | SCR-29 | R-07, 15, 19 | AC-17-1–5 (AC-17-1 in I2) |
| FEAT-19 | S-1 | SCR-30 | — | AC-19-1–3 |

Rules not in this table run on the system or operator side: R-04, R-09, R-10 (automatic refund, FEAT-24, P2), R-11, R-12 (refund policy), and running the R-14 settlement (FEAT-21, P2).

## 5. Non-Functional Requirements

### 5.1 AI Output Quality

| ID | Item | Requirement |
| -- | -- | -- |
| N-04 | Response time | The AI product draft shows a result within 20 seconds. After replying, a consumer gets an AI answer or a "forwarded to the farm" notice without waiting. If AI fails, the question is forwarded. The target time is set in the technical design |
| N-08 | AI operations | Product draft extraction is at least 80% accurate, counted per field. Data sent to AI must not include phone numbers or addresses (M-18). Model, cost limit, and logging tools are set in the technical design (Q-19) |

### 5.2 Reliability and Usability

| ID | Item | Requirement |
| -- | -- | -- |
| N-01 | Platform | The consumer app and the producer app are separate mobile web apps. Mobile first, and they must not break on desktop. Users enter by link with no app install |
| N-02 | Accessibility | Text and buttons large enough for people in their 40s–50s to read and tap without reading glasses. One main action per screen. Body text at least 16px, tap targets at least 48px. Other sizes are set in the screen spec (1.1: body 17, input 16, secondary and meta 15) |
| N-03 | Language and region | Korean only, times in KST, amounts as whole won |
| N-07 | Demo environment | Seed farms, products, and stages, plus test accounts for each role. Mock payment can reproduce both success and failure |

### 5.3 Privacy and Security

| ID | Item | Requirement |
| -- | -- | -- |
| N-05 | Personal data | Collect only name, phone number, and delivery address. No personal data in logs or analytics events. Retention period is Q-20 |
| N-06 | Security | Role-based access control is checked on the server. Hiding something in the UI is not enough. Each account has one role, and a token from the other app is rejected with 403 (ADR 0010) |

## 6. User Interface Requirements

### 6.1 Figma

### 6.2 Wireframe Overview

The final design lives in `docs/design/` (exported from the Claude Design canvas): 26 screens, 38 state frames, 11 sheets, 5 flow diagrams, a desktop layout, share previews, and app icons. Each frame is one HTML file; the README lists design tokens and rules. Main UI requirements:

- Tap targets of at least 48px, body text 17px, meta text 15px, Pretendard web font.
- One accent-colored main button per screen, placed at the bottom (bottom bar, floating button, or sheet).
- Logged-out users who tap follow, reserve, chat, or like first see a notice sheet, then the consumer login (SCR-05), and return to the same action.
- Consumer and producer apps have separate logins: SCR-05 (consumer accounts only) and SCR-19 (producer accounts only, with a "sign up as a farm" link). "Start as a farm" in the consumer app explains that the producer app needs its own sign-up.
- On desktop, the app is centered with a maximum width of 480px.

### 6.3 Consumer Flow

### 6.4 Producer Flow

### 6.5 Edge and Error States

### 6.6 UI Transition Summary

## 7. Scope of This Specification

Source of truth: `docs/spec/prd.md` and `docs/spec/functional/README.md` (Korean).

## Specification 1.2 — Sales Operations and Direct Support

This is a documentation contract for subsequent DEV-3/DEV-4 implementation, not a completed feature release. The Korean source is [contracts-1.2.md](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/spec/contracts-1.2.md).

- **R-26:** Producers set a total box limit per product, shared across all periods and weight options. It is separate from the per-order quantity limit. Paid quantities consume the limit; cancellation/shortfall before shipping returns quantity exactly once. Post-shipping refunds do not replenish it.
- **R-27:** Pause keeps the product visible but blocks new reservations and payment of unpaid orders. Paid orders remain valid. Resume requires a valid current/future period with stock.
- **FEAT-05:** Editable date ranges replace numbered stages and fixed presets. Earlier prices must be strictly lower. Stable stage IDs and approved values survive edits; periods with reservation history cannot be deleted or repriced.
- **M-19 / FEAT-12:** News uses farm rooms. Consumers see broadcasts and their own private replies; the producer sees all replies for their own farm. Separate 1:1 chat includes every conversation, with a needs-reply filter.
- **FEAT-13 / M-20:** A successful producer reply switches the thread to HUMAN atomically. Only an explicit AUTO action re-enables future replies; farm-wide AI OFF overrides AUTO. AI checks mode again before saving a pending answer.
- **FEAT-32 / SCR-31:** Farm AI settings include enable/disable, small-order and reservation-shipping principles, FAQs, extra handoff topics, and a side-effect-free preview. Platform rules and verified product/order facts override farm prose. Subjective taste, quality, damage, and compensation decisions require a human.
- **FEAT-33 / SCR-32 / M-21:** Owners of paid orders can submit a typed inquiry with up to three private photos, including after unfollowing. Only that consumer and farm can access it. Marking it resolved does not approve a refund.

Sales controls are Must for the sales path; chat, AI settings, and inquiries are I1 Should. Real payments, automated compensation, refund adjudication screens, and new fee structures are outside this change. Interview evidence is summarized anonymously; no raw contact or private commercial information is published.

## Spec 1.3 navigation

Consumer tabs: Discover / My Orders / Chat / Me. Producer: Dashboard / Products / Chat / Settings (SCR-33). Chat is always third; News Rooms and 1:1 remain separate API resources and privacy boundaries. Consumers see multiple eligible farm rooms with circular avatars, latest visible message/time and existing private-chat unread counts. Selection and scroll persist on room return.

Orders use `/orders` and detail/completion/inquiry children. Settings leads to profile/link, AI settings and logout. Producers publish only through their own room; media posting returns there.

Product groups: On sale (unpaused PUBLISHED except ENDED), Under review (PENDING_APPROVAL), Drafts (DRAFT/REJECTED, showing rejection), Paused (PUBLISHED with salesPaused or PAUSED), Ended (CLOSED or unpaused PUBLISHED/ENDED). CLOSED wins; manual pause retains 1.2 precedence. Scheduled/gap/sold-out states are secondary labels; a pending capacity increase stays in its current sales group. Counts include all pages. See `docs/spec/navigation-1.3.md` and the 1.4 capacity contract for updated APIs and migration requirements.


## Supply capacity approval (spec 1.4)

Product-level kg capacity is approved once, with a new request only to increase it. Integer grams are used internally; orders and period allocations remain in boxes. Approved capacity and the producer sales limit are separate. Reserved plus shipped grams cannot exceed the sales limit, which cannot exceed approved capacity. First approval publishes the product and sets both limits; later approval increases only approved capacity. Pending/rejected increases do not interrupt current sales. Prices update immediately for new orders; paid price/weight snapshots remain unchanged and unpaid orders must reconfirm changed terms. Existing-order period dates/deletion and option weights remain locked. Pre-shipping returns restore weight exactly once; post-shipping refunds do not restore it.

The product filter order is Selling / Under review / Draft / Paused / Ended. Only initial requests are under review; increases use a badge in the existing group. My Orders uses Confirmed / Unconfirmed / Canceled·Refunded tabs with complete-list counts, defaulting to Unconfirmed. Unconfirmed covers RESERVED, PREPARING, SHIPPED and DELIVERED; Confirmed covers COMPLETED; Canceled·Refunded covers CANCELED, REFUNDED and PARTIALLY_REFUNDED. Pending payment stays excluded and the API return scope is unchanged. Action-needed orders come first within Unconfirmed, followed by newest first. The selected filter survives detail navigation and login; confirmation/refund refreshes membership and counts. Producer screens show approved weight, sales limit, reserved, shipped and available-to-reserve kg. There is no producer self-approval button.

[Capacity contract](../spec/capacity-1.4.md) defines request history/withdrawal and ADMIN approval/rejection, optimistic versions and idempotency, locked payment/cap updates, and explicit migration without guessing real approved kg from boxes. AC-04-8/9, AC-05-6, AC-09-6, AC-10-6 cover approval lifecycle, permissions, mixed weights, last-capacity concurrency, cancellation/shipping, price snapshots and UI. DEV-3 implements frontend/Mock; DEV-4 implements the actual server. This replaces earlier recurring product/price approval and box-cap statements; the seller/settlement business model is unchanged.
