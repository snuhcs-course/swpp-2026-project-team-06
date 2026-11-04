// 정지·반려 농가의 farmclub 운영팀 대화방 Mock 계약(DEV-209, AC-34-9). 서버 tests/test_support.py AC-34-9와 같다
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { configureMockStorage, REJECTED_FIRST, SUSPENDED_FIRST } = require(
  "../.expo/mock-build/packages/api/src/mock/db.js",
);
let stored = null;
configureMockStorage({ read: () => stored, write: (s) => (stored = s) });
let n = 0;
const api = (method, path, token, body, key = `support-${++n}`) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
  });
const ok = async (...args) => {
  const r = await api(...args);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body;
};
const login = async (id, app) =>
  (await ok("POST", "/api/auth/test-login", null, { userId: id, app })).accessToken;
const ROOM = "/api/messaging/producer/support";

test("DEV-209 AC-34-9: suspended producer opens only the farmclub room and can send with masking", async () => {
  const t = await login("u-taeho", "producer");
  assert.equal((await api("GET", "/api/messaging/producer/chats", t)).status, 403);
  const page = await ok("GET", `${ROOM}/messages`, t);
  assert.deepEqual(
    page.items.map((m) => [m.senderType, m.body]),
    [["OPERATOR", SUSPENDED_FIRST]],
  );
  const sent = await ok("POST", `${ROOM}/messages`, t, {
    text: "010-1234-5678로 연락 주세요",
    attachmentIds: [],
  });
  assert.equal(sent.message.senderType, "PRODUCER");
  assert.equal(sent.message.masked, true);
  const again = await ok("GET", `${ROOM}/messages`, t);
  assert.equal(again.items.length, 2);
  const read = await ok("PUT", `${ROOM}/read`, t, {
    lastReadMessageId: again.items[0].messageId,
  });
  assert.equal(read.unreadCount, 0);
});

test("DEV-209 AC-34-9: rejected producer room is created once; pending and consumers are refused", async () => {
  const s = await login("u-soonja", "producer");
  await ok("GET", `${ROOM}/messages`, s);
  const page = await ok("GET", `${ROOM}/messages`, s);
  assert.deepEqual(page.items.map((m) => m.body), [REJECTED_FIRST]);
  const pending = await login("u-misook", "producer");
  assert.equal((await api("GET", `${ROOM}/messages`, pending)).status, 403);
  const consumer = await login("u-minji", "consumer");
  assert.equal((await api("GET", `${ROOM}/messages`, consumer)).status, 403);
});
