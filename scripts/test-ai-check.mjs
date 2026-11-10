// DEV-296 (FEAT-13 AC-13-11·12·13, Figma 10:116·10:158·10:238·10:289): AI 답변 확인 요청 깃발의 화면 문구·계산.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aiCheckBanner,
  aiCheckFollowUp,
  aiCheckLabel,
  aiCheckState,
  correctionQuoteLabel,
} from "../packages/ui/src/aiCheck.ts";

test("DEV-296 state falls back to REQUESTED for an older server that only sends reported", () => {
  assert.equal(aiCheckState({ checkState: "CONFIRMED", reported: true }), "CONFIRMED");
  assert.equal(aiCheckState({ reported: true }), "REQUESTED");
  assert.equal(aiCheckState({ checkState: null, reported: false }), null);
  // 새 서버의 null은 깃발 없음(어떻게 닫혔는지 모르는 옛 요청도 reported=true, checkState=null)
  assert.equal(aiCheckState({ checkState: null, reported: true }), null);
  assert.equal(aiCheckState({}), null);
});

test("DEV-296 consumer labels: requested flag with note, confirmed and corrected in green", () => {
  assert.deepEqual(aiCheckLabel("REQUESTED", false), {
    text: "농가에 확인 요청함",
    tone: "flag",
    note: "농가가 확인하면 알려 드려요",
  });
  assert.deepEqual(aiCheckLabel("CONFIRMED", false), { text: "농가가 답이 맞다고 확인했어요", tone: "done" });
  assert.deepEqual(aiCheckLabel("CORRECTED", false), { text: "농가가 바로잡았어요", tone: "done" });
  assert.equal(aiCheckLabel(null, false), null);
});

test("DEV-296 producer labels use '확인 요청', not '신고'", () => {
  assert.deepEqual(aiCheckLabel("REQUESTED", true), { text: "확인 요청", tone: "flag" });
  assert.equal(aiCheckLabel("CONFIRMED", true).tone, "done");
  assert.equal(aiCheckLabel("CORRECTED", true).text, "바로잡음");
  for (const s of ["REQUESTED", "CONFIRMED", "CORRECTED"])
    for (const producer of [true, false]) assert.ok(!aiCheckLabel(s, producer).text.includes("신고"));
});

test("DEV-296 confirm card quotes the consumer's first follow-up after the flagged answer", () => {
  const m = (senderType, body) => ({ senderType, body });
  const thread = [
    m("CONSUMER", "귤 10kg은 언제 받을 수 있어요?"),
    m("AI", "10kg은 11월 10일부터 20일 사이에 도착해요."),
    m("CONSUMER", " "),
    m("CONSUMER", "작년엔 12월에 왔던 것 같아서요"),
    m("CONSUMER", "그 다음 말"),
  ];
  assert.equal(aiCheckFollowUp(thread, 1), "작년엔 12월에 왔던 것 같아서요");
  // 덧붙인 말이 없으면 인용하지 않는다
  assert.equal(aiCheckFollowUp(thread.slice(0, 2), 1), null);
  // 농가 답 뒤의 소비자 말은 이 답변에 덧붙인 말이 아니다
  assert.equal(aiCheckFollowUp([thread[0], thread[1], m("PRODUCER", "확인할게요"), thread[3]], 1), null);
});

test("DEV-296 farm reply quoting a corrected AI answer is labeled 'AI 안내를 바로잡아요'", () => {
  const messages = [
    { messageId: "m-ai", checkState: "CORRECTED" },
    { messageId: "m-ai2", checkState: "CONFIRMED" },
    { messageId: "m-ai3" },
    { messageId: "m-reply", senderType: "PRODUCER" },
  ];
  assert.equal(correctionQuoteLabel({ messageId: "m-ai", senderType: "AI" }, messages, 3), "AI 안내를 바로잡아요");
  assert.equal(correctionQuoteLabel({ messageId: "m-ai2", senderType: "AI" }, messages, 3), null);
  assert.equal(correctionQuoteLabel({ messageId: "m-ai3", senderType: "AI" }, messages, 3), null);
  assert.equal(correctionQuoteLabel({ messageId: "m-ai", senderType: "CONSUMER" }, messages, 3), null);
  // 인용한 AI 답변이 아직 안 불러와졌으면 일반 머리글
  assert.equal(correctionQuoteLabel({ messageId: "m-old", senderType: "AI" }, messages, 3), null);
  assert.equal(correctionQuoteLabel(null, messages, 3), null);
  // 같은 AI 답변을 다시 인용한 뒤 농가 답장은 일반 머리글
  const thread = [
    { messageId: "m-ai", senderType: "AI", checkState: "CORRECTED" },
    { messageId: "m-r1", senderType: "PRODUCER", replyTo: { messageId: "m-ai" } },
    { messageId: "m-r2", senderType: "PRODUCER", replyTo: { messageId: "m-ai" } },
  ];
  assert.equal(correctionQuoteLabel({ messageId: "m-ai", senderType: "AI" }, thread, 1), "AI 안내를 바로잡아요");
  assert.equal(correctionQuoteLabel({ messageId: "m-ai", senderType: "AI" }, thread, 2), null);
  // 소비자가 같은 AI 답변을 인용한 말에는 붙이지 않는다
  const consumerQuote = [thread[0], { messageId: "m-c", senderType: "CONSUMER", replyTo: { messageId: "m-ai" } }, thread[1]];
  assert.equal(correctionQuoteLabel({ messageId: "m-ai", senderType: "AI" }, consumerQuote, 1), null);
  assert.equal(correctionQuoteLabel({ messageId: "m-ai", senderType: "AI" }, consumerQuote, 2), "AI 안내를 바로잡아요");
});

test("DEV-296 producer list banner counts open AI answer checks", () => {
  assert.equal(aiCheckBanner(0), null);
  assert.equal(aiCheckBanner(1), "확인해 달라는 AI 답변 1개");
  assert.equal(aiCheckBanner(3), "확인해 달라는 AI 답변 3개");
});
