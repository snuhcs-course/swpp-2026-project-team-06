## 2026-11-25 — TA meeting: user analysis and Alpha/Beta preparation

- **Attendees** — Hyun Park, Minsun Kim, Jinwoo Jang, Zahra
- **Record type** — TA meeting (in person), with same-day KakaoTalk preparation and follow-up

### Agenda

- Iteration 5 schedule and current priorities.
- Working demo: changes since the previous version.
- Feature testing criteria and acceptance testing (UAT cycle 2) results.
- Page generation results and limits.
- Beta testing plan, telemetry, server operations, and LLM contingency.
- Documentation status and questions for the TA.

### Preparation

- Jinwoo shared new Farmclub emoticons for chat.
- Minsun shared the design for fandom features: challenges and a "you are this farm's Nth follower" message, so the presentation could reference them before merge.
- The demo reused last week's I3 vs I4 farmer and buyer flow videos, because the newest changes were not merged yet.
- Page generation: with the revised source-reference mapping and corrected essential-fact criteria (some previously counted misses were unreasonable), essential-fact coverage on 47 known sources, run twice, rose from 246/272 (90.4%) to 263/272 (96.7%). Nine content or scoring misses remain. Partially processed sources are reported separately as processing failures, not as content errors.
- The class announced Alpha tester sign-up for the Nov 30 in-class Alpha, due Nov 26 23:59. The Alpha assignment carries over to Beta (Dec 7–11).

### TA Feedback

- **App identity** — Describe the app in one or two sentences, and each core feature the same way. This matters especially for the poster.
- **Telemetry** — Define measures from that app definition, not from whatever events exist. Example: how long it takes a consumer to follow a farm or to buy from one.
- **Metrics** — Explain what each metric means and why it matters. A number alone is not enough.
- **Distribution** — Browser-based access as the fallback testing route is appropriate.
- **Page generation** — The proposed page-generation flow looks good.

### Decisions

- Write a one-sentence app definition and one-line feature definitions, and derive the Beta telemetry measures from them.
- Present every metric with its definition and the question it answers.
- Keep browser access as the Alpha/Beta fallback.

### Action Items

| Item | Owner |
| --- | --- |
| Draft the app and feature definitions for the poster | Zahra, with the team |
| Map telemetry measures to the definitions and check existing PostHog events | Zahra, Jinwoo |
| Finish the producer editing page | Jinwoo (done Nov 26) |
| Contact at least four farms on Nov 26 to list real products | Jinwoo |
| Sign up for an Alpha slot by Nov 26 23:59 | Everyone |
