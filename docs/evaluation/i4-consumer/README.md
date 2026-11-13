# I4 consumer demo and acceptance preparation

Owner: Minsun Kim. Related issues: DEV-281 (personal demo), DEV-262 (consumer sessions), DEV-277 (AI collaboration contribution).

## Observed release evidence — DEV-318 only

PR [#593](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/593) merged on 14 November 2026 at 03:08:57 KST as `021d912ba768e8ddc16153281c87ba7beac952b0`.

- [Merge queue CI](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/43477956507) checked that exact commit: apps, all three integration jobs and ci-ok passed.
- [Consumer deployment](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/43479827580/job/132073118619) logged the exact deploying SHA, performed a live check and updated deploy/vercel-consumer to that SHA.
- The default consumer Vercel alias returned HTTP 200; its served bundle filename matched the deployment export and contained the new recovery messages. The API health endpoint returned HTTP 200.
- These were read-only deployment observations. Authenticated production transactions and native device behavior remain unverified.

The separate correctness fix [PR #597](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/597), DEV-320, prevents duplicate stock reservations after an uncertain deposit response. Its dedicated four-case real-server recovery suite and five existing checkout regressions passed locally. It is awaiting CI/human review and has not been verified as merged or deployed. This three-scene demo records DEV-318 behavior and does not claim to exercise or deploy DEV-320. Identify each tested source commit separately.

## Decisions to settle before formal acceptance

| Decision | Owner / evidence | Required action |
| --- | --- | --- |
| Chat ordering and cursor oracle | Minsun + PM, [DEV-244](https://linear.app/sswp6/issue/DEV-244) | Reconcile the frozen createdAt+id expectation with the implemented persisted sequence. Record the decision and version/hash a replacement oracle when approved. Preserve the old v1.0 FAIL and denominator. |
| Official I4 submission rules | PM, [DEV-260](https://linear.app/sswp6/issue/DEV-260) | Confirm deadline time, required documents, demo branch, README/video format, filenames and team number from the actual I4 notice. |
| Session dates and participant target | Minsun + PM, DEV-262 and the 12 November meeting | Reconcile DEV-262's older 12–13 November dates with the later plan. Confirm participant target, actual recruitment, consent procedure and devices. |

The [12 November meeting](../../wiki/meetings/2026-11-12-uat-and-pilot-test-plan.md) schedules class UAT for **16 and 18 November**, using scripted tasks with classmates. External consumers and farmers take part in a later **pilot**, using their own phones and providing observation notes, SUS and a short interview, with PostHog evidence where configured. No approved participant count or finalized SUS administration procedure is recorded in this pack.

## Record the automated consumer demo

This is a silent, captioned technical demonstration of the three merged recovery fixes. It uses the real local FastAPI/PostgreSQL and consumer UI, synthetic records, simulated deposit reporting/producer confirmation, and one explicitly injected failed inquiry lookup.

Prerequisites: the repository's Node version, locked dependencies, uv, a local PostgreSQL database, and Playwright Chromium. Keep ports 8000, 8081 and 8082 available.

```sh
make setup
make db
npx playwright install chromium
# Create once: use a dedicated local database so the runner can reset its synthetic fixtures.
docker compose -f server/docker-compose.yml exec -T db createdb -U farmclub farmclub_i4_consumer

DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_i4_consumer \
FARMCLUB_INTEGRATION_SKIP_DOCKER=1 \
FARMCLUB_INTEGRATION_API=0 \
node scripts/run-integration.mjs scripts/e2e/consumer-i4-demo.spec.ts
```

The existing runner applies migrations, resets synthetic data in the selected database, starts the local apps and stops them after the test. The demo refuses application/API URLs outside localhost before its API mutations. Use the explicit local database URL above; the existing runner performs its database reset before the demo test starts.

Outputs live under the ignored `test-results/` directory: video, screenshots, a sanitized manifest, and a short evidence README. The manifest records the actual source commit and working-tree state, browser/environment, injected failure and simulation details, real assertion outcomes, and artifact hashes. API deployment SHA stays unknown unless independently supplied and verified. It contains no login token, bank account, contact/address value, participant response or private conversation body.

A failed demonstration remains a failed result. Trace recording is disabled to avoid retaining authentication. Inspect the sanitized manifest, screenshots and runner logs and record the defect before repeating; keep the old run separately if it is needed as evidence.

### Suggested narration

| Scene | Explain | Observable result |
| --- | --- | --- |
| Payment re-report | “This is a synthetic local order. After checking the earlier rejection, the consumer reports payment again.” | The current status becomes 입금 확인 중 and the old instruction to pay again disappears. |
| Producer confirmation | “This local API action simulates the producer confirming the transfer; no money moves.” | The already-open consumer detail becomes 예약 완료 without a manual reload. |
| Inquiry recovery | “One lookup request is deliberately failed to demonstrate recovery.” | Retry preserves the entered inquiry type, text and selected photo; the real local backend receives one inquiry. |

The video does not exercise real bank reconciliation, delivery, live Kakao authentication, production account permissions, native background behavior, AI answer quality, or participant comprehension. Existing technical regression suites cover additional cases; their results should identify the exact tested build separately.

## Run the consumer sessions

Use a private copy of [session-template.json](session-template.json) for each participant. The committed template is blank. Store recordings, raw notes and populated forms in the team's approved restricted location.

Before starting, record consent, environment, build, device/browser, fixture revision and participant code. Explain that the test evaluates the service. Let the participant try first and record every intervention. Use synthetic transactions in the prepared class environment; the separate own-phone production pilot requires the agreed team plan.

| Task | Neutral participant prompt | Record and verify |
| --- | --- | --- |
| UAT-I3-01: discovery/follow | “Find the farm or product you would choose and arrange to receive its updates.” | Intended result, saved follow state after navigation/reload, news visibility, unavailable-product handling and search recovery. |
| UAT-I3-02: reservation/order | “Reserve the option and quantity in this scenario, then tell me what happens next.” | Option, quantity, recipient, item price, fees, total, required consents and saved order agree. Exercise stock/quantity limits, missing consent, changed-price reconfirmation and one lost-response retry in the controlled fixture. |
| UAT-I3-03: private inquiry | “Ask the farm about this paid order and find the reply.” | Correct farm and order, one persisted text/photo under retry, producer/consumer agreement, private visibility and unauthorized-access denial. AI cases require the approved model/facts/settings. Technical history restoration uses the approved 8 CSS px criterion. |
| Separate cancellation/refund | “Cancel this eligible order, then explain the status shown.” | Allowed transition, reason, stock/payment effects, both roles' state and pending-versus-settled refund wording. |

Ask these comprehension questions after the unaided attempt:

1. What is the total amount, and what does it include?
2. When do you expect to receive the product?
3. What is the difference between reporting payment and the farm confirming it?
4. If you cancel now, what happens next and who acts?
5. Where would you find a reply about this order?

Record the person's own answer, unaided/assisted/failed outcome, elapsed time, help given, misunderstanding, expected/actual state, sanitized order/thread references and evidence location. Keep original failures with later retests and link the defect issue. An automated demo result must remain separate from participant observations and human acceptance decisions.

Privacy leaks, cross-account access, duplicate orders and wrong totals require a linked defect and explicit release decision under the existing protocol; an average task score does not erase them. Do not silently change the frozen oracle to fit an observed result.

## Your remaining handoff

- **Before the next class session:** settle DEV-244 with PM; obtain DEV-260's confirmed instructions; prepare participants and the private session sheets.
- **16 and 18 November:** class UAT according to the confirmed script. The defect retest checkpoints remain 16 and 19 November in the issue plan; coordinate the later class findings with PM.
- **By 18 November:** provide your own consumer demo segment (DEV-281), source/run instructions and limitations, plus your actual AI collaboration contribution (DEV-277).
- **19 November:** confirm your segment and evidence during PM compilation. DEV-273 owns the entire team demo.
- **20 November:** submission is the current planned date; the official time and required format still need confirmation through DEV-260.

