import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, producerUrl } from "./helpers";

const unique = () => crypto.randomUUID().replace(/[0-9]/g, d => String.fromCharCode(97 + Number(d)));

async function seedReply(request: APIRequestContext, text: string) {
  const token = await apiLogin(request, "u-minji", "consumer");
  const response = await request.post(`${apiUrl}/api/messaging/rooms/f-kang/messages`, {
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": unique() },
    data: { text },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function openQuote(page: Page, text: string) {
  await page.getByText(text, { exact: true }).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "1:1 채팅", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "답장", exact: true }).click();
  await expect(page.getByRole("button", { name: "답장 취소", exact: true })).toBeVisible();
}

async function confirmQuote(page: Page) {
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByRole("button", { name: "확인 · 보내기", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "확인 · 보내기", exact: true }).click();
}

test("producer quotes an anonymous consumer question to followers while private source stays hidden", async ({ page, request }) => {
  test.setTimeout(120_000);
  const stamp = unique();
  const source = `수확 시기가 궁금해요 ${stamp}`;
  const answer = `다음 주에 수확합니다 ${stamp}`;
  await seedReply(request, source);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats`);
  await openQuote(page, source);
  await page.getByRole("textbox", { name: "모두에게 보낼 소식", exact: true }).fill(answer);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  // Confirmation must preview the quoted question before broadcasting it.
  const confirm = page.getByRole("button", { name: "확인 · 보내기", exact: true });
  await expect(confirm).toBeVisible();
  await expect(page.getByText(source, { exact: true }).last()).toBeVisible();
  await confirm.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "답장 취소", exact: true })).toHaveCount(0);

  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/news/f-kang`);
  await page.reload();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  // One copy is the anonymous quote; the author's separate private reply is absent.
  await expect(page.getByText(source, { exact: true })).toHaveCount(1);
  await expect(page.getByText(source, { exact: true })).toBeVisible();
});

test("quote cancellation keeps draft and private chat action remains available", async ({ page, request }) => {
  test.setTimeout(120_000);
  const stamp = unique();
  const source = `취소할 인용 질문 ${stamp}`;
  const draft = `보존할 소식 초안 ${stamp}`;
  await seedReply(request, source);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats`);
  await openQuote(page, source);
  const composer = page.getByRole("textbox", { name: "모두에게 보낼 소식", exact: true });
  await composer.fill(draft);
  await page.getByRole("button", { name: "답장 취소", exact: true }).click();
  await expect(page.getByRole("button", { name: "답장 취소", exact: true })).toHaveCount(0);
  await expect(composer).toHaveValue(draft);
  await expect(page.getByText(draft, { exact: true }).and(page.locator(":not(textarea)"))).toHaveCount(0);
  await page.getByText(source, { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "1:1 채팅", exact: true }).click();
  await expect(page).toHaveURL(`${producerUrl}/chats/u-minji`);
});

test("failed room quote retains draft and snapshot and reuses idempotency key on retry", async ({ page, request }) => {
  test.setTimeout(120_000);
  const stamp = unique();
  const source = `재시도 인용 질문 ${stamp}`;
  const answer = `재시도 인용 답변 ${stamp}`;
  const original = await seedReply(request, source);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats`);
  const keys: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/messaging/rooms/f-kang/messages", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postDataJSON());
    if (keys.length === 1) return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: "잠시 후 다시 시도해 주세요." }),
    });
    return route.continue();
  });
  await openQuote(page, source);
  const composer = page.getByRole("textbox", { name: "모두에게 보낼 소식", exact: true });
  await composer.fill(answer);
  const failure = page.waitForResponse(response => response.url().endsWith("/api/messaging/rooms/f-kang/messages") && response.status() === 503);
  await confirmQuote(page);
  await failure;
  await expect(page.getByRole("dialog").getByText(source, {exact: true})).toBeVisible();
  await page.getByRole("button", {name: "아니요", exact: true}).click();
  await expect(composer).toHaveValue(answer);
  await expect(page.getByRole("button", { name: "답장 취소", exact: true })).toBeVisible();
  await confirmQuote(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(bodies).toEqual([
    { text: answer, replyToMessageId: original.messageId, replyToVersion: original.editVersion },
    { text: answer, replyToMessageId: original.messageId, replyToVersion: original.editVersion },
  ]);
  await page.reload();
  await expect(page.getByText(answer, { exact: true })).toHaveCount(1);
});
