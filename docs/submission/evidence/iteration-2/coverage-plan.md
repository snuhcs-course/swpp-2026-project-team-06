# Iteration 2 supplementary coverage plan

Declared on **22 October 2026**, before the supplementary local execution, against product commit `691949e985080f372a45d54fa950191e88adb8ce`. This is the first numerical plan located for this measurement. It is not represented as a target submitted before the 17–19 October internal test. The user requested local review before any commit; this plan is therefore saved locally before execution and awaits that review.

## Architectural targets

| Component / source scope | Primary metric and goal | Additional reported metric | Rationale |
| --- | --- | --- | --- |
| Server, all `server/app/**/*.py` | Statement coverage >= 85% | Branch coverage >= 75% | Transactions, validation and authorization require broad deterministic checks. |
| Server accounts, orders and messaging (reported separately) | Statement coverage >= 90% | Branch coverage >= 80% | Authentication, ownership and order-state errors directly affect data and transactions. |
| Server source analysis | Statement coverage >= 80% | Branch coverage >= 70% | Parser/worker and provider failure paths include process and third-party boundaries; live model quality is evaluated separately. |
| Consumer, `apps/consumer/src/**/*.{ts,tsx}` | Line coverage >= 60% | Functions/branches as emitted by V8 | UI includes rendering and platform paths; lower than business logic, while uncovered routes remain in the denominator. |
| Producer, `apps/producer/src/**/*.{ts,tsx}` | Line coverage >= 60% | Functions/branches as emitted by V8 | Same treatment as consumer; account gates and asynchronous editing are included. |
| Shared API, `packages/api/src/**/*.ts` | Line coverage >= 80% | Functions/branches | Shared data and Mock contracts require stronger coverage than rendering. |
| Shared UI, `packages/ui/src/**/*.{ts,tsx}` | Line coverage >= 60% | Functions/branches | Rendered UI is included, with platform behavior distinguished from unit contracts. |
| Admin JavaScript, `scripts/admin-web/api/**/*.js`, `assets/*.js`, `server.mjs` | Line coverage >= 80% | Functions/branches | Session/proxy/action guards need coverage; static HTML/CSS is not executable JavaScript. |

## Collection and denominator

- Python: pytest-cov/coverage.py with branch collection and `--cov=app`; test the existing suite against a disposable local PostgreSQL cluster. Include all application Python modules, including unexecuted ones. Exclude tests, migrations, dependencies and generated outputs by the explicit application-source boundary, not by selecting only passing/high-coverage modules.
- JavaScript/TypeScript: c8/V8 with source maps and `--all` for the listed source roots, preserving unexecuted modules at zero. Compile the existing Mock fixture build with source maps, then execute the unchanged Node tests. Capture Chromium JavaScript coverage during the existing real-stack Playwright suite and remap application bundles to original files where source maps are available.
- Report Node-only and combined browser observations precisely. If browser coverage cannot be collected or remapped, report that limitation and the available measured scope; do not treat an absent collector as successful UI coverage.
- Exclude `node_modules`, test/harness code, build outputs, static assets, generated declarations (`*.d.ts`) and native wrapper/configuration files. Include all original application source files matching the table. Do not aggregate Python statement coverage and V8 line coverage into one percentage.
- Use an unweighted per-component result table and underlying covered/total counts. An overall percentage is computed from covered/total counters, not by averaging file percentages.

## Execution conditions

Use local seeded identities, fixed test clock, mock external providers, and no production database, real money transfer, live Kakao sign-in, or paid model calls. Record exact runtime/tool versions, source commit, commands, test counts, fail/skip details and reporting time. Preserve tool-generated JSON/HTML reports and capture the actual coverage report screens.

The 77-case workbook remains a separate historical result set. A successful 22 October regression does not silently clear a 19 October deployed FAIL/BLOCKED. If a target is missed, retain the target and report the shortfall, measured scope, reason and follow-up.
