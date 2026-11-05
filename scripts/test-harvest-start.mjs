// DEV-231 (FEAT-17 AC-17-11·AC-17-12, FEAT-14 할 일): 수확 시작 = 출하 준비 시작.
// Mock이 서버와 같은 규칙인지: 그 기간의 예약 완료만 옮김, 멱등 키 필수, 다시 누르면 0건,
// 기간별 주문 수·수확 시작 여부, 현황 할 일(끝난 기간만 셈).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require(
  "../.expo/mock-build/packages/api/src/mock/db.js",
);
configureMockStorage({ read: () => null, write: () => {} });

let seq = 0;
const api = (method, path, token, body, key = `harvest-test-${++seq}`) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", ...(key ? { "Idempotency-Key": key } : {}) },
  });
async function producer() {
  reset();
  const r = await api("POST", "/api/auth/test-login", null, { userId: "u-kang", app: "producer" });
  return r.body.accessToken;
}
const house = () => db().products["p-house"];
const ordersOf = (pid = "p-house") =>
  Object.values(db().orders).filter((o) => o.productId === pid);

test("AC-17-11 그 기간의 예약 완료만 출하 준비로, 다른 기간·다른 상태는 그대로", async () => {
  const t = await producer();
  const [s1, s2] = house().stages;
  const reserved = ordersOf().filter((o) => o.status === "RESERVED");
  assert.ok(reserved.length >= 2, "시드에 예약 완료 주문이 2건 이상");
  reserved[0].stageId = s2.stageId; // 다른 기간의 예약 완료
  const before = new Map(ordersOf().map((o) => [o.orderId, [o.stageId, o.status]]));
  const expected = ordersOf()
    .filter((o) => o.stageId === s1.stageId && o.status === "RESERVED")
    .map((o) => o.orderId)
    .sort();

  const r = await api("POST", "/api/orders/producer/harvest-start", t, {
    productId: "p-house",
    stageId: s1.stageId,
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.changed, expected.length);
  assert.equal(r.body.stageId, s1.stageId);
  assert.deepEqual([...r.body.orderIds].sort(), expected);
  for (const o of ordersOf()) {
    const [, status] = before.get(o.orderId);
    assert.equal(o.status, expected.includes(o.orderId) ? "PREPARING" : status, o.orderId);
  }
  assert.equal(db().orders[reserved[0].orderId].status, "RESERVED");
});

test("AC-17-12 같은 키 재시도는 같은 응답, 새 키로 다시 누르면 0건 200", async () => {
  const t = await producer();
  const s1 = house().stages[0];
  const body = { productId: "p-house", stageId: s1.stageId };
  const first = await api("POST", "/api/orders/producer/harvest-start", t, body, "same");
  const replay = await api("POST", "/api/orders/producer/harvest-start", t, body, "same");
  assert.deepEqual(replay.body, first.body);
  assert.ok(first.body.changed > 0);
  const again = await api("POST", "/api/orders/producer/harvest-start", t, body);
  assert.deepEqual(again.body, { changed: 0, stageId: s1.stageId, orderIds: [] });
});

test("AC-17-12 키 없음 400, 다른 상품의 기간 404", async () => {
  const t = await producer();
  const s1 = house().stages[0];
  const before = JSON.stringify(ordersOf());
  const noKey = await api(
    "POST", "/api/orders/producer/harvest-start", t, { productId: "p-house", stageId: s1.stageId }, null,
  );
  assert.equal(noKey.status, 400);
  const foreign = await api("POST", "/api/orders/producer/harvest-start", t, {
    productId: "p-house",
    stageId: "st-none",
  });
  assert.equal(foreign.status, 404);
  assert.equal(JSON.stringify(ordersOf()), before);
});

test("AC-17-11 기간별 주문 수와 수확 시작 여부", async () => {
  const t = await producer();
  const s1 = house().stages[0];
  const reserved = ordersOf().filter((o) => o.stageId === s1.stageId && o.status === "RESERVED").length;
  const mine = await api("GET", "/api/products/mine/p-house", t);
  const stage = mine.body.stages.find((s) => s.stageId === s1.stageId);
  assert.equal(stage.reservedOrderCount, reserved);
  await api("POST", "/api/orders/producer/harvest-start", t, { productId: "p-house", stageId: s1.stageId });
  const after = (await api("GET", "/api/products/mine/p-house", t)).body.stages.find(
    (s) => s.stageId === s1.stageId,
  );
  assert.equal(after.reservedOrderCount, 0);
  assert.equal(after.harvestStarted, true);
  assert.ok(after.preparingOrderCount >= reserved);
});

test("FEAT-14 현황 할 일은 예약 기간이 끝난 기간만 센다", async () => {
  const t = await producer();
  const s1 = house().stages[0];
  const reserved = ordersOf().filter((o) => o.stageId === s1.stageId && o.status === "RESERVED").length;
  const open = (await api("GET", "/api/orders/producer/dashboard", t)).body.todo;
  const target = open.harvestTargets.find((x) => x.stageId === s1.stageId);
  assert.equal(target.count, reserved);
  assert.equal(target.closed, s1.endsAt < "2026-10-07");
  s1.endsAt = "2026-10-06"; // 어제 끝남(Mock 기준일 10-07)
  const closed = (await api("GET", "/api/orders/producer/dashboard", t)).body.todo;
  assert.equal(closed.harvestTargets.find((x) => x.stageId === s1.stageId).closed, true);
  assert.ok(closed.toHarvest >= reserved);
});
