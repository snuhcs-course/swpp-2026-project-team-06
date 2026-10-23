import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });
let seq = 0;
const api = (method, path, token, body, key = `feedback-${++seq}`) =>
  mockTransport({ method, path, body, headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key } });
async function ok(...args) {
  const response = await api(...args);
  assert.equal(response.status, 200, JSON.stringify(response));
  return structuredClone(response.body);
}
const login = async (id, app) => (await ok("POST", "/api/auth/test-login", null, { userId: id, app })).accessToken;

test("AC-13-5: Mock reports only owned non-forwarded AI answers and persists producer and consumer markers", async () => {
  reset();
  const consumer = await login("u-minji", "consumer");
  // Mock 시드에서 f-kang을 팔로우하는 소비자는 u-minji뿐이다. u-seojun은 대화가 없는 다른 소비자다.
  const other = await login("u-seojun", "consumer");
  const producer = await login("u-kang", "producer");
  // API 키 없이도 전달되지 않는 AI 답변: 소량 주문 원칙 규칙 답변.
  const settings = await ok("GET", "/api/farms/me/ai-settings", producer);
  await ok("PUT", "/api/farms/me/ai-settings", producer, { ...settings, smallOrderPolicy: "1kg부터 주문할 수 있어요." });
  // 시드 대화에는 농가 답이 있어 HUMAN으로 시작한다. AI 답을 받으려면 AUTO로 돌린다.
  const thread = db().threadMeta["f-kang:u-minji"];
  await ok("PUT", "/api/messaging/producer/chats/u-minji/ai-mode", producer, { mode: "AUTO", version: thread.version });
  const sent = await ok("POST", "/api/messaging/chats/f-kang/messages", consumer, { text: "소량 주문 되나요?" });
  assert.equal(sent.reply.senderType, "AI");
  assert.equal(sent.reply.handoffStatus ?? null, null);
  const answerId = sent.reply.messageId;
  const reportPath = `/api/messaging/chats/f-kang/messages/${answerId}/report`;
  const report = await ok("POST", reportPath, consumer);
  assert.equal(report.reason, "WRONG_ANSWER");
  assert.equal(report.question, sent.message.body);
  assert.equal(report.status, "OPEN");
  assert.equal((await ok("POST", reportPath, consumer, undefined, "repeat-report")).escalationId, report.escalationId);
  let consumerPage = await ok("GET", "/api/messaging/chats/f-kang/messages", consumer);
  assert.equal(consumerPage.items.find((m) => m.messageId === answerId).reported, true);
  const producerPage = await ok("GET", "/api/messaging/producer/chats/u-minji/messages", producer);
  assert.equal(producerPage.items.find((m) => m.messageId === answerId).reported, true);
  // 다른 소비자도 같은 농가와 대화를 시작(자동 팔로우)한 뒤에는 남의 답변을 찾을 수 없다.
  await ok("POST", "/api/messaging/chats", other, { farmId: "f-kang" });
  assert.equal((await api("POST", reportPath, other)).status, 404);
  assert.equal((await api("POST", `/api/messaging/chats/f-kang/messages/${sent.message.messageId}/report`, consumer)).status, 400);

  const forwarded = await ok("POST", "/api/messaging/chats/f-kang/messages", consumer, { text: "농약은 언제 마지막으로 치셨어요?" });
  assert.equal(forwarded.reply.handoffStatus, "FORWARDED");
  assert.equal((await api("POST", `/api/messaging/chats/f-kang/messages/${forwarded.reply.messageId}/report`, consumer)).status, 400);
  const stored = db().escalations.find((e) => e.escalationId === report.escalationId);
  assert.equal(stored.status, "OPEN");
  assert.equal(db().threadMeta["f-kang:u-minji"].aiMode, "AUTO");
});

test("DEV-97: Mock chat opened from a product page answers from that product and rejects other products", async () => {
  reset();
  const consumer = await login("u-minji", "consumer");
  const producer = await login("u-kang", "producer");
  const thread = db().threadMeta["f-kang:u-minji"];
  await ok("PUT", "/api/messaging/producer/chats/u-minji/ai-mode", producer, { mode: "AUTO", version: thread.version });
  // f-kang은 판매 중 상품이 둘이라 상품 없이는 근거가 없다.
  const plain = await ok("POST", "/api/messaging/chats/f-kang/messages", consumer, { text: "당도가 몇이에요?" });
  assert.equal(plain.reply.handoffStatus, "FORWARDED");
  const house = await ok("POST", "/api/messaging/chats/f-kang/messages", consumer, { text: "당도가 몇이에요?", productId: "p-house" });
  assert.equal(house.reply.handoffStatus ?? null, null);
  assert.deepEqual(house.reply.sourceRefs, ["product:p-house"]);
  const before = db().threads["f-kang:u-minji"].length;
  for (const productId of ["p-hyodon", "p-hallabong", "p-none"])
    assert.equal((await api("POST", "/api/messaging/chats/f-kang/messages", consumer, { text: "당도가 몇이에요?", productId })).status, 404, productId);
  assert.equal(db().threads["f-kang:u-minji"].length, before);
});
