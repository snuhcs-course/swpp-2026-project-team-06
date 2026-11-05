// DEV-234: CI 경로 분류(scripts/ci/classify.mjs) 시나리오. 실제 integration-map.json·spec 파일로 돈다.
//   node --test scripts/ci/test-classify.mjs   (make test-ci, CI changes job)
import assert from "node:assert/strict";
import { test } from "node:test";

import { check, classify, globToRegExp, loadConfig, matches, shard } from "./classify.mjs";

const config = loadConfig();
const run = (lane, files) => classify({ lane, files, config });
const all = config.specFiles.length;

test("glob: ** spans folders, * stays in one, ! excludes", () => {
  assert.ok(globToRegExp("docs/**").test("docs/spec/prd.md"));
  assert.ok(globToRegExp("**/*.md").test("README.md"));
  assert.ok(globToRegExp("**/*.md").test("server/tasks/DEV-1.md"));
  assert.ok(!globToRegExp("scripts/e2e/*.spec.ts").test("scripts/e2e/sub/x.spec.ts"));
  assert.ok(!matches("docs/spec/validation/a.json", ["docs/**", "!docs/spec/validation/**"]));
  assert.ok(matches("docs/spec/prd.md", ["docs/**", "!docs/spec/validation/**"]));
});

test("integration map covers every spec and quarantine list is valid", () => {
  assert.deepEqual(check(config), []);
});

test("docs-only PR skips every job", () => {
  const r = run("pr", ["docs/spec/prd.md", "server/tasks/DEV-1.md", ".github/tasks/DEV-234.md", "AGENTS.md"]);
  assert.equal(r.docs_only, true);
  assert.deepEqual(Object.values(r.jobs), [false, false, false, false]);
  assert.equal(r.integration, false);
});

test("validation corpus under docs/ is not docs: server tests read it", () => {
  const r = run("pr", ["docs/spec/validation/source-corpus-i3-v1.json"]);
  assert.equal(r.docs_only, false);
  assert.equal(r.jobs.server, true);
  assert.equal(r.jobs.apps, false);
  assert.equal(r.integration, false);
});

test("scripts-only PR (admin-web, deploy scripts) skips server, apps and integration", () => {
  const r = run("pr", ["scripts/admin-web/server.mjs", "scripts/ci/deploy-changed.sh"]);
  assert.equal(r.jobs.admin, true);
  assert.equal(r.jobs.deploy_scripts, true);
  assert.equal(r.jobs.server, false);
  assert.equal(r.jobs.apps, false);
  assert.equal(r.integration, false);
});

test("server-only test change runs pytest only", () => {
  const r = run("pr", ["server/tests/test_orders.py"]);
  assert.equal(r.jobs.server, true);
  assert.equal(r.jobs.apps, false);
  assert.equal(r.integration, false);
});

test("Mock contract test change runs apps without integration", () => {
  const r = run("pr", ["scripts/test-storefront.mjs"]);
  assert.equal(r.jobs.apps, true);
  assert.equal(r.integration, false);
});

test("one spec file change runs only that spec in one shard", () => {
  const r = run("pr", ["scripts/e2e/legal-pages.spec.ts"]);
  assert.deepEqual(r.specs, ["scripts/e2e/legal-pages.spec.ts"]);
  assert.equal(r.matrix.length, 1);
  assert.equal(r.matrix[0].api, true);
});

test("consumer app change runs consumer specs only", () => {
  const r = run("pr", ["apps/consumer/src/app/index.tsx"]);
  assert.ok(r.specs.includes("scripts/e2e/checkout-logout.spec.ts"));
  assert.ok(!r.specs.includes("scripts/e2e/source-review-regressions.spec.ts"));
  assert.ok(r.specs.length < all);
});

test("producer app change skips consumer-only specs", () => {
  const r = run("pr", ["apps/producer/src/app/index.tsx"]);
  assert.ok(r.specs.includes("scripts/e2e/source-review-regressions.spec.ts"));
  assert.ok(!r.specs.includes("scripts/e2e/checkout-logout.spec.ts"));
});

