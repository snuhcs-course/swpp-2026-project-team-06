import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer } from "./helpers";
import type { APIRequestContext } from "@playwright/test";

const root = process.cwd();
function fixture(command: string, data: unknown = {}) {
  return JSON.parse(execFileSync(path.join(root, "server/.venv/bin/python"), [
    path.join(root, "scripts/e2e/chat-regression-fixture.py"), command, JSON.stringify(data),
  ], { cwd: path.join(root, "server"), encoding: "utf8",
    env: { ...process.env, FARMCLUB_CHAT_REGRESSION: "1" } }));
}
let original: unknown;
test.beforeEach(() => {
  original = undefined;
  original = fixture("begin");
  expect((original as any).state.threadId).toBeNull();
  expect((original as any).state.following).toBe(false);
});
test.afterEach(() => { if (original) fixture("finish", original); });

async function createOrder(request: APIRequestContext, paid = true) {
  const token = await apiLogin(request, "u-seojun", "consumer");
  const headers = { Authorization: `Bearer ${token}` };
  const mutation = () => ({ ...headers, "Idempotency-Key": crypto.randomUUID() });
  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: mutation(), data: {
      productId: "p-noji", optionId: "opt-10", quantity: 1,
      recipientName: "DEV248 synthetic buyer", recipientPhone: "010-1234-5678",
      postalCode: "63584", address: "제주특별자치도 서귀포시 통합로 1",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "dev248",
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const order = await created.json();
  const deposit = await request.post(`${apiUrl}/api/orders/${order.orderId}/deposit`, {
    headers: mutation(), data: {},
  });
  expect(deposit.ok(), await deposit.text()).toBeTruthy();
  if (paid) {
    const admin = process.env.FARMCLUB_ADMIN_TOKEN;
    expect(admin, "standard isolated integration admin fixture").toBeTruthy();
    const confirmed = await request.post(`${apiUrl}/admin/orders/${order.orderId}/confirm-deposit`, {
      headers: { Authorization: `Bearer ${admin}`, "Idempotency-Key": crypto.randomUUID() }, data: {},
    });
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  }
  return { orderId: order.orderId as string, headers, mutation };
}

for (const width of [390, 360]) {
  test(`AC-33-2 DEV-248: first paid-order inline entry initializes and sends without following at ${width}px`,
    async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: 844 });
      const order = await createOrder(request);
      expect((await request.get(`${apiUrl}/api/messaging/chats/f-halla/messages`, {
        headers: order.headers,
      })).status()).toBe(404);
      await loginConsumer(page, "이서준");
      const events: string[] = [];
      page.on("request", r => {
        if (new URL(r.url()).pathname === "/api/messaging/chats" && r.method() === "POST") events.push("start");
        if (new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages" && r.method() === "GET") events.push("messages");
      });
      await page.goto(`${consumerUrl}/orders/${order.orderId}`);
      await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
      await expect(page).toHaveURL(new RegExp(`orderId=${order.orderId}`));
      const composer = page.getByRole("textbox", { name: "메시지", exact: true });
      await expect(composer).toBeEditable();
      await expect(page.getByText(/문의할 주문 ·/)).toBeVisible();
      expect(events[0]).toBe("start");
      const text = `DEV248 first paid message ${width}`;
      await composer.fill(text);
      const sent = page.waitForResponse(r =>
        r.request().method() === "POST" && new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages");
      await page.getByRole("button", { name: "전송", exact: true }).click();
      expect((await sent).ok()).toBeTruthy();
      await expect(page.getByText(text, { exact: true })).toHaveCount(1);
      const state = fixture("inspect");
      expect(state.following).toBe(false);
      expect(state.contexts).toEqual([order.orderId]);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].orderId).toBe(order.orderId);
      expect(state.inquiryCount).toBe(0); expect(state.escalationCount).toBe(0);
      await page.reload();
      await expect(page.getByText(text, { exact: true })).toHaveCount(1);
      await page.screenshot({ path: info.outputPath(`paid-order-${width}.png`) });
    });
}

