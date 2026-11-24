// DEV-455: real local API/browser undo acceptance paths. No Mock responses.
// DEV-466: 머리 '실행 취소' → 최근 처리 목록에서 주문 고르기 → 확인 시트 '되돌리기'.
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginProducer, producerUrl } from "./helpers";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const mutation = (token: string) => ({ ...auth(token), "Idempotency-Key": crypto.randomUUID() });
const sheet = (page: Page) => page.getByRole("dialog").or(page.getByRole("alertdialog"));
const headerUndo = (page: Page) => page.getByRole("button", { name: "실행 취소", exact: true }).first();
// 최근 처리 목록에서 그 주문의 처리를 고른다
const pickUndo = (page: Page, orderNo: string) =>
  sheet(page).getByRole("button", { name: new RegExp(`^${orderNo} .+ 되돌리기$`) }).click();

test.beforeEach(() => {
  for (const url of [apiUrl, consumerUrl, producerUrl])
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(url).hostname);
});

async function fixture(request: APIRequestContext) {
  const consumer = await apiLogin(request, "u-minji", "consumer");
  const producer = await apiLogin(request, "u-kang", "producer");
  const response = await request.post(`${apiUrl}/api/orders`, {
    headers: mutation(consumer), data: {
      productId: "p-house", optionId: "opt-5", quantity: 1,
      recipientName: `실행취소 ${crypto.randomUUID().slice(0, 8)}`,
      recipientPhone: "010-1234-5678", postalCode: "04001", address: "서울 마포구 월드컵북로 12",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "dev455-undo",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const order = await response.json();
  for (const [action, token] of [["deposit", consumer]]) {
    const saved = await request.post(`${apiUrl}/api/orders/${order.orderId}/${action}`, {
      headers: mutation(token), data: {},
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
  }
  const read = async () => {
    const current = await request.get(`${apiUrl}/api/orders/${order.orderId}`, { headers: auth(consumer) });
    expect(current.ok(), await current.text()).toBeTruthy();
    return current.json();
  };
  return { order, producer, consumer, read };
}

test("DEV-455: approval immediately enables header undo and reload restores its target; closing confirmation makes no mutation", async ({ page, request }) => {
  const { order, read } = await fixture(request);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  await page.getByRole("button", { name: `${order.orderNo} 입금 승인`, exact: true }).click();
  await sheet(page).getByRole("button", { name: "확인 · 입금 승인", exact: true }).click();
  await expect.poll(async () => (await read()).status).toBe("PREPARING");
  await expect(headerUndo(page)).toBeVisible();
  await expect(headerUndo(page)).toBeEnabled();
  // Reload must recover the latest persisted action for the single header control.
  await page.goto(`${producerUrl}/ship?status=PREPARING`);
  await page.reload();
  await expect(headerUndo(page)).toBeVisible();
  let undoRequests = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().endsWith(`/orders/${order.orderId}/undo`)) undoRequests++; });
  await headerUndo(page).click();
  await pickUndo(page, order.orderNo);
  await expect(sheet(page).getByText(new RegExp(order.orderNo))).toBeVisible();
  await expect(sheet(page).getByText(/입금 대기|입금 확인 중/).first()).toBeVisible();
  await expect(sheet(page).getByText(/실제|택배|송금|기록/).first()).toBeVisible();
  await sheet(page).getByRole("button", { name: "닫기", exact: true }).click();
  expect(undoRequests).toBe(0);
  expect((await read()).status).toBe("PREPARING");
  await headerUndo(page).click();
  await pickUndo(page, order.orderNo);
  await sheet(page).getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect.poll(async () => (await read()).status).toBe("AWAITING_DEPOSIT");
  expect((await read()).paidAt).toBeNull();
  expect(undoRequests).toBe(1);
  await expect(sheet(page)).toHaveCount(0);
});

test("DEV-455: lost success retries the same order/action/key and blocks concurrent confirmation", async ({ page, request }) => {
  const { order, read } = await fixture(request);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  await page.getByRole("button", { name: `${order.orderNo} 입금 승인`, exact: true }).click();
  await sheet(page).getByRole("button", { name: "확인 · 입금 승인", exact: true }).click();
  await expect.poll(async () => (await read()).status).toBe("PREPARING");
  await headerUndo(page).click();
  await pickUndo(page, order.orderNo);
  await expect(sheet(page).getByText(new RegExp(order.orderNo))).toBeVisible();
  const attempts: { body: unknown; key: string | undefined; url: string }[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${apiUrl}/api/orders/${order.orderId}/undo`, async route => {
    attempts.push({ body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"], url: route.request().url() });
    if (attempts.length === 1) {
      await gate;
      const accepted = await route.fetch();
      expect(accepted.ok(), await accepted.text()).toBeTruthy();
      // The server committed, but the browser cannot know the outcome.
      return route.abort("failed");
    }
    return route.continue();
  });
  const confirm = sheet(page).getByRole("button", { name: "되돌리기", exact: true });
  await confirm.click();
  await expect.poll(() => attempts.length).toBe(1);
  await expect(sheet(page).getByRole("button").filter({ hasNotText: /^닫기$/ }).last()).toBeDisabled();
  release();
  await expect.poll(async () => (await read()).status).toBe("AWAITING_DEPOSIT");
  const retry = sheet(page).getByRole("button", { name: /^(되돌리기|다시 시도|재시도)$/ });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect.poll(() => attempts.length).toBe(2);
  await expect(sheet(page)).toHaveCount(0);
  expect(attempts[0].key).toBeTruthy();
  expect(attempts[1]).toEqual(attempts[0]);
  expect((await read()).status).toBe("AWAITING_DEPOSIT");
  await expect(sheet(page)).toHaveCount(0);
});

test("DEV-455: intervening tracking correction rejects shipment undo and refreshes the current list", async ({ page, request }) => {
  const { order, producer, read } = await fixture(request);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  await page.getByRole("button", { name: `${order.orderNo} 입금 승인`, exact: true }).click();
  await sheet(page).getByRole("button", { name: "확인 · 입금 승인", exact: true }).click();
  await expect.poll(async () => (await read()).status).toBe("PREPARING");
  await page.getByRole("tab", { name: /^배송 대기 \d/ }).click();
  await page.getByRole("button", { name: new RegExp(`${order.orderNo}.*송장 입력`) }).click();
  await page.getByRole("radio", { name: "CJ대한통운", exact: true }).click();
  await page.getByRole("textbox", { name: "송장 번호", exact: true }).fill("DEV455-original");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: "1건 출하 처리", exact: true }).click();
  const shippingResponse = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/orders/${order.orderId}/ship`));
  await sheet(page).getByRole("button", { name: "1건 출하 처리", exact: true }).click();
  const shipped = await shippingResponse;
  expect(shipped.ok(), await shipped.text()).toBeTruthy();
  const version = (await shipped.json()).trackingVersion;
  await expect.poll(async () => (await read()).status).toBe("SHIPPED");
  await page.getByRole("tab", { name: /^출하 \d/ }).click();
  await headerUndo(page).click();
  await pickUndo(page, order.orderNo);
  await expect(sheet(page).getByText(new RegExp(order.orderNo))).toBeVisible();
  const corrected = await request.patch(`${apiUrl}/api/orders/${order.orderId}/tracking`, {
    headers: mutation(producer), data: { version, carrier: "EPOST", trackingNumber: "DEV455-corrected" },
  });
  expect(corrected.ok(), await corrected.text()).toBeTruthy();
  const rejected = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/orders/${order.orderId}/undo`));
  const refreshed = page.waitForResponse(r => r.request().method() === "GET" && r.url().includes("/api/orders/producer?"));
  await sheet(page).getByRole("button", { name: "되돌리기", exact: true }).click();
  const response = await rejected;
  expect(response.status()).toBe(409);
  expect((await response.json()).details.reason).toBe("UNDO_CONFLICT");
  expect((await refreshed).ok()).toBeTruthy();
  await expect(page.getByText(/다른 작업|변경|최신|취소할 수 없/).first()).toBeVisible();
  await expect(page.getByText(/DEV455-corrected/).first()).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
  expect(await read()).toMatchObject({ status: "SHIPPED", trackingNumber: "DEV455-corrected" });
});

test("DEV-466 AC-17-4: the order card status chip offers only the next server action and the last-action undo", async ({ page, request }) => {
  const { order, read } = await fixture(request);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
  const chip = page.getByRole("button", { name: `${order.orderNo} 상태 입금 대기, 변경`, exact: true });
  await chip.click();
  await expect(sheet(page).getByRole("button", { name: "배송 대기로", exact: true })).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "미승인", exact: true })).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: /되돌리기$/ })).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "배송 대기로", exact: true }).click();
  await sheet(page).getByRole("button", { name: "확인 · 입금 승인", exact: true }).click();
  await expect.poll(async () => (await read()).status).toBe("PREPARING");

  await page.goto(`${producerUrl}/ship?status=PREPARING`);
  await page.getByRole("button", { name: `${order.orderNo} 상태 배송 대기, 변경`, exact: true }).click();
  await expect(sheet(page).getByRole("button", { name: "출하로", exact: true })).toBeVisible();
  // 배송 완료는 생산자가 바꾸지 않는다(R-19)
  await expect(sheet(page).getByText("배송 완료로", { exact: true })).toHaveCount(0);
  await sheet(page).getByRole("button", { name: "입금 대기로 되돌리기", exact: true }).click();
  await expect(sheet(page).getByText(/실제 입금·송금이나 택배 발송은 취소되지 않아요/)).toBeVisible();
  await sheet(page).getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect.poll(async () => (await read()).status).toBe("AWAITING_DEPOSIT");
  expect((await read()).paidAt).toBeNull();
});
