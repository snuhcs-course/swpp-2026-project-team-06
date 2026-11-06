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
const api = require("../.expo/mock-build/packages/api/src/client.js");
const operations = {
  request: () => api.request("GET", "/api/auth/me"),
  privateImage: () => api.privateImage("synthetic-photo"),
  uploadAttachment: () => api.uploadAttachment(
    new File([new Uint8Array([137, 80, 78, 71])], "synthetic.png", { type: "image/png" }),
    { threadId: "synthetic-thread" },
  ),
};
function delayed() {
  api.configureApi({ namespace: "consumer" });
  api.setToken("same-second-token");
  let resolve;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  let events = 0;
  const unsubscribe = api.onAuthChange(() => { events++; });
  return {
    events: () => events,
    respond(status, reason) {
      assert(resolve, "operation must have started its authenticated fetch");
      resolve(new Response(JSON.stringify({
        code: "FORBIDDEN", message: "synthetic rejection", details: { reason },
      }), { status, headers: { "content-type": "application/json" } }));
    },
    cleanup() { unsubscribe(); globalThis.fetch = oldFetch; },
  };
}

for (const [name, operation] of Object.entries(operations)) {
  for (const [status, reason] of [[401, undefined], [403, "WRONG_APP"]]) {
    test(`AC-12-1: current ${name} ${status}/${reason ?? "expiry"} immediately clears auth`, async () => {
      const f = delayed();
      try {
        const pending = operation();
        f.respond(status, reason);
        await assert.rejects(pending, error => error instanceof api.ApiError && error.status === status);
        assert.equal(api.getToken(), null);
        assert.equal(f.events(), 1);
      } finally { f.cleanup(); }
    });
    test(`AC-12-1: old ${name} ${status}/${reason ?? "expiry"} cannot clear an equal-JWT relogin`, async () => {
      const f = delayed();
      try {
        const pending = operation();
        api.setToken("same-second-token");
        assert.equal(f.events(), 1);
        f.respond(status, reason);
        await assert.rejects(pending, error => error instanceof api.ApiError && error.status === status);
        assert.equal(api.getToken(), "same-second-token");
        assert.equal(f.events(), 1, "old response must not emit a new signout event");
      } finally { f.cleanup(); }
    });
  }
  test(`AC-12-1: ${name} resource 404 does not sign out the consumer`, async () => {
    const f = delayed();
    try {
      const pending = operation();
      f.respond(404);
      await assert.rejects(pending, error => error.status === 404);
      assert.equal(api.getToken(), "same-second-token");
      assert.equal(f.events(), 0);
    } finally { f.cleanup(); }
  });
}

test("AC-12-1: obsolete onboarding response cannot redirect a newer equal-JWT session", async () => {
  const f = delayed();
  let redirects = 0;
  const unsubscribe = api.onOnboardingRequired(() => { redirects++; });
  try {
    const pending = api.request("GET", "/synthetic");
    api.setToken("same-second-token");
    f.respond(403, "ONBOARDING_REQUIRED");
    await assert.rejects(pending);
    assert.equal(redirects, 0);
    assert.equal(api.getToken(), "same-second-token");
  } finally { unsubscribe(); f.cleanup(); }
});

test("AC-12-1: request from another app namespace cannot clear its current token", async () => {
  const f = delayed();
  try {
    const pending = api.request("GET", "/synthetic");
    api.configureApi({ namespace: "producer" });
    api.setToken("producer-token");
    f.respond(401);
    await assert.rejects(pending);
    assert.equal(api.getToken(), "producer-token");
    assert.equal(f.events(), 1);
  } finally { f.cleanup(); api.configureApi({ namespace: "consumer" }); }
});
