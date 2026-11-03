# Iteration 2 — supplementary local test evidence

Measured on **22 October 2026 (KST)** against product commit **691949e985080f372a45d54fa950191e88adb8ce**. This local review draft supplements the historical 77-case internal register. It does not replace any 19 October deployed result or represent a final 23 October deadline freeze. The user required review before any commit; numerical targets were saved locally before measurement and await human review with the rest of this change.

## Evidence index

| File | Purpose |
| --- | --- |
| [coverage-plan.md](coverage-plan.md) | Prospective goals, scope and exclusions saved before execution |
| [coverage-summary.json](coverage-summary.json) | Component counters, goals, actual runtime/tool versions and run outcomes |
| [server-coverage.json](server-coverage.json) | coverage.py file/line/branch results, unchanged collector counters |
| [client-coverage-summary.json](client-coverage-summary.json), [client-coverage.json](client-coverage.json) | Native c8/Istanbul counters with only local absolute paths made repository-relative |
| [coverage-html-reports.zip](coverage-html-reports.zip) | Actual tool-generated HTML: extract and open `server-html/index.html` or `client-html/index.html` |
| [server-initial-pytest.txt](server-initial-pytest.txt), [server-pytest.txt](server-pytest.txt) | Initial 420 PASS/2 FAIL, then final 422 PASS after isolated database timezone correction |
| [node-contracts.txt](node-contracts.txt), [admin-tests.txt](admin-tests.txt) | Existing Node tests: 22 Mock contracts and 18 admin checks |
| [integration-enabled.txt](integration-enabled.txt), [integration-disabled.txt](integration-disabled.txt) | Real API/Chromium execution with both source-feature flag states |
| [typecheck.txt](typecheck.txt), [ruff.txt](ruff.txt), [alembic-check.txt](alembic-check.txt) | Five workspace typechecks, Python lint and migration/model consistency |
| [collect-coverage.sh](collect-coverage.sh) | Reproduction helper assembled from the executed commands; not itself rerun end to end |
| [browser-coverage.cjs](browser-coverage.cjs), [playwright.coverage.config.ts](playwright.coverage.config.ts), [c8-config.json](c8-config.json) | Diagnostic browser collection, source maps and original-source inclusion |
| [summarize-coverage.py](summarize-coverage.py) | Recalculate weighted component counters from local native reports |
| [SHA256SUMS](SHA256SUMS) | File checksums, excluding the checksum file itself |

The two actual-report screenshots are `docs/wiki/images/i2-coverage-server.png` and `i2-coverage-client.png`. They were captured from the generated local HTML with Chromium. They are not reconstructed scorecards. The Python report's 88% header combines branches/statements; statement-only coverage is 90.90%. Native c8 truncates its combined 22,955/31,067 result to 73.88%; rounding that ratio gives 73.89%.

## Actual execution environment

- macOS / Apple Silicon; Node 24.19.0, npm 11.19.0; Python 3.12.14, uv 0.13.5; PostgreSQL 16.15.
- pytest 9.1.1, pytest-cov 7.1.0, coverage.py 7.16.2; c8 12.0.0; Playwright 1.64.0, full Chromium 156.0.8078.4 (Playwright browser build 1248).
- Product dependencies: existing `package-lock.json` / `server/uv.lock`. Coverage tools were installed outside product dependencies. No assertion, product code, manifest or lockfile was changed.
- Disposable cluster on `127.0.0.1:55432`, database `farmclub_i2_coverage`; pytest creates its `_test` DB. Initial cluster timezone was Asia/Seoul; final run used UTC. PostgreSQL was stopped after collection/review checks.
- `APP_ENV=local`, `SOURCE_STORAGE=local`, mock source provider, cleared Anthropic/OpenAI/OpenRouter keys. Full integration fixes the clock to `2026-10-07T10:00:00+09:00`, seeds local identities and enables test login. No production data, actual transfer or paid model call.
- The default browser installation downloaded full Chromium but failed later on the FFmpeg download (DNS resolution). The run selected that installed full executable and disabled diagnostic video recording. Test assertions, retry count and worker count remained unchanged. This is not a claim that the default browser-install command completed successfully.

## Commands actually executed

The following records the meaningful commands. Host-specific executable paths were selected explicitly because Node/npm were not initially on the shell path; `node`, `uv` and `c8` below stand for those recorded versions. c8 was invoked from a separate local tools directory, not installed into the repository. A reproduction can use `npm exec --yes --package=c8@12.0.0 -- c8` instead.