test("source analysis server change runs the source group", () => {
  const r = run("pr", ["server/app/source_analysis/service.py"]);
  assert.equal(r.jobs.server, true);
  assert.ok(r.specs.includes("scripts/e2e/source-editor.spec.ts"));
  assert.ok(!r.specs.includes("scripts/e2e/checkout-logout.spec.ts"));
});

test("DEV-186 AC-SRC-3: shared safety JSON still triggers apps and integration", () => {
  const r = run("pr", ["server/app/source_analysis/text_safety_lists.json"]);
  assert.equal(r.jobs.apps, true);
  assert.equal(r.jobs.server, true);
  assert.equal(r.integration, true);
});

test("shared server or package change runs every spec in 3 shards", () => {
  for (const f of ["server/app/orders/service.py", "packages/ui/src/Button.tsx", "package-lock.json", "scripts/e2e/helpers.ts"]) {
    const r = run("pr", [f]);
    assert.equal(r.specs.length, all, f);
    assert.equal(r.matrix.length, 3, f);
  }
});

test("CI files or unknown paths run everything", () => {
  for (const f of [".github/workflows/ci.yml", "scripts/ci/classify.mjs", "some/new/place.txt"]) {
    const r = run("pr", [f]);
    assert.deepEqual(Object.values(r.jobs), [true, true, true, true], f);
    assert.equal(r.specs.length, all, f);
  }
});

test("merge queue and unvalidated main push run the full integration suite", () => {
  for (const lane of ["queue", "push"]) {
    const r = run(lane, ["apps/consumer/src/app/index.tsx"]);
    assert.equal(r.specs.length, all, lane);
    assert.equal(run(lane, ["docs/spec/prd.md"]).integration, false, `${lane} docs-only`);
  }
});

test("hotfix lane keeps unit checks but skips integration", () => {
  const r = run("hotfix", ["server/app/orders/service.py", "apps/consumer/src/app/index.tsx"]);
  assert.equal(r.jobs.server, true);
  assert.equal(r.jobs.apps, true);
  assert.equal(r.integration, false);
});

test("validated main push runs nothing; full lane runs everything", () => {
  const v = run("validated", ["server/app/orders/service.py"]);
  assert.deepEqual(Object.values(v.jobs), [false, false, false, false]);
  assert.equal(v.integration, false);
  const f = run("full", []);
  assert.deepEqual(Object.values(f.jobs), [true, true, true, true]);
  assert.equal(f.specs.length, all);
});

test("quarantined spec files are left out of the matrix", () => {
  const q = { ...config, quarantine: { specs: [{ file: "scripts/e2e/legal-pages.spec.ts", issue: "DEV-1" }], tests: [] } };
  const r = classify({ lane: "pr", files: ["scripts/e2e/legal-pages.spec.ts"], config: q });
  assert.equal(r.integration, false);
  assert.deepEqual(r.quarantined, ["scripts/e2e/legal-pages.spec.ts"]);
});

test("shard: longest first onto the lightest shard, balanced within the longest file", () => {
  const durations = { a: 190, b: 60, c: 50, d: 40, e: 30, f: 20, g: 10 };
  const m = shard(Object.keys(durations), durations, 3);
  assert.equal(m.length, 2); // 400초 → 200초씩 2개
  const loads = m.map((s) => s.seconds).sort((x, y) => x - y);
  assert.deepEqual(loads, [200, 200]); // a+g, b+c+d+e+f
  assert.equal(m.filter((s) => s.api).length, 1);
  const full = shard(config.specFiles, config.durations, 3);
  const max = Math.max(...full.map((s) => s.seconds));
  const total = full.reduce((sum, s) => sum + s.seconds, 0);
  assert.ok(max <= total / 3 + 60, `max shard ${max}s of ${total}s`);
  assert.equal(full.flatMap((s) => s.specs.split(" ")).length, config.specFiles.length);
});
