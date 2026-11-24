// FEAT-13 AC-13-2/5: requests originate at automatically handed-off consumer questions.
// Authored from the behavioral specification and existing test conventions only.
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, producerUrl, loginConsumer, loginProducer } from "./helpers";

type Message = { messageId: string; body: string; replyRequested: boolean; checkState: string | null;
  replyToMessageId?: string; replyTo?: { senderType: string; body: string } };
type Sent = { message: Message; reply: Message & { handoffStatus: string | null } };
const C = "/api/messaging/chats/f-kang/messages";
const P = "/api/messaging/producer/chats/u-seojun/messages";
const marker = () => crypto.randomUUID().replace(/[0-9]/g, n => String.fromCharCode(103 + Number(n)));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const mutation = (token: string) => ({ ...auth(token), "Idempotency-Key": crypto.randomUUID() });
const replyRequest = (page: Page, id: string) => page.getByTestId(`chat-message-${id}`)
  .getByRole("button", { name: "답장 요청에 답장", exact: true });

test.beforeEach(() => {
  for (const url of [apiUrl, consumerUrl, producerUrl])
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(url).hostname);
});

async function setup(request: APIRequestContext) {
  const producer = await apiLogin(request, "u-kang", "producer");
  const consumer = await apiLogin(request, "u-seojun", "consumer");
  const read = async (path: string, token = producer) => {
    const response = await request.get(`${apiUrl}${path}`, { headers: auth(token) });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const post = async (path: string, token: string, data?: unknown) => {
    const response = await request.post(`${apiUrl}${path}`, { headers: mutation(token), data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const initialFollow = (await read("/api/farms/f-kang", consumer)).isFollowing as boolean;
  if (!initialFollow) {
    const followed = await request.put(`${apiUrl}/api/farms/f-kang/follow`, { headers: mutation(consumer) });
    expect(followed.ok(), await followed.text()).toBeTruthy();
  }
  const initialSettings = await read("/api/farms/me/ai-settings");
  const initialThread = (await read(P)).thread;
  const settings = await request.put(`${apiUrl}/api/farms/me/ai-settings`, {
    headers: mutation(producer), data: { ...initialSettings, enabled: true, smallOrderPolicy: "1kg부터 주문할 수 있어요." },
  });
  expect(settings.ok(), await settings.text()).toBeTruthy();
  const auto = async () => {
    const { thread } = await read(P);
    if (thread.aiMode === "AUTO") return;
    const response = await request.put(`${apiUrl}/api/messaging/producer/chats/u-seojun/ai-mode`, {
      headers: mutation(producer), data: { mode: "AUTO", version: thread.version },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  await auto();
  // Match the existing AI-confirmation browser fixture: isolate this room's card.
  for (const message of (await read(`${P}?limit=50`)).items as Message[])
    if (message.checkState === "REQUESTED") await post(`${P}/${message.messageId}/confirm`, producer);
  const handoff = async (suffix: string): Promise<Sent> => {
    const sent = await post(C, consumer, { text: `농약은 얼마나 치세요? ${suffix} ${marker()}` });
    expect(sent.reply.handoffStatus).toBe("FORWARDED");
    return sent;
  };
  const check = async (): Promise<Sent> => {
    await auto();
    const sent = await post(C, consumer, { text: `소량 주문 되나요? ${marker()}` });
    expect(sent.reply.handoffStatus).toBeNull();
    await post(`${C}/${sent.reply.messageId}/report`, consumer);
    return sent;
  };
  const messages = async (): Promise<Message[]> => (await read(`${P}?limit=50`)).items;
  const restore = async () => {
    const currentSettings = await read("/api/farms/me/ai-settings");
    const response = await request.put(`${apiUrl}/api/farms/me/ai-settings`, {
      headers: mutation(producer), data: { ...initialSettings, version: currentSettings.version },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const { thread } = await read(P);
    if (thread.aiMode !== initialThread.aiMode) {
      const mode = await request.put(`${apiUrl}/api/messaging/producer/chats/u-seojun/ai-mode`, {
        headers: mutation(producer), data: { mode: initialThread.aiMode, version: thread.version },
      });
      expect(mode.ok(), await mode.text()).toBeTruthy();
    }
    if (!initialFollow) {
      const unfollow = await request.delete(`${apiUrl}/api/farms/f-kang/follow`, { headers: mutation(consumer) });
      expect(unfollow.ok(), await unfollow.text()).toBeTruthy();
    }
  };
  return { producer, consumer, handoff, check, messages, read, restore };
}

test("AC-13-2/5: producer request selects the original question, focuses without losing draft, and survives failed-send retry", async ({ page, request }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 844 });
  const fixture = await setup(request);
  try {
    const selected = await fixture.handoff("답할 질문");
    const other = await fixture.handoff("남길 질문");
    await loginConsumer(page, "이서준");
    await page.goto(`${consumerUrl}/chats/f-kang?start=1`);
    await expect(page.getByText(selected.message.body, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "답장 요청에 답장", exact: true })).toHaveCount(0);

    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/chats/u-seojun`);
    const selectedRow = page.getByTestId(`chat-message-${selected.message.messageId}`);
    await selectedRow.scrollIntoViewIfNeeded();
    await expect(replyRequest(page, selected.message.messageId)).toBeVisible();
    await expect(replyRequest(page, selected.reply.messageId)).toHaveCount(0);
    const input = page.getByRole("textbox", { name: "메시지", exact: true });
    const draft = `농가가 작성하던 답변 ${marker()}`;
    await input.fill(draft);
    const posts: unknown[] = [];
    page.on("request", sent => {
      if (sent.method() === "POST" && new URL(sent.url()).pathname === P) posts.push(sent.postDataJSON());
    });
    await replyRequest(page, selected.message.messageId).click();
    await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toBeVisible();
    await expect(page.getByText(selected.message.body, { exact: true })).toHaveCount(2);
    await expect(page.getByText(other.message.body, { exact: true })).toHaveCount(1);
    await expect(input).toHaveValue(draft);
    await expect(input).toBeFocused();
    expect(posts).toEqual([]);
    let failNext = true;
    await page.route(`**${P}`, async route => {
      if (route.request().method() === "POST" && failNext) {
        failNext = false;
        return route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "전달 질문 답장 재시도 검증" } });
      }
      return route.continue();
    });
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(page.getByText("전달 질문 답장 재시도 검증", { exact: true })).toBeVisible();
    await expect(input).toHaveValue(draft);
    await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toBeVisible();
    let messages = await fixture.messages();
    expect(messages.filter(m => m.body === draft)).toEqual([]);
    expect(messages.find(m => m.messageId === selected.message.messageId)?.replyRequested).toBe(true);
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(input).toHaveValue("");
    await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toHaveCount(0);
    await expect(replyRequest(page, selected.message.messageId)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(draft, { exact: true })).toBeVisible();
    messages = await fixture.messages();
    const replies = messages.filter(m => m.body === draft);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ replyToMessageId: selected.message.messageId,
      replyTo: { senderType: "CONSUMER", body: selected.message.body } });
    expect(messages.find(m => m.messageId === selected.message.messageId)?.replyRequested).toBe(false);
    expect(messages.find(m => m.messageId === other.message.messageId)?.replyRequested).toBe(true);
    expect(posts).toHaveLength(2);
    const rows = (await fixture.read("/api/messaging/producer/chats")).items;
    const support = rows.find((row: { isSupport: boolean }) => row.isSupport);
    expect(support).toBeTruthy();
    await page.goto(`${producerUrl}/chats/${support.consumerId}`);
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    await expect(page.getByRole("button", { name: "답장 요청에 답장", exact: true })).toHaveCount(0);
  } finally { await fixture.restore(); }
});

test("AC-13-5: automatic reply requests stay separate from explicit AI confirmation and correction", async ({ page, request }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await setup(request);
  try {
    const pending = await fixture.handoff("열어 둘 전달");
    const confirmed = await fixture.check();
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/chats/u-seojun`);
    const card = page.getByTestId("ai-check-card");
    await expect(card).toBeVisible();
    for (const id of [confirmed.message.messageId, confirmed.reply.messageId])
      await expect(replyRequest(page, id)).toHaveCount(0);
    await expect(replyRequest(page, pending.message.messageId)).toBeVisible();
    await card.getByRole("button", { name: "답이 맞아요", exact: true }).click();
    await expect(page.getByTestId(`ai-check-${confirmed.reply.messageId}`)).toHaveText("답이 맞다고 확인함");
    expect((await fixture.messages()).find(m => m.messageId === pending.message.messageId)?.replyRequested).toBe(true);

    const corrected = await fixture.check();
    await page.reload();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "바로잡기", exact: true }).click();
    await expect(page.getByText("AI 안내를 바로잡아요", { exact: true }).last()).toBeVisible();
    const text = `명시적 AI 안내 바로잡기 ${marker()}`;
    await page.getByRole("textbox", { name: "메시지", exact: true }).fill(text);
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(card).toHaveCount(0);
    const messages = await fixture.messages();
    expect(messages.find(m => m.messageId === confirmed.reply.messageId)?.checkState).toBe("CONFIRMED");
    expect(messages.find(m => m.messageId === corrected.reply.messageId)?.checkState).toBe("CORRECTED");
    expect(messages.find(m => m.messageId === pending.message.messageId)?.replyRequested).toBe(true);
    expect(messages.find(m => m.body === text)?.replyToMessageId).toBe(corrected.reply.messageId);
    await expect(replyRequest(page, pending.message.messageId)).toBeVisible();
  } finally { await fixture.restore(); }
});

test("AC-13-2/5: replying to an older loaded question immediately removes only its request without reloading", async ({ page, request }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await setup(request);
  try {
    const older = await fixture.handoff("이전 페이지에서 답할 질문");
    const newer = await fixture.handoff("최신 페이지에 남길 질문");
    let olderReads = 0;
    await page.route(url => url.pathname === P, async route => {
      if (route.request().method() !== "GET") return route.continue();
      const url = new URL(route.request().url());
      if (url.searchParams.has("cursor")) olderReads++;
      // Keep real server data, cursor and ordering; make each page small enough
      // to put the original question outside the latest polling response.
      url.searchParams.set("limit", "2");
      return route.continue({ url: url.toString() });
    });
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/chats/u-seojun`);
    const olderRow = page.getByTestId(`chat-message-${older.message.messageId}`);
    await expect(replyRequest(page, newer.message.messageId)).toBeVisible();
    await expect(olderRow).toHaveCount(0);
    await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
    await expect(olderRow).toBeVisible();
    expect(olderReads).toBeGreaterThan(0);
    await expect(replyRequest(page, older.message.messageId)).toBeVisible();
    await replyRequest(page, older.message.messageId).click();
    const text = `과거 질문에 답장 ${marker()}`;
    const input = page.getByRole("textbox", { name: "메시지", exact: true });
    await input.fill(text);
    await page.getByRole("button", { name: "전송", exact: true }).click();
    await expect(input).toHaveValue("");
    // Stay on this loaded conversation: no page.reload or route navigation.
    await expect(olderRow).toHaveCount(1);
    await expect(replyRequest(page, older.message.messageId)).toHaveCount(0);
    await expect(replyRequest(page, newer.message.messageId)).toHaveCount(1);
    const messages = await fixture.messages();
    expect(messages.find(m => m.body === text)?.replyToMessageId).toBe(older.message.messageId);
    expect(messages.find(m => m.messageId === older.message.messageId)?.replyRequested).toBe(false);
    expect(messages.find(m => m.messageId === newer.message.messageId)?.replyRequested).toBe(true);
  } finally { await fixture.restore(); }
});
