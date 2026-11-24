// DEV-465 / AC-ENG-1~5: real persisted actions, no mock completion or score counters.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer } from "./helpers";

function restoreLocalSeed() {
  const url = process.env.DATABASE_URL;
  if (!url || !/@(?:127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error("Engagement browser fixtures require an explicitly local DATABASE_URL");
  }
  execFileSync(path.resolve("server/.venv/bin/python"), ["-c", `
from app.core.db import get_sessionmaker
from app.core import seed
with get_sessionmaker()() as db, db.begin():
    seed.clear(db)
    seed.seed(db)
`], { cwd: path.resolve("server"), env: process.env });
}

test.beforeEach(restoreLocalSeed);
test.afterAll(restoreLocalSeed);

test("AC-ENG-1/2: first actual follow welcomes with stable number, opens introduction and explains temperature", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/farms/f-halla/info`);
  await page.getByRole("button", { name: "팔로우", exact: true }).click();
  const welcome = page.getByTestId("follow-welcome");
  await expect(welcome).toContainText("한라네 과수원");
  await expect(welcome).toContainText("2번째");
  await expect(welcome).toBeInViewport({ ratio: 0.95 });
  await page.screenshot({ path: test.info().outputPath("follow-welcome-mobile.png"), animations: "disabled" });
  await page.getByRole("button", { name: "농가 소개 보기", exact: true }).click();
  await expect(page).toHaveURL(/\/farms\/f-halla\/info$/);
  await expect(welcome).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("farm-temperature-mobile.png") });
  await page.getByTestId("farm-temperature").click();
  await expect(page.getByTestId("temperature-policy")).toContainText("36.5");
  await page.screenshot({ path: test.info().outputPath("temperature-policy-mobile.png") });
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await page.getByRole("button", { name: "팔로잉, 누르면 팔로우를 끊어요" }).click();
  await page.getByRole("button", { name: "팔로우", exact: true }).click();
  await expect(welcome).toHaveCount(0);
  const token = await apiLogin(request, "u-seojun", "consumer");
  const repeated = await request.put(`${apiUrl}/api/farms/f-halla/follow`, { headers: { Authorization: `Bearer ${token}` } });
  expect(await repeated.json()).toMatchObject({ firstFollow: false, fanNumber: 2 });
});

test("AC-ENG-4: clicking a task cannot complete it; confirmed purchase and saved review do, including reload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-first_purchase")).toContainText("도전 중");
  await page.screenshot({ path: test.info().outputPath("achievement-dashboard-320.png") });
  await expect(page.getByTestId("achievement-first_review")).toContainText("도전 중");
  await page.getByTestId("achievement-first_purchase").getByRole("button").click();
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-first_purchase")).toContainText("도전 중");
  await page.goto(`${consumerUrl}/orders/o-07`);
  await page.getByRole("button", { name: "구매 확정", exact: true }).click();
  // The existing order confirmation sheet requires a second explicit confirmation.
  const confirm = page.getByRole("button", { name: "확인", exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await page.getByRole("radio", { name: "5점", exact: true }).click();
  await page.getByRole("button", { name: "후기 저장", exact: true }).click();
  await expect(page.getByText("후기를 저장했어요", { exact: true })).toBeVisible();
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-first_purchase")).toContainText("달성");
  await expect(page.getByTestId("achievement-first_review")).toContainText("달성");
  await page.reload();
  await expect(page.getByTestId("achievement-first_purchase")).toContainText("달성");
  await expect(page.getByTestId("achievement-first_review")).toContainText("달성");
});

test("AC-ENG-1/4: failed follow leaves server and dashboard unchanged, real follow completes and unfollow reverses", async ({ page, request }) => {
  const token = await apiLogin(request, "u-seojun", "consumer");
  const headers = { Authorization: `Bearer ${token}` };
  expect((await request.delete(`${apiUrl}/api/farms/f-kang/follow`, { headers })).ok()).toBeTruthy();
  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-first_follow")).toContainText("도전 중");
  await page.route("**/api/farms/f-namwon/follow", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "잠시 후 다시 시도해 주세요." } }) }));
  await page.goto(`${consumerUrl}/farms/f-namwon/info`);
  await page.getByRole("button", { name: "팔로우", exact: true }).click();
  await expect(page.getByTestId("follow-welcome")).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`${apiUrl}/api/farms/f-namwon`, { headers })).json()).isFollowing).toBe(false);
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-first_follow")).toContainText("도전 중");
  await page.unroute("**/api/farms/f-namwon/follow");
  await page.goto(`${consumerUrl}/farms/f-namwon/info`);
  await page.getByRole("button", { name: "팔로우", exact: true }).click();
  await expect(page.getByTestId("follow-welcome")).toBeVisible();
  await page.getByRole("button", { name: "농가 소개 보기", exact: true }).click();
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-first_follow")).toContainText("달성");
  await page.goto(`${consumerUrl}/farms/f-namwon/info`);
  await page.getByRole("button", { name: "팔로잉, 누르면 팔로우를 끊어요" }).click();
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-first_follow")).toContainText("도전 중");
});

test("AC-ENG-2/3: submitted report has no penalty; only confirmed incident lowers temperature and overturn restores", async ({ page, request }) => {
  const temperature = async () => {
    const r = await request.get(`${apiUrl}/api/farms/f-halla/temperature`);
    expect(r.ok()).toBeTruthy();
    return (await r.json()).temperatureTenths as number;
  };
  const baseline = await temperature();
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/farms/f-halla/info`);
  await page.getByRole("button", { name: "농가 신고", exact: true }).click();
  await page.getByRole("textbox", { name: "신고 내용" }).fill("안내와 다른 상품 설명을 확인해 주세요.");
  const posted = page.waitForResponse(r => /\/engagement\/farms\/f-halla\/reports$/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: "신고 보내기", exact: true }).click();
  const response = await posted;
  expect(response.ok()).toBeTruthy();
  const report = await response.json();
  expect(report.status).toBe("PENDING");
  expect(await temperature()).toBe(baseline);
  const admin = process.env.FARMCLUB_ADMIN_TOKEN;
  expect(admin).toBeTruthy();
  const headers = { Authorization: `Bearer ${admin}` };
  const confirmed = await request.patch(`${apiUrl}/api/engagement/reports/${report.reportId}`, { headers, data: { status: "CONFIRMED", incidentKey: "e2e-verified-incident" } });
  expect(confirmed.ok()).toBeTruthy();
  expect(await temperature()).toBe(baseline - 1);
  const overturned = await request.patch(`${apiUrl}/api/engagement/reports/${report.reportId}`, { headers, data: { status: "OVERTURNED" } });
  expect(overturned.ok()).toBeTruthy();
  expect(await temperature()).toBe(baseline);
  await page.reload();
  await expect(page.getByTestId("farm-temperature")).toContainText(`${(baseline / 10).toFixed(1)}°C`);
});


test("AC-ENG-1/4: a late saved follow response cannot welcome or redirect another account", async ({ page, request }) => {
  await loginConsumer(page, "이서준");
  let release!: () => void;
  let held!: () => void;
  let delivered!: () => void;
  const responseDelivered = new Promise<void>(resolve => { delivered = resolve; });
  const responseHeld = new Promise<void>(resolve => { held = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/farms/f-namwon/follow", async route => {
    const actual = await route.fetch();
    expect(actual.ok()).toBeTruthy();
    held();
    await released;
    await route.fulfill({ response: actual }).catch(() => undefined);
    delivered();
  });
  await page.goto(`${consumerUrl}/farms/f-namwon/info`);
  await page.getByRole("button", { name: "팔로우", exact: true }).click();
  await responseHeld;
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/me/achievements`);
  await expect(page.getByTestId("achievement-summary")).toBeVisible();
  release();
  await responseDelivered;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByTestId("follow-welcome")).toHaveCount(0);
  await expect(page).toHaveURL(/\/me\/achievements$/);
  const token = await apiLogin(request, "u-minji", "consumer");
  const farm = await request.get(`${apiUrl}/api/farms/f-namwon`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await farm.json()).isFollowing).toBe(false);
});
