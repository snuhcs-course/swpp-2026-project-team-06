import { test, expect, type Page } from "./fixtures";
import { loginProducer, producerUrl } from "./helpers";

// DEV-339. Written from the UAT requirements and existing API fixtures,
// without reading the editor implementation. Product reads are scoped fixtures.
test.use({ viewport: { width: 360, height: 850 } });
test.beforeEach(() => test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true"));

async function termsFixture(page: Page, periods: { start: string; end: string; price: number; hasOrders?: boolean }[]) {
  await loginProducer(page, "강영수");
  await page.route("**/api/products/mine/p-redhyang", async (route) => {
    const response = await route.fetch();
    const product = await response.json();
    product.deliveryWindow = { start: "2026-11-10", end: "2026-11-20" };
    product.maxDelayUntil = "2026-11-30";
    product.stages = periods.map((period, i) => ({
      stageId: `uat-terms-${i}`, seq: i + 1, name: `${i + 1}단계`,
      startsAt: period.start, endsAt: period.end, hasOrders: period.hasOrders ?? false,
      reservedOrderCount: 0, awaitingOrderCount: 0, preparingOrderCount: 0, harvestStarted: false,
      options: { "opt-3": { price: period.price, quantity: 20, reservedCount: 0 } },
    }));
    await route.fulfill({ response, json: product });
  });
  await page.route("**/product-workspaces/p-redhyang/product-draft", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), draft: null } });
  });
  await page.goto(`${producerUrl}/products/p-redhyang/detail`);
  await expect(page).toHaveURL(/composer=1/);
  await page.getByRole("button", { name: "판매 조건 고치기", exact: true }).click();
  const editor = page.getByTestId("sales-terms-editor");
  await expect(editor).toBeVisible();
  return editor;
}

for (const width of [320, 360]) {
  test(`DEV-339 ${width}px: dates fit without overlap; invalid chronology is refused and exhausted append explains why`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const editor = await termsFixture(page, [
      { start: "2026-10-10", end: "2026-10-20", price: 30000 },
      { start: "2026-10-21", end: "2026-11-09", price: 35000 },
    ]);
    const dates = editor.locator('input[type="date"]');
    const count = await dates.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i++) {
      const date = dates.nth(i);
      await date.scrollIntoViewIfNeeded();
      await expect(date).toBeInViewport();
      const rect = (await date.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    }
    const boxes = await dates.evaluateAll((inputs) => inputs.map((input) => {
      const r = input.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
    }
    if (width === 320) {
      await dates.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: ".artifacts/uat-followup-review/periods320.png" });
    }
    const append = editor.getByRole("button", { name: "＋ 예약 기간 추가", exact: true });
    await expect(append).toBeDisabled();
    await expect(editor.getByText(/받는 시기.*(전|앞)|추가할.*(날|기간)|남은.*(날|기간)/).last()).toBeVisible();
    // Only period rows have four date inputs in this fixture. Delivery controls are buttons.
    await dates.nth(0).fill("2026-10-22"); // start > end
    await page.getByRole("button", { name: "수정 담기", exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId("price-period").first().getByRole("alert")).toBeVisible();
    await dates.nth(0).fill("2026-10-10");
    await dates.nth(2).fill("2026-10-20"); // inclusive overlap
    await page.getByRole("button", { name: "수정 담기", exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId("price-period").nth(1).getByRole("alert")).toBeVisible();
    await dates.nth(2).fill("2026-10-21");
    await dates.nth(3).fill("2026-11-10"); // delivery day is not a reservation day
    await page.getByRole("button", { name: "수정 담기", exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId("price-period").nth(1).getByRole("alert")).toBeVisible();
    await dates.nth(3).fill("2026-11-09");
    await page.getByRole("button", { name: "수정 담기", exact: true }).click();
    await expect(editor).toHaveCount(0);
  });
}

test("DEV-339: a front earlybird leaves existing dates intact and prices follow chronological order", async ({ page }) => {
  const editor = await termsFixture(page, [
    { start: "2026-10-15", end: "2026-10-25", price: 35000 },
  ]);
  const early = editor.getByRole("button", { name: "＋ 얼리버드 기간 추가", exact: true });
  await expect(early).toBeEnabled();
  const dates = editor.locator('input[type="date"]');
  const before = await dates.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  await early.click();
  await expect(dates).toHaveCount(before.length + 2);
  const after = await dates.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  expect(after.slice(-2)).toEqual(before);
  expect(after[1] < before[0]).toBe(true);
  const prices = editor.getByLabel("3kg 가격", { exact: true });
  await prices.first().fill("40000");
  await editor.getByLabel("3kg 박스 수", { exact: true }).first().fill("10");
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId("price-period").nth(1).getByRole("alert"))
    .toContainText(/뒤 기간 가격이 앞 기간보다 비싸야/);
  // Move the first displayed row after the second: ascending prices must be
  // checked by dates, rather than by the order in which rows were created.
  await dates.nth(1).fill("2026-11-01");
  await dates.nth(0).fill("2026-10-26");
  await editor.getByRole("button", { name: "＋ 예약 기간 추가", exact: true }).click();
  await expect(dates).toHaveCount(6);
  const appended = await dates.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  expect(appended).toContain("2026-11-02"); // after the chronologically latest end, November 1
  await prices.last().fill("45000");
  await editor.getByLabel("3kg 박스 수", { exact: true }).last().fill("10");
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await expect(editor).toHaveCount(0);
});
