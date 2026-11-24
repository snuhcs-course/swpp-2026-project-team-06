// DEV-455: Mock must implement the same public undo and farm/privacy contract.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });
let sequence = 0;
const nextKey = () => `dev455-contract-${++sequence}`;
const api = (method, path, token, body, key = nextKey()) => mockTransport({
  method, path, body,
  headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
});
async function ok(method, path, token, body, key) {
  const response = await api(method, path, token, body, key);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return structuredClone(response.body);
}
const login = async (userId, app) => (await ok("POST", "/api/auth/test-login", null, { userId, app })).accessToken;
const undo = (token, oid, actionId, key) => api("POST", `/api/orders/${oid}/undo`, token, { actionId }, key);
const actionId = row => {
  assert.ok(row.undoAction?.actionId, JSON.stringify(row));
  return row.undoAction.actionId;
};
const assertConflict = response => {
  assert.equal(response.status, 409, JSON.stringify(response.body));
  assert.equal(response.body.details.reason, "UNDO_CONFLICT");
};
async function fixture() {
  reset();
  const consumer = await login("u-minji", "consumer");
  const producer = await login("u-kang", "producer");
  const order = await ok("POST", "/api/orders", consumer, {
    productId: "p-house", optionId: "opt-5", quantity: 1,
    recipientName: "실행취소 수령인", recipientPhone: "010-1234-5678", postalCode: "04001",
    address: "서울 마포구 월드컵북로 12", addressDetail: "302호", deliveryNote: "문 앞",
    consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
    consentVersion: "dev455",
  });
  const oid = order.orderId;
  await ok("POST", `/api/orders/${oid}/deposit`, consumer, {});
  return { oid, consumer, producer };
}

test("DEV-455 Mock: list retains undo and replay never rolls back a later confirmation", async () => {
  const { oid, consumer, producer } = await fixture();
  const before = structuredClone(await ok("GET", `/api/orders/${oid}`, consumer));
  const first = await ok("POST", `/api/orders/${oid}/confirm-deposit`, producer, {});
  const aid = actionId(first);
  const list = await ok("GET", "/api/orders/producer?limit=50", producer);
  assert.equal(list.items.find(o => o.orderId === oid).undoAction.actionId, aid);
  const key = nextKey();
  assert.equal((await undo(producer, oid, aid, key)).status, 200);
  const restored = await ok("GET", `/api/orders/${oid}`, consumer);
  assert.equal(restored.status, "AWAITING_DEPOSIT");
  assert.equal(restored.paidAt, before.paidAt);
  assert.equal(restored.depositDueAt, before.depositDueAt);
  const later = await ok("POST", `/api/orders/${oid}/confirm-deposit`, producer, {});
  assert.notEqual(actionId(later), aid);
  for (const requestKey of [key, nextKey()]) {
    const replay = await undo(producer, oid, aid, requestKey);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.status, "PREPARING");
    assert.equal(replay.body.undoAction.actionId, actionId(later));
  }
  const mismatch = await undo(producer, oid, actionId(later), key);
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.details.reason, "IDEMPOTENCY_MISMATCH");
  assert.equal((await ok("GET", `/api/orders/${oid}`, consumer)).status, "PREPARING");
});

test("DEV-455 Mock: consumer, other approved farm and unapproved producer cannot undo or inspect snapshots", async () => {
  const { oid, consumer, producer } = await fixture();
  const confirmed = await ok("POST", `/api/orders/${oid}/confirm-deposit`, producer, {});
  const aid = actionId(confirmed);
  const before = structuredClone(db().orders[oid]);
  db().farms["f-wimi"].status = "APPROVED";
  const other = await login("u-misook", "producer");
  for (const [token, status] of [[consumer, 403], [other, 404]]) {
    const denied = await undo(token, oid, aid);
    assert.equal(denied.status, status, JSON.stringify(denied.body));
    assert.ok(!("recipientPhone" in denied.body));
    assert.deepEqual(db().orders[oid], before);
  }
  db().farms["f-wimi"].status = "PENDING";
  const unapproved = await undo(other, oid, aid);
  assert.equal(unapproved.status, 403, JSON.stringify(unapproved.body));
  assert.deepEqual(db().orders[oid], before);
  const key = nextKey();
  assert.equal((await undo(producer, oid, aid, key)).status, 200);
  // A successful cached request must not bypass current farm ownership.
  db().products[db().orders[oid].productId].farmId = "f-wimi";
  const replay = await undo(producer, oid, aid, key);
  assert.equal(replay.status, 404, JSON.stringify(replay.body));
  assert.ok(!("recipientPhone" in replay.body));
});

