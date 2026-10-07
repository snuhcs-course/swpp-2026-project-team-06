import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";

test("AC-12-1/2/3/5/6/7/9: shared rooms enforce privacy, permissions, idempotency and durable storage", async () => {
  const dir = mkdtempSync(path.resolve(".expo/room-test-"));
  const port = 18083,
    base = "http://127.0.0.1:" + port;
  let child;
  async function start() {
    child = spawn(process.execPath, ["scripts/mock-server.mjs"], {
      env: {
        ...process.env,
        FARMCLUB_MOCK_PORT: String(port),
        FARMCLUB_MOCK_DIR: dir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw new Error("Mock server exited");
      }),
    ]);
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
    assert.equal((await api("GET", room)).status, 401);
    assert.equal((await api("GET", room, b)).status, 403);
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
    assert.equal((await fetch(media)).status, 200);
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
