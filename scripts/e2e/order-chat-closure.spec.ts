import { expect, test } from "./fixtures";
import type { Request } from "@playwright/test";
import { apiLogin, apiUrl, consumerUrl, loginConsumer } from "./helpers";
import {
  attachChatPhoto, chatFixture, expectDenied, expectEmptyChat, openPaidChat,
  openPrivateListChat, paidChatOrder, type FixtureStart,
} from "./chat-regression";

test.use({ viewport: { width: 390, height: 844 } });
let original: FixtureStart | undefined;
test.beforeEach(() => {
  original = undefined;
  original = chatFixture<FixtureStart>("begin");
  expectEmptyChat(original.state);
});
test.afterEach(() => { if (original) chatFixture("finish", original); });

test("AC-33-2 DEV-249 C01: paid chat survives back, private-list re-entry, reload and relogin without follow",
  async ({ page, request }, info) => {
    const order = await paidChatOrder(request);
    await loginConsumer(page, "이서준");
    await openPaidChat(page, order.orderId);
    const started = chatFixture("inspect");
    expect(started.contexts).toEqual([order.orderId]);
    expect(started.messages).toEqual([]);
    expect(started.inquiryCount).toBe(0); expect(started.escalationCount).toBe(0);
    expect(started.aiMode).toBe("AUTO"); expect(started.version).toBe(1);
    expect(started.following).toBe(false);
    const composer = page.getByRole("textbox", { name: "메시지", exact: true });
    const text = "DEV249 C01 private-list history";
    await composer.fill(text);
    const sending = page.waitForResponse(r => r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages");
    await page.getByRole("button", { name: "전송", exact: true }).click();
    const sent = await sending;
    expect(sent.ok(), await sent.text()).toBeTruthy();
    expect((await sent.json()).reply).toBeNull();
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/orders/${order.orderId}$`));
    await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
    await openPrivateListChat(page);
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
    await expect(page.getByText(new RegExp(`문의할 주문 ·.*${order.orderId}`))).toBeVisible();
    await page.reload();
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
    await page.goto(`${consumerUrl}/me`);
    await page.getByText("로그아웃", { exact: true }).click();
    await expect(page).not.toHaveURL(/\/me$/);
    await loginConsumer(page, "이서준");
    await openPrivateListChat(page);
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
    const final = chatFixture("inspect");
    expect(final.threadId).toBe(started.threadId);
    expect(final.contexts).toEqual([order.orderId]);
    expect(final.messages).toHaveLength(1);
    expect(final.messages[0].orderId).toBe(order.orderId);
    expect(final.following).toBe(false);
    expect(final.inquiryCount).toBe(0); expect(final.escalationCount).toBe(0);
    expect(final.aiMode).toBe("AUTO"); expect(final.version).toBe(1);
    await page.screenshot({ path: info.outputPath("C01-relogin-same-private-thread.png") });
  });

test("AC-33-2 DEV-249 C02: private-list re-entry with two paid contexts requires explicit selection at 360px",
  async ({ page, request }, info) => {
    await page.setViewportSize({ width: 360, height: 844 });
    const first = await paidChatOrder(request), second = await paidChatOrder(request);
    await loginConsumer(page, "이서준");
    await openPaidChat(page, first.orderId);
    const threadId = chatFixture("inspect").threadId;
    await openPaidChat(page, second.orderId);
    await openPrivateListChat(page);
    await expect(page.getByText("문의할 주문을 선택해 주세요.", { exact: true })).toBeVisible();
    const composer = page.getByRole("textbox", { name: "메시지", exact: true });
    await expect(composer).not.toBeEditable();
    await expect(page.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
    expect(chatFixture("inspect").messages).toEqual([]);
    await page.getByRole("button", { name: "주문 선택", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^주문 ${first.orderId} ·`) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^주문 ${second.orderId} ·`) })).toBeVisible();
    await page.screenshot({ path: info.outputPath("C02-explicit-order-choice-360.png") });
    await page.getByRole("button", { name: new RegExp(`^주문 ${first.orderId} ·`) }).click();
    await expect(composer).toBeEditable();
    await composer.fill("DEV249 C02 deliberate first-order choice");
    const sending = page.waitForResponse(r => r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages");
    await page.getByRole("button", { name: "전송", exact: true }).click();
    const sent = await sending;
    expect(sent.ok(), await sent.text()).toBeTruthy();
    expect(sent.request().postDataJSON().orderId).toBe(first.orderId);
    await expect(composer).toHaveValue("");
    const state = chatFixture("inspect");
    expect(state.threadId).toBe(threadId);
    expect(new Set(state.contexts)).toEqual(new Set([first.orderId, second.orderId]));
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].orderId).toBe(first.orderId);
    expect(state.following).toBe(false);
    // A fresh list entry must not infer a choice from the latest message or context ordering.
    await openPrivateListChat(page);
    await expect(page.getByText("문의할 주문을 선택해 주세요.", { exact: true })).toBeVisible();
    await expect(composer).not.toBeEditable();
  });

test("AC-33-2/4 DEV-249 C03: lost text-and-photo send response retains one attachment and retries the exact body once",
  async ({ page, request }, info) => {
    const order = await paidChatOrder(request);
    const attempts: { key: string; body: unknown }[] = [];
    let loseResponse = true;
    await page.route("**/api/messaging/chats/f-halla/messages", async route => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
      if (loseResponse) {
        loseResponse = false;
        const committed = await route.fetch();
        expect(committed.ok(), await committed.text()).toBeTruthy();
        return route.abort("failed");
      }
      return route.continue();
    });
    await loginConsumer(page, "이서준");
    await openPaidChat(page, order.orderId);
    const attachmentId = await attachChatPhoto(page);
    const text = "DEV249 C03 text and private photo";
    const composer = page.getByRole("textbox", { name: "메시지", exact: true });
    await composer.fill(text);
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(page.getByRole("button", { name: "다시 보내기", exact: true })).toBeVisible();
    // A successful timeline poll must not erase an unresolved send failure or its retry key.
    for (let poll = 0; poll < 2; poll++) {
      const response = await page.waitForResponse(r => r.ok() && r.request().method() === "GET" &&
        new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages" &&
        !new URL(r.url()).searchParams.has("cursor"));
      await response.finished();
    }
    await expect(page.getByRole("button", { name: "다시 보내기", exact: true })).toBeVisible();
    await expect(composer).toHaveValue(text);
    await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true }).first()).toBeVisible();
    expect(chatFixture("inspect").messages).toHaveLength(1);
    expect(chatFixture("inspect").attachmentCount).toBe(1);
    await page.screenshot({ path: info.outputPath("C03-committed-response-lost-draft-retained.png") });
    await page.getByRole("button", { name: "다시 보내기", exact: true }).click();
    await expect(composer).toHaveValue("");
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0].key).toBeTruthy();
    expect(attempts[0].body).toEqual({ text, attachmentIds: [attachmentId], orderId: order.orderId });
    const pageResponse = await request.get(`${apiUrl}/api/messaging/chats/f-halla/messages`, { headers: order.headers });
    expect(pageResponse.ok()).toBeTruthy();
    const saved = await pageResponse.json();
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].attachmentIds).toEqual([attachmentId]);
    expect(saved.items[0].orderId).toBe(order.orderId);
    expect((await request.get(`${apiUrl}/api/messaging/attachments/${attachmentId}`, { headers: order.headers })).ok()).toBeTruthy();
    const state = chatFixture("inspect");
    expect(state.attachmentCount).toBe(1); expect(state.messages).toHaveLength(1);
    expect(state.following).toBe(false); expect(state.inquiryCount).toBe(0);
  });

test("AC-12-1/AC-33-2 DEV-249 C04: two-consumer API/cursor/photo and other-farm producer denials leave state unchanged",
  async ({ request }) => {
    const order = await paidChatOrder(request);
    const started = await request.post(`${apiUrl}/api/messaging/chats`, {
      headers: order.mutation(), data: { farmId: "f-halla", orderId: order.orderId },
    });
    expect(started.ok(), await started.text()).toBeTruthy();
    const threadId = chatFixture("inspect").threadId;
    expect(threadId).toBeTruthy();
    const image = Buffer.from(chatFixture<{ base64: string }>("image").base64, "base64");
    const upload = await request.post(`${apiUrl}/api/messaging/attachments`, {
      headers: order.headers, multipart: {
        threadId: threadId!, file: { name: "dev249.png", mimeType: "image/png", buffer: image },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const aid = (await upload.json()).attachmentId as string;
    let messageId = "";
    for (const [index, attachmentIds] of [[1, [aid]], [2, []]] as const) {
      const sent = await request.post(`${apiUrl}/api/messaging/chats/f-halla/messages`, {
        headers: order.mutation(), data: { text: `DEV249 C04 private ${index}`, orderId: order.orderId, attachmentIds },
      });
      expect(sent.ok(), await sent.text()).toBeTruthy();
      messageId = (await sent.json()).message.messageId;
    }
    const firstPage = await request.get(`${apiUrl}/api/messaging/chats/f-halla/messages?limit=1`, { headers: order.headers });
    expect(firstPage.ok()).toBeTruthy();
    const cursor = (await firstPage.json()).nextCursor as string;
    expect(cursor).toBeTruthy();
    const tokenB = await apiLogin(request, "u-minji", "consumer");
    const b = { Authorization: `Bearer ${tokenB}` };
    const bMutation = () => ({ ...b, "Idempotency-Key": crypto.randomUUID() });
    const producerToken = await apiLogin(request, "u-kang", "producer");
    const otherFarm = { Authorization: `Bearer ${producerToken}` };
    const ownPageResponse = await request.get(`${apiUrl}/api/messaging/chats/f-halla/messages`, { headers: b });
    expect(ownPageResponse.ok()).toBeTruthy();
    const bPageBefore = await ownPageResponse.json();
    expect(bPageBefore.thread.threadId).not.toBe(threadId);
    expect(JSON.stringify(bPageBefore)).not.toContain("DEV249 C04");
    expect(JSON.stringify(bPageBefore)).not.toContain(order.orderId);
    const list = await request.get(`${apiUrl}/api/messaging/chats`, { headers: b });
    expect(list.ok()).toBeTruthy();
    expect(JSON.stringify(await list.json())).not.toContain("DEV249 C04");
    const before = chatFixture("inspect");
    await expectDenied(await request.post(`${apiUrl}/api/messaging/chats`, {
      headers: bMutation(), data: { farmId: "f-halla", orderId: order.orderId },
    }));
    await expectDenied(await request.post(`${apiUrl}/api/messaging/chats/f-halla/messages`, {
      headers: bMutation(), data: { text: "DEV249 C04 denied", orderId: order.orderId },
    }));
    const cursorError = await expectDenied(await request.get(
      `${apiUrl}/api/messaging/chats/f-halla/messages?cursor=${encodeURIComponent(cursor)}`, { headers: b },
    ), 400, "VALIDATION_ERROR");
    expect(cursorError.details).toHaveProperty("fields.cursor");
    await expectDenied(await request.put(`${apiUrl}/api/messaging/chats/f-halla/read`, {
      headers: b, data: { lastReadMessageId: messageId },
    }));
    for (const headers of [b, otherFarm]) {
      await expectDenied(await request.get(`${apiUrl}/api/messaging/attachments/${aid}`, { headers }));
      await expectDenied(await request.post(`${apiUrl}/api/messaging/attachments`, {
        headers, multipart: { threadId: threadId!, file: { name: "dev249-denied.png", mimeType: "image/png", buffer: image } },
      }));
      await expectDenied(await request.post(`${apiUrl}/api/messaging/attachments`, {
        headers, multipart: { orderId: order.orderId, file: { name: "dev249-denied.png", mimeType: "image/png", buffer: image } },
      }));
    }
    await expectDenied(await request.post(`${apiUrl}/api/messaging/chats/f-halla/messages`, {
      headers: bMutation(), data: { text: "DEV249 C04 denied binding", attachmentIds: [aid], orderId: "o-11" },
    }));
    await expectDenied(await request.post(`${apiUrl}/api/messaging/producer/chats/u-seojun/messages`, {
      headers: { ...otherFarm, "Idempotency-Key": crypto.randomUUID() },
      data: { text: "DEV249 C04 denied producer binding", attachmentIds: [aid] },
    }));
    expect(chatFixture("inspect")).toEqual(before);
    const bAfter = await request.get(`${apiUrl}/api/messaging/chats/f-halla/messages`, { headers: b });
    expect(bAfter.ok()).toBeTruthy();
    expect(await bAfter.json()).toEqual(bPageBefore);
    const allowed = await request.get(`${apiUrl}/api/messaging/attachments/${aid}`, { headers: order.headers });
    expect(allowed.ok()).toBeTruthy();
  });

test("AC-33-2 DEV-249 C05: a delayed first-order page cannot overwrite the next order after visible back/list navigation",
  async ({ page, request }, info) => {
    const first = await paidChatOrder(request), second = await paidChatOrder(request);
    let captured!: () => void, release!: () => void;
    const firstCaptured = new Promise<void>(resolve => { captured = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    let delayFirstPage = true;
    let oldRequest: Request | undefined;
    await page.route("**/api/messaging/chats/f-halla/messages", async route => {
      if (route.request().method() !== "GET" || !delayFirstPage) return route.continue();
      delayFirstPage = false;
      oldRequest = route.request();
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBeTruthy();
      captured();
      await hold;
      await route.fulfill({ response });
    });
    try {
      await loginConsumer(page, "이서준");
      await page.goto(`${consumerUrl}/orders`);
      await page.getByRole("link").filter({ hasText: first.orderNo }).click();
      await expect(page).toHaveURL(new RegExp(`/orders/${first.orderId}$`));
      await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
      await firstCaptured;
      await expect(page.getByText("대화를 여는 중…", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`/orders/${first.orderId}$`));
      await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
      await expect(page).toHaveURL(/\/orders(?:\?.*)?$/);
      await page.getByRole("link").filter({ hasText: second.orderNo }).click();
      await expect(page).toHaveURL(new RegExp(`/orders/${second.orderId}$`));
      await page.getByRole("button", { name: /^농가에 물어보기(?: ›)?$/ }).click();
      const composer = page.getByRole("textbox", { name: "메시지", exact: true });
      await expect(composer).toBeEditable();
      const selected = page.getByText(new RegExp(`문의할 주문 ·.*${second.orderId}`));
      await expect(selected).toBeVisible();
      const late = page.waitForResponse(r => r.request() === oldRequest);
      release();
      await (await late).finished();
      // Observe the completed response through two rendering frames, with no fixed layout delay.
      await page.evaluate(() => new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(selected).toBeVisible();
      await expect(page.getByText(new RegExp(`문의할 주문 ·.*${first.orderId}`))).toHaveCount(0);
      await composer.fill("DEV249 C05 newer order after delayed page");
      const sending = page.waitForResponse(r => r.request().method() === "POST" &&
        new URL(r.url()).pathname === "/api/messaging/chats/f-halla/messages");
      await page.getByRole("button", { name: "전송", exact: true }).click();
      const sent = await sending;
      expect(sent.ok(), await sent.text()).toBeTruthy();
      expect(sent.request().postDataJSON().orderId).toBe(second.orderId);
      await expect(composer).toHaveValue("");
      const state = chatFixture("inspect");
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].orderId).toBe(second.orderId);
      expect(new Set(state.contexts)).toEqual(new Set([first.orderId, second.orderId]));
      expect(state.following).toBe(false);
      await page.screenshot({ path: info.outputPath("C05-late-old-page-keeps-new-order.png") });
    } finally {
      release();
    }
  });
