import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/mock/index.js");
const {
  db,
  reset,
  configureMockStorage,
} = require("../.expo/mock-build/mock/db.js");
const {
  releaseQuantity,
  salesState,
} = require("../.expo/mock-build/mock/sales.js");
configureMockStorage({ read: () => null, write: () => {} });
let seq = 0;
const api = (method, path, token, body, key = `cap-test-${++seq}`) =>
  mockTransport({
    method,
    path,
    body,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Idempotency-Key": key,
    },
  });
async function ok(...args) {
  const r = await api(...args);
  assert.equal(r.status, 200, JSON.stringify(r));
  return structuredClone(r.body);
}
async function setup() {
  reset();
  db().users["fixture-admin"] = {
    userId: "fixture-admin",
    name: "Test operator",
    role: "ADMIN",
    farmId: null,
  };
  db().tokens["fixture-admin-token"] = "fixture-admin";
  const p = (
    await ok("POST", "/api/auth/test-login", null, {
      userId: "u-kang",
      app: "producer",
    })
  ).accessToken;
  const c = (
    await ok("POST", "/api/auth/test-login", null, {
      userId: "u-minji",
      app: "consumer",
    })
  ).accessToken;
  return { p, c, a: "fixture-admin-token" };
}
const input = (productId = "p-house", optionId = "opt-5", quantity = 1) => ({
  productId,
  optionId,
  quantity,
  recipientName: "Test",
  recipientPhone: "010-1111-2222",
  postalCode: "12345",
  address: "Test address",
  consents: {
    deliveryWindow: true,
    delayRefund: true,
    shortage: true,
    cancelPolicy: true,
  },
  consentVersion: "test",
});

