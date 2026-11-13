// DEV-318: real-server recovery at the consumer order boundary. Only the failed
// inquiry read and the deliberately delayed poll below are intercepted.
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer, monitor } from "./helpers";

type Order = {
  orderId: string;
  orderNo: string;
  status: string;
  depositReportedAt: string | null;
  depositIssue: string | null;
};
type Auth = { Authorization: string };

async function consumerAuth(request: APIRequestContext): Promise<Auth> {
  return { Authorization: `Bearer ${await apiLogin(request, "u-minji", "consumer")}` };
}
async function producerAuth(request: APIRequestContext): Promise<Auth> {
  return { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
}
async function post(
  request: APIRequestContext,
  url: string,
  headers: Auth,
  data: object = {},
) {
  const response = await request.post(`${apiUrl}${url}`, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), `${url}: ${await response.text()}`).toBeTruthy();
  return response;
}
async function depositOrder(request: APIRequestContext) {
  const headers = await consumerAuth(request);
  const created = await post(request, "/api/orders", headers, {
    productId: "p-house", optionId: "opt-5", quantity: 1,
    recipientName: "DEV318 합성 구매자", recipientPhone: "010-1234-5678",
    postalCode: "63584", address: "제주특별자치도 서귀포시 통합로 1",
    addressDetail: "101호",
    consents: {
      deliveryWindow: true, delayRefund: true, shortage: true,
      cancelPolicy: true, thirdParty: true,
    },
    consentVersion: "dev318",
  });
  const order = await created.json() as Order;
  await post(request, `/api/orders/${order.orderId}/deposit`, headers);
  return { ...order, headers };
}
async function readOrder(request: APIRequestContext, orderId: string, headers: Auth) {
  const response = await request.get(`${apiUrl}/api/orders/${orderId}`, { headers });
  expect(response.ok(), await response.text()).toBeTruthy();
  return await response.json() as Order;
}
async function openDetail(page: Page, orderId: string) {
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/orders/${orderId}`);
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("DEV-318 AC-09-9/10: re-reporting a rejected deposit shows the farm's turn in detail and list", async ({ page, request }) => {
  const clean = monitor(page);
  const order = await depositOrder(request);
  const producer = await producerAuth(request);
  await post(request, `/api/orders/${order.orderId}/deposit-reported`, order.headers);
  const reason = `DEV318 통장 표시 확인 ${order.orderNo}`;
  await post(request, `/api/orders/${order.orderId}/reject-deposit`, producer, { reason, cancel: false });
  const rejected = await readOrder(request, order.orderId, order.headers);
  expect(rejected.depositIssue).toBe(reason);
  expect(rejected.depositReportedAt).toBeNull();

  await openDetail(page, order.orderId);
  await expect(page.getByText("농가가 입금을 확인하지 못했어요", { exact: true })).toBeVisible();
  await expect(page.getByText(`사유 · ${reason}`, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "입금을 마쳤어요", exact: true }).click();
  await expect(page.getByRole("heading", { name: "입금 확인 중", exact: true })).toBeVisible();
  await expect(page.getByText(/에 입금했다고 알려 주셨어요/)).toBeVisible();
  await expect(page.getByText("농가가 입금을 확인하지 못했어요", { exact: true })).toHaveCount(0);
  await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
  await expect(page.getByText(/까지 입금해 주세요/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "입금을 마쳤어요", exact: true })).toHaveCount(0);

  // The server deliberately retains history; the UI must derive the current turn.
  const reported = await readOrder(request, order.orderId, order.headers);
  expect(reported.depositIssue).toBe(reason);
  expect(reported.depositReportedAt).toBeTruthy();
  await page.goto(`${consumerUrl}/orders?filter=pending`);
  const row = page.getByRole("link").filter({ hasText: order.orderNo });
  await expect(row.getByText("입금 확인 중 · 농가가 확인하고 있어요", { exact: true })).toBeVisible();
  await expect(row.getByText(/입금 확인 안 됨|입금해 주세요|사유를 봐 주세요/)).toHaveCount(0);
  clean();
});

test("DEV-318 AC-10-9: an open order detail updates when its producer confirms the deposit", async ({ page, request }) => {
  const clean = monitor(page);
  const order = await depositOrder(request);
  await post(request, `/api/orders/${order.orderId}/deposit-reported`, order.headers);
  await openDetail(page, order.orderId);
  await expect(page.getByRole("heading", { name: "입금 확인 중", exact: true })).toBeVisible();

  // A separate actor changes the real order while this exact screen stays open.
  await post(request, `/api/orders/${order.orderId}/confirm-deposit`, await producerAuth(request));
  await expect(page.getByRole("heading", { name: "예약 완료", exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText(/에 입금했다고 알려 주셨어요/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상품 문제 문의 · 사진 첨부", exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${consumerUrl}/orders/${order.orderId}`);
  clean();
});

