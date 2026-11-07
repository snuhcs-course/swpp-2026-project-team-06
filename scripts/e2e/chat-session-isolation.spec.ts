import { expect, test } from "./fixtures";
import { writeFile } from "node:fs/promises";
import type { APIRequestContext, Page, Request } from "@playwright/test";
import { apiUrl, consumerUrl, loginConsumer } from "./helpers";
import {
  chatFixture, expectEmptyChat, paidChatOrder, type ChatState, type FixtureStart,
} from "./chat-regression";

test.use({ viewport: { width: 390, height: 844 } });
// server/app/core/pagination.py DEFAULT_LIMIT; no messages limit is sent by the route.
const HEAD_PAGE_SIZE = 20;
let original: FixtureStart | undefined;
test.beforeEach(() => {
  original = undefined;
  original = chatFixture<FixtureStart>("begin");
  expectEmptyChat(original.state);
});
test.afterEach(() => { if (original) chatFixture("finish", original); });
const timeline = (page: Page) => page.getByTestId("chat-timeline");
const row = (page: Page, id: string) => page.getByTestId(`chat-message-${id}`);
const messageIds = (page: Page) => timeline(page).locator('[data-testid^="chat-message-"]')
  .evaluateAll(els => els.map(el => el.getAttribute("data-testid")!.slice("chat-message-".length)));
