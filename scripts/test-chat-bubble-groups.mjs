// DEV-295 (FEAT-12, Figma 1:38·7:78): 메신저처럼 같은 사람이 같은 날 같은 분에 연달아 보낸 말풍선을 묶는다.
// 묶음 첫 말풍선에만 아바타·이름, 마지막 말풍선 옆에만 시각을 둔다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chatGroups } from "../packages/ui/src/chatGroups.ts";

const k = (sender, minute, day = "2026-10-07", solo = false) => ({ sender, minute, day, solo });

test("DEV-295 consecutive same-sender same-minute bubbles form one group", () => {
  assert.deepEqual(
    chatGroups([k("PRODUCER", "오전 8:05"), k("PRODUCER", "오전 8:05"), k("PRODUCER", "오전 8:05")]),
    [{ first: true, last: false }, { first: false, last: false }, { first: false, last: true }],
  );
});

test("DEV-295 a new sender, minute or day starts a new group", () => {
  assert.deepEqual(
    chatGroups([
      k("CONSUMER", "오후 3:15"),
      k("AI", "오후 3:15"),
      k("AI", "오후 3:16"),
      k("AI", "오후 3:16", "2026-10-08"),
    ]),
    [
      { first: true, last: true },
      { first: true, last: true },
      { first: true, last: true },
      { first: true, last: true },
    ],
  );
});

test("DEV-295 solo bubbles never join neighbours", () => {
  assert.deepEqual(
    chatGroups([k("AI", "오후 3:14"), k("AI", "오후 3:14", "2026-10-07", true), k("AI", "오후 3:14")]),
    [{ first: true, last: true }, { first: true, last: true }, { first: true, last: true }],
  );
});

test("DEV-295 empty input has no groups", () => {
  assert.deepEqual(chatGroups([]), []);
});

// DEV-295: '읽음'은 상대가 읽은 위치까지의 내 마지막 말풍선 하나에만 붙는다(대화 조회의 상대 읽음 위치를 그대로 쓴다).
import { lastReadMine } from "../packages/ui/src/chatGroups.ts";
const msgs = [
  { messageId: "a", senderType: "CONSUMER" },
  { messageId: "b", senderType: "AI" },
  { messageId: "c", senderType: "CONSUMER" },
  { messageId: "d", senderType: "PRODUCER" },
  { messageId: "e", senderType: "CONSUMER" },
];

test("DEV-295 read mark sits on my last bubble at or before the peer's read position", () => {
  assert.equal(lastReadMine(msgs, "d", "CONSUMER"), 2);
  assert.equal(lastReadMine(msgs, "e", "CONSUMER"), 4);
  assert.equal(lastReadMine(msgs, "b", "CONSUMER"), 0);
});

test("DEV-295 no read mark without a loaded read position or my earlier bubble", () => {
  assert.equal(lastReadMine(msgs, null, "CONSUMER"), -1);
  assert.equal(lastReadMine(msgs, "older-not-loaded", "CONSUMER"), -1);
  assert.equal(lastReadMine(msgs, "a", "PRODUCER"), -1);
});
