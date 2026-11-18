// DEV-361 (FEAT-17 AC-17-11·AC-17-12): 주문·출하 화면 예약 탭에서 고른 주문 수확 시작.
// Mock이 서버 harvest_orders와 같은 규칙인지: 고른 주문 중 예약 완료만 옮김(기간 무관), 자기 농가만(아니면 404·변경 없음),
// 멱등 키 필수, 같은 키는 같은 응답, 새 키로 다시 누르면 0건.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require(
  "../.expo/mock-build/packages/api/src/mock/db.js",
);
configureMockStorage({ read: () => null, write: () => {} });

const URL = "/api/orders/producer/harvest-orders";
let seq = 0;
const api = (method, path, token, body, key = `harvest-orders-test-${++seq}`) =>
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
const kangOrders = () =>
  Object.values(db().orders).filter((o) => db().products[o.productId]?.farmId === "f-kang");
const snapshot = () => JSON.stringify(Object.values(db().orders).map((o) => [o.orderId, o.status]));

test("AC-17-11 고른 예약 완료만 출하 준비로(기간 무관), 고르지 않은 주문·다른 상태는 그대로", async () => {
  const t = await producer();
  const reserved = kangOrders().filter((o) => o.status === "RESERVED");
  assert.ok(reserved.length >= 3, "시드에 예약 완료 주문이 3건 이상");
  const [a, b, left] = reserved;
  b.stageId = db().products[b.productId].stages.at(-1).stageId; // 다른 기간
  const other = kangOrders().find((o) => o.status === "SHIPPED");
  assert.ok(other, "시드에 출하 주문");

  const r = await api("POST", URL, t, { orderIds: [a.orderId, b.orderId, other.orderId, a.orderId] });

  assert.equal(r.status, 200);
  assert.equal(r.body.changed, 2);
  assert.equal(r.body.skipped, 1);
  assert.deepEqual([...r.body.orderIds].sort(), [a.orderId, b.orderId].sort());
  assert.equal(db().orders[a.orderId].status, "PREPARING");
  assert.equal(db().orders[b.orderId].status, "PREPARING");
  assert.equal(db().orders[left.orderId].status, "RESERVED");
  assert.equal(db().orders[other.orderId].status, "SHIPPED");
});

test("AC-17-12 다른 농가·없는 주문이 섞이면 404이고 아무것도 바뀌지 않는다", async () => {
  const t = await producer();
  const mine = kangOrders().find((o) => o.status === "RESERVED");
  const foreign = Object.values(db().orders).find(
    (o) => db().products[o.productId]?.farmId !== "f-kang",
  );
  assert.ok(foreign, "시드에 다른 농가 주문");
  const before = snapshot();
  const mixed = await api("POST", URL, t, { orderIds: [mine.orderId, foreign.orderId] });
  assert.equal(mixed.status, 404);
  const missing = await api("POST", URL, t, { orderIds: [mine.orderId, "o-none"] });
  assert.equal(missing.status, 404);
  assert.equal(snapshot(), before);
});

test("AC-17-12 같은 키 재시도는 같은 응답, 새 키로 다시 누르면 0건 200", async () => {
  const t = await producer();
  const mine = kangOrders().find((o) => o.status === "RESERVED");
  const body = { orderIds: [mine.orderId] };
  const first = await api("POST", URL, t, body, "same");
  const replay = await api("POST", URL, t, body, "same");
  assert.deepEqual(first.body, { changed: 1, orderIds: [mine.orderId], skipped: 0 });
  assert.deepEqual(replay.body, first.body);
  const again = await api("POST", URL, t, body);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { changed: 0, orderIds: [], skipped: 1 });
});

test("AC-17-12 키 없음·빈 목록은 400", async () => {
  const t = await producer();
  const mine = kangOrders().find((o) => o.status === "RESERVED");
  const before = snapshot();
  const noKey = await api("POST", URL, t, { orderIds: [mine.orderId] }, null);
  assert.equal(noKey.status, 400);
  const empty = await api("POST", URL, t, { orderIds: [] });
  assert.equal(empty.status, 400);
  assert.equal(snapshot(), before);
});