test("DEV-318 AC-33-5: inquiry load retry retains description, type and photo and sends once", async ({ page, request }) => {
  // This test intentionally returns HTTP400 once, never a server failure.
  const clean = monitor(page, [/Failed to load resource.*400/]);
  const order = await depositOrder(request);
  await post(request, `/api/orders/${order.orderId}/confirm-deposit`, await producerAuth(request));
  await loginConsumer(page);
  let reads = 0;
  await page.route(`${apiUrl}/api/orders/${order.orderId}`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    reads++;
    if (reads === 1) return route.fulfill({
      status: 400, contentType: "application/json",
      body: JSON.stringify({ code: "INVALID_REQUEST", message: "DEV318 일시적인 조회 실패", details: {} }),
    });
    return route.continue();
  });
  await page.goto(`${consumerUrl}/orders/${order.orderId}/inquiry`);
  const retry = page.getByRole("button", { name: "다시 시도", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByText("주문 불러오는 중…", { exact: true })).toHaveCount(0);
  const draft = `DEV318 문의 복구 ${order.orderNo}`;
  const description = page.getByRole("textbox", { name: "어떤 점이 불편하셨나요?", exact: true });
  await description.fill(draft);
  await page.getByRole("tab", { name: "맛", exact: true }).click();
  await page.getByLabel("비공개 사진 첨부", { exact: true }).setInputFiles(
    path.join(process.cwd(), "packages/ui/assets/source/icons/send.png"),
  );
  await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true })).toBeVisible();
  const send = page.getByRole("button", { name: "농가에 문의 보내기", exact: true });
  await expect(send).toBeDisabled();
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(send).toBeEnabled();
  expect(reads).toBe(2);
  await expect(description).toHaveValue(draft);
  await expect(page.getByRole("tab", { name: "맛", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true })).toBeVisible();
  const sent = page.waitForResponse(response => response.request().method() === "POST" &&
    new URL(response.url()).pathname === `/api/orders/${order.orderId}/inquiries`);
  await send.click();
  const response = await sent;
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(response.request().postDataJSON()).toMatchObject({ type: "TASTE", text: draft });
  expect(response.request().postDataJSON().attachmentIds).toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`/chats/f-kang\\?orderId=${order.orderId}`));
  const inquiries = await request.get(`${apiUrl}/api/orders/${order.orderId}/inquiries`, { headers: order.headers });
  expect(inquiries.ok(), await inquiries.text()).toBeTruthy();
  expect((await inquiries.json()).items).toHaveLength(1);
  clean();
});

