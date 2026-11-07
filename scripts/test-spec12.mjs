import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { configureMockStorage, db } = require("../.expo/mock-build/packages/api/src/mock/db.js");
let stored = null;
configureMockStorage({
  read: () => stored,
  write: (s) => {
    stored = s;
  },
});
let n = 0;
const api = (method, path, token, body, key = `test-${++n}`) =>
  mockTransport({
    method,
    path,
    body,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Idempotency-Key": key,
    },
  });
const ok = async (...args) => {
  const r = await api(...args);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body;
};
const login = async (id, app) =>
  (await ok("POST", "/api/auth/test-login", null, { userId: id, app }))
    .accessToken;
test("spec 1.2: sales, immediate pricing and immutable paid orders, chat access, inquiries and private attachment contracts", async () => {
  const a = await login("u-minji", "consumer"),
    b = await login("u-seojun", "consumer"),
    p = await login("u-kang", "producer"),
    pending = await login("u-misook", "producer");
  const get = () => ok("GET", "/api/products/mine/p-house", p);
  let product = await get();
  assert.equal(product.soldQuantity, 44);
  assert.equal(product.version, 1);
  const settings = {
    salesLimitGrams: product.reservedGrams + product.shippedGrams + 5000,
    maxQuantityPerOrder: 3,
    salesPaused: false,
    version: product.version,
  };
  const saved = await ok(
    "PUT",
    "/api/products/p-house/sales-settings",
    p,
    settings,
    "cap",
  );
  assert.equal(saved.remainingGrams, 5000);
  assert.deepEqual(
    await ok("PUT", "/api/products/p-house/sales-settings", p, settings, "cap"),
    saved,
  );
  assert.equal(
    (
      await api(
        "PUT",
        "/api/products/p-house/sales-settings",
        p,
        { ...settings, salesLimitGrams: settings.salesLimitGrams + 5000 },
        "cap",
      )
    ).body.details.reason,
    "IDEMPOTENCY_MISMATCH",
  );
  assert.equal(
    (await api("PUT", "/api/products/p-house/sales-settings", p, settings)).body
      .details.reason,
    "STALE_VERSION",
  );
  product = await get();
  assert.equal(
    (
      await api("PUT", "/api/products/p-house/sales-settings", p, {
        ...settings,
        version: product.version,
        salesLimitGrams: product.reservedGrams + product.shippedGrams - 1,
      })
    ).body.details.reason,
    "CAP_BELOW_COMMITTED",
  );
  const input = {
    productId: "p-house",
    optionId: "opt-5",
    quantity: 1,
    recipientName: "테스트",
    recipientPhone: "010-1111-2222",
    postalCode: "12345",
    address: "서울 테스트",
    consents: {
      deliveryWindow: true,
      delayRefund: true,
      shortage: true,
      cancelPolicy: true,
      thirdParty: true,
    },
    consentVersion: "test",
  };
  const o1 = await ok("POST", "/api/orders", a, input),
    o2 = await ok("POST", "/api/orders", b, input);
  const results = await Promise.all([
    api(
      "POST",
      `/api/orders/${o1.orderId}/deposit`,
      a,
      {},
      "pay1",
    ),
    api(
      "POST",
      `/api/orders/${o2.orderId}/deposit`,
      b,
      {},
      "pay2",
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(
    results.find((r) => r.status !== 200).body.details.reason,
    "TOTAL_LIMIT_REACHED",
  );
  assert.equal((await get()).soldQuantity, 45);
  const winning =
    results[0].status === 200
      ? { o: o1, t: a, k: "pay1" }
      : { o: o2, t: b, k: "pay2" };
  await ok(
    "POST",
    `/api/orders/${winning.o.orderId}/deposit`,
    winning.t,
    {},
    winning.k,
  );
  assert.equal((await get()).soldQuantity, 45);
  await ok("POST", `/api/orders/${winning.o.orderId}/cancel`, winning.t);
  await ok("POST", `/api/orders/${winning.o.orderId}/cancel`, winning.t);
  assert.equal((await get()).soldQuantity, 44);
  product = await get();
  const paused = await ok("PUT", "/api/products/p-house/sales-settings", p, {
    ...settings,
    version: product.version,
    salesPaused: true,
  });
  assert.equal(paused.availability, "PAUSED");
  assert.equal(
    (await api("POST", "/api/orders", a, input)).body.details.reason,
    "SALES_PAUSED",
  );
  await ok("PUT", "/api/products/p-house/sales-settings", p, {
    ...settings,
    version: paused.version,
    salesPaused: false,
  });
  product = await get();
  const before = await ok("GET", "/api/products/p-house", a),
    rows = product.stages.map((s) => ({
      stageId: s.stageId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      options: Object.fromEntries(
        Object.entries(s.options).map(([id, v]) => [
          id,
          { price: v.price, quantity: v.quantity },
        ]),
      ),
    }));
  const locked = structuredClone(rows);
  locked[0].startsAt = "2026-09-30";
  assert.equal(
    (
      await api("PUT", "/api/products/p-house/stages", p, {
        version: product.version,
        stages: locked,
      })
    ).body.details.reason,
    "PERIOD_LOCKED",
  );
  const future = rows.at(-1);
  Object.values(future.options).forEach((v) => (v.price += 1000));
  const edited = await ok("PUT", "/api/products/p-house/stages", p, {
    version: product.version,
    stages: rows.reverse(),
  });
  assert.equal("pendingReapproval" in edited, false);
  assert.deepEqual(
    (await ok("GET", "/api/products/p-house", a)).stages,
    edited.stages,
  );
  assert.equal(
    (await api("GET", "/api/farms/me/ai-settings", a)).body.details.reason,
    "WRONG_APP",
  );
  assert.equal(
    (await api("GET", "/api/messaging/producer/chats", pending)).status,
    403,
  );
  await ok("POST", "/api/messaging/chats", a, { farmId: "f-kang" });
  await ok("POST", "/api/messaging/chats", b, { farmId: "f-kang" });
  const initial = await ok(
    "GET",
    "/api/messaging/producer/chats/u-minji/messages",
    p,
  );
  assert.equal(initial.thread.aiMode, "HUMAN");
  await ok(
    "POST",
    "/api/messaging/producer/chats/u-minji/messages",
    p,
    { text: "직접 답변 드려요" },
    "direct",
  );
  const direct = await ok(
    "POST",
    "/api/messaging/chats/f-kang/messages",
    a,
    { text: "후속 질문" },
    "followup",
  );
  assert.equal(direct.reply, null);
  assert.equal(
    (
      await ok("GET", "/api/messaging/producer/chats?needsReply=true", p)
    ).items.find((t) => t.consumerId === "u-minji").needsReply,
    true,
  );
  let thread = (
    await ok("GET", "/api/messaging/producer/chats/u-minji/messages", p)
  ).thread;
  await ok("PUT", "/api/messaging/producer/chats/u-minji/ai-mode", p, {
    mode: "AUTO",
    version: thread.version,
  });
  assert.equal(
    (
      await ok("GET", "/api/messaging/producer/chats?needsReply=true", p)
    ).items.find((t) => t.consumerId === "u-minji").needsReply,
    true,
  );
  let ai = await ok("GET", "/api/farms/me/ai-settings", p);
  ai = await ok("PUT", "/api/farms/me/ai-settings", p, {
    ...ai,
    enabled: false,
  });
  assert.equal(
    (
      await ok("POST", "/api/messaging/chats/f-kang/messages", a, {
        text: "배송 언제 오나요",
      })
    ).reply,
    null,
  );
  const stateBefore = JSON.stringify({
    messages: db().threads,
    escalations: db().escalations,
    meta: db().threadMeta,
    settings: db().aiSettings,
  });
  const preview = await ok("POST", "/api/farms/me/ai-settings/preview", p, {
    question: "파손 보상 해줘",
    settings: {
      ...ai,
      enabled: true,
      faqs: [{ question: "파손 보상 해줘", answer: "무조건 보상" }],
    },
  });
  assert.equal(preview.action, "HANDOFF");
  assert.equal(preview.settingsVersion, null);
  const groundedSettings = {
    ...ai,
    enabled: true,
    smallOrderPolicy: "한 주문부터 접수해요.",
    reservationShippingPolicy: "예약 순서대로 12월 중순에 출하해요.",
    faqs: [
      { question: "주문 안내가 있나요?", answer: "주문 안내를 확인해 주세요." },
      { question: "가격은 얼마예요?", answer: "가격은 3,000원이에요." },
    ],
  };
  const harvestWhen = await ok(
    "POST",
    "/api/farms/me/ai-settings/preview",
    p,
    { question: "언제 수확해요?", productId: "p-house", settings: groundedSettings },
  );
  assert.equal(harvestWhen.action, "HANDOFF");
  const safeOrderText = await ok(
    "POST",
    "/api/farms/me/ai-settings/preview",
    p,
    { question: "주문 안내가 있나요?", settings: groundedSettings },
  );
  assert.equal(safeOrderText.action, "ANSWER");
  assert.deepEqual(safeOrderText.sourceRefs, ["farm:faq"]);
  const unsafeWonPrice = await ok(
    "POST",
    "/api/farms/me/ai-settings/preview",
    p,
    { question: "가격은 얼마예요?", settings: groundedSettings },
  );
  assert.equal(unsafeWonPrice.action, "HANDOFF");
  const reservationPolicy = await ok(
    "POST",
    "/api/farms/me/ai-settings/preview",
    p,
    { question: "예약 상품은 언제 출하해요?", settings: groundedSettings },
  );
  assert.equal(reservationPolicy.action, "ANSWER");
  assert.deepEqual(reservationPolicy.sourceRefs, [
    "farm:reservationShippingPolicy",
  ]);
  assert.equal(
    JSON.stringify({
      messages: db().threads,
      escalations: db().escalations,
      meta: db().threadMeta,
      settings: db().aiSettings,
    }),
    stateBefore,
  );
  const messages = await ok(
    "GET",
    "/api/messaging/chats/f-kang/messages?limit=1",
    a,
  );
  assert.ok(messages.nextCursor);
  assert.equal(
    (
      await api(
        "GET",
        "/api/messaging/chats/f-kang/messages?cursor=" +
          encodeURIComponent(messages.nextCursor),
        b,
      )
    ).status,
    400,
  );
  const own = Object.values(db().orders).find(
    (o) =>
      o.consumerId === "u-minji" &&
      o.paidAt &&
      db().products[o.productId].farmId === "f-kang",
  );
  assert.ok(own);
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlVAAAAAASUVORK5CYII=";
  const photo = await ok("POST", "/api/messaging/attachments", a, {
    orderId: own.orderId,
    dataUrl: png,
  });
  assert.equal(
    (await api("GET", `/api/messaging/attachments/${photo.attachmentId}`, p))
      .status,
    404,
  );
  assert.equal(
    (
      await api("POST", "/api/messaging/attachments", a, {
        orderId: own.orderId,
        dataUrl: "data:image/jpeg;base64,aGVsbG8=",
      })
    ).status,
    400,
  );
  await ok("DELETE", "/api/farms/f-kang/follow", a);
  const inquiryInput = {
      type: "DAMAGE",
      text: "배송 중 파손됐어요",
      attachmentIds: [photo.attachmentId],
    },
    q = await ok(
      "POST",
      `/api/orders/${own.orderId}/inquiries`,
      a,
      inquiryInput,
      "inquiry",
    );
  assert.deepEqual(
    await ok(
      "POST",
      `/api/orders/${own.orderId}/inquiries`,
      a,
      inquiryInput,
      "inquiry",
    ),
    q,
  );
  assert.equal(
    (await api("GET", `/api/messaging/attachments/${photo.attachmentId}`, b))
      .status,
    404,
  );
  await ok("GET", `/api/messaging/attachments/${photo.attachmentId}`, p);
  assert.equal(
    (await api("POST", `/api/orders/${own.orderId}/inquiries`, b, inquiryInput))
      .status,
    404,
  );
  assert.equal(
    (await api("POST", `/api/orders/${own.orderId}/inquiries`, a, inquiryInput))
      .status,
    404,
  );
  assert.ok(
    (await ok("GET", "/api/messaging/chats", a)).items.some(
      (t) => t.farmId === "f-kang",
    ),
  );
  const beforeMissingContext = await ok("GET", "/api/messaging/chats/f-kang/messages", a);
  const missingContext = await api("POST", "/api/messaging/chats/f-kang/messages", a, {
    text: "추가 문의",
  });
  assert.equal(missingContext.status, 403); // real API permission contract (M-04)
  assert.equal(missingContext.body.code, "FORBIDDEN");
  const afterMissingContext = await ok("GET", "/api/messaging/chats/f-kang/messages", a);
  assert.deepEqual(afterMissingContext.items, beforeMissingContext.items);
  await ok("POST", "/api/messaging/chats/f-kang/messages", a, {
    text: "추가 문의",
    orderId: own.orderId,
  });
  const status = own.status;
  await ok(
    "PUT",
    `/api/messaging/producer/inquiries/${q.inquiry.inquiryId}/status`,
    p,
    { status: "RESOLVED", version: 1 },
  );
  assert.equal(own.status, status);
  const read = (
    await ok("GET", "/api/messaging/producer/chats/u-minji/messages", p)
  ).items.at(-1).messageId;
  await ok("PUT", "/api/messaging/producer/chats/u-minji/read", p, {
    lastReadMessageId: read,
  });
  const beforeRead =
    db().threadMeta["f-kang:u-minji"].producerLastReadMessageId;
  await ok("PUT", "/api/messaging/producer/chats/u-minji/read", p, {
    lastReadMessageId: initial.items[0].messageId,
  });
  assert.equal(
    db().threadMeta["f-kang:u-minji"].producerLastReadMessageId,
    beforeRead,
  );
});


test("DEV-186 AC-SRC-3: shared story safety lists and amount detection", () => {
  const { hasHealthClaim, hasPlatformText, hasMoney } = require("../.expo/mock-build/packages/api/src/sourceTextSafety.js");
  const lists = require("../server/app/source_analysis/text_safety_lists.json");
  for (const word of lists.health) assert.equal(hasHealthClaim(word), true, word);
  for (const word of lists.platform) assert.equal(hasPlatformText(word.replace(/\s/g, "")), true, word);
  for (const value of ["건강하게 키운 감귤", "비타민C 함유", "수확 후 바로 포장", "작년 300상자 완판"]) {
    assert.equal(hasHealthClaim(value), false, value);
    assert.equal(hasPlatformText(value), false, value);
    assert.equal(hasMoney(value), false, value);
  }
  for (const value of ["32,000원", "3 만 원", "1만5천원", "$30", "KRW 32000", "₩3천만"]) {
    assert.equal(hasMoney(value), true, value);
  }
});


test("DEV-186 AC-SRC-3: identical shared safety cases on client and server", () => {
  const detectors = require("../.expo/mock-build/packages/api/src/sourceTextSafety.js");
  const cases = require("../server/app/source_analysis/text_safety_cases.json");
  for (const c of cases) {
    assert.equal(detectors.hasHealthClaim(c.value), c.health, `health: ${c.value}`);
    assert.equal(detectors.hasPlatformText(c.value), c.platform, `platform: ${c.value}`);
    assert.equal(detectors.hasMoney(c.value), c.money, `money: ${c.value}`);
    assert.equal(detectors.hasPeriodText(c.value), c.period, `period: ${c.value}`);
  }
});


test("DEV-186 AC-SRC-3: shared safety JSON triggers app CI and deployment", async () => {
  const { readFile } = await import("node:fs/promises");
  const { spawnSync } = await import("node:child_process");
  const workflow = await readFile(new URL("../.github/workflows/deploy-vercel.yml", import.meta.url), "utf8");
  // DEV-139: 감지 정규식은 scripts/ci/deploy-changed.sh 호출의 둘째 인자
  const pattern = workflow.match(/deploy-changed\.sh deploy\/vercel-\$\{\{ matrix\.app \}\} '([^']+)'/)[1];
  for (const [path, expected] of [
    ["server/app/source_analysis/text_safety_lists.json", 0],
    ["server/app/source_analysis/text_safety.py", 1],
    ["apps/producer/src/lib/NewProductComposer.tsx", 0],
  ]) {
    assert.equal(spawnSync("grep", ["-qE", pattern], { input: path + "\n" }).status, expected);
  }
  // DEV-234: CI 경로 분류는 scripts/ci/integration-map.json(classify.mjs)으로 옮겼다
  const { classify, loadConfig } = await import("./ci/classify.mjs");
  const ciConfig = loadConfig();
  const safety = classify({ lane: "pr", files: ["server/app/source_analysis/text_safety_lists.json"], config: ciConfig });
  assert.equal(safety.jobs.apps, true);
  assert.equal(safety.integration, true);
  const server = classify({ lane: "pr", files: ["server/app/source_analysis/text_safety.py"], config: ciConfig });
  assert.equal(server.jobs.server, true);
  assert.equal(server.integration, true);
});


test("DEV-186 DEV-188 AC-SRC-11: modal groups by reason including return fees and periods", async () => {
  const { groupSourceExclusions, sourceExclusionReasons } = await import("../apps/producer/src/lib/sourceExclusionReasons.ts");
  const items = [
    { candidateId: "price", value: "천혜향 3kg 32,000원", reason: "price" },
    { candidateId: "return-fee", value: "반품 배송비 5,000원", reason: "price" },
    { candidateId: "support", value: "고객센터 평일 10시~5시", reason: "platform" },
    { candidateId: "arrival", value: "1-3일 이내 도착", reason: "period" },
    { candidateId: "health", value: "면역력 증진에 좋아요", reason: "health" },
  ];
  assert.deepEqual([...groupSourceExclusions(items)], [
    ["price", items.slice(0, 2)],
    ["platform", [items[2]]],
    ["period", [items[3]]],
    ["health", [items[4]]],
  ]);
  assert.deepEqual(sourceExclusionReasons, {
    price: { label: "💰 금액", explanation: "가격·배송비는 다음 단계(판매·가격)에서 직접 정해 주세요.", accent: true },
    period: { label: "📅 기간", explanation: "판매 기간이나 받는 날은 다음 단계(판매·가격)에서 정해요.", accent: true },
    platform: { label: "🛡️ 팜클럽 정책", explanation: "교환·환불·문의는 팜클럽이 같은 기준으로 안내해 드려요.",
      detail: "출하 전 취소는 전액 환불, 배송 후 하자는 교환·환불이에요.", accent: true },
    health: { label: "🚫 건강 효능", explanation: "건강 효능은 상세 페이지에 넣을 수 없어요.", accent: true },
    pii: { label: "🔒 개인정보", explanation: "개인정보가 있어 상세에 넣지 않았어요", accent: false },
    other_product: { label: "📦 다른 상품", explanation: "다른 상품의 내용이라 넣지 않았어요", accent: false },
    unsupported: { label: "❔ 근거 없음", explanation: "자료에서 근거를 확인하지 못해 넣지 않았어요", accent: false },
    duplicate: { label: "🔁 중복", explanation: "같은 내용이 있어 한 번만 넣었어요", accent: false },
    unused: { label: "💤 미사용", explanation: "이번 상세에 사용하지 않은 문구예요", accent: false },
  });
});


test("DEV-179 AC-17-9: Mock tracking correction is versioned, idempotent and private", async () => {
  const producer = await login("u-kang", "producer");
  const rows = await ok("GET", "/api/orders/producer?limit=50", producer);
  const consumer = await login("u-seojun", "consumer");
  const preparing = rows.items.find((order) => order.status === "PREPARING" &&
    db().orders[order.orderId]?.consumerId === "u-seojun");
  assert.ok(preparing, "An own-farm preparing order for the test consumer is required");
  const preparingEndpoint = `/api/orders/${preparing.orderId}/tracking`;
  assert.equal((await api("PATCH", preparingEndpoint, producer,
    { version: 1, carrier: "INVALID" })).status, 400);
  const malformedBodies = [
    { carrier: "CJ" },
    { version: 1 },
    { version: 0, carrier: "CJ" },
    { version: 1.5, carrier: "CJ" },
    { version: 1, carrier: "INVALID" },
    { version: 1, carrier: null },
    { version: 1, carrier: "CJ", trackingNumber: "x".repeat(51) },
  ];
  const missingEndpoint = `/api/orders/dev179-missing-${++n}/tracking`;
  for (const body of malformedBodies) {
    assert.equal((await api("PATCH", missingEndpoint, producer, body)).status, 400,
      `Validation must precede missing-order lookup: ${JSON.stringify(body)}`);
  }
  assert.equal((await api("PATCH", missingEndpoint, producer,
    { version: 1, carrier: "CJ" })).status, 404);
  const foreignUserId = `dev179-foreign-producer-${++n}`;
  const foreignToken = `dev179-foreign-token-${++n}`;
  db().users[foreignUserId] = {
    userId: foreignUserId, name: "테스트 생산자", role: "PRODUCER", farmId: "f-halla",
  };
  db().tokens[foreignToken] = foreignUserId;
  try {
    for (const body of malformedBodies) {
      assert.equal((await api("PATCH", preparingEndpoint, foreignToken, body)).status, 400,
        `Validation must precede foreign-order lookup: ${JSON.stringify(body)}`);
    }
    assert.equal((await api("PATCH", preparingEndpoint, foreignToken,
      { version: 1, carrier: "CJ" })).status, 404);
  } finally {
    delete db().tokens[foreignToken];
    delete db().users[foreignUserId];
  }
  const wrongStatus = await api("PATCH", preparingEndpoint, producer,
    { version: 1, carrier: "CJ" });
  assert.equal(wrongStatus.status, 409);
  assert.equal(wrongStatus.body.details.reason, "INVALID_TRANSITION");
  const shipped = await ok("POST", `/api/orders/${preparing.orderId}/ship`, producer,
    { carrier: "CJ", trackingNumber: "DEV179-123" });
  const endpoint = `/api/orders/${shipped.orderId}/tracking`;
  const before = await ok("GET", `/api/orders/${shipped.orderId}`, consumer);
  const initial = {
    carrier: shipped.carrier,
    trackingNumber: shipped.trackingNumber,
    version: shipped.trackingVersion,
  };
  assert.ok(Number.isInteger(initial.version) && initial.version >= 1);
  const input = { version: initial.version, carrier: "LOTTE", trackingNumber: "DEV179-456" };
  const correctionKey = `dev179-tracking-${++n}`;
  const corrected = await ok("PATCH", endpoint, producer, input, correctionKey);
  assert.equal(corrected.carrier, input.carrier);
  assert.equal(corrected.trackingNumber, input.trackingNumber);
  assert.equal(corrected.trackingVersion, initial.version + 1);
  assert.deepEqual(await ok("PATCH", endpoint, producer, input, correctionKey), corrected);
  for (const body of malformedBodies) {
    assert.equal((await api("PATCH", endpoint, producer, body, correctionKey)).status, 400,
      `Validation must precede idempotency mismatch: ${JSON.stringify(body)}`);
  }
  const reused = await api("PATCH", endpoint, producer,
    { ...input, trackingNumber: "DEV179-different" }, correctionKey);
  assert.equal(reused.status, 409);
  assert.equal(reused.body.details.reason, "IDEMPOTENCY_MISMATCH");
  const stale = await api("PATCH", endpoint, producer,
    { ...input, trackingNumber: "DEV179-stale" });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.details.reason, "VERSION_MISMATCH");
  assert.equal((await api("PATCH", endpoint, producer,
    { ...input, carrier: "INVALID" })).status, 400);
  assert.equal((await api("PATCH", endpoint, consumer,
    { ...input, version: corrected.trackingVersion })).status, 403);
  const after = await ok("GET", `/api/orders/${shipped.orderId}`, consumer);
  assert.equal(after.carrier, "LOTTE");
  assert.equal(after.trackingNumber, "DEV179-456");
  assert.equal(after.status, before.status);
  assert.equal(after.status, "SHIPPED");
  assert.equal(after.shippedAt, before.shippedAt);
  const updated = (await ok("GET", "/api/orders/producer?limit=50", producer))
    .items.find((order) => order.orderId === shipped.orderId);
  assert.equal(updated.trackingVersion, initial.version + 1);
  for (const response of [corrected, after, updated]) {
    for (const privateKey of ["trackingHistory", "events", "request_summary", "requestSummary", "previous"])
      assert.equal(privateKey in response, false, `${privateKey} must remain server-only`);
  }
});

test("DEV-208 AC-13-9·13-10: consumer chat page tells who answers and the typical reply time", async () => {
  const a = await login("u-minji", "consumer"),
    b = await login("u-seojun", "consumer"),
    p = await login("u-kang", "producer");
  const human = await ok("GET", "/api/messaging/chats/f-kang/messages", a);
  assert.equal(human.thread.aiMode, "HUMAN");
  assert.equal(human.farmReply.mode, "FARM");
  const auto = await ok("GET", "/api/messaging/chats/f-kang/messages", b),
    settings = await ok("GET", "/api/farms/me/ai-settings", p);
  // 앞 테스트가 농가 AI를 끌 수 있어 현재 설정으로 기대값을 정한다(AI OFF는 AUTO 방도 FARM)
  assert.equal(
    auto.farmReply.mode,
    auto.thread.aiMode === "AUTO" && settings.enabled ? "AI" : "FARM",
  );
  const producer = await ok("GET", "/api/messaging/producer/chats/u-minji/messages", p);
  assert.equal(producer.farmReply, null);

  const { typicalReplyHours } = require("../.expo/mock-build/packages/api/src/mock/conversations.js");
  const now = Date.parse("2026-11-04T12:00:00Z"),
    at = (h) => new Date(now - h * 3600000).toISOString(),
    pair = (askedH, waitH) => [
      { senderType: "CONSUMER", createdAt: at(askedH) },
      { senderType: "PRODUCER", createdAt: at(askedH - waitH) },
    ];
  const fake = (messages) => ({
    threadMeta: { k: { farmId: "f-x", consumerId: "u-x" } },
    threads: { "f-x:u-x": messages },
  });
  // 중앙값 2.5시간 → 3, 4건이면 null, 72시간 초과면 null
  const five = [1, 2, 2.5, 2.8, 10].flatMap((w, i) => pair(200 - i * 20, w));
  assert.equal(typicalReplyHours(fake(five), "f-x", now), 3);
  assert.equal(typicalReplyHours(fake(five.slice(0, 8)), "f-x", now), null);
  const slow = [80, 80, 80, 80, 80].flatMap((w, i) => pair(600 - i * 100, w));
  assert.equal(typicalReplyHours(fake(slow), "f-x", now), null);
});
