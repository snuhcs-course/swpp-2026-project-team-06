#!/usr/bin/env bash
# Run only against a fresh disposable localhost PostgreSQL database.
# Requires Node 24/npm, Python 3.12/uv and Playwright Chromium.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT_DIR"
: "${DATABASE_URL:?Set a disposable local PostgreSQL URL; this run resets its data}"
node -e 'const u = new URL(process.env.DATABASE_URL.replace("postgresql+psycopg:", "postgresql:")); if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) throw new Error("Disposable localhost database required");'
ARTIFACT_DIR="$ROOT_DIR/.artifacts/i2-coverage"
if [[ -e "$ARTIFACT_DIR" ]]; then
  echo 'Archive existing .artifacts/i2-coverage first; refusing to overwrite evidence.' >&2
  exit 1
fi
mkdir -p "$ARTIFACT_DIR/v8"
export APP_ENV=local SOURCE_STORAGE=local SOURCE_ANALYSIS_PROVIDER=mock
export ANTHROPIC_API_KEY='' OPENAI_API_KEY='' OPENROUTER_API_KEY=''
export EXPO_PUBLIC_POSTHOG_KEY=''
# Install product dependencies before running this script: npm ci; server/uv sync --frozen.
(
  cd server
  export SOURCE_ANALYSIS_ENABLED=false
  export COVERAGE_FILE="$ARTIFACT_DIR/.coverage"
  uv run --frozen --with pytest-cov==7.1.0 pytest --cov=app --cov-branch \
    --cov-report=term --cov-report="html:$ARTIFACT_DIR/server-html" \
    --cov-report="json:$ARTIFACT_DIR/server-coverage.json" \
    --cov-report="xml:$ARTIFACT_DIR/server-coverage.xml" \
    --junitxml="$ARTIFACT_DIR/server-junit.xml"
) 2>&1 | tee "$ARTIFACT_DIR/server-pytest.log"
# Preserve source maps; npm run test:mock would recompile without these flags.
node node_modules/typescript/bin/tsc -p scripts/mock-tsconfig.json --sourceMap --inlineSources
export NODE_V8_COVERAGE="$ARTIFACT_DIR/v8"
node --input-type=module -e '
import fs from "node:fs"; import {spawnSync} from "node:child_process";
const command=JSON.parse(fs.readFileSync("package.json")).scripts["test:mock"];
const files=command.split("node --test ")[1].trim().split(/\s+/);
const run=spawnSync(process.execPath,["--test",...files],{stdio:"inherit",env:process.env});
if(run.error) throw run.error; process.exit(run.status ?? 1);
' 2>&1 | tee "$ARTIFACT_DIR/node-contracts.log"
node --test scripts/admin-web/admin.test.mjs 2>&1 | tee "$ARTIFACT_DIR/admin-tests.log"
unset NODE_V8_COVERAGE
export FARMCLUB_BROWSER_COVERAGE=1
export NODE_OPTIONS="--require $ROOT_DIR/docs/submission/evidence/iteration-2/browser-coverage.cjs"
# Set FARMCLUB_INTEGRATION_SKIP_DOCKER=1 when using an existing local PG service.
# FARMCLUB_COVERAGE_BROWSER optionally points to an installed full Chromium binary.
SOURCE_ANALYSIS_ENABLED=true node scripts/run-integration.mjs \
  --config docs/submission/evidence/iteration-2/playwright.coverage.config.ts \
  2>&1 | tee "$ARTIFACT_DIR/integration.log"
mv "$ARTIFACT_DIR/playwright-report" "$ARTIFACT_DIR/playwright-enabled-report"
mv "$ARTIFACT_DIR/test-results" "$ARTIFACT_DIR/enabled-test-results"
SOURCE_ANALYSIS_ENABLED=false node scripts/run-integration.mjs \
  --config docs/submission/evidence/iteration-2/playwright.coverage.config.ts \
  scripts/e2e/source-disabled.spec.ts 2>&1 | tee "$ARTIFACT_DIR/integration-disabled.log"
unset NODE_OPTIONS FARMCLUB_BROWSER_COVERAGE
npm exec --yes --package=c8@12.0.0 -- c8 report \
  --config docs/submission/evidence/iteration-2/c8-config.json \
  2>&1 | tee "$ARTIFACT_DIR/c8-report.log"
npm run typecheck 2>&1 | tee "$ARTIFACT_DIR/typecheck.log"
(cd server && uv run --frozen ruff check app tests) 2>&1 | tee "$ARTIFACT_DIR/ruff.log"
(cd server && SOURCE_ANALYSIS_ENABLED=false uv run --frozen alembic check) \
  2>&1 | tee "$ARTIFACT_DIR/alembic-check.log"
