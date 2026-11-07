import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

process.env.EXPO_PUBLIC_API_MOCK = "1";
process.env.EXPO_PUBLIC_SHARED_MOCK_URL = "";
// The public client persists its token in browser storage; Node intentionally has none.
const browserStore = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: key => browserStore.get(key) ?? null,
  setItem: (key, value) => browserStore.set(key, String(value)),
  removeItem: key => browserStore.delete(key),
} });
const require = createRequire(import.meta.url);
const publicApi = require("../.expo/mock-build/packages/api/src/index.js");
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
let stored = null, serial = 0;
configureMockStorage({ read: () => stored, write: value => { stored = value; } });
publicApi.configureApi({ namespace: "consumer" });
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlVAAAAAASUVORK5CYII=";
const orderStart = { farmId: "f-halla", orderId: "o-11" };

function prepare() {
  reset();
  browserStore.clear();
  const d = db();
  d.orders["o-11"].consumerId = "u-seojun";
  d.aiSettings["f-halla"] = {
    enabled: false, version: 1, smallOrderPolicy: "", reservationShippingPolicy: "",
    faqs: [], handoffTopics: [],
  };
  assert(!d.threadMeta["f-halla:u-seojun"]);
  assert(!d.follows.some(f => f.farmId === "f-halla" && f.userId === "u-seojun"));
}
function counts() {
  const d = db();
  return {
    threads: Object.keys(d.threadMeta).length, follows: d.follows.length,
    contexts: (d.threadOrderContexts ?? []).length, inquiries: d.inquiries.length,
    messages: Object.values(d.threads).reduce((n, rows) => n + rows.length, 0),
    escalations: d.escalations.length,
  };
}
async function api(method, path, token, body, key = "order-chat-" + ++serial) {
  return mockTransport({ method, path, body, headers: {
    Authorization: token ? "Bearer " + token : "", "Idempotency-Key": key,
  } });
}
async function ok(method, path, token, body, key) {
  const response = await api(method, path, token, body, key);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}
async function login(userId, app = "consumer") {
  return (await ok("POST", "/api/auth/test-login", null, { userId, app })).accessToken;
}

test("AC-33-2: public client starts an order chat; legacy signatures still auto-follow", async () => {
  prepare();
  await publicApi.auth.testLogin("u-seojun");
  const before = counts();
  const first = await publicApi.messaging.startChat("f-halla", "public-order", { orderId: "o-11" });
  assert.deepEqual(first, { farmId: "f-halla", autoFollowed: false });
  assert.deepEqual(await publicApi.messaging.startChat("f-halla", "public-order", { orderId: "o-11" }), first);
  assert.deepEqual(counts(), { ...before, threads: before.threads + 1, contexts: 1 });
  const page = await publicApi.messaging.messages("f-halla");
  assert.deepEqual(page.items, []);
  assert.deepEqual(page.inquiries, []);
  assert.deepEqual(page.orders.map(o => o.orderId), ["o-11"]);
  assert((await publicApi.messaging.chats()).items.some(row => row.farmId === "f-halla"));
  assert.equal((await publicApi.messaging.startChat("f-halla", "general-key")).autoFollowed, true);
  assert.equal((await publicApi.messaging.startChat("f-halla")).autoFollowed, false);
});

for (const invalid of ["missing", "", "o-38"]) {
  test("AC-33-2: invalid order starts do not mutate or silently follow: " + invalid, async () => {
    prepare();
    await publicApi.auth.testLogin("u-seojun");
    const before = counts();
    await assert.rejects(
      publicApi.messaging.startChat("f-halla", "bad-order-" + invalid, { orderId: invalid }),
      e => e.status === 404,
    );
    assert.deepEqual(counts(), before);
  });
}

test("AC-33-2: start replay and history revalidate ownership, payment and farm", async () => {
  for (const change of ["owner", "unpaid", "unapproved"]) {
    prepare();
    const token = await login("u-seojun");
    await ok("POST", "/api/messaging/chats", token, orderStart, "replay");
    if (change === "owner") db().orders["o-11"].consumerId = "u-minji";
    if (change === "unpaid") db().orders["o-11"].paidAt = null;
    if (change === "unapproved") db().farms["f-halla"].status = "SUSPENDED";
    const before = counts();
    assert.equal((await api("POST", "/api/messaging/chats", token, orderStart, "replay")).status, 404);
    assert([403, 404].includes((await api("GET", "/api/messaging/chats/f-halla/messages", token)).status));
    assert(!(await ok("GET", "/api/messaging/chats", token)).items.some(row => row.farmId === "f-halla"));
    assert.deepEqual(counts(), before);
  }
});