test("DEV-318 AC-10-9: an old poll response cannot undo a successful deposit report", async ({ page, request }) => {
  const clean = monitor(page);
  const order = await depositOrder(request);
  await openDetail(page, order.orderId);
  await expect(page.getByRole("heading", { name: "입금 대기", exact: true })).toBeVisible();
  const captured = deferred(), release = deferred();
  let held = false;
  await page.route(`${apiUrl}/api/orders/${order.orderId}`, async route => {
    if (route.request().method() !== "GET" || held) return route.continue();
    held = true;
    const oldResponse = await route.fetch();
    expect(oldResponse.ok()).toBeTruthy();
    expect((await oldResponse.json()).depositReportedAt).toBeNull();
    captured.resolve();
    await release.promise;
    await route.fulfill({ response: oldResponse, headers: {
      ...oldResponse.headers(), "x-dev318-delayed-poll": "1",
    } });
  });
  let pollTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Wait for the real eight-second polling cycle, without replacing its data.
    await Promise.race([
      captured.promise,
      new Promise<never>((_, reject) => {
        pollTimeout = setTimeout(() => reject(new Error("No active detail poll within 12 seconds")), 12_000);
      }),
    ]);
    clearTimeout(pollTimeout);
    const reported = page.waitForResponse(response => response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/orders/${order.orderId}/deposit-reported`);
    await page.getByRole("button", { name: "입금을 마쳤어요", exact: true }).click();
    expect((await reported).ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "입금 확인 중", exact: true })).toBeVisible();
    const staleDelivered = page.waitForResponse(response => response.headers()["x-dev318-delayed-poll"] === "1");
    release.resolve();
    await staleDelivered;
    // Allow the old promise and React paint to finish, well before the next poll.
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await expect(page.getByRole("heading", { name: "입금 확인 중", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "입금 대기", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "입금을 마쳤어요", exact: true })).toHaveCount(0);
    clean();
  } finally {
    clearTimeout(pollTimeout);
    release.resolve();
  }
});

test("DEV-318 AC-10-9: returning to detail refreshes even while the previous visit's GET is stalled", async ({ page, request }) => {
  const clean = monitor(page);
  const order = await depositOrder(request);
  await post(request, `/api/orders/${order.orderId}/deposit-reported`, order.headers);
  await openDetail(page, order.orderId);
  await expect(page.getByRole("heading", { name: "입금 확인 중", exact: true })).toBeVisible();

  const captured = deferred(), release = deferred();
  let held = false, released = false, freshReads = 0;
  let pollTimeout: ReturnType<typeof setTimeout> | undefined;
  await page.route(`${apiUrl}/api/orders/${order.orderId}`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    if (held) {
      freshReads++;
      return route.continue();
    }
    held = true;
    // Fetch the real pre-confirmation state, then keep this visit's promise open.
    const oldResponse = await route.fetch();
    expect(oldResponse.ok()).toBeTruthy();
    expect((await oldResponse.json()).status).toBe("AWAITING_DEPOSIT");
    captured.resolve();
    await release.promise;
    await route.fulfill({ response: oldResponse, headers: {
      ...oldResponse.headers(), "x-dev318-previous-visit": "1",
    } });
  });
  try {
    await Promise.race([
      captured.promise,
      new Promise<never>((_, reject) => {
        pollTimeout = setTimeout(() => reject(new Error("No active detail poll within 12 seconds")), 12_000);
      }),
    ]);
    clearTimeout(pollTimeout);
    // Actual in-app navigation blurs the retained detail; no visibility or data
    // mocks are involved. An unpaid reported order uses the general chat entry.
    await page.getByRole("button", { name: "농가에 물어보기", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/chats/f-kang\\?`));
    await expect(page.getByRole("button", { name: "뒤로", exact: true })).toBeVisible();
    await post(request, `/api/orders/${order.orderId}/confirm-deposit`, await producerAuth(request));
    expect(freshReads).toBe(0);

    await page.getByRole("button", { name: "뒤로", exact: true }).click();
    await expect(page).toHaveURL(`${consumerUrl}/orders/${order.orderId}`);
    await expect(page.getByRole("heading", { name: "예약 완료", exact: true })).toBeVisible({ timeout: 5000 });
    expect(freshReads).toBeGreaterThan(0);
    expect(released, "the new visit must refresh without waiting for the old GET").toBe(false);

    const staleDelivered = page.waitForResponse(response => response.headers()["x-dev318-previous-visit"] === "1");
    released = true;
    release.resolve();
    await staleDelivered;
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await expect(page.getByRole("heading", { name: "예약 완료", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "입금 확인 중", exact: true })).toHaveCount(0);
    clean();
  } finally {
    clearTimeout(pollTimeout);
    // Never leave a route waiting when an assertion fails or the page closes.
    release.resolve();
  }
});
