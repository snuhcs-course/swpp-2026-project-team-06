# Testing Documentation

**Team 6 — Farmclub | Iteration 2 record with Iteration 3 supplements | Revised 6 November 2026**

## Overview

The final internal workbook contains **77 cases: 66 PASS, 6 FAIL, 3 BLOCKED, and 2 NOT READY**. Of these, 72 were executed: **93.5% execution** and **91.7% pass among executed cases**. The PM withheld full-scope GO for the planned 20 October user test. I-18 is PASS because the readiness review was completed; it is not a release approval.

This report uses `SWPP_Internal_Testing_1_Final.xlsx` as the sole authority for these 77 outcomes. Prepared on 17 October, it records observations through **19 October 2026, 17:28 KST**. Separately verified GitHub logs supply historical automated-run evidence. A supplementary local execution on **22 October 2026**, explicitly requested for coverage measurement, uses product commit `691949e985080f372a45d54fa950191e88adb8ce`. Neither evidence set changes the workbook FAIL/BLOCKED states. Section 3.6 reports the new execution separately.

**Coverage evidence added:** the 22 October supplementary plan and the separate producer-owner targets committed on 23 October are retained; actual per-component reports and genuine report screenshots now appear below. Server statement/branch coverage is **90.90% / 75.47%**. Some component targets remain unmet, including consumer lines and admin JavaScript. Historical environment/attachment gaps and deployed retests remain open; measurements are not release approval (Section 7).


