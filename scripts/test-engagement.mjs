// DEV-465: committed actions, cancellation, boundaries, authorization and account isolation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
const { temperature } = require("../.expo/mock-build/packages/api/src/mock/engagement.js");
configureMockStorage({ read: () => null, write: () => {} });
let seq = 0;
const api = (method, path, token, body) => mockTransport({ method, path, body, headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": `eng-${++seq}` } });
async function ok(...args) { const r = await api(...args); assert.equal(r.status, 200, JSON.stringify(r)); return structuredClone(r.body); }
const login = async (id, app = "consumer") => (await ok("POST", "/api/auth/test-login", null, { userId: id, app })).accessToken;
const ACH = "/api/engagement/achievements";
const reportPath = "/api/engagement/farms/f-kang/reports";
const task = (page, id) => page.tasks.find(t => t.id === id);
const NOW = "2026-11-24T03:00:00.000Z";
const message = (id, senderType, createdAt = NOW) => ({ messageId: id, senderType, createdAt, body: "실제 메시지", photos: [], masked: false, sourceSummary: null, handoffStatus: null });
function emptyEvidence() {
  reset();
  const d = db();
  d.follows = []; d.news = []; d.reactions = []; d.threads = {}; d.roomReplies = [];
  d.orders = {}; d.verifiedReviews = {}; d.farmReports = [];
  return d;
}

test("AC-ENG-1: unique first-follow receipts survive repeat, unfollow, reload and concurrent requests", async () => {
  reset();
  const token = await login("u-seojun");
  const path = "/api/farms/f-kang/follow";
  const results = await Promise.all([ok("PUT", path, token), ok("PUT", path, token)]);
  assert.deepEqual(results.map(r => r.firstFollow).sort(), [false, true]);
  assert.ok(results.every(r => r.fanNumber === 2)); // One recorded fan, not the fixture's display count.
  assert.equal(db().follows.filter(f => f.farmId === "f-kang" && f.userId === "u-seojun").length, 1);
  assert.equal((await ok("DELETE", path, token)).firstFollow, false);
  const back = await ok("PUT", path, token);
  assert.equal(back.firstFollow, false); assert.equal(back.fanNumber, 2);
  let stored = JSON.stringify(db());
  configureMockStorage({ read: () => stored, write: value => { stored = value; } });
  assert.equal((await ok("PUT", path, token)).fanNumber, 2);
  const before = JSON.stringify(db().followReceipts);
  assert.equal((await api("PUT", "/api/farms/f-stop/follow", token)).status, 404);
  assert.equal(JSON.stringify(db().followReceipts), before);
  configureMockStorage({ read: () => null, write: () => {} });
});

test("AC-ENG-4: tasks change only after saved actions, cancel accurately, and isolate accounts", async () => {
  const d = emptyEvidence();
  // Keep one actual published news fixture for the like action.
  d.news.push({ broadcastId: "eng-news", farmId: "f-kang", body: "수확 소식", createdAt: NOW, photos: [], visibility: "PUBLIC", baseReactions: 999 });
  const consumer = await login("u-seojun");
  const other = await login("u-minji");
  const start = await ok("GET", ACH, consumer);
  assert.equal(start.total, 5); assert.equal(start.completedCount, 0);
  assert.ok(start.tasks.every(t => !t.completed && t.progress === 0 && t.target === 1));
  assert.equal((await api("POST", ACH, consumer, { completed: true })).status, 404);
  assert.equal((await ok("GET", ACH, consumer)).completedCount, 0);
  await ok("PUT", "/api/farms/f-kang/follow", consumer);
  await ok("PUT", "/api/messaging/news/eng-news/reaction", consumer);
  await ok("POST", "/api/messaging/rooms/f-kang/messages", consumer, { text: "농가님 안녕하세요" });
  const done = await ok("GET", ACH, consumer);
  assert.equal(done.completedCount, 3);
  for (const id of ["first_follow", "first_reaction", "first_message"]) assert.equal(task(done, id).completed, true);
  assert.equal((await ok("GET", ACH, other)).completedCount, 0);
  await ok("DELETE", "/api/farms/f-kang/follow", consumer);
  await ok("DELETE", "/api/messaging/news/eng-news/reaction", consumer);
  const reversed = await ok("GET", ACH, consumer);
  assert.equal(task(reversed, "first_follow").completed, false);
  assert.equal(task(reversed, "first_reaction").completed, false);
  assert.equal(task(reversed, "first_message").completed, true);
  assert.equal((await api("GET", ACH)).status, 401);
  const producer = await login("u-kang", "producer");
  assert.equal((await api("GET", ACH, producer)).status, 403);
});

test("AC-ENG-3/4: verified review uses actual purchase confirmation; edit replaces, refund revokes", async () => {
  reset();
  const consumer = await login("u-minji");
  const other = await login("u-seojun");
  const path = "/api/engagement/reviews/o-07";
  assert.equal(task(await ok("GET", ACH, consumer), "first_purchase").completed, false);
  assert.equal((await api("PUT", path, consumer, { stars: 5 })).status, 409);
  await ok("POST", "/api/orders/o-07/confirm", consumer);
  assert.ok(db().orders["o-07"].completedAt);
  assert.equal(task(await ok("GET", ACH, consumer), "first_purchase").completed, true);
  assert.deepEqual(await ok("GET", path, consumer), { orderId: "o-07", stars: null });
  for (const stars of [0, 6, 1.5, true, "5", null]) assert.equal((await api("PUT", path, consumer, { stars })).status, 400);
  assert.equal(Object.keys(db().verifiedReviews).length, 0);
  assert.equal((await api("PUT", path, other, { stars: 5 })).status, 404);
  const farm = db().products[db().orders["o-07"].productId].farmId;
  for (const [stars, points] of [[1,-1],[2,-1],[3,0],[4,1],[5,1]]) {
    await ok("PUT", path, consumer, { stars });
    assert.equal(temperature(db(), farm).contributions.R, points);
    assert.equal(Object.keys(db().verifiedReviews).length, 1);
  }
  assert.equal(task(await ok("GET", ACH, consumer), "first_review").completed, true);
  db().orders["o-07"].refundedAt = new Date().toISOString();
  assert.equal(temperature(db(), farm).contributions.R, 0);
  const revoked = await ok("GET", ACH, consumer);
  assert.equal(task(revoked, "first_purchase").completed, false);
  assert.equal(task(revoked, "first_review").completed, false);
  assert.equal((await ok("GET", path, consumer)).stars, null);
  assert.equal((await api("PUT", path, consumer, { stars: 4 })).status, 409);
});

test("AC-ENG-3: reports persist without penalty, validate bounds, deduplicate incidents and reverse", async () => {
  emptyEvidence();
  const first = await login("u-minji");
  const second = await login("u-seojun");
  db().tokens["eng-admin"] = "u-farmclub";
  for (const reason of ["짧은 사유", "x".repeat(1001), null]) assert.equal((await api("POST", reportPath, first, { reason })).status, 400);
  assert.equal(db().farmReports.length, 0);
  const a = await ok("POST", reportPath, first, { reason: "x".repeat(10) });
  assert.equal(a.status, "PENDING"); assert.equal(temperature(db(), "f-kang").contributions.M, 0);
  assert.deepEqual(await ok("POST", reportPath, first, { reason: "다른 내용은 처음 신고를 덮지 않아요" }), a);
  assert.equal(db().farmReports[0].reason, "x".repeat(10));
  const b = await ok("POST", reportPath, second, { reason: "x".repeat(1000) });
  assert.equal((await api("GET", "/api/engagement/reports", first)).status, 403);
  const queue = await ok("GET", "/api/engagement/reports?limit=1", "eng-admin");
  assert.equal(queue.items.length, 1); assert.ok(queue.nextCursor);
  assert.equal(queue.items[0].reason, "x".repeat(10));
  assert.equal("consumerId" in queue.items[0], false);
  const secondPage = await ok("GET", `/api/engagement/reports?limit=1&cursor=${encodeURIComponent(queue.nextCursor)}`, "eng-admin");
  assert.equal(secondPage.items[0].reportId, b.reportId); assert.equal(secondPage.nextCursor, null);
  for (const query of ["limit=0", "limit=51", "limit=1.5", "cursor=bad", "status=INVALID"]) assert.equal((await api("GET", `/api/engagement/reports?${query}`, "eng-admin")).status, 400);
  const decision = id => `/api/engagement/reports/${id}`;
  assert.equal((await api("PATCH", decision(a.reportId), first, { status: "CONFIRMED", incidentKey: "one" })).status, 403);
  for (const incidentKey of ["", " ", "x".repeat(101), 123]) assert.equal((await api("PATCH", decision(a.reportId), "eng-admin", { status: "CONFIRMED", incidentKey })).status, 400);
  for (const row of [a,b]) await ok("PATCH", decision(row.reportId), "eng-admin", { status: "CONFIRMED", incidentKey: "same-incident" });
  assert.equal(temperature(db(), "f-kang").contributions.M, 1);
  db().users["u-minji"].deleted = true;
  assert.equal(temperature(db(), "f-kang").contributions.M, 1); // Adjudicated incident persists independently of reporter.
  await ok("PATCH", decision(a.reportId), "eng-admin", { status: "OVERTURNED" });
  assert.equal(temperature(db(), "f-kang").contributions.M, 1);
  await ok("PATCH", decision(b.reportId), "eng-admin", { status: "REJECTED" });
  assert.equal(temperature(db(), "f-kang").temperatureTenths, 365);
});

test("AC-ENG-2: rolling-window endpoints, KST daily/weekly caps, saved actors and real human response", () => {
  const d = emptyEvidence();
  const post = (id, at, visibility = "PUBLIC") => ({ broadcastId: id, farmId: "f-kang", body: "소식", photos: [], createdAt: at, visibility, baseReactions: 999 });
  d.news = [post("lower", "2026-10-27T03:00:00.000Z"), post("too-old", "2026-10-27T02:59:59.999Z"), post("upper", NOW), post("future", "2026-11-24T03:00:00.001Z"), post("private", "2026-11-23T03:00:00.000Z", "FOLLOWERS")];
  assert.equal(temperature(d, "f-kang", NOW).contributions.P, 2);
  d.news = [post("1", "2026-11-22T14:59:59.999Z"), post("2", "2026-11-22T15:00:00.000Z"), post("3", "2026-11-23T14:59:59.999Z"), post("4", "2026-11-23T15:00:00.000Z")];
  assert.equal(temperature(d, "f-kang", NOW).contributions.P, 3); // Sunday + Monday (twice) + Tuesday.
  d.reactions = [{ broadcastId: "1", userId: "u-minji", createdAt: "2026-10-27T03:00:00.000Z" }, { broadcastId: "2", userId: "u-minji", createdAt: NOW }, { broadcastId: "2", userId: "u-kang", createdAt: NOW }, { broadcastId: "gone", userId: "u-seojun", createdAt: NOW }];
  d.threads["f-kang:u-minji"] = [message("c", "CONSUMER", "2020-01-01T00:00:00.000Z"), message("a", "AI"), message("p", "PRODUCER")];
  d.threads["f-kang:u-seojun"] = [message("p2", "PRODUCER"), message("c2", "CONSUMER")];
  let c = temperature(d, "f-kang", NOW).contributions;
  assert.equal(c.L, 1); assert.equal(c.H, 1);
  d.users["u-minji"].deleted = true;
  c = temperature(d, "f-kang", NOW).contributions;
  assert.equal(c.L, 0); assert.equal(c.H, 0);
  d.news = [];
  assert.equal(temperature(d, "f-kang", NOW).contributions.P, 0);
  d.news = [post("sun", "2026-11-22T14:00:00.000Z"), ...[23,24,25,26].map(day => post(`day-${day}`, `2026-11-${day}T03:00:00.000Z`))];
  assert.equal(temperature(d, "f-kang", "2026-11-27T03:00:00.000Z").contributions.P, 4); // Prior Sunday + max three this week.
});

test("AC-ENG-2: caps and final-only clamping retain overflowing evidence for reversals", () => {
  const d = emptyEvidence();
  for (let i = 0; i < 101; i++) {
    const userId = `fan-${i}`;
    d.users[userId] = { userId, role: "CONSUMER", name: "손님", farmId: null };
    d.follows.push({ userId, farmId: "f-kang" });
    d.reactions.push({ userId, broadcastId: "live", createdAt: NOW });
    d.threads[`f-kang:${userId}`] = [message(`c${i}`, "CONSUMER"), message(`p${i}`, "PRODUCER")];
  }
  d.news = [{ broadcastId: "live", farmId: "f-kang", createdAt: NOW, body: "소식", photos: [], visibility: "PUBLIC", baseReactions: 0 }];
  let c = temperature(d, "f-kang", NOW).contributions;
  assert.equal(c.F, 100); assert.equal(c.L, 30); assert.equal(c.H, 30);
  d.follows = []; d.reactions = []; d.threads = {}; d.news = [];
  for (let i = 0; i < 700; i++) {
    const id = `review-${i}`;
    d.orders[id] = { orderId: id, consumerId: "u-minji", productId: "p-house", status: "COMPLETED", completedAt: NOW, refundedAt: null };
    d.verifiedReviews[id] = { orderId: id, consumerId: "u-minji", stars: 5 };
  }
  assert.equal(temperature(d, "f-kang", NOW).temperatureTenths, 990);
  delete d.verifiedReviews["review-0"];
  assert.equal(temperature(d, "f-kang", NOW).temperatureTenths, 990);
  d.verifiedReviews = {};
  for (let i = 0; i < 400; i++) d.farmReports.push({ reportId: `r-${i}`, farmId: "f-kang", consumerId: "u-minji", reason: "검증된 사건 테스트", status: "CONFIRMED", incidentKey: `incident-${i}` });
  assert.equal(temperature(d, "f-kang", NOW).temperatureTenths, 0);
  d.farmReports[0].status = "OVERTURNED";
  assert.equal(temperature(d, "f-kang", NOW).temperatureTenths, 0);
});
