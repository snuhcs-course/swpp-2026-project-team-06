// DEV-223 (FEAT-12, SCR-16·SCR-28 하위 1:1, screens.md 공통 계약 '화면은 Asia/Seoul'): 1:1 대화 날짜 구분.
// createdAt은 UTC ISO다. 한국 날짜로 묶어야 오전 9시 전(KST) 메시지가 전날 묶음에 들어가지 않는다.
// 기기 시간대와 무관해야 하므로 일부러 KST가 아닌 TZ로 돌린다.
process.env.TZ = "America/Los_Angeles";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { daySeparator, longDate, seoulDay } from "../packages/ui/src/format.ts";

// 10월 6일 22:00 KST, 10월 7일 08:30 KST(= 10/6 23:30 UTC), 10월 7일 09:30 KST(= 10/7 00:30 UTC), 10월 8일 00:10 KST
const thread = [
  "2026-10-06T13:00:00Z",
  "2026-10-06T23:30:00Z",
  "2026-10-07T00:30:00Z",
  "2026-10-07T15:10:00Z",
];
const separators = (list) =>
  list.map((iso, i) => daySeparator(iso, list[i - 1]));

test("DEV-223 seoulDay groups by KST date, not the UTC date prefix", () => {
  assert.equal(seoulDay("2026-10-06T23:30:00Z"), "2026-10-07");
  assert.equal(seoulDay("2026-10-07T00:30:00Z"), "2026-10-07");
  assert.equal(seoulDay("2026-10-06T14:59:59Z"), "2026-10-06");
  assert.equal(seoulDay("2026-10-06T15:00:00Z"), "2026-10-07");
  assert.equal(seoulDay("2026-10-07T08:05:00+09:00"), "2026-10-07");
});

test("DEV-223 longDate label is '2026년 10월 7일' in KST", () => {
  assert.equal(longDate("2026-10-06T23:30:00Z"), "2026년 10월 7일");
  assert.equal(longDate("2026-12-31T15:00:00Z"), "2027년 1월 1일");
});

test("DEV-223 messages before and after 09:00 KST share one separator", () => {
  assert.deepEqual(separators(thread), [
    "2026년 10월 6일",
    "2026년 10월 7일",
    null,
    "2026년 10월 8일",
  ]);
});

test("DEV-223 first message always gets a separator; empty list has none", () => {
  assert.equal(daySeparator("2026-10-07T00:30:00Z"), "2026년 10월 7일");
  assert.deepEqual(separators([]), []);
});

test("DEV-223 ChatThread uses daySeparator instead of the UTC slice", () => {
  const src = readFileSync(
    new URL("../packages/ui/src/ChatThread.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /daySeparator\(m\.createdAt, messages\[i - 1\]\?\.createdAt\)/,
  );
  assert.doesNotMatch(src, /createdAt\.slice\(0, 10\)/);
});

// DEV-295 (Figma 1:38): 날짜 알약 글자는 '10월 7일 화요일'. 묶는 기준(한국 날짜)은 DEV-223 그대로다.
import { chatDay } from "../packages/ui/src/format.ts";

test("DEV-295 chatDay labels the KST date with the weekday, no year in the current year", () => {
  const now = "2026-11-09T03:00:00Z";
  // 10/6 23:30 UTC = 10/7 08:30 KST(수요일)
  assert.equal(chatDay("2026-10-06T23:30:00Z", now), "10월 7일 수요일");
  assert.equal(chatDay("2026-10-06T13:00:00Z", now), "10월 6일 화요일");
  assert.equal(chatDay("2026-10-07T15:10:00Z", now), "10월 8일 목요일");
});

test("DEV-295 chatDay keeps the year for other years, judged in KST", () => {
  assert.equal(chatDay("2025-12-30T03:00:00Z", "2026-01-02T03:00:00Z"), "2025년 12월 30일 화요일");
  // 2026-12-31 15:00 UTC is already 2027-01-01 in KST
  assert.equal(chatDay("2026-12-31T15:00:00Z", "2027-01-01T03:00:00Z"), "1월 1일 금요일");
});

test("DEV-295 NewsRoom groups days by KST date too", () => {
  const src = readFileSync(new URL("../packages/ui/src/NewsRoom.tsx", import.meta.url), "utf8");
  assert.match(src, /seoulDay\(messages\[i - 1\]\.createdAt\) !== seoulDay\(m\.createdAt\)/);
  assert.doesNotMatch(src, /toLocaleDateString/);
});
