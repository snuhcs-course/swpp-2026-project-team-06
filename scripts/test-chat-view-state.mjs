import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChatViewStateStore, sanitizeChatView, anchorScrollTarget,
  CHAT_VIEW_LIMIT, CHAT_VIEW_IDLE_TTL,
} from "../packages/ui/src/chatViewState.ts";

const snapshot = (threadId = "t-a", farmId = "f-a", capturedAt = 1000) => ({
  version: 1, farmId, threadId,
  anchor: { messageId: "m-12", relativeOffset: -12 },
  neighbors: [{ messageId: "m-13", relativeOffset: 45 }],
  oldestLoadedMessageId: "m-1", nearBottom: false,
  scrollOffset: 123, viewportHeight: 600, contentHeight: 2000, capturedAt,
});

test("AC-12-9: snapshot preserves signed visible offsets and strips private fields", () => {
  const raw = { ...snapshot(), body: "PRIVATE", photoUrl: "PRIVATE" };
  raw.anchor.body = "PRIVATE";
  const clean = sanitizeChatView(raw);
  assert.equal(clean.anchor.relativeOffset, -12);
  assert(!JSON.stringify(clean).includes("PRIVATE"));
  assert.equal(anchorScrollTarget(900, 27, 2000, 600), 873);
  assert.equal(anchorScrollTarget(10, 27, 2000, 600), 0);
  assert.equal(anchorScrollTarget(900, -12, 800, 600), 200);
});

for (const bad of [
  { version: 2 }, { scrollOffset: -1 }, { viewportHeight: Infinity },
  { contentHeight: NaN }, { threadId: "" }, { anchor: null },
  { anchor: { messageId: "m", relativeOffset: Infinity } },
  { neighbors: new Array(9).fill({ messageId: "m", relativeOffset: 1 }) },
]) test("AC-12-9: invalid metadata is discarded " + JSON.stringify(bad), () => {
  assert.equal(sanitizeChatView({ ...snapshot(), ...bad }), null);
});

test("AC-12-9: farm, thread and visit identities stay separate", () => {
  const store = new ChatViewStateStore({ clock: () => 1000 });
  const scope = store.advanceGeneration("user-a");
  const a = store.open(scope, "f-a", "t-a");
  assert(store.save(a.lease, snapshot()));
  const b = store.open(scope, "f-b", "t-b");
  assert.equal(b.snapshot, null);
  assert(store.save(b.lease, snapshot("t-b", "f-b")));
  assert.equal(store.open(scope, "f-a", "t-a").snapshot.anchor.messageId, "m-12");
  assert.equal(store.save(a.lease, snapshot()), false, "old visit must not overwrite new visit");
  assert.equal(store.open(scope, "f-a", "replacement-thread").snapshot, null);
  assert.equal(store.save(b.lease, snapshot("t-b", "f-a")), false);
});

test("AC-12-1: logout, new login and account changes invalidate late callbacks", () => {
  const store = new ChatViewStateStore({ clock: () => 1000 });
  const a = store.advanceGeneration("user-a");
  const visit = store.open(a, "f-a", "t-a");
  store.save(visit.lease, snapshot());
  store.advanceGeneration(null);
  assert.equal(store.save(visit.lease, snapshot()), false);
  assert.equal(store.open(a, "f-a", "t-a"), null);
  const sameUser = store.advanceGeneration("user-a");
  assert.equal(store.open(sameUser, "f-a", "t-a").snapshot, null);
  const b = store.advanceGeneration("user-b");
  assert.equal(store.open(b, "f-a", "t-a").snapshot, null);
  assert.equal(store.save(visit.lease, snapshot()), false);
});

test("AC-12-1: clear-one and clear-all cannot be repopulated by late callbacks", () => {
  const store = new ChatViewStateStore({ clock: () => 1000 });
  const scope = store.advanceGeneration("a");
  const visit = store.open(scope, "f-a", "t-a");
  store.clearConversation(scope, "t-a");
  assert.equal(store.save(visit.lease, snapshot()), false);
  const current = store.open(scope, "f-a", "t-a");
  store.clearAll();
  assert.equal(store.save(current.lease, snapshot()), false);
  assert.equal(store.open(scope, "f-a", "t-a"), null);
});

test("AC-12-9: bounded LRU and idle expiry use the injected clock", () => {
  let now = 1000;
  const store = new ChatViewStateStore({ clock: () => now, limit: 2, ttl: 100 });
  const scope = store.advanceGeneration("a");
  for (const name of ["a", "b"]) {
    const v = store.open(scope, "f-" + name, "t-" + name);
    store.save(v.lease, snapshot("t-" + name, "f-" + name, now));
  }
  store.open(scope, "f-a", "t-a"); // refresh A, so B is least recently used
  store.open(scope, "f-c", "t-c");
  assert.equal(store.open(scope, "f-b", "t-b").snapshot, null);
  const visit = store.open(scope, "f-a", "t-a");
  store.save(visit.lease, snapshot("t-a", "f-a", now));
  now += 100;
  assert.equal(store.save(visit.lease, snapshot("t-a", "f-a", now)), false);
  assert.equal(store.open(scope, "f-a", "t-a").snapshot, null);
  assert.equal(CHAT_VIEW_LIMIT, 20);
  assert.equal(CHAT_VIEW_IDLE_TTL, 30 * 60 * 1000);
});
