import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";

// DEV-221: 포트 0으로 띄우고 Mock 서버가 첫 줄에 알린 실제 주소를 쓴다(병렬 worktree에서 고정 포트가 부딪히지 않게).
// 열기 전에 죽으면 요청한 포트·종료 코드·stderr를 메시지에 남긴다(EADDRINUSE·EPERM을 구분할 수 있게).
async function startMock(dir) {
  const child = spawn(process.execPath, ["scripts/mock-server.mjs"], {
    env: { ...process.env, FARMCLUB_MOCK_PORT: "0", FARMCLUB_MOCK_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "",
    err = "";
  child.stderr.on("data", (d) => (err += d));
  const base = await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => {
      const m = /Shared Mock: (http:\/\/\S+)\r?\n/.exec((out += d)); // 줄 끝까지 와야 포트가 다 온 것
      if (m) resolve(m[1]);
    });
    child.once("close", (code, signal) =>
      reject(
        new Error(
          `Mock server exited before listening (FARMCLUB_MOCK_PORT=0, exit ${code ?? signal}): ${err.trim() || "no stderr"}`,
        ),
      ),
    );
  });
  return { child, base };
}

test("AC-12-1/2/3/5/6/7/9: shared rooms enforce privacy, permissions, idempotency and durable storage", async () => {
  const dir = mkdtempSync(path.resolve(".expo/room-test-"));
  // 다시 켜면 포트가 바뀌므로 start()마다 주소를 새로 읽는다
  let child, base;
  async function start() {
    ({ child, base } = await startMock(dir));
  }
  async function stop() {
    const exit = once(child, "exit");
    child.kill();
    await exit;
  }
  async function api(method, url, token, body, key) {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }
  const room = "/api/messaging/rooms/f-kang/messages";
  try {
    await start();
    const login = async (userId, app) =>
      (await api("POST", "/api/auth/test-login", null, { userId, app })).body
        .accessToken;
    const a = await login("u-minji", "consumer"),
      b = await login("u-seojun", "consumer"),
      p = await login("u-kang", "producer"),
      pending = await login("u-misook", "producer");
    assert.equal((await api("GET", room)).status, 200);
    assert.equal(
      (await api("POST", room, null, { text: "anonymous" })).status,
      401,
    );
    assert.equal((await api("GET", room, b)).status, 200);
    assert.equal(
      (await api("POST", room, b, { text: "not following" }, "not-following"))
        .status,
      403,
    );
    assert.equal((await api("GET", room, pending)).status, 403);
    assert.equal(
      (await api("GET", "/api/messaging/rooms", pending)).status,
      403,
    );
    assert.equal(
      (await api("GET", "/api/messaging/rooms/f-halla/messages", p)).status,
      404,
    );
    assert.equal(
      (
        await api(
          "POST",
          "/api/messaging/news",
          pending,
          { body: "blocked" },
          "blocked",
        )
      ).status,
      403,
    );
    assert.equal((await api("PUT", "/api/farms/f-kang/follow", b)).status, 200);
    const replyA = await api(
      "POST",
      room,
      a,
      { text: "A private reply 010-1234-5678" },
      "a-one",
    );
    assert.equal(replyA.status, 200);
    assert.ok(!replyA.body.body.includes("010-1234-5678"));
    const duplicate = await api(
      "POST",
      room,
      a,
      { text: "A private reply 010-1234-5678" },
      "a-one",
    );
    assert.equal(duplicate.body.messageId, replyA.body.messageId);
    assert.equal(
      (await api("POST", room, a, { text: "different" }, "a-one")).status,
      409,
    );
    const replyB = await api(
      "POST",
      room,
      b,
      { text: "B private reply" },
      "b-one",
    );
    const pageA = (await api("GET", room, a)).body,
      pageB = (await api("GET", room, b)).body,
      pageP = (await api("GET", room, p)).body;
    assert.ok(!JSON.stringify(pageA).includes("B private reply"));
    assert.ok(!JSON.stringify(pageB).includes("A private reply"));
    assert.ok(pageP.items.some((x) => x.messageId === replyA.body.messageId));
    assert.ok(pageP.items.some((x) => x.messageId === replyB.body.messageId));
    const summary = (await api("GET", "/api/messaging/rooms", a)).body;
    assert.ok(!JSON.stringify(summary).includes("B private reply"));
    assert.equal(
      (await api("GET", room + "?cursor=" + replyB.body.messageId, a)).status,
      400,
    );
    const broadcast = await api(
      "POST",
      room,
      p,
      { text: "Broadcast for both" },
      "broadcast",
    );
    for (const token of [a, b])
      assert.ok(
        (await api("GET", room, token)).body.items.some(
          (x) => x.messageId === broadcast.body.messageId,
        ),
      );
    assert.equal(
      (await api("POST", room, a, { text: "x".repeat(1001) }, "long")).status,
      400,
    );
    const recent = (await api("GET", room + "?limit=1", a)).body;
    const older = (
      await api(
        "GET",
        room + "?limit=1&cursor=" + encodeURIComponent(recent.nextCursor),
        a,
      )
    ).body;
    assert.notEqual(recent.items[0].messageId, older.items[0].messageId);
    assert.ok(!JSON.stringify(older).includes("B private reply"));
    const media = (
      await api("POST", "/__mock/media", p, {
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlVAAAAAASUVORK5CYII=",
      })
    ).body.url;
    assert.ok(media);
    assert.equal(
      (
        await api("POST", "/__mock/media", a, {
          dataUrl: "data:image/png;base64,AAAA",
        })
      ).status,
      403,
    );
    const input = {
      body: "Photo broadcast",
      photos: [media],
      visibility: "PUBLIC",
    };
    const photo = await api("POST", "/api/messaging/news", p, input, "photo");
    assert.equal(photo.status, 200);
    assert.deepEqual(
      (await api("POST", "/api/messaging/news", p, input, "photo")).body,
      photo.body,
    );
    assert.ok(
      (await api("GET", "/api/messaging/farms/f-kang/news", b)).body.items.some(
        (x) => x.broadcastId === photo.body.broadcastId,
      ),
    );
    assert.equal(
      (
        await api(
          "PUT",
          "/api/messaging/news/" + photo.body.broadcastId + "/reaction",
          a,
        )
      ).status,
      200,
    );
    const privateChats = await api(
      "GET",
      "/api/messaging/chats/f-kang/messages",
      a,
    );
    assert.equal(privateChats.status, 200);
    assert.ok(!JSON.stringify(privateChats).includes("Broadcast for both"));
    const stored = JSON.parse(
      readFileSync(path.join(dir, "state.json"), "utf8"),
    );
    assert.equal(stored.roomReplies.length, 2);
    assert.equal(
      Object.values(stored.threads)
        .flat()
        .filter((m) => m.body === "B private reply").length,
      0,
    );
    await stop();
    await start();
    assert.ok(
      (await api("GET", room, a)).body.items.some(
        (x) => x.messageId === replyA.body.messageId,
      ),
    );
    // 사진 주소에는 처음 켠 서버의 포트가 들어 있다. 경로만 새 주소에 붙여 같은 파일이 남았는지 본다
    assert.equal((await fetch(base + new URL(media).pathname)).status, 200);
    assert.equal(
      (
        await fetch(base + "/health", {
          headers: { Origin: "https://untrusted.example" },
        })
      ).status,
      403,
    );
    assert.equal((await api("POST", "/__mock/reset", a)).status, 200);
    assert.equal((await api("GET", room, a)).status, 401);
  } finally {
    if (child?.exitCode === null) await stop();
  }
});

