# Proposal

## 0. Team Information

## 1. Project Name

**Farmclub**: a direct-trade service. Consumers reserve Jeju tangerines before harvest, talk directly with the farm, and receive the fruit in season.

Iteration 1 (I1) builds a prototype where the three key ideas (reservation sales, farm communication, and AI) work as one flow. Payment is mocked.

Farmclub buys from farms and resells (direct purchase). Farmclub is the seller and is responsible for refunds. Producers set prices from platform defaults, and Farmclub approves them.

## 2. Target Customers

There are three account roles: consumer, producer, and operator. There are two apps, a consumer app and a producer app. One Kakao account works for both. Producers can also order in the consumer app. The producer app opens only after approval.

| Role | Who | What they need |
| -- | -- | -- |
| Consumer (primary) | People in their 40s–50s, mostly women. They have buying power and make the decision, and are likely to talk with farms | Few steps to reserve, sweetness, delivery time, and price at a glance, large text |
| Consumer (indirect) | People in their 20s–30s. Little direct-trade experience, dislike searching for information. Often order for their parents | A separate recipient field, product info that needs no comparison |
| Producer | Jeju tangerine farms. They sold through KakaoTalk and Band and rarely take photos. They can measure sweetness at harvest | Register products by pasting text, set stages and prices easily from defaults, hand off repeated questions, see demand early, share a link with regular customers |
| Operator | The Farmclub team | Manage defaults (stage and price presets), approve producers, products, and prices, handle refunds and exceptions. No operator screen in I1 |

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
| Reservation sales | Stage pricing: the earlier you buy, the cheaper it is. The platform gives defaults; the producer sets stage dates, prices, and quantities |
| Communication | Like Bubble, a farm sends 1:N messages to its followers. Replies are visible only between the consumer and the farm (1:1) |
| AI | Drafts product pages, gives first answers to repeated questions, and forwards only questions that need the farm's judgment |

- **Consumers** reserve high-sugar tangerines from a farm they trust, before harvest, at or below normal online prices, while watching the fruit grow.
- **Producers** paste the KakaoTalk or Band text they already use. AI handles the product page and repeated questions, and reservations show demand before harvest.

## 5. MVP Scope & Potential Accessory Features

**I1 goals**

1. G1. A consumer can follow a farm and complete a reservation order for tangerines at the stage price.
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
