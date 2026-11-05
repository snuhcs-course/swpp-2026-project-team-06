// Specification-only tests: public helper and Mock API, no implementation inspection.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { sortChatMessages } from "../packages/ui/src/chatOrder.ts";
const ids = rows => rows.map(m => m.messageId);
const at = "2026-11-05T01:00:00Z";

test("DEV-235: equal-time question precedes reply by saved sequence regardless of random IDs", () => {
  const reply = { messageId: "m-000", sequence: 82, createdAt: at };
  const question = { messageId: "m-fff", sequence: 81, createdAt: at };
  assert.deepEqual(ids(sortChatMessages([reply, question])), ["m-fff", "m-000"]);
});

test("DEV-235: saved sequence remains authoritative when clocks disagree", () => {
  const rows = [
    { messageId: "third", sequence: 23, createdAt: "2026-11-03T00:00:00Z" },
    { messageId: "first", sequence: 21, createdAt: "2026-11-05T00:00:00Z" },
    { messageId: "second", sequence: 22, createdAt: "2026-11-04T00:00:00Z" },
  ];
  assert.deepEqual(ids(sortChatMessages(rows)), ["first", "second", "third"]);
});

test("DEV-235: readonly input and message objects stay untouched, including empty/singleton", () => {
  const rows = Object.freeze([
    Object.freeze({ messageId: "b", sequence: 2, createdAt: at }),
    Object.freeze({ messageId: "a", sequence: 1, createdAt: at }),
  ]);
  const sorted = sortChatMessages(rows);
  assert.deepEqual(ids(sorted), ["a", "b"]);
  assert.deepEqual(ids(rows), ["b", "a"]);
  assert.notEqual(sorted, rows);
  assert.equal(sorted[0], rows[1]);
  assert.deepEqual(sortChatMessages(Object.freeze([])), []);
  assert.deepEqual(sortChatMessages(Object.freeze([rows[0]])), [rows[0]]);
});

test("DEV-235: old API sorts timestamps, preserves provided order for ties and ignores IDs", () => {
  const rows = [
    { messageId: "z-question", createdAt: at },
    { messageId: "a-answer", createdAt: at },
    { messageId: "earlier", createdAt: "2026-11-04T01:00:00Z" },
  ];
  assert.deepEqual(ids(sortChatMessages(rows)), ["earlier", "z-question", "a-answer"]);
});

test("DEV-235: mixed old/new API pages use one consistent timestamp order with stable ties", () => {
  const rows = [
    { messageId: "later-but-low-sequence", sequence: 1, createdAt: "2026-11-05T03:00:00Z" },
    { messageId: "old-question", createdAt: "2026-11-05T02:00:00Z" },
    { messageId: "early-but-high-sequence", sequence: 9, createdAt: "2026-11-05T01:00:00Z" },
    { messageId: "new-answer", sequence: 10, createdAt: "2026-11-05T02:00:00Z" },
  ];
  assert.deepEqual(ids(sortChatMessages(rows)), ["early-but-high-sequence", "old-question", "new-answer", "later-but-low-sequence"]);
});

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { configureMockStorage, db } = require("../.expo/mock-build/packages/api/src/mock/db.js");
let stored = null, n = 0;
configureMockStorage({ read: () => stored, write: value => { stored = value; } });
async function api(method, path, token, body) {
  const r = await mockTransport({ method, path, body, headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": `chat-display-${++n}` } });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body;
}

test("DEV-235 Mock: identical timestamps and misleading historic IDs preserve storage order across pages", async () => {
  const consumer = (await api("POST", "/api/auth/test-login", null, { userId: "u-minji", app: "consumer" })).accessToken;
  const producer = (await api("POST", "/api/auth/test-login", null, { userId: "u-kang", app: "producer" })).accessToken;
  const expected = ["z-question", "a-reply", "m-9", "m-10", "m-2"];
  db().threads["f-kang:u-minji"] = expected.map((messageId, i) => ({
    messageId, senderType: i % 2 ? "PRODUCER" : "CONSUMER", body: messageId,
    createdAt: at, sourceRefs: [], sourceSummary: null, photos: [], attachmentIds: [], handoffStatus: null,
  }));
  for (const [path, token] of [["/api/messaging/chats/f-kang/messages", consumer], ["/api/messaging/producer/chats/u-minji/messages", producer]]) {
    const first = await api("GET", path, token);
    assert.deepEqual(ids(first.items), expected);
    let cursor, collected = [], visited = new Set();
    do {
      const page = await api("GET", `${path}?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, token);
      collected = [...page.items, ...collected];
      cursor = page.nextCursor;
      if (cursor) { assert.ok(!visited.has(cursor), "cursor must advance"); visited.add(cursor); }
    } while (cursor);
    assert.deepEqual(ids(collected), expected);
    assert.equal(new Set(ids(collected)).size, expected.length);
  }
});
