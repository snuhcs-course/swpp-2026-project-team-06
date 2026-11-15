// DEV-320: a committed deposit whose response is lost must remain one reservation.
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer } from "./helpers";

type OrderRow = { orderId: string; productId: string; status: string; quantity: number; deliveryNote?: string; unitPrice: number };

const recovery = (page: Page) => page.getByRole("button", { name: "예약 결과 확인하기", exact: true });

async function recoveredGuide(page: Page, orderId: string) {
  const guide = page.getByRole("button", { name: "입금 안내 보기", exact: true });
  await expect(guide).toBeEnabled();
  await guide.click();
  await expect(page).toHaveURL(new RegExp(`/pay\\?.*orderId=${orderId}(?:&|$)`));
}

async function getOrder(request: APIRequestContext, token: string, orderId: string): Promise<OrderRow> {
  const response = await request.get(`${apiUrl}/api/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function checkoutRequests(page: Page) {
  const creates: string[] = [];
  const deposits: { url: string; key: string | undefined }[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (request.url() === `${apiUrl}/api/orders`)
      creates.push(request.headers()["idempotency-key"]);
    if (/\/api\/orders\/[^/]+\/deposit$/.test(request.url()))
      deposits.push({ url: request.url(), key: request.headers()["idempotency-key"] });
  });
  return { creates, deposits };
}

async function setStagePrice(request: APIRequestContext, price: number) {
  const token = await apiLogin(request, "u-kang", "producer");
  const headers = { Authorization: `Bearer ${token}` };
  const productResponse = await request.get(`${apiUrl}/api/products/mine/p-house`, { headers });
  expect(productResponse.ok()).toBeTruthy();
  const product = await productResponse.json();
  const stages = product.stages.map((stage: { options: Record<string, { price: number; quantity: number }> }, index: number) => ({
    ...stage,
    options: Object.fromEntries(Object.entries(stage.options).map(([id, option]) => [
      id, { ...option, price: index === 0 && id === "opt-5" ? price : option.price },
    ])),
  }));
  const response = await request.put(`${apiUrl}/api/products/p-house/stages`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: { version: product.version, stages },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function consumerOrders(request: APIRequestContext, token: string) {
  const orders: OrderRow[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const response = await request.get(`${apiUrl}/api/orders?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const result = await response.json();
    orders.push(...result.items);
    cursor = result.nextCursor || undefined;
  } while (cursor);
  return orders;
}

