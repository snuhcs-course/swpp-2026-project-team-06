// DEV-71 PostHog 개인정보 규칙(N-05, ADR 0005). posthog-js 없이 packages/analytics/src/privacy.ts만 검사한다.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cleanProps,
  isPrivatePath,
  maskText,
  scrubUrls,
  stripQuery,
} from "../packages/analytics/src/privacy.ts";

const inArea = { closest: (sel) => (sel === "[data-ph-private]" ? {} : null) };
const outside = { closest: () => null };

test("N-05: order, checkout, chat and account screens are masked in replays", () => {
  for (const path of [
    "/checkout/p1",
    "/checkout/p1/address",
    "/checkout/p1/pay",
    "/orders",
    "/orders/o1/done",
    "/chats/f1",
    "/me/addresses/edit",
  ])
    assert.equal(isPrivatePath("consumer", path), true, path);
  for (const path of [
    "/chats",
    "/chats/c1",
    "/ship",
    "/pending",
    "/apply",
    "/farm/account",
  ])
    assert.equal(isPrivatePath("producer", path), true, path);
  for (const path of ["/", "/products/p1", "/farms/f1", "/meet", "/ordersx"])
    assert.equal(isPrivatePath("consumer", path), false, path);
  assert.equal(isPrivatePath("producer", "/products/p1/edit"), false);
  assert.equal(isPrivatePath("producer", "/farm"), false);
});

test("N-05: replay text is masked on private paths and inside data-ph-private", () => {
  assert.equal(
    maskText("consumer", "/orders/o1", "김귤 010-1234-5678", outside),
    "** *************",
  );
  assert.equal(
    maskText("consumer", "/farms/f1", "귤 맛있나요?", inArea),
    "* *****",
  );
  assert.equal(maskText("consumer", "/farms/f1", "한라봉", outside), "한라봉");
  assert.equal(maskText("consumer", "/", "한라봉", null), "한라봉");
});

test("N-05: event properties keep only tracking-plan keys", () => {
  assert.deepEqual(
    cleanProps("checkout_submitted", {
      productId: "p1",
      orderId: "o1",
      quantity: 2,
      recipientName: "김귤",
      address: "제주시 1",
    }),
    { productId: "p1", orderId: "o1", quantity: 2 },
  );
  assert.deepEqual(
    cleanProps("deposit_reported", {
      orderId: "o1",
      depositorName: "김귤",
      accountNumber: "123-456",
    }),
    { orderId: "o1" },
  );
  assert.deepEqual(
    cleanProps("product_viewed", { productId: { nested: 1 }, farmId: "f1" }),
    { farmId: "f1" },
  );
});

test("N-05: URL properties lose their query and hash", () => {
  assert.equal(
    stripQuery("https://farmclub.kr/login?next=%2Forders&reason=x"),
    "https://farmclub.kr/login",
  );
  assert.equal(
    stripQuery("https://farmclub.kr/farms#top"),
    "https://farmclub.kr/farms",
  );
  const props = {
    $current_url: "https://farmclub.kr/farms?q=김귤",
    $referrer: "https://farmclub.kr/?utm=a",
    $initial_current_url: "https://farm.farmclub.kr/ship?x=1",
    $pathname: "/farms",
    productId: "p1",
  };
  scrubUrls(props);
  assert.deepEqual(props, {
    $current_url: "https://farmclub.kr/farms",
    $referrer: "https://farmclub.kr/",
    $initial_current_url: "https://farm.farmclub.kr/ship",
    $pathname: "/farms",
    productId: "p1",
  });
  const heat = {
    $heatmap_data: {
      "https://farmclub.kr/login?next=%2Forders": [{ x: 1 }],
      "https://farmclub.kr/login": [{ x: 2 }],
    },
  };
  scrubUrls(heat);
  assert.deepEqual(heat.$heatmap_data, {
    "https://farmclub.kr/login": [{ x: 1 }, { x: 2 }],
  });
});
