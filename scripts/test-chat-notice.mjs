// DEV-475 (FEAT-12 AC-12-19·20·21, M-25): 원스토어 공지 29889 — 채팅방 여섯 곳에 주의·제재 안내를 고정해 보인다.
// 문구·조건은 packages/ui/src/chatNoticeCopy.ts를 직접 읽고, 방 배선은 소스를 읽어 확인한다(방 하나라도 빠지면 실패).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  CHAT_NOTICE_BAND,
  CHAT_NOTICE_COMPACT,
  CHAT_NOTICE_SUPPORT_LABEL,
  CHAT_NOTICE_TITLE,
  chatNoticeCompact,
  chatNoticeLines,
} from "../packages/ui/src/chatNoticeCopy.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 공지가 요구하는 세 가지: 윤리(제재), 개인정보, 결제정보
const requiredParts = (text) => {
  for (const word of ["욕설", "음란", "광고", "제재", "결제", "개인정보"])
    assert.ok(text.includes(word), `‘${word}’가 빠졌어요: ${text}`);
};

test("DEV-475 AC-12-19: band copy is the approved two sentences with ethics, payment and personal info", () => {
  assert.equal(CHAT_NOTICE_BAND, "욕설·비방·음란·광고는 제재돼요. 결제·개인정보는 채팅으로 알리지 마세요.");
  requiredParts(CHAT_NOTICE_BAND);
  assert.ok(CHAT_NOTICE_BAND.includes("비방"));
});

test("DEV-475 AC-12-19: the folded one-line band keeps all three parts", () => {
  requiredParts(CHAT_NOTICE_COMPACT);
  assert.ok(CHAT_NOTICE_COMPACT.length <= 28, "한 줄(360 폭 12px)에 들어가야 해요");
});

test("DEV-475 AC-12-19: band folds only with the keyboard on a short screen, or in a very short window", () => {
  assert.equal(chatNoticeCompact(true, 640), true); // 360×640 + 키보드
  assert.equal(chatNoticeCompact(true, 667), true); // iPhone SE + 키보드
  assert.equal(chatNoticeCompact(false, 640), false); // 키보드 없으면 두 줄
  assert.equal(chatNoticeCompact(true, 844), false); // 큰 화면은 키보드가 떠도 두 줄
  assert.equal(chatNoticeCompact(false, 480), true);
});

test("DEV-475 AC-12-20: consumer sheet lines and support link", () => {
  assert.equal(CHAT_NOTICE_TITLE, "채팅 이용 안내");
  assert.equal(CHAT_NOTICE_SUPPORT_LABEL, "운영팀에 알리기");
  assert.deepEqual(chatNoticeLines("consumer", false), [
    "욕설·비방·음란·광고·스팸은 글을 지우고 이용을 제한할 수 있어요(이용약관 제13조).",
    "보낸 전화번호·계좌번호는 숫자가 ●로 가려져요.",
    "입금은 주문의 ‘입금 안내’에 나온 농가 계좌로만 해 주세요.",
    "불편한 일을 겪었다면 운영팀에 알려 주세요.",
  ]);
});

test("DEV-475 AC-12-20: producer third line, and support rooms have no 'tell the team' line", () => {
  const producer = chatNoticeLines("producer", false);
  assert.equal(producer[2], "소비자에게 계좌·연락처를 따로 묻지 말아 주세요. 주문 정보는 주문 화면에 있어요.");
  assert.equal(producer.length, 4);
  for (const side of ["consumer", "producer"]) {
    const lines = chatNoticeLines(side, true);
    assert.equal(lines.length, 3);
    assert.ok(!lines.some((l) => l.includes("운영팀에 알려")));
  }
});

test("DEV-475 AC-12-20: the sheet cites the terms article that actually lists these bans", () => {
  const terms = read("packages/ui/src/legalContent.ts");
  const at = terms.indexOf('title: "제13조 (금지 행위)"');
  assert.ok(at > 0, "이용약관 제13조(금지 행위)가 있어야 해요");
  const article = terms.slice(at, terms.indexOf("제14조", at));
  for (const word of ["욕설·비방", "광고·스팸", "연락처·계좌", "이용을 제한"]) assert.ok(article.includes(word), word);
});

