// Specification-only tests of the public merge API.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeChatMessages } from "../packages/ui/src/chatOrder.ts";

const at = "2026-11-05T01:00:00Z";
const ids = rows => rows.map(row => row.messageId);
const message = (messageId, extra = {}) => ({ messageId, createdAt: at, ...extra });

test("merge: older equal-time question goes before cached answer regardless of IDs", () => {
  const answer = message("a-answer");
  const question = message("z-question");
  assert.deepEqual(mergeChatMessages([answer], [question], true), [question, answer]);
});

test("merge: refreshed equal-time answer follows cached question by default", () => {
  const question = message("z-question");
  const answer = message("a-answer");
  assert.deepEqual(mergeChatMessages([question], [answer]), [question, answer]);
});

test("merge: old API preserves chronological order inside equal-time page batches", () => {
  const old = [message("m-question"), message("a-answer")];
  const earlier = [message("z-question"), message("b-answer")];
  const later = [message("y-question"), message("c-answer")];
  assert.deepEqual(mergeChatMessages(old, earlier, true), [...earlier, ...old]);
  assert.deepEqual(mergeChatMessages(old, later, false), [...old, ...later]);
});

for (const older of [true, false]) {
  test(`merge: all saved sequences override timestamps, IDs and page direction (older=${older})`, () => {
    const first = message("z-first", { sequence: 10, createdAt: "2026-11-07T01:00:00Z" });
    const second = message("a-second", { sequence: 11, createdAt: "2026-11-06T01:00:00Z" });
    const third = message("m-third", { sequence: 12, createdAt: "2026-11-04T01:00:00Z" });
    assert.deepEqual(mergeChatMessages([third, first], [second], older), [first, second, third]);
  });

  test(`merge: old API sorts unequal timestamps across page boundaries (older=${older})`, () => {
    const first = message("first", { createdAt: "2026-11-03T01:00:00Z" });
    const second = message("second", { createdAt: "2026-11-04T01:00:00Z" });
    const third = message("third", { createdAt: "2026-11-05T01:00:00Z" });
    assert.deepEqual(mergeChatMessages([third, first], [second], older), [first, second, third]);
  });
}

test("merge: mixed API uses timestamps and older page order for equal-time conversation", () => {
  const first = message("first", { sequence: 99, createdAt: "2026-11-04T01:00:00Z" });
  const question = message("z-question");
  const answer = message("a-answer", { sequence: 1 });
  const last = message("last", { createdAt: "2026-11-06T01:00:00Z" });
  assert.deepEqual(mergeChatMessages([answer, last], [first, question], true), [first, question, answer, last]);
});

test("merge: mixed API keeps cached question before refreshed equal-time answer", () => {
  const question = message("z-question", { sequence: 90 });
  const answer = message("a-answer");
  const later = message("later", { sequence: 1, createdAt: "2026-11-06T01:00:00Z" });
  assert.deepEqual(mergeChatMessages([question, later], [answer]), [question, answer, later]);
});

for (const mixed of [false, true]) {
  test(`merge: overlapping older page retains incoming values and full page order (mixed=${mixed})`, () => {
    const first = message("z-first");
    const updatedQuestion = message("y-question", { body: "updated", ...(mixed ? { sequence: 40 } : {}) });
    const updatedAnswer = message("a-answer", { body: "updated" });
    const tail = message("b-tail");
    const old = [message("a-answer", { body: "cached" }), message("y-question", { body: "cached" }), tail];
    const merged = mergeChatMessages(old, [first, updatedQuestion, updatedAnswer], true);
    assert.deepEqual(merged, [first, updatedQuestion, updatedAnswer, tail]);
    assert.equal(merged.filter(row => row.messageId === "y-question").length, 1);
    assert.equal(merged.filter(row => row.messageId === "a-answer").length, 1);
  });

  test(`merge: overlapping refresh retains incoming values and full page order (mixed=${mixed})`, () => {
    const head = message("z-head");
    const updatedQuestion = message("y-question", { body: "updated", ...(mixed ? { sequence: 40 } : {}) });
    const updatedAnswer = message("a-answer", { body: "updated" });
    const tail = message("b-tail");
    const old = [head, message("a-answer", { body: "cached" }), message("y-question", { body: "cached" })];
    assert.deepEqual(mergeChatMessages(old, [updatedQuestion, updatedAnswer, tail], false), [head, updatedQuestion, updatedAnswer, tail]);
  });
}

test("merge: sequenced overlap takes incoming content and sequence before ordering", () => {
  const old = [message("same", { sequence: 1, body: "cached" }), message("middle", { sequence: 2 })];
  const incoming = message("same", { sequence: 3, body: "updated" });
  assert.deepEqual(mergeChatMessages(old, [incoming]), [old[1], incoming]);
});

test("merge: duplicates within incoming produce one row without dropping other messages", () => {
  const duplicate = message("duplicate", { body: "same payload" });
  const first = message("first", { createdAt: "2026-11-04T01:00:00Z" });
  const last = message("last", { createdAt: "2026-11-06T01:00:00Z" });
  assert.deepEqual(ids(mergeChatMessages([], [first, duplicate, { ...duplicate }, last])), ["first", "duplicate", "last"]);
});

test("merge: empty inputs and duplicate cached IDs return unique chronological messages", () => {
  assert.deepEqual(mergeChatMessages([], []), []);
  const first = message("first", { sequence: 1 });
  const last = message("last", { sequence: 2 });
  assert.deepEqual(mergeChatMessages([], [last, first]), [first, last]);
  assert.deepEqual(mergeChatMessages([last, first], []), [first, last]);
  assert.deepEqual(ids(mergeChatMessages([first, { ...first }, last], [])), ["first", "last"]);
});

test("merge: frozen arrays and messages remain unchanged with overlap and both directions", () => {
  const old = Object.freeze([
    Object.freeze(message("question", { body: "cached" })),
    Object.freeze(message("answer")),
  ]);
  const incoming = Object.freeze([
    Object.freeze(message("question", { body: "updated" })),
    Object.freeze(message("tail")),
  ]);
  const before = JSON.stringify({ old, incoming });
  for (const older of [true, false]) {
    const merged = mergeChatMessages(old, incoming, older);
    assert.notEqual(merged, old);
    assert.notEqual(merged, incoming);
    assert.equal(merged.find(row => row.messageId === "question").body, "updated");
    assert.equal(new Set(ids(merged)).size, 3);
    assert.equal(JSON.stringify({ old, incoming }), before);
  }
});
