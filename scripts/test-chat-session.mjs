import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatSessionController, matchesChatIdentity } from "../apps/consumer/src/lib/chatSession.ts";
import { ChatViewStateStore } from "../packages/ui/src/chatViewState.ts";

function fixture() {
  const store = new ChatViewStateStore({ clock: () => 1000 });
  const session = new ChatSessionController(store);
  const ticket = session.beginRefresh("token-a");
  const scope = session.authorize(ticket, "token-a", "user-a");
  const visit = store.open(scope, "farm-a", "thread-a");
  const snapshot = {
    version: 1, farmId: "farm-a", threadId: "thread-a",
    anchor: { messageId: "message-12", relativeOffset: 27 }, neighbors: [],
    oldestLoadedMessageId: "message-1", nearBottom: false,
    scrollOffset: 1200, viewportHeight: 600, contentHeight: 2400, capturedAt: 1000,
  };
  assert(store.save(visit.lease, snapshot));
  return { store, session, scope, visit, snapshot };
}

test("AC-12-9: ordinary same-session auth.me refresh retains scope and reading metadata", () => {
  const { store, session, scope } = fixture();
  const ticket = session.beginRefresh("token-a");
  assert.equal(session.authorize(ticket, "token-a", "user-a"), scope);
  assert.equal(store.open(scope, "farm-a", "thread-a").snapshot.anchor.relativeOffset, 27);
});

test("AC-12-1: explicit logout invalidates snapshots and pending saves synchronously", () => {
  const { store, session, scope, visit, snapshot } = fixture();
  session.invalidate();
  assert.equal(store.scope(), null);
  assert.equal(store.open(scope, "farm-a", "thread-a"), null);
  assert.equal(store.save(visit.lease, snapshot), false);
});

test("AC-12-1: same-user relogin with identical JWT bytes creates a new clean generation", () => {
  const { store, session, scope, visit, snapshot } = fixture();
  session.invalidate(); // setToken event, even if token bytes are unchanged
  const ticket = session.beginRefresh("token-a");
  const next = session.authorize(ticket, "token-a", "user-a");
  assert.notEqual(next.generation, scope.generation);
  assert.equal(store.open(next, "farm-a", "thread-a").snapshot, null);
  assert.equal(store.save(visit.lease, snapshot), false);
});

test("AC-12-1: a new auth event rejects late auth.me even when the JWT is equal", () => {
  const { session } = fixture();
  const old = session.beginRefresh("same-second-token");
  session.invalidate();
  const current = session.beginRefresh("same-second-token");
  assert.equal(session.authorize(old, "same-second-token", "user-a"), null);
  assert(session.authorize(current, "same-second-token", "user-a"));
});

test("AC-12-1: out-of-order auth.me requests cannot reestablish the earlier account", () => {
  const { store, session, visit, snapshot } = fixture();
  const old = session.beginRefresh("token-a");
  const newest = session.beginRefresh("token-a");
  const next = session.authorize(newest, "token-a", "user-b");
  assert.equal(next.userId, "user-b");
  assert.equal(session.authorize(old, "token-a", "user-a"), null);
  assert.equal(store.scope(), next);
  assert.equal(store.save(visit.lease, snapshot), false);
});

test("AC-12-1: different verified consumer clears former consumer metadata without relying on token bytes", () => {
  const { store, session, scope, visit, snapshot } = fixture();
  const ticket = session.beginRefresh("token-a");
  const next = session.authorize(ticket, "token-a", "user-b");
  assert.notEqual(next.generation, scope.generation);
  assert.equal(store.open(next, "farm-a", "thread-a").snapshot, null);
  assert.equal(store.save(visit.lease, snapshot), false);
});

test("AC-12-1: token-loss refresh rejects in-flight response and leaves no authorized scope", () => {
  const { store, session, visit, snapshot } = fixture();
  const old = session.beginRefresh("token-a");
  const signedOut = session.beginRefresh(null);
  assert.equal(session.authorize(old, null, "user-a"), null);
  assert.equal(session.authorize(signedOut, null, "user-a"), null);
  assert.equal(store.scope(), null);
  assert.equal(store.save(visit.lease, snapshot), false);
});

for (const reason of ["401 expiry", "403 WRONG_APP"]) {
  test(`AC-12-1: ${reason} auth event rejects restoring and reentering protected state`, () => {
    const { store, session, scope, visit, snapshot } = fixture();
    const old = session.beginRefresh("token-a");
    session.invalidate();
    assert.equal(session.isCurrent(old, null), false);
    assert.equal(session.authorize(old, null, "user-a"), null);
    assert.equal(store.open(scope, "farm-a", "thread-a"), null);
    assert.equal(store.save(visit.lease, snapshot), false);
  });
}

test("AC-12-9: transient auth.me failure preserves safe same-session metadata for retry", () => {
  const { store, session, scope } = fixture();
  const failed = session.beginRefresh("token-a");
  // Failure does not call authorize or invalidate; the provider hides user UI.
  assert(session.isCurrent(failed, "token-a"));
  assert(store.isCurrent(scope));
  const retry = session.beginRefresh("token-a");
  assert.equal(session.authorize(retry, "token-a", "user-a"), scope);
  assert.equal(store.open(scope, "farm-a", "thread-a").snapshot.anchor.messageId, "message-12");
});

test("AC-12-1: provider recreation invalidates old route callbacks and pending refresh tickets", () => {
  const { store, session, scope, visit, snapshot } = fixture();
  const old = session.beginRefresh("token-a");
  session.invalidate(); // SessionProvider effect cleanup invalidates its own controller.
  const recreated = new ChatSessionController(store);
  assert.equal(store.scope(), null);
  assert.equal(store.save(visit.lease, snapshot), false);
  const ticket = recreated.beginRefresh("token-a");
  const next = recreated.authorize(ticket, "token-a", "user-a");
  assert.notEqual(next.generation, scope.generation);
  assert.equal(store.open(next, "farm-a", "thread-a").snapshot, null);
  assert.equal(session.authorize(old, "token-a", "user-a"), null);
  assert.equal(store.scope(), next);
});

test("AC-12-1: changed token rejects response even before the observer has run", () => {
  const { session } = fixture();
  const ticket = session.beginRefresh("token-a");
  assert.equal(session.authorize(ticket, "token-b", "user-a"), null);
});

test("AC-12-1: first-page identity must match both authenticated consumer and requested farm", () => {
  const thread = { threadId: "thread-a", consumerId: "user-a", farmId: "farm-a" };
  assert(matchesChatIdentity(thread, "user-a", "farm-a"));
  assert.equal(matchesChatIdentity(thread, "user-b", "farm-a"), false);
  assert.equal(matchesChatIdentity(thread, "user-a", "farm-b"), false);
  assert.equal(matchesChatIdentity({ ...thread, threadId: "" }, "user-a", "farm-a"), false);
  assert.equal(matchesChatIdentity(null, "user-a", "farm-a"), false);
});
