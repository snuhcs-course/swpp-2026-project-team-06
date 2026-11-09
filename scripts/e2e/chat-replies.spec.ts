import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiUrl,
  consumerUrl,
  loginConsumer,
  loginProducer,
  monitor,
  producerUrl,
} from "./helpers";

test("DEV-289: consumer and producer quote, cancel, send, and reload replies", async ({ page, request }) => {
  test.setTimeout(120_000);
  const assertClean = monitor(page);
  const producerToken = await apiLogin(request, "u-kang", "producer");
  const consumerToken = await apiLogin(request, "u-minji", "consumer");
  const producerAuth = { Authorization: `Bearer ${producerToken}` };
  const consumerAuth = { Authorization: `Bearer ${consumerToken}` };
  const stamp = `${Date.now()}-${Math.random()}`;
  const originalText = `인용할 농가 안내 ${stamp}`;
  const consumerText = `소비자 인용 답변 ${stamp}`;
  const producerText = `농가 인용 답변 ${stamp}`;
  const seeded = await request.post(`${apiUrl}/api/messaging/producer/chats/u-minji/messages`, {
    headers: { ...producerAuth, "Idempotency-Key": `quote-seed-${stamp}` },
    data: { text: originalText },
  });
  expect(seeded.ok()).toBeTruthy();
  const original = (await seeded.json()).message;

  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/chats/f-kang`);
  await expect(page.getByText(originalText, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "답장", exact: true }).last().click();
  await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "답장 취소", exact: true }).click();
  await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "답장", exact: true }).last().click();
  await page.getByRole("textbox", { name: "메시지", exact: true }).fill(consumerText);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(consumerText, { exact: true })).toBeVisible();
  await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(originalText, { exact: true })).toHaveCount(2);
  const consumerPage = await request.get(`${apiUrl}/api/messaging/chats/f-kang/messages`, { headers: consumerAuth });
  expect(consumerPage.ok()).toBeTruthy();
  const consumerReply = (await consumerPage.json()).items.find((m: { body: string }) => m.body === consumerText);
  expect(consumerReply.replyToMessageId).toBe(original.messageId);
  expect(consumerReply.replyTo.body).toBe(originalText);

  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats/u-minji`);
  await expect(page.getByText(consumerText, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "답장", exact: true }).last().click();
  await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "답장 취소", exact: true }).click();
  await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "답장", exact: true }).last().click();
  await page.getByRole("textbox", { name: "메시지", exact: true }).fill(producerText);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(producerText, { exact: true })).toBeVisible();
  await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(consumerText, { exact: true })).toHaveCount(2);
  const producerPage = await request.get(`${apiUrl}/api/messaging/producer/chats/u-minji/messages`, { headers: producerAuth });
  expect(producerPage.ok()).toBeTruthy();
  const producerReply = (await producerPage.json()).items.find((m: { body: string }) => m.body === producerText);
  expect(producerReply.replyToMessageId).toBe(consumerReply.messageId);
  expect(producerReply.replyTo.body).toBe(consumerText);
  assertClean();
});

test("DEV-289: private producer room toggles farm-wide AI and shows pause immediately after send", async ({ page, request }) => {
  test.setTimeout(120_000);
  const assertClean = monitor(page);
  const token = await apiLogin(request, "u-kang", "producer");
  const auth = { Authorization: `Bearer ${token}` };
  const settingsResponse = await request.get(`${apiUrl}/api/farms/me/ai-settings`, { headers: auth });
  expect(settingsResponse.ok()).toBeTruthy();
  const initial = await settingsResponse.json();
  const enabled = await request.put(`${apiUrl}/api/farms/me/ai-settings`, {
    headers: { ...auth, "Idempotency-Key": `global-ai-on-${Date.now()}` },
    data: { ...initial, enabled: true },
  });
  expect(enabled.ok()).toBeTruthy();

  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats/u-minji`);
  const on = page.getByRole("button", { name: "전체 AI 응대 ON", exact: true });
  const off = page.getByRole("button", { name: "전체 AI 응대 OFF", exact: true });
  await expect(on).toBeVisible();
  await expect(page.getByRole("button", { name: /^(?:직접 응대|AI 자동 응대|AI 응대 재개)$/ })).toHaveCount(0);
  await on.click();
  await expect(off).toBeVisible();
  expect((await (await request.get(`${apiUrl}/api/farms/me/ai-settings`, { headers: auth })).json()).enabled).toBe(false);
  await page.goto(`${producerUrl}/chats/u-seojun`);
  await expect(off).toBeVisible();
  await off.click();
  await expect(on).toBeVisible();
  expect((await (await request.get(`${apiUrl}/api/farms/me/ai-settings`, { headers: auth })).json()).enabled).toBe(true);

  const text = `농가가 직접 보내는 답변 ${Date.now()}`;
  await page.getByRole("textbox", { name: "메시지", exact: true }).fill(text);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByText(/직접 응대 중 · AI 재개까지 \d{2}:\d{2}/)).toBeVisible();
  assertClean();
});