```sh
# Root: product install with npm 11.19.0 (launched through pnpm dlx)
npm ci --no-audit --no-fund
# server/
uv sync --frozen --python /opt/homebrew/bin/python3.12

# Disposable PostgreSQL: created separately; final timezone=UTC.
# server/, with the isolated DATABASE_URL and cleared provider keys:
COVERAGE_FILE=../.artifacts/i2-coverage/.coverage \
uv run --frozen --with pytest-cov==7.1.0 pytest --cov=app --cov-branch \
  --cov-report=term --cov-report=html:../.artifacts/i2-coverage/server-html \
  --cov-report=json:../.artifacts/i2-coverage/server-coverage.json \
  --cov-report=xml:../.artifacts/i2-coverage/server-coverage.xml \
  --junitxml=../.artifacts/i2-coverage/server-junit.xml
# Same command initially failed two date-string assertions; original outputs retained.

# Root: compile maps, then original test:mock Node file list, unchanged assertions.
node node_modules/typescript/bin/tsc -p scripts/mock-tsconfig.json --sourceMap --inlineSources
NODE_V8_COVERAGE=.artifacts/i2-coverage/v8 node --test \
  scripts/test-news-rooms.mjs scripts/test-spec12.mjs scripts/test-capacity.mjs \
  scripts/test-navigation.mjs scripts/test-storefront.mjs scripts/test-ai-feedback.mjs \
  scripts/test-onboarding.mjs scripts/test-analytics.mjs scripts/test-producer-gate.mjs
NODE_V8_COVERAGE=.artifacts/i2-coverage/v8 node --test scripts/admin-web/admin.test.mjs

# Collection preload enabled, full installed Chromium selected, isolated DB:
# First run omitted SOURCE_ANALYSIS_ENABLED; the runner defaulted to true.
# The explicit true below records the effective equivalent configuration.
export FARMCLUB_BROWSER_COVERAGE=1
export NODE_OPTIONS="--require $PWD/docs/submission/evidence/iteration-2/browser-coverage.cjs"
export FARMCLUB_INTEGRATION_SKIP_DOCKER=1
# FARMCLUB_COVERAGE_BROWSER was set to the installed full Chromium binary.
SOURCE_ANALYSIS_ENABLED=true node scripts/run-integration.mjs \
  --config docs/submission/evidence/iteration-2/playwright.coverage.config.ts
# Enabled HTML and test-result folders preserved before the second run.
SOURCE_ANALYSIS_ENABLED=false node scripts/run-integration.mjs \
  --config docs/submission/evidence/iteration-2/playwright.coverage.config.ts \
  scripts/e2e/source-disabled.spec.ts
unset NODE_OPTIONS FARMCLUB_BROWSER_COVERAGE
c8 report --config docs/submission/evidence/iteration-2/c8-config.json
npm run typecheck
# server/
uv run --frozen ruff check app tests
uv run --frozen alembic check
```

Raw V8/Metro bundles, full Playwright diagnostics, native Python XML/coverage database and unmodified machine-local logs remain in ignored `.artifacts/i2-coverage/`. Public logs substitute `<repository>`/`<home>` for local personal paths; trailing whitespace and extra final blank lines are normalized without changing any evidence tokens. No team conversation export or raw private source file is included. The c8 report initially failed on a virtual shim path; reporting configuration was corrected to filter original sources after remapping and use the proper output option. All original application sources remain included; the final report succeeds. This reporting correction changes no tested code or goals.

## Findings and follow-up

- Initial server failures were equal instants with different serialized offsets. UTC on the isolated DB resolves the existing assertions; the initial failures are preserved and portability remains a documented limitation.
- Source-enabled Chromium: 65 PASS, two flag-conditional skips. Source-disabled rerun: the two fallback tests PASS. The seven API scenarios pass in each configuration, representing seven repeated scenarios, not fourteen unique cases.
- Missed goals: account/order/source-analysis branch coverage, consumer line coverage and admin JavaScript line coverage. Preserve targets and inspect uncovered lists; do not remove those files or relax assertions.
- Admin handler tests leave browser glue and local server entry at zero. Consumer onboarding/profile/address and some order paths need further interaction tests. Live OAuth/provider quality, actual bank transfers, physical-device journeys and NFR performance/load/uptime remain outside this measurement.
- These results do not clear F-07/F-08 or other historical deployed failures. Retest their original environments with recorded app/server revisions before changing the register or release decision.
