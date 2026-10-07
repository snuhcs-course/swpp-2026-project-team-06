import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/mock/index.js");
const { configureMockStorage, db } = require("../.expo/mock-build/mock/db.js");
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
    },
    consentVersion: "test",
  };
  const o1 = await ok("POST", "/api/orders", a, input),
    o2 = await ok("POST", "/api/orders", b, input);
  const results = await Promise.all([
    api(
      "POST",
      `/api/orders/${o1.orderId}/pay`,
      a,
      { mockResult: "success" },
      "pay1",
    ),
    api(
      "POST",
      `/api/orders/${o2.orderId}/pay`,
      b,
      { mockResult: "success" },
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
    `/api/orders/${winning.o.orderId}/pay`,
    winning.t,
    { mockResult: "success" },
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
