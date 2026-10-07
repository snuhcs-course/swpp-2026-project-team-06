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
      pendingCapacityRequest: {kind:"INCREASE"},
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
