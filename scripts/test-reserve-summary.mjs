// DEV-356 (FEAT-01 AC-01-21, DEV-268 UX ⑤): 예약 관문 시트의 ‘고른 것’ 요약
// apps/consumer/src/lib/reserveSummary.ts. 주문서 상품 줄과 같은 이름 표기, 금액은 지금 기간 가격 × 수량.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as r from "../apps/consumer/src/lib/reserveSummary.ts";
import { period } from "../packages/ui/src/format.ts";

const p = {
  name: "하우스 감귤 5kg / 10kg",
  farmName: "강씨네 귤밭",
  options: [
    { optionId: "opt-5", label: "5kg" },
    { optionId: "opt-10", label: "10kg" },
  ],
  currentStageId: "s1",
  stages: [
    { stageId: "s1", options: { "opt-5": { price: 29000 }, "opt-10": { price: 55000 } } },
    { stageId: "s2", options: { "opt-5": { price: 36000 }, "opt-10": { price: 68000 } } },
  ],
  deliveryWindow: { start: "2026-11-10", end: "2026-11-20" },
};

test("AC-01-21: summary uses the chosen option, quantity and the current stage price", () => {
  assert.deepEqual(r.reserveSummary(p, "opt-5", "2", period), {
    title: "하우스 감귤 5kg × 2",
    sub: "강씨네 귤밭 · 11월 10일~20일 도착",
    amount: 58000,
  });
  assert.equal(r.reserveSummary(p, "opt-10", 1, period).amount, 55000);
});

test("AC-01-21: no current stage leaves the amount out instead of guessing (M-24)", () => {
  const s = r.reserveSummary({ ...p, currentStageId: null }, "opt-5", "1", period);
  assert.equal(s.title, "하우스 감귤 5kg × 1");
  assert.equal(s.amount, null);
});

test("AC-01-21: an unknown option or a bad quantity draws no card", () => {
  assert.equal(r.reserveSummary(p, "opt-x", "1", period), null);
  assert.equal(r.reserveSummary(p, "opt-5", "0", period), null);
  assert.equal(r.reserveSummary(p, "opt-5", "abc", period), null);
  assert.equal(r.reserveSummary(p, undefined, "1", period), null);
});

test("AC-01-21: product id comes from the gate's next path only on a product page", () => {
  assert.equal(r.productIdFromNext("/products/p-house"), "p-house");
  assert.equal(r.productIdFromNext("/products/p-house?from=share"), "p-house");
  assert.equal(r.productIdFromNext("/farms/f-kang"), null);
  assert.equal(r.productIdFromNext(undefined), null);
});

test("AC-01-21: product line keeps the checkout short-name rule", () => {
  assert.equal(r.productLine("하우스 감귤 5kg", "5kg", 1), "하우스 감귤 5kg × 1");
  assert.equal(r.shortName("노지 감귤 10kg / 5kg"), "노지 감귤");
});
