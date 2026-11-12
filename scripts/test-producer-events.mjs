// DEV-312 생산자 PostHog 이벤트 속성(N-05): 오류 코드·초안 결과·답장 종류를 enum으로만 만든다.
// apps/producer/src/lib/producerEvents.ts 순수 함수만 본다. 허용 목록·enum 검사는 scripts/test-analytics.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composerErrorCode,
  draftResult,
  replyKind,
  VARIETY_REQUIRED_MESSAGE,
  isServerTrouble,
  sellErrorCode,
  serverErrorCode,
} from "../apps/producer/src/lib/producerEvents.ts";
import { cleanProps } from "../packages/analytics/src/privacy.ts";

test("DEV-312: AI fill run status maps to draft_created.result only when the run is over", () => {
  assert.equal(draftResult("SUCCEEDED"), "success");
  assert.equal(draftResult("PARTIAL"), "partial");
  assert.equal(draftResult("FAILED"), "failed");
  assert.equal(draftResult("CANCELLED"), "canceled");
  for (const s of ["QUEUED", "PREPARING", "ANALYZING", "PRIVACY_REVIEW", "", "X"])
    assert.equal(draftResult(s), null, s);
});

test("DEV-312: new product errors become codes from field names, never the message text", () => {
  const photo = {
    message: "대표사진을 추가해 주세요.",
    details: { fields: { representativePhoto: "대표사진을 한 장 올려 주세요." } },
  };
  assert.equal(composerErrorCode(photo), "photo_required");
  assert.equal(
    composerErrorCode({ message: "x", details: { fields: { variety: "품종을 적어 주세요" } } }),
    "variety_required",
  );
  assert.equal(composerErrorCode(new Error("과일 품종명을 입력해 주세요.")), "variety_required");
  assert.equal(composerErrorCode(new Error("상세페이지를 저장하지 못했어요.")), "other");
  assert.equal(composerErrorCode(null), "other");
  assert.equal(composerErrorCode("문자열 오류"), "other");
});

test("DEV-312: sell screen field groups map to codes, unknown keys to other", () => {
  assert.equal(sellErrorCode("options"), "options_invalid");
  assert.equal(sellErrorCode("delivery"), "delivery_invalid");
  assert.equal(sellErrorCode("prices"), "prices_invalid");
  assert.equal(sellErrorCode("shipping"), "shipping_invalid");
  assert.equal(sellErrorCode("quantity"), "quantity_invalid");
  assert.equal(sellErrorCode("requestedTotalGrams"), "other");
  assert.equal(sellErrorCode(undefined), "other");
  assert.equal(sellErrorCode("toString"), "other");
});

test("DEV-312: server validation errors map by field name and reason code, never by message", () => {
  assert.equal(serverErrorCode({ message: "계좌", details: { reason: "NO_FARM_ACCOUNT" } }), "deposit_account_required");
  assert.equal(serverErrorCode({ details: { fields: { deliveryWindow: "x" } } }), "delivery_invalid");
  assert.equal(serverErrorCode({ details: { fields: { maxDelayUntil: "x" } } }), "delivery_invalid");
  assert.equal(serverErrorCode({ details: { fields: { remoteAreaFee: "x" } } }), "shipping_invalid");
  assert.equal(serverErrorCode({ details: { fields: { requestedTotalGrams: "x" } } }), "quantity_invalid");
  assert.equal(serverErrorCode({ details: { fields: { stages: "x" } } }), "prices_invalid");
  assert.equal(serverErrorCode({ details: { fields: { variety: "x" } } }), "variety_required");
  assert.equal(serverErrorCode({ details: { fields: { constructor: "x" } } }), "other");
  assert.equal(serverErrorCode(new Error("빠진 칸이 있어요: 품종")), "other");
  assert.equal(serverErrorCode(undefined), "other");
});

