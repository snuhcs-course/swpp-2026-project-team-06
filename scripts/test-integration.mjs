import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = new URL(process.env.FARMCLUB_API_URL ?? "http://127.0.0.1:8000");
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (!allowedHosts.has(baseUrl.hostname)) {
  throw new Error(`Integration tests only run against localhost, received ${baseUrl.origin}`);
}

const adminToken = process.env.FARMCLUB_ADMIN_TOKEN;
if (!adminToken) {
  throw new Error(
    "FARMCLUB_ADMIN_TOKEN is required. Generate it with: cd server && uv run python -m app.accounts.admin_token",
  );
}

const runId = randomUUID().slice(0, 8);
let passed = 0;
const state = { tokens: {} };

function key(label) {
  return `dev6-${runId}-${label}`;
}

async function request(method, path, options = {}) {
  const {
    token,
    body,
    idempotencyKey,
    expected = 200,
  } = options;
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    expectedStatuses.includes(response.status),
    `${method} ${path}: expected ${expectedStatuses.join("/")}, received ${response.status}\n${text}`,
  );
  return payload;
}

async function scenario(name, callback) {
  process.stdout.write(`→ ${name}\n`);
  await callback();
  passed += 1;
  process.stdout.write(`  ✓ passed\n`);
}

async function login(userId, app) {
  const result = await request("POST", "/api/auth/test-login", {
    body: { userId, app },
  });
  state.tokens[userId] = result.accessToken;
  return result;
}

function token(userId) {
  return state.tokens[userId];
}

function itemById(page, keyName, id) {
  return page.items.find((item) => item[keyName] === id);
}

await scenario("health, account separation, wrong-app access, and producer gates", async () => {
  const health = await request("GET", "/health");
  assert.equal(health.status, "ok");

  const consumers = await request("GET", "/api/auth/test-accounts?app=consumer");
  const producers = await request("GET", "/api/auth/test-accounts?app=producer");
  assert.deepEqual(consumers.map((account) => account.userId), ["u-minji", "u-seojun"]);
  assert.deepEqual(producers.map((account) => account.userId), [
    "u-kang",
    "u-misook",
    "u-new",
    "u-soonja",
    "u-taeho",
  ]);

  for (const userId of ["u-minji", "u-seojun"]) await login(userId, "consumer");
  for (const userId of ["u-kang", "u-misook", "u-new", "u-soonja", "u-taeho"]) {
    await login(userId, "producer");
  }

  const wrongApp = await request("POST", "/api/auth/test-login", {
    body: { userId: "u-kang", app: "consumer" },
    expected: 403,
  });
  assert.equal(wrongApp.details.reason, "WRONG_APP");

  const gateStatuses = {
    "u-misook": "PENDING",
    "u-new": "NONE",
    "u-soonja": "REJECTED",
    "u-taeho": "SUSPENDED",
  };
  for (const [userId, farmStatus] of Object.entries(gateStatuses)) {
    const me = await request("GET", "/api/auth/me", { token: token(userId) });
    assert.equal(me.farmStatus, farmStatus);
    await request("GET", "/api/products/stage-presets", {
      token: token(userId),
      expected: 403,
    });
  }

  const pendingApplication = await request("GET", "/api/auth/producer-application", {
    token: token("u-misook"),
  });
  assert.equal(pendingApplication.status, "PENDING");
  assert.equal(pendingApplication.farmName, "위미 감귤농장");
  assert.equal(pendingApplication.rejectReason, null);

  const rejectedApplication = await request("GET", "/api/auth/producer-application", {
    token: token("u-soonja"),
  });
  assert.equal(rejectedApplication.status, "REJECTED");
  assert.match(rejectedApplication.rejectReason, /연락/);

  await request("GET", "/api/auth/producer-application", {
    token: token("u-new"),
    expected: 404,
  });
});