test("AC-33-2: explicit order is required on send and cached sends cannot bypass access", async () => {
  prepare();
  const token = await login("u-seojun");
  await ok("POST", "/api/messaging/chats", token, orderStart);
  const path = "/api/messaging/chats/f-halla/messages";
  assert.equal((await api("POST", path, token, { text: "missing order" })).status, 403);
  const body = { text: "order question", orderId: "o-11" };
  const result = await ok("POST", path, token, body, "send-replay");
  assert.equal(result.message.orderId, "o-11");
  assert.equal(result.reply, null);
  assert.deepEqual(await ok("POST", path, token, body, "send-replay"), result);
  db().orders["o-11"].paidAt = null;
  const before = counts();
  assert.equal((await api("POST", path, token, body, "send-replay")).status, 403);
  assert.deepEqual(counts(), before);
});

test("AC-33-2: photos stay private in an empty order thread and after binding", async () => {
  prepare();
  const a = await login("u-seojun"), b = await login("u-minji"), wrongFarm = await login("u-kang", "producer");
  await ok("POST", "/api/messaging/chats", a, orderStart);
  const threadId = db().threadMeta["f-halla:u-seojun"].threadId;
  const photo = await ok("POST", "/api/messaging/attachments", a, { threadId, dataUrl: png });
  assert.equal((await api("POST", "/api/messaging/attachments", b, { threadId, dataUrl: png })).status, 404);
  const path = "/api/messaging/attachments/" + photo.attachmentId;
  assert.equal((await api("GET", path, b)).status, 404);
  const sent = await ok("POST", "/api/messaging/chats/f-halla/messages", a, {
    text: "", attachmentIds: [photo.attachmentId], orderId: "o-11",
  });
  assert.equal(sent.message.orderId, "o-11");
  assert.equal((await api("GET", path, a)).status, 200);
  assert.equal((await api("GET", path, b)).status, 404);
  assert.equal((await api("GET", path, wrongFarm)).status, 404);
});

test("AC-33-2: multiple paid orders, body mismatch, and HUMAN mode are preserved", async () => {
  prepare();
  const token = await login("u-minji");
  const thread = db().threadMeta["f-kang:u-minji"];
  thread.aiMode = "HUMAN"; thread.version = 8;
  db().orders["o-38"].consumerId = "u-minji";
  await ok("POST", "/api/messaging/chats", token, { farmId: "f-kang", orderId: "o-42" }, "two-orders");
  const mismatch = await api("POST", "/api/messaging/chats", token, { farmId: "f-kang", orderId: "o-38" }, "two-orders");
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.details.reason, "IDEMPOTENCY_MISMATCH");
  await ok("POST", "/api/messaging/chats", token, { farmId: "f-kang", orderId: "o-38" });
  const page = await ok("GET", "/api/messaging/chats/f-kang/messages", token);
  assert.equal(page.thread.aiMode, "HUMAN"); assert.equal(page.thread.version, 8);
  assert(page.orders.some(o => o.orderId === "o-38"));
  assert(page.orders.some(o => o.orderId === "o-42"));
  assert.equal(db().threadOrderContexts.filter(c => c.threadId === thread.threadId).length, 2);
});

test("AC-33-2: legacy inquiry after unfollow remains eligible", async () => {
  prepare();
  const token = await login("u-seojun");
  await ok("DELETE", "/api/farms/f-kang/follow", token);
  await ok("POST", "/api/orders/o-38/inquiries", token, { type: "OTHER", text: "delivery" });
  const page = await ok("GET", "/api/messaging/chats/f-kang/messages", token);
  assert.equal(page.thread.aiMode, "HUMAN");
  assert.equal(page.inquiries.length, 1);
  assert(page.orders.some(o => o.orderId === "o-38"));
});

test("AC-33-2: older schema-9 state reads safely without dropping conversations; reset is clean", async () => {
  prepare();
  const old = structuredClone(db());
  delete old.threadOrderContexts;
  const beforeThreads = Object.keys(old.threadMeta);
  stored = JSON.stringify(old);
  configureMockStorage({ read: () => stored, write: value => { stored = value; } });
  const token = await login("u-seojun");
  await ok("GET", "/api/messaging/chats", token);
  assert.equal(db().threadOrderContexts, undefined);
  assert.deepEqual(Object.keys(db().threadMeta), beforeThreads);
  await ok("POST", "/api/messaging/chats", token, orderStart);
  assert.equal(db().threadOrderContexts.length, 1);
  reset();
  assert.deepEqual(db().threadOrderContexts, []);
});

test("AC-12-1: other consumer, wrong role, unpaid order, and anonymous starts are denied", async () => {
  prepare();
  const other = await login("u-minji"), producer = await login("u-kang", "producer");
  assert.equal((await api("POST", "/api/messaging/chats", null, orderStart)).status, 401);
  assert.equal((await api("POST", "/api/messaging/chats", producer, orderStart)).status, 403);
  assert.equal((await api("POST", "/api/messaging/chats", other, orderStart)).status, 404);
  const owner = await login("u-seojun");
  db().orders["o-11"].paidAt = null;
  assert.equal((await api("POST", "/api/messaging/chats", owner, orderStart)).status, 404);
});
