// DEV-207 (FEAT-09 AC-09-2·AC-09-7, FEAT-11 AC-11-1, FEAT-17 AC-17-8, R-28): 소비자 주문 상태 문구
// apps/consumer/src/lib/orderText.ts. 입금 대기는 알림 전(내 차례)·알린 뒤(농가 차례)를, 환불은 송금 전·늦어짐·완료를 글자로 가른다.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as t from "../apps/consumer/src/lib/orderText.ts";
import { deadline, md, time, won } from "../packages/ui/src/format.ts";

const f = { md, deadline, time, won };
const NOW = Date.parse("2026-11-03T14:00:00Z"); // 11월 3일 23:00 KST
const base = {
  status: "AWAITING_DEPOSIT",
  actions: ["cancel", "reportDeposit"],
  totalAmount: 33000,
  depositDueAt: "2026-11-04T13:22:00Z", // 11월 4일 (수) 22:22
  depositReportedAt: null,
  depositIssue: null,
  refundSettledAt: null,
  refundIssue: null,
  refundedAt: null,
  refundReason: null,
};
const before = base;
const reported = {
  ...base,
  actions: ["cancel"],
  depositReportedAt: "2026-11-03T13:31:00Z", // 11월 3일 22:31
};
const late = { ...reported };
const issue = { ...base, depositIssue: "금액이 달라요" };
const refund = {
  ...base,
  status: "REFUNDED",
  actions: [],
  depositDueAt: null,
  refundedAt: "2026-11-03T05:00:00Z",
  refundReason: "11월 3일 직접 취소(출하 전)",
};
const refundLate = { ...refund, refundIssue: "계좌를 확인 중이에요" };
const settled = { ...refund, refundSettledAt: "2026-11-05T02:00:00Z" };

const AFTER_DUE = Date.parse("2026-11-04T14:00:00Z");

test("DEV-207 AC-09-2: before the deposit notice the order waits on the consumer", () => {
  assert.equal(t.depositPhase(before, NOW), "before");
  assert.equal(t.statusTitle(before), "입금 대기");
  assert.equal(t.listHeadline(before, NOW), "입금 대기 · 입금해 주세요");
  assert.equal(t.listSubline(before, f), "11월 4일 (수) 22:22까지 입금 · 33,000원");
  assert.match(t.depositRefundSentence(before, f, NOW), /22:22까지 입금해 주세요/);
  assert.equal(t.bottomSummary(before, f), "입금 전에는 바로 취소돼요.");
  assert.equal(t.canCancel(before), true);
});

test("DEV-207 AC-09-7: after the deposit notice no copy asks for payment, a deadline or says no refund", () => {
  assert.equal(t.depositPhase(reported, NOW), "reported");
  assert.equal(t.statusTitle(reported), "입금 확인 중");
  assert.equal(t.listHeadline(reported, NOW), "입금 확인 중 · 농가가 확인하고 있어요");
  assert.equal(t.listSubline(reported, f), "11월 3일 입금 알림 · 33,000원");
  const sentence = t.depositRefundSentence(reported, f, NOW);
  assert.equal(
    sentence,
    "11월 3일 오후 10:31에 입금했다고 알려 주셨어요. 농가가 통장을 확인하면 예약 완료로 바뀌어요.",
  );
  const all = [
    t.statusTitle(reported),
    t.listHeadline(reported, NOW),
    t.listSubline(reported, f),
    sentence,
    t.bottomSummary(reported, f),
  ].join("\n");
  assert.doesNotMatch(all, /입금해 주세요|\d+:\d+까지|입금 기한|환불할 돈/);
  // 보낸 돈이 있을 수 있어 앱에서는 취소를 막는다(서버 actions에는 cancel이 남아 있다)
  assert.equal(t.canCancel(reported), false);
  assert.match(t.bottomSummary(reported, f), /확인하기 전에는 취소할 수 없어요/);
});

