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
  assert.equal(
    (
      await api("POST", "/api/messaging/chats/f-kang/messages", a, {
        text: "추가 문의",
      })
    ).status,
    404,
  );
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
  const pattern = workflow.match(/grep -qE '([^']+)'/)[1];
  for (const [path, expected] of [
    ["server/app/source_analysis/text_safety_lists.json", 0],
    ["server/app/source_analysis/text_safety.py", 1],
    ["apps/producer/src/lib/NewProductComposer.tsx", 0],
  ]) {
    assert.equal(spawnSync("grep", ["-qE", pattern], { input: path + "\n" }).status, expected);
  }
  const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const appsFilter = ci.split("            apps:\n")[1].split("\n      - name:")[0];
  assert.ok(appsFilter.includes('"server/app/source_analysis/text_safety_lists.json"'));
  const integrationFilter = ci.split("            integration:\n")[1].split("\n      - name:")[0];
  assert.ok(integrationFilter.includes('"server/**"'));
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
