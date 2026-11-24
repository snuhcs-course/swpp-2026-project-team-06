// DEV-353: stock conflicts show a modal whose dismissal returns to this product.
import { mkdirSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer } from "./helpers";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const mutation = (token: string) => ({ ...auth(token), "Idempotency-Key": crypto.randomUUID() });
type Product = {
  version: number; currentStageId: string; salesLimitGrams: number; reservedGrams: number;
  shippedGrams: number; maxQuantityPerOrder: number; salesPaused: boolean;
  stages: { stageId: string; options: Record<string, { price: number; quantity: number; reservedCount: number }> }[];
};

test.beforeEach(() => {
  for (const url of [apiUrl, consumerUrl])
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(url).hostname);
});

async function orderIds(request: APIRequestContext, token: string) {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
    const response = await request.get(`${apiUrl}/api/orders?${params}`, { headers: auth(token) });
    expect(response.ok(), await response.text()).toBeTruthy();
    const data = await response.json();
    ids.push(...data.items.map((item: { orderId: string }) => item.orderId));
    cursor = data.nextCursor || undefined;
  } while (cursor);
  return ids.sort();
}

async function stockFixture(request: APIRequestContext) {
  const token = await apiLogin(request, "u-kang", "producer");
  const read = async (): Promise<Product> => {
    const response = await request.get(`${apiUrl}/api/products/mine/p-house`, { headers: auth(token) });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const original = await read();
  const option = original.stages.find(stage => stage.stageId === original.currentStageId)!.options["opt-5"];
  const setLimit = async (limit: number) => {
    const current = await read();
    const response = await request.put(`${apiUrl}/api/products/p-house/sales-settings`, {
      headers: mutation(token), data: { version: current.version,
        salesLimitGrams: limit, maxQuantityPerOrder: current.maxQuantityPerOrder, salesPaused: current.salesPaused },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  const setStock = async (quantity: number) => {
    const current = await read();
    const response = await request.put(`${apiUrl}/api/products/p-house/stages`, {
      headers: mutation(token), data: { version: current.version,
        stages: current.stages.map(stage => ({ ...stage, options: Object.fromEntries(
          Object.entries(stage.options).map(([id, value]) => [id, { price: value.price,
            quantity: stage.stageId === original.currentStageId && id === "opt-5" ? quantity : value.quantity }]),
        ) })),
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  return { original, option, setLimit, setStock };
}

async function filledCheckout(page: Page) {
  const addresses = page.waitForResponse(r => r.url() === `${apiUrl}/api/auth/me/addresses` && r.request().method() === "GET");
  await page.goto(`${consumerUrl}/checkout/p-house?optionId=opt-5&quantity=3`);
  if ((await (await addresses).json()).length === 0)
    await page.getByRole("button", { name: "받는 사람과 주소 입력" }).click();
  else {
    await page.getByRole("button", { name: "받는 곳 변경" }).click();
    await page.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await page.getByLabel("받는 사람").fill("품절 확인 구매자");
  await page.getByLabel("연락처").fill("010-1234-5678");
  await page.getByLabel("우편번호", { exact: true }).fill("04001");
  await page.getByRole("textbox", { name: "주소", exact: true }).fill("서울 마포구 월드컵북로 12");
  await page.getByLabel("상세 주소").fill("품절 확인 302호");
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
}

const scenarios = [
  { remaining: 2, direct: false, dismiss: "confirm" },
  { remaining: 0, direct: false, dismiss: "escape" },
  { remaining: 0, direct: true, dismiss: "confirm" },
  { remaining: 2, direct: true, dismiss: "escape" },
] as const;

for (const reason of ["TOTAL_LIMIT_REACHED", "SOLD_OUT"] as const) {
  for (const scenario of scenarios) {
    test(`DEV-353 ${reason}: ${scenario.remaining} remaining, ${scenario.direct ? "direct entry" : "stock changes while reviewing"}, ${scenario.dismiss} exits to the product without an order`, async ({ page, request }) => {
      test.setTimeout(120_000);
      const fixture = await stockFixture(request);
      const consumerToken = await apiLogin(request, "u-minji", "consumer");
      expect(fixture.option.quantity - fixture.option.reservedCount, "seed has at least three boxes before review").toBeGreaterThanOrEqual(3);
      expect(fixture.original.salesLimitGrams - fixture.original.reservedGrams - fixture.original.shippedGrams).toBeGreaterThanOrEqual(15000);
      const before = await orderIds(request, consumerToken);
      await loginConsumer(page);
      // A fresh tab has no previous app screen to which an accidental history-back can return.
      const checkout = scenario.direct ? await page.context().newPage() : page;
      let creates = 0;
      checkout.on("request", request => {
        if (request.method() === "POST" && request.url() === `${apiUrl}/api/orders`) creates++;
      });
      try {
        if (!scenario.direct) await filledCheckout(checkout);
        if (reason === "TOTAL_LIMIT_REACHED")
          await fixture.setLimit(fixture.original.reservedGrams + fixture.original.shippedGrams + scenario.remaining * 5000);
        else await fixture.setStock(fixture.option.reservedCount + scenario.remaining);

        if (scenario.direct) await checkout.goto(`${consumerUrl}/checkout/p-house?optionId=opt-5&quantity=3`);
        else {
          const rejected = checkout.waitForResponse(r => r.url() === `${apiUrl}/api/orders` && r.request().method() === "POST");
          await checkout.getByRole("button", { name: /^[\d,]+원 예약하기$/ }).click();
          const response = await rejected;
          expect(response.status()).toBe(409);
          expect((await response.json()).details.reason).toBe(reason);
        }
        const modal = checkout.getByRole("dialog").or(checkout.getByRole("alertdialog"));
        await expect(modal).toBeVisible();
        await expect(modal.getByRole("button", { name: "확인", exact: true })).toBeVisible();
        await expect(modal.getByRole("button", { name: /수량 바꾸기|옵션 바꾸기/ })).toHaveCount(0);
        expect(await orderIds(request, consumerToken)).toEqual(before);
        expect(creates).toBe(scenario.direct ? 0 : 1);
        mkdirSync(".artifacts/uat-followup-review", { recursive: true });
        await checkout.screenshot({ path: `.artifacts/uat-followup-review/stock-${reason}-${scenario.remaining}-${scenario.direct ? "direct" : "review"}.png` });
        if (scenario.dismiss === "escape") await checkout.keyboard.press("Escape");
        else await modal.getByRole("button", { name: "확인", exact: true }).click();
        await expect(checkout).toHaveURL(new RegExp(`${consumerUrl}/products/p-house(?:[?#].*)?$`));
        await expect(modal).toHaveCount(0);
        await expect(checkout.getByText("하우스 감귤 5kg / 10kg", { exact: true }).first()).toBeVisible();
        expect(await orderIds(request, consumerToken)).toEqual(before);
        expect(creates).toBe(scenario.direct ? 0 : 1);
      } finally {
        if (reason === "TOTAL_LIMIT_REACHED") await fixture.setLimit(fixture.original.salesLimitGrams);
        else await fixture.setStock(fixture.option.quantity);
        if (scenario.direct) await checkout.close();
      }
    });
  }
}
