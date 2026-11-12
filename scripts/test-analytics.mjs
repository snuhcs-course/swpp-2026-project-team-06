// DEV-71 PostHog 개인정보 규칙(N-05, ADR 0005). posthog-js 없이 packages/analytics/src/privacy.ts만 검사한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  APP_EVENT_NAMES,
  ENUM_VALUES,
  PRODUCTION_HOSTS,
  allowedProps,
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

// DEV-312 생산자 앱 이벤트: 이름·속성 허용 목록은 트래킹 플랜과 같고, 글자·송장 번호·사유는 나가지 않는다
const PRODUCER_EVENTS = {
  product_editor_opened: ["flow", "productId"],
  draft_requested: ["flow", "trigger", "productId"],
  draft_created: ["flow", "result", "durationMs", "productId"],
  sale_start_requested: ["productId", "screen", "requestKind"],
  deposit_decided: ["orderId", "decision", "reasonKind", "cancelOrder"],
  invoice_saved: ["orderId", "hasCarrier", "afterShipped"],
  order_shipped: ["orderId", "hasCarrier"],
  producer_reply_sent: ["kind"],
  form_error_shown: ["screen", "code"],
};

test("DEV-312: app event names and allowed keys match the tracking plan", () => {
  assert.deepEqual(
    [...APP_EVENT_NAMES].sort(),
    [
      "checkout_started",
      "checkout_submitted",
      "deposit_reported",
      "product_viewed",
      ...Object.keys(PRODUCER_EVENTS),
    ].sort(),
  );
  for (const [event, keys] of Object.entries(PRODUCER_EVENTS))
    assert.deepEqual([...allowedProps(event)], keys, event);
  // 개인정보·글자를 담을 만한 키 이름은 어디에도 없다
  for (const event of APP_EVENT_NAMES)
    for (const key of allowedProps(event))
      assert.doesNotMatch(key, /name|phone|address|text|body|message|reason$|tracking|number|account/i, `${event}.${key}`);
});

test("DEV-312: the tracking plan table lists every app event", () => {
  const plan = readFileSync(new URL("../docs/spec/tech-design/README.md", import.meta.url), "utf8");
  for (const event of APP_EVENT_NAMES) assert.match(plan, new RegExp("\\| `" + event + "` \\|"), event);
});

test("DEV-312: deposit decisions never carry the reason text, only how it was chosen", () => {
  assert.deepEqual(
    cleanProps("deposit_decided", {
      orderId: "o1",
      decision: "rejected",
      reasonKind: "custom",
      cancelOrder: true,
      reason: "입금자명이 김귤로 달라요",
      text: "직접 쓴 사유",
    }),
    { orderId: "o1", decision: "rejected", reasonKind: "custom", cancelOrder: true },
  );
  // 사유 글자가 enum 자리에 들어와도 버린다
  assert.deepEqual(
    cleanProps("deposit_decided", { orderId: "o1", decision: "rejected", reasonKind: "금액이 달라요" }),
    { orderId: "o1", decision: "rejected" },
  );
  assert.deepEqual(cleanProps("deposit_decided", { orderId: "o1", decision: "approved" }), {
    orderId: "o1",
    decision: "approved",
  });
  assert.deepEqual(cleanProps("deposit_decided", { orderId: "o1", decision: "maybe" }), { orderId: "o1" });
});

test("DEV-312: invoices and shipments never carry the tracking number or carrier", () => {
  assert.deepEqual(
    cleanProps("invoice_saved", {
      orderId: "o1",
      hasCarrier: true,
      afterShipped: false,
      trackingNumber: "6012-3456-7890",
      carrier: "CJ",
      no: "6012-3456-7890",
    }),
    { orderId: "o1", hasCarrier: true, afterShipped: false },
  );
  assert.deepEqual(
    cleanProps("order_shipped", { orderId: "o1", hasCarrier: false, trackingNumber: "1", recipientName: "김귤" }),
    { orderId: "o1", hasCarrier: false },
  );
});

test("DEV-312: replies and error notices carry only enums, never message or notice text", () => {
  assert.deepEqual(
    cleanProps("producer_reply_sent", { kind: "forwarded", body: "내일 보내 드려요", consumerId: "u1", messageId: "m1" }),
    { kind: "forwarded" },
  );
  assert.deepEqual(cleanProps("producer_reply_sent", { kind: "내일 보내 드려요" }), {});
  assert.deepEqual(
    cleanProps("form_error_shown", { screen: "ship", code: "carrier_required", message: "택배사를 골라 주세요" }),
    { screen: "ship", code: "carrier_required" },
  );
  assert.deepEqual(cleanProps("form_error_shown", { screen: "ship", code: "택배사를 골라 주세요" }), { screen: "ship" });
  assert.deepEqual(cleanProps("form_error_shown", { screen: "/ship?x=1", code: "other" }), { code: "other" });
});

test("DEV-312: draft and sale events keep IDs, enums and a non-negative duration only", () => {
  assert.deepEqual(
    cleanProps("draft_created", { flow: "source", result: "partial", durationMs: 41250, productId: "p1", text: "붙여넣은 글" }),
    { flow: "source", result: "partial", durationMs: 41250, productId: "p1" },
  );
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal("durationMs" in cleanProps("draft_created", { flow: "text", result: "failed", durationMs: bad }), false);
  assert.deepEqual(cleanProps("draft_requested", { flow: "text", trigger: "retry" }), { flow: "text", trigger: "retry" });
  assert.deepEqual(cleanProps("product_editor_opened", { flow: "manual" }), {});
  assert.deepEqual(
    cleanProps("sale_start_requested", { productId: "p1", screen: "product_sell", requestKind: "initial", requestedGrams: 5000 }),
    { productId: "p1", screen: "product_sell", requestKind: "initial" },
  );
});

test("DEV-312: enum values are short codes (no Korean text, no spaces)", () => {
  for (const [key, values] of Object.entries(ENUM_VALUES))
    for (const v of values) assert.match(v, /^[a-z_]+$/, `${key}=${v}`);
});