test("DEV-475 AC-12-19: ChatThread and NewsRoom draw the band above the scrolling timeline and require it", () => {
  for (const file of ["packages/ui/src/ChatThread.tsx", "packages/ui/src/NewsRoom.tsx"]) {
    const src = read(file);
    assert.match(src, /\n  notice: ChatNoticeConfig;/, `${file}: notice는 필수 prop이어야 해요`);
    const band = src.indexOf("<ChatNotice side={producer ? \"producer\" : \"consumer\"} onSupport={notice.onSupport} />");
    const timeline = src.indexOf("<ScrollView", src.indexOf("return (\n    // 메시지 본문"));
    assert.ok(band > 0, `${file}: 띠가 없어요`);
    assert.ok(timeline > band, `${file}: 띠는 스크롤 밖(타임라인 위)에 있어야 해요`);
  }
});

// 여섯 방: [파일, 그 방이 쓰는 부품, 운영팀 방인지]
const ROOMS = [
  ["apps/consumer/src/app/(tabs)/chats/[farmId].tsx", "ChatThread", "link"],
  ["apps/consumer/src/lib/FarmRoom.tsx", "NewsRoom", "link"],
  ["apps/consumer/src/app/(tabs)/chats/support.tsx", "ChatThread", "none"],
  ["apps/producer/src/app/(tabs)/chats/[consumerId].tsx", "ChatThread", "both"],
  ["apps/producer/src/lib/OwnNewsRoom.tsx", "NewsRoom", "link"],
  ["apps/producer/src/app/support.tsx", "ChatThread", "none"],
];

test("DEV-475 AC-12-19: all six rooms pass the notice to their thread", () => {
  for (const [file, part, kind] of ROOMS) {
    const src = read(file);
    const open = src.indexOf(`<${part}\n`);
    assert.ok(open > 0, `${file}: ${part}가 없어요`);
    const props = src.slice(open, src.indexOf("/>", src.indexOf("notice={{", open)) + 2);
    assert.ok(props.includes("notice={{"), `${file}: notice가 빠졌어요`);
    if (kind === "none") assert.match(props, /notice=\{\{ onSupport: null \}\}/, `${file}: 운영팀 방은 null`);
    if (kind === "link") assert.match(props, /onSupport: \(\) =>/, `${file}: ‘운영팀에 알리기’가 있어야 해요`);
    if (kind === "both") assert.match(props, /onSupport: support \? null : \(\) =>/, file);
  }
  // 운영팀 대화방 주소
  assert.match(read(ROOMS[0][0]), /"\/chats\/support"/);
  assert.match(read(ROOMS[1][0]), /"\/chats\/support"/);
  assert.match(read(ROOMS[3][0]), /`\/chats\/\$\{SUPPORT_ID\}`/);
  assert.match(read(ROOMS[4][0]), /`\/chats\/\$\{SUPPORT_ID\}`/);
});

test("DEV-475 AC-12-19: no other ChatThread/NewsRoom room exists without being in the list above", () => {
  const out = execFileSync("git", ["grep", "-l", "-E", "<(ChatThread|NewsRoom)$", "--", "apps"], { encoding: "utf8" });
  assert.deepEqual(out.trim().split("\n").sort(), ROOMS.map(([f]) => f).sort());
});

test("DEV-475 AC-12-21: news video poster no longer says it can be watched on the web", () => {
  const src = read("packages/ui/src/NewsRoom.tsx");
  assert.ok(!src.includes("웹에서 볼 수 있어요"));
  assert.match(src, /accessibilityLabel=\{openable \? "소식 영상 보기" : "영상을 열 수 없어요"\}/);
  assert.match(src, /disabled=\{!openable\}/);
});
