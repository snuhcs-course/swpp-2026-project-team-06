// FEAT-13 AC-13-2/5: same public handoff contract against the mock transport.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });
let seq = 0;
const C = "/api/messaging/chats/f-kang/messages";
const P = "/api/messaging/producer/chats/u-seojun/messages";
const api = (method, path, token, body, key = `handoff-${++seq}`) => mockTransport({
  method, path, body, headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
});
async function ok(...args) {
  const response = await api(...args);
  assert.equal(response.status, 200, JSON.stringify(response));
  return structuredClone(response.body);
}
async function setup() {
  reset();
  const consumer = (await ok("POST", "/api/auth/test-login", null, { userId: "u-seojun", app: "consumer" })).accessToken;
  const producer = (await ok("POST", "/api/auth/test-login", null, { userId: "u-kang", app: "producer" })).accessToken;
  await ok("PUT", "/api/farms/f-kang/follow", consumer);
  const settings = await ok("GET", "/api/farms/me/ai-settings", producer);
  await ok("PUT", "/api/farms/me/ai-settings", producer, { ...settings, enabled: true, smallOrderPolicy: "1kg부터 주문할 수 있어요." });
  const { thread } = await ok("GET", P, producer);
  if (thread.aiMode !== "AUTO") await ok("PUT", "/api/messaging/producer/chats/u-seojun/ai-mode", producer,
    { mode: "AUTO", version: thread.version });
  return { consumer, producer };
}
async function handoff(consumer, text, key) {
  const sent = await ok("POST", C, consumer, { text }, key);
  assert.equal(sent.reply.handoffStatus, "FORWARDED");
  return sent;
}
async function pages(path, token, limit = 50) {
  const items = new Map();
  let cursor;
  for (let index = 0; index < 100; index++) {
    const params = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
    const page = await ok("GET", `${path}?${params}`, token);
    for (const message of page.items) items.set(message.messageId, message);
    cursor = page.nextCursor;
    if (!cursor) return items;
  }
  assert.fail("message pagination did not terminate within 100 pages");
}
const questions = async producer => (await ok("GET", "/api/messaging/questions?status=OPEN", producer)).items;
async function explicitCheck(consumer) {
  const sent = await ok("POST", C, consumer, { text: "소량 주문 되나요?" });
  assert.equal(sent.reply.handoffStatus, null);
  const report = await ok("POST", `${C}/${sent.reply.messageId}/report`, consumer);
  return { sent, report };
}

test("AC-13-2 mock: older pages flag the exact handoff questions, not nearby AI/plain messages, without duplicate requests", async () => {
  const { consumer, producer } = await setup();
  const first = await handoff(consumer, "농약은 얼마나 치세요? 첫 질문", "handoff-repeat");
  const repeated = await handoff(consumer, "농약은 얼마나 치세요? 첫 질문", "handoff-repeat");
  assert.equal(repeated.message.messageId, first.message.messageId);
  const second = await handoff(consumer, "농약은 언제 치세요? 다음 질문");
  const ordinary = await ok("POST", C, consumer, { text: "소량 주문 되나요?" });
  assert.equal(ordinary.reply.handoffStatus, null);
  const before = (await questions(producer)).map(q => q.escalationId).sort();
  for (const [path, token] of [[C, consumer], [P, producer]]) {
    const newest = await ok("GET", `${path}?limit=1`, token);
    assert.ok(!newest.items.some(item => item.messageId === first.message.messageId));
    const items = await pages(path, token, 1);
    for (const sent of [first, second]) {
      assert.equal(items.get(sent.message.messageId).replyRequested, true);
      assert.equal(items.get(sent.reply.messageId).replyRequested, false);
    }
    for (const message of [ordinary.message, ordinary.reply]) assert.equal(items.get(message.messageId).replyRequested, false);
    assert.ok([...items.values()].every(item => typeof item.replyRequested === "boolean"));
  }
  const after = await questions(producer);
  assert.deepEqual(after.map(q => q.escalationId).sort(), before);
  assert.equal(after.filter(q => q.question === first.message.body).length, 1);
});

test("AC-13-5 mock: quoted reply resolves only its handoff and preserves independent confirmation/correction flows", async () => {
  const { consumer, producer } = await setup();
  const first = await handoff(consumer, "농약은 얼마나 치세요? 답할 질문");
  const second = await handoff(consumer, "농약은 언제 치세요? 남길 질문");
  const check = await explicitCheck(consumer);
  const beforeTodo = (await ok("GET", "/api/orders/producer/dashboard", producer)).todo;
  const body = { text: "첫 질문에 대한 농가 답장입니다.", replyToMessageId: first.message.messageId };
  const replied = await ok("POST", P, producer, body, "handoff-answer-once");
  const repeated = await ok("POST", P, producer, body, "handoff-answer-once");
  assert.equal(repeated.message.messageId, replied.message.messageId);
  assert.equal(replied.message.replyToMessageId, first.message.messageId);
  assert.equal(replied.message.replyTo.senderType, "CONSUMER");
  let items = await pages(P, producer);
  assert.equal(items.get(first.message.messageId).replyRequested, false);
  assert.equal(items.get(second.message.messageId).replyRequested, true);
  assert.equal(items.get(check.sent.reply.messageId).replyRequested, false);
  assert.equal(items.get(check.sent.message.messageId).replyRequested, false);
  assert.equal(items.get(check.sent.reply.messageId).checkState, "REQUESTED");
  const opened = await questions(producer);
  assert.ok(!opened.some(q => q.question === first.message.body));
  assert.ok(opened.some(q => q.question === second.message.body));
  assert.ok(opened.some(q => q.escalationId === check.report.escalationId));
  const afterTodo = (await ok("GET", "/api/orders/producer/dashboard", producer)).todo;
  assert.equal(afterTodo.openQuestions, beforeTodo.openQuestions);
  assert.equal(afterTodo.aiCheckRequests, beforeTodo.aiCheckRequests);
  const rows = (await ok("GET", "/api/messaging/producer/chats", producer)).items;
  assert.equal(rows.find(row => row.consumerId === "u-seojun").needsReply, true);
  await ok("POST", `${P}/${check.sent.reply.messageId}/confirm`, producer);
  items = await pages(P, producer);
  assert.equal(items.get(check.sent.reply.messageId).checkState, "CONFIRMED");
  assert.equal(items.get(second.message.messageId).replyRequested, true);
  const { thread } = await ok("GET", P, producer);
  await ok("PUT", "/api/messaging/producer/chats/u-seojun/ai-mode", producer, { mode: "AUTO", version: thread.version });
  const correction = await explicitCheck(consumer);
  await ok("POST", P, producer, { text: "AI 안내를 수정해요.", replyToMessageId: correction.sent.reply.messageId });
  items = await pages(P, producer);
  assert.equal(items.get(correction.sent.reply.messageId).checkState, "CORRECTED");
  assert.equal(items.get(second.message.messageId).replyRequested, true);
});
