import assert from "node:assert/strict";
import { test } from "node:test";
import { chatEntry, chatRequest, initialOrderId, orderChatTarget } from "../apps/consumer/src/lib/orderChat.ts";
import { roomBackTarget } from "../apps/consumer/src/lib/backTargets.ts";

test("AC-33-2: both order entry actions share the complete encoded target contract", () => {
  const target = orderChatTarget("f /one", "o?&two");
  const url = new URL(target, "https://consumer.invalid");
  assert.equal(url.pathname, "/chats/f%20%2Fone");
  assert.equal(url.searchParams.get("start"), "1");
  assert.equal(url.searchParams.get("orderId"), "o?&two");
  assert.equal(url.searchParams.get("from"), "order");
  assert.equal(url.searchParams.get("fromOrder"), "o?&two");
});

test("AC-33-2: explicit and legacy order contexts bootstrap; generic/list paths stay distinct", () => {
  assert.deepEqual(chatEntry({ farmId: "f", from: "order", fromOrder: "o" }), {
    farmId: "f", productId: undefined, requestedOrderId: "o", shouldStart: true,
    generalOrderEntry: false,
  });
  assert.equal(chatEntry({ farmId: "f", orderId: "new", from: "order", fromOrder: "old" }).requestedOrderId, "new");
  assert.equal(chatEntry({ farmId: "f", orderId: "" }).requestedOrderId, "");
  assert.equal(chatEntry({ farmId: "f", orderId: "" }).shouldStart, true);
  assert.equal(chatEntry({ farmId: "f", start: "1", productId: "p" }).shouldStart, true);
  assert.equal(chatEntry({ farmId: "f" }).shouldStart, false);
  assert.equal(chatEntry({ farmId: ["f", "bad"], orderId: ["o", "bad"] }).farmId, "f");
});

test("M-04: unpaid orders use general follow chat without an order exemption", () => {
  const url = new URL(orderChatTarget("f", "unpaid", false), "https://consumer.invalid");
  assert.equal(url.searchParams.has("orderId"), false);
  assert.equal(url.searchParams.get("context"), "general");
  const entry = chatEntry({ farmId: "f", ...Object.fromEntries(url.searchParams) });
  assert.equal(entry.requestedOrderId, undefined);
  assert.equal(entry.generalOrderEntry, true);
  assert.equal(entry.shouldStart, true);
  assert.equal(roomBackTarget(Object.fromEntries(url.searchParams)), "/orders/unpaid");
});

test("AC-33-2: selection is derived only from validated linked orders", () => {
  const orders = [{ orderId: "a" }, { orderId: "b" }];
  assert.equal(initialOrderId(undefined, orders), undefined);
  assert.equal(initialOrderId("a", orders), "a");
  assert.equal(initialOrderId("foreign", orders), undefined);
  assert.equal(initialOrderId(undefined, [{ orderId: "a" }]), "a");
  assert.equal(initialOrderId(undefined, []), undefined);
});

test("DEV-224 / AC-12-9: order context never overwrites the origin Back target", () => {
  assert.equal(roomBackTarget({ from: "order", fromOrder: "origin", orderId: "selected" }), "/orders/origin");
});

test("AC-12-8: bounded loading preserves failures and clears successful timers", async () => {
  assert.equal(await chatRequest(Promise.resolve("ready")), "ready");
  const denied = Object.assign(new Error("denied"), { status: 403 });
  await assert.rejects(chatRequest(Promise.reject(denied)), e => e === denied);
  await assert.rejects(chatRequest(new Promise(() => {}), 5), /다시 시도/);
});
