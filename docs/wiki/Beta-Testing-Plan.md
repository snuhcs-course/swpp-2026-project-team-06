# Beta Testing Plan (Iteration 5)

> **Status:** plan, written before testing (Nov 26, 2026). Submitted to eTL as a PDF by Nov 29, 23:59. If anything changes after submission, it is recorded in [§10 Change log](#10-change-log) with the reason. The original objectives and thresholds are not replaced silently.
>
> Linear: DEV-386 (plan), DEV-410 (telemetry), DEV-411 (outage plan), DEV-385 (Alpha), DEV-390 (Beta).

## Contents

1. [What Farmclub is](#1-what-farmclub-is)
2. [Beta objectives](#2-beta-objectives)
3. [Alpha rehearsal (Nov 30)](#3-alpha-rehearsal-nov-30)
4. [Participants and distribution](#4-participants-and-distribution)
5. [Telemetry and instrumentation](#5-telemetry-and-instrumentation)
6. [AI quality evaluation](#6-ai-quality-evaluation)
7. [Feedback, interviews and bug handling](#7-feedback-interviews-and-bug-handling)
8. [Operations during Beta](#8-operations-during-beta)
9. [Results for the poster (Dec 11)](#9-results-for-the-poster-dec-11)
10. [Change log](#10-change-log)

---

## 1. What Farmclub is

At the Nov 25 TA meeting, the TA asked us to define the app in one sentence and to derive every metric from that definition. This section is that definition. Each objective (§2) and each metric (§5) refers back to it.

**Farmclub in one sentence:** *Farmclub turns buying citrus into a relationship. Consumers follow a Jeju farm they trust, watch their fruit grow and reserve it before harvest. Farmers sell to a community of fans instead of strangers.*

### For consumers

**Know who grows your fruit, and be part of their season.**

Why use it:
- **You know the person behind the box.** Each farm posts its season from blossom to harvest, with photos and measured sweetness (Brix). You buy from a farmer you have watched, not from an anonymous listing.
- **You can talk to the farmer.** You can ask anything in a private 1:1 chat. An AI assistant answers simple factual questions right away, using only what the farm has registered. Anything that needs the farmer's judgment (taste, guarantees, refunds) goes to the farmer.
- **You are a fan, not just a customer.** Following a farm makes you its *Nth follower*. You can react to its news, take part in its challenges and come back each season.
- **Reserving early pays.** Prices are set by date, so the earlier you reserve, the cheaper it is. You pay the farm directly by bank transfer.

### For farmers

**Turn your regulars into a fan club, and let the app handle the paperwork.**

Why use it:
- **Your customers come back.** Followers see your news, react to it and get to know your farm over the season, so you are not selling to strangers each harvest.
- **You know demand before harvest.** Reservations show how much to set aside, and you control the periods, prices and quantities.
- **You keep your own words.** You upload the text or PDF you already send on KakaoTalk or BAND. The AI drafts a sales page from it, keeping your facts, and nothing is published until you review and apply it.
- **You answer fewer repeat questions.** The AI answers routine questions from your registered facts. Questions that need your judgment come to you, and you can take over any conversation.

### Core features

| Feature | One-line definition | Who |
| --- | --- | --- |
| **Follow a farm** (FEAT-06, FEAT-15) | Follow a farm, read its season updates, react to posts and see your follower number | Consumer |
| **Pre-order** (FEAT-05, FEAT-08, FEAT-09) | Reserve a box before harvest at a date-based price and report the bank transfer | Consumer |
| **1:1 chat with an AI first reply** (FEAT-12, FEAT-13) | Ask the farm privately. The AI answers routine facts and hands everything else to the farmer | Both |
| **AI page drafting** (FEAT-03) | Turn existing sales text or a PDF into a draft sales page that the farmer reviews and applies | Farmer |
| **Order handling** (FEAT-09, FEAT-17) | Confirm the deposit and ship with a tracking number. Both apps show the same order state | Farmer |

---

## 2. Beta objectives

The Beta asks four questions. Each question comes from the definition in §1. The success criteria are targets set now, before testing. If they change, the change goes in §9.

### O1. Do consumers become fans of a farm?

- **Why it matters:** the relationship is our main difference from ordinary online fruit stores. If testers browse but never follow a farm, the fan-community idea is not working.
- **Evidence:**
  - Telemetry: M1 (follow rate), M2 (time to follow) and M3 (engagement with farm news).
  - Interview questions I1 and I2.
- **Success criteria:**
  - At least **60%** of consumer testers who open a farm follow at least one farm.
  - The median time from first opening a farm to following it is **under 3 minutes**.
  - At least **half** of the followers react to a post or open the farm's news again on a later day.

### O2. Can a consumer go from interest to a reservation without help?

- **Why it matters:** pre-ordering is how farms earn money. It involves several steps (option, period, recipient, bank transfer report) that people outside the team have not tried yet.
- **Evidence:**
  - Telemetry: M4 (reservation conversion), M5 (time to reserve), M6 (follow → reservation) and M11 (errors).
  - Database: order state.
  - Interview question I3.
- **Success criteria:**
  - At least **80%** of consumer testers who start checkout submit a reservation and report the transfer without asking us for help.
  - The median time from opening the product to submitting the reservation is **under 5 minutes**.
  - **Zero** cases where the consumer and the farmer see a different order state.

### O3. Does chat bring consumers closer to the farmer without overloading the farmer?

- **Why it matters:** consumers trust the farm more when they can ask the farmer directly. Farmers told us repeat questions take too much of their time. The AI is meant to handle the routine questions and pass the human ones on, safely.
- **Evidence:**
  - Telemetry and database: M7 (AI answer share), M8 (time for the farmer to reply to a handed-off question).
  - AI review: §6.
  - Interview questions I4 and F2.
- **Success criteria:**
  - **Zero** unsafe AI answers: no unsupported price, date or promise, and no answer on a mandatory-handoff topic.
  - At least **50%** of routine factual questions are answered by the AI.
  - The median time for the farmer to reply to a handed-off question is **under 12 hours** during Beta.

### O4. Can a farmer go from their existing material to a live page, and from deposit to shipment, on their own?

- **Why it matters:** farmers must be able to run Farmclub without us. AI drafting is how they get a page without writing one from scratch.
- **Evidence:**
  - Telemetry: M9 (draft to sale request), M10 (deposit to shipment) and M11 (form errors).
  - AI review: §6.
  - Interview questions F1 and F3.
- **Success criteria:**
  - At least **3 of the 4** participating farms submit a sale request without our help after requesting a draft. With this few farms we report each farm individually rather than a percentage.
  - Every reported deposit is confirmed or rejected within **24 hours**.
  - No farmer gets stuck on a form error they cannot fix.

---

## 3. Alpha rehearsal (Nov 30)

The in-class Alpha on Nov 30 is a rehearsal for the Beta. It confirms that the released app and the telemetry work before real users start.

| Before Alpha (by Nov 29) | Owner | Linear |
| --- | --- | --- |
| Alpha build tagged `i5-alpha` and installed on a team device | Jinwoo | DEV-404 |
| Missing telemetry events added (§5.3) and seen in PostHog | Unassigned | DEV-492 |
| Labeled test farm and test accounts for the in-class Alpha session | Jinwoo | DEV-428 |
| Tester instructions: install route, core scenario, how to report a problem | Minsun | DEV-405 |
| OneStore: consumer app approved (Nov 26). Farmer app fixed and resubmitted, with the web app as the fallback in the instructions | Hyun | DEV-491 |
| PostHog switched on in the native apps, or testers sent to the web apps (see §4) | Hyun | DEV-436 |

**During Alpha.** Testers do the core flows on their own devices with no coaching:
- **Consumer:** find a farm, follow it, react to a post, ask a question in chat, reserve and report the transfer.
- **Farmer:** confirm a deposit, ship the order, answer a handed-off question.

The facilitator (DEV-406, Zahra) records time, completion, help given and problems. After each task, the team checks that the expected **event sequence** in PostHog matches the **saved state** in the database (§5.4).

**Alpha exit criteria (Beta go/no-go):**
- No open Critical issue (definition in §7).
- Every metric M1–M11 shows data from the Alpha session, or has its gap recorded with a fix owner.
- The install route works for every assigned tester.

Findings are triaged by Dec 2 (DEV-407) and fixed and retested before the Beta build (`i5-beta-rc`, DEV-417, Dec 6). Results go into the Testing Documentation (DEV-427).

---

## 4. Participants and distribution

| | In-class testers | Out-of-class testers (Beta) |
| --- | --- | --- |
| **Who** | About 3 students assigned by the course (same people for Alpha and Beta) | **12+ consumers** and **4 farms** (confirmed Nov 26; up to 6) |
| **Characteristics** | Classmates, on their own devices | Consumers: adults who buy seasonal fruit online. This includes our two personas: 40s–50s buyers who put taste first, and 20s–30s buyers sending fruit to their parents. Farmers: small Jeju citrus farms that already sell through KakaoTalk or BAND |
| **Recruitment** | Course slot sheet (signed up by Nov 26) | Consumers: personal networks, invitation message. Minsun recruits 6, and each other member recruits 2 (DEV-408). Farmers: Jinwoo phoned six farms we know from interviews and the pilot. Four agreed, one declined because its harvest was sold out, and one has not answered yet (DEV-409) |
| **Dates** | Alpha Nov 30, Beta Dec 7–11 | Farms start onboarding from Nov 26 so that products are listed before Beta. Beta measurement window Dec 7–11, evidence cutoff Dec 11 23:59 KST |

The course recommends at least 3 out-of-class testers. We aim for at least 16 (12 consumers and 4 farms) because Farmclub has two sides, and each side needs its own data. We kept to about four farms on purpose: all of them sell citrus, and too many similar farms would make choosing harder for testers and support harder for the team.

**Closed, invitation-only Beta.** An open beta is not practical because every farm has to be approved by the team first. Farmers get Jinwoo's onboarding message: how to register the farm, the in-app guide, adding a bank account, creating a product with "AI로 채우기", requesting a sale, AI reply settings, the news room, and confirming deposits and shipping. Consumers get an invitation with the install link and a consent note.

**Access routes:**

| Platform | Consumer | Farmer |
| --- | --- | --- |
| Android | OneStore app (approved Nov 26) | Web app until the farmer app passes OneStore review |
| iPhone, desktop | Web app at **farmclub.kr** | Web app at **farm.farmclub.kr** |

Testers use the **official domains**. PostHog records events only there, and the Vercel preview addresses do not send telemetry. **Open risk:** the native apps send events only if a PostHog key was built in, and the privacy policy currently covers analytics on the web only (DEV-436). Until DEV-436 is done, a consumer using the OneStore app may not be counted. If DEV-436 is not done before Alpha, testers are asked to use the web app.

**Testing conditions:**
- Testers give consent before taking part.
- **The Beta uses real farms and real products.** Buying is welcome but not required. A consumer who reserves pays the farm directly by bank transfer. Farmclub never receives or holds the money, so a farm loses nothing if no one buys. One real transaction already took place on Nov 26.
- Purchase measures (M4–M6, M10) count only real orders. Testers who only browse, follow or chat still count for M1–M3 and M7–M8.
- The labeled test farm (DEV-428) is used only for the in-class Alpha session. It is visible only to test accounts (DEV-472) and is cleaned up by a person afterwards.

---

## 5. Telemetry and instrumentation

### 5.1 Metrics

Each metric says what it means and which question it answers, as the TA asked. "Testers" means Beta testers with at least one session in the Beta window.

| ID | Metric | What it tells us | How it is calculated | Source | Objective |
| --- | --- | --- | --- | --- | --- |
| M1 | **Follow rate** | Do people who look at a farm want to stay connected to it? | testers with `farm_followed` ÷ testers with `farm_viewed` | PostHog | O1 |
| M2 | **Time to follow** | How quickly a farm wins a fan | median of (first `farm_followed` − first `farm_viewed`) per tester | PostHog | O1 |
| M3 | **Return engagement** | Are fans still interested after the first visit? | followers with `post_reacted` or a `farm_viewed` on a later day ÷ followers | PostHog | O1 |
| M4 | **Reservation conversion** | Can people finish a pre-order once they start? | testers with `deposit_reported` ÷ testers with `checkout_started` (also shown step by step: view → start → submit → transfer reported) | PostHog funnel | O2 |
| M5 | **Time to reserve** | Is ordering quick enough? | median of (`checkout_submitted` − first `product_viewed` for that product) | PostHog | O2 |
| M6 | **Follow → reservation** | Does following lead to buying? | followers who reserve at that farm ÷ followers | PostHog, database | O1, O2 |
| M7 | **AI answer share** | How many questions the farmer does not have to answer | AI answers ÷ consumer questions, plus the handoff share, by question type | Database (`thread_messages.sender_type`, `handoff_status`) | O3 |
| M8 | **Farmer reply time** | Do handed-off questions still get a human answer? | median of (farmer reply − handoff) | Database (`escalations`) | O3 |
| M9 | **Draft to sale request** | Can a farmer get a page live from their own material? | farmers with `sale_start_requested` ÷ farmers with `draft_requested`; median time between them; `draft_created.durationMs` | PostHog | O4 |
| M10 | **Deposit to shipment** | Do orders move without getting stuck? | median of (`deposit_decided` − `deposit_reported`) and (`order_shipped` − `deposit_decided`) | PostHog, database (`orders.*_at`) | O2, O4 |
| M11 | **Errors** | Where do people get stuck or the app breaks? | `form_error_shown` and `app_error_shown` per 100 sessions, by screen | PostHog | O2, O4 |
| M12 | **Active testers** | Is the Beta large enough to trust the numbers? | unique testers per day, by app | PostHog | all |

### 5.1a Course-required telemetry (TA announcement, Nov 26)

The TA's Nov 26 announcement makes four items mandatory: ANR, crash reports, feature usage and response time. We also add AI response time, which shows one of Farmclub's strengths.

| ID | Metric | What it tells us | How it is calculated | Source | Target | Status (Nov 26) |
| --- | --- | --- | --- | --- | --- | --- |
| M13 | **ANR rate** | Does the Android app freeze? | sessions with an "App Not Responding" event ÷ sessions, Android app only | Crash/ANR SDK in the Android store build (Sentry for React Native) | **< 1%** (course target) | **Blocked:** needs a new store build through the team's Expo organization (`snu-omm`); access requested from Hyun on Nov 26. If the build does not ship before Beta, M13 is reported as "not measured" with the reason |
| M14 | **Crash rate** | How often does the app break? | 1 − crash-free sessions, by app and platform; each crash with screen, app version and device | Web and app: the error screen (#843) logs `app_error_shown` (DEV-492). Android app: crash SDK (same build as M13) | ≥ 99% crash-free sessions | Web: ready once DEV-492 ships. Android: blocked like M13 |
| M15 | **Feature usage** | Which features do people actually use? | count of uses per feature per tester per day: follow, news reaction, 1:1 chat message, checkout, transfer report, AI draft, AI reply settings, news post, deposit decision, shipment | PostHog events (§5.2–5.3) and the server database (follows, posts, messages, orders) | Reported, no threshold. Every core feature is used by at least one tester | Web: ready (missing events in DEV-492). App: needs the PostHog key (DEV-436) |
| M16 | **Response time** | Does the app feel fast? | p50/p95 server response time per API route; p95 time to open the product page | Railway HTTP request logs (duration per request); PostHog page timing on the web | p95 server response < 1 s; product page p95 < 3 s | Server logs: available now. Page timing: web only |
| M17 | **AI response time** (strength) | How fast does a consumer get an answer without waiting for the farmer? | time from the consumer's question to the AI reply or handoff notice (p50/p95); AI draft time from `draft_created.durationMs` | Server database (message timestamps); PostHog | Chat p95 ≤ 8 s (the AI time limit); handed-off questions answered by the farmer within 12 h (M8) | Available now |

ANR and native crash reporting cannot be added with a code-only app update: they need native code in a new store build. If Expo access does not arrive in time, we keep Alpha and Beta testers on the web apps, where M14–M17 are measured, and report M13 as not measured.

Every metric is reported with its **sample size**. With fewer than 5 testers in a group, we report the counts and individual cases instead of a percentage.

### 5.2 Events already in the app

PostHog events defined in `packages/analytics/src/privacy.ts`:

- **Consumer app:** `product_viewed`, `checkout_started`, `checkout_submitted`, `deposit_reported`
- **Farmer app:** `product_editor_opened`, `draft_requested`, `draft_created`, `sale_start_requested`, `deposit_decided`, `invoice_saved`, `order_shipped`, `producer_reply_sent`, `form_error_shown`

### 5.3 Events to add before Alpha (DEV-492)

| Event | App | Properties | Needed for |
| --- | --- | --- | --- |
| `farm_viewed` | consumer | farmId, source | M1, M2, M3 |
| `farm_followed` / `farm_unfollowed` | consumer | farmId, followerRank | M1, M2, M6 |
| `post_reacted` | consumer | farmId | M3 |
| `consumer_message_sent` | consumer | kind (text / photo / sticker), hasOrderContext | M7 (client side) |
| `app_error_shown` | both | screen, errorKind | M11 |

There is no crash-reporting tool yet. App crashes are counted through `app_error_shown` from the error screen (#843) and through the server logs.

### 5.4 Verification

During Alpha, each core task is run once by a team member watching PostHog live. The expected events must appear in order and match the saved state in the database. For example, a `deposit_reported` event must match an order whose status is "transfer reported". Any missing or wrong event is recorded as an instrumentation gap, with an owner.

### 5.5 Privacy and consent

- Events carry internal IDs and fixed values only: no names, phone numbers, addresses, account numbers, message text or tracking numbers. A runtime filter drops properties that are not in the tracking plan (ADR 0005).
- Session replay hides every input field and every screen that shows personal data (`PRIVATE_PATHS`).
- Telemetry runs only on the official domains, so team testing on preview addresses does not affect the numbers (DEV-125, DEV-236).
- Testers agree to the analytics notice before testing. Interview notes record no personal details.
- Chat questions used in the AI review (§6) are read only by the team. They are added to the evaluation set only after personal details are removed.

### 5.6 What telemetry cannot show

Telemetry cannot show *why* someone stopped, or whether they trust the farm. It also cannot show visits that never reached the official domains. The interviews (§7) cover the why. Help given during a task is noted by the facilitator during Alpha. During Beta, testers report it themselves in the interview.

---

## 6. AI quality evaluation

Two AI features are in the Beta. Both follow the evaluation method we have used since I5: **capability evals**, built from real failures, and **regression evals**, which check that nothing that used to work breaks ([criteria §8](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/evaluation/i4-ai/criteria.md)).

### 6.1 Chat: AI first reply (O3)

| Dimension | Method | Threshold |
| --- | --- | --- |
| Safety: no unsupported price, date or promise; mandatory topics handed off | Automatic grounding checks on every answer, plus a team review of every Beta AI answer | **0** unsafe answers; mandatory-handoff recall **100%** |
| Usefulness: routine factual questions answered | Team review of Beta questions labeled answerable or not | ≥ 80% of answerable questions answered correctly (I4 synthetic result: 59/60, 98.3%) |
| Unnecessary handoffs | Same review | Reported with examples (I4 synthetic: 1/60) |
| No regressions | 180-trial regression set before the Beta build | 180/180 (DEV-414) |

**Failure analysis.** Every Beta answer the team marks wrong becomes a new capability task, with its expected result, before any fix. Each one is classified as rule gate, missing farm fact, model output, or check too strict or too loose. The I4 scores were measured on synthetic questions, so Beta questions are the first real-question measurement.

### 6.2 AI page drafting (O4)

| Dimension | Method | Threshold |
| --- | --- | --- |
| Processing reliability | Share of drafts that finish without an error (`draft_created.result`) | Reported separately from content quality |
| Essential-fact coverage | Diagnostic scorer on the 47 known sources × 2 trials | Current diagnostic: 263/272 (96.7%), up from 246/272 (90.4%). Target ≥ 95% with no drop |
| No invented or forbidden content | Automatic checks (money, health, platform claims) | **0** |
| Natural Korean, organization, keeping the farmer's voice | Human review of a sample of pages, plus the farmer's own judgment in the interview | Recorded as findings, not a single score. An LLM judge is used only after it agrees with human ratings |
| Farmer edits before applying | How much the farmer changes before applying (from real Beta sessions only) | Reported, no threshold |

The coverage number measures whether facts are kept. It does not measure semantic correctness, visual quality or performance on new farms. Uploaded farmer material stays private, and only aggregate scores are reported.

---

## 7. Feedback, interviews and bug handling

### 7.1 Short interviews (required by the course)

There is one 10-minute call or written form per tester after their first use. The interviews explain what the telemetry shows.

| # | Consumers | # | Farmers |
| --- | --- | --- | --- |
| I1 | What made you follow (or not follow) a farm? | F1 | How close was the AI draft to what you would write yourself? What did you change? |
| I2 | Did you feel you knew the farm and the farmer? What would make you feel closer? | F2 | Did the AI answer the right questions and pass the right ones to you? |
| I3 | Where did reserving or reporting the transfer slow you down or confuse you? | F3 | Where did confirming a deposit or shipping slow you down? |
| I4 | Did the chat answer your question? Did you trust it? | F4 | Would you invite your regular customers here? Why or why not? |
| I5 | Would you come back next season? (1–5) | F5 | Would you use this next season? (1–5) |

Notes are short, anonymized (Tester C1, F1, …) and are linked from DEV-418 and DEV-419.

### 7.2 Bug reporting and handling

- **Reporting channels:**
  - The in-app support chat (farmclub support).
  - The tester group chat.
  - The facilitator, during Alpha.
- **Tracking:** each report becomes a Linear issue (synced to GitHub) labeled `beta`. It records the build tag, device and steps, and includes no personal data.
- **Severity and priority:**

| Severity | Definition | Response |
| --- | --- | --- |
| **Critical** | Data loss, wrong money or order state, a privacy leak, an unsafe AI answer, or the app unusable for a core task | Fix or roll back the same day. Testers are told |
| **Major** | A core task cannot be finished without help, but a workaround exists | Fix during Beta if safe. Otherwise documented |
| **Minor** | Confusing wording, layout or slowness that does not block a task | Collected for after Beta |

- **Fix verification:** each fix links a PR and passes CI. It is retested on the deployed build by someone other than the author, and the retest is added as a new row next to the original result. Failed results are never overwritten.
- **Triage:** daily during Beta by Zahra (DEV-390), with owners Minsun (consumer side) and Jinwoo (farmer side).

---

## 8. Operations during Beta

During Beta, Jinwoo is the main technical responder and Minsun is the backup and handles communication with testers. There is no automatic failover. If the server or apps go down:
1. Check Railway and Vercel status and the logs.
2. Restart the service, or roll back to the last verified deployment.
3. Confirm one core task works.
4. Tell testers, and update them every 30 minutes until it is fixed.

AI calls have a spending cap. If the AI is unavailable, chat hands questions to the farmer, and drafting keeps the farmer's input so they can retry or write the page by hand. The full procedure is in DEV-411.

---

## 9. Results for the poster (Dec 11)

The A0 poster is due on eTL on **Dec 11**, the last day of Beta (DEV-421). The course asks for testing results to show how problems found in testing were fixed and what data shows the app's strengths. So Beta is run to have results before the poster is finished:

| When | What |
| --- | --- |
| Dec 7 (Beta day 1) | Telemetry and server logs collected from the first session (M1–M17). Interviews booked |
| Dec 7–9 | Interviews (§7.1) done in the first three days, not at the end |
| **Dec 9, 23:59** | **Results cut-off for the poster.** Numbers are taken from this point, with the sample size and date |
| Dec 10 | Poster reviewed (DEV-421) |
| Dec 11 | Poster submitted. Beta continues; later data goes into the final report (Dec 13) |

Every number on the poster shows its source, sample size and cut-off date. Synthetic or AI-judged results are labeled as such.

**Found in testing → fixed.** Each finding from HE, UAT cycles 1–2, Alpha and Beta that led to a change is kept as one row: finding, where it was found, issue, fix (PR), and retest result. For example, the UAT cycle 2 comment "AI를 생산자 사이드로" (show AI replies on the farm's side of the chat) was fixed in DEV-443. This table is the source for the poster's Testing & Evaluation section and the final report.

**Live demo.** The poster presentation (Dec 14) requires a live demo. It uses the test farm and test accounts (DEV-428), never a real farm's data. A recorded video of the same flow is kept as a fallback if the network fails (DEV-422).

---

## 10. Change log

| Date | Change | Reason |
| --- | --- | --- |
| 2026-11-26 | First version | — |
| 2026-11-26 | Before submission: added the course-required telemetry (ANR, crashes, feature usage, response time) as M13–M16, plus AI response time (M17) | TA announcement on Nov 26 (#announcements) |
| 2026-11-26 | Before submission: switched from test products to real farms and real purchases; 4 farms and 12+ consumers; OneStore status; native telemetry risk | Team decision in the Nov 26 chat. Four farms agreed to join, and the consumer app was approved |
| 2026-11-26 | Before submission: added §9, results timeline for the poster (cut-off Dec 9), the found-in-testing → fixed table and the live demo | Poster announcement on Nov 26: due Dec 11 (the last day of Beta), live demo required |
