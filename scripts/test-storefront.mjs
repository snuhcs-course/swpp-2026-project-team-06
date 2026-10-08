import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/mock/index.js");
const {
  db,
  reset,
  configureMockStorage,
} = require("../.expo/mock-build/mock/db.js");
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

test("AC-12-10: public room pages/summaries/cursors never reveal follower broadcasts or replies", async () => {
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
