import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const {
  db,
  reset,
  configureMockStorage,
} = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });
let seq = 0;
const api = (method, path, token, body, key = "story-" + ++seq) =>
  mockTransport({
    method,
    path,
    body,
    headers: {
      Authorization: token ? "Bearer " + token : "",
      "Idempotency-Key": key,
    },
  });
async function ok(...args) {
  const r = await api(...args);
  assert.equal(r.status, 200, JSON.stringify(r));
  return structuredClone(r.body);
}
async function login(userId, app) {
  return (await ok("POST", "/api/auth/test-login", null, { userId, app }))
    .accessToken;
}

test("AC-03-4/07-5: detail drafts do not publish, edits persist and validation/ownership/version remain enforced", async () => {
  reset();
  db().users["u-halla"] = {
    userId: "u-halla",
    name: "테스트 생산자",
    role: "PRODUCER",
    farmId: "f-halla",
  };
  db().tokens["other-producer-token"] = "u-halla";
  const p = await login("u-kang", "producer"),
    other = "other-producer-token",
    c = await login("u-minji", "consumer");
  const before = await ok("GET", "/api/farms/f-kang");
  const draft = await ok("POST", "/api/farms/me/detail-draft", p, {
    inputText: "나무에서 시작하는 이야기",
    photos: ["/photos/farmer.jpg"],
  });
  assert.equal(draft.mode, "mock");
  assert.ok(draft.content.blocks.some((b) => b.type === "image"));
  assert.deepEqual(
    (await ok("GET", "/api/farms/f-kang")).detailContent,
    before.detailContent,
  );
  const edit = structuredClone(draft.content);
  edit.blocks[0].title = "직접 고친 제목";
  await ok("PATCH", "/api/farms/me", p, { detailContent: edit });
  assert.deepEqual((await ok("GET", "/api/farms/f-kang")).detailContent, edit);
  assert.equal(
    (
      await api("POST", "/api/farms/me/detail-draft", c, {
        inputText: "x",
        photos: [],
      })
    ).status,
    403,
  );
  for (const bad of [
    {
      blocks: [
        { id: "x", type: "image", uri: "javascript:alert(1)", alt: "x" },
      ],
    },
    { blocks: [...edit.blocks, edit.blocks[0]] },
    { blocks: [{ id: "x", type: "text", title: "", body: "" }] },
  ])
    assert.equal(
      (await api("PATCH", "/api/farms/me", p, { detailContent: bad })).status,
      400,
    );
  assert.deepEqual((await ok("GET", "/api/farms/f-kang")).detailContent, edit);
  const productId = Object.values(db().products).find(
    (x) => x.farmId === "f-kang" && x.status === "PUBLISHED",
  ).productId;
  const minePath = "/api/products/mine/" + productId,
    path = "/api/products/" + productId;
  const initial = await ok("GET", minePath, p);
  const productDraft = await ok("POST", minePath + "/detail-draft", p, {
    inputText: "과일 이야기\n5kg 25,000원",
    photos: [],
  });
  assert.ok(!JSON.stringify(productDraft.content).includes("25,000원"));
  assert.equal(
    (
      await api("POST", minePath + "/detail-draft", other, {
        inputText: "",
        photos: [],
      })
    ).status,
    404,
  );
  const saved = await ok(
    "PATCH",
    path,
    p,
    { version: initial.version, detailContent: productDraft.content },
    "save-story",
  );
  assert.equal(saved.version, initial.version + 1);
  assert.deepEqual(
    await ok(
      "PATCH",
      path,
      p,
      { version: initial.version, detailContent: productDraft.content },
      "save-story",
    ),
    saved,
  );
  assert.deepEqual((await ok("GET", path)).detailContent, productDraft.content);
  assert.equal(
    (
      await api("PATCH", path, p, {
        version: initial.version,
        detailContent: edit,
      })
    ).status,
    409,
  );
  assert.deepEqual((await ok("GET", path)).detailContent, productDraft.content);
  assert.equal(
    (
      await api("POST", minePath + "/detail-draft", p, {
        inputText: "x".repeat(3001),
        photos: [],
      })
    ).status,
    400,
  );
  db().products[productId].status = "CLOSED";
  assert.equal(
    (
      await api("POST", minePath + "/detail-draft", p, {
        inputText: "x",
        photos: [],
      })
    ).status,
    409,
  );
});

