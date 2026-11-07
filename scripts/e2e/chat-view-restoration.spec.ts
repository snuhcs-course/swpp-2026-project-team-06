import { expect, test } from "./fixtures";
import { writeFileSync } from "node:fs";
import type { APIRequestContext, Page } from "@playwright/test";
import { apiLogin, apiUrl, consumerUrl, loginConsumer } from "./helpers";
import { chatFixture, paidChatOrder, type ChatState, type FixtureStart } from "./chat-regression";

let original: FixtureStart | undefined;
test.beforeEach(() => { original = undefined; original = chatFixture<FixtureStart>("begin"); });
test.afterEach(() => { if (original) chatFixture("finish", original); });
const timeline = (page: Page) => page.getByTestId("chat-timeline");
const row = (page: Page, id: string) => page.getByTestId(`chat-message-${id}`);
async function offset(page: Page, id: string) {
  const a = await row(page, id).boundingBox(), s = await timeline(page).boundingBox();
  if (!a || !s) throw new Error("Visible timeline/message geometry is unavailable");
  return { relative: a.y - s.y, row: a, timeline: s };
}
async function settled(page: Page) {
  await timeline(page).evaluate(async el => {
    let stable = 0, last = "";
    for (let count = 0; count < 180; count++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const value = `${el.scrollTop}:${el.scrollHeight}:${el.clientHeight}`;
      stable = value === last ? stable + 1 : 0; last = value;
      if (stable >= 12) return;
    }
    throw new Error("Timeline geometry did not settle within 180 animation frames");
  });
}
async function latest(page: Page) {
  await expect.poll(() => timeline(page).evaluate(el =>
    el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(8);
  await settled(page);
}
async function loadUntil(page: Page, id: string) {
  for (let count = 0; count < 7; count++) {
    if (await row(page, id).count()) return;
    const before = await timeline(page).locator('[data-testid^="chat-message-"]').count();
    await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
    await expect.poll(() => timeline(page).locator('[data-testid^="chat-message-"]').count()).toBeGreaterThan(before);
  }
  throw new Error("Target message did not load within the bounded history window");
}
async function position(page: Page, id: string, relative = 27) {
  await expect(row(page, id)).toHaveCount(1);
  await timeline(page).evaluate((el, { id, relative }) => {
    const message = el.querySelector(`[data-testid="chat-message-${id}"]`);
    if (!message) throw new Error("Exact message ID not loaded");
    el.scrollTop += message.getBoundingClientRect().top - el.getBoundingClientRect().top - relative;
  }, { id, relative });
  await expect.poll(async () => Math.abs((await offset(page, id)).relative - relative)).toBeLessThanOrEqual(1);
  await settled(page);
  return (await offset(page, id)).relative;
}
async function openList(page: Page) {
  await page.getByRole("button", { name: "뒤로", exact: true }).first().click();
  await expect(page).toHaveURL(/\/chats\?view=private$/);
  await expect(page.getByRole("tab", { name: "1:1 채팅", exact: true })).toHaveAttribute("aria-selected", "true");
}
async function openFarm(page: Page, farm: "f-halla" | "f-kang") {
  await page.getByRole("button", { name: farm === "f-halla" ? /^한라네 과수원,/ : /^강씨네 귤밭,/ }).click();
  await expect(page).toHaveURL(new RegExp(`/chats/${farm}$`));
  await expect(timeline(page)).toBeVisible();
}
async function roundTrip(page: Page) {
  await openList(page); await openFarm(page, "f-kang");
  await latest(page); await openList(page); await openFarm(page, "f-halla");
}
async function setup(page: Page, request: APIRequestContext, count: number, prefix = "DEV253-HISTORY") {
  const order = await paidChatOrder(request);
  const started = await request.post(`${apiUrl}/api/messaging/chats`, {
    headers: order.mutation(), data: { farmId: "f-halla", orderId: order.orderId },
  });
  expect(started.ok(), await started.text()).toBeTruthy();
  const b = await request.post(`${apiUrl}/api/messaging/chats`, {
    headers: order.mutation(), data: { farmId: "f-kang" },
  });
  expect(b.ok(), await b.text()).toBeTruthy();
  const state = chatFixture<ChatState>("history", { count, prefix });
  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/chats?view=private`);
  await openFarm(page, "f-halla"); await latest(page);
  return { order, state };
}

for (const width of [390, 360]) {
  test(`AC-12-8/9 DEV-253 S01 ${width}px: original 26-message A/B/A anchor drift stays within 8px for five trips`,
    async ({ page, request }, info) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 844 });
      const { state } = await setup(page, request, 26, "DEV153-C01-HISTORY");
      await loadUntil(page, state.messages[0].id); await latest(page);
      const anchor = state.messages.find(m => m.body === "DEV153-C01-HISTORY-12")!;
      expect(anchor).toBeTruthy();
      const records = [];
      for (let trip = 1; trip <= 5; trip++) {
        const before = await position(page, anchor.id);
        await roundTrip(page);
        await expect.poll(async () => Math.abs((await offset(page, anchor.id)).relative - before)).toBeLessThanOrEqual(8);
        await settled(page);
        const after = (await offset(page, anchor.id)).relative;
        expect(Math.abs(after - before)).toBeLessThanOrEqual(8);
        expect(await row(page, anchor.id).innerText()).toContain(anchor.body);
        expect(await timeline(page).evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        records.push({ trip, width, messageId: anchor.id, before, after, drift: after - before });
      }
      writeFileSync(info.outputPath("anchor-offsets.json"), JSON.stringify(records, null, 2));
      await info.attach("anchor-offsets.json", { body: JSON.stringify(records, null, 2), contentType: "application/json" });
      await page.screenshot({ path: info.outputPath(`S01-${width}-five-trips.png`) });
      expect(chatFixture("inspect").following).toBe(false);
    });
}

test("AC-12-8/9 DEV-253 S02: 120-message window restores older anchor, preserves sequence and continues paging", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { state } = await setup(page, request, 120);
  await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
  const anchor = state.messages[36];
  await loadUntil(page, anchor.id);
  const before = await position(page, anchor.id);
  const loadedBefore = await timeline(page).locator('[data-testid^="chat-message-"]').evaluateAll(els => els.map(el => el.getAttribute("data-testid")!.slice(13)));
  await roundTrip(page);
  await expect.poll(async () => Math.abs((await offset(page, anchor.id)).relative - before)).toBeLessThanOrEqual(8);
  await settled(page);
  const loadedAfter = await timeline(page).locator('[data-testid^="chat-message-"]').evaluateAll(els => els.map(el => el.getAttribute("data-testid")!.slice(13)));
  expect(loadedAfter).toEqual(loadedBefore);
  await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
  await expect(row(page, state.messages[0].id)).toHaveCount(1);
  const all = await timeline(page).locator('[data-testid^="chat-message-"]').evaluateAll(els => els.map(el => el.getAttribute("data-testid")!.slice(13)));
  expect(all).toEqual(state.messages.map(m => m.id));
  expect(new Set(all).size).toBe(120);
  await info.attach("window.json", { body: JSON.stringify({ before, after: (await offset(page, anchor.id)).relative, loadedBefore, loadedAfter, total: all.length }), contentType: "application/json" });
});

test("AC-12-8/9 DEV-253 S03: delayed photo and incoming messages preserve history until explicit latest/read", async ({ page, request }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { state } = await setup(page, request, 26);
  const anchor = state.messages[11];
  const before = await position(page, anchor.id);
  await openList(page);
  const photo = chatFixture<{ attachmentId: string }>("photo", { messageId: state.messages[4].id });
  const arrival = chatFixture<{ messageId: string }>("append", { text: "DEV253 new while away" });
  const readBefore = chatFixture("inspect").readId;
  let releasePhoto!: () => void;
  const held = new Promise<void>(resolve => { releasePhoto = resolve; });
  await page.route(`**/api/messaging/attachments/${photo.attachmentId}`, async route => { await held; await route.continue(); });
  await openFarm(page, "f-halla");
  await expect.poll(async () => Math.abs((await offset(page, anchor.id)).relative - before)).toBeLessThanOrEqual(8);
  expect(chatFixture("inspect").readId).toBe(readBefore);
  releasePhoto();
  await expect(page.getByRole("img", { name: "비공개 문의 사진", exact: true })).toBeVisible();
  await settled(page);
  expect(Math.abs((await offset(page, anchor.id)).relative - before)).toBeLessThanOrEqual(8);
  await expect(page.getByRole("button", { name: "새 메시지 보기 ↓", exact: true })).toBeVisible();
  const second = chatFixture<{ messageId: string }>("append", { text: "DEV253 new after return" });
  await expect(row(page, second.messageId)).toHaveCount(1);
  await settled(page);
  expect(Math.abs((await offset(page, anchor.id)).relative - before)).toBeLessThanOrEqual(8);
  expect(chatFixture("inspect").readId).toBe(readBefore);
  await page.getByRole("button", { name: "새 메시지 보기 ↓", exact: true }).click();
  await latest(page);
  await expect.poll(() => chatFixture("inspect").readId).toBe(second.messageId);
  await openList(page);
  const newest = chatFixture<{ messageId: string }>("append", { text: "DEV253 bottom pinned while away" });
  await openFarm(page, "f-halla"); await latest(page);
  await expect.poll(() => chatFixture("inspect").readId).toBe(newest.messageId);
  const final = chatFixture<{ messageId: string }>("append", { text: "DEV253 bottom pinned live" });
  await expect(row(page, final.messageId)).toHaveCount(1); await latest(page);
  await expect.poll(() => chatFixture("inspect").readId).toBe(final.messageId);
  await info.attach("unread.json", { body: JSON.stringify({ anchor: anchor.id, before, whileAway: arrival.messageId, afterReturn: second.messageId, bottom: final.messageId }), contentType: "application/json" });
});

test("AC-12-8/9 DEV-253 S04: missing saved anchor uses surviving neighbor and transient restore load retries", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { state } = await setup(page, request, 120);
  await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
  const anchor = state.messages[36], neighbor = state.messages[37];
  await loadUntil(page, anchor.id);
  await position(page, anchor.id, -10);
  const beforeNeighbor = (await offset(page, neighbor.id)).relative;
  await openList(page);
  chatFixture("remove_message", { messageId: anchor.id });
  let fail = true;
  await page.route("**/api/messaging/chats/f-halla/messages?cursor=*", async route => {
    if (fail) { fail = false; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL_ERROR", message: "DEV253 temporary test failure", details: {} }) }); }
    return route.continue();
  });
  await openFarm(page, "f-halla");
  await expect(page.getByRole("alert")).toContainText("DEV253 temporary test failure");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(row(page, neighbor.id)).toHaveCount(1);
  await expect.poll(async () => Math.abs((await offset(page, neighbor.id)).relative - beforeNeighbor)).toBeLessThanOrEqual(8);
  await settled(page);
  expect(Math.abs((await offset(page, neighbor.id)).relative - beforeNeighbor)).toBeLessThanOrEqual(8);
  await expect(row(page, anchor.id)).toHaveCount(0);
});

async function logoutViaTabs(page: Page) {
  await openList(page);
  await page.getByText("내 정보", { exact: true }).last().click();
  await page.getByText("로그아웃", { exact: true }).click();
  await expect(page).toHaveURL(`${consumerUrl}/`);
}
async function loginViaTabs(page: Page, name: string) {
  await page.getByText("내 정보", { exact: true }).last().click();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("radio").filter({ hasText: name }).click();
  await page.getByRole("button", { name: /로그인$/ }).click();
  await expect(page).toHaveURL(/\/me$/);
  await page.getByText("채팅", { exact: true }).last().click();
  await page.getByTestId("chat-choice-private").click();
  await openFarm(page, "f-halla");
}

test("AC-12-8/9 DEV-253 S05: same-user relogin and second user discard snapshots without page reload", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { state } = await setup(page, request, 26);
  const anchor = state.messages[11];
  await position(page, anchor.id);
  await logoutViaTabs(page);
  await loginViaTabs(page, "이서준");
  await latest(page);
  expect(Math.abs((await offset(page, anchor.id)).relative - 27)).toBeGreaterThan(8);
  await position(page, anchor.id);
  await logoutViaTabs(page);
  await loginViaTabs(page, "김민지");
  await latest(page);
  await expect(page.getByText(anchor.body, { exact: true })).toHaveCount(0);
  const storage = await page.evaluate(() => ({ ...localStorage, ...sessionStorage }));
  const serialized = JSON.stringify(storage);
  expect(serialized).not.toContain(anchor.body);
  expect(serialized).not.toContain(state.threadId!);
  expect(Object.keys(storage).filter(k => /chat.?view|snapshot|anchor/i.test(k))).toEqual([]);
});

test("AC-12-8/9 DEV-253 S06: cursor nonprogress is visible and recoverable without losing loaded history", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { state } = await setup(page, request, 120);
  await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
  const anchor = state.messages[36]; await loadUntil(page, anchor.id); await position(page, anchor.id);
  const before = (await offset(page, anchor.id)).relative;
  await openList(page);
  let broken = true, calls = 0;
  await page.route("**/api/messaging/chats/f-halla/messages?cursor=*", async route => {
    if (!broken) return route.continue();
    calls++;
    const response = await route.fetch();
    const data = await response.json();
    data.nextCursor = new URL(route.request().url()).searchParams.get("cursor");
    return route.fulfill({ response, json: data });
  });
  await openFarm(page, "f-halla");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(calls).toBeLessThanOrEqual(2);
  broken = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(async () => Math.abs((await offset(page, anchor.id)).relative - before)).toBeLessThanOrEqual(8);
  await settled(page);
  expect(Math.abs((await offset(page, anchor.id)).relative - before)).toBeLessThanOrEqual(8);
});

test("AC-12-8/9 DEV-253 S07: farm approval loss clears protected history and discarded position cannot return", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { state } = await setup(page, request, 26);
  const anchor = state.messages[11]; await position(page, anchor.id);
  chatFixture("approval", { status: "SUSPENDED" });
  await expect(timeline(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText(anchor.body, { exact: true })).toHaveCount(0);
  chatFixture("approval", { status: "APPROVED" });
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(timeline(page)).toBeVisible(); await latest(page);
  expect(Math.abs((await offset(page, anchor.id)).relative - 27)).toBeGreaterThan(8);
});

test("AC-12-8/9 DEV-253 S08: deleted historical window becomes a valid empty bottom position", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { state } = await setup(page, request, 26);
  await position(page, state.messages[11].id);
  await openList(page);
  const empty = chatFixture("clear_history");
  expect(empty.messages).toEqual([]); expect(empty.contexts).toHaveLength(1);
  await openFarm(page, "f-halla");
  await expect(page.getByText("첫 이야기를 남겨 보세요.", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await latest(page);
  await roundTrip(page);
  await expect(page.getByText("첫 이야기를 남겨 보세요.", { exact: true })).toBeVisible();
  const arrival = chatFixture<{ messageId: string }>("append", { text: "DEV253 first after empty history" });
  await expect(row(page, arrival.messageId)).toHaveCount(1); await latest(page);
  await expect.poll(() => chatFixture("inspect").readId).toBe(arrival.messageId);
  await expect(page.getByRole("button", { name: "새 메시지 보기 ↓", exact: true })).toHaveCount(0);
});
