// DEV-477: 자료 칸 썸네일 상태(apps/producer/src/lib/sourceThumb.ts). 받는 중 → 받음 / 404면 '그림 없음' /
// 500·시간 초과면 '불러오지 못했어요'. 실패를 조용히 삼켜 '준비 중'이 남던 회귀를 막는다.
// 받기는 실제 경로(sourcePageImage·productWorkspace.photo → privatePhotoBlob)에 fetch만 바꿔 넣는다.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { initialThumb, loadThumb, thumbFailure } from "../apps/producer/src/lib/sourceThumb.ts";

process.env.EXPO_PUBLIC_API_MOCK = "0";
process.env.EXPO_PUBLIC_SHARED_MOCK_URL = "";
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
} });
globalThis.URL.createObjectURL ??= () => "blob:thumb";
const require = createRequire(import.meta.url);
const client = require("../.expo/mock-build/packages/api/src/client.js");
const photos = require("../.expo/mock-build/packages/api/src/privatePhoto.js");
const source = require("../.expo/mock-build/packages/api/src/sourceAnalysis.js");
const workspace = require("../.expo/mock-build/packages/api/src/productWorkspace.js");

function stubFetch(handler) {
  const old = globalThis.fetch;
  globalThis.fetch = (url, init) => handler(String(url), init);
  return () => { globalThis.fetch = old; };
}
const jpeg = () => Promise.resolve(new Response(new Blob([new Uint8Array([255, 216, 255])]), { status: 200, headers: { "content-type": "image/jpeg" } }));
const status = (n) => () => Promise.resolve(new Response(JSON.stringify({ code: "X", message: "x", details: {} }), { status: n }));
const page = () => source.sourcePageImage("b1", "s1", 1, { variant: "thumb", source: { revision: 1, sanitizationVersion: 1 } });

test("DEV-477 a tile starts as loading (blank surface) only when there is a page to fetch", () => {
  assert.equal(initialThumb({ mime: "application/pdf", pageCount: 2 }), "loading");
  assert.equal(initialThumb({ mime: "image/jpeg", pageCount: 1 }), "loading");
  assert.equal(initialThumb({ mime: "application/pdf", pageCount: 0 }), "none");
  assert.equal(initialThumb({ mime: "text/plain", pageCount: 1 }), "none");
});

for (const [name, handler, want] of [
  ["a thumbnail is received", jpeg, "ready"],
  ["404 means there is no picture (kind and page count only)", status(404), "none"],
  ["500 shows the load-failure line", status(500), "failed"],
]) {
  test(`DEV-477 source page thumbnail: ${name}`, async () => {
    photos.clearPrivatePhotos();
    client.setToken("t");
    const restore = stubFetch(handler);
    try {
      const r = await loadThumb(page);
      assert.equal(r.thumb, want);
      assert.equal(Boolean(r.uri), want === "ready");
    } finally {
      restore();
    }
  });
}

test("DEV-477 a timed-out thumbnail shows the load-failure line", async () => {
  photos.clearPrivatePhotos();
  const restore = stubFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  try {
    const err = await photos.privatePhotoBlob("http://x/slow-thumb", 20).catch((e) => e);
    assert.ok(err instanceof photos.PhotoTimeoutError);
    assert.equal(thumbFailure(err), "failed");
    assert.equal((await loadThumb(() => Promise.reject(err))).thumb, "failed");
  } finally {
    restore();
  }
});

test("DEV-477 photos moved from the product page keep the 404 status through productWorkspace.photo", async () => {
  photos.clearPrivatePhotos();
  client.setToken("t");
  let restore = stubFetch(status(404));
  try {
    const err = await workspace.productWorkspace.photo("p1", "ph1").catch((e) => e);
    assert.ok(err instanceof client.ApiError);
    assert.equal(err.status, 404);
    assert.equal(err.message, "사진을 불러오지 못했어요.");
    assert.equal((await loadThumb(() => workspace.productWorkspace.photo("p1", "ph1"))).thumb, "none");
  } finally {
    restore();
  }
  photos.clearPrivatePhotos();
  restore = stubFetch(status(500));
  try {
    assert.equal((await loadThumb(() => workspace.productWorkspace.photo("p1", "ph2"))).thumb, "failed");
  } finally {
    restore();
  }
});
