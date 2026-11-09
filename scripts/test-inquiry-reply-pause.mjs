// Public transport contracts, written without reading the implementation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
let stored = null, serial = 0;
configureMockStorage({ read: () => stored, write: value => { stored = value; } });
const BASE = Date.parse("2026-10-07T10:00:00+09:00");
const RealDate = globalThis.Date;
let clockEpoch = BASE;
class ControlledDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(clockEpoch);
    else super(...args);
  }
  static now() { return clockEpoch; }
}
const at = minutes => {
  clockEpoch = BASE + minutes * 60_000;
  globalThis.Date = ControlledDate;
};
const clockTest = (name, run) => test(name, async () => {
  try {
    await run();
  } finally {
    globalThis.Date = RealDate;
  }
});
async function ok(method, path, token, body, key = `inquiry-pause-${++serial}`) {
  const response = await mockTransport({ method, path, body, headers: {
    Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key,
  } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  // Match JSON transport semantics: absent optional fields and undefined are identical.
  return JSON.parse(JSON.stringify(response.body));
}
async function prepare() {
  reset();
  at(0);
  const login = async (userId, app) =>
    (await ok("POST", "/api/auth/test-login", null, { userId, app })).accessToken;
  const consumer = await login("u-seojun", "consumer");
  const producer = await login("u-kang", "producer");
  const settings = await ok("GET", "/api/farms/me/ai-settings", producer);
  await ok("PUT", "/api/farms/me/ai-settings", producer, {
    ...settings, enabled: true, smallOrderPolicy: "1kg부터 주문할 수 있어요.",
  });
  return { consumer, producer };
}
const page = consumer => ok("GET", "/api/messaging/chats/f-kang/messages", consumer);
const producerSend = (producer, text, key) =>
  ok("POST", "/api/messaging/producer/chats/u-seojun/messages", producer, { text }, key);
const consumerSend = consumer => ok("POST", "/api/messaging/chats/f-kang/messages", consumer,
  { text: "소량 주문 되나요?", orderId: "o-38" });
async function openInquiry(consumer, text, type = "DAMAGE") {
  const result = await ok("POST", "/api/orders/o-38/inquiries", consumer, { type, text });
  assert.equal(result.inquiry.status, "OPEN");
  return result.inquiry;
}
const resolve = (producer, inquiry) => ok("PUT",
  `/api/messaging/producer/inquiries/${inquiry.inquiryId}/status`, producer,
  { status: "RESOLVED", version: inquiry.version ?? 1 });

clockTest("OPEN order inquiry keeps producer replies in untimed HUMAN mode, including retries", async () => {
  const { consumer, producer } = await prepare();
  await openInquiry(consumer, "상자가 찌그러졌어요");
  const first = await producerSend(producer, "배송 상태를 확인합니다", "same-producer-send");
  assert.equal(first.thread.aiMode, "HUMAN");
  assert.equal(first.thread.humanReplyUntil, null);
  at(11);
  assert.deepEqual(await producerSend(producer, "배송 상태를 확인합니다", "same-producer-send"), first);
  const after = await page(consumer);
  assert.equal(after.thread.aiMode, "HUMAN");
  assert.equal(after.thread.humanReplyUntil, null);
  assert.equal(after.farmReply.mode, "FARM");
  assert.equal(after.items.filter(m => m.messageId === first.message.messageId).length, 1);
  assert.equal((await consumerSend(consumer)).reply, null);
  assert.equal((await page(consumer)).farmReply.mode, "FARM");
});

clockTest("only resolving all OPEN inquiries allows the next producer reply to start a timed pause", async () => {
  const { consumer, producer } = await prepare();
  const first = await openInquiry(consumer, "상자가 찌그러졌어요");
  const second = await openInquiry(consumer, "내용물도 확인해 주세요", "OTHER");
  await producerSend(producer, "두 문의를 확인합니다");
  await resolve(producer, first);
  at(11);
  assert.equal((await consumerSend(consumer)).reply, null);
  const partial = await producerSend(producer, "남은 문의도 확인합니다");
  assert.equal(partial.thread.aiMode, "HUMAN");
  assert.equal(partial.thread.humanReplyUntil, null);
  at(22);
  assert.equal((await page(consumer)).farmReply.mode, "FARM");
  await resolve(producer, second);
  const ordinary = await producerSend(producer, "문의 처리가 끝났습니다");
  assert.equal(ordinary.thread.aiMode, "HUMAN");
  assert.equal(Date.parse(ordinary.thread.humanReplyUntil), BASE + 32 * 60_000);
  at(32 - 1 / 60);
  assert.equal((await consumerSend(consumer)).reply, null);
  at(32);
  const expired = await page(consumer);
  assert.equal(expired.thread.aiMode, "AUTO");
  assert.equal(expired.farmReply.mode, "AI");
  assert.equal((await consumerSend(consumer)).reply.senderType, "AI");
});

for (const endpoint of [
  "/api/messaging/producer/chats/u-farmclub/messages",
  "/api/messaging/producer/support/messages",
]) {
  clockTest(`support stays untimed HUMAN after producer reply: ${endpoint}`, async () => {
    const { producer } = await prepare();
    const before = await ok("GET", endpoint, producer);
    assert.equal(before.thread.aiMode, "HUMAN");
    assert.equal(before.thread.humanReplyUntil ?? null, null);
    const body = { text: "정산 안내를 확인하고 싶어요" };
    const key = `support-retry-${++serial}`;
    const sent = await ok("POST", endpoint, producer, body, key);
    assert.equal(sent.message.senderType, "PRODUCER");
    assert.equal(sent.thread.aiMode, "HUMAN");
    assert.equal(sent.thread.humanReplyUntil, null);
    at(11);
    const retry = await ok("POST", endpoint, producer, body, key);
    assert.equal(retry.message.messageId, sent.message.messageId);
    for (const route of [
      "/api/messaging/producer/chats/u-farmclub/messages",
      "/api/messaging/producer/support/messages",
    ]) {
      const page = await ok("GET", route, producer);
      assert.equal(page.thread.threadId, before.thread.threadId);
      assert.equal(page.thread.aiMode, "HUMAN");
      assert.equal(page.thread.humanReplyUntil, null);
      assert.equal(page.items.filter(m => m.messageId === sent.message.messageId).length, 1);
      assert(page.items.every(m => m.senderType !== "AI"));
    }
  });
}