test("DEV-207 AC-09-7: a notified order past the deadline says farmclub is contacting the farm", () => {
  assert.equal(t.depositPhase(late, AFTER_DUE), "late");
  assert.equal(t.statusTitle(late), "입금 확인 중");
  assert.equal(t.listHeadline(late, AFTER_DUE), "입금 확인 늦어짐 · farmclub이 연락하고 있어요");
  assert.match(t.depositRefundSentence(late, f, AFTER_DUE), /주문은 취소되지 않아요/);
});

test("DEV-207 AC-09-9: a rejected deposit asks to check the reason and allows another notice", () => {
  assert.equal(t.depositPhase(issue, NOW), "issue");
  assert.equal(t.statusTitle(issue), "입금 대기");
  assert.equal(t.listHeadline(issue, NOW), "입금 확인 안 됨 · 사유를 봐 주세요");
  assert.equal(t.canCancel(issue), true);
});

test("DEV-207 AC-11-1: right after a cancel the refund is pending, not done", () => {
  assert.equal(t.refundPhase(refund), "pending");
  assert.equal(t.statusTitle(refund), "환불 대기");
  assert.equal(t.listHeadline(refund, NOW), "환불 대기 · 농가가 보낼 거예요");
  assert.equal(t.listSubline(refund, f), "11월 3일 취소 · 33,000원");
  assert.equal(t.isClosed(refund), false);
  assert.equal(
    t.depositRefundSentence(refund, f, NOW),
    "농가가 33,000원을 입금했던 계좌로 3영업일 안에 보내요. 보내면 ‘환불 완료’로 바뀌어요.",
  );
  assert.equal(t.bottomSummary(refund, f), "3영업일이 지나도 안 들어오면 농가에 물어보세요.");
  const all = [t.statusTitle(refund), t.listHeadline(refund, NOW), t.bottomSummary(refund, f)].join("\n");
  assert.doesNotMatch(all, /환불됨|환불 완료$/);
});

test("DEV-207 AC-17-8: a refund the farm rejected shows 환불 늦어짐", () => {
  assert.equal(t.statusTitle(refundLate), "환불 늦어짐");
  assert.equal(t.listHeadline(refundLate, NOW), "환불 늦어짐 · 사유를 봐 주세요");
});

test("DEV-207: only a refund the farm recorded as sent is 환불 완료", () => {
  assert.equal(t.statusTitle(settled), "환불 완료");
  assert.equal(t.listHeadline(settled, NOW), "환불 완료");
  assert.equal(t.listSubline(settled, f), "11월 5일 보냄 · 33,000원");
  assert.equal(t.isClosed(settled), true);
  assert.match(t.depositRefundSentence(settled, f, NOW), /11월 5일에 농가가 33,000원을 입금했던 계좌로 보냈어요/);
});

test("DEV-207: a refund the consumer did not start reads 환불 결정", () => {
  const byWindow = { ...refund, refundReason: "받는 시기 변경 거절" };
  assert.equal(t.listSubline(byWindow, f), "11월 3일 환불 결정 · 33,000원");
});

test("DEV-207: no consumer status label is a completed refund before money moves", () => {
  assert.equal(t.STATUS_LABEL.REFUNDED, "환불 대기");
  assert.equal(t.STATUS_LABEL.AWAITING_DEPOSIT, "입금 대기");
  assert.ok(!Object.values(t.STATUS_LABEL).includes("환불됨"));
});

test("DEV-207: other statuses keep their labels and the cancel action", () => {
  const reserved = { ...base, status: "RESERVED", actions: ["cancel"], depositDueAt: null };
  assert.equal(t.listHeadline(reserved, NOW), "예약 완료");
  assert.equal(t.statusTitle(reserved), "예약 완료");
  assert.equal(t.canCancel(reserved), true);
  assert.equal(t.listSubline(reserved, f), null);
  assert.equal(t.depositRefundSentence(reserved, f, NOW), null);
  const delivered = { ...reserved, status: "DELIVERED", actions: ["confirm"] };
  assert.equal(t.listHeadline(delivered, NOW), "배송 완료 · 구매 확정해 주세요");
  const changing = { ...reserved, actions: ["cancel", "respondDeliveryWindow"] };
  assert.equal(t.listHeadline(changing, NOW), "받는 시기 변경 · 답해 주세요");
});
