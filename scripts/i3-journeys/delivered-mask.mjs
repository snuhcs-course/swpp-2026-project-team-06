// DEV-173 I3-PRODORD-05 UI evidence: does the producer app hide address/contact of a DELIVERED order (R-15)?
// Isolated local stack only (scripts/i3-journeys/order_manager.py header). Screenshots go to .artifacts (git 밖).
//   I3_PRODUCER=http://localhost:8082 node scripts/i3-journeys/delivered-mask.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.I3_PRODUCER ?? "http://localhost:8082";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) throw new Error(`local producer app only: ${base}`);
const out = `.artifacts/i3-journeys/${process.env.I3_BASELINE ?? "i3-b3-57d4843"}`;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 850 }, locale: "ko-KR" });
await page.goto(`${base}/login`);
await page.getByRole("radio", { name: /강영수/ }).first().click();
await page.getByRole("button", { name: /시작하기$/ }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/PRODORD-05-dashboard.png` });

await page.goto(`${base}/ship?status=all`);
const orderNo = process.env.DELIVERED_ORDER_NO; // o-07
const row = page.getByText(orderNo, { exact: false }).first();
await row.waitFor({ timeout: 20000 });
await row.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/PRODORD-05-ship-all-delivered.png` });
const card = row.locator("xpath=ancestor::*[contains(., '배송') or contains(., '완료')][1]");
const text = (await card.innerText().catch(() => "")) || (await row.locator("xpath=../..").innerText());
console.log(JSON.stringify({ orderNo, rowText: text }));
await browser.close();
