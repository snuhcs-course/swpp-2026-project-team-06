# Farmclub — Iteration 3 working demo

SNU SWPP 2026 · Team 6 · Prepared 6 November 2026

Farmclub connects consumers with Jeju citrus farms through advance reservations, farm updates and private conversations. This branch contains both apps, the API, the source-analysis worker and operator tools.

- **Product snapshot:** [`efa684b`](https://github.com/snuhcs-course/swpp-2026-project-team-06/commit/efa684b4d5ee2ce00f6a939c280bcbe1d420147d) on `main` (after the last I3 fix, DEV-180 / #387). This branch is that commit plus this README.
- This README is specific to `iteration-3-demo`. The general project README is on `main`. Do not merge this branch into `main`.

## 1. Watch the demo

> **Videos are being recorded** and will be linked here and on [demo.farmclub.kr](https://demo.farmclub.kr/). Until then, the [Iteration 2 videos](https://demo.farmclub.kr/) show the same main flow without the I3 changes.

The I3 videos are silent walkthroughs recorded on the snapshot above, from local seed data with fictional people, farm, bank account and addresses, using the repository's own script (`demo/record/story.mjs`, section 5B), so they can be reproduced.

| Recording | What it shows |
| --- | --- |
| **Overall flow** | Producer applies → operator approves → producer sets up farm, AI product draft, prices, supply → operator approves supply → consumer finds, follows and reserves → farm confirms the deposit → farm news, AI chat answer and hand-off, farm reply → **harvest start and shipping (new in I3)** |
| **Consumer** | Search, follow, product detail, checkout, deposit instructions, reservation complete, news like, AI chat, farm reply, shipped order |
| **Producer** | Application, farm profile and bank account, AI text draft, stage prices, supply request, deposit approval, news, answering a handed-off question, harvest start, invoice and shipping |
| **Operator** | Producer approval and supply approval in the admin page |

What is real and what is simulated:
- **Simulated:** the videos start already signed in (real sign-in is Kakao; the test-account login used to record is a testing tool and is not shown); the bank transfer is a button ("입금을 마쳤어요") — no money moves; the clock is fixed to 2026-10-07 so the seeded reservation periods are open; the farm, people and account numbers are fictional.
- **AI shown in the videos:** only behavior verified in the I3 evaluation (section 3): the chat answers a delivery-date question from registered product data and shows its source, and hands a pesticide question to the farm without exposing the internal reason. The product draft uses the text-draft flow (FEAT-03, verified in I2): it fills only what the pasted text says and marks the rest "확인 필요" (needs checking); without a model key the app falls back to manual input, and the caption says so.

## 2. What Iteration 3 changed

I3 was an evaluation iteration: freeze test criteria, measure, fix what blocked the main journeys, and measure again.

| Area | Main I3 changes |
| --- | --- |
| AI customer support | Frozen 60-question protocol (DEV-154); state-safety, 8 s timeout and conflicting-evidence fixes (DEV-180): no stale AI reply after the farm replies or switches mode, conflicting registered facts are handed to the farm; forwarded reasons hidden from consumers (DEV-213/235) |
| AI product draft from sources | Two-stage draft that fills the detail page and explains removed text (DEV-186/188), OCR recovery per page and chunking for PDFs and long images (DEV-190/191), expected Brix prefill (DEV-228), new-product flow in two screens with an AI fill sheet (DEV-184) |
| Consumer | Farm search by variety (DEV-217), paused products marked and not reservable (DEV-215), changed stage prices reconfirmed at checkout (DEV-216), order status copy, back targets, KST date separators, newsroom after unfollow (DEV-207, 222–227, 229, 230) |
| Producer | Harvest start moves reserved orders to "preparing" so shipping can be done in the app (DEV-231), news send confirmation and delete (DEV-210), clearer order rows and support contact (DEV-209, 226) |
| Operator | Consumer farmclub support room and unified admin inbox (DEV-150) |
| Engineering | Per-issue task files (DEV-219), merge queue and sharded CI (DEV-234), moving deploy tags with post-deploy checks (DEV-139), schema migrations through `0025` |

## 3. Iteration 3 evaluation results

| Evaluation | Result | Evidence |
| --- | --- | --- |
| AI support, frozen 60 questions × 3 runs (T09, re-run after T22) | **180/180** (before fixes 141/180); state/failure guards **5/5** (before 3/5). 72 real model calls (`claude-haiku-4-5-20251001`), 99 rule-path answers, 9 injected faults | [`results-i3-b2.md`](docs/evaluation/i3-ai-support/results-i3-b2.md), first cohort [`results.md`](docs/evaluation/i3-ai-support/results.md) |
| Consumer AI answer accuracy (T08) | see report | [`docs/evaluation/i3-ai-support/`](docs/evaluation/i3-ai-support/) (DEV-167, #401) |
| Consumer journeys: discovery, preorder and order states (DEV-166, DEV-168) | see results | [`docs/evaluation/i3-journeys/results/`](docs/evaluation/i3-journeys/results/) |
| Producer source-to-page flow (T12) | see report | [`i3-t12-producer-flow.md`](docs/evaluation/i3-t12-producer-flow.md) |
| Heuristic evaluation, class session 2026-11-04 (5 evaluators) and team inspections (T15, T16) | findings, severities and follow-up issues | [`he-2026-11-04/results.md`](docs/evaluation/he-2026-11-04/results.md), [`i3-t15-consumer-heuristics.md`](docs/evaluation/i3-t15-consumer-heuristics.md), [`i3-t16-producer-heuristics.md`](docs/evaluation/i3-t16-producer-heuristics.md) |

The summary with methods, sample sizes and limits is in [Testing Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation).

## 4. Environment

| Item | Version / choice |
| --- | --- |
| Apps | Expo (React Native Web, TypeScript), Expo Router; consumer and producer apps. Node **24** (`.nvmrc`), npm workspaces |
| Server | Python **3.12** with uv; FastAPI, SQLAlchemy 2.0, Alembic; PostgreSQL **16** (Docker) |
| AI | Claude Haiku 4.5 through `server/app/ai` only; optional (no key → rule answers and hand-off, manual product input) |
| Hosted | Vercel (apps, admin, demo site), Railway (API, source worker, PostgreSQL), Cloudflare R2 |
| Lock files | `package-lock.json`, `server/uv.lock` (`npm ci`, `uv sync --frozen`) |

## 5. Run it locally

Prerequisites: Docker, Node 24 + npm, [uv](https://docs.astral.sh/uv/). macOS or Linux.

### A. Real API, both apps and the admin page — one command (recommended)

```sh
make setup        # npm ci + server uv sync --frozen
make db           # local PostgreSQL 16 in Docker
DEMO_DB=farmclub_demo ADMIN_WEB_PASSWORD=<choose-a-local-password> npm run demo
```

`npm run demo` resets the seed in the `farmclub_demo` database (your other local databases are untouched), then starts the API (http://localhost:8000, Swagger at `/docs`), the consumer app (http://localhost:8081), the producer app (http://localhost:8082) and the admin page (http://127.0.0.1:8090/login, with the password you chose). Stop with Ctrl+C.

- Log in with the seeded test accounts listed on each login screen (for example consumer 김민지 and producer 신규 생산자; others cover pending, rejected and suspended farms).
- Without `ANTHROPIC_API_KEY` in `server/.env`, AI chat still answers registered facts by rule and hands other questions to the farm; the AI product draft falls back to manual input.

### B. Re-record the videos

The I3 recording steps (signing in off camera so no login screen is filmed, and the I3 harvest/shipping scenes) are in [`demo/README.md` on `main`](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/demo/README.md) (PR #466). In short, with section A freshly started and `npx playwright install chromium` and ffmpeg installed:

```sh
# 1. sign the test accounts in once, off camera
DEMO_PROFILE=demo/.raw/local-profile ADMIN_WEB_PASSWORD=<same-password> node demo/record/prep-test-login.mjs
# 2. record the segments in order (each continues from the previous one's data)
for s in p1 a1 p2 a2 c1 p3 c2 p4 c3 p5 c4; do
  DEMO_HQ=1 DEMO_PROFILE=demo/.raw/local-profile ADMIN_WEB_PASSWORD=<same-password> \
  FARMCLUB_ADMIN_URL=http://127.0.0.1:8090 node demo/record/story.mjs $s
done
```

Segments are written to `demo/.raw/story/<segment>.mp4`. If a segment fails, restart section A (fresh seed) and start again from `p1`. Details: [`demo/README.md`](demo/README.md).

### C. Mock only (no database)

```sh
npm ci && npm run dev
```

Consumer http://localhost:8081, producer http://localhost:8082, shared Mock on 8083. No PostgreSQL, Kakao or AI key needed; Mock data is not evidence of server behavior.

### D. Tests

```sh
make test         # server pytest + alembic check, app Mock tests + typecheck, admin page tests
make test-integration   # real stack: API smoke + Chromium (heavier)
```

## 6. Hosted apps and documentation

- [Consumer](https://farmclub.kr/) · [Producer](https://farm.farmclub.kr/) · [Operator](https://admin.farmclub.kr/login) · [Demo videos](https://demo.farmclub.kr/)
- [Requirements & Specifications](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Requirements-and-Specifications) · [Design Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Design-Documentation) · [Testing Documentation](https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation)
- Earlier demos: [`iteration-2-demo`](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-2-demo), [`iteration-1-demo`](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/iteration-1-demo)

The hosted apps keep changing after this snapshot. To compare against this exact code, run it locally from this branch.
