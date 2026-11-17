// DEV-341: producer private photos are fetched once per (login, URL), failures are not remembered,
// and a stalled download times out instead of leaving the screen loading forever.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

process.env.EXPO_PUBLIC_API_MOCK = "0";
process.env.EXPO_PUBLIC_SHARED_MOCK_URL = "";
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
} });
const require = createRequire(import.meta.url);
const client = require("../.expo/mock-build/packages/api/src/client.js");
const photos = require("../.expo/mock-build/packages/api/src/privatePhoto.js");
const source = require("../.expo/mock-build/packages/api/src/sourceAnalysis.js");

function stubFetch(handler) {
  const calls = [];
  const old = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization });
    return handler(String(url), init);
  };
  return { calls, restore: () => { globalThis.fetch = old; } };
}
const ok = () => Promise.resolve(new Response(new Blob([new Uint8Array([255, 216, 255])]), { status: 200 }));

test("DEV-341 same login and URL share one download; another login downloads again", async () => {
  photos.clearPrivatePhotos();
  client.setToken("token-a");
  const f = stubFetch(ok);
  try {
    const [a, b] = await Promise.all([photos.privatePhotoBlob("http://x/p1"), photos.privatePhotoBlob("http://x/p1")]);
    assert.equal(a, b);
    await photos.privatePhotoBlob("http://x/p1");
    assert.equal(f.calls.length, 1);
    client.setToken("token-b");
    await photos.privatePhotoBlob("http://x/p1");
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].auth, "Bearer token-b");
  } finally {
    f.restore();
  }
});

test("DEV-341 a failed download is not remembered, so a retry downloads again", async () => {
  photos.clearPrivatePhotos();
  client.setToken("token-a");
  let fail = true;
  const f = stubFetch(() => fail
    ? Promise.resolve(new Response(JSON.stringify({ code: "NOT_FOUND", message: "없음", details: {} }), { status: 404 }))
    : ok());
  try {
    await assert.rejects(photos.privatePhotoBlob("http://x/p2"), (e) => e instanceof client.ApiError && e.status === 404);
    fail = false;
    await photos.privatePhotoBlob("http://x/p2");
    assert.equal(f.calls.length, 2);
  } finally {
    f.restore();
  }
});

test("DEV-341 a stalled download times out", async () => {
  photos.clearPrivatePhotos();
  const f = stubFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  try {
    await assert.rejects(photos.privatePhotoBlob("http://x/slow", 20), photos.PhotoTimeoutError);
  } finally {
    f.restore();
  }
});

test("DEV-341 page previews ask for the display/thumb variant of the current revision", async () => {
  photos.clearPrivatePhotos();
  globalThis.URL.createObjectURL ??= () => "blob:x";
  const f = stubFetch(ok);
  try {
    await source.sourcePageImage("b1", "s1", 1, { variant: "thumb", source: { revision: 3, sanitizationVersion: 2 } });
    assert.match(f.calls[0].url, /\/batches\/b1\/sources\/s1\/pages\/1\/image\?variant=thumb&v=3\.2$/);
  } finally {
    f.restore();
  }
});

function slowBody(chunks, everyMs, stallAfter = Infinity) {
  let sent = 0;
  return new ReadableStream({
    async pull(controller) {
      if (sent >= stallAfter) return new Promise(() => {}); // stops making progress
      await new Promise((r) => setTimeout(r, everyMs));
      if (sent === chunks) return controller.close();
      sent += 1;
      controller.enqueue(new Uint8Array([sent]));
    },
  });
}

test("DEV-341 a slow but progressing download is not cut by the idle limit", async () => {
  photos.clearPrivatePhotos();
  const f = stubFetch(() => Promise.resolve(new Response(slowBody(8, 15), { status: 200, headers: { "content-type": "image/png" } })));
  try {
    // Total time (~135ms) is well past the 40ms idle limit, but each chunk arrives within it.
    const blob = await photos.privatePhotoBlob("http://x/slow-progress", 40, 5_000);
    assert.equal(blob.size, 8);
    assert.equal(blob.type, "image/png");
  } finally {
    f.restore();
  }
});

test("DEV-341 a body that stops making progress times out", async () => {
  photos.clearPrivatePhotos();
  const f = stubFetch(() => Promise.resolve(new Response(slowBody(8, 5, 2), { status: 200 })));
  try {
    await assert.rejects(photos.privatePhotoBlob("http://x/stall", 40, 5_000), photos.PhotoTimeoutError);
  } finally {
    f.restore();
  }
});

test("DEV-341 without body streaming only the generous total limit applies", async () => {
  photos.clearPrivatePhotos();
  const noStream = {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: null,
    blob: () => new Promise((r) => setTimeout(() => r(new Blob([new Uint8Array([1])])), 60)),
  };
  const f = stubFetch(() => Promise.resolve(noStream));
  try {
    const blob = await photos.privatePhotoBlob("http://x/no-stream", 20, 1_000);
    assert.equal(blob.size, 1);
    photos.clearPrivatePhotos();
    await assert.rejects(photos.privatePhotoBlob("http://x/no-stream-2", 20, 30), photos.PhotoTimeoutError);
  } finally {
    f.restore();
  }
});