test("DEV-455 Mock: shipment corrections invalidate undo, and undo/reship rejects an old correction version", async () => {
  const { oid, consumer, producer } = await fixture();
  const confirmed = await ok("POST", `/api/orders/${oid}/confirm-deposit`, producer, {});
  const first = await ok("POST", `/api/orders/${oid}/ship`, producer, { carrier: "CJ", trackingNumber: "outbound" });
  const storedBefore = structuredClone(db().orders[oid]);
  assertConflict(await undo(producer, oid, actionId(confirmed)));
  assert.deepEqual(db().orders[oid], storedBefore);
  const restored = await undo(producer, oid, actionId(first));
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.status, "PREPARING");
  assert.ok(restored.body.trackingVersion > first.trackingVersion);
  const latest = await ok("POST", `/api/orders/${oid}/ship`, producer, { carrier: "EPOST", trackingNumber: "new-outbound" });
  const stale = await api("PATCH", `/api/orders/${oid}/tracking`, producer, {
    version: first.trackingVersion, carrier: "CJ", trackingNumber: "stale-value",
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  await ok("PATCH", `/api/orders/${oid}/tracking`, producer, {
    version: latest.trackingVersion, carrier: "HANJIN", trackingNumber: "corrected",
  });
  const before = structuredClone(db().orders[oid]);
  assertConflict(await undo(producer, oid, actionId(latest)));
  assert.deepEqual(db().orders[oid], before);
  assert.equal((await ok("GET", `/api/orders/${oid}`, consumer)).trackingNumber, "corrected");
});

test("DEV-455 Mock: successful replay returns current delivery state and masks all recipient fields", async () => {
  const { oid, producer } = await fixture();
  await ok("POST", `/api/orders/${oid}/confirm-deposit`, producer, {});
  const shipped = await ok("POST", `/api/orders/${oid}/ship`, producer, { carrier: "CJ", trackingNumber: "first" });
  const key = nextKey(), aid = actionId(shipped);
  assert.equal((await undo(producer, oid, aid, key)).status, 200);
  await ok("POST", `/api/orders/${oid}/ship`, producer, { carrier: "EPOST", trackingNumber: "second" });
  Object.assign(db().orders[oid], { status: "DELIVERED", deliveredAt: "2026-10-07T12:00:00+09:00" });
  const before = structuredClone(db().orders[oid]);
  const replay = await undo(producer, oid, aid, key);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.status, "DELIVERED");
  assert.equal(replay.body.recipientName, "○○○");
  for (const field of ["recipientPhone", "postalCode", "address", "addressDetail"])
    assert.equal(replay.body[field], "", field);
  assert.equal(replay.body.deliveryNote, null);
  assert.deepEqual(db().orders[oid], before);
});

test("DEV-455 Mock AC-09-9: expired undo is not offered and an unpaid cancel leaves the producer list", async () => {
  const { oid, producer } = await fixture();
  const canceled = await ok("POST", `/api/orders/${oid}/reject-deposit`, producer, { reason: "취소", cancel: true });
  const aid = actionId(canceled);
  let list = await ok("GET", "/api/orders/producer?limit=50", producer);
  assert.equal(list.items.find(o => o.orderId === oid)?.undoAction?.actionId, aid);
  // 기록한 이전 상태의 입금 기한이 지난 것으로 만든다(서버는 FIXED_NOW로 같은 경우를 본다)
  const record = db().orders[oid].producerActionHistory.find(a => a.actionId === aid);
  record.before.depositDueAt = new Date(Date.now() - 60_000).toISOString();
  record.before.depositReportedAt = null;
  list = await ok("GET", "/api/orders/producer?limit=50", producer);
  assert.equal(list.items.find(o => o.orderId === oid), undefined);
  assertConflict(await undo(producer, oid, aid));
});

test("DEV-455 Mock AC-09-9: cancel undo is blocked once the product stops selling", async () => {
  const { oid, producer } = await fixture();
  const canceled = await ok("POST", `/api/orders/${oid}/reject-deposit`, producer, { reason: "취소", cancel: true });
  const aid = actionId(canceled);
  db().products[db().orders[oid].productId].salesPaused = true;
  const list = await ok("GET", "/api/orders/producer?limit=50", producer);
  assert.equal(list.items.find(o => o.orderId === oid), undefined);
  const response = await undo(producer, oid, aid);
  assertConflict(response);
  assert.match(response.body.message, /판매/);
});
