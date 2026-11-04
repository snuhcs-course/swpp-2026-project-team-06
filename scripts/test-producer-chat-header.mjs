// 생산자 1:1 머리 이름 Mock 계약(DEV-232). 새로고침·직접 링크로 열어 route param이 없어도 대화 응답의
// consumerName(목록과 같은 가림 이름)으로 머리 이름을 그린다. 서버 tests/test_messaging.py test_DEV_232_*와 같다
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
let stored = null;
configureMockStorage({ read: () => stored, write: (s) => (stored = s) });
let n = 0;
const api = (method, path, token, body) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": `header-${++n}` },
  });
const ok = async (...args) => {
  const r = await api(...args);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body;
};
const login = async (id, app) =>
  (await ok("POST", "/api/auth/test-login", null, { userId: id, app })).accessToken;

test("DEV-232: producer room opened directly has the same masked name as the list", async () => {
  const t = await login("u-kang", "producer");
  const rows = (await ok("GET", "/api/messaging/producer/chats", t)).items;
  assert.ok(rows.length > 1);
  for (const row of rows) {
    // 목록을 거치지 않고(= 새로고침·링크) 대화만 연다
    const page = await ok("GET", `/api/messaging/producer/chats/${row.consumerId}/messages`, t);
    assert.equal(page.consumerName, row.consumerName);
  }
  const minji = await ok("GET", "/api/messaging/producer/chats/u-minji/messages", t);
  assert.equal(minji.consumerName, "김○○");
  assert.ok(rows.some((r) => r.isSupport && r.consumerName === "farmclub"));
});

test("DEV-232: consumer room has no consumerName", async () => {
  const t = await login("u-minji", "consumer");
  const page = await ok("GET", "/api/messaging/chats/f-kang/messages", t);
  assert.equal(page.consumerName, null);
});
