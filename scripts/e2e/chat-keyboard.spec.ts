// DEV-351: acceptance-based keyboard and mobile composition regressions.
import { mkdirSync } from "node:fs";
import type { Locator } from "@playwright/test";
import { expect, test, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, producerUrl, loginConsumer, loginProducer } from "./helpers";

const marker = () => crypto.randomUUID().replace(/[0-9]/g, n => String.fromCharCode(103 + Number(n)));
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function reviewShot(page: Page, name: string) {
  mkdirSync(".artifacts/uat-followup-review", { recursive: true });
  await page.screenshot({ path: `.artifacts/uat-followup-review/${name}.png`, fullPage: true });
}
async function nativeLineBreak(input: Locator, inputType: "insertLineBreak" | "insertParagraph", isComposing = false) {
  // locator.dispatchEvent creates a generic Event for beforeinput and drops inputType.
  // Construct the actual browser event so this models the mobile keyboard contract.
  return input.evaluate((node, init) => node.dispatchEvent(new InputEvent("beforeinput", {
    ...init, cancelable: true, bubbles: true, composed: true,
  })), { inputType, isComposing });
}

test.beforeEach(() => {
  // These tests create only synthetic data in the real local integration server.
  for (const url of [apiUrl, consumerUrl, producerUrl])
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(url).hostname);
});

const roles = ["consumer", "producer"] as const;
async function chat(page: Page, role: typeof roles[number]) {
  const token = await apiLogin(page.request, role === "consumer" ? "u-minji" : "u-kang", role);
  if (role === "consumer") {
    await loginConsumer(page);
    await page.goto(`${consumerUrl}/chats/f-kang?start=1`);
  } else {
    await loginProducer(page, "강영수");
    await page.goto(`${producerUrl}/chats/u-minji`);
  }
  const endpoint = role === "consumer"
    ? "/api/messaging/chats/f-kang/messages" : "/api/messaging/producer/chats/u-minji/messages";
  const input = page.getByRole("textbox", { name: "메시지", exact: true });
  await expect(input).toBeEditable();
  const sent: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === endpoint)
      sent.push(request.postDataJSON().text);
  });
  const persisted = async (text: string) => {
    const response = await page.request.get(`${apiUrl}${endpoint}?limit=50`, { headers: auth(token) });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).items.filter((message: { body: string }) => message.body === text).length;
  };
  return { input, endpoint, sent, persisted };
}