await scenario("product completion, detail draft, capacity request, and admin approval", async () => {
  const created = await request("POST", "/api/products", {
    token: token("u-kang"),
    body: {},
  });
  state.productId = created.productId;

  const patched = await request("PATCH", `/api/products/${state.productId}`, {
    token: token("u-kang"),
    idempotencyKey: key("product-complete"),
    body: {
      version: created.version,
      name: `DEV-6 통합 감귤 ${runId}`,
      variety: "하우스 감귤",
      description: "실제 앱과 서버 연결을 확인하는 통합 테스트 상품입니다.",
      expectedBrix: 12.5,
      options: [{ label: "5kg", weightKg: 5, note: "통합 테스트" }],
      maxQuantityPerOrder: 4,
      deliveryWindow: { start: "2026-11-10", end: "2026-11-20" },
      maxDelayUntil: "2026-11-30",
      shippingFeeType: "FREE",
      shippingFee: 0,
      remoteAreaFee: 5000,
      photos: ["/photos/tangerine-box.jpg"],
      info: {
        origin: "제주 서귀포",
        producer: "강씨네 귤밭",
        size: "5kg",
        packedAt: "출하 당일",
        storage: "서늘하고 통풍되는 곳",
        contact: "farmclub 고객센터",
      },
    },
  });
  state.optionId = patched.options[0].optionId;

  const stageResult = await request("PUT", `/api/products/${state.productId}/stages`, {
    token: token("u-kang"),
    idempotencyKey: key("product-stages"),
    body: {
      version: patched.version,
      stages: [
        {
          name: "통합 판매 단계",
          startsAt: "2026-10-07",
          endsAt: "2026-10-12",
          options: { [state.optionId]: { price: 25000, quantity: 10 } },
        },
      ],
    },
  });
  state.stageId = stageResult.stages[0].stageId;

  const draft = await request("POST", `/api/products/mine/${state.productId}/detail-draft`, {
    token: token("u-kang"),
    body: { inputText: "당도와 재배 방식을 소개해 주세요.", photos: [] },
  });
  assert.ok(Array.isArray(draft.content.blocks));
  await request("GET", `/api/products/${state.productId}`, { expected: 404 });

  const detailContent = {
    blocks: [
      {
        id: "dev6-story",
        type: "text",
        title: "통합 테스트 농장 이야기",
        body: "저장 전에는 공개되지 않고 명시적으로 저장한 뒤 공개됩니다.",
      },
    ],
  };
  const detailed = await request("PATCH", `/api/products/${state.productId}`, {
    token: token("u-kang"),
    idempotencyKey: key("product-detail"),
    body: { version: stageResult.version, detailContent },
  });

  const stale = await request("PATCH", `/api/products/${state.productId}`, {
    token: token("u-kang"),
    idempotencyKey: key("product-stale"),
    body: { version: stageResult.version, description: "stale" },
    expected: 409,
  });
  assert.equal(stale.details.reason, "STALE_VERSION");

  const invalidUri = await request("PATCH", `/api/products/${state.productId}`, {
    token: token("u-kang"),
    idempotencyKey: key("product-uri"),
    body: {
      version: detailed.version,
      detailContent: {
        blocks: [{ id: "bad", type: "image", uri: "http://example.com/a.jpg", alt: "bad" }],
      },
    },
    expected: 400,
  });
  assert.equal(invalidUri.code, "VALIDATION_ERROR");

  const capacity = await request("POST", `/api/products/${state.productId}/capacity-requests`, {
    token: token("u-kang"),
    idempotencyKey: key("capacity"),
    body: { requestedTotalGrams: 50000, version: detailed.version },
  });
  state.capacityRequestId = capacity.requestId;
  assert.equal(capacity.kind, "INITIAL");

  const approved = await request(
    "POST",
    `/admin/products/${state.productId}/capacity-requests/${capacity.requestId}/approve`,
    {
      token: adminToken,
      idempotencyKey: key("capacity-approve"),
      body: { version: capacity.version },
    },
  );
  assert.equal(approved.status, "APPROVED");

  const publicProduct = await request("GET", `/api/products/${state.productId}`);
  assert.equal(publicProduct.status, "PUBLISHED");
  assert.equal(publicProduct.approvedSupplyGrams, 50000);
  assert.equal(publicProduct.salesLimitGrams, 50000);
  assert.deepEqual(publicProduct.detailContent, detailContent);
});

async function createAndPayOrder(userId, label) {
  const order = await request("POST", "/api/orders", {
    token: token(userId),
    idempotencyKey: key(`order-${label}`),
    body: {
      productId: state.productId,
      optionId: state.optionId,
      quantity: 1,
      recipientName: `${label} 구매자`,
      recipientPhone: "010-1234-5678",
      postalCode: "63584",
      address: "제주특별자치도 서귀포시 통합로 1",
      addressDetail: "101호",
      deliveryNote: "문 앞에 놓아 주세요.",
      consents: {
        deliveryWindow: true,
        delayRefund: true,
        shortage: true,
        cancelPolicy: true,
      },
      consentVersion: "dev6-v1",
      saveAddress: false,
    },
  });
  const paymentKey = key(`payment-${label}`);
  const paid = await request("POST", `/api/orders/${order.orderId}/pay`, {
    token: token(userId),
    idempotencyKey: paymentKey,
    body: { mockResult: "success" },
  });
  const repeated = await request("POST", `/api/orders/${order.orderId}/pay`, {
    token: token(userId),
    idempotencyKey: paymentKey,
    body: { mockResult: "success" },
  });
  assert.deepEqual(repeated, paid);
  assert.equal(paid.order.unitWeightGrams, 5000);
  return paid.order;
}

