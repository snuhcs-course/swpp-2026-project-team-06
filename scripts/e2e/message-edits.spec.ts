import { type Locator } from "@playwright/test";
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, producerUrl } from "./helpers";

const unique = () => crypto.randomUUID().replace(/[0-9]/g, d => String.fromCharCode(97 + Number(d)));

async function seedPrivate(request: APIRequestContext, producer: boolean, text: string) {
  const token = await apiLogin(request, producer ? "u-kang" : "u-minji", producer ? "producer" : "consumer");
  const path = producer ? "/api/messaging/producer/chats/u-minji/messages" : "/api/messaging/chats/f-kang/messages";
  const response = await request.post(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": unique() },
    data: { text },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).message;
}

async function seedNews(request: APIRequestContext, producer: boolean, text: string) {
  const token = await apiLogin(request, producer ? "u-kang" : "u-minji", producer ? "producer" : "consumer");
  const response = await request.post(`${apiUrl}/api/messaging/rooms/f-kang/messages`, {
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": unique() },
    data: { text },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function openEdit(page: Page, target: Locator) {
  await target.click({ button: "right" });
  await page.getByRole("menuitem", { name: "수정", exact: true }).click();
  await expect(page.getByRole("heading", { name: "메시지 수정", exact: true })).toBeVisible();
}

async function saveEdit(page: Page, text: string) {
  await page.getByRole("textbox", { name: "수정할 메시지", exact: true }).fill(text);
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "메시지 수정", exact: true })).toHaveCount(0);
}

async function expectEdited(page: Page, text: string, privateId?: string) {
  const body = page.getByText(text, { exact: true });
  await expect(body).toBeVisible();
  // News has no public row test ID: locate the nearest shared ancestor of its
  // unique body and edit marker, without depending on component/CSS structure.
  const row = privateId
    ? page.getByTestId(`chat-message-${privateId}`)
    : body.locator('xpath=ancestor::*[.//*[normalize-space(.)="수정됨"]][1]');
  const marker = row.getByText("수정됨", { exact: true });
  await expect(marker).toBeVisible();
  await expect(marker).toHaveCSS("font-style", "italic");
  const [bodyBox, markerBox] = await Promise.all([body.boundingBox(), marker.boundingBox()]);
  expect(bodyBox).not.toBeNull();
  expect(markerBox).not.toBeNull();
  expect(markerBox!.y).toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height - 1);
}

async function expectOtherOnlyReply(page: Page, target: Locator) {
  await target.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "답장", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "수정", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
}

for (const producer of [false, true]) {
  test(`DEV-289: ${producer ? "producer" : "consumer"} edits own private message and peer sees persisted italic marker`, async ({ page, request }) => {
    test.setTimeout(120_000);
    const stamp = unique();
    const original = `개인 메시지 원문 ${stamp}`;
    const changed = `개인 메시지 수정 ${stamp}`;
    const message = await seedPrivate(request, producer, original);
    if (producer) await loginProducer(page, "강영수");
    else await loginConsumer(page, "김민지");
    await page.goto(producer ? `${producerUrl}/chats/u-minji` : `${consumerUrl}/chats/f-kang`);
    const row = page.getByTestId(`chat-message-${message.messageId}`);
    await openEdit(page, row);
    await expect(page.getByRole("textbox", { name: "수정할 메시지", exact: true })).toHaveValue(original);
    await saveEdit(page, changed);
    await expectEdited(page, changed, message.messageId);
    await expect(page.getByText(original, { exact: true })).toHaveCount(0);
    await page.reload();
    await expectEdited(page, changed, message.messageId);

    if (producer) await loginConsumer(page, "김민지");
    else await loginProducer(page, "강영수");
    await page.goto(producer ? `${consumerUrl}/chats/f-kang` : `${producerUrl}/chats/u-minji`);
    await expectEdited(page, changed, message.messageId);
    await expectOtherOnlyReply(page, page.getByTestId(`chat-message-${message.messageId}`));
  });
}

for (const producer of [false, true]) {
  test(`DEV-289: ${producer ? "broadcast" : "consumer news reply"} text edit persists for author and authorized reader`, async ({ page, request }) => {
    test.setTimeout(120_000);
    const stamp = unique();
    const original = `소식방 원문 ${stamp}`;
    const changed = `소식방 수정 ${stamp}`;
    await seedNews(request, producer, original);
    if (producer) await loginProducer(page, "강영수");
    else await loginConsumer(page, "김민지");
    await page.goto(producer ? `${producerUrl}/chats` : `${consumerUrl}/news/f-kang`);
    await openEdit(page, page.getByText(original, { exact: true }));
    await saveEdit(page, changed);
    await expectEdited(page, changed);
    await page.reload();
    await expectEdited(page, changed);

    if (producer) await loginConsumer(page, "김민지");
    else await loginProducer(page, "강영수");
    await page.goto(producer ? `${consumerUrl}/news/f-kang` : `${producerUrl}/chats`);
    await expectEdited(page, changed);
    await page.getByText(changed, { exact: true }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "수정", exact: true })).toHaveCount(0);
    if (!producer) {
      // A farmer answers a consumer newsroom reply through the existing private-chat entry.
      await expect(page.getByRole("menuitem", { name: "1:1 채팅", exact: true })).toBeVisible();
    } else {
      // Consumers answer broadcasts using the existing room composer, not private-chat quote actions.
      await expect(page.getByRole("menu", { name: "메시지 메뉴", exact: true })).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
  });
}

test("DEV-289: failed edit retains draft, unchanged retry uses same key, and cancel preserves saved message", async ({ page, request }) => {
  test.setTimeout(120_000);
  const stamp = unique();
  const original = `실패 복구 원문 ${stamp}`;
  const changed = `재시도한 수정 ${stamp}`;
  const discarded = `취소할 수정 ${stamp}`;
  const message = await seedPrivate(request, false, original);
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/chats/f-kang`);
  const row = page.getByTestId(`chat-message-${message.messageId}`);
  const routePattern = `**/api/messaging/messages/${message.messageId}`;
  const keys: string[] = [];
  await page.route(routePattern, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1 || keys.length === 3) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: "잠시 후 다시 시도해 주세요." }),
      });
    }
    return route.continue();
  });
  await openEdit(page, row);
  const input = page.getByRole("textbox", { name: "수정할 메시지", exact: true });
  const save = page.getByRole("button", { name: "수정 저장", exact: true });
  await input.fill(changed);
  const firstFailure = page.waitForResponse((response) => response.url().endsWith(`/api/messaging/messages/${message.messageId}`) && response.status() === 503);
  await save.click();
  await firstFailure;
  await expect(input).toHaveValue(changed);
  await expect(page.getByRole("heading", { name: "메시지 수정", exact: true })).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole("heading", { name: "메시지 수정", exact: true })).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  await expectEdited(page, changed, message.messageId);

  await openEdit(page, row);
  await input.fill(discarded);
  const secondFailure = page.waitForResponse((response) => response.url().endsWith(`/api/messaging/messages/${message.messageId}`) && response.status() === 503);
  await save.click();
  await secondFailure;
  await expect(input).toHaveValue(discarded);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("heading", { name: "메시지 수정", exact: true })).toHaveCount(0);
  await expectEdited(page, changed, message.messageId);
  await expect(page.getByText(discarded, { exact: true })).toHaveCount(0);
  await page.reload();
  await expectEdited(page, changed, message.messageId);
});