async function relativeOffset(page: Page, id: string) {
  const message = await row(page, id).boundingBox(), view = await timeline(page).boundingBox();
  if (!message || !view) throw new Error("Message/timeline geometry unavailable");
  return message.y - view.y;
}
async function nextPaint(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function latest(page: Page) {
  await expect.poll(() => timeline(page).evaluate(el =>
    el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(8);
}
async function position(page: Page, id: string, relative = -10) {
  await expect(row(page, id)).toHaveCount(1);
  await timeline(page).evaluate((el, { id, relative }) => {
    const message = el.querySelector(`[data-testid="chat-message-${id}"]`);
    if (!message) throw new Error("Exact requested message is not loaded");
    el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 1 }));
    el.scrollTop += message.getBoundingClientRect().top - el.getBoundingClientRect().top - relative;
  }, { id, relative });
  await expect.poll(async () => Math.abs(await relativeOffset(page, id) - relative)).toBeLessThanOrEqual(1);
  await nextPaint(page);
}
async function openList(page: Page) {
  await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
  await expect(page).toHaveURL(/\/chats\?view=private$/);
  await expect(page.getByTestId("chat-choice-private")).toHaveAttribute("aria-selected", "true");
}
async function clickFarm(page: Page, farm: "f-halla" | "f-kang") {
  await page.getByRole("button", { name: farm === "f-halla" ? /^한라네 과수원,/ : /^강씨네 귤밭,/ }).click();
}
async function openFarm(page: Page, farm: "f-halla" | "f-kang") {
  await clickFarm(page, farm);
  await expect(page).toHaveURL(new RegExp(`/chats/${farm}$`));
  await expect(timeline(page)).toBeVisible();
}
async function setup(page: Page, request: APIRequestContext, count = 120) {
  const order = await paidChatOrder(request);
  for (const data of [
    { farmId: "f-halla", orderId: order.orderId }, { farmId: "f-kang" },
  ]) {
    const response = await request.post(`${apiUrl}/api/messaging/chats`, { headers: order.mutation(), data });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const state = chatFixture<ChatState>("history", { count, prefix: "DEV253-ISOLATION" });
  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/chats?view=private`);
  await openFarm(page, "f-halla");
  await latest(page);
  const anchor = state.messages[count > HEAD_PAGE_SIZE * 2 ? 36 : 11];
  for (let pageNumber = 0; pageNumber < Math.ceil(count / HEAD_PAGE_SIZE) &&
      await row(page, anchor.id).count() === 0; pageNumber++) {
    const loadedBefore = (await messageIds(page)).length;
    await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
    await expect.poll(async () => (await messageIds(page)).length).toBeGreaterThan(loadedBefore);
  }
  await expect(row(page, anchor.id)).toHaveCount(1);
  await position(page, anchor.id);
  return { state, anchor, before: await relativeOffset(page, anchor.id) };
}

test("AC-12-1/8/9 DEV-253 R01: delayed older response from the previous A visit cannot affect B or a new A visit",
  async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const { state, anchor, before } = await setup(page, request);
    const loaded = await messageIds(page);
    await openList(page);
    let captured!: () => void, release!: () => void;
    const capturedPromise = new Promise<void>(resolve => { captured = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    let first = true, oldRequest: Request | undefined;
    await page.route("**/api/messaging/chats/f-halla/messages?cursor=*", async route => {
      if (!first) return route.continue();
      first = false;
      oldRequest = route.request();
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBeTruthy();
      captured();
      await hold;
      await route.fulfill({ response });
    });
    try {
      await openFarm(page, "f-halla");
      await capturedPromise;
      await openList(page);
      await openFarm(page, "f-kang");
      await latest(page);
      await expect(page.getByText(anchor.body, { exact: true })).toHaveCount(0);
      await openList(page);
      await openFarm(page, "f-halla");
      await expect.poll(async () => Math.abs(await relativeOffset(page, anchor.id) - before)).toBeLessThanOrEqual(8);
      const currentIds = await messageIds(page);
      expect(currentIds).toEqual(loaded);
      const lateResponse = page.waitForResponse(response => response.request() === oldRequest);
      release();
      await (await lateResponse).finished();
      await nextPaint(page);
      expect(await messageIds(page)).toEqual(currentIds);
      expect(new Set(currentIds).size).toBe(currentIds.length);
      expect(Math.abs(await relativeOffset(page, anchor.id) - before)).toBeLessThanOrEqual(8);
      expect(chatFixture("inspect").threadId).toBe(state.threadId);
      const record = { anchor: anchor.id, before, after: await relativeOffset(page, anchor.id), loaded: currentIds.length };
      await writeFile(info.outputPath("R01.json"), JSON.stringify(record, null, 2), "utf8");
      await info.attach("R01.json", { path: info.outputPath("R01.json"), contentType: "application/json" });
    } finally { release(); }
  });

for (const resource of ["older restore", "private photo"] as const) {
  for (const fault of [
    { status: 401, code: "UNAUTHENTICATED", details: {}, label: "401 expiry" },
    { status: 403, code: "FORBIDDEN", details: { reason: "WRONG_APP" }, label: "403 WRONG_APP" },
  ]) {
    test(`AC-12-1/8/9 DEV-253 R02 ${resource} ${fault.label}: injected auth rejection clears protected UI and same-SPA relogin starts clean`,
      async ({ page, request }) => {
        test.setTimeout(120_000);
        const { state, anchor } = await setup(page, request, resource === "older restore" ? 120 : 26);
        await openList(page);
        const photo = resource === "private photo"
          ? chatFixture<{ attachmentId: string }>("photo", { messageId: state.messages[8].id }) : null;
        const pattern = photo ? `**/api/messaging/attachments/${photo.attachmentId}`
          : "**/api/messaging/chats/f-halla/messages?cursor=*";
        let rejected = false;
        await page.route(pattern, async route => {
          if (rejected) return route.continue();
          rejected = true;
          return route.fulfill({ status: fault.status, contentType: "application/json", body: JSON.stringify({
            code: fault.code, message: `DEV253 injected ${fault.label}`, details: fault.details,
          }) });
        });
        // Only this explicit response is injected. All successful authorization/data requests use the real API.
        await clickFarm(page, "f-halla");
        await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
        await expect(timeline(page)).toHaveCount(0);
        await expect(page.getByText(anchor.body, { exact: true })).toHaveCount(0);
        expect(rejected).toBe(true);
        expect(await page.evaluate(() => localStorage.getItem("farmclub-consumer:token") === null)).toBe(true);
        // Preserve this JavaScript runtime: no goto/reload/internal store hook substitutes for a session event.
        await page.getByRole("radio").filter({ hasText: "이서준" }).click();
        await page.getByRole("button", { name: /로그인$/ }).click();
        await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
        await expect(timeline(page)).toBeVisible();
        await latest(page);
        if (resource === "older restore") {
          await expect(row(page, anchor.id)).toHaveCount(0);
          expect((await messageIds(page)).length).toBe(HEAD_PAGE_SIZE);
        } else {
          expect(Math.abs(await relativeOffset(page, anchor.id) + 10)).toBeGreaterThan(8);
        }
        const persistent = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
        expect(persistent).not.toContain(anchor.body);
        expect(persistent).not.toContain(state.threadId!);
        expect(chatFixture("inspect").following).toBe(false);
      });
  }
}

test("AC-12-8/9 DEV-253 R03: real wheel input interrupts an older-window restore and the late response does not snap back",
  async ({ page, request }, info) => {
    test.setTimeout(120_000);
    const { anchor } = await setup(page, request);
    await openList(page);
    let captured!: () => void, release!: () => void;
    const capturedPromise = new Promise<void>(resolve => { captured = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    let first = true, oldRequest: Request | undefined;
    await page.route("**/api/messaging/chats/f-halla/messages?cursor=*", async route => {
      if (!first) return route.continue();
      first = false; oldRequest = route.request();
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBeTruthy();
      captured(); await hold; await route.fulfill({ response });
    });
    try {
      await openFarm(page, "f-halla");
      await capturedPromise;
      const box = await timeline(page).boundingBox();
      if (!box) throw new Error("Timeline not visible for real wheel input");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 360);
      await expect.poll(() => timeline(page).evaluate(el => el.scrollTop)).toBeGreaterThan(100);
      const intended = await timeline(page).evaluate(el => {
        const top = el.getBoundingClientRect().top;
        const element = [...el.querySelectorAll('[data-testid^="chat-message-"]')]
          .find(item => item.getBoundingClientRect().bottom > top);
        if (!element) throw new Error("No visible message after wheel input");
        return { id: element.getAttribute("data-testid")!.slice("chat-message-".length), relative: element.getBoundingClientRect().top - top };
      });
      expect(intended.id).not.toBe(anchor.id);
      const late = page.waitForResponse(response => response.request() === oldRequest);
      release();
      await (await late).finished();
      await nextPaint(page);
      expect(Math.abs(await relativeOffset(page, intended.id) - intended.relative)).toBeLessThanOrEqual(8);
      for (let poll = 0; poll < 2; poll++) {
        await page.waitForResponse(response => response.ok() && response.request().method() === "GET" &&
          new URL(response.url()).pathname === "/api/messaging/chats/f-halla/messages" &&
          !new URL(response.url()).searchParams.has("cursor"));
      }
      expect(Math.abs(await relativeOffset(page, intended.id) - intended.relative)).toBeLessThanOrEqual(8);
      await expect(row(page, anchor.id)).toHaveCount(0);
      await info.attach("R03.json", { body: JSON.stringify({ intended, final: await relativeOffset(page, intended.id) }), contentType: "application/json" });
    } finally { release(); }
  });
