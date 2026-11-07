// 원산지 표시제도 안내 읽음 Mock 계약(DEV-121, 원산지표시법 제6조 ⑥·시행규칙 제4조의2 1호).
// 서버 tests/test_origin_notice.py와 같은 규칙: 생산자만, 지금 버전만, 처음 시각 유지. 세 곳의 버전이 같다
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { configureMockStorage, ORIGIN_NOTICE_VERSION } = require("../.expo/mock-build/packages/api/src/mock/db.js");
let stored = null;
configureMockStorage({ read: () => stored, write: (s) => (stored = s) });
let n = 0;
const api = (method, path, token, body) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": `notice-${++n}` },
  });
const ok = async (...args) => {
  const r = await api(...args);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body;
};
const login = async (id, app) =>
  (await ok("POST", "/api/auth/test-login", null, { userId: id, app })).accessToken;
const read = (t, version = ORIGIN_NOTICE_VERSION, kind = "ORIGIN") =>
  api("POST", "/api/auth/me/notices", t, { kind, version });

test("DEV-121: server, Mock and the notice text share one origin notice version", async () => {
  const server = (await readFile("server/app/accounts/schemas.py", "utf8")).match(/^ORIGIN_NOTICE_VERSION = "([^"]+)"/m)?.[1];
  const ui = (await readFile("packages/ui/src/legalContent.ts", "utf8")).match(/ORIGIN_NOTICE_VERSION = "([^"]+)"/)?.[1];
  assert.ok(server);
  assert.equal(ORIGIN_NOTICE_VERSION, server);
  assert.equal(ui, server);
});

test("DEV-121 AC-14-6: producer starts unread, reading records the first time once", async () => {
  const t = await login("u-kang", "producer");
  assert.equal((await ok("GET", "/api/auth/me", t)).originNoticeReadAt, null);
  const first = await read(t);
  assert.equal(first.status, 200);
  assert.equal(first.body.kind, "ORIGIN");
  const me = await ok("GET", "/api/auth/me", t);
  assert.equal(me.originNoticeReadAt, first.body.readAt);
  const again = await read(t);
  assert.equal(again.body.readAt, first.body.readAt);
});

test("DEV-121: old version and unknown kind are rejected, consumers are forbidden", async () => {
  // 앞 시험과 다른 농가(같은 Mock 상태를 이어 쓴다)
  const t = await login("u-misook", "producer");
  assert.equal((await read(t, "2000-01-01")).status, 400);
  assert.equal((await read(t, ORIGIN_NOTICE_VERSION, "MARKETING")).status, 400);
  assert.equal((await ok("GET", "/api/auth/me", t)).originNoticeReadAt, null);
  const c = await login("u-minji", "consumer");
  assert.equal((await read(c)).status, 403);
  assert.equal((await ok("GET", "/api/auth/me", c)).originNoticeReadAt, null);
});
