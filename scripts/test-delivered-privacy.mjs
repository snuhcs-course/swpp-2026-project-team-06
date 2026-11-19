// DEV-254: public Mock responses must obey the same delivery privacy contract as the API.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });

const original = {
  recipientName: "DEV254 수령인",
  recipientPhone: "010-0000-0254",
  postalCode: "12345",
  address: "DEV254 테스트로 254",
  addressDetail: "테스트동 254호",
  deliveryNote: "DEV254 테스트 보관함에 놓아 주세요",
};
const masked = {
  recipientName: "○○○", recipientPhone: "", postalCode: "", address: "", addressDetail: "", deliveryNote: null,
};
const at = "2026-10-04T10:00:00+09:00";
const pii = (row) => Object.fromEntries(Object.keys(original).map((key) => [key, row[key]]));
const api = (method, path, token, body, headers = {}) => mockTransport({
  method, path, body, headers: { Authorization: token ? `Bearer ${token}` : "", ...headers },
});
async function ok(method, path, token, body) {
  const response = await api(method, path, token, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}
const login = async (userId, app) => (await ok("POST", "/api/auth/test-login", null, { userId, app })).accessToken;

async function check({ status, delivered = false, paid = true, name = original.recipientName, expected = masked }) {
  reset();
  const fixture = { ...original, recipientName: name };
  Object.assign(db().orders["o-07"], fixture, { status, deliveredAt: delivered ? at : null, paidAt: paid ? at : null });
  const producer = await login("u-kang", "producer");
  const owner = await login("u-minji", "consumer");
  for (const query of ["", `&status=${status}`]) {
    const rows = (await ok("GET", `/api/orders/producer?limit=50${query}`, producer)).items;
    const matches = rows.filter((row) => row.orderId === "o-07");
    assert.equal(matches.length, 1, "fixture order must be returned before testing its privacy");
    assert.deepEqual(pii(matches[0]), expected);
  }
  assert.deepEqual(pii(await ok("GET", "/api/orders/o-07", owner)), fixture);
  assert.deepEqual(pii(db().orders["o-07"]), fixture, "reading a producer view must not erase stored PII");
}

for (const status of ["DELIVERED", "COMPLETED"]) {
  for (const name of ["가", "가나", "테스트수령인", "Alias Long Name", "A\u0301", "🍊🚚"]) {
    test(`DEV-254 AC-17-13 Mock: ${status} masks every recipient field for ${JSON.stringify(name)} without a timestamp`, async () => {
      await check({ status, name });
    });
  }
}
for (const status of ["RESERVED", "PREPARING", "SHIPPED", "REFUNDED", "PARTIALLY_REFUNDED", "AWAITING_DEPOSIT"]) {
  test(`DEV-254 AC-17-13 Mock: a delivery timestamp takes precedence over ${status}`, async () => {
    await check({ status, delivered: true, paid: status !== "AWAITING_DEPOSIT" });
  });
}
for (const status of ["RESERVED", "PREPARING", "SHIPPED"]) {
  test(`DEV-254 AC-17-13 Mock: paid ${status} before delivery keeps full shipping information`, async () => {
    await check({ status, expected: original });
  });
}
test("DEV-254 AC-17-13 Mock: unpaid awaiting keeps the payment-matching name and hides shipping", async () => {
  await check({ status: "AWAITING_DEPOSIT", paid: false, expected: { ...masked, recipientName: original.recipientName } });
});
test("DEV-254 AC-17-13 Mock: another farm and another consumer cannot read the delivered order", async () => {
  reset();
  db().farms["f-wimi"].status = "APPROVED";
  const otherFarm = await login("u-misook", "producer");
  for (const query of ["", "&status=DELIVERED"]) {
    const rows = (await ok("GET", `/api/orders/producer?limit=50${query}`, otherFarm)).items;
    assert.ok(!rows.some((row) => row.orderId === "o-07"));
  }
  assert.equal((await api("GET", "/api/orders/o-07", otherFarm)).status, 403);
  const otherConsumer = await login("u-seojun", "consumer");
  assert.equal((await api("GET", "/api/orders/o-07", otherConsumer)).status, 404);
  assert.equal((await api("GET", "/api/orders/producer?limit=50", otherConsumer)).status, 403);
});

for (const laterStatus of ["DELIVERED", "COMPLETED", "REFUNDED"]) {
  test(`DEV-254 AC-17-13 Mock: tracking replay after ${laterStatus} masks current PII and preserves original non-PII`, async () => {
    reset();
    Object.assign(db().orders["o-07"], original, {
      status: "SHIPPED", deliveredAt: null, paidAt: at, trackingVersion: 1,
    });
    const producer = await login("u-kang", "producer");
    const endpoint = "/api/orders/o-07/tracking";
    const headers = { "Idempotency-Key": `dev254-tracking-${laterStatus}` };
    const body = { carrier: "CJ", trackingNumber: "test-dev254-first", version: 1 };
    const first = await api("PATCH", endpoint, producer, body, headers);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const firstBody = structuredClone(first.body);
    assert.deepEqual(pii(firstBody), original);
    assert.equal(firstBody.trackingNumber, body.trackingNumber);
    assert.equal(firstBody.trackingVersion, 2);

    Object.assign(db().orders["o-07"], {
      status: laterStatus, deliveredAt: at,
      refundedAt: laterStatus === "REFUNDED" ? at : null,
      carrier: "EPOST", trackingNumber: "test-dev254-newer", trackingVersion: 3,
    });
    const replay = await api("PATCH", endpoint, producer, body, headers);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(pii(replay.body), masked);
    const nonPii = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !(key in original)));
    assert.deepEqual(nonPii(replay.body), nonPii(firstBody));
    const owner = await login("u-minji", "consumer");
    assert.deepEqual(pii(await ok("GET", "/api/orders/o-07", owner)), original);
    assert.deepEqual(pii(db().orders["o-07"]), original);
    const stored = db().orders["o-07"];
    assert.deepEqual([stored.carrier, stored.trackingNumber, stored.trackingVersion], ["EPOST", "test-dev254-newer", 3]);
  });
}
