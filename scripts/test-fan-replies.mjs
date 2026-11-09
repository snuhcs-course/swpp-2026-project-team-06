// DEV-297 (FEAT-15 AC-15-9·11, Figma 7:90·7:93): 생산자 반응 줄 문구와 팬 답장 시트의 필터·읽음 처리 기준.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  broadcastQuote,
  broadcastStats,
  readThrough,
  visibleReplies,
} from "../packages/ui/src/fanReplies.ts";

test("AC-15-9 stats line shows reads, likes and replies only when there are replies", () => {
  assert.deepEqual(broadcastStats({ readCount: 96, reactionCount: 42, replyCount: 7 }), {
    read: "읽음 96",
    likes: 42,
    replies: "답장 7",
    countsLabel: "읽음 96, 좋아요 42",
    label: "읽음 96, 좋아요 42, 답장 7",
  });
  const none = broadcastStats({ readCount: 71, reactionCount: 18, replyCount: 0 });
  assert.equal(none.replies, null);
  assert.equal(none.label, "읽음 71, 좋아요 18");
  // 읽음 수가 없는 응답(옛 서버)은 좋아요만
  const legacy = broadcastStats({ reactionCount: 3 });
  assert.equal(legacy.read, null);
  assert.equal(legacy.label, "좋아요 3");
});

test("AC-15-11 sheet subtitle quotes the broadcast start and its Seoul date", () => {
  assert.equal(
    broadcastQuote({
      body: "첫 바구니 따봤어요. 아직 신맛이 조금 남아서",
      mediaCount: 1,
      createdAt: "2026-10-06T23:30:00Z",
    }),
    "“첫 바구니 따봤어요. 아직 신…” · 10월 7일",
  );
  assert.equal(
    broadcastQuote({ body: "짧은 소식", mediaCount: 0, createdAt: "2026-10-07T01:00:00Z" }),
    "“짧은 소식” · 10월 7일",
  );
  assert.equal(
    broadcastQuote({ body: "  ", mediaCount: 2, createdAt: "2026-10-07T01:00:00Z" }),
    "사진·영상 소식 · 10월 7일",
  );
});

test("AC-15-11 unread chip filters the snapshot and read-through stops at what was loaded", () => {
  const items = [
    { messageId: "a", unread: false },
    { messageId: "b", unread: true },
    { messageId: "c", unread: true },
  ];
  assert.deepEqual(visibleReplies(items, "all"), items);
  assert.deepEqual(visibleReplies(items, "unread").map((r) => r.messageId), ["b", "c"]);
  assert.equal(readThrough(items, "d", true), "d");
  assert.equal(readThrough(items, "d", false), "c");
  assert.equal(readThrough([], null, true), null);
  assert.equal(readThrough([], "d", false), null);
});
