// DEV-467 (FEAT-15 AC-15-3·AC-15-9·AC-15-11): 소식 카드의 사진 배치와 반응 줄 권한.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NEWS_PHOTO_GAP, newsCardWidth, newsPhotoRows } from "../packages/ui/src/newsCard.ts";

const src = readFileSync(new URL("../packages/ui/src/NewsRoom.tsx", import.meta.url), "utf8");

test("DEV-467 card width is the room width minus 16px gutters, capped at the 480px room", () => {
  assert.equal(newsCardWidth(360, 480, 16), 328);
  assert.equal(newsCardWidth(390, 480, 16), 358);
  assert.equal(newsCardWidth(430, 480, 16), 398);
  assert.equal(newsCardWidth(1280, 480, 16), 448);
});

test("DEV-467 one photo fills the card at 4:3 without a 1/N badge", () => {
  assert.deepEqual(newsPhotoRows(1, 358), [[{ index: 0, width: 358, height: 269, badge: null }]]);
  assert.deepEqual(newsPhotoRows(0, 358), []);
});

test("DEV-467 two photos are two squares with a 2px gap and 1/2, 2/2 badges", () => {
  const rows = newsPhotoRows(2, 358);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].map((c) => [c.width, c.height, c.badge]), [[178, 178, "1/2"], [178, 178, "2/2"]]);
  assert.equal(rows[0][0].width * 2 + NEWS_PHOTO_GAP, 358);
});

test("DEV-467 more photos stay inside the card: pairs of squares, a lone last photo at 4:3", () => {
  for (const width of [328, 358, 398]) {
    const rows = newsPhotoRows(3, width);
    assert.deepEqual(rows.map((r) => r.length), [2, 1]);
    assert.deepEqual(rows.flat().map((c) => c.badge), ["1/3", "2/3", "3/3"]);
    for (const row of rows) {
      const used = row.reduce((sum, c) => sum + c.width, 0) + NEWS_PHOTO_GAP * (row.length - 1);
      assert.ok(used <= width, `row ${used} > card ${width}`);
    }
  }
  assert.deepEqual(newsPhotoRows(4, 358).map((r) => r.length), [2, 2]);
});

test("AC-15-3 consumer reaction row has like and private reply halves, never counts", () => {
  const consumer = src.slice(src.indexOf("function NewsCard("), src.indexOf("function ReactionHalf("));
  assert.match(consumer, /text="좋아요"/);
  assert.match(consumer, /text="농가에 답장"/);
  // 소비자 칸(ReactionHalf)에는 숫자(reactionCount·readCount·replyCount)를 넘기지 않는다. 숫자는 ProducerReactions만
  const halves = consumer.slice(consumer.indexOf("<ReactionHalf"));
  assert.doesNotMatch(halves, /reactionCount|readCount|replyCount|broadcastStats/);
  assert.match(consumer, /producer \? <ProducerReactions/);
});

test("AC-15-9 AC-15-11 producer reaction row keeps the read/like label and the fan reply sheet button", () => {
  const producer = src.slice(src.indexOf("function ProducerReactions("));
  assert.match(producer, /accessibilityLabel=\{`\$\{stats\.replies\} 모아 보기`\}/);
  assert.match(producer, /stats\.countsLabel : stats\.label/);
  assert.match(producer, /`좋아요 \$\{stats\.likes\}`/);
});

test("DEV-467 consumer replies stay private bubbles, not comments under the card", () => {
  assert.match(src, /mine && !producer \? \(\s*<View[^]*?농가만 봐요/);
});

test("AC-15-12 the card's reply action picks that post and the send passes its broadcastId", () => {
  // ‘농가에 답장’ = 그 소식을 고르고 입력칸으로(비로그인은 로그인, 답장할 수 없는 방은 비활성)
  assert.match(src, /onReply=\{!userId \? onLogin : canReply \? \(\) => \{ setReplyPost\(m\);/);
  assert.match(src, /broadcastId: replyPost\?\.broadcastId \?\? undefined, attachmentIds: ids/);
  // 생산자 방송은 고른 소식·사진을 보내지 않는다
  assert.match(src, /producer \? undefined : \{ broadcastId/);
  assert.match(src, /소식에 답장 · 농가만 봐요/);
});

test("AC-15-13 consumer photo replies reuse the private photo picker and render with tap-to-zoom", () => {
  assert.match(src, /tool=\{!producer && upload \?/);
  assert.match(src, /<PrivatePhotos[^]*?upload=\{upload\}/);
  assert.match(src, /m\.attachmentIds\?\.map\(\(id\) => \(\s*<PrivatePhoto /);
  const sheet = readFileSync(new URL("../packages/ui/src/FanReplySheet.tsx", import.meta.url), "utf8");
  assert.match(sheet, /reply\.attachmentIds\.map\(\(id\) => <PrivatePhoto /);
});