await scenario("payment idempotency, exact capacity release, pause, and paid snapshots", async () => {
  const before = await request("GET", `/api/products/${state.productId}`);
  state.primaryOrder = await createAndPayOrder("u-minji", "primary");
  const afterPrimary = await request("GET", `/api/products/${state.productId}`);
  assert.equal(afterPrimary.reservedGrams, before.reservedGrams + 5000);

  const cancelOrder = await createAndPayOrder("u-seojun", "cancel");
  const beforeCancel = await request("GET", `/api/products/${state.productId}`);
  const canceled = await request("POST", `/api/orders/${cancelOrder.orderId}/cancel`, {
    token: token("u-seojun"),
  });
  assert.equal(canceled.status, "REFUNDED");
  assert.equal(canceled.releasedQuantity, 1);
  const canceledAgain = await request("POST", `/api/orders/${cancelOrder.orderId}/cancel`, {
    token: token("u-seojun"),
  });
  assert.equal(canceledAgain.status, "REFUNDED");
  assert.equal(canceledAgain.releasedQuantity, 1);
  const afterCancel = await request("GET", `/api/products/${state.productId}`);
  assert.equal(afterCancel.reservedGrams, beforeCancel.reservedGrams - 5000);

  const mine = await request("GET", `/api/products/mine/${state.productId}`, {
    token: token("u-kang"),
  });
  const paused = await request("PUT", `/api/products/${state.productId}/sales-settings`, {
    token: token("u-kang"),
    idempotencyKey: key("pause"),
    body: {
      salesLimitGrams: mine.salesLimitGrams,
      maxQuantityPerOrder: mine.maxQuantityPerOrder,
      salesPaused: true,
      version: mine.version,
    },
  });
  assert.equal(paused.availability, "PAUSED");
  const blocked = await request("POST", "/api/orders", {
    token: token("u-seojun"),
    idempotencyKey: key("paused-order"),
    body: {
      productId: state.productId,
      optionId: state.optionId,
      quantity: 1,
      recipientName: "일시정지 구매자",
      recipientPhone: "010-1234-5678",
      postalCode: "63584",
      address: "제주특별자치도 서귀포시 통합로 2",
      addressDetail: "",
      consents: {
        deliveryWindow: true,
        delayRefund: true,
        shortage: true,
        cancelPolicy: true,
      },
      consentVersion: "dev6-v1",
    },
    expected: 409,
  });
  assert.equal(blocked.details.reason, "SALES_PAUSED");

  const resumed = await request("PUT", `/api/products/${state.productId}/sales-settings`, {
    token: token("u-kang"),
    idempotencyKey: key("resume"),
    body: {
      salesLimitGrams: paused.salesLimitGrams,
      maxQuantityPerOrder: mine.maxQuantityPerOrder,
      salesPaused: false,
      version: paused.version,
    },
  });
  assert.equal(resumed.salesPaused, false);

  const paidSnapshot = await request("GET", `/api/orders/${state.primaryOrder.orderId}`, {
    token: token("u-minji"),
  });
  assert.equal(paidSnapshot.unitPrice, 25000);
  assert.equal(paidSnapshot.unitWeightGrams, 5000);
});

await scenario("producer fulfillment and consumer order visibility", async () => {
  const producerOrders = await request(
    "GET",
    `/api/orders/producer?productId=${state.productId}`,
    { token: token("u-kang") },
  );
  assert.ok(itemById(producerOrders, "orderId", state.primaryOrder.orderId));

  const changed = await request("POST", "/api/orders/producer/harvest-start", {
    token: token("u-kang"),
    body: { productId: state.productId },
  });
  assert.ok(changed.changed >= 1);

  const shipped = await request("POST", `/api/orders/${state.primaryOrder.orderId}/ship`, {
    token: token("u-kang"),
    body: { carrier: "CJ", trackingNumber: `DEV6-${runId}` },
  });
  assert.equal(shipped.status, "SHIPPED");

  const consumerOrder = await request("GET", `/api/orders/${state.primaryOrder.orderId}`, {
    token: token("u-minji"),
  });
  assert.equal(consumerOrder.status, "SHIPPED");
  assert.equal(consumerOrder.carrier, "CJ");
  assert.ok(!consumerOrder.actions.includes("cancel"));

  const completed = await request("POST", "/api/orders/o-07/confirm", {
    token: token("u-minji"),
  });
  assert.equal(completed.status, "COMPLETED");
});