test("AC-12-14/15: producers delete their own news and it leaves every consumer view", async () => {
  const dir = mkdtempSync(path.resolve(".expo/room-delete-test-"));
  const { child, base } = await startMock(dir);
  async function api(method, url, token, body, key) {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }
  try {
    const login = async (userId, app) =>
      (await api("POST", "/api/auth/test-login", null, { userId, app })).body.accessToken;
    const minji = await login("u-minji", "consumer"),
      kang = await login("u-kang", "producer");
    const room = "/api/messaging/rooms/f-kang/messages";
    const sent = await api("POST", room, kang, { text: "쓰다 만 소식" }, "draft-news");
    assert.equal(sent.status, 200);
    const id = sent.body.broadcastId;
    const ids = async (token) => (await api("GET", room, token)).body.items.map((m) => m.messageId);
    assert.ok((await ids(minji)).includes(id));
    const reply = await api("POST", room, minji, { text: "몇 시예요?" }, "minji-reply");
    assert.equal(reply.status, 200);

    // AC-12-15: consumers get 403, other farms' news is 404 and stays
    assert.equal((await api("DELETE", "/api/messaging/news/" + id, minji)).status, 403);
    assert.equal((await api("DELETE", "/api/messaging/news/n-3", kang)).status, 404);
    const halla = await api("GET", "/api/messaging/farms/f-halla/news");
    assert.ok(halla.body.items.some((n) => n.broadcastId === "n-3"));

    // AC-12-14: delete hides it from the room, room preview and followed news; repeat is 204
    assert.equal((await api("DELETE", "/api/messaging/news/" + id, kang)).status, 204);
    assert.equal((await api("DELETE", "/api/messaging/news/" + id, kang)).status, 204);
    assert.ok(!(await ids(minji)).includes(id));
    assert.ok(!(await ids(kang)).includes(id));
    const rooms = await api("GET", "/api/messaging/rooms", minji);
    assert.notEqual(rooms.body.items.find((r) => r.farmId === "f-kang").lastMessage, "쓰다 만 소식");
    const news = await api("GET", "/api/messaging/news", minji);
    assert.ok(!news.body.items.some((n) => n.broadcastId === id));
    assert.ok((await ids(minji)).includes(reply.body.messageId));

    // public news leaves the farm news list, and liking it is 404
    assert.equal((await api("DELETE", "/api/messaging/news/n-2", kang)).status, 204);
    const farm = await api("GET", "/api/messaging/farms/f-kang/news");
    assert.ok(!farm.body.items.some((n) => n.broadcastId === "n-2"));
    const liked = await api("PUT", "/api/messaging/news/n-2/reaction", minji);
    assert.equal(liked.status, 404);
    assert.equal(liked.body.message, "삭제된 소식이에요.");
  } finally {
    if (child.exitCode === null) {
      const exit = once(child, "exit");
      child.kill();
      await exit;
    }
  }
});

