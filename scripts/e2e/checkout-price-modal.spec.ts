// DEV-454: acceptance tests authored without reading checkout implementation.
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer } from "./helpers";

type Order = { orderId: string; status: string; unitPrice: number; quantity: number; totalAmount: number; optionId: string; deliveryNote: string };
type Product = {
  version: number; currentStageId: string; salesLimitGrams: number; maxQuantityPerOrder: number; salesPaused: boolean;
  stages: { stageId: string; options: Record<string, { price: number; quantity: number }> }[];
};
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const modal = (page: Page) => page.getByRole("dialog").or(page.getByRole("alertdialog"));
const reserve = (page: Page) => page.getByRole("button", { name: /^[\d,]+원 예약하기$/ });
const confirm = (page: Page) => modal(page).getByRole("button", { name: "바뀐 금액으로 예약하기", exact: true });

test.beforeEach(() => {
  for (const url of [apiUrl, consumerUrl])
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(url).hostname);
});

async function fixture(request: APIRequestContext) {
  const producer = await apiLogin(request, "u-kang", "producer");
  const consumer = await apiLogin(request, "u-minji", "consumer");
  const read = async (): Promise<Product> => {
    const response = await request.get(`${apiUrl}/api/products/mine/p-house`, { headers: auth(producer) });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const original = await read();
  const stageId = original.currentStageId;
  const originalPrice = original.stages.find(s => s.stageId === stageId)!.options["opt-5"].price;
  const [otherOptionId, otherOption] = Object.entries(original.stages.find(s => s.stageId === stageId)!.options)
    .find(([id]) => id !== "opt-5")!;
  expect(originalPrice, "FIXED_NOW fixture starts with opt-5 at 29,000원").toBe(29000);
  const price = async (value: number) => {
    const current = await read();
    const response = await request.put(`${apiUrl}/api/products/p-house/stages`, {
      headers: { ...auth(producer), "Idempotency-Key": crypto.randomUUID() },
      data: { version: current.version, stages: current.stages.map(stage => ({
        ...stage, options: Object.fromEntries(Object.entries(stage.options).map(([id, option]) => [
          id, { price: stage.stageId === stageId && id === "opt-5" ? value : option.price, quantity: option.quantity },
        ])),
      })) },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  const paused = async (value: boolean) => {
    const current = await read();
    const response = await request.put(`${apiUrl}/api/products/p-house/sales-settings`, {
      headers: { ...auth(producer), "Idempotency-Key": crypto.randomUUID() },
      data: { version: current.version, salesLimitGrams: current.salesLimitGrams,
        maxQuantityPerOrder: current.maxQuantityPerOrder, salesPaused: value },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  const orders = async (): Promise<Order[]> => {
    const result: Order[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
      const response = await request.get(`${apiUrl}/api/orders?${query}`, { headers: auth(consumer) });
      expect(response.ok(), await response.text()).toBeTruthy();
      const body = await response.json();
      result.push(...body.items);
      cursor = body.nextCursor || undefined;
    } while (cursor);
    return result;
  };
  const before = new Set((await orders()).map(order => order.orderId));
  return { price, paused, otherOptionId, otherOptionPrice: otherOption.price,
    freshOrders: async () => (await orders()).filter(order => !before.has(order.orderId)),
    restore: async () => { await paused(original.salesPaused); await price(originalPrice); } };
}

async function filledCheckout(page: Page, quantity = 1) {
  await loginConsumer(page);
  const addresses = page.waitForResponse(r => r.url() === `${apiUrl}/api/auth/me/addresses` && r.request().method() === "GET");
  await page.goto(`${consumerUrl}/checkout/p-house?optionId=opt-5&quantity=${quantity}`);
  if ((await (await addresses).json()).length === 0)
    await page.getByRole("button", { name: "받는 사람과 주소 입력" }).click();
  else {
    await page.getByRole("button", { name: "받는 곳 변경" }).click();
    await page.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await page.getByLabel("받는 사람").fill("DEV454 구매자");
  await page.getByLabel("연락처").fill("010-1234-5678");
  await page.getByLabel("우편번호", { exact: true }).fill("04001");
  await page.getByRole("textbox", { name: "주소", exact: true }).fill("서울 마포구 테스트로 454");
  await page.getByLabel("상세 주소").fill("454호");
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
  await page.getByRole("button", { name: "배송 메모 (선택) 고르기" }).click();
  await page.getByRole("radio", { name: "직접 입력" }).click();
  await page.getByLabel("배송 메모", { exact: true }).fill("DEV454 문 앞에 놓아 주세요");
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await expect(reserve(page)).toBeEnabled();
}

function submissions(page: Page) {
  const creates: unknown[] = [];
  const deposits: string[] = [];
  page.on("request", request => {
    if (request.method() !== "POST") return;
    if (request.url() === `${apiUrl}/api/orders`) creates.push(request.postDataJSON());
    if (/\/api\/orders\/[^/]+\/deposit$/.test(request.url())) deposits.push(request.url());
  });
  return { creates, deposits };
}

async function changed(page: Page) {
  const response = page.waitForResponse(r => r.url() === `${apiUrl}/api/orders` && r.request().method() === "POST");
  await reserve(page).click();
  expect((await response).status()).toBe(409);
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).getByText("가격이 바뀌었어요", { exact: true })).toBeVisible();
  await expect(confirm(page)).toBeEnabled();
}

for (const dismissal of ["return", "escape"] as const) {
  test(`DEV-454: ${dismissal} preserves checkout and its footer reopens price review without reserving`, async ({ page, request }) => {
    test.setTimeout(120_000);
    const data = await fixture(request);
    try {
      await filledCheckout(page, 2);
      const calls = submissions(page);
      await data.price(30000);
      await changed(page);
      await expect(modal(page)).toContainText("29,000원");
      await expect(modal(page)).toContainText("30,000원");
      await expect(modal(page)).toContainText("58,000원");
      await expect(modal(page)).toContainText("60,000원");
      expect(await data.freshOrders()).toEqual([]);
      if (dismissal === "escape") await page.keyboard.press("Escape");
      else await modal(page).getByRole("button", { name: "주문서로 돌아가기", exact: true }).click();
      await expect(modal(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/checkout\/p-house/);
      await expect(page.getByText(/DEV454 구매자/)).toBeVisible();
      await expect(page.getByLabel("배송 메모", { exact: true })).toHaveValue("DEV454 문 앞에 놓아 주세요");
      await expect(page.getByRole("checkbox", { name: "모두 동의해요" })).toBeChecked();
      expect(calls.deposits).toEqual([]);
      expect(calls.creates).toHaveLength(1);
      await page.getByRole("button", { name: "바뀐 금액 확인하기", exact: true }).click();
      await expect(modal(page)).toBeVisible();
      await expect(modal(page)).toContainText("58,000원");
      await expect(modal(page)).toContainText("60,000원");
      expect(calls.creates).toHaveLength(1);
      expect(calls.deposits).toEqual([]);
      expect(await data.freshOrders()).toEqual([]);
    } finally { await data.restore(); }
  });
}

test("DEV-454: another price change during review requires another explicit confirmation before one latest-price order", async ({ page, request }) => {
  test.setTimeout(120_000);
  const data = await fixture(request);
  try {
    await filledCheckout(page);
    const calls = submissions(page);
    await data.price(30000);
    await changed(page);
    await data.price(31000);
    const second = page.waitForResponse(r => r.url() === `${apiUrl}/api/orders` && r.request().method() === "POST");
    await confirm(page).click();
    expect((await second).status()).toBe(409);
    await expect(modal(page)).toBeVisible();
    await expect(modal(page)).toContainText("30,000원");
    await expect(modal(page)).toContainText("31,000원");
    expect(calls.deposits).toEqual([]);
    expect(await data.freshOrders()).toEqual([]);
    await confirm(page).click();
    await expect(page).toHaveURL(/\/pay(?:\?|$)/);
    const orders = await data.freshOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ status: "AWAITING_DEPOSIT", unitPrice: 31000, quantity: 1,
      totalAmount: 31000, deliveryNote: "DEV454 문 앞에 놓아 주세요" });
    expect(calls.deposits).toHaveLength(1);
  } finally { await data.restore(); }
});

test("DEV-454: pausing sales after opening price review cannot create a changed-price reservation", async ({ page, request }) => {
  test.setTimeout(120_000);
  const data = await fixture(request);
  try {
    await filledCheckout(page);
    await data.price(30000);
    await changed(page);
    await data.paused(true);
    await confirm(page).click();
    await expect(page.getByText("농가가 잠시 예약을 쉬고 있어요")).toBeVisible();
    await expect(page.getByRole("button", { name: "바뀐 금액으로 예약하기", exact: true })).toHaveCount(0);
    await expect(reserve(page)).toBeDisabled();
    expect(await data.freshOrders()).toEqual([]);
  } finally { await data.restore(); }
});

test("DEV-454: switching to 10kg after dismissing a 5kg conflict uses the selected option's own price", async ({ page, request }) => {
  test.setTimeout(120_000);
  const data = await fixture(request);
  try {
    await filledCheckout(page);
    await data.price(30000);
    await changed(page);
    await modal(page).getByRole("button", { name: "주문서로 돌아가기", exact: true }).click();
    await page.getByRole("button", { name: "옵션·수량 변경", exact: true }).click();
    await page.getByRole("radio", { name: /10kg/ }).click();
    await page.getByRole("button", { name: "바꾸기", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "바뀐 금액 확인하기", exact: true })).toHaveCount(0);
    await expect(reserve(page)).toBeEnabled();
    await reserve(page).click();
    await expect(page).toHaveURL(/\/pay(?:\?|$)/);
    const orders = await data.freshOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ status: "AWAITING_DEPOSIT", optionId: data.otherOptionId,
      unitPrice: data.otherOptionPrice, quantity: 1 });
  } finally { await data.restore(); }
});

test("DEV-454: failed product refresh after a real price conflict blocks confirmation until an explicit read retry succeeds", async ({ page, request }) => {
  test.setTimeout(120_000);
  const data = await fixture(request);
  try {
    await filledCheckout(page);
    const calls = submissions(page);
    await data.price(30000);
    let conflictSeen = false;
    let failedReads = 0;
    page.on("response", response => {
      if (response.url() === `${apiUrl}/api/orders` && response.request().method() === "POST" && response.status() === 409)
        conflictSeen = true;
    });
    await page.route(url => url.pathname === "/api/products/p-house", async route => {
      // The order POST reaches the real API unchanged. Lose only the first
      // product GET that follows its real 409; the user's read retry can pass.
      if (route.request().method() === "GET" && conflictSeen && failedReads === 0) {
        failedReads++;
        return route.abort("failed");
      }
      return route.continue();
    });
    const rejected = page.waitForResponse(response => response.url() === `${apiUrl}/api/orders` &&
      response.request().method() === "POST");
    await reserve(page).click();
    expect((await rejected).status()).toBe(409);
    await expect(modal(page)).toBeVisible();
    await expect.poll(() => failedReads).toBe(1);
    const retry = modal(page).getByRole("button", { name: "다시 확인하기", exact: true });
    await expect(retry).toBeEnabled();
    await expect(confirm(page)).toBeDisabled();
    await expect(modal(page)).not.toContainText(/현재 총 입금액\s*29,000원/);
    await expect(page.getByText(/DEV454 구매자/)).toHaveCount(1);
    await expect(page.getByLabel("배송 메모", { exact: true })).toHaveValue("DEV454 문 앞에 놓아 주세요");
    await expect(page.getByRole("checkbox", { name: "모두 동의해요" })).toBeChecked();
    expect(calls.creates).toHaveLength(1);
    expect(calls.deposits).toEqual([]);
    expect(await data.freshOrders()).toEqual([]);

    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/products/p-house" &&
      response.request().method() === "GET" && response.ok());
    await retry.click();
    await refreshed;
    await expect(modal(page)).toContainText(/현재 총 입금액\s*30,000원/);
    await expect(confirm(page)).toBeEnabled();
    await expect(page.getByText(/DEV454 구매자/)).toHaveCount(1);
    await expect(page.getByLabel("배송 메모", { exact: true })).toHaveValue("DEV454 문 앞에 놓아 주세요");
    await expect(page.getByRole("checkbox", { name: "모두 동의해요" })).toBeChecked();
    expect(calls.creates).toHaveLength(1);
    expect(calls.deposits).toEqual([]);
    expect(await data.freshOrders()).toEqual([]);
  } finally { await data.restore(); }
});