for (const role of roles) {
  test(`DEV-351 AC12-1 ${role}: mobile native line breaks send once, preserve composition and Shift+Enter`, async ({ page }) => {
    const { input, endpoint, sent, persisted } = await chat(page, role);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let attempts = 0;
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      attempts++;
      if (attempts === 1) await gate;
      return route.continue();
    });
    // Mobile keyboards can emit beforeinput without any preceding keydown.
    const first = `모바일 줄바꿈 전송 ${marker()}`;
    try {
      await input.fill(first);
      await nativeLineBreak(input, "insertLineBreak");
      await expect.poll(() => attempts).toBe(1);
      await nativeLineBreak(input, "insertLineBreak");
      await nativeLineBreak(input, "insertParagraph");
      expect(attempts).toBe(1);
    } finally { release(); }
    await expect(input).toHaveValue("");
    await expect.poll(() => persisted(first)).toBe(1);
    expect(sent).toEqual([first]);

    const paragraph = `모바일 문단 전송 ${marker()}`;
    await input.fill(paragraph);
    await nativeLineBreak(input, "insertParagraph");
    await expect(input).toHaveValue("");
    await expect.poll(() => persisted(paragraph)).toBe(1);
    expect(sent).toEqual([first, paragraph]);

    const composing = `모바일 한글 조합 ${marker()}`;
    await input.fill(composing);
    await input.dispatchEvent("compositionstart", { data: "조" });
    // Some keyboards omit InputEvent.isComposing; composition lifecycle remains decisive.
    await nativeLineBreak(input, "insertLineBreak", true);
    await nativeLineBreak(input, "insertLineBreak");
    await nativeLineBreak(input, "insertParagraph");
    expect(sent).toEqual([first, paragraph]);
    expect(await persisted(composing)).toBe(0);
    await expect(input).toHaveValue(composing);
    await input.dispatchEvent("compositionend", { data: "조합" });
    await input.press("Shift+Enter");
    await input.pressSequentially("둘째 줄");
    const multiline = `${composing}\n둘째 줄`;
    await expect(input).toHaveValue(multiline);
    expect(sent).toEqual([first, paragraph]);
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect.poll(() => persisted(multiline)).toBe(1);
    expect(sent).toEqual([first, paragraph, multiline]);
  });

  test(`DEV-351 AC12-1 ${role}: Enter sends once, Shift+Enter adds a newline, blank Enter sends nothing`, async ({ page }) => {
    const { input, sent, persisted } = await chat(page, role);
    await input.press("Enter");
    await input.fill("   ");
    await input.press("Enter");
    const first = `키보드 첫 줄 ${marker()}`;
    await input.fill(first);
    await input.press("Shift+Enter");
    await input.pressSequentially("둘째 줄");
    const text = `${first}\n둘째 줄`;
    await expect(input).toHaveValue(text);
    expect(sent).toEqual([]);
    if (role === "consumer") await reviewShot(page, "chat");
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect.poll(() => persisted(text)).toBe(1);
    expect(sent).toEqual([text]);
    await input.press("Enter");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeEditable();
    expect(sent).toEqual([text]);
    expect(await persisted(text)).toBe(1);
  });

  test(`DEV-351 AC12-1 ${role}: Korean composition and post-composition keyCode 229 never submit`, async ({ page }) => {
    const { input, sent, persisted } = await chat(page, role);
    const text = `한글 조합 검증 ${marker()}`;
    await input.fill(text);
    await input.dispatchEvent("compositionstart", { data: "검" });
    await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, isComposing: true });
    await input.dispatchEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, isComposing: true });
    await input.dispatchEvent("compositionend", { data: "검증" });
    await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, which: 229, isComposing: false });
    await nativeLineBreak(input, "insertParagraph");
    await input.dispatchEvent("keyup", { key: "Enter", code: "Enter", keyCode: 229, which: 229 });
    expect(sent).toEqual([]);
    expect(await persisted(text)).toBe(0);
    await expect(input).toHaveValue(text);
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect.poll(() => persisted(text)).toBe(1);
    expect(sent).toEqual([text]);
  });

  test(`DEV-351 AC12-1 ${role}: repeated Enter while sending and a failed-send retry cannot duplicate a message`, async ({ page }) => {
    const { input, endpoint, persisted } = await chat(page, role);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let attempts = 0;
    let failNext = false;
    await page.route(`**${endpoint}`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      attempts++;
      if (attempts === 1) await gate;
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "키보드 재시도 검증" } });
      }
      return route.continue();
    });
    const first = `전송 중 중복 방지 ${marker()}`;
    try {
      await input.fill(first);
      await input.press("Enter");
      await expect.poll(() => attempts).toBe(1);
      await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13 });
      await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, repeat: true });
      expect(attempts).toBe(1);
    } finally { release(); }
    await expect(input).toHaveValue("");
    await expect.poll(() => persisted(first)).toBe(1);
    expect(attempts).toBe(1);

    const retryText = `연결 실패 후 다시 전송 ${marker()}`;
    failNext = true;
    await input.fill(retryText);
    await input.press("Enter");
    await expect(page.getByText("키보드 재시도 검증", { exact: true })).toBeVisible();
    await expect(input).toHaveValue(retryText);
    expect(await persisted(retryText)).toBe(0);
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect.poll(() => persisted(retryText)).toBe(1);
    expect(attempts).toBe(3);
  });
}

test("DEV-351: producer news composer keeps Enter as a newline without sending", async ({ page }) => {
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats?view=news`);
  const input = page.getByRole("textbox", { name: "모두에게 보낼 소식", exact: true });
  const posts: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /\/api\/messaging\/(?:rooms\/[^/]+\/messages|news)$/.test(new URL(request.url()).pathname))
      posts.push(request.url());
  });
  const text = `소식 줄바꿈 ${marker()}`;
  await input.fill(text);
  await input.press("Enter");
  await input.pressSequentially("둘째 줄");
  await expect(input).toHaveValue(`${text}\n둘째 줄`);
  await expect(page.getByRole("button", { name: "확인 · 보내기", exact: true })).toHaveCount(0);
  expect(posts).toEqual([]);
});
