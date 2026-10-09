# Proposal

## 0. Team Information

- **Team:** Team 6, Software Development Principles and Practice, 2026.
- **Project:** Farmclub.
- **Repository:** [swpp-2026-project-team-06](https://github.com/snuhcs-course/swpp-2026-project-team-06).

## 1. Project Name

**Farmclub** connects consumers with Jeju citrus farms. Consumers reserve fruit before harvest, follow its growth and ask the farm questions. Producers prepare product information, manage reservations and fulfill orders through a separate app.

- **I1 focus:** Connect reservation sales, farm communication and AI assistance in one prototype.
- **Business model:** Farmclub buys from farms and resells; Farmclub is the seller responsible for refunds.
- **Producer control:** Producers set reservation periods, prices and sales limits within approved supply capacity.
- **Prototype boundary:** Seeded test accounts and mock payments; no real money or settlement.

## 2. Target Customers

| Customer | Context | Main needs |
| --- | --- | --- |
| Primary consumer | Adults in their 40s-50s who prioritize taste and quality | Clear sweetness, price and delivery information; few steps and readable controls |
| Family purchaser | Adults in their 20s-30s ordering for parents or another recipient | Understandable product information and a separate recipient/address |
| Producer | Small Jeju citrus farms already selling through KakaoTalk or BAND | Reuse sales text, see demand early, manage supply and reduce repetitive support |
| Operator | The Farmclub team | Verify farms, approve supply and handle operational exceptions |

- Consumer and producer apps use separate accounts and role permissions.
- Producer business functions require farm approval; application/status screens remain available before approval.
- Each producer owns one farm and accesses only its products, orders and conversations.
- Consumers access only their own orders and private conversations. Public farm content is available before login.

## 3. Motivation

Consumers hesitate to reserve fruit when they cannot judge its quality before harvest. Small farms must attract customers, write sales content and answer repeated questions while producing the fruit. Farmclub brings quality information, advance ordering and communication into the same journey.

The team's I1 research synthesis, as of 4 October, supports a focused citrus prototype. These findings describe the study participants rather than every consumer or farm.

| Finding | Product response |
| --- | --- |
| Taste and sweetness were leading purchase criteria; uncertain quality discouraged reservations | Show measured/expected sweetness, quality standards and growing updates |
| Participants preferred shorter waits and prices comparable to ordinary online purchases | Show the expected delivery window and current reservation price together |
| Growing and harvest updates attracted interest | Give each farm a news room linked to its storefront |
| Interviewed farms had limited reservation-selling experience and used few photographs | Start from existing sales text and minimize product-entry steps |

Evidence and hypothesis assessments are recorded in [User Study Results](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/User-Study-Results) and the [research evidence summary](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/spec/evidence.md).

**Related services and proposed differentiation**

- **Nongsafund:** Uses agricultural funding and advance purchases, connects consumers with farmers, and shares the production process. Farmclub shares this relationship-oriented approach and focuses its prototype on citrus quality information, date-based prices, supply controls and producer workflows. [Official explanation](https://www.ffd.co.kr/think-ceo/?bmode=view&idx=169231526).
- **Wadiz:** Offers funding, preorder and store services across categories. Farmclub focuses on seasonal citrus reservations and ongoing farm communication. [Official company brief](https://static.wadiz.kr/file/ir/wadiz_company_brief_ko.pdf).
- **Local Line:** Provides farm storefronts, preorders, subscriptions and inventory tools. Farmclub combines consumer-facing Jeju citrus discovery with farm news, private support and AI assistance. [Official farm e-commerce overview](https://www.localline.co/suppliers/e-commerce-for-farmers).

These are differences in focus and proposed workflow, not claims that competitors lack communication or product purchases. The detailed comparison is in [Requirements and Specifications](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Requirements-and-Specifications).

## 4. Main Features

### 4.1 Reservation sales and fulfillment

- Show quality, current price and expected delivery before checkout.
- Let producers configure date-based prices, options and period allocations; earlier reservation periods are cheaper.
- Require operator approval for initial supply and later increases. Initial approval publishes the product; a pending increase does not interrupt existing sales.
- Keep reserved plus shipped weight within the producer's sales limit, and that limit within approved supply.
- Apply valid price edits to new orders; preserve paid price/weight snapshots and reconfirm changed unpaid terms.
- Support harvest preparation, shipment and pre-shipping cancellation. Release eligible canceled quantity once; post-shipping refunds do not restore supply.

### 4.2 Farm storefronts and communication

- Present farm profile/actions, products and then the farm story. Product details include long-form text/images and purchase disclosures.
- Let visitors read public news before login; follower-only news requires following.
- Keep consumer room replies private to that consumer and the owning farm. Provide a separate private 1:1 chat.
- Let producers post updates from their own news room and respond to order inquiries in context.
- Keep room content and previews consistent with login/follow state. Reading a room does not follow the farm automatically.

### 4.3 AI assistance with producer control

- Draft product information from existing sales text. Build farm/product stories with supplied text, registered facts and user-selected images; do not invent missing facts or transaction terms.
- Let producers edit, reorder, preview and explicitly save story blocks. Generation alone does not publish them.
- Preserve edits after generation/save failure and confirm before replacing existing work.
- Answer supported factual questions only when farm AI is ON and the conversation is AUTO.
- Forward sensitive or uncertain questions to the producer. A producer reply switches the conversation to HUMAN; resuming AUTO is explicit.

### 4.4 Navigation and task organization

| App | Bottom tabs | Main organization |
| --- | --- | --- |
| Consumer | Discover / My Orders / Chat / Me | Chat separates News Rooms and 1:1 conversations |
| Producer | Dashboard / Products / Chat / Settings | Farm profile/link and AI settings are under Settings |

- **My Orders:** Confirmed / Unconfirmed / Canceled-Refunded; default to Unconfirmed, exclude unpaid orders, prioritize required actions and preserve the selected filter.
- **Products:** Selling / Under review / Draft / Paused / Ended. A pending increase stays in the product's current group.
- **Dashboard:** Distinguish approved supply, sales limit, reserved, shipped and available weight from order/customer counts.

Detailed acceptance criteria, screen flows and implementation decisions are maintained in [Requirements and Specifications](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Requirements-and-Specifications) and [Design Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Design-Documentation).

## 5. MVP Scope & Potential Accessory Features

**I1 goals**

1. **G1:** A consumer can follow a farm and complete a mock reservation at the price for the reservation date.
2. **G2:** A producer can turn existing sales text into an editable product draft, complete required fields and request approval.
3. **G3:** A farm can publish news, use AI for supported questions and take over private conversations.
4. **G4:** A consumer can review sweetness, grade and the delivery window before payment.
5. **G5:** Evaluate the prototype using conversion, follow-to-order, question, AI-assistance and cancellation measures to inform I2. Definitions are in the [PRD success metrics](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/spec/prd.md); measurement is a goal, not a claim of completed analytics integration.

**Included extensions**

- Farm AI settings and response preview (FEAT-32).
- Order-problem inquiries with private photographs (FEAT-33).

**Outside I1 scope / future options**

- Real payment gateways, farm settlement and prepayment management.
- Kakao login, courier/tracking integration, external notifications and a dedicated operator UI.
- Products beyond citrus, non-standard produce, farm experiences, contract farming and CSA.
- Consumer-to-consumer discussion, AI content inference from photos/videos and natural-language shipping.

I1 implementation gaps and planned services are listed separately in [Design Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Design-Documentation). Goals here do not certify every requirement as implemented or tested.

## 6. Device Needed

- Consumer and producer access: a smartphone or desktop with a web browser; no app installation required.
- Demonstration setup: separate consumer/producer browser sessions with seeded role accounts and the local API/database.
- Reproduction prerequisites and configuration: [Design Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Design-Documentation).

## 7. Test & Demo Plan

1. **Prepare a product:** Reuse farm sales text, review the draft, complete sales settings and demonstrate capacity approval.
2. **Reserve:** Browse quality/timing, choose an option and recipient, accept the four consents and complete mock payment.
3. **Communicate:** Publish news, ask a factual question and demonstrate producer handoff for a sensitive question.
4. **Fulfill and recover:** Review demand, prepare/ship an order, cancel an eligible unshipped order and demonstrate a recoverable failure.

- Check role/ownership isolation, private content visibility, retry behavior and preserved input on failure.
- Review narrow mobile layouts and login/navigation return paths.
- Keep execution results in [Testing Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation); this section outlines the demonstration plan.

Product behavior is defined in the Korean [PRD](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/spec/prd.md) and linked functional contracts.