test("AC-33-2 DEV-248: paid cancellation/refund-pending bottom-bar entry retains no-follow eligibility",
  async ({ page, request }) => {
    const order = await createOrder(request);
    const canceled = await request.post(`${apiUrl}/api/orders/${order.orderId}/cancel`, { headers: order.headers });
    expect(canceled.ok(), await canceled.text()).toBeTruthy();
    await loginConsumer(page, "이서준");
    await page.goto(`${consumerUrl}/orders/${order.orderId}`);
    await expect(page.getByRole("heading", { name: "환불 대기", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    expect(fixture("inspect").following).toBe(false);
    expect(fixture("inspect").contexts).toEqual([order.orderId]);
  });

test("M-04 DEV-248: unpaid deposit-reported entry uses general follow chat",
  async ({ page, request }) => {
    const order = await createOrder(request, false);
    const reported = await request.post(`${apiUrl}/api/orders/${order.orderId}/deposit-reported`, {
      headers: order.mutation(), data: {},
    });
    expect(reported.ok(), await reported.text()).toBeTruthy();
    await loginConsumer(page, "이서준");
    await page.goto(`${consumerUrl}/orders/${order.orderId}`);
    const starting = page.waitForRequest(r =>
      r.method() === "POST" && new URL(r.url()).pathname === "/api/messaging/chats");
    await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
    expect((await starting).postDataJSON()).toEqual({ farmId: "f-halla" });
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    await expect(page.getByText(/팔로우하고 대화를 시작해요/)).toBeVisible();
    const state = fixture("inspect");
    expect(state.following).toBe(true); expect(state.contexts).toEqual([]);
  });

test("AC-33-2 DEV-248: lost start/send responses retry the same keys and persist once",
  async ({ page, request }) => {
    const order = await createOrder(request);
    const startKeys: string[] = [], sendKeys: string[] = [];
    let loseStart = true, loseSend = true;
    await page.route("**/api/messaging/chats", async route => {
      if (route.request().method() !== "POST") return route.continue();
      startKeys.push(route.request().headers()["idempotency-key"]);
      if (loseStart) {
        loseStart = false;
        const committed = await route.fetch();
        expect(committed.ok()).toBeTruthy();
        return route.abort("failed");
      }
      return route.continue();
    });
    await page.route("**/api/messaging/chats/f-halla/messages", async route => {
      if (route.request().method() !== "POST") return route.continue();
      sendKeys.push(route.request().headers()["idempotency-key"]);
      if (loseSend) {
        loseSend = false;
        const committed = await route.fetch();
        expect(committed.ok()).toBeTruthy();
        return route.abort("failed");
      }
      return route.continue();
    });
    await loginConsumer(page, "이서준");
    await page.goto(`${consumerUrl}/orders/${order.orderId}`);
    await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
    await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    const composer = page.getByRole("textbox", { name: "메시지", exact: true });
    await expect(composer).toBeEditable();
    expect(startKeys).toHaveLength(2); expect(startKeys[0]).toBe(startKeys[1]);
    await composer.fill("DEV248 lost response");
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(page.getByRole("button", { name: "다시 보내기", exact: true })).toBeVisible();
    await expect(composer).toHaveValue("DEV248 lost response");
    await page.getByRole("button", { name: "다시 보내기", exact: true }).click();
    await expect(composer).toHaveValue("");
    expect(sendKeys).toHaveLength(2); expect(sendKeys[0]).toBe(sendKeys[1]);
    const state = fixture("inspect");
    expect(state.messages).toHaveLength(1); expect(state.contexts).toHaveLength(1);
    expect(state.following).toBe(false);
  });


test("AC-33-2 DEV-248: legacy order link initializes the same authorized context",
  async ({ page, request }) => {
    const order = await createOrder(request);
    await loginConsumer(page, "이서준");
    await page.goto(`${consumerUrl}/chats/f-halla?from=order&fromOrder=${order.orderId}`);
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    const first = fixture("inspect");
    expect(first.contexts).toEqual([order.orderId]); expect(first.following).toBe(false);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    expect(fixture("inspect").threadId).toBe(first.threadId);
  });

test("AC-33-4 DEV-248: first order photo-only message binds to the selected order",
  async ({ page, request }, info) => {
    const order = await createOrder(request);
    await loginConsumer(page, "이서준");
    await page.goto(`${consumerUrl}/orders/${order.orderId}`);
    await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    await page.getByRole("button", { name: "사진 첨부", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "dev248.png", mimeType: "image/png",
      buffer: Buffer.from(fixture("image").base64, "base64"),
    });
    await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "전송", exact: true })).toBeEnabled();
    const sent = page.waitForResponse(r => r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages");
    await page.getByRole("button", { name: "전송", exact: true }).click();
    const response = await sent; expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.message.orderId).toBe(order.orderId);
    expect(body.message.attachmentIds).toHaveLength(1);
    expect(fixture("inspect").following).toBe(false);
    await page.screenshot({ path: info.outputPath("paid-order-photo.png") });
  });

test("AC-33-2 DEV-248: multiple order selection retains text and clears prior-order photos",
  async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const first = await createOrder(request), second = await createOrder(request);
    await loginConsumer(page, "이서준");
    for (const order of [first, second]) {
      await page.goto(`${consumerUrl}/orders/${order.orderId}`);
      await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
      await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    }
    const composer = page.getByRole("textbox", { name: "메시지", exact: true });
    await composer.fill("DEV248 changed order draft");
    await page.getByRole("button", { name: "사진 첨부", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "dev248.png", mimeType: "image/png",
      buffer: Buffer.from(fixture("image").base64, "base64"),
    });
    await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "주문 바꾸기", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "주문 바꾸기", exact: true }).click();
    await page.screenshot({ path: info.outputPath("order-selection-sheet.png") });
    await page.getByRole("button", { name: new RegExp("주문 " + first.orderId) }).click();
    await expect(composer).toHaveValue("DEV248 changed order draft");
    await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true })).toHaveCount(0);
    await expect(page.getByText(/사진을 다시 첨부해 주세요/)).toBeVisible();
    const sent = page.waitForResponse(r => r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages");
    await page.getByRole("button", { name: "전송", exact: true }).click();
    const response = await sent;
    expect(response.ok()).toBeTruthy();
    expect(response.request().postDataJSON().orderId).toBe(first.orderId);
    expect(response.request().postDataJSON().attachmentIds).toEqual([]);
  });

test("AC-12-1 DEV-248: a foreign order fails visibly without polling or creating a conversation",
  async ({ page }) => {
    await loginConsumer(page, "이서준");
    let starts = 0, pages = 0;
    page.on("request", request => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/api/messaging/chats") starts++;
      if (request.method() === "GET" && url.pathname === "/api/messaging/chats/f-halla/messages") pages++;
    });
    // Seed o-11 belongs to Minji; another paid order never grants this order's context.
    await page.goto(`${consumerUrl}/chats/f-halla?start=1&orderId=o-11&from=order&fromOrder=o-11`);
    await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toHaveCount(0);
    // Observe two polling intervals; this is an absence check, not layout synchronization.
    await page.waitForTimeout(4200);
    expect(starts).toBe(1); expect(pages).toBe(0);
    const state = fixture("inspect");
    expect(state.threadId).toBeNull(); expect(state.following).toBe(false);
  });
