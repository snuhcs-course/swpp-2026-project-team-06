import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";

// DEV-297: 소식별 읽음 수와 팬 답장 시트의 Mock 계약(서버 test_room_reads_replies.py와 같은 규칙).
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
      const m = /Shared Mock: (http:\/\/\S+)\r?\n/.exec((out += d));
      if (m) resolve(m[1]);
    });
    child.once("close", (code, signal) =>
      reject(new Error(`Mock server exited before listening (exit ${code ?? signal}): ${err.trim() || "no stderr"}`)),
    );
  });
  return { child, base };
}

test("AC-15-9/10/11: Mock read counts, reply links and fan reply sheet follow the server contract", async () => {
  const dir = mkdtempSync(path.resolve(".expo/room-reads-test-"));
  const { child, base } = await startMock(dir);
  let n = 0;
  async function api(method, url, token, body, key) {
    const r = await fetch(base + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(key || method === "POST" ? { "Idempotency-Key": key ?? `k-${++n}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }
  const room = "/api/messaging/rooms/f-kang";
  const items = async (token) =>
    Object.fromEntries((await api("GET", `${room}/messages?limit=50`, token)).body.items.map((m) => [m.messageId, m]));
  try {
    const login = async (userId, app) =>
      (await api("POST", "/api/auth/test-login", null, { userId, app })).body.accessToken;
    const minji = await login("u-minji", "consumer"),
      seojun = await login("u-seojun", "consumer"),
      producer = await login("u-kang", "producer");
    assert.equal((await api("PUT", "/api/farms/f-kang/follow", seojun)).status, 200);

    // AC-15-9 읽음 위치: 팔로워·소식당 1회, 앞으로만, 생산자에게만 숫자
    let counts = await items(producer);
    assert.equal(counts["n-1"].readCount, 0);
    assert.equal((await api("PUT", `${room}/read`, minji, { lastReadMessageId: "n-1" })).status, 204);
    assert.equal((await api("PUT", `${room}/read`, minji, { lastReadMessageId: "n-1" })).status, 204);
    assert.equal((await api("PUT", `${room}/read`, minji, { lastReadMessageId: "n-2" })).status, 204);
    assert.equal((await api("PUT", `${room}/read`, seojun, { lastReadMessageId: "n-2" })).status, 204);
    counts = await items(producer);
    assert.equal(counts["n-1"].readCount, 1);
    assert.equal(counts["n-2"].readCount, 2);
    for (const m of Object.values(await items(minji))) {
      assert.equal(m.readCount ?? null, null);
      assert.equal(m.replyCount ?? null, null);
    }
    assert.equal((await api("PUT", `${room}/read`, null, { lastReadMessageId: "n-1" })).status, 401);
    assert.equal((await api("PUT", `${room}/read`, producer, { lastReadMessageId: "n-1" })).status, 403);
    assert.equal((await api("PUT", `${room}/read`, minji, { lastReadMessageId: "n-3" })).status, 404);

    // AC-15-10 답장은 보낸 순간 가장 최근 소식에 붙는다. 답장 행의 broadcastId는 계속 null
    const news = (await api("POST", `${room}/messages`, producer, { text: "수확 날짜 정했어요" })).body;
    const r1 = (await api("POST", `${room}/messages`, minji, { text: "좋아요" })).body;
    const r2 = (await api("POST", `${room}/messages`, seojun, { text: "기다릴게요" })).body;
    assert.equal(r1.broadcastId, null);
    assert.equal("answersBroadcastId" in r1, false);
    counts = await items(producer);
    assert.equal(counts[news.messageId].replyCount, 2);
    assert.equal(counts["n-1"].replyCount, 0);
    assert.equal(counts[r1.messageId].broadcastId, null);
    assert.equal("producerReadAt" in counts[r1.messageId], false);

    // AC-15-11 시트: 전체·안 읽음·예약 고객·모두에게 답장함
    const sheet = `${room}/broadcasts/${news.messageId}/replies`;
    let page = (await api("GET", sheet, producer)).body;
    assert.equal(page.total, 2);
    assert.equal(page.unreadCount, 2);
    assert.equal(page.lastReplyId, r2.messageId);
    assert.deepEqual(page.items.map((r) => r.messageId), [r1.messageId, r2.messageId]);
    assert.equal(page.items[0].reservedCustomer, true);
    assert.equal(page.broadcast.body, "수확 날짜 정했어요");
    assert.equal(page.items.every((r) => r.unread && !r.quoted), true);

    await api("POST", `${room}/messages`, producer, { text: "고마워요", replyToMessageId: r1.messageId });
    page = (await api("GET", sheet, producer)).body;
    assert.equal(page.unreadCount, 1);
    assert.equal(page.items[0].quoted, true);
    assert.equal(page.items[0].unread, false);
    const unread = (await api("GET", `${sheet}?filter=unread`, producer)).body;
    assert.deepEqual(unread.items.map((r) => r.messageId), [r2.messageId]);

    const read = await api("PUT", `${sheet}/read`, producer, { lastReadMessageId: r2.messageId });
    assert.deepEqual(read.body, { unreadCount: 0 });
    assert.equal((await api("PUT", `${sheet}/read`, producer, { lastReadMessageId: "reply-x" })).status, 404);

    // 권한: 소비자 403, 남의 농가 소식 404
    assert.equal((await api("GET", sheet, minji)).status, 403);
    assert.equal((await api("GET", `${room}/broadcasts/n-3/replies`, producer)).status, 404);
    assert.equal((await api("GET", "/api/messaging/rooms/f-halla/broadcasts/n-3/replies", producer)).status, 404);
  } finally {
    if (child.exitCode === null) {
      const exit = once(child, "exit");
      child.kill();
      await exit;
    }
  }
});
