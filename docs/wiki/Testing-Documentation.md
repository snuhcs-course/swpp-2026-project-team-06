# Testing Documentation

**Team 6 — Farmclub | Iteration 2 | Revised 22 October 2026**

## Overview

The final internal workbook contains **77 cases: 66 PASS, 6 FAIL, 3 BLOCKED, and 2 NOT READY**. Of these, 72 were executed: **93.5% execution** and **91.7% pass among executed cases**. The PM withheld full-scope GO for the planned 20 October user test. I-18 is PASS because the readiness review was completed; it is not a release approval.

This report uses `SWPP_Internal_Testing_1_Final.xlsx` as the sole authority for these 77 outcomes. Prepared on 17 October, it records observations through **19 October 2026, 17:28 KST**. Separately verified GitHub logs supply automated-run and configuration evidence. They do not change workbook FAIL/BLOCKED states. No application tests were newly run for this documentation revision.

**Submission limitation:** numerical code coverage targets, component coverage measurements, and coverage-report screenshots were not established by the workbook or inspected GitHub records. These mandatory I2 requirements remain unmet. Section 7 identifies the remaining evidence gaps.

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

No numerical code coverage target or percentage was found in the workbook, prior Testing Documentation, inspected repository configuration/history, searched GitHub PRs, or identified CI records. Inspected Python dependencies include pytest/Ruff without a coverage collector; the JavaScript test command does not collect coverage. `test_source_coverage.py` tests source-analysis behavior and is not a code coverage report. This bounded search does not exclude unuploaded/private records.

| Architectural component | Framework/collector status | Predeclared target | Actual coverage | Required action |
| --- | --- | --- | --- | --- |
| Consumer client | Node tests/Playwright; collector not established | Not recorded | Unavailable | Hyun declares metric/target/scope/tool and retains report/screenshot. |
| Producer client — logic (`apps/producer/src/lib/*.ts` except browser file-picker glue) | Node built-in test runner + `--experimental-test-coverage` (DEV-118) | **Lines ≥ 90%, branches ≥ 80%** (declared 23 October 2026, before first measurement) | See Section 3.6 | Jinwoo; `npm run coverage:producer`. |
| Producer client — screens/UI (`apps/producer/src/**/*.tsx`, `pick.ts`, `sourceFiles.ts`) | Playwright Chromium V8 JS coverage mapped to sources (DEV-118) | **Lines ≥ 60%** (declared 23 October 2026, before first measurement) | See Section 3.6 | Jinwoo; command in Section 3.6. |
| Shared API/UI | Typechecks/Mock contracts; no coverage report | Not recorded | Unavailable | Client owners assign/report targets separately for shared logic and rendering. |
| Server services, authorization, AI adapters, persistence | pytest; no recorded coverage collector/report | Not recorded | Unavailable | Zahra declares component targets/configuration and retains report/screenshot. |

Business logic and authorization warrant stronger targets than rendering/platform glue because failures affect transactions and data. Owners must commit numerical goals, explain differences, and state whether generated code, third-party code, migrations, and test utilities are included **before the next measurement**. No exclusions, targets, or achievements are backdated. Functional pass percentages cannot substitute for code coverage.

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

These commands **do not produce code coverage**. Coverage tool/version/configuration/command, reports, and screenshots remain required.

### 2.4 Manual replay

1. Select an Appendix A case; reproduce environment, roles, account state, and prerequisites. Record app/server revisions, browser/device/OS, and time on retest.
2. Use isolated data. Kakao-only UI login does not expose seeded API identities; an existing profile is not a fresh registration.
3. Execute the procedure and observable criteria; retain original and revised commitments when flows change.
4. Record responses/UI, evidence, resulting data, and cleanup; use BLOCKED/NOT READY where execution is prevented.
5. Repeat the failed deployed path after a fix, then affected regressions. Keep API-only, local, CI, and deployed UI outcomes distinct.

Some workbook runs lack exact SHAs, browser versions, commands, or accessible screenshots/PM HTML. Appendix A preserves those limits.

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

Automated success does not resolve the six deployed PM failures or establish successful first-order chat, new-product entry, or approved-producer re-login in that environment. No skipped cases appear in these specific summaries; that does not establish that every feature was tested. Component code coverage remains unavailable.

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

### 3.6 Producer coverage results (DEV-118)

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

To be completed in Iteration 3: commit at least 30 frozen input/expected-behavior cases, label/rating provenance, an evaluation design discussed with the TA where ground truth is difficult, and per-case schema/rubric/tolerance/human assertions. Exact string matching cannot be the sole criterion. Commit thresholds before evaluation; record model/version, prompt, decoding settings, and command. Add cases without removing/editing submitted cases.

### Results

Formal I3 metrics are not yet due. I2 samples P-10–P-13/A-07–A-12 remain below; they do not establish independent AI accuracy or predeclared thresholds. I3 results must compare each metric with its threshold, give date/commit, analyze failures, and disclose settings changes.

## 5. Acceptance Testing (Plan in Iteration 3; Results in Iteration 4)

### Plan

To be completed in Iteration 3: at least five stories, observable acceptance criteria, tester procedures, and a story freeze after I3. The [previous AC catalogue][prior] is preserved as a development plan, not completed UAT. Appendix B explains I2 revisions.

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
| Architectural coverage goals/rationale | Section 2.2 | **Partly met:** producer logic/UI targets and exclusions committed before measurement (DEV-118); consumer, shared, and server targets still required. |
| Exact test/coverage commands/environment | Sections 2.3 and 3.6 | **Partly met:** producer coverage commands/environment in Section 3.6; consumer, shared, and server coverage configuration/commands still missing; some local/manual SHAs/browser versions absent. |
| Result date/commit/command | Section 3/Appendix A | **Partly met:** exact workbook-only local SHAs/commands and app/server pairs needed. |
| Actual coverage versus target/screenshot | Section 3.6 (producer) | **Partly met:** producer measured with screenshots (logic 100%, UI 66.03% lines, both met); consumer, shared, and server measurements still required. |
| Counts, failure/skip reasons, actions | Section 3/all 77 cases | Supply referenced artifacts; retest after fixes/dependency resolution. |
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

**Dependency/follow-up:** Consumer partial-refund history display follows [PR #126](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/126).

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

**Dependency/follow-up:** Approval/refund mutations remained local to protect shared seeds (A-01/A-04/A-05 local PASS); deployed reads do not establish mutation verification.

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
