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
