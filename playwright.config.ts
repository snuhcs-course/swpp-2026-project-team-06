import { readFileSync } from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// DEV-234: 격리 목록. FARMCLUB_INCLUDE_QUARANTINE=1이면 격리한 것도 돈다.
type Quarantine = { specs?: { file: string }[]; tests?: { title: string }[] };
const quarantine: Quarantine =
  process.env.FARMCLUB_INCLUDE_QUARANTINE === "1"
    ? {}
    : JSON.parse(readFileSync(path.join(__dirname, "scripts/ci/quarantine.json"), "utf8"));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const quarantinedTitles = (quarantine.tests ?? []).map((t) => escape(t.title));

export default defineConfig({
  testDir: "./scripts/e2e",
  fullyParallel: false,
  workers: 1,
  // DEV-234: CI에서만 1회 재시도(재시도로 통과하면 보고서에 flaky로 남는다). 로컬은 바로 실패를 본다.
  retries: process.env.CI ? 1 : 0,
  testIgnore: (quarantine.specs ?? []).map((s) => s.file.replace(/^scripts\/e2e\//, "**/")),
  grepInvert: quarantinedTitles.length ? new RegExp(quarantinedTitles.join("|")) : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
