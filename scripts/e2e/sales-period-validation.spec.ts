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

// DEV-486: 기간 날짜는 카드 제목의 날짜 칸을 눌러 달력 시트로 고친다. 오류·'더 넣을 날짜 없음'은 시트 위 토스트.
async function pickPeriod(page: Page, row: RegExp, from: RegExp, to: RegExp, nextMonthForEnd = false) {
  await page.getByRole("button", { name: row }).click();
  const sheet = page.getByRole("dialog").last();
  await sheet.getByRole("button", { name: from }).click();
  if (nextMonthForEnd) await sheet.getByRole("button", { name: "다음 달", exact: true }).click();
  await sheet.getByRole("button", { name: to }).click();
  await sheet.getByRole("button", { name: "이 기간으로", exact: true }).click();
}

for (const width of [320, 360]) {
  test(`DEV-339 DEV-486 ${width}px: period date boxes fit; invalid chronology is refused with a toast and exhausted append explains why`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const editor = await termsFixture(page, [
      { start: "2026-10-10", end: "2026-10-20", price: 30000 },
      { start: "2026-10-21", end: "2026-11-09", price: 35000 },
    ]);
    const dates = editor.getByRole("button", { name: /날짜 고치기$/ });
    await expect(dates).toHaveCount(2);
    await expect(editor.locator('input[type="date"]')).toHaveCount(0);
    for (let i = 0; i < 2; i++) {
      const date = dates.nth(i);
      await date.scrollIntoViewIfNeeded();
      await expect(date).toBeInViewport();
      const rect = (await date.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    }
    // Measured together (same scroll position): the two period date boxes do not overlap.
    const [a, b] = await dates.evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }));
    expect(a.bottom <= b.top).toBe(true);
    if (width === 320) {
      await dates.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: ".artifacts/uat-followup-review/periods320.png" });
    }
    // The old explanation lines are gone; an exhausted append answers with a toast instead.
    await expect(editor.getByText(/기간 사이를 비워|추가할 수 있는 날짜/)).toHaveCount(0);
    await editor.getByRole("button", { name: "예약 기간 추가", exact: true }).click();
    await expect(page.getByText("더 넣을 날짜가 없어요. 받는 시기를 늦춰 주세요.")).toBeVisible();
    // The sheet refuses a range overlapping the other period (inclusive) and says how to fix it.
    await dates.nth(1).click();
    const sheet = page.getByRole("dialog").last();
    await sheet.getByRole("button", { name: /^10월 20일 .요일/ }).click();
    await sheet.getByRole("button", { name: "다음 달", exact: true }).click();
    await sheet.getByRole("button", { name: /^11월 9일 .요일/ }).click();
    await expect(sheet.getByText(/겹쳐요/)).toBeVisible();
    await expect(sheet.getByRole("button", { name: "이 기간으로", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(sheet.getByText(/겹쳐요/)).toHaveCount(0);
    // The delivery start day is not a reservation day.
    await pickPeriod(page, /^2기간.*날짜 고치기$/, /^10월 21일 .요일/, /^11월 10일 .요일/, true);
    await page.getByRole("button", { name: "수정 담기", exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(page.getByText(/받는 시기 전날까지 끝나야/)).toBeVisible();
    await expect(page.getByTestId("invalid-field-prices")).toBeVisible();
    await pickPeriod(page, /^2기간.*날짜 고치기$/, /^10월 21일 .요일/, /^11월 9일 .요일/, true);
    await page.getByRole("button", { name: "수정 담기", exact: true }).click();
    await expect(editor).toHaveCount(0);
  });
}

test("DEV-339 DEV-486: a front earlybird leaves existing dates intact and prices follow chronological order", async ({ page }) => {
  const editor = await termsFixture(page, [
    { start: "2026-10-15", end: "2026-10-25", price: 35000 },
  ]);
  const early = editor.getByRole("button", { name: "얼리버드 기간 추가", exact: true });
  await expect(early).toBeEnabled();
  await early.click();
  const rows = editor.getByTestId("price-period");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).getByRole("button", { name: /10월 15일 ~ 10월 25일/ })).toBeVisible();
  await expect(rows.nth(0).getByText("다음 기간보다 싸게 하면 일찍 사는 소비자가 좋아해요")).toBeVisible();
  const prices = editor.getByLabel("3kg 가격", { exact: true });
  await prices.first().fill("40000");
  await editor.getByLabel("3kg 박스 수", { exact: true }).first().fill("10");
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(page.getByText(/뒤 기간 가격이 앞 기간보다 비싸야/)).toBeVisible();
  // Move the earlybird period after the original one: the cards re-order by date,
  // so the moved period (40,000) becomes the second card and prices rise chronologically.
  await pickPeriod(page, /^1기간.*날짜 고치기$/, /^10월 26일 .요일/, /^11월 1일 .요일/, true);
  await expect(rows.nth(1).getByRole("button", { name: /10월 26일 ~ 11월 1일/ })).toBeVisible();
  await expect(prices.nth(1)).toHaveValue(/40,?000/);
  await editor.getByRole("button", { name: "예약 기간 추가", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2).getByRole("button", { name: /11월 2일 ~/ })).toBeVisible(); // after the latest end, November 1
  await prices.last().fill("45000");
  await editor.getByLabel("3kg 박스 수", { exact: true }).last().fill("10");
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test("DEV-489: a period with orders can change its dates but cannot be deleted", async ({ page }) => {
  const editor = await termsFixture(page, [
    { start: "2026-10-01", end: "2026-10-12", price: 30000, hasOrders: true },
    { start: "2026-10-13", end: "2026-11-09", price: 35000 },
  ]);
  const rows = editor.getByTestId("price-period");
  const reserved = rows.nth(0);
  await expect(reserved.getByRole("button", { name: /날짜 고치기$/ })).toBeEnabled();
  await expect(reserved.getByRole("button", { name: "기간 삭제", exact: true })).toHaveCount(0);
  await expect(reserved.getByText(/예약 이력이 있어 날짜는/)).toHaveCount(0);
  await expect(rows.nth(1).getByRole("button", { name: "기간 삭제", exact: true })).toBeVisible();
  // Shorten the reserved period; its orders stay in it (server keeps stageId).
  await pickPeriod(page, /^1기간.*날짜 고치기$/, /^10월 1일 .요일/, /^10월 10일 .요일/);
  await expect(reserved.getByRole("button", { name: /10월 1일 ~ 10월 10일/ })).toBeVisible();
  await page.getByRole("button", { name: "수정 담기", exact: true }).click();
  await expect(editor).toHaveCount(0);
});
