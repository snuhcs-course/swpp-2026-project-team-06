// DEV-291 (FEAT-08 E2 멱등, AC-09-3, R-28): 입금 안내에서 뒤로 와 옵션·수량을 바꿔 다시 내면
// 같은 주문 키에 다른 내용이라 409 IDEMPOTENCY_MISMATCH가 온다. 예전 앱은 새 키로 다시 보내 두 번째 주문을 만들었고,
// 첫 주문은 입금 대기로 24시간 물량을 잡았다. 앱은 이 주문서로 만든 주문이 있으면 다시 보내지 않는다(mismatchStep).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mismatchStep } from "../apps/consumer/src/lib/checkoutConflict.ts";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require(
  "../.expo/mock-build/packages/api/src/mock/db.js",
);
configureMockStorage({ read: () => null, write: () => {} });

let seq = 0;
const api = (method, path, token, body, key = `dev291-${++seq}`) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
  });
const input = (extra = {}) => ({
  productId: "p-house",
  optionId: "opt-5",
  quantity: 1,
  recipientName: "Test",
  recipientPhone: "010-1111-2222",
  postalCode: "12345",
  address: "Test address",
  consents: {
    deliveryWindow: true,
    delayRefund: true,
    shortage: true,
    cancelPolicy: true,
    thirdParty: true,
  },
  consentVersion: "test",
  ...extra,
});
const awaitingOrders = () =>
  Object.values(db().orders).filter(
    (o) => o.consumerId === "u-minji" && o.productId === "p-house" && o.status === "AWAITING_DEPOSIT",
  );

test("mismatchStep: an order already placed from this checkout is shown, never re-sent with a new key", () => {
  assert.equal(mismatchStep("o-1", false), "showPlaced");
  assert.equal(mismatchStep("o-1", true), "showPlaced");
  // 만든 주문이 없을 때(앱 버그)는 예전처럼 새 키로 한 번만
  assert.equal(mismatchStep(null, false), "retry");
  assert.equal(mismatchStep(null, true), "fail");
});

test("FEAT-08 E2: changing the quantity after the deposit guide returns IDEMPOTENCY_MISMATCH and the app flow keeps one awaiting order", async () => {
  reset();
  const c = (await api("POST", "/api/auth/test-login", null, { userId: "u-minji", app: "consumer" })).body.accessToken;
  const before = awaitingOrders().length;
  const orderKey = "dev291-order";

  // 주문서 제출 → 입금 안내(물량 선점)
  const first = await api("POST", "/api/orders", c, input(), orderKey);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const dep = await api("POST", `/api/orders/${first.body.orderId}/deposit`, c, undefined, "dev291-deposit");
  assert.equal(dep.status, 200, JSON.stringify(dep.body));
  assert.equal(awaitingOrders().length, before + 1);

  // 뒤로 와 수량을 바꿔 같은 키로 다시 냄
  const changed = await api("POST", "/api/orders", c, input({ quantity: 2 }), orderKey);
  assert.equal(changed.status, 409);
  assert.equal(changed.body.details.reason ?? changed.body.code, "IDEMPOTENCY_MISMATCH");

  // 앱의 다음 행동: 만든 주문이 있으니 새 키로 다시 보내지 않는다 → 입금 대기 주문은 하나
  assert.equal(mismatchStep(first.body.orderId, false), "showPlaced");
  assert.equal(awaitingOrders().length, before + 1);

  // 같은 내용으로 다시 내면 같은 주문(멱등 재생)
  const same = await api("POST", "/api/orders", c, input(), orderKey);
  assert.equal(same.status, 200);
  assert.equal(same.body.orderId, first.body.orderId);
  assert.equal(awaitingOrders().length, before + 1);
});
