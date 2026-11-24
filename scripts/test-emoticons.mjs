// DEV-468: public Mock HTTP contracts, authored from the approved spec only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const emoticons = [
  ["farmclub-reserved", "예약했어요"], ["farmclub-paid", "입금했어요"],
  ["farmclub-packing", "포장 중이에요"], ["farmclub-shipping", "오늘 출하해요"],
  ["farmclub-arrived", "잘 도착했어요"], ["farmclub-delicious", "맛있어요"],
  ["farmclub-wait", "잠시만요"], ["farmclub-check", "확인 부탁해요"],
  ["farmclub-thanks", "고마워요"], ["farmclub-sorry", "미안해요"],
];
const chat = "/api/messaging/chats/f-kang/messages";
const producerChat = "/api/messaging/producer/chats/u-minji/messages";
const room = "/api/messaging/rooms/f-kang/messages";
const news = "/api/messaging/news";
const farmNews = "/api/messaging/farms/f-kang/news";
const unwrap = (body) => body.message ?? body;
function check(message, id, caption) {
  assert.equal(message.emoticonId, id);
  assert.equal(message.body, caption);
  for (const field of ["photos", "videos", "attachmentIds"])
    assert.equal(message[field]?.length ?? 0, 0);
}
async function startMock(dir) {
  const child = spawn(process.execPath, ["scripts/mock-server.mjs"], {
    env: { ...process.env, FARMCLUB_MOCK_PORT: "0", FARMCLUB_MOCK_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  const closed = new Promise((resolve) => child.once("close", resolve));
  let out = "", err = "";
  child.stderr.on("data", (data) => { err += data; });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on("data", (data) => {
      out += data;
      const match = /Shared Mock: (http:\/\/\S+)\r?\n/.exec(out);
      if (match) resolve(match[1]);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => reject(new Error(`Mock exited before listening (${code ?? signal}): ${err}`)));
  });
  return { child, base, closed };
}

async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "farmclub-emoticons-"));
  let child, base, closed, sequence = 0;
  async function start() { ({ child, base, closed } = await startMock(dir)); }
  async function stop() {
    if (child?.exitCode === null && child.signalCode === null) child.kill();
    if (closed) await closed;
  }
  async function api(method, route, token, body, key) {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(["POST", "PATCH"].includes(method) ? { "Idempotency-Key": key ?? `emoticon-${++sequence}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  async function ok(method, route, token, body, key) {
    const response = await api(method, route, token, body, key);
    assert.equal(response.status, 200, `${method} ${route}: ${JSON.stringify(response.body)}`);
    return response.body;
  }
  async function upload(form, token) {
    const response = await fetch(base + "/api/messaging/attachments", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }
  const items = async (route, token) => (await ok("GET", `${route}?limit=50`, token)).items;
  try {
    await start();
    const minji = (await ok("POST", "/api/auth/test-login", null, { userId: "u-minji", app: "consumer" })).accessToken;
    const other = (await ok("POST", "/api/auth/test-login", null, { userId: "u-seojun", app: "consumer" })).accessToken;
    const producer = (await ok("POST", "/api/auth/test-login", null, { userId: "u-kang", app: "producer" })).accessToken;
    return { api, ok, items, upload, minji, other, producer, start, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

test("AC-12-21 AC-15-14 all ten standalone emoticons persist across Mock restart with fixed captions", async () => {
  const f = await fixture();
  const records = [];
  try {
    for (const [route, token, field, reload] of [
      [chat, f.minji, "text", chat], [producerChat, f.producer, "text", chat],
      [room, f.minji, "text", room], [room, f.producer, "text", room],
      [news, f.producer, "body", farmNews],
    ]) {
      for (const [id, caption] of emoticons) {
        const input = { [field]: "", emoticonId: id,
          ...(route === news ? { farmId: "f-kang", visibility: "PUBLIC", photos: [], videos: [] } : {}) };
        const key = `${route}-${id}-${records.length}`;
        const before = (await f.items(reload, f.minji)).length;
        const first = await f.ok("POST", route, token, input, key);
        assert.deepEqual(await f.ok("POST", route, token, input, key), first);
        assert.equal((await f.items(reload, f.minji)).length, before + 1);
        const message = unwrap(first);
        if (route !== news) check(message, id, caption);
        records.push({ reload, identifier: route === news ? "broadcastId" : "messageId", message, id, caption });
      }
    }
    await f.stop();
    await f.start();
    for (const r of records) {
      const reloaded = (await f.items(r.reload, f.minji)).find((m) => m[r.identifier] === r.message[r.identifier]);
      assert.ok(reloaded, `missing persisted ${r.id} in ${r.reload}`);
      check(reloaded, r.id, r.caption);
    }
  } finally { await f.stop(); }
});

test("AC-12-21 AC-15-14 invalid input creates no message; null preserves normal text editing", async () => {
  const f = await fixture();
  try {
    for (const [route, token, field, reload] of [
      [chat, f.minji, "text", chat], [producerChat, f.producer, "text", chat],
      [room, f.minji, "text", room], [room, f.producer, "text", room],
      [news, f.producer, "body", farmNews],
    ]) {
      const invalid = [
        { [field]: "", emoticonId: "unknown" },
        { [field]: "mixed", emoticonId: "farmclub-thanks" },
        { [field]: "" }, { [field]: "", emoticonId: null },
        ...(route === news ? [
          { body: "", emoticonId: "farmclub-thanks", photos: ["/photos/a.jpg"] },
          { body: "", emoticonId: "farmclub-thanks", videos: ["/videos/a.mp4"] },
        ] : [{ text: "", emoticonId: "farmclub-thanks", attachmentIds: ["not-an-attachment"] }]),
      ];
      for (const body of invalid) {
        const before = await f.items(reload, f.minji);
        const result = await f.api("POST", route, token, { ...body,
          ...(route === news ? { farmId: "f-kang", visibility: "PUBLIC" } : {}) });
        assert.ok(result.status >= 400 && result.status < 500, JSON.stringify(result));
        assert.deepEqual(await f.items(reload, f.minji), before);
      }
    }
    for (const [route, editPrefix] of [[chat, "/api/messaging/messages"], [room, room]]) {
      const message = unwrap(await f.ok("POST", route, f.minji, { text: "", emoticonId: "farmclub-paid" }));
      const response = await f.api("PATCH", `${editPrefix}/${message.messageId}`, f.minji, { text: "changed", version: message.editVersion ?? 0 });
      assert.ok(response.status >= 400 && response.status < 500, JSON.stringify(response));
      check((await f.items(route, f.minji)).find((m) => m.messageId === message.messageId), "farmclub-paid", "입금했어요");
      const ordinary = unwrap(await f.ok("POST", route, f.minji, { text: "ordinary", emoticonId: null }));
      const edited = unwrap(await f.ok("PATCH", `${editPrefix}/${ordinary.messageId}`, f.minji, { text: "edited", version: ordinary.editVersion ?? 0 }));
      assert.equal(edited.body, "edited");
      assert.equal(edited.emoticonId ?? null, null);
    }
  } finally { await f.stop(); }
});

test("AC-12-21 AC-15-14 emoticons keep reply privacy, target validation and access guards", async () => {
  const f = await fixture();
  try {
    const questionStates = async () => (await f.ok("GET", "/api/messaging/questions?status=OPEN", f.producer)).items.map((q) => [q.escalationId, q.status]);
    const before = await questionStates();
    const sent = await f.ok("POST", chat, f.minji, { text: "", emoticonId: "farmclub-thanks" });
    assert.equal(sent.reply, null);
    assert.equal(sent.message.needsHuman, false);
    assert.deepEqual(await questionStates(), before);
    const reply = await f.ok("POST", room, f.minji, { text: "", emoticonId: "farmclub-delicious", broadcastId: "n-2" });
    for (const token of [f.minji, f.producer])
      check((await f.items(room, token)).find((m) => m.messageId === reply.messageId), "farmclub-delicious", "맛있어요");
    for (const token of [f.other, null])
      assert.ok(!(await f.items(room, token)).some((m) => m.messageId === reply.messageId));
    const sheet = await f.ok("GET", "/api/messaging/rooms/f-kang/broadcasts/n-2/replies", f.producer);
    assert.ok(sheet.items.some((m) => m.messageId === reply.messageId));
    assert.ok(!(await f.items(chat, f.minji)).some((m) => m.messageId === reply.messageId));
    const input = { text: "", emoticonId: "farmclub-check" };
    for (const broadcastId of ["n-3", "n-missing"])
      assert.equal((await f.api("POST", room, f.minji, { ...input, broadcastId })).status, 404);
    assert.equal((await f.api("POST", room, f.producer, { ...input, broadcastId: "n-2" })).status, 400);
    assert.equal((await f.api("POST", "/api/messaging/rooms/f-halla/messages", f.producer, input)).status, 404);
    assert.equal((await f.api("POST", news, f.minji, { body: "", emoticonId: "farmclub-check" })).status, 403);
    const unfollow = await f.api("DELETE", "/api/farms/f-kang/follow", f.minji);
    assert.ok([200, 204].includes(unfollow.status));
    const prior = await f.items(room, f.producer);
    assert.equal((await f.api("POST", room, f.minji, input)).status, 403);
    assert.deepEqual(await f.items(room, f.producer), prior);
  } finally { await f.stop(); }
});

test("AC-15-14 rejecting a mixed emoticon preserves a valid photo for an ordinary private reply", async () => {
  const f = await fixture();
  try {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "a.png");
    form.append("roomFarmId", "f-kang");
    const attachment = await f.upload(form, f.minji);
    const before = await f.items(room, f.minji);
    const rejected = await f.api("POST", room, f.minji, {
      text: "", emoticonId: "farmclub-arrived", attachmentIds: [attachment.attachmentId],
    });
    assert.ok(rejected.status >= 400 && rejected.status < 500, JSON.stringify(rejected));
    assert.deepEqual(await f.items(room, f.minji), before);
    const photo = await f.ok("POST", room, f.minji, { text: "", attachmentIds: [attachment.attachmentId] });
    assert.deepEqual(photo.attachmentIds, [attachment.attachmentId]);
    assert.equal(photo.emoticonId ?? null, null);
    assert.deepEqual((await f.items(room, f.minji)).find((m) => m.messageId === photo.messageId).attachmentIds, [attachment.attachmentId]);
  } finally { await f.stop(); }
});