test("AC-04-8/9: initial and increased kg capacity require ADMIN, single pending request, versioned idempotency and no sales interruption", async () => {
  const { p, c, a } = await setup();
  const source = db().products["p-house"];
  db().products["p-fixture"] = {
    ...structuredClone(source),
    productId: "p-fixture",
    status: "DRAFT",
    approvedSupplyGrams: 0,
    salesLimitGrams: 0,
    version: 1,
    reservedCount: 0,
  };
  db().products["p-fixture"].stages.forEach((s) =>
    Object.values(s.options).forEach((o) => (o.reservedCount = 0)),
  );
  const base = "/api/products/p-fixture",
    get = () => ok("GET", "/api/products/mine/p-fixture", p);
  assert.equal(
    (
      await api("POST", base + "/capacity-requests", c, {
        requestedTotalGrams: 100000,
        version: 1,
      })
    ).status,
    403,
  );
  const first = await ok(
    "POST",
    base + "/capacity-requests",
    p,
    { requestedTotalGrams: 100000, version: 1 },
    "first",
  );
  assert.deepEqual(
    await ok(
      "POST",
      base + "/capacity-requests",
      p,
      { requestedTotalGrams: 100000, version: 1 },
      "first",
    ),
    first,
  );
  assert.equal((await get()).status, "PENDING_APPROVAL");
  assert.equal(
    (await api("PATCH", base, p, { version: 2, name: "forbidden" })).body
      .details.reason,
    "INVALID_TRANSITION",
  );
  assert.equal(
    (
      await api("POST", base + "/capacity-requests", p, {
        requestedTotalGrams: 200000,
        version: 2,
      })
    ).body.details.reason,
    "CAPACITY_REQUEST_PENDING",
  );
  const adminPath = (r) =>
    `/admin/products/p-fixture/capacity-requests/${r.requestId}`;
  assert.equal(
    (await api("POST", adminPath(first) + "/approve", p, { version: 1 }))
      .status,
    403,
  );
  assert.equal(
    (await api("POST", adminPath(first) + "/approve", null, { version: 1 }))
      .status,
    401,
  );
  await ok("POST", adminPath(first) + "/reject", a, {
    version: 1,
    reason: "확인 필요",
  });
  assert.equal((await get()).status, "REJECTED");
  let product = await get();
  const second = await ok("POST", base + "/capacity-requests", p, {
    requestedTotalGrams: 100000,
    version: product.version,
  });
  await ok(
    "POST",
    base + `/capacity-requests/${second.requestId}/withdraw`,
    p,
    { version: 1 },
  );
  assert.equal((await get()).status, "DRAFT");
  product = await get();
  const third = await ok("POST", base + "/capacity-requests", p, {
    requestedTotalGrams: 100000,
    version: product.version,
  });
  await ok(
    "POST",
    adminPath(third) + "/approve",
    a,
    { version: 1 },
    "approval",
  );
  await ok(
    "POST",
    adminPath(third) + "/approve",
    a,
    { version: 1 },
    "approval",
  );
  product = await get();
  assert.equal(product.status, "PUBLISHED");
  assert.equal(product.salesLimitGrams, 100000);
  assert.equal(product.approvedSupplyGrams, 100000);
  const inc = await ok("POST", base + "/capacity-requests", p, {
    requestedTotalGrams: 150000,
    version: product.version,
  });
  const order = await ok("POST", "/api/orders", c, input("p-fixture"));
  await ok("POST", `/api/orders/${order.orderId}/pay`, c, {
    mockResult: "success",
  });
  assert.equal((await get()).reservedGrams, 5000);
  await ok("POST", adminPath(inc) + "/reject", a, {
    version: 1,
    reason: "추가 확인",
  });
  product = await get();
  assert.equal(product.status, "PUBLISHED");
  assert.equal(product.approvedSupplyGrams, 100000);
  const inc2 = await ok("POST", base + "/capacity-requests", p, {
    requestedTotalGrams: 150000,
    version: product.version,
  });
  await ok("POST", adminPath(inc2) + "/approve", a, { version: 1 });
  product = await get();
  assert.equal(product.approvedSupplyGrams, 150000);
  assert.equal(product.salesLimitGrams, 100000);
  assert.equal(
    (
      await api("PUT", base + "/sales-settings", p, {
        salesLimitGrams: 150001,
        maxQuantityPerOrder: 3,
        salesPaused: false,
        version: product.version,
      })
    ).body.details.reason,
    "APPROVED_CAP_EXCEEDED",
  );
  assert.equal(
    (
      await api("PUT", base + "/sales-settings", p, {
        salesLimitGrams: 4999,
        maxQuantityPerOrder: 3,
        salesPaused: false,
        version: product.version,
      })
    ).body.details.reason,
    "CAP_BELOW_COMMITTED",
  );
  const history = await ok("GET", base + "/capacity-requests", p);
  assert.equal(history.items.length, 5);
  db().users["other"] = {
    userId: "other",
    name: "Other",
    role: "PRODUCER",
    farmId: "f-hyodon",
  };
  db().tokens.other = "other";
  assert.equal(
    (await api("GET", base + "/capacity-requests", "other")).status,
    404,
  );
  assert.equal(
    (await api("POST", "/admin/producers/f-kang/approve", p, {})).status,
    403,
  );
});