test("DEV-312: reply kind follows which message the server closes by quote", () => {
  const at = "2026-11-12T01:00:00Z";
  const openFor = (createdAt) => [{ status: "OPEN", reportedMessageId: null, createdAt }];
  // 확인 요청된 AI 답변 인용 = 바로잡기(서버가 reported_message_id로 닫음)
  assert.equal(replyKind({ senderType: "AI", checkState: "REQUESTED", createdAt: at }, []), "check_corrected");
  // '답이 맞아요'로 이미 닫힌 AI 답변 인용은 평범한 답장
  assert.equal(replyKind({ senderType: "AI", checkState: "CONFIRMED", createdAt: at }, openFor(at)), "plain");
  // 인용한 질문 자신의 전달이 열려 있으면 전달 질문 답장
  assert.equal(replyKind({ senderType: "CONSUMER", createdAt: at }, openFor(at)), "forwarded");
  // 다른 질문의 전달만 열려 있으면 서버는 아무것도 닫지 않는다 = 평범한 답장
  assert.equal(replyKind({ senderType: "CONSUMER", createdAt: at }, openFor("2026-11-12T02:00:00Z")), "plain");
  // 이미 답한 전달, 신고에서 온 전달은 소비자 질문 인용으로 닫히지 않는다
  assert.equal(replyKind({ senderType: "CONSUMER", createdAt: at }, [{ status: "ANSWERED", createdAt: at }]), "plain");
  assert.equal(replyKind({ senderType: "CONSUMER", createdAt: at }, [{ status: "OPEN", reportedMessageId: "m1", createdAt: at }]), "plain");
  // 인용 없는 답장은 서버가 아무것도 닫지 않는다
  assert.equal(replyKind(undefined, openFor(at)), "plain");
  assert.equal(replyKind(null, [{ status: "OPEN", reportedMessageId: "m1", createdAt: at }]), "plain");
  assert.equal(replyKind({ senderType: "CONSUMER" }, [{ status: "OPEN" }]), "plain");
});

test("DEV-312: connection, server and conflict failures are not counted as error notices", () => {
  for (const status of [0, 409, 500, 503]) assert.equal(isServerTrouble({ status }), true, String(status));
  for (const status of [400, 403, 404, 422]) assert.equal(isServerTrouble({ status }), false, String(status));
  assert.equal(isServerTrouble(new TypeError("Failed to fetch")), true);
  assert.equal(isServerTrouble(new Error("과일 품종명을 입력해 주세요.")), false);
  assert.equal(isServerTrouble(null), false);
  // 판매 한도 거절(409)은 생산자가 고칠 수 있는 입력 오류라 센다
  for (const reason of ["APPROVED_CAP_EXCEEDED", "CAP_BELOW_COMMITTED"]) {
    const e = { status: 409, details: { reason } };
    assert.equal(isServerTrouble(e), false, reason);
    assert.equal(serverErrorCode(e), "quantity_invalid", reason);
  }
  assert.equal(isServerTrouble({ status: 409, details: { reason: "STALE_VERSION" } }), true);
});

test("DEV-312: the variety notice SourceBasicInfo throws maps to variety_required", () => {
  assert.equal(composerErrorCode(new Error(VARIETY_REQUIRED_MESSAGE)), "variety_required");
});

test("DEV-312: every helper output passes the analytics enum check", () => {
  for (const code of [
    composerErrorCode(null),
    composerErrorCode(new Error("과일 품종명을 입력해 주세요.")),
    composerErrorCode({ details: { fields: { representativePhoto: "x" } } }),
    sellErrorCode("options"),
    sellErrorCode("delivery"),
    sellErrorCode("prices"),
    sellErrorCode("shipping"),
    sellErrorCode("quantity"),
    serverErrorCode({ details: { reason: "NO_FARM_ACCOUNT" } }),
  ])
    assert.deepEqual(cleanProps("form_error_shown", { screen: "product_new", code }), {
      screen: "product_new",
      code,
    });
  for (const s of ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"])
    assert.equal(
      cleanProps("draft_created", { productId: "p1", result: draftResult(s), durationMs: 1 }).result,
      draftResult(s),
    );
  for (const kind of ["forwarded", "check_confirmed", "check_corrected", "plain"])
    assert.deepEqual(cleanProps("producer_reply_sent", { kind }), { kind });
});
