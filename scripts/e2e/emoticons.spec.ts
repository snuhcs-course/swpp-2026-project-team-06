import path from "node:path";

import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, producerUrl } from "./helpers";

const stamp = () => `${Date.now().toString(36)}-${crypto.randomUUID()}`;
const photoPath = () => path.join(process.cwd(), "packages/ui/assets/source/icons/send.png");
const roomRoute = "/api/messaging/rooms/f-kang/messages";
const chatRoute = "/api/messaging/chats/f-kang/messages";
const producerChatRoute = "/api/messaging/producer/chats/u-minji/messages";
const image = (page: Page, caption: string) => page.getByRole("img", { name: `${caption} 이모티콘`, exact: true });
const card = (page: Page, text: string) => page.getByTestId("news-card").filter({ hasText: text });

async function choose(page: Page, caption: string, producerNews = false) {
  // DEV-478: ‘+’는 사진 고르기, 이모티콘은 입력칸 안 웃는 얼굴로 바로 연다
  await expect(page.getByRole("button", { name: producerNews ? "사진·영상" : "사진", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이모티콘", exact: true }).click();
  await page.getByRole("button", { name: `${caption} 선택`, exact: true }).click();
  await expect(page.getByTestId("emoticon-selection")).toBeVisible();
}

function standalone(body: Record<string, unknown>, id: string, textField = "text") {
  expect(body.emoticonId).toBe(id);
  expect(body[textField] ?? "").toBe("");
  for (const field of ["attachmentIds", "photos", "videos"]) expect(body[field] ?? []).toEqual([]);
}

async function seedNews(request: APIRequestContext, text: string) {
  const token = await apiLogin(request, "u-kang", "producer");
  const response = await request.post(`${apiUrl}${roomRoute}`, {
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": stamp() },
    data: { text },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ messageId: string; broadcastId: string }>;
}

async function roomItems(request: APIRequestContext, token: string) {
  const response = await request.get(`${apiUrl}${roomRoute}?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).items as { messageId: string; emoticonId?: string; body: string }[];
}

test("AC-12-21 AC-12-22 consumer sends an emoticon alone, retains text/photo draft, and retries with the same key", async ({ page }) => {
  test.setTimeout(120_000);
  const draft = `나중에 보낼 문의 ${stamp()}`;
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/chats/f-kang`);
  const box = page.getByRole("textbox", { name: "메시지", exact: true });
  await box.fill(draft);
  await page.getByRole("button", { name: "사진", exact: true }).click();
  const upload = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/messaging/attachments");
  await page.locator('input[type="file"]').setInputFiles(photoPath());
  const uploaded = await upload;
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  // DEV-478: 작성창의 고른 사진(초안)은 72px 썸네일 ‘첨부 사진 1’. 보낸 사진 라벨과 섞이지 않게 초안을 직접 본다
  await expect(page.getByRole("img", { name: "첨부 사진 1", exact: true })).toBeVisible();

  const attempts: { key: string; body: Record<string, unknown> }[] = [];
  await page.route(`**${chatRoute}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
    if (attempts.length === 1) return route.fulfill({
      status: 503, contentType: "application/json",
      body: JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: "잠시 후 다시 시도해 주세요." }),
    });
    return route.continue();
  });
  await choose(page, "예약했어요");
  expect(attempts).toHaveLength(0);
  const failed = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === chatRoute && r.status() === 503);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await failed;
  await expect(page.getByTestId("emoticon-selection")).toBeVisible();
  await expect(box).toHaveValue(draft);
  const success = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === chatRoute && r.ok());
  await page.getByRole("button", { name: "전송", exact: true }).click();
  const result = await (await success).json();
  expect(attempts).toHaveLength(2);
  expect(attempts[0].key).toBeTruthy();
  expect(attempts[1].key).toBe(attempts[0].key);
  for (const attempt of attempts) standalone(attempt.body, "farmclub-reserved");
  expect(result.reply).toBeNull();
  expect(result.message.needsHuman).toBe(false);
  const row = page.getByTestId(`chat-message-${result.message.messageId}`);
  await expect(row.getByRole("img", { name: "예약했어요 이모티콘", exact: true })).toBeVisible();
  await expect(page.getByTestId("emoticon-selection")).toHaveCount(0);
  await expect(box).toHaveValue(draft);
  // DEV-478: 작성창의 고른 사진(초안)은 72px 썸네일 ‘첨부 사진 1’. 보낸 사진 라벨과 섞이지 않게 초안을 직접 본다
  await expect(page.getByRole("img", { name: "첨부 사진 1", exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByRole("img", { name: "예약했어요 이모티콘", exact: true })).toBeVisible();
});

test("AC-12-21 AC-12-22 producer previews once and taps the same emoticon again to send without consuming text", async ({ page }) => {
  test.setTimeout(120_000);
  const draft = `따로 보낼 생산자 답장 ${stamp()}`;
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats/u-minji`);
  const box = page.getByRole("textbox", { name: "메시지", exact: true });
  await box.fill(draft);
  const requests: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === producerChatRoute) requests.push(request.postDataJSON());
  });
  await choose(page, "포장 중이에요");
  expect(requests).toHaveLength(0);
  const sent = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === producerChatRoute && r.ok());
  await page.getByRole("button", { name: "포장 중이에요 선택", exact: true }).click();
  const result = await (await sent).json();
  expect(requests).toHaveLength(1);
  standalone(requests[0], "farmclub-packing");
  await expect(page.getByTestId("emoticon-selection")).toHaveCount(0);
  await expect(box).toHaveValue(draft);
  const row = page.getByTestId(`chat-message-${result.message.messageId}`);
  await expect(row.getByRole("img", { name: "포장 중이에요 이모티콘", exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByRole("img", { name: "포장 중이에요 이모티콘", exact: true })).toBeVisible();
});

test("AC-15-14 AC-12-22 consumer news emoticon keeps its selected post and private photo/text draft", async ({ page, request, browser }) => {
  test.setTimeout(150_000);
  const marker = `이모티콘 비공개 답장 대상 ${stamp()}`;
  const target = await seedNews(request, marker);
  const draft = `사진과 함께 나중에 보낼 답장 ${stamp()}`;
  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await loginConsumer(otherPage, "이서준");
    await otherPage.goto(`${consumerUrl}/news/f-kang`);
    await expect(card(otherPage, marker)).toBeVisible();
    const otherBefore = await image(otherPage, "맛있어요").count();
    await loginConsumer(page, "김민지");
    await page.goto(`${consumerUrl}/news/f-kang`);
    await card(page, marker).getByRole("button", { name: "농가에 답장", exact: true }).click();
    const box = page.getByRole("textbox", { name: "농가에 답장", exact: true });
    await box.fill(draft);
    await page.getByLabel("비공개 사진 첨부", { exact: true }).setInputFiles(photoPath());
    await expect(page.getByRole("img", { name: "첨부 사진 1", exact: true })).toBeVisible();
    await choose(page, "맛있어요");
    const response = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === roomRoute && r.ok());
    await page.getByRole("button", { name: "전송", exact: true }).click();
    const sentResponse = await response;
    const outgoing = sentResponse.request().postDataJSON();
    standalone(outgoing, "farmclub-delicious");
    expect(outgoing.broadcastId).toBe(target.broadcastId);
    const sent = await sentResponse.json();
    await expect(page.getByTestId("emoticon-selection")).toHaveCount(0);
    await expect(page.getByTestId("room-reply-post")).toContainText(marker);
    await expect(box).toHaveValue(draft);
    await expect(page.getByRole("img", { name: "첨부 사진 1", exact: true })).toBeVisible();
    await expect(image(page, "맛있어요").last()).toBeVisible();
    await page.reload();
    await expect(image(page, "맛있어요").last()).toBeVisible();
    const author = await apiLogin(request, "u-minji", "consumer");
    const other = await apiLogin(request, "u-seojun", "consumer");
    const producer = await apiLogin(request, "u-kang", "producer");
    for (const token of [author, producer])
      expect((await roomItems(request, token)).some((m) => m.messageId === sent.messageId && m.emoticonId === "farmclub-delicious")).toBe(true);
    expect((await roomItems(request, other)).some((m) => m.messageId === sent.messageId)).toBe(false);
    await otherPage.reload();
    await expect(image(otherPage, "맛있어요")).toHaveCount(otherBefore);
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/chats?view=news`);
    await card(page, marker).getByRole("button", { name: /^답장 \d+ 모아 보기$/ }).click();
    await expect(page.getByRole("dialog").getByTestId("fan-reply-row").getByRole("img", { name: "맛있어요 이모티콘", exact: true })).toBeVisible();
  } finally { await otherContext.close(); }
});

test("AC-15-14 AC-12-22 producer news waits for follower confirmation and renders an emoticon card after reload", async ({ page, request }) => {
  test.setTimeout(120_000);
  const draft = `따로 보낼 농가 소식 ${stamp()}`;
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats?view=news`);
  const box = page.getByRole("textbox", { name: "모두에게 보낼 소식", exact: true });
  await box.fill(draft);
  const requests: Record<string, unknown>[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.method() === "POST" && [roomRoute, "/api/messaging/news"].includes(new URL(outgoing.url()).pathname))
      requests.push(outgoing.postDataJSON());
  });
  await choose(page, "오늘 출하해요", true);
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  const confirmation = page.getByRole("dialog").filter({
    has: page.getByRole("button", { name: "확인 · 보내기", exact: true }),
  });
  await expect(confirmation).toBeVisible();
  expect(requests).toHaveLength(0);
  await confirmation.getByRole("button", { name: "아니요", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByTestId("emoticon-selection")).toBeVisible();
  await expect(box).toHaveValue(draft);
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(confirmation).toBeVisible();
  const response = page.waitForResponse((r) => r.request().method() === "POST" &&
    [roomRoute, "/api/messaging/news"].includes(new URL(r.url()).pathname) && r.ok());
  await confirmation.getByRole("button", { name: "확인 · 보내기", exact: true }).click();
  const sentResponse = await response;
  const sent = await sentResponse.json();
  expect(requests).toHaveLength(1);
  const route = new URL(sentResponse.url()).pathname;
  standalone(requests[0], "farmclub-shipping", route === "/api/messaging/news" ? "body" : "text");
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByTestId("emoticon-selection")).toHaveCount(0);
  await expect(box).toHaveValue(draft);
  const captionCards = page.getByTestId("news-card").filter({
    has: page.getByRole("img", { name: "오늘 출하해요 이모티콘", exact: true }),
  });
  await expect(captionCards.last()).toBeVisible();
  await page.reload();
  await expect(captionCards.last()).toBeVisible();
  const producer = await apiLogin(request, "u-kang", "producer");
  const stored = (await roomItems(request, producer)).find((m) => m.messageId === (sent.broadcastId ?? sent.messageId));
  expect(stored?.emoticonId).toBe("farmclub-shipping");
  expect(stored?.body).toBe("오늘 출하해요");
});

test("AC-12-22 DEV-478 the large preview sends on tap and the round close cancels without sending", async ({ page }) => {
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/chats/f-kang`);
  const posts: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === chatRoute) posts.push(r.postDataJSON());
  });
  await choose(page, "고마워요");
  await page.getByRole("button", { name: "이모티콘 선택 취소", exact: true }).click();
  await expect(page.getByTestId("emoticon-selection")).toHaveCount(0);
  expect(posts).toHaveLength(0);
  await page.getByRole("button", { name: "고마워요 선택", exact: true }).click();
  await expect(page.getByTestId("emoticon-selection")).toBeVisible();
  const sent = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === chatRoute && r.ok());
  await page.getByRole("button", { name: "고마워요 보내기", exact: true }).click();
  const result = await (await sent).json();
  expect(posts).toHaveLength(1);
  standalone(posts[0], "farmclub-thanks");
  await expect(page.getByTestId(`chat-message-${result.message.messageId}`).getByRole("img", { name: "고마워요 이모티콘", exact: true })).toBeVisible();
  await expect(page.getByTestId("emoticon-selection")).toHaveCount(0);
});