test("AC-05-6/09-6: mixed weights, paid snapshots, immediate price, unpaid reconfirmation, one-time returns and shipment accounting", async () => {
  const { p, c } = await setup(),
    get = () => ok("GET", "/api/products/mine/p-house", p);
  let product = await get();
  const original = product.reservedGrams + product.shippedGrams;
  const one = await ok("POST", "/api/orders", c, input("p-house", "opt-5", 2));
  await ok("POST", `/api/orders/${one.orderId}/pay`, c, {
    mockResult: "success",
  });
  const two = await ok("POST", "/api/orders", c, input("p-house", "opt-10", 1));
  await ok("POST", `/api/orders/${two.orderId}/pay`, c, {
    mockResult: "success",
  });
  product = await get();
  assert.equal(product.reservedGrams + product.shippedGrams, original + 20000);
  const unpaid = await ok("POST", "/api/orders", c, input());
  const paidPrice = one.unitPrice;
  const stages = product.stages.map((s) => ({
    ...s,
    options: Object.fromEntries(
      Object.entries(s.options).map(([id, o]) => [
        id,
        { price: o.price + 100, quantity: o.quantity },
      ]),
    ),
  }));
  await ok("PUT", "/api/products/p-house/stages", p, {
    version: product.version,
    stages,
  });
  assert.equal(
    (await ok("GET", `/api/orders/${one.orderId}`, c)).unitPrice,
    paidPrice,
  );
  assert.equal(
    (
      await api("POST", `/api/orders/${unpaid.orderId}/pay`, c, {
        mockResult: "success",
      })
    ).body.details.reason,
    "STAGE_CHANGED",
  );
  assert.equal(
    (await ok("POST", "/api/orders", c, input())).unitPrice,
    paidPrice + 100,
  );
  product = await get();
  const opts = structuredClone(product.options);
  opts[0].weightKg += 1;
  assert.equal(
    (
      await api("PATCH", "/api/products/p-house", p, {
        version: product.version,
        options: opts,
      })
    ).body.details.reason,
    "PERIOD_LOCKED",
  );
  const rec = db().orders[one.orderId];
  releaseQuantity(db().products["p-house"], rec, 1);
  rec.status = "PARTIALLY_REFUNDED";
  assert.equal(
    salesState(db(), db().products["p-house"]).reservedGrams +
      product.shippedGrams,
    original + 15000,
  );
  assert.throws(() => releaseQuantity(db().products["p-house"], rec, 2));
  await ok("POST", `/api/orders/${two.orderId}/cancel`, c);
  await ok("POST", `/api/orders/${two.orderId}/cancel`, c);
  let state = salesState(db(), db().products["p-house"]);
  const before = state.reservedGrams + state.shippedGrams;
  rec.status = "PREPARING";
  await ok("POST", `/api/orders/${one.orderId}/ship`, p, {
    carrier: "CJ",
    trackingNumber: "12345678",
  });
  state = salesState(db(), db().products["p-house"]);
  assert.equal(state.reservedGrams + state.shippedGrams, before);
  rec.status = "REFUNDED";
  assert.equal(
    salesState(db(), db().products["p-house"]).reservedGrams +
      salesState(db(), db().products["p-house"]).shippedGrams,
    before,
  );
  product = await get();
  await ok("PUT", "/api/products/p-house/sales-settings", p, {
    version: product.version,
    salesLimitGrams: before + 3000,
    maxQuantityPerOrder: 3,
    salesPaused: false,
  });
  assert.equal((await get()).availability, "TOTAL_SOLD_OUT");
  assert.equal(
    (await api("POST", "/api/orders", c, input())).body.details.reason,
    "TOTAL_LIMIT_REACHED",
  );
});

test("AC-04-3 / R-21: changed delivery window needs paid buyer consent; gram precision accepts 1.001kg", async () => {
  const { p, c } = await setup();
  const initial = await ok("GET", "/api/products/mine/p-house", p);
  const order = await ok("POST", "/api/orders", c, input());
  await ok("POST", `/api/orders/${order.orderId}/pay`, c, {
    mockResult: "success",
  });
  const window = { start: "2027-02-01", end: "2027-02-05" };
  await ok(
    "PATCH",
    "/api/products/p-house",
    p,
    { version: initial.version, deliveryWindow: window },
    "window-edit",
  );
  let updated = await ok("GET", `/api/orders/${order.orderId}`, c);
  assert.deepEqual(updated.deliveryWindow, order.deliveryWindow);
  assert.deepEqual(updated.proposedDeliveryWindow, window);
  await ok("POST", `/api/orders/${order.orderId}/delivery-window-response`, c, {
    choice: "accept",
  });
  updated = await ok("GET", `/api/orders/${order.orderId}`, c);
  assert.deepEqual(updated.deliveryWindow, window);
  assert.equal(updated.proposedDeliveryWindow, null);
  const draft = await ok("POST", "/api/products", p, {});
  const body = {
    version: draft.version,
    options: [{ optionId: "precise", label: "1.001kg", weightKg: 1.001 }],
  };
  const precise = await ok(
    "PATCH",
    `/api/products/${draft.productId}`,
    p,
    body,
    "precision",
  );
  assert.equal(precise.options[0].weightKg, 1.001);
  assert.deepEqual(
    await ok("PATCH", `/api/products/${draft.productId}`, p, body, "precision"),
    precise,
  );
  assert.equal(
    (
      await api("PATCH", `/api/products/${draft.productId}`, p, {
        version: precise.version,
        options: [{ optionId: "invalid", label: "invalid", weightKg: 1.0001 }],
      })
    ).status,
    400,
  );
});