await scenario("public/follower news privacy, reactions, and private replies", async () => {
  await request("DELETE", "/api/farms/f-kang/follow", { token: token("u-seojun") });
  const publicPost = await request("POST", "/api/messaging/news", {
    token: token("u-kang"),
    idempotencyKey: key("news-public"),
    body: { body: `DEV-6 공개 소식 ${runId}`, photos: [], videos: [], visibility: "PUBLIC" },
  });
  const followerPost = await request("POST", "/api/messaging/news", {
    token: token("u-kang"),
    idempotencyKey: key("news-followers"),
    body: { body: `DEV-6 팔로워 소식 ${runId}`, photos: [], videos: [], visibility: "FOLLOWERS" },
  });

  const anonymous = await request("GET", "/api/messaging/rooms/f-kang/messages");
  assert.ok(itemById(anonymous, "broadcastId", publicPost.broadcastId));
  assert.ok(!itemById(anonymous, "broadcastId", followerPost.broadcastId));

  const unfollowed = await request("GET", "/api/messaging/rooms/f-kang/messages", {
    token: token("u-seojun"),
  });
  assert.equal(unfollowed.room.canReply, false);
  assert.ok(!itemById(unfollowed, "broadcastId", followerPost.broadcastId));

  await request("PUT", `/api/messaging/news/${publicPost.broadcastId}/reaction`, {
    token: token("u-seojun"),
  });
  await request("PUT", `/api/messaging/news/${followerPost.broadcastId}/reaction`, {
    token: token("u-seojun"),
    expected: 404,
  });

  const minjiReply = await request("POST", "/api/messaging/rooms/f-kang/messages", {
    token: token("u-minji"),
    idempotencyKey: key("room-minji"),
    body: { text: `민지 비공개 답장 ${runId}` },
  });
  await request("PUT", "/api/farms/f-kang/follow", { token: token("u-seojun") });
  const seojunReply = await request("POST", "/api/messaging/rooms/f-kang/messages", {
    token: token("u-seojun"),
    idempotencyKey: key("room-seojun"),
    body: { text: `서준 비공개 답장 ${runId}` },
  });

  const minjiRoom = await request("GET", "/api/messaging/rooms/f-kang/messages", {
    token: token("u-minji"),
  });
  assert.ok(itemById(minjiRoom, "messageId", minjiReply.messageId));
  assert.ok(!itemById(minjiRoom, "messageId", seojunReply.messageId));
  const producerRoom = await request("GET", "/api/messaging/rooms/f-kang/messages", {
    token: token("u-kang"),
  });
  assert.ok(itemById(producerRoom, "messageId", minjiReply.messageId));
  assert.ok(itemById(producerRoom, "messageId", seojunReply.messageId));
});

await scenario("chat auto-follow, factual AI, and sensitive handoff", async () => {
  await request("DELETE", "/api/farms/f-kang/follow", { token: token("u-seojun") });
  const started = await request("POST", "/api/messaging/chats", {
    token: token("u-seojun"),
    idempotencyKey: key("chat-start"),
    body: { farmId: "f-kang" },
  });
  assert.equal(started.autoFollowed, true);

  const minjiChat = await request("GET", "/api/messaging/chats/f-kang/messages", {
    token: token("u-minji"),
  });
  await request("PUT", "/api/messaging/producer/chats/u-minji/ai-mode", {
    token: token("u-kang"),
    idempotencyKey: key("chat-auto"),
    body: { mode: "AUTO", version: minjiChat.thread.version },
  });

  const factual = await request("POST", "/api/messaging/chats/f-kang/messages", {
    token: token("u-minji"),
    idempotencyKey: key("chat-factual"),
    body: {
      text: "이 주문은 언제 배송되나요?",
      attachmentIds: [],
      orderId: state.primaryOrder.orderId,
    },
  });
  assert.ok(factual.reply);
  assert.ok(factual.reply.sourceRefs.length > 0);

  const handoff = await request("POST", "/api/messaging/chats/f-kang/messages", {
    token: token("u-minji"),
    idempotencyKey: key("chat-handoff"),
    body: { text: "농약을 얼마나 사용했는지 정확히 알려 주세요.", attachmentIds: [] },
  });
  assert.equal(handoff.reply.handoffStatus, "FORWARDED");
  assert.equal(handoff.reply.needsHuman, false);
});

await scenario("farm detail draft remains private until explicit save", async () => {
  const before = await request("GET", "/api/farms/f-kang");
  const draft = await request("POST", "/api/farms/me/detail-draft", {
    token: token("u-kang"),
    body: { inputText: "3대째 운영하는 감귤 농장을 소개해 주세요.", photos: [] },
  });
  assert.ok(Array.isArray(draft.content.blocks));
  const afterDraft = await request("GET", "/api/farms/f-kang");
  assert.deepEqual(afterDraft.detailContent, before.detailContent);

  const empty = await request("PATCH", "/api/farms/me", {
    token: token("u-kang"),
    body: { detailContent: { blocks: [] } },
  });
  assert.deepEqual(empty.detailContent, { blocks: [] });
  const publicFarm = await request("GET", "/api/farms/f-kang");
  assert.deepEqual(publicFarm.detailContent, { blocks: [] });
});

process.stdout.write(`\n✓ ${passed} real-server integration scenarios passed at ${baseUrl.origin}\n`);
