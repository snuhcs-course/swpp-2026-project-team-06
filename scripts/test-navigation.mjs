import {
  orderGroup,
  selectedOrderGroup,
  compareOrders,
} from "../apps/consumer/src/lib/orderGroups.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { productGroup } from "../apps/producer/src/lib/productGroups.ts";
const require = createRequire(import.meta.url);
const { allPages } = require("../.expo/mock-build/pagination.js");

test("AC-04-7: approval, pause and end precedence produce one product group", () => {
  const states = [
    "AVAILABLE",
    "NOT_OPEN",
    "TOTAL_SOLD_OUT",
    "PERIOD_SOLD_OUT",
    "PAUSED",
    "ENDED",
  ];
  for (const availability of states)
    for (const salesPaused of [false, true]) {
      for (const [status, group] of [
        ["DRAFT", "draft"],
        ["REJECTED", "draft"],
        ["PENDING_APPROVAL", "review"],
        ["CLOSED", "ended"],
      ]) {
        assert.equal(
          productGroup({ status, availability, salesPaused }),
          group,
        );
      }
    }
  for (const availability of states) {
    assert.equal(
      productGroup({ status: "PUBLISHED", salesPaused: true, availability }),
      "paused",
    );
    assert.equal(
      productGroup({ status: "PUBLISHED", salesPaused: false, availability }),
      availability === "ENDED"
        ? "ended"
        : availability === "PAUSED"
          ? "paused"
          : "selling",
    );
  }
  assert.equal(
    productGroup({
      status: "PUBLISHED",
      salesPaused: false,
      availability: "AVAILABLE",
      pendingCapacityRequest: { kind: "INCREASE" },
    }),
    "selling",
  );
});

test("AC-12-9/AC-04-7: cursor lists include more than 50 rows without losing the final page", async () => {
  const source = Array.from({ length: 123 }, (_, id) => ({ id }));
  const calls = [];
  const rows = await allPages(async (cursor) => {
    calls.push(cursor);
    const start = Number(cursor ?? 0);
    return {
      items: source.slice(start, start + 50),
      nextCursor: start + 50 < source.length ? String(start + 50) : null,
    };
  });
  assert.deepEqual(rows, source);
  assert.deepEqual(calls, [undefined, "50", "100"]);
});

test("AC-12-9: cancelled lists stop fetching and failed pages never return a partial success", async () => {
  let cancel = false,
    calls = 0;
  await allPages(
    async () => {
      calls++;
      cancel = true;
      return { items: [1], nextCursor: "next" };
    },
    () => cancel,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    allPages(async (cursor) => {
      if (cursor) throw new Error("offline");
      return { items: [1], nextCursor: "next" };
    }),
    /offline/,
  );
  await assert.rejects(
    allPages(async () => ({ items: [], nextCursor: "repeated" })),
    /다시 시도/,
  );
});

test("AC-10-6/7: purchase-status tabs partition orders, prioritize actions, and move after confirmation/refund", async () => {
  const expected = {
    PENDING_PAYMENT: null,
    RESERVED: "pending",
    PREPARING: "pending",
    SHIPPED: "pending",
    DELIVERED: "pending",
    COMPLETED: "confirmed",
    CANCELED: "canceled",
    REFUNDED: "canceled",
    PARTIALLY_REFUNDED: "canceled",
  };
  for (const [status, group] of Object.entries(expected))
    assert.equal(orderGroup({ status }), group);
  for (const filter of [undefined, "invalid", ["confirmed"]])
    assert.equal(selectedOrderGroup(filter), "pending");
  for (const filter of ["pending", "confirmed", "canceled"])
    assert.equal(selectedOrderGroup(filter), filter);
  const source = Array.from({ length: 123 }, (_, i) => ({
    orderId: String(i),
    status: ["RESERVED", "COMPLETED", "REFUNDED"][i % 3],
    actions: [],
    createdAt: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  const rows = await allPages(async (cursor) => {
    const n = Number(cursor ?? 0);
    return {
      items: source.slice(n, n + 50),
      nextCursor: n + 50 < source.length ? String(n + 50) : null,
    };
  });
  for (const group of ["pending", "confirmed", "canceled"])
    assert.equal(rows.filter((o) => orderGroup(o) === group).length, 41);
  const action = {
    orderId: "action",
    status: "DELIVERED",
    actions: ["confirm"],
    createdAt: "2026-01-01",
  };
  assert.equal([source[0], action].sort(compareOrders)[0], action);
  assert.deepEqual([source[0], source[3]].sort(compareOrders), [
    source[3],
    source[0],
  ]);
  action.status = "COMPLETED";
  assert.equal(orderGroup(action), "confirmed");
  action.status = "REFUNDED";
  assert.equal(orderGroup(action), "canceled");
});
