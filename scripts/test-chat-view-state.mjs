import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChatViewStateStore, sanitizeChatView, anchorScrollTarget,
  chatRowGeometry, visibleChatAnchors, survivingChatAnchor, ChatCursorTrail,
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

test("AC-12-1: authorization denial clears only its farm in the current session", () => {
  const store = new ChatViewStateStore({ clock: () => 1000 });
  const scope = store.advanceGeneration("a");
  const a = store.open(scope, "f-a", "t-a");
  const b = store.open(scope, "f-b", "t-b");
  store.clearFarm(scope, "f-a");
  assert(!store.isCurrentLease(a.lease));
  assert(store.isCurrentLease(b.lease));
  const next = store.advanceGeneration("b");
  const current = store.open(next, "f-a", "t-a");
  store.clearFarm(scope, "f-a");
  assert(store.isCurrentLease(current.lease));
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

test("AC-12-9: live lease invalidates on revisit, logout, clear and expiry", () => {
  let now = 1000;
  const store = new ChatViewStateStore({ clock: () => now, ttl: 100 });
  const scope = store.advanceGeneration("a");
  const first = store.open(scope, "f-a", "t-a");
  assert(store.isCurrentLease(first.lease));
  const second = store.open(scope, "f-a", "t-a");
  assert(!store.isCurrentLease(first.lease));
  assert(store.isCurrentLease(second.lease));
  now += 100;
  assert(!store.isCurrentLease(second.lease));
  const third = store.open(scope, "f-a", "t-a");
  store.clearConversation(scope, "t-a");
  assert(!store.isCurrentLease(third.lease));
  const fourth = store.open(scope, "f-a", "t-a");
  store.advanceGeneration(null);
  assert(!store.isCurrentLease(fourth.lease));
});

test("AC-12-9: snapshot preserves newest/unseen metadata without private fields", () => {
  const clean = sanitizeChatView({ ...snapshot(), newestLoadedMessageId: "m-99", hasUnseenMessages: true });
  assert.equal(clean.newestLoadedMessageId, "m-99");
  assert.equal(clean.hasUnseenMessages, true);
  assert.equal(sanitizeChatView({ ...snapshot(), hasUnseenMessages: "PRIVATE" }), null);
  assert.equal(sanitizeChatView({ ...snapshot(), newestLoadedMessageId: {} }), null);
});

test("AC-12-9: prefix geometry includes content padding, gaps and older control", () => {
  const sizes = new Map([["a", 60], ["b", 80], ["c", 100]]);
  assert.deepEqual(chatRowGeometry(["a", "b", "c"], sizes, 48, true), [
    { messageId: "a", top: 88, height: 60 },
    { messageId: "b", top: 168, height: 80 },
    { messageId: "c", top: 268, height: 100 },
  ]);
  assert.equal(chatRowGeometry(["a"], sizes, null, true).length, 0);
  assert.equal(chatRowGeometry(["a", "missing", "c"], sizes, 48, false).length, 1);
});

test("AC-12-9: delayed photo height changes recompute later tops without later row onLayout", () => {
  const sizes = new Map([["photo", 40], ["anchor", 100]]);
  const before = chatRowGeometry(["photo", "anchor"], sizes, null, false);
  sizes.set("photo", 440);
  const after = chatRowGeometry(["photo", "anchor"], sizes, null, false);
  assert.equal(after[1].top - before[1].top, 400);
  assert.equal(anchorScrollTarget(after[1].top, 27, 2000, 600) -
    anchorScrollTarget(before[1].top, 27, 2000, 600), 400);
});

test("AC-12-9: prepend preserves anchor despite removal of oldest-control", () => {
  const sizes = new Map([["old", 100], ["anchor", 100]]);
  const before = chatRowGeometry(["anchor"], sizes, 48, true)[0];
  const after = chatRowGeometry(["old", "anchor"], sizes, null, false)[1];
  assert.equal(after.top - before.top, 52);
  assert.equal(anchorScrollTarget(after.top, -12, 2000, 600), after.top + 12);
});

test("AC-12-9: captures signed first-visible anchor and visible neighbors only", () => {
  const rows = chatRowGeometry(["a", "b", "c"], new Map([["a", 100], ["b", 100], ["c", 100]]), null, false);
  assert.deepEqual(visibleChatAnchors(rows, 40, 190), [
    { messageId: "a", relativeOffset: -20 }, { messageId: "b", relativeOffset: 100 },
  ]);
  assert.deepEqual(visibleChatAnchors(rows, 1000, 190), []);
});

test("AC-12-9: removed anchor falls back to surviving saved visible neighbor", () => {
  const s = snapshot();
  assert.equal(survivingChatAnchor(s, new Set(["m-12", "m-13"])).messageId, "m-12");
  assert.deepEqual(survivingChatAnchor(s, new Set(["m-13"])), s.neighbors[0]);
  assert.equal(survivingChatAnchor(s, new Set(["different-room-message"])), null);
});

test("AC-12-9: cursor walk can traverse 120 messages with no arbitrary page limit", () => {
  const trail = new ChatCursorTrail(["m-120"]);
  for (let n = 119; n >= 1; n--)
    trail.accept("c-" + n, ["m-" + n], n > 1 ? "c-" + (n - 1) : null);
});

test("AC-12-8: cursor non-progress and cursor cycles fail visibly instead of looping", () => {
  assert.throws(() => new ChatCursorTrail().accept("a", ["m"], "a"), /다시 시도/);
  const trail = new ChatCursorTrail(["m"]);
  assert.throws(() => trail.accept("a", ["m"], "b"), /다시 시도/);
  const cycle = new ChatCursorTrail();
  cycle.accept("a", ["m-1"], "b");
  assert.throws(() => cycle.accept("b", ["m-2"], "a"), /다시 시도/);
});

test("AC-12-9: empty terminal page is valid and geometry fallback clamps both edges", () => {
  assert.doesNotThrow(() => new ChatCursorTrail(["m"]).accept("last", [], null));
  assert.equal(anchorScrollTarget(0, -1000, 400, 600), 0);
  assert.equal(anchorScrollTarget(5000, 27, 2000, 600), 1400);
});
