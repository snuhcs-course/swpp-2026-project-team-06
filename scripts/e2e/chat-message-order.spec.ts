// Specification-only public UI checks. Product implementation/diff was not read.
import { test as base, expect, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, producerUrl, loginConsumer, loginProducer } from "./helpers";

const test = base.extend<{ ruleAnswer: void }>({
  ruleAnswer: [async ({ request }, use) => {
    const token = await apiLogin(request, "u-kang", "producer");
    const headers = { Authorization: `Bearer ${token}` };
    const settingsPath = `${apiUrl}/api/farms/me/ai-settings`;
    const messagesPath = `${apiUrl}/api/messaging/producer/chats/u-minji/messages`;
    const modePath = `${apiUrl}/api/messaging/producer/chats/u-minji/ai-mode`;
    const getSettings = await request.get(settingsPath, { headers });
    const getThread = await request.get(messagesPath, { headers });
    expect(getSettings.ok()).toBeTruthy();
    expect(getThread.ok()).toBeTruthy();
    const originalSettings = await getSettings.json();
    const originalThread = (await getThread.json()).thread;
    const mutationHeaders = () => ({ ...headers, "Idempotency-Key": crypto.randomUUID() });
    try {
      const saved = await request.put(settingsPath, {
        headers: mutationHeaders(),
        // Unique public answer content makes waiting for this answer independent of older messages.
        data: { ...originalSettings, enabled: true, smallOrderPolicy: `1kg부터 주문할 수 있어요. 순서 검증 ${crypto.randomUUID()}` },
      });
      expect(saved.ok()).toBeTruthy();
      if (originalThread.aiMode !== "AUTO") {
        const auto = await request.put(modePath, {
          headers: mutationHeaders(), data: { mode: "AUTO", version: originalThread.version },
        });
        expect(auto.ok()).toBeTruthy();
      }
      await use();
    } finally {
      // Restore with current versions even if an assertion or the test itself failed.
      const settingsResponse = await request.get(settingsPath, { headers });
      expect(settingsResponse.ok()).toBeTruthy();
      const currentSettings = await settingsResponse.json();
      const restored = await request.put(settingsPath, {
        headers: mutationHeaders(), data: { ...originalSettings, version: currentSettings.version },
      });
      expect(restored.ok()).toBeTruthy();
      const threadResponse = await request.get(messagesPath, { headers });
      expect(threadResponse.ok()).toBeTruthy();
      const currentThread = (await threadResponse.json()).thread;
      if (currentThread.aiMode !== originalThread.aiMode) {
        const mode = await request.put(modePath, {
          headers: mutationHeaders(), data: { mode: originalThread.aiMode, version: currentThread.version },
        });
        expect(mode.ok()).toBeTruthy();
      }
    }
  }, { auto: true }],
});

async function send(page: Page, text: string) {
  const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/messaging/chats/f-kang/messages");
  await page.getByRole("textbox", { name: "메시지", exact: true }).fill(text);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  const sent = await response;
  expect(sent.ok()).toBeTruthy();
  return sent.json();
}

async function expectQuestionThenAnswer(page: Page, questionBody: string, answerBody: string) {
  const question = page.getByText(questionBody, { exact: true }).last();
  const answer = page.getByText(answerBody, { exact: true }).last();
  await expect(question).toBeAttached();
  await expect(answer).toBeAttached();
  const answerNode = await answer.elementHandle();
  expect(await question.evaluate((q, a) => !!a && !!(q.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING), answerNode)).toBeTruthy();
}

test("AC-12-1 DEV-235: equal-time question and rule answer keep DOM order after reload and in producer view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/chats/f-kang?start=1`);
  const prompt = `소량 주문 되나요? 순서 확인 ${crypto.randomUUID()}`;
  const sent = await send(page, prompt);
  expect(sent.reply?.senderType).toBe("AI");
  expect(sent.reply.handoffStatus).toBeNull();
  expect(sent.message.createdAt).toBe(sent.reply.createdAt);
  expect(sent.message.sequence).toBeLessThan(sent.reply.sequence);
  await expectQuestionThenAnswer(page, prompt, sent.reply.body);
  await page.reload();
  await expectQuestionThenAnswer(page, prompt, sent.reply.body);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats/u-minji`);
  await expectQuestionThenAnswer(page, prompt, sent.reply.body);
  await page.reload();
  await expectQuestionThenAnswer(page, prompt, sent.reply.body);
});

test("AC-13-2/4 DEV-213: handoff shows forwarded notice without a new basis, ordinary answers keep evidence", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/chats/f-kang?start=1`);
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeVisible();
  const answerPrompt = `소량 주문 되나요? 근거 확인 ${crypto.randomUUID()}`;
  const answered = await send(page, answerPrompt);
  expect(answered.reply.handoffStatus).toBeNull();
  expect(answered.reply.sourceSummary).toBeTruthy();
  await expectQuestionThenAnswer(page, answerPrompt, answered.reply.body);
  const answerBubble = page.getByText(answered.reply.body, { exact: true }).last().locator("..");
  const answerBasis = answerBubble.getByText(`근거: ${answered.reply.sourceSummary}`, { exact: true });
  await expect(answerBasis).toBeAttached();
  const handoffPrompt = `농약은 얼마나 치세요? 전달 확인 ${crypto.randomUUID()}`;
  const forwarded = await send(page, handoffPrompt);
  expect(forwarded.reply.handoffStatus).toBe("FORWARDED");
  expect(forwarded.reply.sourceSummary).toBeNull();
  expect(forwarded.reply.body).toMatch(/^농가에 전달했어요/);
  await expectQuestionThenAnswer(page, handoffPrompt, forwarded.reply.body);
  const handoffBubble = page.getByText(forwarded.reply.body, { exact: true }).last().locator("..");
  await expect(handoffBubble.getByText(/^근거:/)).toHaveCount(0);
  await expect(answerBasis).toBeAttached();
  await page.reload();
  await expectQuestionThenAnswer(page, handoffPrompt, forwarded.reply.body);
  await expect(handoffBubble.getByText(/^근거:/)).toHaveCount(0);
  await expect(answerBasis).toBeAttached();
});
