// DEV-229 (R-28, FEAT-10 SCR-13·14, FEAT-17 SCR-29, SCR-23): 기한 지남·'오늘·어제'를 기기 시계가 아닌 서버 시각으로.
// packages/api serverClock(X-Server-Time 차이 보관)과 httpTransport 연결, 그리고 기기 시계가 틀린 채로
// 소비자 '입금 확인 늦어짐'·생산자 초안 '오늘·어제' 판단이 서버 시각을 따르는지 본다.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRequire } from "node:module";
import * as t from "../apps/consumer/src/lib/orderText.ts";
import { draftSaved } from "../apps/producer/src/lib/productGroups.ts";
import { md, time } from "../packages/ui/src/format.ts";

const require = createRequire(import.meta.url);
const clock = require("../.expo/mock-build/packages/api/src/serverClock.js");
const client = require("../.expo/mock-build/packages/api/src/client.js");

// 평가 환경: 서버 FIXED_NOW = 10월 7일 10:00 KST, 기기(브라우저)는 실제 날짜 11월 4일
const SERVER = "2026-10-07T10:00:00+09:00";
const DEVICE = Date.parse("2026-11-04T12:00:00+09:00");
const realNow = Date.now;
const realFetch = globalThis.fetch;
const useDeviceClock = (ms) => {
  Date.now = () => ms;
};
afterEach(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  clock.resetServerClock();
});

// 10월 7일 09:30에 입금 안내, 기한 24시간 뒤. 소비자가 바로 '입금했어요'를 누른 새 주문
const fresh = {
  status: "AWAITING_DEPOSIT",
  actions: ["cancel"],
  depositDueAt: "2026-10-08T09:30:00+09:00",
  depositReportedAt: "2026-10-07T09:40:00+09:00",
  depositIssue: null,
  refundSettledAt: null,
  refundIssue: null,
  refundedAt: null,
  refundReason: null,
  totalAmount: 33000,
};

test("serverNow is the device clock until a response carries X-Server-Time", () => {
  useDeviceClock(DEVICE);
  assert.equal(clock.serverNow(), DEVICE);
  clock.recordServerTime(null);
  clock.recordServerTime("not a time");
  assert.equal(clock.serverNow(), DEVICE);
});

test("serverNow keeps the server offset while the device clock moves on", () => {
  useDeviceClock(DEVICE);
  clock.recordServerTime(SERVER);
  assert.equal(clock.serverNow(), Date.parse(SERVER));
  useDeviceClock(DEVICE + 5 * 60_000); // 5분 뒤
  assert.equal(clock.serverNow(), Date.parse(SERVER) + 5 * 60_000);
});

test("the HTTP client records X-Server-Time from every response", async () => {
  useDeviceClock(DEVICE);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Server-Time": SERVER },
    });
  await client.request("GET", "/health");
  assert.equal(clock.serverNow(), Date.parse(SERVER));
});

test("the HTTP client records server time on error responses too", async () => {
  useDeviceClock(DEVICE);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: "NOT_FOUND", message: "없어요", details: {} }), {
      status: 404,
      headers: { "Content-Type": "application/json", "X-Server-Time": SERVER },
    });
  await assert.rejects(client.request("GET", "/api/orders/x"));
  assert.equal(clock.serverNow(), Date.parse(SERVER));
});

test("R-28: with a skewed device clock a fresh reported order is '입금 확인 중', not late", () => {
  useDeviceClock(DEVICE);
  // 기기 시계로 재면 기한(10/8)이 이미 지나 '늦어짐' — 고친 버그의 모양
  assert.equal(t.depositPhase(fresh, Date.now()), "late");
  clock.recordServerTime(SERVER);
  assert.equal(t.depositPhase(fresh, clock.serverNow()), "reported");
  assert.equal(t.listHeadline(fresh, clock.serverNow()), "입금 확인 중 · 농가가 확인하고 있어요");
  assert.doesNotMatch(t.depositRefundSentence(fresh, { md, time, deadline: md, won: String }, clock.serverNow()), /늦어져/);
});

test("R-28: once server time passes the deadline the order is late on any device clock", () => {
  useDeviceClock(Date.parse("2026-10-01T00:00:00+09:00")); // 기기가 오히려 느린 경우
  clock.recordServerTime("2026-10-08T09:30:00+09:00");
  assert.equal(t.depositPhase(fresh, clock.serverNow()), "late");
});

test("SCR-23: draft 'today·yesterday' follows server time, not the device date", () => {
  useDeviceClock(DEVICE);
  clock.recordServerTime(SERVER);
  const f = { md, time };
  // 서버 기준 어제(10/6) 저장 → 시각까지
  assert.equal(draftSaved("2026-10-06T05:20:00Z", f, clock.serverNow()), "10월 6일 오후 2:20 저장");
  // 기기 날짜(11/4) 기준이면 한 달 전이라 날짜만 나왔다
  assert.equal(draftSaved("2026-10-06T05:20:00Z", f, Date.now()), "10월 6일 저장");
});