test("AC-12-11: public room pages/summaries/cursors never reveal follower broadcasts or replies", async () => {
  reset();
  const a = await login("u-minji", "consumer"),
    b = await login("u-seojun", "consumer"),
    p = await login("u-kang", "producer");
  const room = "/api/messaging/rooms/f-kang/messages";
  const pub = await ok("POST", "/api/messaging/news", p, {
    body: "PUBLIC ONLY",
    visibility: "PUBLIC",
    photos: [],
  });
  const hidden = await ok("POST", room, p, { text: "FOLLOWER SECRET" });
  const reply = await ok("POST", room, a, { text: "PRIVATE REPLY" });
  for (const token of [null, b]) {
    let cursor,
      items = [];
    do {
      const page = await ok(
        "GET",
        room +
          "?limit=1" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
        token,
      );
      assert.equal(page.room.canReply, false);
      assert.ok(!JSON.stringify(page.room).includes("SECRET"));
      assert.ok(!JSON.stringify(page.room).includes("PRIVATE"));
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    assert.ok(items.some((x) => x.messageId === pub.broadcastId));
    assert.ok(
      !items.some(
        (x) =>
          x.messageId === hidden.messageId || x.messageId === reply.messageId,
      ),
    );
  }
  const member = await ok("GET", room + "?limit=1", a);
  await ok("DELETE", "/api/farms/f-kang/follow", a);
  const now = await ok("GET", room, a);
  assert.equal(now.room.canReply, false);
  assert.ok(!JSON.stringify(now).includes("SECRET"));
  assert.equal(
    (
      await api(
        "GET",
        room + "?cursor=" + encodeURIComponent(member.nextCursor),
        a,
      )
    ).status,
    400,
  );
  assert.equal((await api("POST", room, a, { text: "blocked" })).status, 403);
  assert.equal(
    (
      await api(
        "PUT",
        "/api/messaging/news/" + hidden.broadcastId + "/reaction",
        a,
      )
    ).status,
    404,
  );
  await ok("PUT", "/api/messaging/news/" + pub.broadcastId + "/reaction", a);
  db().farms["f-kang"].status = "SUSPENDED";
  assert.equal((await api("GET", room)).status, 404);
});

test("AC-07-6: comparison uses the same option in the last period and suppresses unavailable or non-discount prices", async () => {
  reset();
  const {
    referencePrice,
  } = require("../.expo/mock-build/packages/api/src/productPresentation.js");
  const p = await ok("GET", "/api/products/p-house");
  assert.equal(referencePrice(p, p.options[0].optionId), 36000);
  assert.equal(referencePrice(p, p.options[1].optionId), 68000);
  assert.equal(
    referencePrice({ ...p, stages: [...p.stages].reverse() }),
    36000,
  );
  assert.equal(referencePrice({ ...p, soldOut: true }), null);
  assert.equal(referencePrice({ ...p, remainingGrams: 4999 }), null);
  const fractional = structuredClone(p);
  fractional.options[0].weightKg = 4.001;
  fractional.remainingGrams = 4001;
  assert.equal(referencePrice(fractional), 36000);
  assert.equal(referencePrice({ ...p, currentStageId: "missing" }), null);
  assert.equal(referencePrice(p, "missing"), null);
  const final = p.stages.reduce((a, b) => (a.seq > b.seq ? a : b));
  assert.equal(referencePrice({ ...p, currentStageId: final.stageId }), null);
  const empty = structuredClone(p);
  const value = empty.stages.find((s) => s.stageId === empty.currentStageId)
    .options[empty.options[0].optionId];
  value.reservedCount = value.quantity;
  assert.equal(referencePrice(empty), null);
  assert.equal(
    p.detailContent.blocks.filter((b) => b.type === "image").length,
    1,
  );
  assert.equal(p.detailContent.blocks[0].uri, "/photos/farm-story.png");
});

test("AC-07-3: paused or total-sold-out products stay visible and unreservable on detail and farm page", async () => {
  for (const [change, availability] of [
    [(p) => (p.salesPaused = true), "PAUSED"],
    [(p) => (p.salesLimitGrams = 0), "TOTAL_SOLD_OUT"],
  ]) {
    reset();
    change(db().products["p-house"]);
    const detail = await ok("GET", "/api/products/p-house");
    assert.equal(detail.availability, availability);
    assert.equal(detail.soldOut, true);
    assert.equal(detail.nextStageStartsAt, null);
    const farm = await ok("GET", "/api/farms/f-kang");
    const card = farm.products.find((c) => c.productId === "p-house");
    assert.equal(card.soldOut, true);
    assert.equal(card.nextStageStartsAt, null);
  }
  // 이번 기간만 품절(AC-07-1)은 다음 기간 날짜를 그대로 알려 준다.
  reset();
  const redhyang = await ok("GET", "/api/products/p-redhyang");
  assert.equal(redhyang.availability, "PERIOD_SOLD_OUT");
  assert.equal(redhyang.soldOut, true);
  assert.ok(redhyang.nextStageStartsAt);
});

test("AC-07-3 DEV-327: paused, not-open and ended products still leave home and farm featured", async () => {
  const future = (p) =>
    p.stages.forEach((s) => ((s.startsAt = "2026-12-01"), (s.endsAt = "2026-12-31")));
  const past = (p) =>
    p.stages.forEach((s) => ((s.startsAt = "2026-09-01"), (s.endsAt = "2026-09-30")));
  for (const [change, availability] of [
    [(p) => (p.salesPaused = true), "PAUSED"],
    [future, "NOT_OPEN"],
    [past, "ENDED"],
  ]) {
    reset();
    change(db().products["p-hyodon"]);
    assert.equal((await ok("GET", "/api/products/p-hyodon")).availability, availability);
    const home = await ok("GET", "/api/home");
    assert.ok(!home.recommended.some((c) => c.productId === "p-hyodon"), availability);
    const hyodon = (await ok("GET", "/api/farms")).items.find((f) => f.farmId === "f-hyodon");
    assert.equal(hyodon.featured, null, availability);
  }
  // 판매 중지된 히어로 상품은 히어로 링크도 비운다
  reset();
  db().products["p-house"].salesPaused = true;
  assert.equal((await ok("GET", "/api/home")).hero.productId, null);
});

test("AC-07-3 DEV-327: sold-out products stay on home after available ones, hero only when available", async () => {
  reset();
  let home = await ok("GET", "/api/home");
  // 시드 레드향(이번 기간 품절)은 예약 가능 상품 뒤에 남는다
  assert.deepEqual(
    home.recommended.map((c) => c.productId),
    ["p-house", "p-hyodon", "p-noji", "p-redhyang"],
  );
  assert.equal(home.recommended.at(-1).availability, "PERIOD_SOLD_OUT");
  assert.equal(home.hero.productId, "p-house");

  reset();
  db().products["p-house"].salesLimitGrams = 0;
  home = await ok("GET", "/api/home");
  assert.deepEqual(
    home.recommended.map((c) => [c.productId, c.availability]),
    [
      ["p-hyodon", "AVAILABLE"],
      ["p-noji", "AVAILABLE"],
      ["p-house", "TOTAL_SOLD_OUT"],
      ["p-redhyang", "PERIOD_SOLD_OUT"],
    ],
  );
  // 히어로 상품이 품절이면 추천에는 남아도 히어로 링크는 비운다
  assert.equal(home.hero.productId, null);
});

test("AC-07-3 DEV-327: farm featured falls back to a sold-out product and sorts after available farms", async () => {
  reset();
  let farms = (await ok("GET", "/api/farms")).items;
  assert.deepEqual(
    farms.map((f) => f.featured && [f.featured.productId, f.featured.availability]),
    [["p-house", "AVAILABLE"], ["p-hyodon", "AVAILABLE"], ["p-noji", "AVAILABLE"], null],
  );

  reset();
  db().products["p-house"].salesPaused = true;
  const kang = (await ok("GET", "/api/home")).farms.find((f) => f.farmId === "f-kang");
  // 강씨네: 하우스는 중지라 빠지고, 예약 가능 상품이 없어 이번 기간 품절인 레드향이 대표
  assert.equal(kang.featured.productId, "p-redhyang");
  assert.equal(kang.featured.availability, "PERIOD_SOLD_OUT");

  reset();
  db().products["p-hyodon"].salesLimitGrams = 0;
  farms = (await ok("GET", "/api/farms")).items;
  // 효돈(10/16)이 총 한도 소진: 노지(10/25)만 파는 한라 아래, 대표 없는 남원 위
  assert.deepEqual(
    farms.map((f) => f.farmId),
    ["f-kang", "f-halla", "f-hyodon", "f-namwon"],
  );
  assert.equal(farms[2].featured.availability, "TOTAL_SOLD_OUT");
});

test("AC-15-8/AC-06-8: unfollowed consumer keeps only own replies, re-follow restores room and chat list (DEV-230)", async () => {
  reset();
  const a = await login("u-minji", "consumer"),
    b = await login("u-seojun", "consumer"),
    p = await login("u-kang", "producer");
  const room = "/api/messaging/rooms/f-kang/messages";
  await ok("PUT", "/api/farms/f-kang/follow", b);
  const secret = await ok("POST", room, p, { text: "FOLLOWER SECRET" });
  const mine = await ok("POST", room, a, { text: "MY REPLY" });
  const other = await ok("POST", room, b, { text: "OTHER REPLY" });
  const ids = async () => (await ok("GET", room, a)).items.map((x) => x.messageId);
  const listed = async () =>
    (await ok("GET", "/api/messaging/rooms", a)).items.map((r) => r.farmId);
  const before = await ids();
  assert.ok(before.includes(secret.messageId) && before.includes(mine.messageId));

  await ok("DELETE", "/api/farms/f-kang/follow", a);
  const page = await ok("GET", room, a);
  const after = page.items.map((x) => x.messageId);
  assert.equal(page.room.canReply, false);
  assert.ok(after.includes(mine.messageId));
  assert.ok(!after.includes(secret.messageId));
  assert.ok(!after.includes(other.messageId));
  assert.equal(page.room.lastMessage, "MY REPLY");
  assert.ok(!(await listed()).includes("f-kang"));
  assert.equal((await api("POST", room, a, { text: "blocked" })).status, 403);
  const anonymous = (await ok("GET", room, null)).items.map((x) => x.messageId);
  assert.ok(!anonymous.includes(mine.messageId));

  await ok("PUT", "/api/farms/f-kang/follow", a);
  assert.deepEqual(await ids(), before);
  assert.ok((await listed()).includes("f-kang"));
});

test("AC-06-9: home card price is the cheapest current option with '~' only when there are several (DEV-348)", async () => {
  reset();
  const {
    lowestPrice,
  } = require("../.expo/mock-build/packages/api/src/productPresentation.js");
  const p = await ok("GET", "/api/products/p-house");
  // 시드 p-house: 지금 기간 5kg 29,000원 · 10kg 55,000원
  assert.deepEqual(lowestPrice(p), { price: 29000, several: true });
  const one = { ...p, options: p.options.slice(0, 1) };
  assert.deepEqual(lowestPrice(one), { price: 29000, several: false });
  // 첫 옵션이 가장 싸지 않아도 가장 싼 값(‘~’는 ‘부터’라는 뜻)
  assert.equal(lowestPrice({ ...p, options: [...p.options].reverse() }).price, 29000);
  // 지금 기간이 없으면 계산하지 않는다(카드는 기존 currentPrice와 빈 값 규칙을 쓴다)
  assert.equal(lowestPrice({ ...p, currentStageId: null }), null);
  assert.equal(lowestPrice({ ...p, currentStageId: "missing" }), null);
  assert.equal(lowestPrice({ ...p, options: [] }), null);
});