// DEV-467 (FEAT-15 AC-15-12·13): 소식 카드 ‘농가에 답장’이 고른 소식에 붙고, 소비자 답장에 비공개 사진을 붙인다
test("AC-15-12 AC-15-13 shared Mock links replies to the tapped post and keeps reply photos private", async () => {
  const dir = mkdtempSync(path.resolve(".expo/room-test-"));
  const { child, base } = await startMock(dir);
  const api = async (method, url, token, body, key) => {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    "base64",
  );
  const upload = async (token, fields) => {
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "a.png");
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const r = await fetch(base + "/api/messaging/attachments", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: form,
    });
    return { status: r.status, body: await r.json() };
  };
  const room = "/api/messaging/rooms/f-kang";
  // 사진은 바이트로 내려온다. 볼 수 있는지만 본다
  const see = async (id, token) =>
    (await fetch(`${base}/api/messaging/attachments/${id}`, { headers: { Authorization: "Bearer " + token } })).status;
  try {
    const login = async (userId, app) =>
      (await api("POST", "/api/auth/test-login", null, { userId, app })).body.accessToken;
    const minji = await login("u-minji", "consumer"),
      seojun = await login("u-seojun", "consumer"),
      producer = await login("u-kang", "producer");
    const counts = async () =>
      Object.fromEntries(
        (await api("GET", `${room}/messages?limit=50`, producer)).body.items
          .filter((m) => m.broadcastId)
          .map((m) => [m.broadcastId, m.replyCount]),
      );
    const before = await counts();
    // 가장 최근 소식과 그 전 소식(작성 시각 순)
    const [latest, older] = (await api("GET", `${room}/messages?limit=50`, producer)).body.items
      .filter((m) => m.broadcastId)
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt) || y.messageId.localeCompare(x.messageId))
      .map((m) => m.broadcastId);
    assert.ok(latest && older);

    // 고른 소식(older)에 답장 → older의 답장 수만 는다
    const tapped = await api("POST", `${room}/messages`, minji, { text: "이 소식 좋아요", broadcastId: older }, "tap-1");
    assert.equal(tapped.status, 200, JSON.stringify(tapped.body));
    const after = await counts();
    assert.equal(after[older], before[older] + 1);
    assert.equal(after[latest], before[latest]);
    const sheet = await api("GET", `${room}/broadcasts/${older}/replies`, producer);
    assert.ok(sheet.body.items.some((r) => r.messageId === tapped.body.messageId));
    // 남의 농가 소식·없는 소식은 404, 생산자는 고를 수 없다
    assert.equal((await api("POST", `${room}/messages`, minji, { text: "x", broadcastId: "n-missing" }, "tap-2")).status, 404);
    assert.equal((await api("POST", `${room}/messages`, producer, { text: "x", broadcastId: older }, "tap-3")).status, 400);

    // 비공개 사진: 팔로우한 소비자만 올리고, 답장 쓴 소비자와 그 농가 생산자만 본다
    assert.equal((await upload(producer, { roomFarmId: "f-kang" })).status, 403);
    assert.equal((await upload(seojun, { roomFarmId: "f-kang" })).status, 403); // 시드에서 강씨네를 팔로우하지 않음
    const photo = await upload(minji, { roomFarmId: "f-kang" });
    assert.equal(photo.status, 200, JSON.stringify(photo.body));
    const id = photo.body.attachmentId;
    const withPhoto = await api("POST", `${room}/messages`, minji, { text: "", attachmentIds: [id] }, "photo-1");
    assert.equal(withPhoto.status, 200, JSON.stringify(withPhoto.body));
    assert.deepEqual(withPhoto.body.attachmentIds, [id]);
    assert.equal(await see(id, minji), 200);
    assert.equal(await see(id, producer), 200);
    assert.equal(await see(id, seojun), 404);
    // 다시 쓰기·4장·글도 사진도 없음은 거부
    assert.equal((await api("POST", `${room}/messages`, minji, { text: "again", attachmentIds: [id] }, "photo-2")).status, 404);
    assert.equal((await api("POST", `${room}/messages`, minji, { text: "many", attachmentIds: ["a", "b", "c", "d"] }, "photo-3")).status, 400);
    assert.equal((await api("POST", `${room}/messages`, minji, { text: " " }, "photo-4")).status, 400);
    // 생산자 팬 답장 시트에도 사진 id
    const latestSheet = await api("GET", `${room}/broadcasts/${latest}/replies`, producer);
    assert.deepEqual(latestSheet.body.items.find((r) => r.messageId === withPhoto.body.messageId)?.attachmentIds, [id]);
  } finally {
    const exit = once(child, "exit");
    child.kill();
    await exit;
  }
});
