// DEV-71 PostHog 개인정보 규칙(N-05, ADR 0005). posthog-js 없이 packages/analytics/src/privacy.ts만 검사한다.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRODUCTION_HOSTS,
  cleanProps,
  isAllowedHost,
  isPrivatePath,
  parseHosts,
  maskText,
  scrubUrls,
  stripQuery,
} from "../packages/analytics/src/privacy.ts";

const inArea = { closest: (sel) => (sel === "[data-ph-private]" ? {} : null) };
const outside = { closest: () => null };

test("N-05: only screens that are mostly personal data are masked whole", () => {
  for (const path of [
    "/chats",
    "/chats/f1",
    "/me/profile",
    "/me/addresses",
    "/me/addresses/edit",
    "/checkout/p1/address",
    "/orders/o1/inquiry",
    "/onboarding",
    "/onboarding/address",
    "/auth/kakao",
  ])
    assert.equal(isPrivatePath("consumer", path), true, path);
  for (const path of [
    "/chats",
    "/chats/c1",
    "/ship",
    "/pending",
    "/apply",
    "/farm/account",
    "/auth/kakao",
  ])
    assert.equal(isPrivatePath("producer", path), true, path);
  // DEV-104: 내 정보·주문·주문서·입금 안내는 개인정보 글자만 가린다(화면 전체 X)
  for (const path of [
    "/",
    "/me",
    "/orders",
    "/orders/o1",
    "/orders/o1/done",
    "/checkout/p1",
    "/checkout/p1/pay",
    "/products/p1",
    "/farms/f1",
    "/meet",
    "/chatsx",
  ])
    assert.equal(isPrivatePath("consumer", path), false, path);
  assert.equal(isPrivatePath("producer", "/products/p1/edit"), false);
  assert.equal(isPrivatePath("producer", "/farm"), false);
});

test("N-05: replay text is masked on private paths and inside data-ph-private", () => {
  assert.equal(
    maskText("consumer", "/orders/o1/inquiry", "김귤 010-1234-5678", outside),
    "** *************",
  );
  assert.equal(
    maskText("consumer", "/farms/f1", "귤 맛있나요?", inArea),
    "* *****",
  );
  assert.equal(maskText("consumer", "/farms/f1", "한라봉", outside), "한라봉");
  assert.equal(maskText("consumer", "/", "한라봉", null), "한라봉");
  // 주문 상세의 받는 사람 값은 T masked(data-ph-private)라 가리고, 라벨은 남긴다
  assert.equal(maskText("consumer", "/orders/o1", "김귤", inArea), "**");
  assert.equal(
    maskText("consumer", "/orders/o1", "받는 사람", outside),
    "받는 사람",
  );
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

test("DEV-125: PostHog turns on only for the production hosts", () => {
  assert.deepEqual([...PRODUCTION_HOSTS], ["farmclub.kr", "farm.farmclub.kr"]);
  for (const host of ["farmclub.kr", "farm.farmclub.kr", "FARMCLUB.KR", "farmclub.kr."])
    assert.equal(isAllowedHost(host), true, host);
  for (const host of [
    "farmclub-consumer.vercel.app",
    "farmclub-demo.vercel.app",
    "farmclub-consumer-git-main-nemodleo-4232s-projects.vercel.app",
    "demo.farmclub.kr",
    "www.farmclub.kr",
    "localhost",
    "127.0.0.1",
    "notfarmclub.kr",
    "farmclub.kr.evil.example",
    "",
  ])
    assert.equal(isAllowedHost(host), false, host || "(empty)");
});

test("DEV-125: EXPO_PUBLIC_POSTHOG_HOSTS overrides the allow list, empty keeps the default", () => {
  assert.deepEqual([...parseHosts(undefined)], [...PRODUCTION_HOSTS]);
  assert.deepEqual([...parseHosts("  ")], [...PRODUCTION_HOSTS]);
  const hosts = parseHosts(" demo.farmclub.kr, Farmclub.kr ,,");
  assert.deepEqual([...hosts], ["demo.farmclub.kr", "farmclub.kr"]);
  assert.equal(isAllowedHost("demo.farmclub.kr", hosts), true);
  assert.equal(isAllowedHost("farm.farmclub.kr", hosts), false);
});