// Same real-server setup/selectors as checkout-stage-changed.spec.ts. All data
// is synthetic and branch-local; no real transfer or shared production writes.
async function filledCheckout(page: Page) {
  await loginConsumer(page);
  const addresses = page.waitForResponse(
    (response) => response.url() === `${apiUrl}/api/auth/me/addresses` &&
      response.request().method() === "GET",
  );
  await page.goto(`${consumerUrl}/checkout/p-house?optionId=opt-5&quantity=1`);
  if ((await (await addresses).json()).length === 0) {
    await page.getByRole("button", { name: "받는 사람과 주소 입력" }).click();
  } else {
    await page.getByRole("button", { name: "받는 곳 변경" }).click();
    await page.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await page.getByLabel("받는 사람").fill("DEV320 구매자");
  await page.getByLabel("연락처").fill("010-1234-5678");
  await page.getByLabel("우편번호", { exact: true }).fill("04001");
  await page.getByRole("textbox", { name: "주소", exact: true }).fill("서울 마포구 테스트로 320");
  await page.getByLabel("상세 주소").fill("테스트 1호");
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
  await page.getByRole("button", { name: "배송 메모 (선택) 고르기" }).click();
  await page.getByRole("radio", { name: "직접 입력" }).click();
  await page.getByLabel("배송 메모", { exact: true }).fill("처음 보낸 메모");
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
}

test("AC-08 E2 / AC-09-3 DEV-320: lost committed deposit + edited checkout recovers the original reservation", async ({ page, request }) => {
  test.setTimeout(120_000);
  const token = await apiLogin(request, "u-minji", "consumer");
  const before = new Set((await consumerOrders(request, token)).map((order) => order.orderId));
  await filledCheckout(page);

  let lostOrderId = "";
  let dropped = false;
  let finishDrop!: () => void;
  const didDrop = new Promise<void>((resolve) => { finishDrop = resolve; });
  await page.route(/\/api\/orders\/[^/]+\/deposit$/, async (route) => {
    if (dropped || route.request().method() !== "POST") return route.continue();
    dropped = true;
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBeTruthy();
    const committed = await response.json();
    expect(committed.status).toBe("AWAITING_DEPOSIT");
    lostOrderId = committed.orderId;
    // The actual FastAPI transaction committed. Only its browser response is lost.
    await route.abort("failed");
    finishDrop();
  });

  const reserve = page.getByRole("button", { name: /^[\d,]+원 예약하기$/ });
  await reserve.click();
  await didDrop;
  await expect(recovery(page)).toBeEnabled();
  expect(lostOrderId).not.toBe("");
  const committed = (await consumerOrders(request, token)).filter((order) => !before.has(order.orderId));
  expect(committed.filter((order) => order.status === "AWAITING_DEPOSIT").map((order) => order.orderId)).toEqual([lostOrderId]);

  // Real editable input changes the order body while keeping this checkout's key.
  await page.getByLabel("배송 메모", { exact: true }).fill("연결 복구 뒤 바꾼 메모");
  await recovery(page).click();
  // Recovery may open the original guide directly or offer its existing button.
  await expect.poll(async () =>
    /\/pay(?:\?|$)/.test(page.url()) ||
    await page.getByRole("button", { name: "입금 안내 보기", exact: true }).isVisible(),
  ).toBeTruthy();

  const after = (await consumerOrders(request, token)).filter((order) => !before.has(order.orderId));
  const awaiting = after.filter((order) => order.status === "AWAITING_DEPOSIT");
  expect(awaiting.map((order) => order.orderId), "edited retry must not create another stock-holding order").toEqual([lostOrderId]);
  expect(awaiting.reduce((sum, order) => sum + order.quantity, 0)).toBe(1);
});

test("AC-09-3 DEV-320: repeated lost responses preserve the original deposit key and recovery ignores new consent edits", async ({ page, request }) => {
  test.setTimeout(120_000);
  const token = await apiLogin(request, "u-minji", "consumer");
  const before = new Set((await consumerOrders(request, token)).map((order) => order.orderId));
  await filledCheckout(page);
  const calls = checkoutRequests(page);
  let losses = 0;
  let originalId = "";
  await page.route(/\/api\/orders\/[^/]+\/deposit$/, async (route) => {
    if (losses >= 2) return route.continue();
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBeTruthy();
    const order = await response.json();
    expect(order.status).toBe("AWAITING_DEPOSIT");
    originalId ||= order.orderId;
    expect(order.orderId).toBe(originalId);
    losses++;
    await route.abort("failed");
  });

  await page.getByRole("button", { name: /^[\d,]+원 예약하기$/ }).click();
  await expect.poll(() => losses).toBe(1);
  await expect(recovery(page)).toBeEnabled();
  await page.getByLabel("배송 메모", { exact: true }).fill("첫 연결 복구 뒤 수정");
  await recovery(page).click();
  await expect.poll(() => losses).toBe(2);
  await expect(recovery(page)).toBeEnabled();
  expect(calls.creates).toHaveLength(1);
  expect(calls.deposits).toHaveLength(2);

  await page.getByLabel("배송 메모", { exact: true }).fill("두 번째 연결 복구 뒤 수정");
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
  await expect(page.getByRole("checkbox", { name: "모두 동의해요" })).not.toBeChecked();
  await expect(recovery(page), "recovering an already submitted reservation must remain reachable").toBeEnabled();
  await recovery(page).click();
  await recoveredGuide(page, originalId);

  expect(calls.creates).toHaveLength(1);
  expect(calls.deposits).toHaveLength(3);
  expect(calls.deposits[0].key).toBeTruthy();
  expect(new Set(calls.deposits.map((call) => call.key)).size).toBe(1);
  expect(new Set(calls.deposits.map((call) => call.url)).size).toBe(1);
  const awaiting = (await consumerOrders(request, token)).filter((order) => !before.has(order.orderId) && order.status === "AWAITING_DEPOSIT");
  expect(awaiting.map((order) => order.orderId)).toEqual([originalId]);
  const original = await getOrder(request, token, originalId);
  expect(original.deliveryNote).toBe("처음 보낸 메모");
  expect(original.quantity).toBe(1);
});

test("AC-09-3 DEV-320: request lost before deposit reaches the server replays the original order after edits", async ({ page, request }) => {
  test.setTimeout(120_000);
  const token = await apiLogin(request, "u-minji", "consumer");
  const before = new Set((await consumerOrders(request, token)).map((order) => order.orderId));
  await filledCheckout(page);
  const calls = checkoutRequests(page);
  let originalId = "";
  await page.route(/\/api\/orders\/[^/]+\/deposit$/, async (route) => {
    if (originalId) return route.continue();
    originalId = new URL(route.request().url()).pathname.split("/")[3];
    // Deliberately no route.fetch: the original deposit did not run at all.
    await route.abort("failed");
  });
  await page.getByRole("button", { name: /^[\d,]+원 예약하기$/ }).click();
  await expect(recovery(page)).toBeEnabled();
  expect((await getOrder(request, token, originalId)).status).toBe("PENDING_PAYMENT");
  expect((await consumerOrders(request, token)).filter((order) => !before.has(order.orderId))).toEqual([]);
  await page.getByLabel("배송 메모", { exact: true }).fill("서버에 닿기 전 실패 후 수정");
  await recovery(page).click();
  await recoveredGuide(page, originalId);

  expect(calls.creates).toHaveLength(1);
  expect(calls.deposits).toHaveLength(2);
  expect(calls.deposits[0]).toEqual(calls.deposits[1]);
  expect((await getOrder(request, token, originalId)).status).toBe("AWAITING_DEPOSIT");
  const awaiting = (await consumerOrders(request, token)).filter((order) => !before.has(order.orderId) && order.status === "AWAITING_DEPOSIT");
  expect(awaiting.map((order) => order.orderId)).toEqual([originalId]);
});

test("AC-08-8 DEV-320: definitive deposit price conflict permits a corrected reservation with new keys", async ({ page, request }) => {
  test.setTimeout(120_000);
  const token = await apiLogin(request, "u-minji", "consumer");
  const before = new Set((await consumerOrders(request, token)).map((order) => order.orderId));
  await filledCheckout(page);
  const calls = checkoutRequests(page);
  let rejectedId = "";
  await page.route(/\/api\/orders\/[^/]+\/deposit$/, async (route) => {
    if (rejectedId) return route.continue();
    rejectedId = new URL(route.request().url()).pathname.split("/")[3];
    // The create already returned 29,000; change the actual allowed producer
    // price before FastAPI handles the deposit. This is a real409, not a stub.
    await setStagePrice(request, 30000);
    const response = await route.fetch();
    expect(response.status(), await response.text()).toBe(409);
    expect((await response.json()).details.reason).toBe("STAGE_CHANGED");
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: /^[\d,]+원 예약하기$/ }).click();
    await expect(page.getByText("가격이 바뀌었어요", { exact: true })).toBeVisible();
    expect((await getOrder(request, token, rejectedId)).status).toBe("PENDING_PAYMENT");
    expect((await consumerOrders(request, token)).filter((order) => !before.has(order.orderId))).toEqual([]);
    await page.getByLabel("배송 메모", { exact: true }).fill("새 금액 확인 후 수정");
    await page.getByRole("button", { name: "바뀐 금액으로 예약하기", exact: true }).click();
    await expect(page).toHaveURL(/\/pay(?:\?|$)/);
    expect(calls.creates).toHaveLength(2);
    expect(new Set(calls.creates).size).toBe(2);
    expect(calls.deposits).toHaveLength(2);
    expect(calls.deposits[0].key).not.toBe(calls.deposits[1].key);
    const awaiting = (await consumerOrders(request, token)).filter((order) => !before.has(order.orderId) && order.status === "AWAITING_DEPOSIT");
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0].orderId).not.toBe(rejectedId);
    expect(awaiting[0].unitPrice).toBe(30000);
    expect((await getOrder(request, token, awaiting[0].orderId)).deliveryNote).toBe("새 금액 확인 후 수정");
    expect((await getOrder(request, token, rejectedId)).status).toBe("PENDING_PAYMENT");
  } finally {
    await setStagePrice(request, 29000);
  }
});