**Iteration 3 chat follow-up (6 November):** the [consumer chat evaluation and defect-regression supplement](#iteration-3--consumer-chat-evaluation-and-defect-regression-minsun-6-november) records the original **2 PASS / 2 FAIL / 1 BLOCKED** five-row evaluation, the separate first-paid-order reproduction, the nine-task fix plan, every retained implementation test attempt, and the final 7-API/57-browser regression plus later CI correction. These dated functional results do not alter the 77-case workbook or the older coverage measurements. Human review, genuine native backgrounding and deployment limits remain explicit.

## Contents

1. [Test Responsibility and Schedule](#1-test-responsibility-and-schedule)
2. [Unit and Integration Testing — Plan](#2-unit-and-integration-testing--plan)
3. [Unit and Integration Testing — Results](#3-unit-and-integration-testing--results)
4. [AI Module Testing](#4-ai-module-testing-iteration-3)
5. [Acceptance Testing](#5-acceptance-testing-plan-in-iteration-3-results-in-iteration-4)
6. [Alpha and Beta Testing](#6-alpha-and-beta-testing-iteration-5)
7. [Guideline Compliance](#7-guideline-compliance-and-submission-readiness)
8. [Complete Case Register](#appendix-a--complete-internal-test-register)
9. [Prior Plans and Revisions](#appendix-b--prior-plans-and-revision-history)
10. [Iteration 3 — Consumer journeys, AI and heuristic inspection (Hyun)](#iteration-3--consumer-journeys-ai-answers-and-heuristic-inspection-hyun-6-november)
11. [Iteration 3 — Consumer chat evaluation and defect regression (Minsun)](#iteration-3--consumer-chat-evaluation-and-defect-regression-minsun-6-november)
12. [Iteration 3 — Peer heuristic evaluation and closeout](#iteration-3--peer-heuristic-evaluation-and-closeout-6-november)

## 1. Test Responsibility and Schedule

### Plan

The workbook's “unit testing” means verification of an owner's functional area, including UI/API/DB checks; it does **not** consistently mean an isolated code-level unit test (`작성가이드!B15`).

| Component/activity | Responsible member | Writing and maintenance responsibility |
| --- | --- | --- |
| Consumer client, login, discovery, checkout, order views, and UX | Hyun Park (`현_소비자`) | C-01–C-23 and consumer regression procedures. |
| Producer client, product persistence/editing, source-assisted drafts, and producer integration | Jinwoo Jang (`진우_생산자`) | P-01–P-18 and producer validation, persistence, access, and publication tests. |
| Server authorization, manager actions, refunds/recovery, AI boundaries, and migrations | Zahra (`자라_운영자AI`) | A-01–A-18 and corresponding server/API/DB and AI-boundary tests. |
| Deployed cross-role journeys, release regression, and readiness | Minsun Kim, PM (`PM_통합`) | I-01–I-18, findings reconciliation, and external-test scope decision. |

**New-code policy:** the feature author writes/updates tests in the same PR, identifying relevant AC/story IDs. The component owner maintains them after merge. Defect fixes require regression cases. The [repository policy][policy] requires relevant server, Mock, type, and browser checks before code work is marked complete; documentation-only changes are excepted from application-test execution.

**Execution/merge policy:** CI runs for PRs to `main` and pushes to `main`. At the tested commits, relevant `server` checks comprise Ruff, pytest, and Alembic upgrade/check; `apps` checks comprise shared/Mock checks, client typechecks, and web exports; `integration` runs local API and Chromium scenarios. Relevant checks must pass before code merges, with human approval under repository policy. Path filters may skip execution, so read individual steps as well as job status. No nightly schedule is established. The later `admin-web` job is a 22 October addition, not evidence for the earlier workbook runs. [Tested workflow][workflow]; [22 October workflow][workflow-current].

| Timing | Planned activity | Actual record |
| --- | --- | --- |
| Feature development/relevant PR or push | Update tests; retain revision/results. | Identified CI runs in Section 3; not every historical PR was audited. |
| 17 October | Functional owners execute sheets and record environment/evidence/follow-up. | Producer entries at 23:06 KST; other observations continue on 18–19 October. |
| 18–19 October | PM checks core journeys and cross-role integration. | Morning run on 19 October; manager-enabled additional run 17:16–17:26 KST. |
| 19 October 17:28 KST | Review deployed P0 flows, failures, and E2E feasibility for planned 20 October UT. | I-18 review completed; full-scope GO withheld. |
| 22 October, supplementary | Declare coverage scopes/targets before measurement; run unchanged suites against isolated local dependencies. | Section 3.6: server/Node/API/Chromium results and component reports; original 77 outcomes preserved. |
| After fixes/dependency resolution | Repeat failed paths and affected regressions in their original environments. | Follow-up plan; no later outcome inferred for workbook cases. |
| 23 October 23:59 | Freeze reviewed Wiki/PDF snapshot for submission. | Submission step, not established by this workbook. |

### Results

Every assigned case has a status; none remains NOT TESTED. Five cases could not be completed and six executed cases failed. Confirmation times are recorded, but elapsed effort is not. The 17 October header is a planning date, not the date every case ran. Proposed 20 October UT is not evidence of external-test execution.

## 2. Unit and Integration Testing — Plan

### 2.1 Frameworks, scope, and isolation

Appendix A retains every procedure, observable criterion, outcome, environment, evidence reference, and follow-up. Original Mock-payment labels remain visible where deployed observations use the replacement direct-bank-transfer flow. No actual money transfer was made.

| Layer/dependency | Frameworks/method | Isolation and exclusions |
| --- | --- | --- |
| Server services, authorization, business rules, persistence | pytest, FastAPI TestClient, fixtures/monkeypatch, PostgreSQL; Alembic | The [fixture][fixture] creates a separate `_test` DB, rebuilds schema, reseeds tests, fixes the clock, enables seeded login, and clears the Anthropic key. Database-backed tests are not all isolated unit tests. |
| Shared API/Mock behavior and client logic | TypeScript and Node's built-in test runner via `npm run test:mock` | Mock contracts verify simulated behavior, not deployed APIs. Typechecking is not a runtime test count. |
| UI and cross-app integration | Playwright Chromium and Node API scenarios via `npm run test:integration:full` | The [runner][runner] starts local API/Expo clients, resets seeds, issues a local admin token, sets `EXPO_PUBLIC_API_MOCK=0`, and uses the source-analysis mock provider. Interception may induce failures; live OAuth/provider quality remain separate. |
| Manager/deployed API | Local seeded HTTP flows and Railway checks | A-01/A-04/A-05 mutations were local to protect shared seeds. Deployed access/preview/read checks do not establish deployed mutation success. |
| Live AI | Recorded questions, source comparisons, specific regressions | Small functional samples without complete model/decoding/prompt records or independent frozen evaluation. |
| Devices/external services | Browser/viewport checks; C-22 iPhone launch | Emulation does not establish physical-device E2E. APK, deferred sandbox, actual transfers/settlement, independent AI accuracy, and unrecorded user-study outcomes are excluded. |

### 2.2 Coverage goals and measurement

The 17–19 October workbook and inspected historical GitHub records did not establish numerical coverage goals or reports. `test_source_coverage.py` verifies source-analysis behavior; its name does not make it a coverage report. The revision therefore adds a **prospective supplementary plan saved on 22 October before local execution**, rather than assigning targets retrospectively to those earlier runs. It remains a local review draft under the user's no-commit-before-review instruction. [Saved plan and rationale](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/main/docs/submission/evidence/iteration-2/coverage-plan.md).

| Component / included original sources | Metric / target | Reason for target |
| --- | --- | --- |
| All server `app/**/*.py` | Statements ≥85%; branches ≥75% | Broad transactional/authorization logic requires deterministic verification. |
| Accounts, orders, messaging, each separately | Statements ≥90%; branches ≥80% | Identity, private data and state/stock transitions warrant stronger goals. |
| Source-analysis module | Statements ≥80%; branches ≥70% | Worker/parser/failure handling includes third-party/process boundaries; real model accuracy is evaluated separately. |
| Consumer `apps/consumer/src/**/*.ts,tsx` | Lines ≥60% | Rendering/platform branches coexist with business-facing routes; all routes stay included. |
| Producer `apps/producer/src/**/*.ts,tsx` | Lines ≥60% | Same UI scope, including asynchronous editor and approval gates. |
| Shared API `packages/api/src/**/*.ts` | Lines ≥80% | Shared transport/data/Mock contracts need stronger goals than rendering. |
| Shared UI `packages/ui/src/**/*.ts,tsx` | Lines ≥60% | Shared rendering and hooks are included. |
| Admin `api/**/*.js`, `assets/*.js`, `server.mjs` | Lines ≥80% | Session/proxy guards and runtime/browser entry points remain in scope. |

**Collectors and denominator.** pytest-cov 7.1.0 / coverage.py 7.16.2 use `--cov=app --cov-branch`; all 93 application Python modules are included, even unexecuted modules. Node V8 coverage and Chromium JavaScript coverage are merged by c8 12.0.0 with original source maps and `all: true`. All 142 original client/shared TypeScript/TSX source files and seven admin JavaScript files are present in the final report. Unexecuted modules remain at zero. Analytics' two TypeScript files are reported as additional measured scope; no target was predeclared for that separate package and no retrospective pass/fail is assigned.

Tests/harnesses, dependencies, generated declarations, build/bundle outputs, static HTML/CSS/assets, native wrappers/configuration and database migrations are outside these application-source boundaries. Temporary compiled Mock/Metro files supply maps but are not counted again as original sources. Source inclusion is fixed by the plan/configuration; no low-coverage application file is removed to improve a result. Statement/branch or line totals use covered/total counters, not a mean of per-file percentages, and Python/V8 metrics are never averaged together. V8 mapped line coverage is a different metric from Python executable-statement coverage.

Collection-only changes add maps/preload/configuration without altering existing assertions, retries or worker count. Browser video recording is off because the FFmpeg download failed; the installed full Chromium executable is selected explicitly. The source-enabled run's two conditional skips are run in a second source-disabled configuration. Full setup, commands, versions, tool-generated reports and raw-counter files are retained in the [evidence directory](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/main/docs/submission/evidence/iteration-2). These main-branch evidence URLs become available after reviewed merge; the local files are the review source until then.

### Owner-specific producer plan added on 23 October (DEV-118)

The following owner-declared split supplements the 22 October whole-producer target above. It uses a later commit, different collector and separate logic/UI denominators. Keep both dated measurements; do not interpret their percentages as a like-for-like increase or regression.

| Producer-owner scope | Predeclared target | Measurement / maintenance |
| --- | --- | --- |
| Logic: `apps/producer/src/lib/{gate,kakao,productGroups}.ts` | Lines ≥90%; branches ≥80% | Node experimental coverage; Jinwoo; `npm run coverage:producer` / `make coverage-producer`; results in Section 3.7 |
| Screens/UI: `apps/producer/src/**/*.tsx`, `pick.ts`, `sourceFiles.ts` | Lines ≥60% | Playwright V8/source maps; Jinwoo; `make coverage-producer-ui`; results in Section 3.7 |

**Producer targets (Jinwoo, DEV-118; committed before the first producer measurement).** The producer client is split into two layers because they are reachable by different tools. *Logic* (session gate, product grouping/status labels, Kakao state round-trip) is plain TypeScript that Node can import directly; it decides which screen a producer may open and what status a product shows, so it gets the higher target (lines ≥ 90%, branches ≥ 80%). *Screens/UI* are React Native Web components that only run inside the Expo web bundle in a browser, together with the browser file-picker/canvas glue in `pick.ts` and `sourceFiles.ts`; they are measured from the Playwright producer journeys and get a lower target (lines ≥ 60%) because layout branches, loading/error placeholders, and platform fallbacks are expensive to drive end-to-end. Excluded from both: shared `packages/*` (shared with the consumer app, not producer-owned), `node_modules`, Expo-generated files, and test files. External dependencies are isolated as in Section 2.1 (seeded local API, mock source-analysis provider, stubbed `window`/`sessionStorage` in Node).

### 2.3 Reproducible regression procedure

GitHub logs establish **Ubuntu 24.04, Python 3.12.3, pytest 9.1.1, Node 24.21.0, npm 11.19.0**; the workflow specifies PostgreSQL 16. Lockfiles at the tested commit pin dependencies. The following reconstructs automation at `c98be9b`; select `79eaea7` for the second run. It does not reproduce mutable deployed data/live-model output. [Server][server-log]; [apps][apps-log]; [integration][integration-log].

Use a fresh checkout, Docker Compose, and `uv`. The runner resets its database: use only a disposable local DB. Ports 5432/8000/8081/8082 must be free.

~~~sh
git clone https://github.com/snuhcs-course/swpp-2026-project-team-06.git farmclub-i2-verification
cd farmclub-i2-verification
git checkout --detach c98be9b7c150a316c3e5d32c04f4198a4b46ade8

# Select Python 3.12.3 and Node 24.21.0 with the local version manager.
python3 --version
node --version
npm --version
uv --version
git rev-parse HEAD

npm ci
(cd server && uv sync --frozen)
npx playwright install --with-deps chromium
docker compose -f server/docker-compose.yml up -d --wait

# Public local-test credentials from the repository Compose configuration.
export DATABASE_URL='postgresql+psycopg://farmclub:farmclub@localhost:5432/farmclub'
export FARMCLUB_INTEGRATION_SKIP_DOCKER=1
export EXPO_NO_TELEMETRY=1
export APP_ENV=local
export ANTHROPIC_API_KEY=''

(cd server && uv run ruff check .)
(cd server && uv run pytest)
(cd server && uv run alembic upgrade head && uv run alembic check)
npm run typecheck
npm run test:mock
npm run test:integration:full
~~~

The pinned runner uses `FIXED_NOW=2026-10-07T10:00:00+09:00`, seeded login, local API/client URLs, and `SOURCE_ANALYSIS_PROVIDER=mock`. [Playwright][playwright] uses one worker, zero retries, line/HTML reporters, `playwright-report/` and failure traces/screenshots/videos in `test-results/`. Process logs go to `.artifacts/integration/logs/`. CI uploads failure artifacts for seven days; neither inspected successful run has uploaded artifacts.

These historical commands do not produce code coverage. For the 22 October measurement at `691949e`, use section 2.5 and its saved coverage configuration; do not confuse the two revisions/environments.

### 2.4 Manual replay

1. Select an Appendix A case; reproduce environment, roles, account state, and prerequisites. Record app/server revisions, browser/device/OS, and time on retest.
2. Use isolated data. Kakao-only UI login does not expose seeded API identities; an existing profile is not a fresh registration.
3. Execute the procedure and observable criteria; retain original and revised commitments when flows change.
4. Record responses/UI, evidence, resulting data, and cleanup; use BLOCKED/NOT READY where execution is prevented.
5. Repeat the failed deployed path after a fix, then affected regressions. Keep API-only, local, CI, and deployed UI outcomes distinct.

Some workbook runs lack exact SHAs, browser versions, commands, or accessible screenshots/PM HTML. Appendix A preserves those limits.

### 2.5 Supplementary coverage reproduction (22 October)

The run used **macOS / Apple Silicon, Python 3.12.14, uv 0.13.5, PostgreSQL 16.15 (UTC), Node 24.19.0, npm 11.19.0, pytest 9.1.1, pytest-cov 7.1.0, coverage.py 7.16.2, c8 12.0.0, Playwright 1.64.0 and Chromium 156.0.8078.4**. Product dependencies were installed from the existing lockfiles. Coverage tools were installed separately without editing product dependencies/locks. The source hash is `691949e985080f372a45d54fa950191e88adb8ce`; only documentation/diagnostic files differed locally. This is additional local evidence, not a reproduction of the mutable deployed environment.

PostgreSQL ran as an isolated cluster bound to `127.0.0.1:55432`, with database `farmclub_i2_coverage`; pytest used its separate `_test` database. Every reset was local/disposable. Mock external providers and cleared AI keys prevented paid model calls. No production writes, real bank transfer or live Kakao sign-in occurred. The browser tests exercise mocked/intercepted external conditions where specified, not real provider quality.

The evidence folder contains `collect-coverage.sh`, `browser-coverage.cjs`, `playwright.coverage.config.ts`, `c8-config.json` and a run record. From a fresh copy of the reviewed files at that product revision, install `npm ci`, run `cd server && uv sync --frozen`, prepare an empty local PostgreSQL database with UTC timezone, and install Chromium. Then:

~~~sh
# Disposable local URL only; the runner resets its database.
export DATABASE_URL='postgresql+psycopg://farmclub@127.0.0.1:55432/farmclub_i2_coverage'
export FARMCLUB_INTEGRATION_SKIP_DOCKER=1
# Optional when using an already installed full Chromium:
export FARMCLUB_COVERAGE_BROWSER='/absolute/path/to/chromium-executable'
bash docs/submission/evidence/iteration-2/collect-coverage.sh
~~~

The script refuses to overwrite an existing coverage artifact directory. It runs the existing pytest suite, compiles existing Mock fixtures with source maps, executes the unchanged Node/admin suites, runs real-stack API/Chromium checks in source-enabled and source-disabled configurations, and generates c8 HTML/JSON. Under `server/`, the exact Python collection command is:

~~~sh
uv run --frozen --with pytest-cov==7.1.0 pytest --cov=app --cov-branch   --cov-report=term --cov-report=html:../.artifacts/i2-coverage/server-html   --cov-report=json:../.artifacts/i2-coverage/server-coverage.json   --cov-report=xml:../.artifacts/i2-coverage/server-coverage.xml   --junitxml=../.artifacts/i2-coverage/server-junit.xml
~~~

`COVERAGE_FILE` is set to the artifact directory by the script. The supplied run record distinguishes the actually executed commands from the packaged reproduction helper, which was assembled from them afterward and was not itself rerun as one script. Preserve original reports for any subsequent run rather than replacing this dated evidence.

## 3. Unit and Integration Testing — Results

### 3.1 Status definitions and totals

PASS = executed expectation met; FAIL = executed mismatch; BLOCKED = dependency/access prevents execution; NOT READY = implementation/build/merge/deployment unready; NOT TESTED = no attempt. PR creation or CI success alone never grants a functional PASS. Planned/Conditional/Excluded is a separate provisional UT-scope classification requiring a PM decision.

| Area | Total | PASS | FAIL | BLOCKED | NOT READY | NOT TESTED | Executed | Execution rate | Pass among executed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Consumer | 23 | 21 | 0 | 0 | 2 | 0 | 21 | 91.3% | 100.0% |
| Producer | 18 | 18 | 0 | 0 | 0 | 0 | 18 | 100.0% | 100.0% |
| Manager/AI | 18 | 18 | 0 | 0 | 0 | 0 | 18 | 100.0% | 100.0% |
| PM integration | 18 | 9 | 6 | 3 | 0 | 0 | 15 | 83.3% | 60.0% |
| **Total** | **77** | **66** | **6** | **3** | **2** | **0** | **72** | **93.5%** | **91.7%** |

Executed = PASS + FAIL. Execution rate = executed / total; executed-case pass rate = PASS / executed. PASS across the entire register is **85.7% (66/77)**. Eleven cases need attention: six failures, three blockers, two not-ready. Cases and automated assertions overlap and must not be added. These rates do not measure code or requirement coverage.

### 3.2 Dates, environments, and revisions

| Observation set | Date/environment | Recorded revision/limit |
| --- | --- | --- |
| Consumer | 18 October 18:20/19:55 KST; 19 October 01:50–02:10 KST; mostly deployed web; C-22 iPhone | App `f31c7b0`, Vercel redeploy 08:55Z, server “latest main” without SHA. Earlier Mock build replaced after `APP_API_URL` configuration. |
| Producer | 17 October 23:06 KST; local | All 18 cite [#113][pr113], without per-run SHA or OS/browser version. |
| Manager/AI | 18 October 00:55–02:20; local, Railway/development server, API/DB | PR links identify changes, not a single runtime SHA. Migration head recorded as 0013. Timestamp cells do not explicitly specify timezone. |
| PM morning | 19 October approximately 06:20–07:20 KST; deployed web/API | Reference `c98be9b`; existing Kakao consumer in browser, seeded identities through API. |
| PM additional run | 19 October 17:16–17:26 KST; decision 17:28 | Reference `79eaea7` / [#168][pr168]. App sources unchanged; app redeployment skipped. Health success does not directly establish runtime server SHA. |

### 3.3 Automated results and provenance

**Workbook local records:** A-18 records 324 pytest passes, Ruff success, 13 Mock tests, four workspace typechecks, seven real-server scenarios, 43 Chromium tests, and 49/49 HTTP checks at 18 October 01:13. A-10 separately records 327 pytest passes after three non-answer regressions, plus 7 + 43 integration checks at 02:10. Do not combine these runs or assume an unrecorded local commit/command.

**GitHub-verified records:** relevant test steps actually executed in both runs.

| Date (KST) / commit | Component/command | PASS / FAIL / skipped | Original report |
| --- | --- | --- | --- |
| 19 October 00:09–00:15; `c98be9b7c150a316c3e5d32c04f4198a4b46ade8` | Server: `cd server && uv run pytest` | 364 / 0 / 0; 364 collected, 55.53 s | [CI #39139177274 server][server-log] |
| Same run | `npm run test:mock` | 15 / 0 / 0; no cancelled/todo | [App job][apps-log]; four workspace typechecks and both web exports also passed |
| Same run | `npm run test:integration:full` | API 7 / 0 / 0; Chromium 43 / 0 / 0 | [Integration][integration-log]; browser 2.6 min, zero retries configured |
| 19 October 16:55–17:03; `79eaea724fa5ad1462958c111df14a967d357553` | Server: `cd server && uv run pytest` | 365 / 0 / 0; 365 collected, 68.53 s | [CI #39219190202 server][server-log-later] |
| Same later run | `npm run test:integration:full` | API 7 / 0 / 0; Chromium 43 / 0 / 0 | [Integration][integration-log-later]; browser 3.7 min, zero retries configured |

Automated success does not resolve the six deployed PM failures or establish successful first-order chat, new-product entry, or approved-producer re-login in that environment. No skipped cases appear in these specific summaries; that does not establish that every feature was tested. These historical CI runs did not collect component code coverage; the separate 22 October measurement is below.

### 3.4 Failures, blockers, and required retests

| Final status/case | Finding | Retest action |
| --- | --- | --- |
| FAIL I-06 | F-07 (P1): approved producer cannot open New product after retry/re-login; workspace API 404, private-product reads 200. | Restore entry, create isolated product, obtain capacity approval, compare consumer display. |
| FAIL I-09 | F-04 (P1): first-order inquiry cannot send; alternative chat works. F-05/F-06: reverse order/date difference. 26 bidirectional API checks pass. | First/existing chat, equal-time sorting, reload, KST midnight. |
| FAIL I-10 | Morning AI/edit APIs pass; afternoon source entry fails through F-07. Public E2E incomplete. | Generation → edit → capacity approval → consumer display. |
| FAIL I-11 | Approval/history/dashboard pass; Kakao re-login hangs (F-08, P1); direct home navigation is authenticated. | Approval followed by logout/re-login and automatic dashboard return. |
| FAIL I-15 | Earlier order/session checks pass; F-01/F-05 referenced; F-07/F-08 retry/re-login fail. | Unresolved recovery paths and affected regressions. |
| FAIL I-17 | Additional CI passes; deployed F-07/F-08 persist. | Critical deployed journeys; do not infer DEV-82 introduced defects. |
| BLOCKED I-07 | Private edit/conflict/requery pass; capacity-approval proxy 400 `BAD_PROXY_PATH`. | Supply permitted tooling; compare public description/options/price/cache. |
| BLOCKED I-13 | Cancellation/simulated refund/stock restore pass; manager history/recovery tool unavailable. | Authorized refund/exception history/recovery on isolated order. |
| BLOCKED I-16 | 360/390/430 px checks pass; PM physical Android/iPhone E2E unperformed. | Physical login/order/chat/home-screen launch. |
| NOT READY C-21 | No APK; TWA replaces EAS plan; native Kakao work deferred. | Physical installation/launch of delivered TWA APK. |
| NOT READY C-23 | PortOne deferred after bank-transfer change; excluded from UT. | Revisit if PG payout integration resumes; test current bank transfer separately. |

**Finding completeness:** I-18 reports eight findings, including afternoon F-07/F-08. Final rows describe F-02 (weekly-settlement policy versus direct payment), F-04/05/06/07/08 and reference F-01 without its full description. C-03 independently records misleading recovery copy but does not explicitly assign F-01. **F-03 is not described in the final workbook.** No description/severity/fix is invented. Eight findings are not eight independent failed scenarios.

### Follow-up retest on 20 October (SWPP-118) — outside the workbook counts

The 77 workbook statuses and totals above stay as recorded on 19 October. On 20 October Zahra re-ran the manager-side parts of **I-06, I-07, I-11 and I-13** on the live server (`api.farmclub.kr`, deploy `271fe87`) with an admin token issued in the Railway shell. Only labelled test data was changed (a new Kakao producer with the farm and product `ZAHRA 운영자 테스트 1020 (삭제 예정)`, and the seeded consumer `u-seojun`); seeded farms and products were not touched. The full 20-step record is preserved at [`b7d3417`](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/b7d3417/docs/wiki/Testing-Documentation.md) (section "SWPP-118 — Operator checks on the live server"), from [PR #189](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/189), [#195](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/195) and [#198](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/198).

| Workbook case (19 Oct) | 20 October live-server result | Still open |
| --- | --- | --- |
| I-06 FAIL | The test producer's product with a 5 kg initial capacity request was approved by the manager (stale version 409 `STALE_VERSION`, current version 200) and became visible on `farmclub.kr`. | The workbook's F-07 UI entry failure is not re-recorded here. |
| I-07 BLOCKED | Capacity approval no longer blocked; a public field edited by the producer appeared on the consumer page after reload. | — |
| I-11 FAIL | Reject with reason → reapply → approve: 200 each, two decisions in history by `u-admin`; the producer app showed the reason/prefilled form and then the dashboard. Same-key re-approval returned the identical response; no token 401, consumer 403. | Logout → Kakao re-login (F-08) was not part of this run. |
| I-13 BLOCKED | Bank-transfer order; deposit confirmed once with a repeated key; ₩500 partial refund kept the order `RESERVED` with one refund row; final refund → `REFUNDED`, stock released once; duplicate refund 409 `INVALID_TRANSITION` and audited; producer marked the refund as sent. | Partial-refund display for consumers and farms is deferred by design ([issue #126](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/126), DEV-62). |

I-10 (AI draft → producer edit → consumer display) was not run on 20 October and stays as recorded.

### 3.5 Analysis and readiness

Local component passes did not establish deployed E2E readiness. Producer local passes coexist with workspace failures; manager authorization/local refunds coexist with deployed tooling restrictions; AI samples coexist with incomplete publication. Each conclusion retains its environment and full procedure.

The aggregate 91.7% pass rate masks a materially weaker PM integration result: 9/15 executed scenarios passed (60.0%). This difference supports retaining results by test area rather than reporting only an overall percentage. The rate is conditional on execution; it provides no successful-execution evidence for the five blocked/not-ready cases. Narrow PASS observations also retain their limits: C-18 excludes server 5xx responses, C-22 verifies iPhone home-screen launch rather than complete mobile journeys, and P-11 is a single source-comparison example.

The change from three to six reported failures primarily corrects the status of I-06/I-10/I-11 after additional access enabled further execution. It is not evidence by itself that three new defects were introduced between builds. Likewise, passing seeded automation alongside failing deployed UI establishes a verification gap, but does not isolate its cause. Retesting must record the original account state, app/server revisions, and deployment configuration before attributing a failure to a particular merge.

Recorded safeguards include order idempotency, manager replay protection, authorization refusal, fixed non-answer handoff, and input/version recovery in stated samples. Nevertheless, six failures and five unexecuted cases remain. Full-scope GO was withheld.

| Provisional 20 October UT scope | Planned | Conditional | Excluded |
| --- | ---: | ---: | ---: |
| Consumer | 18 | 4 | 1 |
| Producer | 0 | 18 | 0 |
| Manager/AI | 0 | 14 | 4 |
| PM | 8 | 10 | 0 |
| **Total** | **26** | **46** | **5** |

The summary excludes real/PG/sandbox payments and AI wrong-answer reporting from planned UT. A-13 internal PASS does not remove its external exclusion. No subsequent restricted-scope approval or actual 20 October UT result is established.

### 3.6 Supplementary local regression and coverage — 22 October 2026

**Source:** product commit `691949e985080f372a45d54fa950191e88adb8ce`; environment/commands in section 2.5. The saved plan preceded execution. [Execution record and files](https://github.com/snuhcs-course/swpp-2026-project-team-06/tree/main/docs/submission/evidence/iteration-2). Source-enabled and disabled runs share the same unchanged test suite and isolated database; their repeated API checks are not 14 unique scenarios.

| Run / command | PASS | FAIL | Skipped | Elapsed / interpretation |
| --- | ---: | ---: | ---: | --- |
| Initial pytest + coverage | 420 | 2 | 0 | 148.92 s; two timestamp serialization assertions under the cluster's initial Asia/Seoul timezone |
| Final pytest + coverage after DB timezone correction | **422** | **0** | **0** | 72.76 s; final server report generated 22:03:55 KST |
| Existing Mock contracts (`node --test`, original script file list; source-map compile) | 22 | 0 | 0 | 27.055 s; not deployed API/model accuracy |
| Admin Node suite (`node --test scripts/admin-web/admin.test.mjs`) | 18 | 0 | 0 | 0.894 s; handler/session/proxy checks, not full admin browser coverage |
| Real API integration, source enabled | 7 | 0 | 0 | Existing local cross-role scenarios |
| Chromium, source enabled | **65** | **0** | **2** | 5.4 min; two source-disabled fallback cases skipped by their original flag condition |
| Real API integration, source disabled | 7 | 0 | 0 | Same seven scenarios repeated for the second configuration |
| Chromium, source-disabled file only | **2** | **0** | **0** | 4.5 s; both previously conditional fallback cases pass |
| TypeScript workspace checks | 5 checks | 0 | 0 | Consumer, producer, analytics, API and UI; static checks, not additional runtime cases |
| Ruff / Alembic check | Both pass | 0 | 0 | Lint plus no new schema upgrade operations detected |

**Initial failure analysis.** `test_AC_01_3_pending_and_rejected_producers_can_read_application` and `test_AC_01_7_rejected_producer_can_reapply_with_same_farm` compared the same instant serialized as `2026-10-07T10:00:00+09:00` versus `2026-10-07T01:00:00Z`. The isolated PostgreSQL cluster initially inherited Asia/Seoul. Setting that cluster to UTC and rerunning resolved both without changing product code or assertions. The original failing log remains in the evidence folder. This establishes a local environment dependency and a UTC reproduction condition; it does not prove behavior under every deployment timezone.

**Server coverage.** Statement = covered executable lines / statements; branch = covered branches / branches. Component rows are subsets of the total, not additional independent totals.

| Server component | Statement coverage (covered/total) | Target | Branch coverage (covered/total) | Target | Assessment |
| --- | ---: | ---: | ---: | ---: | --- |
| All application Python | **90.90% (7,676/8,444)** | ≥85% | **75.47% (1,674/2,218)** | ≥75% | Both met |
| Accounts | 92.41% (499/540) | ≥90% | 77.69% (101/130) | ≥80% | Branch goal missed by 2.31 percentage points |
| Orders | 94.55% (833/881) | ≥90% | 75.73% (156/206) | ≥80% | Branch goal missed by 4.27 points |
| Messaging | 95.03% (1,052/1,107) | ≥90% | 81.20% (190/234) | ≥80% | Both met |
| Source analysis | 83.28% (2,042/2,452) | ≥80% | 69.53% (559/804) | ≥70% | Branch goal missed by 0.47 points |

![Actual coverage.py report, 22 October](images/i2-coverage-server.png)

Figure T1. Genuine coverage.py 7.16.2 HTML report screenshot. Its header **88%** combines statement and branch opportunities and is rounded; it is **not** the statement-only 90.90% above. The complete navigable report, including all files, is retained in `coverage-html-reports.zip` (`server-html/index.html`).

**Client/shared/admin coverage.** These are V8 observations mapped to original sources, combining Node contracts with both Chromium configurations. All unexecuted in-scope files remain in the denominator. Percentages are calculated from counters and rounded to two decimals; c8's native display may truncate at the second decimal.

| Component | Line coverage (covered/total) | Predeclared line goal | Functions | Branches | Assessment |
| --- | ---: | ---: | ---: | ---: | --- |
| Consumer | **54.34% (3,431/6,314)** | ≥60% | 46.83% | 69.46% | Missed by 5.66 points |
| Producer | **72.22% (8,780/12,158)** | ≥60% | 51.53% | 79.18% | Met |
| Shared API | **86.02% (6,278/7,298)** | ≥80% | 66.43% | 75.07% | Met |
| Shared UI | **85.66% (4,051/4,729)** | ≥60% | 80.14% | 82.54% | Met |
| Admin JavaScript | **68.15% (214/314)** | ≥80% | 92.31% | 73.15% | Missed by 11.85 points |
| Analytics (additional scope) | 79.13% (201/254) | None declared | 81.25% | 80.77% | Measured; no retrospective target |

![Actual c8 original-source report, 22 October](images/i2-coverage-client.png)

Figure T2. Genuine c8 HTML report screenshot. Combined in-scope V8 line coverage is 22,955/31,067 (**73.89%** rounded; native c8 displays **73.88%** truncated). It is not averaged with Python. The entire client report is retained in the same ZIP (`client-html/index.html`); `client-coverage.json`, summaries and server JSON preserve file counters and uncovered locations. Published JSON replaces only local absolute paths with repository-relative paths; counters are unchanged.

**Interpretation and action.** Consumer coverage is particularly weak in onboarding/profile/address and some order/list interactions, despite core checkout scenarios passing. Admin Node tests exercise handlers, but `assets/admin.js` and `server.mjs` are unexecuted in this collection and remain at zero. Hyun should add consumer interaction regressions; the operator/server owner should cover the browser glue/local entry and remaining proxy/session paths. Zahra should use the retained uncovered branch lists to extend account/order failure and source-worker recovery tests, preserving the original goals. Target misses describe unobserved paths, not proof that every such path is defective. Do not exclude those paths or weaken assertions to improve a percentage.

The two conditional browser skips are resolved within the local matrix, not silently omitted. The successful local runs still do not close the workbook's deployed defects, supply missing physical-device evidence, establish live OAuth/provider/real-transfer correctness, or validate the NFR latency/load/uptime goals. Retest the six deployed failures with recorded account/app/server revisions before changing readiness.

### 3.7 Producer-owner coverage results — 23 October (DEV-118)


Measured on **23 October 2026** at commit `0637847` (branch `jinumeral/dev-118-producer-coverage`), macOS, Node 24.15.0, Chromium from Playwright 1.64, local PostgreSQL 16 in Docker. Targets were committed in `307e57c` before the first measurement.

| Component | Frameworks | Target | Actual | Result | Command / report |
| --- | --- | --- | --- | --- | --- |
| Producer logic (`apps/producer/src/lib/{gate,kakao,productGroups}.ts`) | Node test runner, `--experimental-test-coverage` | Lines ≥ 90%, branches ≥ 80% | **Lines 100%, branches 100%** (16 tests, 16 pass) | Met | `npm run coverage:producer` (also `make coverage-producer` once DEV-118's Makefile PR merges) |
| Producer screens/UI (`apps/producer/src/**/*.tsx`, `lib/pick.ts`, `lib/sourceFiles.ts`; 45 files) | Playwright Chromium V8 coverage, monocart-coverage-reports source-map remapping | Lines ≥ 60% | **Lines 66.03%** (7,726 / 11,700); branches 53.25%, functions 52.68% | Met | `FARMCLUB_COVERAGE=1 npm run test:integration:full` then `npm run coverage:producer-ui` → `.artifacts/coverage/producer-ui/index.html` |

Reproduce with the Section 2.3 setup, using a disposable database because the runner reseeds it:

~~~sh
export DATABASE_URL='postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub_dev118'
export FARMCLUB_INTEGRATION_SKIP_DOCKER=1 EXPO_NO_TELEMETRY=1
npm run coverage:producer
rm -rf .artifacts/coverage
FARMCLUB_COVERAGE=1 npm run test:integration:full
npm run coverage:producer-ui   # generates the report once and then clears the coverage cache
~~~

**Test counts.** Logic: 16 tests, 16 pass, 0 fail, 0 skipped. Coverage run of the real-stack suite: 7/7 API scenarios and 65 Chromium tests passed, 0 failed, 2 skipped. The two skips come from the specs' own `test.skip` environment guards (for example `SOURCE_ANALYSIS_ENABLED` in `product-page-workspace.spec.ts`); DEV-118 did not change them and did not identify the exact two cases. Coverage collection is off unless `FARMCLUB_COVERAGE=1`; CI runs the same specs without it.

**Baseline and change.** Before DEV-118 the logic layer measured 84.13% lines over `gate.ts` and `productGroups.ts` only; `kakao.ts` had no test, so no test loaded it and it was absent from that figure rather than counted as 0%, and `productStatus()` was untested. DEV-118 added `scripts/test-producer-kakao.mjs` (one-time Kakao state, AC-01-16) and `scripts/test-producer-status.mjs` (status labels, AC-04-7) to `npm run test:mock`.

**Gaps.** The UI layer meets its line target, but branch coverage (53.25%) shows that many error/loading/platform branches are not driven end to end. Lowest files (per-file line figures from the JSON summary): `app/broadcast/new.tsx` (≈14% lines), `app/(tabs)/farm/account.tsx` (≈17%), `app/(tabs)/products/[id]/stages.tsx` (≈20%), `app/(tabs)/farm/edit/[field].tsx` (≈23%), and `lib/sourceFiles.ts` (11%; the browser file dialog is replaced by Playwright file choosers). These are Iteration 3 candidates for producer E2E cases. Limits of the method: both collectors count only files that the tests load (the logic command lists its test files explicitly, and the UI report covers files in the producer web bundle), so a new untested `lib/*.ts` file or a file outside the bundle would be missing rather than reported as 0%; all 45 declared UI files are present in this run. The console summary counts lines with V8 byte ranges; the JSON summary of the same run reports 64.89% lines because it counts lines differently; both exceed the target, and the table uses the console/HTML figure shown in the screenshot.

![Producer logic coverage: 100% lines and branches](images/i2-producer-coverage-logic.png)

![Producer screens/UI coverage summary: 66.03% lines](images/i2-producer-coverage-ui-summary.png)

![Producer screens/UI coverage HTML report](images/i2-producer-coverage-ui-report.png)

## 4. AI Module Testing (Iteration 3)

### Plan

**Original I2 commitment (retained):** commit at least 30 frozen input/expected-behavior cases, label/rating provenance, an evaluation design discussed with the TA where ground truth is difficult, and per-case schema/rubric/tolerance/human assertions. Exact string matching cannot be the sole criterion. Commit thresholds before evaluation; record model/version, prompt, decoding settings, and command. Add cases without removing/editing submitted cases.

**I3 plan and execution references, 6 November.** DEV-154 committed the [60-case synthetic question set](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/i3-ai-support/questions.jsonl), [rubric/protocol](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/i3-ai-support/protocol.md) and [digest/runtime manifest](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/i3-ai-support/run-manifest.json) at `f08134d` on 31 October, before the 3 November cohort. Six strata contain ten cases each; three trials per case yield 180 observations, not 180 distinct questions. The protocol separately judges action, all required facts/units/qualifiers, source references, persisted state, and privacy/safety. Required handoff/human-only cases target 100%, answer trials target at least 95%, and safety-critical unsupported claims/privacy leaks target zero; the original protocol's pending DEV-152 alignment and required human readiness decision remain explicit. These targets were not reset to match the outcome.

The [runner and reproduction instructions](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/28feb94ac47b259b6a6299e9fd742b75e756a33d/scripts/i3-ai-support/README.md) and each cohort's manifest/log record model, code/prompt versions, seeded order, environment, settings and command. Controlled provider faults and synchronized state changes are separate from genuine model calls. Numeric checks are supplemented by review of persisted answers against the gold facts, qualifiers and references; the owner/reviewer provenance and limits are stated in the cohort reports. Producer source-analysis methods and results are summarized below with their own data, scorer and holdout boundaries. Repository/agent regression tests and the CI specification checker do not measure product AI accuracy.

### Results

The original I2 samples P-10–P-13/A-07–A-12 remain below as historical functional observations. They do not establish independent AI accuracy. I3 now has the following separately reported cohorts:

| Cohort / evidence | Observed result against the original criteria | Interpretation |
| --- | --- | --- |
| [DEV-169 original support cohort](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/i3-ai-support/results.md), 3 November, application `3f7ce29`, `claude-haiku-4-5-20251001` | 141 / 180 trials passed; 47 / 60 stable cases. Conflicting facts 0/30; operational failure 21/30; other four strata 30/30 each. Stale results persisted in six transition trials and timeout handoff took 8,019–8,025 ms. | Readiness not met. Only 72 trials called the live model; rule/fault paths remain separately counted. Three defects were retained, assigned and corrected; no original verdict is rewritten. |
| [DEV-180 support retest](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/i3-ai-support/results-i3-b2.md), `i3-b2-e871acc` | 180 / 180 trials passed and all five integration guards passed; timeout handoff 7,517 ms, no stale reply in the tested transitions. | Separate repair cohort on the same frozen synthetic set, with trace-review and provider/path limits in the report. This does not establish unseen-question performance or erase the earlier FAILs. |
| [DEV-167 consumer-answer inspection](#consumer-ai-answers-dev-167), `i3-b2-87792b7` | 60 / 90 trials passed; conflicting-facts 0/30 and six unsafe contradictory promises retained. | DEV-167's own rows were not rerun on a new fixed cohort. Its owner inspection and matrix decision remain distinct from DEV-180's retest. |
| [Producer source extraction, DEV-170/182](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/28feb94ac47b259b6a6299e9fd742b75e756a33d/docs/spec/validation/source-final-eval-i3-2026-11-01.md), 1–2 November | Development r4: 72/87 facts, 35/42 critical facts. First v1.1 holdout: 59/261 facts; T23 rerun: 74/261 facts, 32/109 critical, two forbidden detections, zero unsupported tokens; $0.190412 across 93 calls. | Recall uses normalized mustContain matching and precision is a support proxy; human semantic/evidence audit remains incomplete, so the guideline's broader AI-quality criterion is not fully satisfied. Original failures and contamination caveats remain. The 12-source v1.1 corpus was retired into development after reuse; neither rerun nor a selected demo establishes independent acceptance. The public report supplies per-format, settings and command details. |
| [Producer refinement comparison](AI-Collaboration-Report---Iteration-3---Evidence#3-what-ai-did-well), fixed candidates from 47 development materials | Three trials per arm: facts 683→699/1062; critical facts 313→321/462; forbidden detections 6→5; unsupported tokens 2→2. | Repeated 354/154 facts, refinement stage only. Semantic review found an upper bound rewritten as an approximation; the later qualifier fix was not paid-evaluated. This is not a clean holdout or full-pipeline quality pass. |
| [Independent source holdout v2](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/28feb94ac47b259b6a6299e9fd742b75e756a33d/docs/spec/validation/source-final-holdout-i3-v2.md) and public hash lock | Protocol/data definition: 12 sources, 72 sentences, 134 facts, 33 critical facts; 44 disputed items excluded before scoring. | A frozen protocol/hash manifest is preparation. It is not a measured performance result; private holdout contents remain isolated from tuning. |

Sample sizes, unchanged/changed settings, latency, failure causes and reviewer decisions are linked at the owning result. New coverage percentages, unseen-data accuracy and a completed formative user study are not inferred. The later source/draft results and peer/internal heuristic methods are linked in the I3 supplements; they retain their own denominators.

## 5. Acceptance Testing (Plan in Iteration 3; Results in Iteration 4)

### Plan

**Original I2 commitment (retained):** at least five stories, observable acceptance criteria, tester procedures, and a story freeze after I3. The [previous AC catalogue][prior] remains a development plan; Appendix B explains I2 revisions.

**Frozen I3 UAT plan v1, 6 November 2026.** The six stories below translate the selected I3 journeys into the I4 acceptance-test plan. The accountable coordinator is Minsun Kim; the relevant feature owner supplies the isolated candidate environment and a reviewer records observations. Use synthetic accounts/data, the candidate's exact code/schema/model versions and the existing evaluation fixtures. Capture task completion, errors, assistance, expected/actual states and safe evidence. The stories and criteria are retained after I3; later clarifications must be dated addenda, not silent edits. This is a prospective UAT plan, not six newly executed tests or a claim of participant recruitment.

| Frozen story | Observable acceptance criteria | Tester procedure and evidence |
| --- | --- | --- |
| UAT-I3-01 — As a consumer, find a farm/product and follow the farm to keep its updates. | The intended farm/product can be found; follow state remains correct after navigation/reload; its news appears in the expected room/feed. Paused/unavailable products are not presented as purchasable. A failed list request exposes recovery without duplicating rows. | With the seeded consumer, search/browse, open farm and product, follow, reload and inspect news. Repeat with a paused product and one controlled list failure; record visible state and saved follow/result IDs. FEAT-06/07. |
| UAT-I3-02 — As a consumer, reserve the intended option/quantity with an understood total and deposit state. | Item, option, quantity, address, fee, required consents and total match the saved order; invalid/insufficient stock is refused clearly. A changed price requires explicit reconfirmation. Retrying a committed request creates one order. Deposit claims stay pending until authorized confirmation; no actual funds move. | Open product/order sheet, test a quantity boundary and missing consent, change the allowed stage price in the isolated fixture, reconfirm and submit; simulate lost response and retry, then inspect order history and producer view. FEAT-08/09/10. |
| UAT-I3-03 — As a consumer, contact the correct farm about a paid order and obtain an appropriate AI/human response. | A first eligible paid order opens an authorized composer with explicit order context and no unwanted follow/inquiry. The question/photo persists once; a supported answer follows the frozen facts and sensitive/unsupported content is forwarded. Producer replies appear only in the intended private thread. The same historical message remains within 8 CSS px after the specified farm round trip. | Create the guarded unfollowed first-order fixture, enter chat, send text/photo with one retry, then explicitly enable AI with the frozen model/evidence settings before testing supported and handoff questions, reply as its producer, switch farms and back, measure the saved message and attempt cross-consumer access. FEAT-12/13/33; DEV-249/253. |
| UAT-I3-04 — As a producer, turn source material into a reviewed private draft and explicitly apply it. | Supported text/image/PDF inputs complete or expose a recoverable error. Facts, units, qualifiers and evidence can be reviewed; unsupported/uncertain critical facts are not silently published. Manual edits survive save/reopen/reanalysis. Public content changes only on explicit application and matches the approved result. | Use frozen source samples for each format, inspect evidence and omissions, edit/remove a field, save/reopen, retry analysis and explicitly apply; compare the consumer page. Record factual corrections and assistance separately from model-quality scores. FEAT-03/AC-SRC. |
| UAT-I3-05 — As a producer, manage the correct order and understand its cross-role state. | Order identity, product, amount and status agree across both apps; only authorized/allowed deposit or shipment transitions are available. Duplicate confirmation is safe and invalid transitions do not alter stock/payment state. | Locate the synthetic order from UAT-I3-02, compare both views, perform the allowed confirmation and replay it; attempt an invalid transition and inspect state/history. Record simulated confirmation explicitly. FEAT-17. |
| UAT-I3-06 — As a manager, control producer access and inspect an auditable exception. | Unauthorized roles are refused without mutation; approval/rejection carries a recorded reason/history; subsequent producer access matches the decision. A controlled AI refund/compensation handoff creates exactly one related exception under idempotent replay. | Use an isolated pending applicant and manager, try unauthorized access, record a decision and re-login as the producer. Trigger the frozen exception fixture and replay the message; inspect one linked history/event and role isolation. Manager/FEAT-13/33 rules. |

### Results

To be completed in Iteration 4: pass/fail, date, tester, and deviations per frozen story. Internal PM checks/proposed external UT are not substituted for future results.

## 6. Alpha and Beta Testing (Iteration 5)

### Plan

To be completed in Iteration 5: controlled alpha with people outside the team but within the course, recording participants/count, setting, scenarios, and observations. Fix serious issues before beta with external users on their own devices without the team present. Record release tag/commit/date, distribution, recruitment target/period, feedback, severity triage, and fix verification.

### Results

To be completed in Iteration 5: alpha dates/count/severity/pre-beta fixes; beta version used, participants/period, quantitative/qualitative results, and bugs/fixes linked to issues/PRs. No alpha/beta execution is established here.

## 7. Guideline Compliance and Submission Readiness

This matrix follows Guideline 4, pp. 1–2 and submission rules on p. 5. Later requirements retain their due dates above.

| I2 requirement | Evidence | Remaining action |
| --- | --- | --- |
| Component responsibility/new-code policy | Section 1 | Owner review. |
| Timing/merge criteria | Section 1/CI | Preserve actual executed/skipped steps. |
| Frameworks/isolation/scope | Section 2.1 | Recover missing historical environment details. |
| Architectural coverage goals/rationale | Section 2.2 / saved 22 October plan | Supplementary targets declared before measurement; owner review pending. Historical absence remains explicit. |
| Exact test/coverage commands/environment | Sections 2.3/2.5/3.7 / evidence scripts | Supplementary configuration/commands/runtime recorded; some historical manual SHAs/browser versions remain absent. |
| Result date/commit/command | Section 3/Appendix A | **Partly met:** exact workbook-only local SHAs/commands and app/server pairs needed. |
| Actual coverage versus target/screenshot | Sections 3.6/3.7 / native reports and screenshots | Measured and retained; follow up missed component targets without revising them retrospectively. |
| Counts, failure/skip reasons, actions | Sections 3.1–3.6 / all 77 cases | Supply referenced artifacts; retest after fixes/dependency resolution. |
| Preserve plans/explain revisions | Appendix B/immutable prior version | Keep original and revised future commitments. |
| English/separate Wiki | This source/[Wiki][wiki] | Reviewed main merge/Wiki sync required for this local revision. |
| PDF at iteration close | Source for subsequent export | Export/inspect `team6-iter2-testing.pdf` before 23 October 23:59; not exported/submitted here. |

**Missing attachments:** PM rows cite `PM_Test_Report.html#…` without a public URL or supplied HTML. Consumer rows retain screenshots “on request”; C-22 cites three DEV-41 screenshots without attachment URLs. Provide accessible artifacts before submission. PRs/self-links do not replace original reports/screenshots.

**Source quality:** C-04/C-05 contain their IDs in the priority field; intended priority is unknown. C-08's procedure contains only “Planned.” A-18's 324 and A-10's later 327 server counts remain distinct runs. These issues do not change status totals.

## Appendix A — Complete Internal Test Register

Every case retains plan, criterion, actual result, evidence, and follow-up. Source ranges cover A:N on the specified row. Planned/Conditional/Excluded translates provisional UT scope. Abbreviated October dates refer to 2026; manager/AI timestamps preserve the unspecified timezone. Korean strings appear only where useful for reproducing UI/input behavior.

### A.1 Consumer

**Owner:** Hyun Park. **Source sheet:** `현_소비자`.

#### C-01 — Verify the tested build and deployment

**Record:** **PASS**; priority P0; area: Deployment readiness; related: [DEV-42](https://linear.app/sswp6/issue/DEV-42); 20 October UT: **Planned**. Source: `현_소비자!A10:N10`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Open the web URL and check deployment version and inclusion of the target PRs.

**PASS criterion:** Required features are included in the accessible deployed build.

**Actual result:** farmclub.kr called api.farmclub.kr: GET /api/home, GET /api/products/p-hyodon, and GET /api/messaging/farms/f-hyodon/news returned 200. No Mock store was present. App main f31c7b0 was redeployed on Vercel at 08:55Z; server recorded as latest main.

**Evidence:** GET /api/home 200.

**Dependency/follow-up:** The 18 October morning build was Mock. Set repository APP_API_URL and redeploy (08:55Z) to connect the real server.

#### C-02 — Log in with a test account

**Record:** **PASS**; priority P0; area: Login; related: Login; 20 October UT: **Planned**. Source: `현_소비자!A11:N11`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Log in with a designated test account and open the consumer home.

**PASS criterion:** Authentication succeeds and the authenticated home renders.

**Actual result:** Real-server seeded consumers u-minji and u-seojun were available. Selected u-seojun through POST /api/auth/test-login; My info displayed that account (이서준).

**Evidence:** POST /api/auth/test-login 200.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-03 — Handle invalid authentication

**Record:** **PASS**; priority P1; area: Login; related: Login; 20 October UT: **Planned**. Source: `현_소비자!A12:N12`.

**Execution:** Deployed web; confirmed 10/19 02:10 KST.

**Procedure:** Original procedure: attempt login with invalid account/password.

**PASS criterion:** Login is refused with an understandable error.

**Actual result:** There is no password login, so invalid Kakao cases were substituted. Cancelling consent (error=access_denied) displayed '카카오 로그인을 취소했어요' with retry/home actions. Invalid/expired code displayed '로그인 요청이 만료됐어요. 다시 시도해 주세요' with the same actions. Neither authenticated the user.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** PM must confirm the account/password wording against Kakao. Error copy says '테스트 계정 로그인으로도 계속할 수 있어요' although that path is hidden when Kakao is enabled; wording needs revision.

#### C-04 — Preserve and clear session state

**Record:** **PASS**; priority Unresolved (source value `C-04`); area: Login; related: Login; 20 October UT: **Planned**. Source: `현_소비자!A13:N13`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Log in, navigate/reload, then log out.

**PASS criterion:** Session persists before logout; protected screens require login afterward.

**Actual result:** Login survived reload. Opening My orders after logout showed the login gate.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-05 — Complete Kakao callback and onboarding

**Record:** **PASS**; priority Unresolved (source value `C-05`); area: Login; related: [DEV-32](https://linear.app/sswp6/issue/DEV-32); 20 October UT: **Conditional**. Source: `현_소비자!A14:N14`.

**Execution:** Deployed web; confirmed 10/19 01:50 KST.

**Procedure:** When deployed, authenticate with Kakao and check return navigation.

**PASS criterion:** Successful authentication enters the consumer screen; use NOT READY if unavailable.

**Actual result:** On farmclub.kr: anonymous product → Reserve → checkout → login-and-reserve → Kakao-only login (test accounts hidden) → authentication → first-signup onboarding 1/2 (nickname/name/phone/three required consents) → 2/2 address (recipient/contact prefilled) → checkout. The selected 5 kg × 1 option and default address persisted. Logout/re-login skipped onboarding and returned to the product.

**Evidence:** [PR #121](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/121) merged/deployed; GET /api/auth/kakao/config enabled=true.

**Dependency/follow-up:** Signed up with test values (nickname UT현, address 테스트로 1). No order placed. Producer Kakao is [DEV-74](https://linear.app/sswp6/issue/DEV-74).

#### C-06 — Render product and farm discovery lists

**Record:** **PASS**; priority P0; area: Discovery; related: Consumer screens; 20 October UT: **Planned**. Source: `현_소비자!A15:N15`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Open lists, inspect cards, and scroll/navigate.

**PASS criterion:** List text/images render without breakage.

**Actual result:** Home news and horizontal product lists and /farms displayed. GET /api/farms returned 200.

**Evidence:** GET /api/farms 200; [PR #123](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/123).

**Dependency/follow-up:** Not recorded in the workbook.

#### C-07 — Render product detail consistently

**Record:** **PASS**; priority P0; area: Discovery; related: Consumer screens; 20 October UT: **Planned**. Source: `현_소비자!A16:N16`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Select a list product and open its detail.

**PASS criterion:** Name, price, and principal information match the list.

**Actual result:** Home card for the 5 kg/10 kg greenhouse citrus opened /products/p-house. Name, option prices, and expected arrival matched.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-08 — Persist follow and unfollow state

**Record:** **PASS**; priority P1; area: Following; related: Consumer screens; 20 October UT: **Planned**. Source: `현_소비자!A17:N17`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** The source procedure cell contains only 'Planned'; no executable procedure was specified there.

**PASS criterion:** Button/follow state agree and survive reload.

**Actual result:** For f-halla: Follow → Following → reload retained Following → appeared in My info followed farms → unfollow restored Follow. PUT /api/farms/f-halla/follow, GET /api/farms/following, and DELETE /api/farms/f-halla/follow returned 200.

**Evidence:** PUT/DELETE /api/farms/f-halla/follow and GET /api/farms/following 200; [PR #123](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/123).

**Dependency/follow-up:** Follow state restored after testing.

#### C-09 — Enter and read a farm news room

**Record:** **PASS**; priority P1; area: News room; related: Consumer screens; 20 October UT: **Planned**. Source: `현_소비자!A18:N18`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Select a farm room and inspect its content/detail.

**PASS criterion:** The room is accessible and shows the selected farm's content.

**Actual result:** Entered f-kang news room directly. Products, news bubbles, and like counts displayed from real-server rooms APIs.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-10 — Carry selected product into checkout

**Record:** **PASS**; priority P0; area: Checkout; related: [DEV-37](https://linear.app/sswp6/issue/DEV-37); 20 October UT: **Planned**. Source: `현_소비자!A19:N19`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Product detail → checkout.

**PASS criterion:** Selected product information is transferred accurately.

**Actual result:** Product → option sheet → /checkout/p-house?optionId=opt-5&quantity=1. Product, option, quantity, and price matched.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-11 — Validate required and invalid checkout input

**Record:** **PASS**; priority P0; area: Checkout; related: [DEV-37](https://linear.app/sswp6/issue/DEV-37); 20 October UT: **Planned**. Source: `현_소비자!A20:N20`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Omit required fields or enter invalid values and submit.

**PASS criterion:** Progress is blocked and relevant validation messages appear.

**Actual result:** Payment was disabled before consent/address. Saving contact '010-12' and blank required values produced format/required-field errors. Invalid data was not saved.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-12 — Calculate quantity and totals consistently

**Record:** **PASS**; priority P0; area: Checkout; related: [DEV-37](https://linear.app/sswp6/issue/DEV-37); 20 October UT: **Planned**. Source: `현_소비자!A21:N21`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Change quantity and compare unit price, total, and confirmation.

**PASS criterion:** Quantity × unit price and displayed order totals agree.

**Actual result:** Quantity 1 → 2: KRW 33,000 × 2 = KRW 66,000 in the sheet; checkout quantity=2 and KRW 66,000 matched.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-13 — Complete the planned Mock-payment flow using the revised bank-transfer test

**Record:** **PASS**; priority P0; area: Mock payment (original label); related: [DEV-36](https://linear.app/sswp6/issue/DEV-36); 20 October UT: **Planned**. Source: `현_소비자!A22:N22`.

**Execution:** Deployed web; confirmed 10/18 19:55 KST.

**Procedure:** Original plan: submit a valid checkout through Mock payment.

**PASS criterion:** Test payment is distinguishable and the completion screen renders.

**Actual result:** Tested the replacement direct-bank-transfer flow ([DEV-68](https://linear.app/sswp6/issue/DEV-68)): checkout → deposit instructions showing a test-service/no-actual-money notice, KRW 36,000, farm account, order number as depositor, and intermediary disclosure → '입금을 마쳤어요' → completion '입금 확인 중'. No actual transfer.

**Evidence:** [PR #141](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/141); POST /api/orders/{id}/deposit and deposit-reported returned 200.

**Dependency/follow-up:** Initially blocked by 409 NO_FARM_ACCOUNT because the deployed f-kang deposit account was blank. Registered the same test account as the seed through the producer app, then passed. Other seeded farms' accounts still need checking.

#### C-14 — Persist and retrieve the test order

**Record:** **PASS**; priority P0; area: Order history; related: [DEV-36](https://linear.app/sswp6/issue/DEV-36); 20 October UT: **Planned**. Source: `현_소비자!A23:N23`.

**Execution:** Deployed web; confirmed 10/18 19:55 KST.

**Procedure:** Original plan: open/reload order history after Mock payment.

**PASS criterion:** The same order has the correct amount and state.

**Actual result:** Producer f-kang's awaiting-deposit list showed order FC-1018-7885 with the reported-deposit notice. After deposit approval, consumer history/detail showed reservation complete and KRW 36,000 after reload.

**Evidence:** POST /api/orders/o-342a4b0a78/confirm-deposit 200.

**Dependency/follow-up:** Test order FC-1018-7885 remained on the real server as reservation complete.

#### C-15 — Prevent duplicate orders during cancellation/back/retry

**Record:** **PASS**; priority P1; area: Mock payment (original label); related: [DEV-36](https://linear.app/sswp6/issue/DEV-36); 20 October UT: **Planned**. Source: `현_소비자!A24:N24`.

**Execution:** Deployed web; confirmed 10/18 19:55 KST.

**Procedure:** Cancel, go back, and retry during payment.

**PASS criterion:** Cancelled orders are not presented as successful and duplicates are prevented.

**Actual result:** Repeated Reserve taps and back/re-reserve from deposit instructions created one order, reused with the same idempotency key. 'Pay later' → order-detail cancellation → reload showed cancelled, not reserved or awaiting deposit confirmation.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-16 — Open the correct private chat

**Record:** **PASS**; priority P1; area: Chat; related: Consumer screens; 20 October UT: **Planned**. Source: `현_소비자!A25:N25`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Connect to chat from a product/farm.

**PASS criterion:** The room and counterpart are correct.

**Actual result:** Farm info → private chat → /chats/f-kang; counterpart was the selected f-kang farm.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-17 — Exchange messages and retain history

**Record:** **PASS**; priority P1; area: Chat; related: Consumer screens; 20 October UT: **Conditional**. Source: `현_소비자!A26:N26`.

**Execution:** Deployed web; confirmed 10/18 19:55 KST.

**Procedure:** Exchange messages with the counterpart test account, then reload.

**PASS criterion:** Messages are delivered, readable, and persistent.

**Actual result:** Consumer-to-farm message remained after reload. Producer account u-kang received it in private chat, replied, and the reply displayed on the consumer side.

**Evidence:** GET /api/messaging/producer/chats/u-seojun/messages 200.

**Dependency/follow-up:** Left one consumer message and one producer reply marked [UT 10/18].

#### C-18 — Handle empty, network-error, and loading states

**Record:** **PASS**; priority P1; area: Shared UX; related: [DEV-42](https://linear.app/sswp6/issue/DEV-42); 20 October UT: **Planned**. Source: `현_소비자!A27:N27`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Check empty data and network-error cases.

**PASS criterion:** Provide guidance/recovery without freezing or endless loading.

**Actual result:** Empty real-server farm-search results displayed guidance. Offline → reconnect/reload recovered without endless loading. Server 5xx paths were not verified.

**Evidence:** GET /api/farms?q= 200; [PR #123](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/123).

**Dependency/follow-up:** Server 5xx response paths remain unverified.

#### C-19 — Check mobile layout and navigation

**Record:** **PASS**; priority P1; area: Shared UX; related: [DEV-42](https://linear.app/sswp6/issue/DEV-42); 20 October UT: **Planned**. Source: `현_소비자!A28:N28`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Navigate principal screens in a mobile browser.

**PASS criterion:** Core flows proceed without clipped important controls.

**Actual result:** Seven screens at 390 px touch emulation had no horizontal overflow; physical devices were not tested in this case.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Chromium mobile emulation only. Physical Android/iOS checks belong to [DEV-41](https://linear.app/sswp6/issue/DEV-41).

#### C-20 — Keep state stable on reload and back navigation

**Record:** **PASS**; priority P1; area: Shared UX; related: [DEV-42](https://linear.app/sswp6/issue/DEV-42); 20 October UT: **Planned**. Source: `현_소비자!A29:N29`.

**Execution:** Deployed web; confirmed 10/18 18:20 KST.

**Procedure:** Reload/go back before and after ordering.

**PASS criterion:** No critical broken screen, duplicate save, or unexpected logout.

**Actual result:** Checkout survived reload; back/forward and login state were normal. This observation was pre-payment, with no order creation or duplicate save.

**Evidence:** Screenshots retained; available on request, without a supplied URL.

**Dependency/follow-up:** Not recorded in the workbook.

#### C-21 — Download, install, and launch the planned Android package

**Record:** **NOT READY**; priority P1; area: Installation/deployment; related: [DEV-33](https://linear.app/sswp6/issue/DEV-33) / [DEV-41](https://linear.app/sswp6/issue/DEV-41); 20 October UT: **Conditional**. Source: `현_소비자!A30:N30`.

**Execution:** Not executed; confirmed 10/19 02:10 KST.

**Procedure:** Install and launch on a physical device when the APK link exists.

**PASS criterion:** APK installs/launches; otherwise NOT READY.

**Actual result:** No APK available. Work switched from EAS native packaging to TWA wrapping farmclub.kr in Chromium. Android Chrome can currently access farmclub.kr.

**Evidence:** Linear [DEV-33](https://linear.app/sswp6/issue/DEV-33) and [DEV-41](https://linear.app/sswp6/issue/DEV-41).

**Dependency/follow-up:** PM confirmed EAS APK → TWA APK to retain the tested web/Kakao behavior. Native EAS needs Kakao return/token-storage fixes taking over a day, deferred to I3 or later as separate work. Install-test once the APK exists.

#### C-22 — Open the iOS web link and add to home screen

**Record:** **PASS**; priority P2; area: Installation/deployment; related: [DEV-33](https://linear.app/sswp6/issue/DEV-33); 20 October UT: **Conditional**. Source: `현_소비자!A31:N31`.

**Execution:** Physical device (iPhone); confirmed 10/19 02:05 KST.

**Procedure:** Use iOS Safari and Add to Home Screen.

**PASS criterion:** Web access works; native installation is outside this case.

**Actual result:** Physical iPhone Safari added/launched consumer 'farmclub' and producer 'farmclub 농가' icons. Consumer opened full screen; producer retained Safari address/toolbar.

**Evidence:** Linear [DEV-41](https://linear.app/sswp6/issue/DEV-41), three screenshots referenced without attachment URLs.

**Dependency/follow-up:** Both apps lacked a web app manifest; source hypothesizes the added page path defines scope. Add manifest start_url/scope '/' and standalone alongside TWA work. Temporary workaround: re-add from farm.farmclub.kr's first page.

#### C-23 — Record the separate sandbox-payment state

**Record:** **NOT READY**; priority P2; area: Sandbox; related: [DEV-36](https://linear.app/sswp6/issue/DEV-36); 20 October UT: **Excluded**. Source: `현_소비자!A32:N32`.

**Execution:** Local; confirmed 10/18 18:20 KST.

**Procedure:** Check only if the sandbox environment is ready.

**PASS criterion:** Outside formal 20 October UT; unimplemented/unready is NOT READY.

**Actual result:** Excluded from 20 October. Bank transfer (option C, DEV-68/#141) replaced payments, so PortOne sandbox DEV-36/#124 is deferred. Historical note: on 17 October, the local real-server test channel approved two payments and automatically cancelled PG payment after app cancellation.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/124)

**Dependency/follow-up:** Reuse if PG payout integration is adopted. Test the 20 October bank-transfer flow separately.

### A.2 Producer

**Owner:** Jinwoo Jang. **Source sheet:** `진우_생산자`.

#### P-01 — Enter the producer app with role-appropriate gates

**Record:** **PASS**; priority P0; area: Screen access; related: Producer frontend; 20 October UT: **Conditional**. Source: `진우_생산자!A10:N10`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Sign in as the producer test account and inspect the initial screen.

**PASS criterion:** Producer home renders and access roles are distinguished.

**Actual result:** Approved account opened home. Pending, rejected, suspended, and new accounts each reached their restricted screen.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed PASS must be established separately.

#### P-02 — Navigate menus and return

**Record:** **PASS**; priority P1; area: Screen UX; related: Producer frontend; 20 October UT: **Conditional**. Source: `진우_생산자!A11:N11`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Visit all principal producer menus, then return.

**PASS criterion:** Navigation/back does not produce broken screens.

**Actual result:** Visited dashboard, products, chat, and settings; back navigation after product editing worked.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-03 — Load products and the empty state

**Record:** **PASS**; priority P0; area: Product management; related: Producer backend; 20 October UT: **Conditional**. Source: `진우_생산자!A12:N12`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Open lists for accounts with and without products.

**PASS criterion:** Correct list or understandable empty state.

**Actual result:** Verified the actual product list and empty-state guidance for an approved test account with no products.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-04 — Enter a new product's fields

**Record:** **PASS**; priority P0; area: Product management; related: Producer frontend; 20 October UT: **Conditional**. Source: `진우_생산자!A13:N13`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Enter valid data in the registration screen.

**PASS criterion:** Implemented fields, images, and selections work.

**Actual result:** New-product entry, variety/text/photo inputs, and representative-photo selection worked.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-05 — Block required-field and invalid input

**Record:** **PASS**; priority P0; area: Product management; related: Producer frontend; 20 October UT: **Conditional**. Source: `진우_생산자!A14:N14`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Omit required values such as price or enter invalid values.

**PASS criterion:** Show errors and block invalid submissions.

**Actual result:** Variety/representative photo required; missing or zero price blocked. Missing origin/storage information blocked the publication request.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-06 — Save a product through API/DB

**Record:** **PASS**; priority P0; area: Backend integration; related: Producer backend; 20 October UT: **Conditional**. Source: `진우_생산자!A15:N15`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Register valid product data and check API/DB and reload.

**PASS criterion:** Data persists and can be retrieved; unconnected implementation is BLOCKED.

**Actual result:** New product creation/save/requery worked, including its transition to the public API after approval.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-07 — Persist product edits

**Record:** **PASS**; priority P0; area: Backend integration; related: Producer backend; 20 October UT: **Conditional**. Source: `진우_생산자!A16:N16`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Edit price/description, save, and revisit.

**PASS criterion:** Server retains changed values.

**Actual result:** Price/description survived revisit. Private-detail save/requery worked.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-08 — Recover from API/save errors

**Record:** **PASS**; priority P1; area: Backend integration; related: Producer backend; 20 October UT: **Conditional**. Source: `진우_생산자!A17:N17`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Induce server errors or failure responses.

**PASS criterion:** Show failure without falsely claiming save success.

**Actual result:** Save failure and version-conflict messages appeared; input preservation and retry were verified.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-09 — Keep images and descriptions consistent

**Record:** **PASS**; priority P1; area: Product display; related: Producer frontend; 20 October UT: **Conditional**. Source: `진우_생산자!A18:N18`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Compare list/detail after registration/edit.

**PASS criterion:** Principal images, price, and description agree.

**Actual result:** Representative/body photos matched saved/public content. Newly public title, price, and images actually loaded.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-10 — Request an AI sales-page draft

**Record:** **PASS**; priority P1; area: AI sales page; related: AI sales page; 20 October UT: **Conditional**. Source: `진우_생산자!A19:N19`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Generate a draft using supported product input.

**PASS criterion:** Request succeeds and results display.

**Actual result:** Real Gemini image retry succeeded in 25.649 s. Nine cumulative calls cost USD 0.015407; unsettled calls: 0.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Resolved an initial missing OCR path and USD 0.10 reservation-cap block. Changed only the verification spending limit to USD 0.50.

#### P-11 — Check generated facts against the source

**Record:** **PASS**; priority P1; area: AI sales page; related: AI sales page / [DEV-59](https://linear.app/sswp6/issue/DEV-59); 20 October UT: **Conditional**. Source: `진우_생산자!A20:N20`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Review generated weight, Brix, and description.

**PASS criterion:** Inspect and record unsupported or incorrect information.

**Actual result:** Compared product name, size, taste, storage, and GAP with the original. Confirmed source support for 5 kg and expected 12.5 Brix; no measured value was fabricated.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Direct-from-origin wording was omitted. Multiple candidates require manual confirmation. A single example does not establish general accuracy.

#### P-12 — Edit and persist the AI draft manually

**Record:** **PASS**; priority P1; area: AI sales page; related: AI sales page; 20 October UT: **Conditional**. Source: `진우_생산자!A21:N21`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Edit output → save → requery.

**PASS criterion:** User edits remain intact.

**Actual result:** Confirmed wording after the multiple-candidate notice. Save → reload → publish → consumer display worked.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Taste candidates were confirmed manually against the original after a review-needed notice.

#### P-13 — Handle AI delay and failure

**Record:** **PASS**; priority P1; area: AI sales page; related: AI sales page; 20 October UT: **Conditional**. Source: `진우_생산자!A22:N22`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Inspect delayed/failed generation.

**PASS criterion:** Clear error/retry behavior without a frozen screen.

**Actual result:** Analysis-in-progress, partial-failure, and budget-exceeded states displayed. Retrying failed items succeeded after configuration correction.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-14 — Expose producer-created products to consumers

**Record:** **PASS**; priority P0; area: Cross-role integration; related: Producer backend; 20 October UT: **Conditional**. Source: `진우_생산자!A23:N23`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Create product, then retrieve it through the consumer web app.

**PASS criterion:** Correct product information appears in consumer list/detail.

**Actual result:** Consumer detail showed the newly registered/approved product title, KRW 25,000, and photo. Generated detail also appeared publicly.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-15 — Show the consumer's order to the producer

**Record:** **PASS**; priority P1; area: Cross-role integration; related: Order integration; 20 October UT: **Conditional**. Source: `진우_생산자!A24:N24`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Create a consumer Mock order, then retrieve it as producer.

**PASS criterion:** Order and key data connect correctly; unimplemented is NOT READY.

**Actual result:** Mock order appeared in producer reservation list/API. After tracking/invoice processing, consumer state updated.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Only Mock payment verified; no real-payment conclusion.

#### P-16 — Exchange producer-side chat and retain history

**Record:** **PASS**; priority P1; area: Cross-role integration; related: Chat integration; 20 October UT: **Conditional**. Source: `진우_생산자!A25:N25`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Converse with the consumer and reconnect.

**PASS criterion:** Both sides agree on messages, counterpart, and history.

**Actual result:** Producer-to-consumer message and reply worked. Both sides retained history after reload.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** AI customer-service answer quality excluded.

#### P-17 — Enforce producer-only access

**Record:** **PASS**; priority P1; area: Authorization; related: Producer backend; 20 October UT: **Conditional**. Source: `진우_생산자!A26:N26`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Attempt producer screen/API access with other roles.

**PASS criterion:** Block unauthorized access and protect other users' data.

**Actual result:** Unauthenticated 401; consumer 403; other producer's product 404. Only own data retrievable.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Local PASS; deployed verification remains separate.

#### P-18 — Check producer mobile layout/loading

**Record:** **PASS**; priority P1; area: Screen UX; related: Producer frontend; 20 October UT: **Conditional**. Source: `진우_생산자!A27:N27`.

**Execution:** Local; confirmed 10/17 23:06 KST.

**Procedure:** Enter mobile screens under delayed responses.

**PASS criterion:** Principal controls remain usable with clear state guidance.

**Actual result:** Edit/save/publish verified at 360/390/430 px. Session delay and analysis-progress guidance worked.

**Evidence:** [Source reference](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)

**Dependency/follow-up:** Chromium mobile viewports only; physical devices and deployment require separate verification.

#### P-19 — Confirm before sending news and delete sent news (DEV-210)

**Record:** **PASS** (local); priority P1; area: News room; related: Producer frontend, messaging API. Added after the 3 November HE pre-check (P3, severity 3); not part of the 19 October workbook counts.

**Execution:** Local; 4 November 2026, branch `nemodleo/dev-210-news-confirm-delete`, isolated PostgreSQL database.

**Procedure:** In the producer's own news room, type news and press Send; check the sheet, press No, then send. Delete one post with ⋯ → Delete and another with Delete and rewrite; check the consumer room, chat list preview, news list and public farm room.

**PASS criterion:** AC-12-13 to AC-12-16 (FEAT-12, rule M-23).

**Actual result:** pytest `test_AC_12_14_*` and `test_AC_12_15_*` (7 tests) passed inside the full server suite (1459 passed, 1 skipped). Mock `scripts/test-news-rooms.mjs` AC-12-14/15 passed within `npm run test:mock` (64 passed). Playwright `scripts/e2e/conversation-ui.spec.ts` AC-12-13 and AC-12-14/16 passed on the local real stack (9 passed).

**Evidence:** [PR #396](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/396)

**Dependency/follow-up:** Deployed verification after merge. The HE test post left in production is deleted by a person from the producer account after deployment.

### A.3 Manager and AI

**Owner:** Zahra. **Source sheet:** `자라_운영자AI`.

#### A-01 — Approve/reject producers as manager

**Record:** **PASS**; priority P0; area: Manager access; related: [DEV-30](https://linear.app/sswp6/issue/DEV-30) / [PR #96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96); 20 October UT: **Conditional**. Source: `자라_운영자AI!A10:N10`.

**Execution:** Local; confirmed 2026-10-18 01:00:00.

**Procedure:** Select a pending application with a manager account and approve it.

**PASS criterion:** Request succeeds and target state changes.

**Actual result:** Seeded local HTTP: f-wimi approve 200 with APPROVED history; rejection with reason 200 with REJECTED history. Missing key returned 400; same-key replay returned the original result. pytest AC_01_3 passed.

**Evidence:** [PR #96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** No approval mutation on the deployed server, to protect shared seeds.

#### A-02 — Refuse non-manager access

**Record:** **PASS**; priority P0; area: Manager access; related: [DEV-30](https://linear.app/sswp6/issue/DEV-30) / [PR #96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96); 20 October UT: **Conditional**. Source: `자라_운영자AI!A11:N11`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 01:10:00.

**Procedure:** Call manager APIs anonymously and with ordinary accounts.

**PASS criterion:** Refuse unauthorized requests without exposing data.

**Actual result:** Railway: 12 route patterns × 2 sets (fake IDs and actual seed IDs) × anonymous/u-minji/u-kang = 72 requests, all expected 401/403/403 without data. Equivalent 36 local requests passed.

**Evidence:** [PR #96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Not recorded in the workbook.

#### A-03 — Persist approval and permissions

**Record:** **PASS**; priority P1; area: Manager access; related: [DEV-30](https://linear.app/sswp6/issue/DEV-30) / [PR #96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96); 20 October UT: **Conditional**. Source: `자라_운영자AI!A12:N12`.

**Execution:** Local; confirmed 2026-10-18 01:00:00.

**Procedure:** Approve, then reload/re-login and retrieve state.

**PASS criterion:** Approval state and permissions persist.

**Actual result:** After approval, u-misook re-login returned farmStatus APPROVED from /api/auth/me. History requery with a new manager token matched.

**Evidence:** [PR #96](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/96); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Not recorded in the workbook.

#### A-04 — Create and retrieve refund history

**Record:** **PASS**; priority P0; area: Refund/recovery; related: [DEV-35](https://linear.app/sswp6/issue/DEV-35) / [PR #114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114); 20 October UT: **Conditional**. Source: `자라_운영자AI!A13:N13`.

**Execution:** Local; confirmed 2026-10-18 01:00:00.

**Procedure:** Refund a test order and query records.

**PASS criterion:** History and target data agree.

**Actual result:** Local o-42 partial refund of KRW 1,000 returned 200. Same-key replay returned the same result. Exactly one history row recorded orderId o-42, amount 1000, actor MANAGER. pytest AC_11_3 passed.

**Evidence:** [PR #114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Consumer partial-refund history display is deferred by design and tracked in open [issue #126](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/126) (DEV-62).

#### A-05 — Record exceptions and recovery

**Record:** **PASS**; priority P1; area: Refund/recovery; related: [DEV-35](https://linear.app/sswp6/issue/DEV-35) / [PR #114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114); 20 October UT: **Conditional**. Source: `자라_운영자AI!A14:N14`.

**Execution:** Local; confirmed 2026-10-18 01:00:00.

**Procedure:** Execute supported exception/recovery scenarios.

**PASS criterion:** Changed/recovered records can be retrieved.

**Actual result:** Refund-request chat → /admin/exceptions list/detail 200; retry 409 RETRY_NOT_ALLOWED; resolve 200; retry after resolution 409. Transient-failure retry passed test_AC_11_3_transient_retry_uses_original_actor_and_exact_body.

**Evidence:** [PR #114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Not recorded in the workbook.

#### A-06 — Refuse unauthorized refund/recovery

**Record:** **PASS**; priority P1; area: Refund/recovery; related: [DEV-35](https://linear.app/sswp6/issue/DEV-35) / [PR #114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114); 20 October UT: **Conditional**. Source: `자라_운영자AI!A15:N15`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 01:10:00.

**Procedure:** Access refund/recovery APIs as ordinary accounts.

**PASS criterion:** Unauthorized mutations are refused.

**Actual result:** Railway consumer/producer tokens received 403 for refunds, refund history, exception retry, and resolution, including actual seed IDs. No data changed. Equivalent local checks passed.

**Evidence:** [PR #114](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/114); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Not recorded in the workbook.

#### A-07 — Generate an AI answer

**Record:** **PASS**; priority P0; area: AI answers; related: [DEV-31](https://linear.app/sswp6/issue/DEV-31) / [PR #99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99); 20 October UT: **Conditional**. Source: `자라_운영자AI!A16:N16`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 01:10:00.

**Procedure:** Request an answer to a normal supported question.

**PASS criterion:** Answer is generated and displayed through UI/API.

**Actual result:** Railway non-writing preview: '이 상품 이름이 정확히 뭐예요?' produced a Claude answer naming the 5 kg/10 kg greenhouse citrus. '상품 크기는 어때요?' was answered within evidence. Registered Brix question received a rule answer of 11.8 Brix.

**Evidence:** [PR #99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Not recorded in the workbook.

#### A-08 — Inspect AI evidence references

**Record:** **PASS**; priority P1; area: AI answers; related: [DEV-31](https://linear.app/sswp6/issue/DEV-31) / [PR #99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99); 20 October UT: **Conditional**. Source: `자라_운영자AI!A17:N17`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 01:10:00.

**Procedure:** Inspect grounding information in the answer.

**PASS criterion:** Required evidence information is available.

**Actual result:** Claude answers showed sourceRefs ['product:p-house']. Validation blocked unsupported numbers; remote-island/extra-shipping question handed off. pytest AC_13_3 grounding checks passed.

**Evidence:** [PR #99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Not recorded in the workbook.

#### A-09 — Deliver handoff to the correct producer

**Record:** **PASS**; priority P1; area: AI answers; related: [DEV-31](https://linear.app/sswp6/issue/DEV-31) / [PR #99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99); 20 October UT: **Conditional**. Source: `자라_운영자AI!A18:N18`.

**Execution:** Local; confirmed 2026-10-18 01:00:00.

**Procedure:** Forward an AI-related question and retrieve it as producer.

**PASS criterion:** Correct producer can see the forwarded question.

**Actual result:** Pesticide/no-evidence questions handed off and appeared in f-kang's needsReply list. Producer reply switched to HUMAN, suppressing subsequent AI replies (AC-13-6); AI OFF also suppressed answers (AC-13-7). Railway pesticide preview returned HANDOFF.

**Evidence:** [PR #99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99); source also links [Testing Documentation Wiki][wiki].

**Dependency/follow-up:** Not recorded in the workbook.

#### A-10 — Recover from failed/empty AI answers

**Record:** **PASS**; priority P1; area: AI answers; related: [DEV-31](https://linear.app/sswp6/issue/DEV-31) / [PR #99](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/99); 20 October UT: **Conditional**. Source: `자라_운영자AI!A19:N19`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 02:10:00.

**Procedure:** Exercise failed or empty responses.

**PASS criterion:** Record error guidance and exception/retry behavior.

**Actual result:** Retest after [PR #140](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/140) deployment: Railway preview (u-kang, p-house), '원산지가 어디예요?' returned HANDOFF on all three attempts. Before the fix it returned ANSWER saying information was unavailable and to ask the seller. Normal product-name/measured-Brix questions still answered; pesticide still handed off. Three regression tests added; pytest 327 and integration 7 + Chromium 43 passed.

**Evidence:** [PR #140](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/140) ([DEV-47](https://linear.app/sswp6/issue/DEV-47)).

**Dependency/follow-up:** Not recorded in the workbook.

#### A-11 — Regress weight normalization

**Record:** **PASS**; priority P1; area: AI product drafts; related: [DEV-59](https://linear.app/sswp6/issue/DEV-59) / [PR #116](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/116); 20 October UT: **Conditional**. Source: `자라_운영자AI!A20:N20`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 01:12:00.

**Procedure:** Generate with input reproducing the prior weight error.

**PASS criterion:** Incorrect weight does not recur.

**Actual result:** Real Railway AI draft for '하우스 감귤 15키로 박스' produced options ['15kg'], with no 5kg. pytest P02_AC_03_1 weight regression passed.

**Evidence:** [PR #116](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/116).

**Dependency/follow-up:** Not recorded in the workbook.

#### A-12 — Regress Brix extraction

**Record:** **PASS**; priority P1; area: AI product drafts; related: [DEV-59](https://linear.app/sswp6/issue/DEV-59) / [PR #116](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/116); 20 October UT: **Conditional**. Source: `자라_운영자AI!A21:N21`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 01:12:00.

**Procedure:** Generate with input reproducing the prior Brix error.

**PASS criterion:** Value and unit match expectations.

**Actual result:** Real Railway draft for '당도 12브릭스 5키로 박스, Brix 13 선별, 당도 높은 3박스' returned expectedBrix 12, not 5 or 3. '당도 12.5브릭스' returned 12.5. Three pytest P02_AC_03_1 Brix regressions passed.

**Evidence:** [PR #116](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/116).

**Dependency/follow-up:** Not recorded in the workbook.

#### A-13 — Record a wrong-answer report internally

**Record:** **PASS**; priority P1; area: AI feedback; related: [DEV-39](https://linear.app/sswp6/issue/DEV-39); 20 October UT: **Excluded**. Source: `자라_운영자AI!A22:N22`.

**Execution:** Local; confirmed 2026-10-18 00:55:00.

**Procedure:** Submit an AI wrong-answer report; record its result.

**PASS criterion:** Report persists; distinguish FAIL from BLOCKED if unsuccessful.

**Actual result:** pytest AC_13_5 passed. Local real-stack Playwright passed 'FEAT-13 AC-13-5: consumer reports an AI answer and both sides see the server marker'.

**Evidence:** [PR #119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119).

**Dependency/follow-up:** Excluded from 20 October external UT despite internal PASS.

#### A-14 — Recover AI-settings version conflicts

**Record:** **PASS**; priority P1; area: AI feedback; related: [DEV-39](https://linear.app/sswp6/issue/DEV-39); 20 October UT: **Excluded**. Source: `자라_운영자AI!A23:N23`.

**Execution:** Local; confirmed 2026-10-18 00:55:00.

**Procedure:** Exercise conflict/recovery and inspect resulting settings.

**PASS criterion:** Settings remain consistent after recovery.

**Actual result:** pytest AC_32_4 passed. Playwright passed 'FEAT-32 AC-32-4: settings edits survive STALE_VERSION and save with refreshed version'.

**Evidence:** [PR #119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119).

**Dependency/follow-up:** Excluded from 20 October UT.

#### A-15 — Check the 0008 migration conflict

**Record:** **PASS**; priority P0; area: DB/migrations; related: [DEV-39](https://linear.app/sswp6/issue/DEV-39) / [PR #113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113); 20 October UT: **Excluded**. Source: `자라_운영자AI!A24:N24`.

**Execution:** API/DB; confirmed 2026-10-18 01:05:00.

**Procedure:** Confirm ordering with the author and test migration application.

**PASS criterion:** No numbering/order conflict; unresolved cases are BLOCKED.

**Actual result:** One Alembic head, 0013. Chain 0007 → 0008 ([DEV-39](https://linear.app/sswp6/issue/DEV-39)) → 0009–0013 (DEV-56/58, renumbered in [PR #113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113)). Empty DB upgraded through 13 steps, downgraded six steps to 0007, and upgraded again; alembic check found no changes. A seeded 0008 DB upgraded to 0013; Railway deployment at 0013 confirmed.

**Evidence:** [PR #113](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113) and [PR #119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119).

**Dependency/follow-up:** Not recorded in the workbook.

#### A-16 — Diagnose the AI-feedback test setup failure

**Record:** **PASS**; priority P1; area: Integration readiness; related: [DEV-39](https://linear.app/sswp6/issue/DEV-39); 20 October UT: **Excluded**. Source: `자라_운영자AI!A25:N25`.

**Execution:** Local; confirmed 2026-10-18 00:55:00.

**Procedure:** Rerun the failing test and separate setup from product-code causes.

**PASS criterion:** Record failure cause and required correction.

**Actual result:** On 16 October the test used a shipping-fee question that handed off without a key, and u-seojun did not follow f-kang. Changed fixture/question to u-minji and the small-order-policy question; [PR #119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119) merged. Rerun pytest AC_13_5 and Playwright AC-13-5 passed.

**Evidence:** [PR #119](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/119).

**Dependency/follow-up:** Not recorded in the workbook.

#### A-17 — Check manager/AI functions on deployment

**Record:** **PASS**; priority P0; area: Deployment verification; related: [DEV-44](https://linear.app/sswp6/issue/DEV-44); 20 October UT: **Conditional**. Source: `자라_운영자AI!A26:N26`.

**Execution:** Development server (Railway where recorded); confirmed 2026-10-18 02:20:00.

**Procedure:** Repeat locally passing functions on the actual server.

**PASS criterion:** Equivalent deployed behavior is observed.

**Actual result:** Railway /health and /docs returned 200; latest-main deployment, CORS, and test login checked. Non-manager refusal: 72 requests with expected 401/403. Real AI answers/drafts/handoffs passed after [PR #140](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/140). Manager token issued in Railway shell enabled seven 200 reads: exception list, four farm decision histories, two order refund histories. Missing targets returned 404. Lists were empty because deployed seeds had no history.

**Evidence:** [Testing Documentation Wiki][wiki] (source self-reference).

**Dependency/follow-up:** On 18 October approval/refund mutations remained local to protect shared seeds (A-01/A-04/A-05 local PASS); deployed reads alone do not establish mutation verification. Approval, capacity approval, deposit confirmation, partial/final refund and duplicate-refund checks were later run on the live server with labelled test data on 20 October (see "Follow-up retest on 20 October (SWPP-118)" after Section 3.4).

#### A-18 — Execute and record the manager/AI checklist

**Record:** **PASS**; priority P1; area: Deployment verification; related: [DEV-44](https://linear.app/sswp6/issue/DEV-44); 20 October UT: **Conditional**. Source: `자라_운영자AI!A27:N27`.

**Execution:** Local; confirmed 2026-10-18 01:13:00.

**Procedure:** Run the verification checklist.

**PASS criterion:** Record per-function statuses with supporting evidence.

**Actual result:** Full local record: pytest 324 passed; Ruff passed; npm run test:mock 13 passed; typecheck passed in four workspaces; test:integration:full passed seven real-server scenarios and 43 Chromium tests; manager/AI HTTP checks 49/49. Railway observations are those above.

**Evidence:** [Testing Documentation Wiki][wiki] (source self-reference).

**Dependency/follow-up:** Not recorded in the workbook.

### A.4 PM integration

**Owner:** Minsun Kim (PM). **Source sheet:** `PM_통합`.

#### I-01 — Align test environment and deployed versions

**Record:** **PASS**; priority P0; area: Preflight; related: PM integration; 20 October UT: **Planned**. Source: `PM_통합!A10:N10`.

**Execution:** Deployed web; confirmed 10/19 17:16–17:26 KST.

**Procedure:** Collect each owner's PR/deployment version.

**PASS criterion:** Establish test URLs, builds, accounts, and included features.

**Actual result:** Additional reference: main 79eaea7 ([PR #168](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/168), [DEV-82](https://linear.app/sswp6/issue/DEV-82)). Actual manager listing/approval connected; Railway upload/health passed. Vercel skipped app deployment because apps were unchanged.

**Evidence:** `PM_Test_Report.html#I-01` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Distinguish morning c98be9b from the afternoon manager-enabled run. Neither app source changed. Health is not direct proof of runtime SHA.

#### I-02 — Consumer login → discovery → product detail

**Record:** **PASS**; priority P0; area: Consumer E2E; related: [DEV-32](https://linear.app/sswp6/issue/DEV-32) / [DEV-42](https://linear.app/sswp6/issue/DEV-42); 20 October UT: **Planned**. Source: `PM_통합!A11:N11`.

**Execution:** Deployed web; confirmed 10/19 06:56–07:13 KST.

**Procedure:** Run the whole journey on the deployment with the designated account.

**PASS criterion:** Complete core discovery without errors.

**Actual result:** Kakao authentication → discovery → product detail worked. Logout required login on protected paths; re-login retained the refunded order. Browser used an existing Kakao consumer; u-minji was tested through API.

**Evidence:** `PM_Test_Report.html#I-02` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Fresh consumer signup requires an unused Kakao identity. Did not relabel an existing profile as a new account or rename it.

#### I-03 — Product → follow farm → news room

**Record:** **PASS**; priority P1; area: Consumer E2E; related: [DEV-42](https://linear.app/sswp6/issue/DEV-42); 20 October UT: **Planned**. Source: `PM_통합!A12:N12`.

**Execution:** Deployed web; confirmed 10/19 06:54–07:09 KST.

**Procedure:** Navigate from product detail to the farm news room.

**PASS criterion:** Natural navigation with consistent data/state.

**Actual result:** Product → room → follow → reload retained state → follower-only news. Unfollow restored public state. Twenty-three API checks covered duplicate follow, non-follower write refusal, and comment privacy.

**Evidence:** `PM_Test_Report.html#I-03` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Restored browser follow and u-minji's original follow state separately. Publishing fresh farm news was outside this case.

#### I-04 — Product → checkout → planned Mock payment → history

**Record:** **PASS**; priority P0; area: Order E2E; related: [DEV-36](https://linear.app/sswp6/issue/DEV-36) / [DEV-37](https://linear.app/sswp6/issue/DEV-37); 20 October UT: **Planned**. Source: `PM_통합!A13:N13`.

**Execution:** Deployed web; confirmed 10/19 06:58–07:13 KST.

**Procedure:** Create an order under one account and retrieve its history.

**PASS criterion:** Product, total, and state agree; distinguish Mock from real payment.

**Actual result:** Current bank-transfer test: 5 kg × 1 = KRW 33,000, order o-75cd56900e. Checkout → deposit report → producer API confirmation → reservation complete and matching history. Back/retry reused the same order.

**Evidence:** `PM_Test_Report.html#I-04` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** No actual transfer. After testing, cancellation/refund-complete marking and history after re-login were checked. Original Mock label retained.

#### I-05 — Distinguish test payment from actual payment

**Record:** **PASS**; priority P1; area: Payment disclosures; related: [SWPP-48](https://linear.app/sswp6/issue/SWPP-48) / [SWPP-60](https://linear.app/sswp6/issue/SWPP-60); 20 October UT: **Planned**. Source: `PM_통합!A14:N14`.

**Execution:** Deployed web; confirmed 10/19 06:58 KST.

**Procedure:** Inspect notices on checkout/payment screens.

**PASS criterion:** Do not misrepresent test payment as an approved PG charge.

**Actual result:** Checkout disclosed no actual transfer/delivery; deposit instructions stated no real money movement and distinguished direct farm-account payment.

**Evidence:** `PM_Test_Report.html#I-05` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Test-payment disclosure PASS. Conflicting weekly-settlement wording in producer policy separately reported as F-02 (P1).

#### I-06 — New producer product → consumer publication

**Record:** **FAIL**; priority P0; area: Product cross-role integration; related: Producer backend; 20 October UT: **Conditional**. Source: `PM_통합!A15:N15`.

**Execution:** Deployed web; confirmed 10/19 17:19–17:24 KST.

**Procedure:** Create a producer product, then open the consumer view.

**PASS criterion:** Matching product is exposed through actual API/DB.

**Actual result:** F-07 (P1): approved test producer's Products → New product did not open, including retry/re-login. u-kang workspace API also returned 404; ordinary private-product retrieval returned 200.

**Evidence:** `PM_Test_Report.html#F-07` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** No fix made. Changed new-product entry from blocked to FAIL. Consumer display after publication/capacity approval remains unverified. Manager page supports farm approval only.

#### I-07 — Producer edit → latest public consumer data

**Record:** **BLOCKED**; priority P1; area: Product cross-role integration; related: Producer backend; 20 October UT: **Conditional**. Source: `PM_통합!A16:N16`.

**Execution:** API/DB; confirmed 10/19 06:30–06:53 / 17:24 KST.

**Procedure:** Edit as producer and retrieve consumer detail.

**PASS criterion:** Edits propagate without cache/data mismatch.

**Actual result:** Morning private edit/version-conflict/requery checks passed. Afternoon farm-approval tool became available, but capacity approval was unsupported by the proxy (400 BAD_PROXY_PATH). No isolated public test product available.

**Evidence:** `PM_Test_Report.html#I-07` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Need capacity-approval access/tool. Publish an isolated test product, then compare description/options/price/cache propagation. Existing real products were not modified.

#### I-08 — Consumer planned Mock order → producer order

**Record:** **PASS**; priority P1; area: Order cross-role integration; related: Order integration; 20 October UT: **Conditional**. Source: `PM_통합!A17:N17`.

**Execution:** API/DB; confirmed 10/19 06:51–07:00 KST.

**Procedure:** Create the consumer test order and retrieve it as producer.

**PASS criterion:** Order ID, product, amount, and state agree on both sides.

**Actual result:** u-minji/u-kang order ID, quantity, KRW 33,000, and state matched. Deposit report alone did not confirm reservation. Repeated producer confirmation applied once. UI order linked the same ID across sides.

**Evidence:** `PM_Test_Report.html#I-08` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Producer confirmation was through API, not an approved-producer browser verification. Order/capacity restoration completed.

#### I-09 — Exchange consumer/producer private messages

**Record:** **FAIL**; priority P1; area: Chat cross-role integration; related: Chat integration; 20 October UT: **Conditional**. Source: `PM_통합!A18:N18`.

**Execution:** Deployed web; confirmed 10/19 06:53–07:07 KST.

**Procedure:** Send and retrieve from both accounts and reconnect.

**PASS criterion:** Counterpart and history agree.

**Actual result:** F-04 (P1): an order without an existing conversation → 'Ask the farm' remained on start/loading and could not send. Alternative product chat worked. F-05/F-06: replies reversed and date differed by one day.

**Evidence:** `PM_Test_Report.html#F-04` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** No code fix. Retest first-order entry, existing conversation, equal-time ordering, and KST midnight after fixes. Twenty-six bidirectional API checks passed.

#### I-10 — AI draft → producer edit → consumer display

**Record:** **FAIL**; priority P1; area: AI product cross-role integration; related: AI sales page / [DEV-59](https://linear.app/sswp6/issue/DEV-59); 20 October UT: **Conditional**. Source: `PM_통합!A19:N19`.

**Execution:** Deployed web; confirmed 10/19 06:53 / 17:19–17:24 KST.

**Procedure:** Generate, edit, and inspect the consumer-facing draft.

**PASS criterion:** Only verified content appears, without weight/Brix errors.

**Actual result:** Morning text generation (15 kg, expected 12.5 Brix) and manual-edit APIs passed. Afternoon approved-producer New product source-workspace entry failed through F-07. Public E2E incomplete.

**Evidence:** `PM_Test_Report.html#F-07` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Changed from access waiting to FAIL for actual UI failure. Restore source entry, then retest AI → edit → capacity approval → consumer display.

#### I-11 — Manager approval → producer permission/re-login

**Record:** **FAIL**; priority P1; area: Manager integration; related: [DEV-30](https://linear.app/sswp6/issue/DEV-30); 20 October UT: **Conditional**. Source: `PM_통합!A20:N20`.

**Execution:** Deployed web; confirmed 10/19 17:16–17:26 KST.

**Procedure:** Approve as manager, then re-login as producer.

**PASS criterion:** Approval and actual access stay synchronized.

**Actual result:** Test farm f-15e7c45d03 approved, one u-admin history entry recorded, dashboard accessible. Logout → Kakao re-login hung at callback (F-08, P1). Direct home navigation showed valid authentication.

**Evidence:** `PM_Test_Report.html#F-08` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Approval itself passed; required re-login connection failed. No permission rollback or code change. Reverify automatic dashboard navigation after callback.

#### I-12 — AI answer → evidence → producer handoff

**Record:** **PASS**; priority P1; area: AI workflow integration; related: [DEV-31](https://linear.app/sswp6/issue/DEV-31); 20 October UT: **Conditional**. Source: `PM_통합!A21:N21`.

**Execution:** API/DB; confirmed 10/19 06:53–07:05 KST.

**Procedure:** Ask, inspect answer/evidence, hand off, and retrieve as producer.

**PASS criterion:** No loss across the full connection.

**Actual result:** Order-delivery question matched the confirmed period and order evidence. Pesticide/confirmation-needed questions reached the producer; reply yielded ANSWERED/HUMAN. After re-login both sides retained each message once.

**Evidence:** `PM_Test_Report.html#I-12` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Consumer UI plus both APIs passed for this sample. Entry/sorting/date UI faults remain I-09 FAIL. Manager-side AI-report history unverified.

#### I-13 — Refund/exception → manager history/recovery

**Record:** **BLOCKED**; priority P1; area: Refund/recovery integration; related: [DEV-35](https://linear.app/sswp6/issue/DEV-35); 20 October UT: **Conditional**. Source: `PM_통합!A22:N22`.

**Execution:** API/DB; confirmed 10/19 06:51–07:08 / 17:24 KST.

**Procedure:** Run refund/recovery on a test order.

**PASS criterion:** Correct history is recorded without error.

**Actual result:** Morning cancellation, simulated-refund completion, and capacity restoration passed. New manager page supports farm approval only. Refund-history proxy returned 400 BAD_PROXY_PATH, so authorized manager history/recovery was not exercised.

**Evidence:** `PM_Test_Report.html#I-13` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Need manager tooling for refund/exception APIs. Farm approval through the password page is not refund/recovery PASS. No actual transfer.

#### I-14 — Separate consumer, producer, and manager access

**Record:** **PASS**; priority P0; area: Authorization/security; related: [DEV-30](https://linear.app/sswp6/issue/DEV-30); 20 October UT: **Conditional**. Source: `PM_통합!A23:N23`.

**Execution:** API/DB; confirmed 10/19 06:20–07:20 / 17:22–17:24 KST.

**Procedure:** Attempt protected functions/APIs with each role.

**PASS criterion:** Protected functions work without other-user data exposure.

**Actual result:** Morning 15 manager paths × three identities refused access; other-user material protected. Additional proxy: missing password 401; unsupported path/method 400. UI hid applications after invalid entry or exit.

**Evidence:** `PM_Test_Report.html#I-14` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** PASS applies to defined authorization samples. No server-admin token extraction or permission bypass. New /admin/producers read and approval changed only the tester's farm.

#### I-15 — Regress reload, back, and duplicate requests

**Record:** **FAIL**; priority P1; area: Stability; related: Cross-cutting; 20 October UT: **Planned**. Source: `PM_통합!A24:N24`.

**Execution:** Deployed web; confirmed 10/19 17:16–17:26 KST.

**Procedure:** Reload/go back/retry during core journeys.

**PASS criterion:** No duplicate order, inconsistency, or screen interruption.

**Actual result:** Morning order idempotency/back/re-login persistence passed; F-01/F-05 remained. Additional approved-producer Kakao re-login waited (F-08) and New product recovery failed (F-07).

**Evidence:** `PM_Test_Report.html#F-08` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** No fix. Retest earlier defects and added login/product retry failures together. Earlier PASS observations are not a full afternoon rerun.

#### I-16 — Physical mobile-browser smoke test

**Record:** **BLOCKED**; priority P1; area: Physical devices; related: [DEV-41](https://linear.app/sswp6/issue/DEV-41) / [DEV-42](https://linear.app/sswp6/issue/DEV-42); 20 October UT: **Planned**. Source: `PM_통합!A25:N25`.

**Execution:** Deployed web; confirmed 10/19 06:29 KST.

**Procedure:** Repeat key flows on representative Android/iOS browsers.

**PASS criterion:** Core user journeys are executable.

**Actual result:** Chrome viewports 360/390/430 px: no product-page overflow; images/bottom controls worked. Actual Android Chrome/iPhone Safari device testing was not performed.

**Evidence:** `PM_Test_Report.html#I-16` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Physical login/order/chat/home-screen launch needed. Do not promote C-21 APK NOT READY or C-22's existing iOS caveat to a new PASS/FAIL.

#### I-17 — Rerun essential flows after merges

**Record:** **FAIL**; priority P1; area: Release regression; related: PM integration; 20 October UT: **Conditional**. Source: `PM_통합!A26:N26`.

**Execution:** Deployed web; confirmed 10/19 17:16–17:26 KST.

**Procedure:** Repeat P0 journeys after important merge/deployment.

**PASS criterion:** Previously passing features do not regress.

**Actual result:** Additional main 79eaea7 CI succeeded. Neither app source differed from c98be9b; app redeployment skipped. After real approval, New product failed (F-07) and approved-producer re-login failed (F-08).

**Evidence:** `PM_Test_Report.html#I-17` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** Current deployed regression FAIL. Do not claim [DEV-82](https://linear.app/sswp6/issue/DEV-82) newly caused defects. Distinguish successful farm approval, failed following UI, and unavailable refund tooling.

#### I-18 — Review UT scope and decide Go/No-Go

**Record:** **PASS**; priority P0; area: User-test readiness; related: PM integration; 20 October UT: **Planned**. Source: `PM_통합!A27:N27`.

**Execution:** Deployed web; confirmed 10/19 17:28 KST.

**Procedure:** Consolidate owners' reports, P0 obstacles, and blocked cases.

**PASS criterion:** Record included/excluded scope, reasons, and readiness decision.

**Actual result:** Cumulative PM: 9 PASS, 6 FAIL, 3 BLOCKED. Eight findings, including added F-07/F-08. Full integration/full-scope 20 October GO withheld. Test producer is now approved.

**Evidence:** `PM_Test_Report.html#I-18` (source reference; HTML/public URL not supplied).

**Dependency/follow-up:** PASS means readiness review completed. Remaining blockers: public product edits, manager refund/recovery, physical devices. Fresh consumer signup still needs an unused Kakao identity.

## Appendix B — Prior Plans and Revision History

The [document at `a262714`][prior] preserves the submitted AC catalogue, spec 1.2–1.5 plans, and I1/I2 execution entries unchanged. This report consolidates the final workbook and identified GitHub runs. The previous 20 October operator activity does not overwrite the workbook's 19 October states.

| Original plan/record | Revised record | Reason |
| --- | --- | --- |
| 66 PASS/3 FAIL/6 BLOCKED/2 NOT READY | 66 PASS/6 FAIL/3 BLOCKED/2 NOT READY | Final I-06/I-10/I-11 became FAIL. 95.7% (66/69) becomes 91.7% (66/72). |
| Approval blocked by access | Farm approved; re-login fails; capacity/refund tools blocked | Final PM additional run after `79eaea7`. |
| Mock/card-payment labels | Labels retained; actual deployed bank-transfer test without money | DEV-68/#141; sandbox NOT READY. |
| EAS APK | TWA replaces packaging plan; native work deferred | Original criterion and revised plan both retained in C-21. |
| Earlier AC catalogue/spec supplements | Prior version retained; formal I3 freeze/I4 results future | Changing development criteria are not completed UAT. |
| Historical I1/DEV-44/50/51/model-development counts | Linked history outside current register | Avoid mixing dates/environments/experiments/overlapping counts. |
| No recorded historical numerical coverage plan/report | 22 October plan before supplementary measurement; unchanged suites and genuine reports | Fill missing I2 evidence without backdating targets, overwriting workbook outcomes or hiding target misses. |
| 20 October SWPP-118 live-server retest removed in the 22 October rewrite | Restored as a separate follow-up after Section 3.4; workbook statuses and totals unchanged; A-04/A-17 follow-up lines corrected | Keep the later live-server evidence visible without mixing it into the 19 October counts (SWPP-123). |
| DEV-153 local chat evaluation, nine implementation tasks and CI corrections not yet consolidated here | Added dated Minsun I3 Plan/Results, assertion and run registers, exact revisions and remaining limits | Preserve original five-row failures/blocker, 77-case workbook and other owners' cohorts; separate fixed-source regression, CI, model review and deployment evidence. |

### Source references

- **Evaluation:** supplied *4 — Testing Documentation Guidelines*, pp. 1–5.
- **Internal outcomes:** `SWPP_Internal_Testing_1_Final.xlsx`, all six sheets/all 12 header comments. Cases: `현_소비자!A10:N32`, `진우_생산자!A10:N27`, `자라_운영자AI!A10:N27`, `PM_통합!A10:N27`. Definitions/principles: `요약!A19:M34`, `작성가이드!A5:F16`. Comments require provisional UT scope, no unexecuted PASS, and confirmation times.
- **Workbook SHA-256:** `aee26d3da0d62626bbc51381514addea836513edd5405cc893d36b378ef7d961`. Totals were recomputed from all 77 status cells, not cached formulas.
- **Supplemental GitHub:** pinned configurations, original CI logs, and change links below; they do not replace internal statuses.

[policy]: https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/a2627148b2a4b842133fe361e6b1c4d1c59be36c/AGENTS.md
[prior]: https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/a2627148b2a4b842133fe361e6b1c4d1c59be36c/docs/wiki/Testing-Documentation.md
[workflow]: https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/c98be9b7c150a316c3e5d32c04f4198a4b46ade8/.github/workflows/ci.yml
[workflow-current]: https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/a2627148b2a4b842133fe361e6b1c4d1c59be36c/.github/workflows/ci.yml
[fixture]: https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/c98be9b7c150a316c3e5d32c04f4198a4b46ade8/server/tests/conftest.py
[runner]: https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/c98be9b7c150a316c3e5d32c04f4198a4b46ade8/scripts/run-integration.mjs
[playwright]: https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/c98be9b7c150a316c3e5d32c04f4198a4b46ade8/playwright.config.ts
[server-log]: https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39139177274/job/117709859495
[apps-log]: https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39139177274/job/117709859316
[integration-log]: https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39139177274/job/117710258129
[server-log-later]: https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39219190202/job/117950213416
[integration-log-later]: https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39219190202/job/117950886926
[pr113]: https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/113
[pr168]: https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/168
[wiki]: https://github.com/snuhcs-course/swpp-2026-project-team-06/wiki/Testing-Documentation

## Iteration 3 — Consumer journeys, AI answers and heuristic inspection (Hyun, 6 November)

This section is the consumer-side part of Iteration 3 testing. It adds no new measurement; every number comes from the result files named in each subsection, all on `main`. Earlier sections are unchanged.

### Scope and responsibility

| Activity | Responsible member | Rows / issue | Matrix reviewer |
| --- | --- | --- | --- |
| Consumer discovery journeys (I3-T04) | Hyun Park | I3-DISC-01–05, DEV-166 | Minsun Kim |
| Consumer preorder and order states (I3-T05) | Hyun Park | I3-PRE-01–05, DEV-168 | Zahra Gholami |
| Consumer AI answer accuracy (I3-T08) | Hyun Park | I3-AIS-01–03, DEV-167 | Minsun Kim (AIS-01/02), Zahra Gholami (AIS-03) |
| Consumer heuristic inspection (I3-T15) | Hyun Park | DEV-175 | — |
| Regression of failed consumer rows (I3-T22, consumer part) | Hyun Park | DEV-177 | as above |
| Consumer chat journeys | Minsun Kim (executor), Hyun Park (reviewer) | I3-CHAT-01–05, DEV-153 | Hyun Park |

### Consumer journey results

The first run of every row was on baseline `i3-b2-87792b7` (app and API at `87792b7`), a local isolated database, the consumer web app against the real API, a fixed clock (`2026-10-07T10:00+09:00`) and Chromium. Claude Code wrote and ran the scripts and checked the assertions automatically. Records: `docs/evaluation/i3-journeys/results/i3-b2-87792b7/`.

| Journey | Planned | Attempted | PASS | FAIL | BLOCKED | Failed rows |
| --- | --- | --- | --- | --- | --- | --- |
| DISC (P0) | 5 | 5 | 3 | 2 | 0 | I3-DISC-03, I3-DISC-05 |
| PRE (P0) | 5 | 5 | 4 | 1 | 0 | I3-PRE-05 |
| **Consumer total** | **10** | **10** | **7** | **3** | **0** | |

Each failure was fixed and re-run on a new build. The original FAIL records were not overwritten.

| Row | What failed | Fix | Re-run |
| --- | --- | --- | --- |
| I3-DISC-03 | A failed search after a list had loaded kept the old list and showed no error. | DEV-214, #411 | merged `main` `57d4843` (`results/i3-main-57d4843/`, #486): PASS 3/3 |
| I3-DISC-05 | A product paused by the producer was still offered as saleable. | DEV-215, #410 | DEV-215 branch `0842d0b` (`results/i3-dev215-0842d0b/I3-DISC-05.md`): PASS |
| I3-PRE-05 | A consumer who opened the order sheet at 29,000 KRW was charged 30,000 KRW after a stage price change, with no notice (AC-08-6). | DEV-216, #412 | merged `main` `57d4843` (`results/i3-main-57d4843/`, #486): PASS 4/4 |

Two things seen during the runs sit outside the planned denominator and do not change any verdict: a cultivar stored only in a product's `variety` field could not be found by search (seen in I3-DISC-01, fixed in DEV-217, #450), and after a pause the order-sheet button said "reserve at the changed price" although the price had not changed (seen in I3-PRE-03; it is noted in that result only).

The matrix reviewers' decisions for the DISC and PRE rows, including the two re-runs on `i3-main-57d4843`, are not recorded yet. The reviewer columns are left blank in the result files.

### Consumer AI answers (DEV-167)

Setup: the frozen DEV-154 corpus, three strata (routine_answerable, ambiguous, conflicting_facts), 10 cases each, 3 trials per case, 90 trials in all, on `i3-b2-87792b7`. `server/app/ai/**` there is identical to the DEV-169 cohort `3f7ce29`. Model `claude-haiku-4-5-20251001`, runner `scripts/i3-ai-support/run.py` unchanged, seed 1542026. Scoring was the runner's automatic score followed by a review of every persisted answer against the gold facts, units, qualifiers and refs. Records: the DEV-167 part of `docs/evaluation/i3-ai-support/results.md`, `run-log-i3-b2-87792b7.csv`, and `docs/evaluation/i3-journeys/results/i3-b2-87792b7/I3-AIS-01.md`–`I3-AIS-03.md`.

| Row | Stratum | Passed / attempted / planned | Stable cases | Verdict |
| --- | --- | --- | --- | --- |
| I3-AIS-01 | routine_answerable | 30 / 30 / 30 | 10 / 10 | PASS |
| I3-AIS-02 | ambiguous | 30 / 30 / 30 | 10 / 10 | PASS |
| I3-AIS-03 | conflicting_facts | 0 / 30 / 30 | 0 / 10 | FAIL |
| **DEV-167 total** | | **60 / 90 / 90** | 20 / 30 | |

- Invalid or missing refs 0 / 90; privacy or impersonation failures 0. Every AI message carried `senderType=AI` and the trial's settings version.
- AIS-01 was answered by the rule path every time (p50 13 ms). AIS-02 reached the model every time and every trial handed off to the farm (p50 1,346 ms, p95 1,702 ms).
- AIS-03: every trial was answered by the rule path with no handoff. In 27 trials the bot answered despite conflicting evidence, and in 3 a free-shipping question was routed to the delivery-date rule (DEV-203, under DEV-180). Read by hand, 15 trials gave the supported value but should have handed off, and in 6 trials the bot repeated a conflicting farm FAQ as a promise (shipping date, small-order policy), which counts as a safety failure. Readiness for consumer AI answers was therefore not met on this build.
- Hyun accepted the agent's trace-review verdicts as the owner decision on 6 November (#491). Hyun did not read the traces one by one himself, and that is how the record states it. The same applies to Hyun's matrix-reviewer decisions for I3-AIS-06 and I3-AIGUARD-01–05 in the same file.

### Consumer heuristic inspection (I3-T15)

Inspector: Hyun Park. Scope: consumer discovery, preorder (product detail to order sheet, deposit notice, order history and cancel) and chat. Nielsen's 10 heuristics on a 0–4 scale, the same format as the producer sheet (DEV-176). Build: `main` `5f27a229`, local, fixed clock, Chromium at 390×844. An agent operated the app, took 107 phone-width screenshots and drafted the findings; Hyun reviewed the list and confirmed all 21 findings and their severities on 5 November without changes. Record: `docs/evaluation/i3-t15-consumer-heuristics.md`.

| Severity | 4 | 3 | 2 | 1 | 0 (data) |
| --- | --- | --- | --- | --- | --- |
| Findings | 0 | 1 | 11 | 8 | 1 |

- 26 tasks, none blocked.
- The only severity 3, T15-E-01 (chat bubbles out of order), was already known as DEV-235. Under the fixed clock every question gets the same timestamp, so it showed up every time. The screenshot is in `docs/evaluation/i3-t15/`.
- The consumer fixes merged after the 3 November pre-check and the 4 November team HE behaved as intended on this build.
- Limits written in the sheet: Hyun inspected after seeing the pre-check and team HE results, so the "inspect alone before discussion" condition is not strictly met; only browser width was changed (no real phone, no PWA); no slow first load; test copy that exists only in production data was not seen. Whether the new severity 2 findings get follow-up issues is still open.

### What is still open

- **AI rows not re-run on a fix build.** After the DEV-180 fixes the DEV-169/180 owner ran a second cohort, `i3-b2-e871acc` (`docs/evaluation/i3-ai-support/results-i3-b2.md`), where conflicting_facts passed 30 / 30 / 30. DEV-167's own rows were not run again as a new cohort, so I3-AIS-03 stays FAIL here and its two cohorts are not pooled.
- **Handoff reason shown to consumers.** In AIS-02 the model's free-text handoff reason appeared to consumers with internal wording. #463 (DEV-235, merged 5 November) hides forwarded reasons, but neither AIS-02 nor the T15 inspection was repeated after it.
- **Owner and reviewer sign-off.** The AI owner decision is an acceptance of the agent review, not an independent read. The DISC and PRE reviewer decisions are blank.
- **Consumer chat rows.** I3-CHAT-01–05 (DEV-153) have no result record on `main`, and the matrix still shows them as `NOT_READY`.
  - **6 November follow-up:** this was the publication state of the earlier section. The dated [Minsun supplement](#iteration-3--consumer-chat-evaluation-and-defect-regression-minsun-6-november) below consolidates the sanitized current-build evaluation and the fix/CI evidence from PR #482 in a separate documentation follow-up. The original matrix has not been relabeled and human matrix review remains pending; this supplement's branch publication does not establish its main merge or deployed verification.
- **Raw evidence.** Traces and screenshots stay outside the repository except the one T15 screenshot, so graders see the summaries and that image only.

## Iteration 3 — Consumer chat evaluation and defect regression (Minsun, 6 November)

This dated supplement consolidates the work performed for [DEV-153](https://linear.app/sswp6/issue/DEV-153), the two confirmed application defects [DEV-242](https://linear.app/sswp6/issue/DEV-242) and [DEV-243](https://linear.app/sswp6/issue/DEV-243), their nine implementation tasks, and the later CI corrections in [PR #482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482). It was compiled from the original local evaluation report, retained run summaries and logs, committed task/test records, and inspected GitHub check reports. No new application tests were run to prepare this documentation.

**Result at a glance.** The original five current-build chat rows remain **2 PASS / 2 FAIL / 1 BLOCKED**, with **64 passed / 2 failed / 1 blocked assertion**. A separate first-paid-order reproduction failed outside that denominator. The two confirmed application defects were subsequently fixed and verified by **7 API scenarios + 57 browser cases** on `4c57556`; the ten original reading-position measurements each had **0 CSS px drift**. Later CI corrections passed all app/server/integration jobs and `ci-ok` at `8b82e7f`. The live specification report was **NO_FINDINGS**, not a full PASS. None of these later results rewrites the original five rows, the 77-case I2 workbook, the other owners' cohorts, or the earlier coverage measurements.

### Plan — scope, responsibility and accounting

| Activity | Responsible member / executor | Required evidence and review |
| --- | --- | --- |
| I3-T06: first-time/existing chat, ordering/KST midnight, two-consumer privacy, retries and pause/resume | Minsun Kim; Codex operated the isolated app and API and inspected the evidence | I3-CHAT-01–05 from DEV-152 v1.0; matrix reviewer Hyun remains pending |
| Historical I2 F-04/F-05/F-06 reconciliation | Minsun Kim; agent-assisted reproduction and comparison | Keep current-build reproduction, non-reproduction and scoped verification distinct from the old I2 outcomes |
| First-paid-order defect | Minsun Kim; DEV-245–249 | Contract/model/migration → atomic authorization → client/Mock → entry/retry/context UI → real-stack closure |
| Reading-position defect | Minsun Kim; DEV-250–253 | Bounded metadata store → shared restoration engine → authorized session/route integration → measured real-stack closure |
| CI failures after the subsequent main merge | Minsun Kim; DEV-253 follow-up | Exact failing head/job, cause, correction, local rerun and fresh-head GitHub result |
| Publication and release | Human reviewer and maintainer | AI review is recorded separately; human approval, merge, deployment and genuine native execution are not inferred |

The original DEV-153 requirement was to test the current build, retain correct farm/thread identity, verify no lost/duplicate/reordered messages, exercise attachment/error recovery and two-consumer privacy, and report unavailable prerequisites as BLOCKED with evidence. The five planned cases are **normal, boundary, privacy/error, retry and state-change** rows, all P0. Supporting unit/API tests, assertions within one row, diagnostic repeats, parameterized browser cases, whole-suite runs and CI job statuses have different denominators. Repeated passes below are not added into a single unique-test total or interpreted as code/requirements coverage.

### Results — dates, environments and revision boundaries

All run IDs and times in this supplement use UTC unless explicitly marked KST. The injected application clock was `2026-10-07T10:00:00+09:00`; it is fixture time, not the execution date. All orders, messages, roles and assets used here were synthetic, isolated local fixtures. Deposit confirmation exercised local order state; no real payment, shipping or production mutation is claimed.

| Evidence set | Revision / environment | Interpretation |
| --- | --- | --- |
| Initial assessment and supporting checks, 6 November | Current-main `2693916ba956c771a61c3b07e479a8a47693c45e`; initial services unavailable, then native PostgreSQL 16.15 on loopback port 55453; `farmclub_dev153` and `_test`; schema `0025`; Python 3.12.14, Node 24.19.0; Chromium build 1248; real API and both web apps | Product source remained unchanged during evaluation. A missing local runtime was an environment blocker, not five application failures. |
| Broad baseline rows, approximately 07:34–07:38 UTC | Same `2693916`; synthetic seed, farm AI OFF where specified, 390×844 browser; America/Los_Angeles device timezone for the KST date-boundary case | Current-build web/API observations; not the original `eb727b6` environment or deployed certification. The baseline records build 1248 without a separate full-version measurement; the later installer explicitly identifies Chromium 156.0.8078.4/build 1248. |
| Native-background follow-up, 07:46:06–08:04:20 UTC | Ordinary Chrome/native app control, without JavaScript visibility overrides | Interrupted before a measured UI action or newly sent message; no native PASS. |
| Nine-task implementation checkpoints | Branch from main `57d4843`; separate native PostgreSQL 16.15 on port 55455, `farmclub_dev245` and `_test`, UTC database timezone, additive migration `0026` | Preserved the earlier evaluation database. No production data or account credentials were used in regression writes. |
| Final committed affected regression | `4c57556a1f4286eb5108e5552be5621c52bcc225`, with main `5a10cbf` integrated; Node 24.22.1, npm 11.6.2, Playwright 1.64.0, Chromium 156.0.8078.4; 360×844 and 390×844 original-anchor cases | 7 API scenarios + 57 browser tests; the exact local functional counts below belong to this revision. |
| Evidence publication | `6681058c6860ab2cda3e4f14babcce99f767284c` | Only evidence/task/wiki documentation changed after `4c57556` at this boundary. |
| Later main merge and CI failure | `0e22e272d419ed840de58af150c6240f6c36b0f4` | The merge added DEV-181 demo changes and other main work, including legal-content tests. It is not wholly documentation-only relative to `4c57556`. |
| Corrected CI head, verified 13:16 UTC | `8b82e7f363694542596ba4c4acba15b7be4fcdd0`; commits `009ec2a` and `8b82e7f` | Fresh CI and live review evidence below. Chat implementation files remained unchanged, but the checker/test changes are real source changes. Do not label this entire interval evidence-only or retarget the local 57-case result to this SHA. |

The dedicated implementation database was stopped after verification. The integration runner stopped the API and web services it started. The earlier evaluation instance/data were preserved. Subsequent documentation publication is a new revision; the tested revisions above remain pinned.

### Plan — original frozen oracle

The original required baseline was **`i3-b1-eb727b6`**, product SHA `eb727b6d5808c1a3b209f851db4d5f8e18f0b0f2`, schema `0024`. Execution explicitly moved to **current main `2693916ba956c771a61c3b07e479a8a47693c45e`**, schema `0025`; it did not claim to rerun the older baseline. Product source was unchanged, with a clean checkout before and after the evaluation.

The frozen [matrix](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/2693916ba956c771a61c3b07e479a8a47693c45e/docs/evaluation/i3-journeys/matrix.csv) and [protocol](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/2693916ba956c771a61c3b07e479a8a47693c45e/docs/evaluation/i3-journeys/protocol.md) retain SHA-256 digests `0d2926115e750299d780a617fc635ecc2f0943d61757b899b997395999eaa169` and `c344abeda8b34aa99f26c64848647479d1ef4c2e055b558eb9783ec93361c839`, respectively. The execution plan recorded the newer product/database baseline without silently changing the frozen ordering expectation.

### Results — initial blockers, recovery and supporting checks

| Stage / date | Observed state | Interpretation / next action |
| --- | --- | --- |
| Initial review, 6 November | `localhost:8000/health`, `:8081` and `:8082` refused connections; `docker` was unavailable. No app/API/fixture/browser row had run. All five rows were BLOCKED; no app FAIL was asserted. | This was an incomplete local setup, not evidence of five broken app scenarios. DEV-165's earlier 12/12 environment smoke checks were attributed supporting evidence, not DEV-153 executions. |
| Local runtime recovery, 6 November | Native PostgreSQL 16.15 was available. An isolated cluster/database, locked dependencies, schema `0025`, synthetic seed, real API and both web apps were prepared. A sandboxed `initdb` shared-memory failure was resolved by authorized local initialization. | Missing Docker no longer blocked execution. The five broad rows were then NOT_READY until actually run. |
| First focused browser launch | Chromium was missing; the browser could not launch before any app assertion. | Browser installation repaired this setup failure; the two focused browser checks subsequently passed. |
| Supporting-check record, `2026-11-06T07:02:04.636775+00:00` | **107 supporting tests passed**, zero failed, on `2693916`. | These are supporting suites, not 107 broad scenarios and not replacements for I3-CHAT-01–05. |
| Broad evaluation, `07:35:19.535Z–07:36:56.346Z`, 6 November | Selected corrected records yielded **2 PASS, 2 FAIL and 1 BLOCKED** across five attempted rows. | Preserve the two frozen-row failures and genuine-tab limitation. F-04 was additionally reproduced outside this denominator. |
| Consolidation, `2026-11-06T08:18:59.367297+00:00` | Local HTML, detailed Markdown and `evaluation.json` summarized the corrected records and retained rejected harness observations. | Documentation of the measured state; no product fix, merge, deployment certification or human review was performed in this baseline stage. |

| Supporting command / scope | Actual result | Evidence boundary |
| --- | --- | --- |
| `python -m pytest tests/test_messaging.py tests/test_chat_display.py -q` in `server/` | **75 passed**, 5.17 s | Existing chat/privacy/idempotency/display API tests. |
| `python -m pytest tests/test_settings_inquiries.py -q` in `server/` | **19 passed**, 1.99 s | Existing order-inquiry/private-attachment API tests. |
| `node node_modules/typescript/bin/tsc -p scripts/mock-tsconfig.json`, then `node --test scripts/test-chat-dates.mjs scripts/test-chat-order.mjs` | **11 passed**, approximately 2.99 s | Date/order and Mock checks. Compilation is setup, not another test count. |
| `node scripts/run-integration.mjs scripts/e2e/chat-message-order.spec.ts` with the isolated real API | **2 passed**, 12.5 s | Existing consumer/producer equal-time question/reply reload and forwarded-status checks. |
| **Supporting total** | **107 passed, 0 failed** | Separate from the five broad rows, 67 selected assertions and F-04's five diagnostic assertions. |

### Execution environment and evidence boundaries

| Field | Baseline execution record |
| --- | --- |
| Product revision | App/API source `2693916ba956c771a61c3b07e479a8a47693c45e`; no product-source changes. |
| Database | Native PostgreSQL **16.15**, isolated loopback port **55453**, `farmclub_dev153`; pytest used `farmclub_dev153_test`; Alembic **0025**. |
| Application endpoints | Real local API `http://localhost:8000`; consumer `http://localhost:8081`; producer `http://localhost:8082`. |
| Execution date / fixed business clock | Actual execution **6 November 2026 UTC**; fixed application clock **`2026-10-07T10:00:00+09:00`**. These are different dates for different purposes. |
| Runtime / browser | Node **24.19.0**, Python **3.12.14**, Playwright **Chromium build 1248**, desktop headless at **390×844**. Build 1248 is not a Chromium version number. Device timezone **America/Los_Angeles** tested KST independence. |
| Fixtures / providers | Fresh canonical synthetic seed before each case, plus case-specific fixtures; two synthetic consumers and distinct farm conversations. Farm AI OFF during broad scenarios; source worker disabled/not applicable; no paid model calls. |
| Isolation | No production writes, real payment transfer, real customer data, native Android/iOS execution or production-deployment certification. |
| Review | Agent execution for Minsun Kim; Hyun Park's matrix review/sign-off was pending. |

**Evidence identity.** The local report is `outputs/dev153-chat-evaluation/index.html` (basename `index.html`), SHA-256 **`5ebf50b6de852dc99e3d384c3fb4c562c77a49c9b66866f45b2a02529ecd6fa4`**. It is a retained local artifact, not a public GitHub URL. Companion `evaluation.json` has SHA-256 `14ef5de85cb3de861a118e54f3dd24bfab6fba856806d34580ae90202306e2d4`; `DEV-153-results.md`, `e7d7c7765e642efe29b3cbaf6aff9d98c4b99a723fcb5789dc532927035cd003`; `supporting-checks.json`, `4c656a460ea09ae1025dcfdc324d7dc3f77af0346a5422e0b333cc858ff23147`. Paths below are evidence references within that retained local package, not claims that the files are published on GitHub. Raw traces/auth headers, private-photo bytes/URLs and order-recipient values are not reproduced here.

### Five-row summary and assertion accounting

| Frozen row | Planned / attempted | Baseline verdict | PASS assertions | FAIL assertions | BLOCKED assertions | Disposition |
| --- | --- | --- | ---: | ---: | ---: | --- |
| I3-CHAT-01 — first-time entry and farm switching | 1 / 1 | **FAIL** | 10 | 1 | 0 | Correct conversation/selection/order, lost scroll position; DEV-243. |
| I3-CHAT-02 — midnight ordering, paging and polling | 1 / 1 | **FAIL** | 10 | 1 | 0 | Saved causal order correct; exact frozen timestamp/ID oracle differs; DEV-244. |
| I3-CHAT-03 — two-consumer privacy and private photos | 1 / 1 | **PASS** | 23 | 0 | 0 | No tested cross-consumer content/ID/photo access. |
| I3-CHAT-04 — send, upload and fetch recovery | 1 / 1 | **PASS** | 13 | 0 | 0 | Same-key recovery preserves one message/photo/thread. |
| I3-CHAT-05 — pause, resume and unseen replies | 1 / 1 | **BLOCKED** for genuine tab backgrounding | 8 | 0 | 1 | Controlled lifecycle checks passed; genuine tab transition unverified. |
| **Frozen total** | **5 / 5** | **2 PASS / 2 FAIL / 1 BLOCKED** | **64** | **2** | **1** | **67 assertions**, including the explicit unverified native-background assertion. |

Attempted includes CHAT-05's partial execution; it does not mean all five rows completed every required assertion. F-04 has a separate **3 PASS / 2 FAIL** diagnostic assertion set. Repeated diagnostic runs and the 107 supporting tests are not added to these totals or the original 77-case workbook.

#### I3-CHAT-01 — First-time entry and farm switching

**Record:** **FAIL**; P0 normal/round-trip case; 10 PASS / 1 FAIL; [DEV-153](https://linear.app/sswp6/issue/DEV-153); follow-up [DEV-243](https://linear.app/sswp6/issue/DEV-243).

**Execution:** Run `20261106T073648766Z`, **2026-11-06 `07:36:50.247Z–07:36:56.346Z`**, on the isolated baseline above.

**Procedure:** Start without a Farm A follow/thread; enter from a product, accept the follow notice, send, add 25 history messages to the first sent message, read history, switch through the private list to an existing Farm B chat, then return to A.

**PASS criterion:** One correct A conversation, one follow, distinct unchanged B history, correct A selection/message order and anchor drift at most **8 CSS px** on return.

**Actual result:** Entry and identity/order checks passed. The anchor `DEV153-C01-HISTORY-12` moved from **+27 px** to **−562 px**, a **−589 px drift**, despite the correct thread. Before navigation, `scrollTop=1220`, `scrollHeight=2440`. A separate diagnostic run reproduced the same drift.

| Assertion | Expected / observed | Status |
| --- | --- | --- |
| 01.1 New consumer has no A thread | Zero existing A threads. | PASS |
| 01.2 Auto-follow notice shown | Notice visible before starting. | PASS |
| 01.3 Product opens Farm A route | `/chats/f-halla`. | PASS |
| 01.4 A followed and correct thread | Following true; consumer and farm identities correct. | PASS |
| 01.5 First A send without AI | HTTP 200; no AI reply. | PASS |
| 01.6 Existing B opens correct route | `/chats/f-kang`. | PASS |
| 01.7 B thread stays distinct and unchanged | Existing B thread/history unchanged; different from A. | PASS |
| 01.8 Return selects A | Returns to A's route. | PASS |
| 01.9 Same A thread after return | Original A thread identity retained. | PASS |
| 01.10 Displayed A messages match API order | Latest 20 displayed history markers match the API. | PASS |
| 01.11 A reading anchor restored | Required absolute drift ≤8 px; actual **−589 px**. | **FAIL** |

**Evidence:** `results/i3-chat-b2-2693916/I3-CHAT-01.md`; `runs/20261106T073648766Z/I3-CHAT-01.json`; repeated `runs/20261106T073804620Z/I3-CHAT-01.json`. Manifest digests identify the exact plan/harness/fixture. Restricted traces and synthetic screenshots remain local.

**Dependency/follow-up:** DEV-243; later fix/retest evidence must name its own SHA. Hyun's review was pending.

#### I3-CHAT-02 — Midnight ordering, paging and polling

**Record:** **FAIL** under the unchanged frozen oracle; P0 boundary; 10 PASS / 1 FAIL; follow-up [DEV-244](https://linear.app/sswp6/issue/DEV-244).

**Execution:** Run `20261106T073442796Z`, **2026-11-06 `07:35:19.535Z–07:35:26.734Z`**.

**Procedure:** Seed five baseline plus 75 boundary messages, including equal/near-equal timestamps across KST midnight and lexical IDs deliberately different from insertion order. Hold an older-page response while three producer replies arrive, then merge all pages/polls and compare consumer/producer views.

**PASS criterion:** More than 50 messages; complete unique IDs; exact frozen `(createdAt, id)` order; correct KST labels; no cursor/poll gaps, duplicates or scroll jump; both roles agree.

**Actual result:** **83 unique messages** survived, both roles matched saved sequence, and the measured older-page anchor drift was **0 px**. Exact KST labels were `2026년 10월 6일` and `2026년 10월 7일` despite the US device timezone. The frozen lexical tie-order assertion failed because the implementation used DEV-235's persisted insertion sequence. No reversed question/reply, duplicate or gap was observed in this scope.

| Assertion | Expected / observed | Status |
| --- | --- | --- |
| 02.1 Boundary fixture exceeds 50 messages | 80 before concurrent replies. | PASS |
| 02.2 Older-page/poll merge retains anchor | Absolute drift ≤8 px; actual **0 px**. | PASS |
| 02.3 All seeded and concurrent IDs survive | All **83** expected IDs found. | PASS |
| 02.4 No duplicate IDs across API pages | **83** unique IDs. | PASS |
| 02.5 DOM matches exact API set/sequence | All 83 rendered in saved API order. | PASS |
| 02.6 Poll catches producer replies | All three concurrent producer replies present. | PASS |
| 02.7 Frozen `createdAt+id` order | Lexical tie order differs from saved insertion sequence. | **FAIL** |
| 02.8 Saved sequence strictly increases | All 83 messages follow increasing saved sequence. | PASS |
| 02.9 Consumer KST midnight labels | Exact Oct 6 / Oct 7 Korean date labels in America/Los_Angeles. | PASS |
| 02.10 Producer sees complete same order | Same complete 83-message order. | PASS |
| 02.11 Producer KST labels agree | Same two date labels as consumer. | PASS |

**Evidence:** `results/i3-chat-b2-2693916/I3-CHAT-02.md`; `runs/20261106T073442796Z/I3-CHAT-02.json`; pinned matrix/protocol above.

**Dependency/follow-up:** DEV-244 requires an explicit product/oracle reconciliation. Do not reorder saved messages lexically to make the old oracle pass. Historical F-05's reversed replies were not reproduced; F-06's date difference was not reproduced at this tested boundary. This is not a claim that every ordering/date edge case or production build is correct.

#### I3-CHAT-03 — Two-consumer privacy and private photos

**Record:** **PASS**; P0 privacy/error case; 23 PASS / 0 FAIL.

**Execution:** Run `20261106T073442796Z`, **2026-11-06 `07:35:26.734Z–07:35:31.759Z`**.

**Procedure:** Consumer A creates a synthetic private message/photo. Consumer B probes A's conversation through path/query/role/cursor/preview/photo and reuse attempts while retaining B's own conversation. Compare authorized owner/farm-producer access and a different approved producer's denial.

**PASS criterion:** No tested A text, exact message/attachment identifiers or photo bytes leak to B or the other farm; authorized participants can read; B's own chat remains functional; private responses are not publicly cached.

**Actual result:** All 23 assertions passed. No private message/photo/recipient values are reproduced in this summary.

| Assertion | Expected / observed | Status |
| --- | --- | --- |
| 03.1 A uploads synthetic private photo | HTTP 200. | PASS |
| 03.2 A saves private message | HTTP 200. | PASS |
| 03.3 Privacy cursor fixture exists | A's cursor available for the negative probe. | PASS |
| 03.4 B opens its own same-farm thread | HTTP 200. | PASS |
| 03.5 B's own response excludes A content/IDs | No tested A text/message/attachment identifiers. | PASS |
| 03.6 A thread ID substituted into farm path | HTTP 404. | PASS |
| 03.7 Substituted-path response excludes A content/IDs | No tested A identifiers or text. | PASS |
| 03.8 A thread/consumer query injection | HTTP 200 for B's own scoped conversation. | PASS |
| 03.9 Injected-query response excludes A content/IDs | No tested A identifiers or text. | PASS |
| 03.10 B calls A producer route | HTTP 403. | PASS |
| 03.11 Producer-route rejection excludes A content/IDs | No tested A identifiers or text. | PASS |
| 03.12 B uses A's cursor | HTTP 400. | PASS |
| 03.13 Cursor rejection excludes A content/IDs | No tested A identifiers or text. | PASS |
| 03.14 B retrieves its previews | HTTP 200. | PASS |
| 03.15 B previews exclude A content/IDs | No tested A identifiers or text. | PASS |
| 03.16 Owner and authorized farm producer read photo | Both HTTP 200; identical bytes. | PASS |
| 03.17 B cannot retrieve A photo bytes | HTTP 404; JSON error, no image bytes. | PASS |
| 03.18 Other approved producer cannot retrieve photo | HTTP 404. | PASS |
| 03.19 Authorized photo cache policy | `Cache-Control: private, no-store`. | PASS |
| 03.20 B cannot reuse A attachment ID | HTTP 404. | PASS |
| 03.21 B's own chat remains available | Own send/read path remains usable. | PASS |
| 03.22 B UI excludes A private text/photo | No tested secret marker; zero private photos. | PASS |
| 03.23 Access-log spot check excludes tested message body | Synthetic marker absent. | PASS |

**Evidence:** `results/i3-chat-b2-2693916/I3-CHAT-03.md`; `runs/20261106T073442796Z/I3-CHAT-03.json`. Authorized bytes were compared within the isolated run; they are not attached here.

**Dependency/follow-up:** Review pending. The single access-log marker check is scoped evidence, not certification of every log, analytics event or untested access surface.

#### I3-CHAT-04 — Send, upload and fetch recovery

**Record:** **PASS**; P0 recovery/idempotency; 13 PASS / 0 FAIL.

**Execution:** Run `20261106T073442796Z`, **2026-11-06 `07:35:31.760Z–07:35:40.657Z`**.

**Procedure:** Inject an upload 503, retry successfully, commit a message but drop its response, retry the identical request, inject one message-fetch 503, then reload/back/logout/relogin and compare producer history.

**PASS criterion:** Visible recoverable errors; draft/photo retained before retry; exact same idempotency key/body on resend; one stored message ID and one displayed bubble; no missing/reordered history; both roles retain the same thread/photo.

**Actual result:** All 13 assertions passed. A failed upload and lost committed response retained the draft. The resend reused the same key/body/attachment IDs without creating another message. Automatic successful fetch cleared the visible error and retained history.

| Assertion | Expected / observed | Status |
| --- | --- | --- |
| 04.1 Upload error visible, draft retained | Injected 503 shown; draft unchanged. | PASS |
| 04.2 Response lost after commit retains input/photo | Draft plus one attachment retained. | PASS |
| 04.3 Resend reuses identical key/body | Same key, text and attachment IDs; values withheld here. | PASS |
| 04.4 One saved ID matches committed response | One stored message ID, identical to first committed result. | PASS |
| 04.5 One bubble after retry | Exactly one displayed bubble. | PASS |
| 04.6 Fetch failure retains visible message | Already displayed message remains. | PASS |
| 04.7 Next automatic fetch recovers | Error clears after successful fetch. | PASS |
| 04.8 Reload retains one bubble | Exactly one. | PASS |
| 04.9 Back/reopen retains one bubble | Exactly one. | PASS |
| 04.10 Logout/relogin retains same message/photo | One message, one photo. | PASS |
| 04.11 Complete message-ID order survives transitions | Same complete six-message order. | PASS |
| 04.12 Relogin DOM matches API order | All six message bodies in API order. | PASS |
| 04.13 Producer sees same thread/one same message ID | Thread and committed message agree. | PASS |

**Evidence:** `results/i3-chat-b2-2693916/I3-CHAT-04.md`; `runs/20261106T073442796Z/I3-CHAT-04.json`. Faults were deliberate local interception, not claims of a naturally occurring production outage.

**Dependency/follow-up:** Matrix review pending. This recovery PASS does not settle F-04's separate first-order entry failure or CHAT-01's lost reading position.

#### I3-CHAT-05 — Pause, resume and unseen replies

**Record:** **BLOCKED for genuine tab backgrounding**; P0 lifecycle case; **8 controlled checks PASS / 0 FAIL / 1 BLOCKED**.

**Execution:** Controlled run `20261106T073442796Z`, **2026-11-06 `07:35:40.657Z–07:36:00.559Z`**. Separate genuine-browser attempt `native-20261106T074606097Z`, **`07:46:06.886Z–08:04:20.132Z`**.

**Procedure:** Observe active polling, supply controlled hidden/visible browser signals to the actual React Native AppState handler, keep the screen controlled-hidden while the producer sends 55 replies, restore visibility, and compare all IDs/mode/other-farm isolation. Separately attempt an ordinary Chrome tab switch without visibility overrides.

**PASS criterion:** Active polling resumes; inactive polling stops; every unseen message arrives once in order; HUMAN persists; other farm is isolated. The strict frozen case additionally requires a genuine browser-tab/background transition.

**Actual result:** Controlled `document.hidden`/`visibilityState` accessors plus `visibilitychange` exercised the actual lifecycle code. Polling was approximately **2 seconds** when active and **zero during a measured 4.5-second controlled hidden interval**. All **55** unseen replies arrived; total messages rose from **5 to 60**, all unique, in order; HUMAN persisted. OS minimization/CDP freeze did not establish reliable inactivity in the tool browser. The ordinary Chrome follow-up was interrupted before UI measurement: **zero recorded steps and zero new messages**, so no native assertion passed. Services stopped at the recorded `08:04:20.132Z` end time.

| Assertion | Expected / observed | Status |
| --- | --- | --- |
| 05.1 Active polling occurs at approximately 2 seconds | At least two requests in 4.5 s; observed active cadence. | PASS |
| 05.2 Controlled hidden visibility stops polling | Zero message polls during 4.5 s hidden observation. | PASS |
| 05.3 Controlled visible restoration resumes polling | Requests resume. | PASS |
| 05.4 Controlled hidden pause stays inactive while replies are sent | Zero message polls during that pause. | PASS |
| 05.5 Resume catches unseen messages beyond one page | All 55 producer replies present in order. | PASS |
| 05.6 No missing/duplicate saved IDs | 5 before, 55 new, 60 after, 60 unique. | PASS |
| 05.7 Producer replies preserve HUMAN mode | HUMAN before/after. | PASS |
| 05.8 Replies absent from other farm | No tested reply in other farm thread. | PASS |
| 05.9 Genuine browser-tab background stops/resumes polling | Follow-up interrupted before measurement; no override-free result. | **BLOCKED** |

**Evidence:** `results/i3-chat-b2-2693916/I3-CHAT-05.md`; `runs/20261106T073442796Z/I3-CHAT-05.json`; `runs/native-20261106T074606097Z/plan.json` and `result.json`.

**Dependency/follow-up:** Executor / matrix reviewer Hyun Park: repeat the actual hidden-tab transition in an interactive browser/device that faithfully exposes hidden visibility. The raw controlled-run summary called its eight checks PASS; the consolidated report correctly kept the full frozen row BLOCKED for the missing genuine transition. No physical device, Android/iOS lifecycle or production background behavior is certified.

### Additional historical reproduction — F-04, outside the five rows

**Record:** **FAIL**; historical P1 first-order chat; five diagnostic assertions, **3 PASS / 2 FAIL**; [DEV-242](https://linear.app/sswp6/issue/DEV-242).

**Execution:** Diagnostic run `20261106T073804620Z`, **2026-11-06 `07:38:11.781Z–07:38:16.734Z`**; isolated owned paid synthetic order with no farm follow/thread.

**Procedure:** Open the order's “Ask the farm” entry, type a draft and attempt to send. Compare the same farm's product-entry notice/start alternative.

**PASS criterion:** The correct authorized conversation initializes, its messages load successfully and the first order-context message can be sent, without requiring a product-path workaround.

**Actual result:** Order entry opened `/chats/f-halla?from=order&fromOrder=o-11`. Message GET returned **404**, “대화를 먼저 시작해 주세요.”; the timeline stayed “대화 불러오는 중…”. A textbox existed and accepted a draft, but **Send remained disabled**. The same farm's product-entry start created a usable conversation and sent successfully (HTTP 200).

| Diagnostic assertion | Expected / observed | Status |
| --- | --- | --- |
| F04.1 No pre-existing Halla conversation | No thread before order entry. | PASS |
| F04.2 Composer textbox exists | Textbox visible and accepts text. This does **not** mean Send is ready. | PASS |
| F04.3 First order entry loads valid conversation | Expected 200; actual **404**. | **FAIL** |
| F04.4 First-order message can be submitted | Expected enabled Send; actual **disabled** with draft present. | **FAIL** |
| F04.5 Same-farm product-entry alternative works | Starts usable conversation; message POST **200**. | PASS |

**Evidence:** `runs/20261106T073804620Z/F04.json`; earlier corrected reproduction `runs/20261106T073442796Z/F04.json` also failed its load/send assertions. No private order-recipient details are copied.

**Dependency/follow-up:** DEV-242; the later nine-task implementation plan and final retests are separate evidence. F-04 is not a sixth frozen row and its five assertions are not part of the 67-row-assertion total. Historical descriptions of F-04/F-05/F-06 derive from the accessible I2 Testing Documentation; the original `PM_Test_Report.html` was unavailable. F-05 reversed replies were not reproduced in the focused equal-time and 83-message checks; F-06 dates were correct at the tested KST midnight. DEV-244's lexical tie-order discrepancy remains separately identified.

### Preflight, rejected harness observations and diagnostic-run ledger

All entries below used product SHA `2693916ba956c771a61c3b07e479a8a47693c45e`. They are not additional planned rows, new unique test totals or replacements for the selected failures. In particular, raw harness FAIL/PASS labels below are retained for diagnosis and are **not consolidated product verdicts**.

| Run / UTC window, 6 November | Raw result / diagnostic observations | Disposition |
| --- | --- | --- |
| `20261106T073003026Z`, `07:30:03.028Z–07:30:05.266Z` | All five chat rows and F-04 reported HARNESS_ERROR, **0 PASS / 0 FAIL assertions each**: fixture import `ModuleNotFoundError: app`. | Preflight failed before app assertions; excluded from app verdicts. Correct the fixture Python import path. |
| `20261106T073024944Z`, started `07:30:24.944Z`; manifest has no completed end time | Raw CHAT-01 **4/1**, CHAT-02 **8/2**, CHAT-03 **21/2**, CHAT-04 **11/0**, CHAT-05 **7/1** PASS/FAIL assertion counts. Notice checked before paint; wrong news/private selection; anchor captured before button auto-scroll; substring `m-1` matched `m-10`; ineffective freeze. F-04 screenshot/404 occurred before a harness promise interruption. | Invalidated affected harness observations; retained evidence. CHAT-04's preliminary PASS is supporting only, superseded by the complete 13-check record; no extra denominator. |
| `20261106T073442796Z`, `07:34:42.798Z–07:36:04.886Z` | Raw CHAT-01 HARNESS_ERROR after **5/0** (hidden-row selector); CHAT-02 **10/1**, CHAT-03 **23/0**, CHAT-04 **13/0**, CHAT-05 **8/0**; F-04 **2/2**. | Corrected selected evidence for CHAT-02–05. CHAT-01's selector failure is not a product defect. CHAT-05's raw controlled PASS is qualified BLOCKED in the consolidated report. F-04 remains outside five-row counts. |
| `20261106T073648766Z`, `07:36:48.768Z–07:36:56.368Z` | First complete CHAT-01: **10/1**, anchor **−589 px**. | Selected baseline CHAT-01 failure. |
| `20261106T073804620Z`, `07:38:04.622Z–07:38:16.752Z` | CHAT-01 **10/1**, same **−589 px** drift; F-04 **3/2**, including successful product-entry comparison. | Diagnostic confirmations outside the frozen denominator; do not replace the first complete failure or increase planned counts. |
| `native-20261106T074606097Z`, `07:46:06.886Z–08:04:20.132Z` | Ordinary Chrome/CUA tab-switch plan; **0 recorded steps / 0 new messages**. | Interrupted before UI measurement; genuine background assertion stays BLOCKED. |

Selected run manifests record the exact harness/fixture/plan versions. CHAT-02–05 run `20261106T073442796Z` has plan SHA-256 `16eae3d20a3469858e5027126e67f7a82bd10c25fd7256ea64579de44987ed72`, harness `0570369447e8a2fee55ba052de7f7d5a5ff02461fb19e8d4440644eb3fb7f2be`, fixture `71d6be570ec1f381feca361cd4b4b705f92fafa0281d9543f4216a8cc1b02031`. Selected CHAT-01 run `20261106T073648766Z` uses the same plan/fixture digests and harness `ea4127fd3d51ca4eed7edb282fcdfc01a73d21408b4c28afcb74ca0510dbf0f5`. Diagnostic run `20261106T073804620Z` uses that same plan/fixture and harness `a59bf0033e6eca1d0e7611b405bfc7069ea635d48d580b223ea13e26ad0042d8`.

**Open boundary:** The baseline identifies two reproducible app defects and one separate ordering-oracle discrepancy. Human matrix sign-off and genuine tab-background measurement were pending. Later successful fix tests must be recorded against their own revisions; they do not retroactively make CHAT-01, CHAT-02 or F-04 PASS on `2693916`.

### Plan — two defects and nine implementation tasks

The implementation addresses the two observed DEV-153 defects: first paid-order chat entry without an existing follow/thread (DEV-242), and loss of a private conversation's historical reading position after navigation (DEV-243). The plan was split into nine implementation and closure tasks. The saved task records were prepared before source changes and updated during execution. The original defect observations and the DEV-244 ordering-oracle question remain separate evidence sets.

| Task / dependency | Implementation and verification boundary | Checkpoint evidence |
| --- | --- | --- |
| [DEV-245](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/server/tasks/DEV-245.md) | Persist a unique thread/order association; validate ownership, farm approval and paid eligibility from current order data. Preserve legacy inquiry access without a data backfill. | Targeted server group: 10 passed, task-reported. Full server after isolated DB timezone correction: 1,585 passed / 1 skipped; Alembic no drift. |
| [DEV-246](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/server/tasks/DEV-246.md), after DEV-245 | Authorize before idempotent replay; atomically create/reuse one thread and context; revalidate start/send/read access, including revocation and concurrent general/order starts. Paid entry must not auto-follow or create a fake inquiry/AI/mode transition. | API/permission/concurrency group: 114 passed. Full server: 1,600 passed / 1 skipped; Alembic no drift. |
| [DEV-247](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/packages/api/tasks/DEV-247.md), after DEV-246 | Carry optional order context through the shared client and enforce matching Mock authorization, list/history, private-resource, reset and replay behavior. Preserve general-start compatibility. | New client/Mock contract group: 11 passed, task-reported; full Mock: 198 passed / 1 skipped; five workspace type checks. |
| [DEV-248](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/apps/consumer/tasks/DEV-248.md), after DEV-247 | Bootstrap both order-detail entry controls before reading; retain correct Back targets; handle retry and legacy URLs; require explicit selection where multiple paid contexts exist; isolate draft/photo send context. | Entry helper group: 6 passed, task-reported; full Mock: 204 passed / 1 skipped; five workspace type checks; real-stack entry: 9/9 passed after launch, locator and fixture corrections. |
| [DEV-249](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-249.md), after DEV-248 | Verify whole first-order journeys, re-entry/relogin, deliberate order selection, text/photo response-loss retry, cross-user/cursor/attachment denial and delayed old-route responses. | Five closure cases passed in both the 28-case integrated run and final 57-case run. Discovery/static checks are listed separately below. |
| [DEV-250](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/packages/ui/tasks/DEV-250.md), independent of the order-entry chain | Store bounded in-memory identity/geometry metadata with session generation and visit leases; never persist message bodies, private image URLs or tokens. | Initial metadata group: 13 passed, task-reported; full Mock: 187 passed / 1 skipped; five workspace type checks. |
| [DEV-251](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/packages/ui/tasks/DEV-251.md), after DEV-250 and DEV-248 releases the shared component | Restore exact message anchors and the saved history window through pagination and delayed layout; suppress premature reads; allow actual user interruption; handle removed anchors, empty history and cursor retry/non-progress. | Expanded state/geometry group: 24 passed, task-reported. Real browser coverage includes both widths, 120-message history, delayed private photo, reads/unseen, fallback/retry and empty-history S08. |
| [DEV-252](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/apps/consumer/tasks/DEV-252.md), after DEV-251 and the DEV-248 route checkpoint | Obtain fresh authorization before applying metadata; isolate account/session/visit responses; clear protected content on terminal denial; invalidate equal-token new logins; guard direct private image/upload auth paths. | Initial session controller: 12 passed; final focused auth/session group: 30 passed (17 client + 13 session), task-reported. Six real-browser response-race/auth/gesture cases passed, plus same-runtime relogin/account-switch and farm-revocation checks. |
| [DEV-253](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-253.md), after integrated implementation | Measure the original anchor precisely, exercise missing/error/session boundaries, rerun affected prior regressions and publish actual fixed-source evidence. | First integrated run: 28/28 passed; final expanded run: 57/57 browser cases plus seven real API scenario groups. Review, merge and deployment remain separate gates. |

The checkpoint environment is recorded in the revision table above. Exact working-tree revisions are not retrospectively inferred from later commits.

### Results — revision and denominator rules

The canonical local execution is **`4c57556a1f4286eb5108e5552be5621c52bcc225`: seven real API scenario groups and 57 browser cases passed**, with 0 failed, skipped or flaky browser cases, in 2.8 minutes. The 57 comprise **14 new paid-order cases, nine restoration cases, six session/isolation cases and 28 affected prior regressions**. Each of the two baseline-geometry viewport cases contains five A/B/A round trips: ten measurements returned from +27 px to +27 px, all drift 0. Those ten measurements are not ten additional test cases.

Supporting gates are reported at the revision where executed. The last full server run passed 1,600 / 1 skipped with no Alembic drift; server source was unchanged by the final E2E-only fixture corrections. The final original Mock and five-workspace type checks ran at `ed520660`, before the final browser corrections. Focused unit groups are subsets of the full Mock suite and are not added to its total. Discovery, type checks, lint, exports, migration checks and automated review are separate gates, not app behavior passes.

`4c57556` → `6681058` contains evidence/task documentation updates only. This statement must **not** be extended to corrected CI head `8b82e7f363694542596ba4c4acba15b7be4fcdd0`: the later `0e22e27` main merge also introduced accepted demo/legal/journey changes, followed by demo-test and spec-checker corrections. The chat implementation paths remain unchanged, but local 57-case evidence belongs to `4c57556`; exact-head CI belongs to `8b82e7f`.

### Results — retained attempt ledger

The audit found **43 retained non-database `.log` files**, all listed below. Log modification times are not presented as execution start times. A working-tree SHA or exact selected command is left unknown when it was not saved. Successive runs are attempts of overlapping suites, not independent coverage totals.

| Stage / retained log | Executed gate and actual result | Classification, correction and later proof |
| --- | --- | --- |
| `step-245-server.log` | `make test-server`: 1,583 passed / 2 failed / 1 skipped, 117.64 s. | **Environment failure.** The newly initialized native DB used Asia/Seoul; two existing account timestamp assertions failed. Set only the isolated DB timezone to UTC; no account product/test changes. |
| `step-245-server-utc.log` | Same full server gate: 1,585 passed / 1 skipped, 116.77 s; Alembic no new upgrade operations. | Corrected environment passed. |
| `step-250-typecheck.log` | `npm run typecheck`: five workspace checks reported passed. | Initial metadata-store checkpoint; not a runtime test count. |
| `step-250-mock.log` | `npm run test:mock`: 187 passed / 0 failed / 1 skipped, 188 total. | Initial metadata-store full-suite pass. |
| `step-246-targeted.log` | Selected server API/permission/concurrency group: 114 passed, 6.93 s. | Exact test-selection arguments and working-tree SHA not retained; do not reconstruct them. |
| `step-246-server.log` | `make test-server`: 1,600 passed / 1 skipped, 116.18 s; Alembic no drift. | Atomic paid-context and authorization implementation passed. |
| `step-247-mock.log` | Full Mock: 189 passed / 9 failed / 1 skipped, 199 total. | **Mixed environment/test setup/oracle errors:** four loopback listener `EPERM` failures; four new public-client tests missing Node browser-storage auth shim; one old Mock 404 assertion where accepted server contract is 403 without order context. |
| `step-247-typecheck.log` | Five workspace type checks reported passed. | Before final Mock test-harness correction. |
| `step-247-mock-permitted.log` | Full Mock with loopback allowed: 193 passed / 5 failed / 1 skipped, 199 total. | Listener failures resolved; four auth-shim and one 403/404 oracle failures remained. |
| `step-247-typecheck-final.log` | Five workspace type checks reported passed. | Corrected checkpoint. |
| `step-247-mock-final.log` | Full Mock: 198 passed / 0 failed / 1 skipped, 199 total. | Added test-only storage shim; strengthened existing assertion to 403/FORBIDDEN/no write. Permission checks were retained. |
| `step-248-typecheck.log` | Five workspace type checks reported passed. | Entry implementation checkpoint. |
| `step-248-browser.log` | Then-five-case entry suite: 5 failed at browser launch; **0 app journeys executed**. | **Environment failure:** pinned headless Chromium build 1248 absent. This is not evidence of five app defects, or nine failed cases. |
| `step-248-mock.log` | Full Mock: 204 passed / 0 failed / 1 skipped, 205 total. | Includes six entry helper unit cases. |
| `browser-install.log` | Task-local Chromium 156.0.8078.4/build 1248, headless shell and FFmpeg 1013 installed. | Environment setup only, not a passed app test. |
| `step-248-browser-ready.log` | Nine cases planned; first 390 px locator failed; process interrupted without suite summary. | **Locator error/incomplete attempt:** actual accessible label includes ` ›`. At least one failure is known; complete pass/fail totals are unknown. Corrected visible-control name matcher. |
| `step-248-browser-v2.log` | Entry: 3 passed / 6 failed, nine total, 12.0 s. | **Fixture error:** six later cases failed guarded fixture initialization with SQLAlchemy missing model registration before app assertions. Explicit model imports corrected the standalone fixture. |
| `step-248-browser-v3.log` | Entry: 9 passed / 0 failed, 25.3 s. | First complete entry-suite pass after environment/fixture corrections. |
| `step-253-discovery.log` | Ten tests discovered in two files. | Initial five restoration instances + five closure cases; **discovery only**. |
| `integrated-mock-v1.log` | Full Mock: 224 passed / 4 failed / 1 skipped, 229 total. | **Environment failure:** four temporary local HTTP listeners denied by sandbox. |
| `integrated-typecheck-v1.log` | Five workspace type checks reported passed. | Integrated checkpoint. |
| `integrated-mock-v2.log` | Full Mock: 228 passed / 0 failed / 1 skipped, 229 total. | Permitted-loopback rerun passed. |
| `integrated-lint.log` | `make lint`: environment exit 2 before checks. | **Environment failure:** uv cache/lock permissions outside writable area. Moved cache use to permitted task-local location. |
| `integrated-lint-v2.log` | `make lint`: Ruff “All checks passed!” | Environment-corrected lint pass. |
| `integrated-server-final.log` | Full server: 1,600 passed / 1 skipped, 122.65 s; Alembic no drift. | Last full local server run; one skip reason is not printed and remains unreported. |
| `step-253-browser-v1.log` | Restoration: 5 passed / 3 failed, eight total, 1.2 min. | **Pagination test-oracle errors:** S02/S04/S06 assumed 50-item pages but real API default is 20. Bounded exact-ID loading corrected the tests; removed-anchor fixture also targets the actual first visible anchor. No pagination product change. |
| `integrated-typecheck-v2.log` | Five workspace type checks reported passed. | After final auth/client integration. |
| `integrated-mock-v3.log` | Full Mock: 245 passed / 0 failed / 1 skipped, 246 total. | Includes 17 additional direct-client auth tests. |
| `integrated-browser-v1.log` | 28 browser cases passed, 1.9 min: 14 order + eight restoration + six session. | First combined browser pass. No seven-API scenario output in this log; do not claim API7 here. Empty-history S08 was added afterwards. |
| `final-mock-ed520660.log` | At `ed520660`: 245 passed / 0 failed / 1 skipped, 246 total. | Final original chat-fix Mock gate before E2E-only corrections. |
| `final-types-ed520660.log` | At `ed520660`: five workspace type checks reported passed. | Original chat implementation type gate. |
| `final-real-stack-ed520660.log` | At `ed520660`: seven API groups passed; browser 54 passed / 3 failed, 57 total, 3.2 min. All 29 new defect cases passed. | Three prior-case failures: mismatched farm/order legacy fixture; harvest-navigation substring oracle; observed existing toast replacement race. Corrections below retain authorization/network/state assertions. |
| `final-lint.log` | Ruff “All checks passed!” | Final lint gate. |
| `final-real-stack-v2.log` | At `5ff8ba9`: seven API groups passed; browser 56 passed / 1 failed, 57 total, 3.1 min. | **Test-oracle error:** new harvest navigation assertion omitted valid already-started label. Added the accepted variant without permitting direct mutation. |
| `final-e2e-types.log` | Standalone E2E type check failed with TS5107. | **Check invocation error:** deprecated `moduleResolution=node10` under TypeScript 6; switched to ESNext/bundler resolution. Exact initial CLI not retained. |
| `final-real-stack-4c57556.log` | At `4c57556`: seven API groups and 57 browser cases passed; 0 failed/skipped/flaky browser cases, 2.8 min. | **Canonical final local result.** |
| `final-e2e-types-v2.log` | No-emit ESNext/bundler E2E check reported exit 0 in task/evaluation record. | Saved log is empty, which alone cannot prove exit status; report as task-record-supported success. Exact complete CLI not retained. |
| `ci-fix-types.log` | On `0e22e27` plus test fix: five workspace type checks reported passed. | Later merged-head compatibility verification; separate from original `4c57556` run. |
| `ci-fix-mock.log` | Full Mock: 243 passed / 4 failed / 1 skipped, 248 total. | **Environment failure:** four local listener `EPERM` failures; no source changes before rerun. |
| `ci-fix-mock-loopback.log` | Full Mock with loopback: 247 passed / 0 failed / 1 skipped, 248 total, 38.9 s. | Later merged-head full Mock pass. Optional DEV-134 stitch skipped explicitly because FFmpeg was unavailable in this command environment. |
| `ci-fix-consumer-export.log` | Consumer Expo web export succeeded to `dist`. | Build/export gate, not browser behavior coverage. Exact original CLI not printed. |
| `ci-fix-checker-contracts.log` | 60 checker contract tests passed, 6.052 s. | Printed SKIPPED/INCOMPLETE and usage-warning fixture outputs are intentional unit-test fixtures, not a failed live review. |
| `ci-fix-producer-export.log` | Producer Expo web export succeeded to `dist`. | Build/export gate, not browser behavior coverage. Exact original CLI not printed. |

### Results — focused checks and attempts without standalone retained logs

The task records below are the primary retained evidence for these checks. They supplement the ledger without being added to the full-suite denominator.

| Recorded check / attempt | Actual result and evidence limit |
| --- | --- |
| DEV-245 focused server selection | 10 passed ([task record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/server/tasks/DEV-245.md)); exact selected command, output log and working-tree SHA not saved. |
| DEV-250 `node --test scripts/test-chat-view-state.mjs` | Initial 13 passed ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/packages/ui/tasks/DEV-250.md)). An intermediate 23/23 helper result was reported in the agent conversation; final expanded 24/24 is retained in [DEV-251](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/packages/ui/tasks/DEV-251.md). These are stages of the same suite. |
| DEV-247 new public-client/Mock contract | 11 passed ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/packages/api/tasks/DEV-247.md)); included in full Mock 198. |
| DEV-248 entry helper suite | Six passed ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/apps/consumer/tasks/DEV-248.md)); included in full Mock 204. |
| DEV-249 closure discovery | `npm run test:e2e -- scripts/e2e/order-chat-closure.spec.ts --list`: first four, then five cases discovered after C05; no execution ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-249.md)). |
| DEV-249 standalone E2E types | First direct invocation omitted Node type selection and failed on Node names. Repeated with `--types node`: exit 0; no dependency/product change ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-249.md)). |
| DEV-249 whitespace check | `git diff --check -- docs/evaluation/tasks/DEV-249.md`: exit 0; static check only ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-249.md)). |
| DEV-252 initial session controller | First Node run failed on unsupported TypeScript parameter-property syntax in strip-only mode; explicit field initialization corrected it. Repeated `node --test scripts/test-chat-session.mjs`: 12 passed / 0 failed; consumer type check exit 0 ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/apps/consumer/tasks/DEV-252.md)). Initial failure total not retained. |
| DEV-252 client-auth expansion | Initial `npx` call unavailable; an attempt against old compiled client reproduced eight existing auth failures, but complete totals were not saved. Direct local TypeScript compile exited 0; `node --test scripts/test-chat-client-auth.mjs scripts/test-chat-session.mjs`: 30 passed / 0 failed (17 client + 13 session); consumer type check exit 0 ([record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/packages/api/tasks/DEV-252.md)). Do not label old-artifact output as a failure of newly compiled source. |
| DEV-253 session-isolation author checks | Six cases discovered with `--list`, repeated after correcting the 20-message assumption; standalone NodeNext/Node-types check exited 0. Conversation evidence only; no separate log. Browser execution was performed centrally, not by the author. |
| Final integration-map check | `node scripts/ci/classify.mjs --check` reported passed in final task/evaluation records; no separate retained output log. |
| Later DEV-134 compatibility fix | At merged `0e22e27`, GitHub apps job `127901012766` had 245 passed / 1 failed / 1 skipped: old warning test assumed live `p5` absent, but accepted DEV-181 adds `p5/c4`. A fixed `mini` fixture retains exact warning validation; a separate live-I3 check verifies p5/c4 accepted without warning. `node --test scripts/test-demo-site.mjs`: nine passed / 0 failed / 0 skipped, recorded in [DEV-253](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-253.md). Product/demo source was unchanged by this test correction. |

The complete saved DEV-249 standalone command was:

```sh
node node_modules/typescript/bin/tsc --noEmit --ignoreConfig --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --types node scripts/e2e/chat-regression.ts scripts/e2e/order-chat-closure.spec.ts
```

### Failure investigation and retained assertions

| Finding | Diagnosis / action | Evidence of resolution or remaining limitation |
| --- | --- | --- |
| Polling cleared a failed-send retry; repeated same-offset scroll acknowledgement released restoration lock. | Read-only review found real implementation races. Preserve pending-send error across successful/transient polls and ignore duplicate same-offset acknowledgement. | Updated DEV-251 implementation; C03 waits for two successful polls before retry; final integrated cases passed. |
| Direct private photo/upload calls did not consistently invalidate auth state or reject old-session completions. | Added client auth notification/serial guards and session-scoped response handling. | Focused 30-case auth/session suite and real 401/WRONG_APP/race cases passed. |
| All previously saved history was legitimately removed. | Found after the 28-case pass; use bottom behavior for a fresh empty head rather than applying stale historical metadata. | Added empty-history S08; passed in all expanded 57-case attempts, including final committed run. |
| DEV-224 legacy fixture used `/chats/f-kang?fromOrder=o-11` although the order belongs to Halla. | Correct authorization returned 404. Use Halla in the fixture and require ready composer before the same order Back assertion. | Final wider run passed; 404 denial behavior and console monitor were retained. |
| Harvest test used a substring absence assertion. | Required DEV-231 stage navigation contains the same words; it is distinct from a direct harvest mutation. Assert exact forbidden mutation-control absence, visible valid stage navigation, and no mutation POST. | Accepted both original/already-started labels; final wider run passed. |
| First news toast hide timer cleared the second deletion notification. | Trace established an existing producer notification replacement race; product source was unchanged. Isolate the independent second action by observing the first toast appear and disappear before deleting. | Exact second toast, DELETE and bubble assertions retained. **Underlying product race remains DEV-257; no fix is claimed.** |

### Results — complete final API and browser register

**Record:** PASS for the executed affected regression at `4c57556a1f4286eb5108e5552be5621c52bcc225`: **7/7 real API scenarios and 57/57 browser cases**, 0 failed, 0 skipped and 0 flaky browser cases; one browser worker, 2.8 minutes. This is a later fix run, not a replacement execution of all five original DEV-152 rows. In particular, it does not close DEV-244's frozen ordering decision or the genuine-background part of I3-CHAT-05.

**Execution:** Isolated real API/PostgreSQL plus consumer and producer web apps. Private-photo requests and authorization denials use controlled synthetic fixtures; lost responses are injected after the actual API commit where stated. External AI keys were unset for this final regression. The 57 cases consist of **29 new defect cases** (9 entry, 5 order closure, 9 restoration and 6 session/race) and **28 affected existing cases**. The two S01 viewport cases contain ten round trips; those ten measurements are not ten additional browser cases.

**Procedure and PASS criterion:** Run the actual route, API, paging, layout, send/retry, privacy and navigation assertions in the pinned scripts. All listed expectations must hold. Each table entry below is an executed parameterized case from the final log, not just Playwright discovery. The final API group names and browser titles are retained so every case in the reported 7 + 57 run can be traced to source.

#### Real API scenarios — all seven passed

| No. | Executed scenario | Source |
| --- | --- | --- |
| 1 | AC-01-3/6: health, account separation, wrong-app access, and producer gates | [API runner](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/test-integration.mjs) |
| 2 | AC-03-4/04-8/07-5: product detail, capacity request, and approval | [API runner](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/test-integration.mjs) |
| 3 | AC-05-6/09-6: payment, exact release, pause, and paid snapshots | [API runner](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/test-integration.mjs) |
| 4 | AC-10-6: producer fulfillment and consumer order visibility | [API runner](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/test-integration.mjs) |
| 5 | AC-12-10/15-6: news privacy, reactions, and private replies | [API runner](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/test-integration.mjs) |
| 6 | AC-13-1/2: chat auto-follow, factual AI, and sensitive handoff | [API runner](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/test-integration.mjs) |
| 7 | AC-02-4: farm detail draft remains private until explicit save | [API runner](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/test-integration.mjs) |

#### Browser cases — all 57 passed

| Run entry | Executed title / expected behavior | Pinned test source |
| --- | --- | --- |
| 1 | DEV-224 HE-01: a room opened from a product goes back to it, and the chat tab opens the list | [back-rules.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/back-rules.spec.ts#L25) |
| 2 | DEV-224 a1: rooms opened from farm info and order detail go back there | [back-rules.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/back-rules.spec.ts#L44) |
| 3 | DEV-224 HE-X3: after order done → home, the orders tab opens the order list | [back-rules.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/back-rules.spec.ts#L61) |
| 4 | DEV-224 c1: consumer screens opened directly go back to their parent | [back-rules.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/back-rules.spec.ts#L83) |
| 5 | DEV-224 c1: producer product sub-screens opened directly go back to the product list | [back-rules.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/back-rules.spec.ts#L105) |
| 6 | DEV-224 d1: a link to a farm that does not exist shows the not-found screen | [back-rules.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/back-rules.spec.ts#L120) |
| 7 | AC-12-1 DEV-235: equal-time question and rule answer keep DOM order after reload and in producer view | [chat-message-order.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-message-order.spec.ts#L73) |
| 8 | AC-13-2/4 DEV-213: handoff shows forwarded notice without a new basis, ordinary answers keep evidence | [chat-message-order.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-message-order.spec.ts#L93) |
| 9 | AC-12-1/8/9 DEV-253 R01: delayed older response from the previous A visit cannot affect B or a new A visit | [chat-session-isolation.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-session-isolation.spec.ts#L85) |
| 10 | AC-12-1/8/9 DEV-253 R02 older restore 401 expiry: injected auth rejection clears protected UI and same-SPA relogin starts clean | [chat-session-isolation.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-session-isolation.spec.ts#L136) |
| 11 | AC-12-1/8/9 DEV-253 R02 older restore 403 WRONG_APP: injected auth rejection clears protected UI and same-SPA relogin starts clean | [chat-session-isolation.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-session-isolation.spec.ts#L136) |
| 12 | AC-12-1/8/9 DEV-253 R02 private photo 401 expiry: injected auth rejection clears protected UI and same-SPA relogin starts clean | [chat-session-isolation.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-session-isolation.spec.ts#L136) |
| 13 | AC-12-1/8/9 DEV-253 R02 private photo 403 WRONG_APP: injected auth rejection clears protected UI and same-SPA relogin starts clean | [chat-session-isolation.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-session-isolation.spec.ts#L136) |
| 14 | AC-12-8/9 DEV-253 R03: real wheel input interrupts an older-window restore and the late response does not snap back | [chat-session-isolation.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-session-isolation.spec.ts#L180) |
| 15 | AC-12-8/9 DEV-253 S01 390px: original 26-message A/B/A anchor drift stays within 8px for five trips | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L86) |
| 16 | AC-12-8/9 DEV-253 S01 360px: original 26-message A/B/A anchor drift stays within 8px for five trips | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L86) |
| 17 | AC-12-8/9 DEV-253 S02: 120-message window restores older anchor, preserves sequence and continues paging | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L113) |
| 18 | AC-12-8/9 DEV-253 S03: delayed photo and incoming messages preserve history until explicit latest/read | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L135) |
| 19 | AC-12-8/9 DEV-253 S04: missing saved anchor uses surviving neighbor and transient restore load retries | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L174) |
| 20 | AC-12-8/9 DEV-253 S05: same-user relogin and second user discard snapshots without page reload | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L216) |
| 21 | AC-12-8/9 DEV-253 S06: cursor nonprogress is visible and recoverable without losing loaded history | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L237) |
| 22 | AC-12-8/9 DEV-253 S07: farm approval loss clears protected history and discarded position cannot return | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L263) |
| 23 | AC-12-8/9 DEV-253 S08: deleted historical window becomes a valid empty bottom position | [chat-view-restoration.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/chat-view-restoration.spec.ts#L277) |
| 24 | AC-34-7: a consumer asks the farmclub team from the 1:1 list and sees the reply | [consumer-support.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/consumer-support.spec.ts#L17) |
| 25 | AC-06-6/07-6/12-12 N-02: carousels, direct room, shelf and fixed purchase at 360px | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L12) |
| 26 | AC-06-6/07-6/12-12 N-02: carousels, direct room, shelf and fixed purchase at 390px | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L12) |
| 27 | AC-06-6/07-6/12-12 N-02: carousels, direct room, shelf and fixed purchase at 430px | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L12) |
| 28 | AC-12-12: consumer sends in the same room and folding preserves draft | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L85) |
| 29 | FEAT-13 AC-13-5: consumer reports an AI answer and both sides see the server marker | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L104) |
| 30 | AC-14-4/17-6/12-12: dashboard has only fulfillment, chat opens own collapsed room | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L140) |
| 31 | AC-12-13: producer confirms follower count and preview before sending news | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L212) |
| 32 | AC-12-14/16: producer deletes own news, or deletes and rewrites it | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L257) |
| 33 | AC-12-14: an open consumer room drops news the farm deleted | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L327) |
| 34 | AC-07-6 N-02: long farm names and full-ratio story image retain fixed controls | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L357) |
| 35 | DEV-208 AC-13-9: direct-mode room shows who answers and a forwarded status under the question | [conversation-ui.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/conversation-ui.spec.ts#L406) |
| 36 | AC-34-2 AC-34-3: the farmclub room carries a producer inquiry to the operator and back | [farmclub-support.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/farmclub-support.spec.ts#L17) |
| 37 | AC-34-4: consumers never see a producer's farmclub room | [farmclub-support.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/farmclub-support.spec.ts#L59) |
| 38 | AC-33-2 DEV-249 C01: paid chat survives back, private-list re-entry, reload and relogin without follow | [order-chat-closure.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-closure.spec.ts#L18) |
| 39 | AC-33-2 DEV-249 C02: private-list re-entry with two paid contexts requires explicit selection at 360px | [order-chat-closure.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-closure.spec.ts#L65) |
| 40 | AC-33-2/4 DEV-249 C03: lost text-and-photo send response retains one attachment and retries the exact body once | [order-chat-closure.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-closure.spec.ts#L105) |
| 41 | AC-12-1/AC-33-2 DEV-249 C04: two-consumer API/cursor/photo and other-farm producer denials leave state unchanged | [order-chat-closure.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-closure.spec.ts#L161) |
| 42 | AC-33-2 DEV-249 C05: a delayed first-order page cannot overwrite the next order after visible back/list navigation | [order-chat-closure.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-closure.spec.ts#L242) |
| 43 | AC-33-2 DEV-248: first paid-order inline entry initializes and sends without following at 390px | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L54) |
| 44 | AC-33-2 DEV-248: first paid-order inline entry initializes and sends without following at 360px | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L54) |
| 45 | AC-33-2 DEV-248: paid cancellation/refund-pending bottom-bar entry retains no-follow eligibility | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L93) |
| 46 | M-04 DEV-248: unpaid deposit-reported entry uses general follow chat | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L107) |
| 47 | AC-33-2 DEV-248: lost start/send responses retry the same keys and persist once | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L126) |
| 48 | AC-33-2 DEV-248: legacy order link initializes the same authorized context | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L174) |
| 49 | AC-33-4 DEV-248: first order photo-only message binds to the selected order | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L187) |
| 50 | AC-33-2 DEV-248: multiple order selection retains text and clears prior-order photos | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L212) |
| 51 | AC-12-1 DEV-248: a foreign order fails visibly without polling or creating a conversation | [order-chat-entry.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/order-chat-entry.spec.ts#L246) |
| 52 | AC-03/04/05: producer draft and sales controls are wired to the real server | [producer-and-privacy.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/producer-and-privacy.spec.ts#L5) |
| 53 | AC-12/15: public room does not auto-follow and private state clears with session | [producer-and-privacy.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/producer-and-privacy.spec.ts#L35) |
| 54 | AC-02-4: farm storytelling editor loads without publishing a draft | [producer-and-privacy.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/producer-and-privacy.spec.ts#L58) |
| 55 | DEV-232: producer 1:1 header keeps the masked consumer name on direct link and reload | [producer-chat-header.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/producer-chat-header.spec.ts#L5) |
| 56 | DEV-209 AC-34-9: suspended farm contacts the farmclub team from the suspension screen | [producer-support-contact.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/producer-support-contact.spec.ts#L6) |
| 57 | DEV-209 AC-34-9: rejected farm keeps reapply as the main action and can ask the team | [producer-support-contact.spec.ts](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/4c57556a1f4286eb5108e5552be5621c52bcc225/scripts/e2e/producer-support-contact.spec.ts#L33) |

#### Reading-position measurements — exact original reproduction

**Procedure:** Create the documented 26-message Halla history with AI OFF, finish the initial bottom scroll, place `DEV153-C01-HISTORY-12` at the recorded offset, navigate through the visible private-chat list to Kang and return to Halla. Measure the same exact message ID against the same timeline rectangle. Repeat five times at each viewport. **PASS criterion:** absolute drift ≤8 CSS px on every trip. Baseline `2693916` was +27→−562 px, drift −589 px; final values are below. Positive offsets are below the timeline top.

| Viewport | Trip | Exact synthetic message ID | Before (CSS px) | After (CSS px) | Drift | Result |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 390×844 | 1 | `m-19122ec16c` | +27 | +27 | 0 | PASS |
| 390×844 | 2 | `m-19122ec16c` | +27 | +27 | 0 | PASS |
| 390×844 | 3 | `m-19122ec16c` | +27 | +27 | 0 | PASS |
| 390×844 | 4 | `m-19122ec16c` | +27 | +27 | 0 | PASS |
| 390×844 | 5 | `m-19122ec16c` | +27 | +27 | 0 | PASS |
| 360×844 | 1 | `m-0e891f2bad` | +27 | +27 | 0 | PASS |
| 360×844 | 2 | `m-0e891f2bad` | +27 | +27 | 0 | PASS |
| 360×844 | 3 | `m-0e891f2bad` | +27 | +27 | 0 | PASS |
| 360×844 | 4 | `m-0e891f2bad` | +27 | +27 | 0 | PASS |
| 360×844 | 5 | `m-0e891f2bad` | +27 | +27 | 0 | PASS |

The 120-message case separately restored a window older than the newest API page, retained every message ID in saved sequence and continued pagination. Delayed private-photo layout and incoming messages did not move a historical reader to latest or advance unseen read state prematurely. Choosing latest resumed normal read progression. Missing anchors, removed history, non-progress cursors, failed loads, intentional wheel input, late route responses, equal-token relogin, second-user sessions and authorization loss were exercised by the individual cases above. None of these desktop browser observations establishes native Android/iOS background behavior.

### Results — CI failures, corrections and automated specification review

#### Scope and provenance

Minsun Kim coordinated the CI follow-up for [PR #482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482). The records below distinguish application checks, offline checker tests and the live specification review. They supplement the dated DEV-242/DEV-243 local regression; they do not change the original workbook, frozen chat-matrix verdicts or earlier coverage denominators. Repeated executions are not added together as unique test cases.

The final CI snapshot was verified at **6 November 2026, 13:16 UTC (22:16 KST)** against head **`8b82e7f363694542596ba4c4acba15b7be4fcdd0`**. The application/test correction and the checker correction are separate commits, `009ec2a` and `8b82e7f`.

#### Results and failure chronology

| Stage / reviewed head | Application CI | Automated specification review | Interpretation and action |
| --- | --- | --- | --- |
| Initial handoff, `6681058c6860ab2cda3e4f14babcce99f767284c` | [Run 42216984982](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42216984982): apps, server, all three integration jobs and aggregate `ci-ok` succeeded. Admin web was skipped by the existing filter. | [Run 42216989016](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42216989016): **INCOMPLETE**, “Model response is not valid review JSON,” **57.6 s**, zero findings and no reviewed files. Its report was downloaded and read. | Application checks succeeded; the model check did not produce a valid review. Zero findings in this error report meant neither a product mismatch nor a review pass. |
| Main merged again, `0e22e272d419ed840de58af150c6240f6c36b0f4` | [Run 42220461895](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42220461895): apps failed during the Mock suite, **245 PASS / 1 FAIL / 1 SKIP**. The old test expected `p5` to be absent from the live scenario order, although accepted DEV-181 had added `p5` and `c4` to I3. | [Run 42220461971](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42220461971), artifact `13504015454`: the same invalid-review-JSON error, **INCOMPLETE**, **34.58 s**, no findings or reviewed files, model `claude-sonnet-5-5`. | Two different failures required correction: a stale test fixture and the review response format. Neither justified changing application permissions or weakening a check. |
| Corrections, `009ec2a` then `8b82e7f` | The demo warning uses a fixed scenario, with a separate test for accepted live I3 segments. Local correction checks are below. | The request now uses native JSON schema output; independent evidence and semantic validation remain unchanged. | Independent Codex review found no must/should findings in the correction diffs. This was AI review, not human approval. |
| Fresh exact-head verification, `8b82e7f363694542596ba4c4acba15b7be4fcdd0` | [Run 42222913473](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473): apps, server, all three integration jobs and `ci-ok` succeeded. | [Run 42222913479](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913479): specification job succeeded with **NO_FINDINGS**, not PASS. Checker contracts, eligibility and Figma-line checks also succeeded. | Both reported CI failures were resolved at this head. Configured skipped jobs and the live review's limited context remain explicit below. |

Between the first two stages, the connected direct-rerun action returned **403, “Resource not accessible by integration.”** A PR-description edit did not yield an observable fresh run at that point, and the background GitHub browser was signed out. No authenticated browser rerun or successful retry is claimed for those attempts. The later commit-triggered runs above are separate, completed evidence; the earlier access failure was not an app defect.

#### What changed and what was retained

- **Demo test compatibility (`009ec2a`).** The [warning assertion](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/009ec2a3702265aaca2716ae812d55cdb2f3e2ae/scripts/test-demo-site.mjs#L123) still requires the exact absent-order warning, now against the fixed `mini` fixture. A [separate acceptance test](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/009ec2a3702265aaca2716ae812d55cdb2f3e2ae/scripts/test-demo-site.mjs#L138) requires live I3 `p5`/`c4` and default-order recording to have no warning. Unknown-role, local-URL, administrator-credential, production-profile and confirmation safeguards were retained. No demo planner or product behavior changed.
- **Review response format (`8b82e7f`).** The [request](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/.github/spec-check/check.py#L460) uses `output_config.format` with `type: "json_schema"`, following the [provider contract](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). The [schema](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/.github/spec-check/check.py#L38) requires exactly `status`, `summary`, `reviewed_files`, `findings` and `missing_context`; nested findings and path/line/quote references also reject additional properties. Model statuses remain PASS, MISMATCH or INCOMPLETE. Unsupported numeric/string constraints were not added.
- **Independent checks remain authoritative.** The existing [validator](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/.github/spec-check/check.py#L517) still checks cited paths, original/new-side line numbers, exact quotations, file coverage, finding IDs and report semantics. Native schema output does not establish evidence correctness. The model, endpoint, prompt, workflow, permissions, 1 MiB input limit, 16,000-token output budget, 90-second request timeout and one transient retry were unchanged. Malformed/fenced JSON, refusal, truncation and unsupported-schema HTTP 400 remain errors; no JSON repair, model fallback or manual success override was introduced.

#### Local correction checks and environment attempts

| Check / attempt | Recorded result | Evidence and limit |
| --- | --- | --- |
| Targeted demo tests, `node --test scripts/test-demo-site.mjs` | **9 PASS / 0 FAIL / 0 SKIP** | Pure planner/site tests. This does not establish recording, publication or deployment. |
| First full Mock attempt in the restricted environment | **243 PASS / 4 FAIL / 1 SKIP**, 248 total | All four failures were temporary fixture subprocesses unable to listen on `127.0.0.1` (`EPERM`), rather than failed app assertions. Retained local log: `ci-fix-mock.log`. |
| Authorized local-loopback rerun, `npm run test:mock` | **247 PASS / 0 FAIL / 1 SKIP**, 248 total; **38.9 s** | No source change occurred between these two attempts. Retained local log: `ci-fix-mock-loopback.log`. The skipped test is not counted as a pass. |
| `npm run typecheck` | All **five workspaces** succeeded | Consumer, producer, analytics, API and shared UI. Static checking is not five runtime cases. Retained local log: `ci-fix-types.log`. |
| Consumer and producer Expo web exports | Both completed with `Exported: dist` | An initial command could not find the task-local `npx` launcher. The chat records the subsequent `npm exec` invocation; the retained export logs contain successful build output but not the command invocation. This was a launcher/setup retry, not a failed application journey. Logs: `ci-fix-consumer-export.log`, `ci-fix-producer-export.log`. |
| `python3 -m unittest discover -s .github/spec-check -p 'test_*.py' -v` | **60 PASS / 0 FAIL**, **6.052 s** | Offline checker/Figma contracts, including strict request shape and malformed/fenced/refused/truncated/HTTP-400 error cases. Simulated provider responses are not live model evidence. Log: `ci-fix-checker-contracts.log`. |
| PR source-mapping and whitespace checks | Succeeded | Supporting static checks, not additional functional test counts. |

These later Mock counts supersede neither the earlier **245 PASS / 1 SKIP** local result at the product-regression revision nor the historical workbook counts. The correction added a test and incorporated a newer main; the runs have different denominators. No new component code-coverage measurement was collected in this CI correction. Earlier coverage targets and measured percentages remain unchanged.

#### Final GitHub job status at the captured head

| Job | Status | Exact evidence |
| --- | --- | --- |
| apps | SUCCESS | [42222913473 / 127909162895](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127909162895) |
| server | SUCCESS | [42222913473 / 127909163048](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127909163048) |
| integration 1/3 | SUCCESS | [42222913473 / 127909163146](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127909163146) |
| integration 2/3 | SUCCESS | [42222913473 / 127909163183](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127909163183) |
| integration 3/3 | SUCCESS | [42222913473 / 127909163099](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127909163099) |
| `ci-ok` aggregate | SUCCESS | [42222913473 / 127912896590](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127912896590) |
| changes | SUCCESS | [42222913473 / 127909088294](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127909088294) |
| checker-tests | SUCCESS | [42222913479 / 127909146808](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913479/job/127909146808) |
| eligibility | SUCCESS | [42222913479 / 127909146650](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913479/job/127909146650) |
| figma-line | SUCCESS | [42222913479 / 127909146469](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913479/job/127909146469) |
| spec-code-review | SUCCESS; report **NO_FINDINGS** | [42222913479 / 127909254420](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913479/job/127909254420) |
| admin-web | **SKIPPED** by existing configuration | [42222913473 / 127909165582](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913473/job/127909165582) |
| Optional live model demo fixtures | **SKIPPED** by existing configuration | [42222913479 / 127909256233](https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/42222913479/job/127909256233) |

A successful aggregate or metadata job is not an additional test case. The two skipped jobs were not executed passes. These GitHub job statuses also do not independently reproduce the earlier local 57-browser/7-API counts or a coverage percentage.

#### Live review result and remaining limits

The downloaded live report for head `8b82e7f363694542596ba4c4acba15b7be4fcdd0` recorded **NO_FINDINGS, zero findings, 71 reviewed files and 37.41 seconds elapsed**, using `claude-sonnet-5-5`. Its checker execution/test-merge SHA was **`0cdd5f09e9c1bf0c14e4a8f4e399afffa9ee6028`**, distinct from the reviewed PR head. NO_FINDINGS means no supported mismatch was retained within the supplied context; it is **not a full PASS**. Six UNVERIFIED context notes remained:

1. Paid-order eligibility helpers and refunded-history behavior.
2. Existing attachment, list, history and read authorization gates.
3. Account-deletion compatibility.
4. The actual concurrency test filename versus a planned allowed filename.
5. Partial specification/Wiki excerpts.
6. Independently reproducing the earlier local execution counts.

Source references addressing these notes are retained in the CI correction review; they are review aids, not new execution claims. The checker is separate from the product AI accuracy cohorts and does not add to their trial counts or replace the matrix reviewer's decision.

At the captured verification point, independent AI review had no outstanding must/should findings, while **human approval, main merge and deployment verification remained pending**. No native-device execution or Figma synchronization was established by these CI jobs. Raw traces, provider output and credentials are not reproduced here. Later approval, merge or deployment must be documented with its own dated evidence rather than inferred from this green CI snapshot.

**Subsequent repository event — 6 November 2026:** [PR #482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482) was squash-merged as [86e5410](https://github.com/snuhcs-course/swpp-2026-project-team-06/commit/86e541097314a78ffd636cbbb4500abfcaeef41a), whose merge commit is dated **13:16:24 UTC (22:16:24 KST)**. This was confirmed separately from the earlier CI snapshot by the PR's merged state and the fetched main commit. The documentation consolidation is a separate follow-up based on that main revision. Merge does not establish matrix-reviewer sign-off, a deployed revision, authenticated deployed regression, native-device results or successful publication of this follow-up to the public Wiki; those were not verified in this documentation audit.

### Reproducible procedure and evidence references

The following are the recorded repository entry points and final affected-suite command. First use the pinned revision and install its locked dependencies. Point DATABASE_URL at a disposable branch-specific local database; the integration runner resets synthetic data. The native PostgreSQL runs set FARMCLUB_INTEGRATION_SKIP_DOCKER=1 only because a dedicated local instance already existed. Keep APP_ENV=local, the injected clock, SOURCE_ANALYSIS_ENABLED=false and task-local browser installation as recorded. Do not supply a production database or reuse production credentials. Values for tokens/passwords and private upload bytes are deliberately omitted.

~~~sh
# Supporting server and client gates; use the prepared isolated local database.
make test-server
npm run test:mock
npm run typecheck

# Exact final affected integration scope; includes the seven real API scenarios.
node scripts/run-integration.mjs scripts/e2e/order-chat-entry.spec.ts scripts/e2e/order-chat-closure.spec.ts scripts/e2e/chat-view-restoration.spec.ts scripts/e2e/chat-session-isolation.spec.ts scripts/e2e/chat-message-order.spec.ts scripts/e2e/conversation-ui.spec.ts scripts/e2e/back-rules.spec.ts scripts/e2e/producer-chat-header.spec.ts scripts/e2e/producer-and-privacy.spec.ts scripts/e2e/consumer-support.spec.ts scripts/e2e/farmclub-support.spec.ts scripts/e2e/producer-support-contact.spec.ts

# CI correction contracts; these use simulated provider responses, not a live review.
node --test scripts/test-demo-site.mjs
python3 -m unittest discover -s .github/spec-check -p 'test_*.py' -v
~~~

The final integration command used the existing runner, not a replacement mini-app or a direct database write in place of a UI action. Its dedicated fixture accepts only guarded synthetic chat data; real checkout/admin APIs establish eligible orders. The earlier baseline harness was a separate local evaluation tool; the original run IDs, hashes and sanitized assertion register above preserve its provenance. Listing or compiling tests is not equivalent to executing them.

| Evidence | What it establishes / limitation |
| --- | --- |
| [DEV-242 regression report](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/dev-242-order-chat-regression.md) | Owned paid-order entry, no unwanted follow/inquiry, order/photo binding, retries, privacy and staged results. |
| [DEV-243 regression report](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/dev-243-scroll-restoration.md) | Original −589 px baseline, fixed measurements, long history, layout/read/session cases and limits. |
| [DEV-249 execution record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-249.md) | Real-order closure fixture and executed validation; human/deployment gates remain separate. |
| [DEV-253 execution record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/docs/evaluation/tasks/DEV-253.md) | Browser iterations, corrected fixtures/oracles, original run counts and separate toast follow-up. |
| [CI checker correction record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/8b82e7f363694542596ba4c4acba15b7be4fcdd0/.github/spec-check/tasks/DEV-253.md) | Native JSON transport decision and offline contracts; the genuine live report has its own run link. |
| [Initial AI review](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482#issuecomment-6684643601) and [CI correction review](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482#issuecomment-6685591361) | AI review and source references; neither is human approval. |
| Original local HTML/JSON, retained summaries and named checkpoint logs | Audited to compile this supplement. Only sanitized narrative/counts/IDs are published here. A local file path is not represented as a publicly accessible GitHub artifact. |

### Analysis, readiness and work still open

1. **Confirmed application defects:** first paid-order initialization (DEV-242) and round-trip reading position (DEV-243) are implemented and locally verified. The exact corrected code/test and CI revisions are stated above. Do not use current CI success to rewrite the historical I2 workbook's I-09 FAIL or the original I3-CHAT-01 FAIL.
2. **Original broad-row outcomes:** I3-CHAT-02 retains its frozen timestamp/ID ordering FAIL pending the explicit DEV-244 oracle/contract decision. The correctly saved sequence and KST labels passed in their tested samples. I3-CHAT-05 retains BLOCKED for genuine backgrounding; controlled visibility checks and an interrupted native attempt do not resolve it.
3. **Review:** the matrix reviewer Hyun has not signed off on these chat records. Independent AI reviews and the live NO_FINDINGS report do not establish human approval. At the documentation audit DEV-153 and DEV-245 were In Progress and DEV-246–253 were In Review; no Done or release approval is inferred from a test log.
4. **Deployment/native scope:** PR #482's main merge is confirmed by the dated repository event above; human/matrix approval and read-only confirmation of the deployed server/client revisions were not verified here. No authenticated deployed regression, physical Android/iOS, PWA installation, OS background/resume, real transfer or shipping pass is asserted. This documentation follow-up still requires its own review and main merge before Wiki synchronization; a branch document is not proof that the live app or public Wiki has been released.
5. **Separate follow-ups:** [DEV-256](https://linear.app/sswp6/issue/DEV-256) tracks Figma synchronization; [DEV-257](https://linear.app/sswp6/issue/DEV-257) tracks the pre-existing producer global-toast replacement race. The two independent toast assertions were made deterministic without claiming that race fixed. The concurrency regression is in test_order_chat_context.py; the alternative planned filename is not a missing executed suite. No new dedicated ThreadOrderContext-withdrawal scenario or dedicated refunded browser journey is claimed; the source/schema and existing suite evidence have the limits described in the CI review.
6. **Coverage and data:** these counts are functional execution evidence, not newly measured code-coverage percentages or an exhaustive security certification. Historical component coverage percentages remain unchanged. Raw browser traces, request headers, private photo bytes and recipient/contact data stay local/restricted; an access-log spot check only covers the tested synthetic marker. Supporting tests, repeated runs, assertions, CI checks and model review files must not be summed into one pass rate.

The results support review of the two fixes. They do not constitute whole-product readiness or release approval.


## Iteration 3 — Peer heuristic evaluation and closeout (6 November)

### Plan — source, method and responsibility

Minsun Kim coordinates DEV-156/159/161 and checks the supplied class sheet against the remediation records. The authoritative peer source is **Week 10. HE Sheet - Team 6 - Google Drive.pdf**, 14 pages, SHA-256 `7268b18a8a11af3ea0d05f819d2ba78d1bd6ed3b1b567ee4027ce27552d3ab06`. Its PDF export is dated 6 November, 12:15:43 UTC. The historical team record dates the classroom evaluation to **4 November** on Android Chrome PWA and laptop browsers with shared synthetic evaluator accounts; the PDF itself does not state the tested commit or evaluation date. Do not infer them from its export timestamp. The [historical session and reproduction record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/he-2026-11-04/results.md) retains those environment limits.

Five completed evaluator sheets use Nielsen's ten heuristics plus one additional-comment slot each. Evaluators are anonymized A–E: PDF pages 1–2, 3–4, 7–8, 9–10 and 11–12. Two blank template pairs (5–6 and 13–14) are excluded. The class Example column is rubric, not a reported defect. Ratings belong to an entire heuristic cell; the original 0/1/2/3 values and blank comments are preserved. The wider 0–4 triage scale is retained, with no peer severity 4 recorded. Consolidation considers user impact and existing repair evidence; it does not invent new evaluator agreement or a calibrated score.

### Results — counts and major findings

| Population | Actual count / meaning |
| --- | --- |
| Completed evaluator sheets | 5; two other template sheets unfilled |
| Heuristic / additional-comment slots | 50 / 5, total 55 |
| Explicit / blank ratings | 53 / 2; A/B additional-comment ratings are blank, not zero |
| Nonzero heuristic cells | 19: **2 severity 3, 9 severity 2, 8 severity 1, 0 severity 4** |
| Zero-rated heuristic cells | 31; three additional comments also explicitly rated zero |
| Documentary follow-up | 25 editorial groups from overlapping text, including five zero/unrated recommendations; not 25 newly calibrated peer issues |

**Highest-priority findings.** B-H4 (PDF p.3, severity 3) combines three concerns: unexpected checkout after logout/login, newsroom versus private-chat roles, and follow-state feedback. Its shared score is not three separate major ratings. B-H6 (p.3, severity 3) reports that pending-payment orders cannot be distinguished. The recorded fixes address stale checkout navigation (DEV-222, merged #432), order identifiers/date/product information (DEV-226, merged #433), and unfollow feedback (DEV-230, merged #437). Broader newsroom semantics remain in DEV-239; these code/issue records are not a new peer acceptance test.

| Area for improvement | Original source cells / severity | Recorded disposition and limit |
| --- | --- | --- |
| Clear terminology, home sections and first-use guidance | A-H2 (2), A-H10 (2) | DEV-231 partially addresses A-H10 through the harvest-start transition (#438). Broader labels and first-use guidance remain DEV-239, I4 Backlog; test seasonal/followed farms, reservation and shipment terminology before redesign. |
| Room roles, visibility and user control | B-H3 (1), B-H4 (3), B-H7 (2), B-H8 (2) | DEV-230 addresses the tracked feedback defect. Room/comment semantics and deletion policy remain DEV-239; moderation remains DEV-240. |
| Order recognition, priority and filtering | B-H6 (3), D-H1 (1), D-H8 (1) | DEV-226 adds identification. Priority styling, sort/date filters and overview scope remain DEV-239; do not claim the entire theme fixed. |
| Navigation and recovery | D-H3 (2); E-H3/H5/H9 (2 each) | DEV-224 defines entry-aware Back/fallback behavior (#442). E's generic state/interaction/error observations lack route and reproduction detail, so are not automatically closed. |
| Producer editing, repeated sales and shipment context | C-H1 (1), D-H5 (1), D-H6 (1) | Field-label/new-versus-edit and broader stage terminology remain DEV-239. The historical triage reports carrier details already available; no new UI verification is claimed here. |
| Visual boundaries, styling and repeated/bulk actions | A-H4 (2), A-H7 (1), E-H1 (1) | Preserve style preference and missing screen context. Bulk import/tracking/shortcuts require DEV-240's product-scope decision. |

**Zero and unrated recommendations are retained.** D-H4 (0) asks to distinguish AI answers, handoffs and human messages visually; DEV-213 removes internal handoff reasons, while full visual redesign remains DEV-239. D-H10 (0) suggests less-obscuring tutorial overlays. A's p.2 additional comment requests immediate local display of outgoing chat messages: its severity is **blank**, and the existing DEV-239 tracks it. A-H9 (0) recommends validating financial paths without reporting an encountered error. D's zero-rated additional comment raises product competition; it is not an app defect. None is silently promoted to a rated failure.

### Results — evidence, reconciliation and limitations

- The complete [55-slot source transcription](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/he-2026-11-04/peer-sheet-transcription.json) and [source-to-remediation register](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/he-2026-11-04/peer-sheet-remediation.json) preserve page/heuristic-row provenance, original Korean observations, all numeric/blank ratings and documentary dispositions. The XLSX candidate reproduces the six class columns for A–E and keeps the remediation register separate. It is explicitly a **PDF reconstruction**, since no editable Team 6 workbook was supplied.
- This five-person peer inspection is separate from the team's **38 prechecks / historical 43 merged groups**, Hyun's **21-finding consumer inspection**, and functional/regression suites. They are not pooled into one issue count, severity average or pass rate. Generic peer reports are not assigned a specific fixed defect without evidence.
- No repeat peer inspection or human severity-calibration meeting was conducted during consolidation. Live issue/merge states establish documentary progress; they do not prove the deployed build, frequency/persistence or post-fix usability. DEV-156's remaining human calibration/triage decision stays visible.
- Formative consumer/producer observation (DEV-157) is deferred to I4 Backlog. No recruited 5–8-person study, interview, A/B result, task-success rate or measured time saving is claimed. The six frozen UAT stories in Section 5 are the I4 plan, not execution results.
- The [closeout record](https://github.com/snuhcs-course/swpp-2026-project-team-06/blob/77c6e23efbce5dc52000d732ba1cdf62aa5760be/docs/evaluation/iteration-3-closeout.md) links the requirement/design changes, daily development logs reconstructed from 22 October onward, demo checks and final submission/schedule snapshot. Human review, Wiki publication, second-person package review and an eTL receipt require their own evidence.
