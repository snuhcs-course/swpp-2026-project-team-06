// DEV-212: run every scripts/test-*.mjs Mock contract test with node:test. New test files need no package.json edit
// (the one-line list used to conflict whenever two PRs each added a test). test-integration.mjs is a live-server
// runner, not a node:test file, so it stays out.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const EXCLUDE = new Set(["test-integration.mjs"]);
const files = readdirSync(dir)
  .filter((f) => /^test-.*\.mjs$/.test(f) && !EXCLUDE.has(f))
  .sort()
  .map((f) => path.join("scripts", f));
if (files.length === 0) throw new Error("no scripts/test-*.mjs found");
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", cwd: path.join(dir, "..") });
process.exit(result.status ?? 1);
