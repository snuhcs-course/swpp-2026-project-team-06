// DEV-296 (FEAT-13 AC-13-11·12·13): Mock도 서버처럼 AI 답변 확인 요청 깃발을 계산한다.
// 요청 → checkState REQUESTED·건수, '답이 맞아요' → CONFIRMED(답장 없음·멱등), 인용 답장 → CORRECTED.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });
let seq = 0;
const api = (method, path, token, body, key = `flag-${++seq}`) =>
  mockTransport({ method, path, body, headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key } });
async function ok(...args) {
  const response = await api(...args);
  assert.equal(response.status, 200, JSON.stringify(response));
  return structuredClone(response.body);
}
const login = async (id, app) => (await ok("POST", "/api/auth/test-login", null, { userId: id, app })).accessToken;
const CHATS = "/api/messaging/producer/chats";

/** 김민지 대화에 AI 답변을 만들고 확인 요청한다. 시드 전달 질문(e-1)은 닫아 확인 요청만 남긴다 */
async function requested() {
  reset();
  const consumer = await login("u-minji", "consumer");
  const producer = await login("u-kang", "producer");
  db().escalations.find((e) => e.escalationId === "e-1").status = "ANSWERED";
  const settings = await ok("GET", "/api/farms/me/ai-settings", producer);
  await ok("PUT", "/api/farms/me/ai-settings", producer, { ...settings, smallOrderPolicy: "1kg부터 주문할 수 있어요." });
  const thread = db().threadMeta["f-kang:u-minji"];
  await ok("PUT", `${CHATS}/u-minji/ai-mode`, producer, { mode: "AUTO", version: thread.version });
  const before = await ok("GET", "/api/orders/producer/dashboard", producer);
  const sent = await ok("POST", "/api/messaging/chats/f-kang/messages", consumer, { text: "소량 주문 되나요?" });
  assert.equal(sent.reply.senderType, "AI");
  const answerId = sent.reply.messageId;
  const report = await ok("POST", `/api/messaging/chats/f-kang/messages/${answerId}/report`, consumer);
  return { consumer, producer, answerId, report, before };
}
const state = (page, id) => page.items.find((m) => m.messageId === id).checkState;
const row = async (producer) => (await ok("GET", CHATS, producer)).items.find((r) => r.consumerId === "u-minji");

test("AC-13-11: Mock shows REQUESTED to both sides and counts checks apart from openQuestions", async () => {
  const { consumer, producer, answerId, before } = await requested();
  const consumerPage = await ok("GET", "/api/messaging/chats/f-kang/messages", consumer);
  const producerPage = await ok("GET", `${CHATS}/u-minji/messages`, producer);
  for (const page of [consumerPage, producerPage]) {
    assert.equal(state(page, answerId), "REQUESTED");
    assert.ok(page.items.filter((m) => m.messageId !== answerId).every((m) => !m.checkState));
  }
  const r = await row(producer);
  assert.equal(r.aiCheckRequests, 1);
  assert.equal(r.needsReply, true);
  const todo = (await ok("GET", "/api/orders/producer/dashboard", producer)).todo;
  assert.equal(todo.aiCheckRequests, 1);
  assert.equal(todo.openQuestions, before.todo.openQuestions);
});

test("AC-13-12: Mock confirm closes without a message, is idempotent and rejects non-requested answers", async () => {
  const { consumer, producer, answerId, report } = await requested();
  const count = db().threads["f-kang:u-minji"].length;
  const version = db().threadMeta["f-kang:u-minji"].version;
  const path = `${CHATS}/u-minji/messages/${answerId}/confirm`;
  const first = await ok("POST", path, producer);
  const second = await ok("POST", path, producer, undefined, "repeat-confirm");
  assert.equal(first.checkState, "CONFIRMED");
  assert.equal(second.checkState, "CONFIRMED");
  const stored = db().escalations.find((e) => e.escalationId === report.escalationId);
  assert.equal(stored.status, "ANSWERED");
  assert.equal(stored.resolution, "CONFIRMED");
  assert.equal(stored.resolvedBy, "u-kang");
  assert.equal(stored.answer, null);
  assert.equal(db().threads["f-kang:u-minji"].length, count);
  assert.equal(db().threadMeta["f-kang:u-minji"].version, version);
  assert.equal(state(await ok("GET", "/api/messaging/chats/f-kang/messages", consumer), answerId), "CONFIRMED");
  assert.equal((await row(producer)).aiCheckRequests, 0);
  assert.equal((await ok("GET", "/api/orders/producer/dashboard", producer)).todo.aiCheckRequests, 0);
  const plain = (await ok("POST", "/api/messaging/chats/f-kang/messages", consumer, { text: "소량 주문 되나요?" })).reply;
  assert.equal(plain.senderType, "AI");
  assert.equal((await api("POST", `${CHATS}/u-minji/messages/${plain.messageId}/confirm`, producer)).status, 404);
  assert.equal((await api("POST", `${CHATS}/u-minji/messages/m-nope/confirm`, producer)).status, 404);
  assert.equal((await api("POST", `${CHATS}/u-seojun/messages/${answerId}/confirm`, producer)).status, 404);
});

test("AC-13-13: Mock correction reply quotes the AI answer, marks CORRECTED and blocks later confirm", async () => {
  const { consumer, producer, answerId, report } = await requested();
  const sent = await ok("POST", `${CHATS}/u-minji/messages`, producer, { text: "5kg부터만 받아요.", replyToMessageId: answerId });
  assert.equal(sent.message.replyTo.senderType, "AI");
  const stored = db().escalations.find((e) => e.escalationId === report.escalationId);
  assert.equal(stored.resolution, "CORRECTED");
  assert.equal(stored.resolvedBy, "u-kang");
  assert.equal(state(await ok("GET", "/api/messaging/chats/f-kang/messages", consumer), answerId), "CORRECTED");
  const late = await api("POST", `${CHATS}/u-minji/messages/${answerId}/confirm`, producer);
  assert.equal(late.status, 409);
  assert.equal(late.body.details.reason, "ALREADY_CORRECTED");
});

test("AC-13-13: Mock answer without a quote still quotes the AI answer it corrects", async () => {
  const { consumer, producer, answerId, report } = await requested();
  const answered = await ok("POST", `/api/messaging/questions/${report.escalationId}/answer`, producer, { text: "5kg부터예요." });
  assert.equal(answered.resolution, "CORRECTED");
  const page = await ok("GET", "/api/messaging/chats/f-kang/messages", consumer);
  assert.equal(state(page, answerId), "CORRECTED");
  assert.equal(page.items.at(-1).replyToMessageId, answerId);
  // 인용 없는 일반 답장은 확인 요청을 닫지 않는다
  const again = await requested();
  await ok("POST", `${CHATS}/u-minji/messages`, again.producer, { text: "확인해 볼게요." });
  assert.equal(state(await ok("GET", "/api/messaging/chats/f-kang/messages", again.consumer), again.answerId), "REQUESTED");
});

test("AC-13-13: Mock reply quoting the consumer question does not close the check request", async () => {
  const { consumer, producer, answerId, report } = await requested();
  const question = db().escalations.find((e) => e.escalationId === report.escalationId).questionMessageId;
  await ok("POST", `${CHATS}/u-minji/messages`, producer, { text: "질문 확인했어요.", replyToMessageId: question });
  assert.equal(state(await ok("GET", "/api/messaging/chats/f-kang/messages", consumer), answerId), "REQUESTED");
  assert.equal((await row(producer)).aiCheckRequests, 1);
});
