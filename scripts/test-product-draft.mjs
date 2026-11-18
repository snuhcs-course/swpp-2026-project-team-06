// DEV-361 상품 초안 Mock 계약: 판매 중·승인 대기 상품의 상품 칸·판매 조건은 '상품에 반영'(apply-all) 전까지
// 구매자에게 보이지 않고, 반영 때 R-18·R-21·R-25와 칸별 충돌을 서버처럼 검사한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  mockTransport,
} = require("../.expo/mock-build/packages/api/src/mock/index.js");
const {
  db,
  reset,
  configureMockStorage,
} = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });

const BASE = "/api/source-analysis/product-workspaces";
let seq = 0;
const api = (method, path, token, body, key = `draft-test-${++seq}`) =>
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
  return { p, a: "fixture-admin-token" };
}
const stages = (product) =>
  product.stages.map((s) => ({
    stageId: s.stageId,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    options: Object.fromEntries(
      Object.entries(s.options).map(([oid, v]) => [
        oid,
        { price: v.price, quantity: v.quantity },
      ]),
    ),
  }));

test("DEV-361 draft stays private until apply-all, then reaches buyers", async () => {
  const { p, a } = await setup();
  const empty = await ok("GET", `${BASE}/p-house/product-draft`, p);
  assert.equal(empty.draft, null);
  const saved = await ok("PUT", `${BASE}/p-house/product-draft`, p, {
    version: empty.version,
    fields: {
      name: "새 이름",
      variety: "궁천조생",
      info: { origin: "제주 효돈" },
    },
  });
  assert.deepEqual(saved.draft.fields, {
    name: "새 이름",
    info: { origin: "제주 효돈" },
  });
  assert.deepEqual(
    saved.changes.now.map((c) => c.field),
    ["name", "info.origin"],
  );
  assert.equal(
    (await ok("GET", "/api/products/p-house", null)).name,
    "하우스 감귤 5kg / 10kg",
  );
  const applied = await ok("POST", `${BASE}/p-house/apply-all`, p, {
    version: saved.version,
  });
  assert.equal(applied.product.name, "새 이름");
  assert.equal(
    (await ok("GET", "/api/products/p-house", null)).name,
    "새 이름",
  );
  assert.equal(
    (await ok("GET", `${BASE}/p-house/product-draft`, p)).draft,
    null,
  );
  const history = await ok("GET", "/admin/products/p-house/changes", a);
  assert.deepEqual(
    history[0].changes.map((c) => c.field),
    ["name", "info.origin"],
  );
  assert.equal(
    (await api("GET", "/admin/products/p-house/changes", p)).status,
    403,
  );
});

test("DEV-361 R-18 and R-21 on apply, R-25 price only for new orders", async () => {
  const { p } = await setup();
  const product = await ok("GET", "/api/products/mine/p-house", p);
  const cheaper = stages(product);
  cheaper[2].options["opt-5"].price = 30000;
  let view = await ok("PUT", `${BASE}/p-house/product-draft`, p, {
    version: 1,
    fields: {},
    stages: cheaper,
  });
  const r18 = await api("POST", `${BASE}/p-house/apply-all`, p, {
    version: view.version,
  });
  assert.equal(r18.status, 400);
  assert.ok(r18.body.details.fields["stages.2.opt-5.price"]);

  const pricier = stages(product);
  pricier[1].options["opt-5"].price = 34000;
  view = await ok("PUT", `${BASE}/p-house/product-draft`, p, {
    version: view.version,
    fields: { deliveryWindow: { start: "2026-11-12", end: "2026-11-22" } },
    stages: pricier,
  });
  assert.ok(view.reservedCount > 0);
  assert.deepEqual(
    view.changes.consent.map((c) => c.field),
    ["deliveryWindow"],
  );
  assert.deepEqual(
    view.changes.newOrders.map((c) => c.field),
    ["stages"],
  );
  const asked = await api("POST", `${BASE}/p-house/apply-all`, p, {
    version: view.version,
  });
  assert.equal(asked.status, 409);
  assert.equal(asked.body.details.reason, "DELIVERY_CONSENT_REQUIRED");
  assert.equal(asked.body.details.reservedCount, view.reservedCount);
  const done = await ok("POST", `${BASE}/p-house/apply-all`, p, {
    version: view.version,
    confirmDeliveryChange: true,
  });
  assert.equal(done.deliveryWindowProposed, true);
  assert.equal(db().orders["o-42"].unitPrice, 29000);
  assert.deepEqual(db().orders["o-42"].proposedDeliveryWindow, {
    start: "2026-11-12",
    end: "2026-11-22",
  });
  assert.equal(
    db().products["p-house"].stages[1].options["opt-5"].price,
    34000,
  );
});

test("DEV-361 conflicts, pre-sale and closed products", async () => {
  const { p } = await setup();
  const view = await ok("PUT", `${BASE}/p-house/product-draft`, p, {
    version: 1,
    fields: { name: "초안" },
  });
  const product = await ok("GET", "/api/products/mine/p-house", p);
  await ok("PATCH", "/api/products/p-house", p, {
    version: product.version,
    name: "다른 곳",
  });
  const changed = await api("POST", `${BASE}/p-house/apply-all`, p, {
    version: view.version,
  });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.details.reason, "PRODUCT_CHANGED");
  assert.deepEqual(changed.body.details.fields, ["name"]);
  // 다시 저장만 하면 기준값이 그대로라 충돌이 남고, 확인한 칸을 rebase에 넣으면 풀린다
  const again = await ok("PUT", `${BASE}/p-house/product-draft`, p, {
    version: view.version,
    fields: { name: "초안" },
  });
  assert.deepEqual(again.conflicts, ["name"]);
  const confirmed = await ok("PUT", `${BASE}/p-house/product-draft`, p, {
    version: again.version,
    fields: { name: "초안" },
    rebase: ["name"],
  });
  assert.deepEqual(confirmed.conflicts, []);
  await ok("POST", `${BASE}/p-house/apply-all`, p, {
    version: confirmed.version,
  });
  assert.equal(db().products["p-house"].name, "초안");
  for (const pid of ["p-hallabong", "p-josaeng"]) {
    const refused = await api("PUT", `${BASE}/${pid}/product-draft`, p, {
      version: 1,
      fields: { name: "x" },
    });
    assert.equal(refused.status, 409, pid);
    assert.equal(refused.body.details.reason, "INVALID_TRANSITION");
  }
});

test("DEV-361 a field that already became the drafted value is no change", async () => {
  const { p } = await setup();
  const view = await ok("PUT", `${BASE}/p-house/product-draft`, p, {
    version: 1,
    fields: { grade: "상" },
  });
  const product = await ok("GET", "/api/products/mine/p-house", p);
  await ok("PATCH", "/api/products/p-house", p, {
    version: product.version,
    grade: "상",
  });
  const applied = await ok("POST", `${BASE}/p-house/apply-all`, p, {
    version: view.version,
  });
  assert.deepEqual(applied.changes.now, []);
  assert.equal(applied.changeId, null);
});

test("DEV-361 pending-approval changes keep the status (no re-approval)", async () => {
  const { p } = await setup();
  const view = await ok("PUT", `${BASE}/p-cheonggyeon/product-draft`, p, {
    version: 1,
    fields: { name: "청견 새 이름" },
  });
  const applied = await ok("POST", `${BASE}/p-cheonggyeon/apply-all`, p, {
    version: view.version,
  });
  assert.equal(applied.product.status, "PENDING_APPROVAL");
  assert.equal(db().products["p-cheonggyeon"].name, "청견 새 이름");
});
