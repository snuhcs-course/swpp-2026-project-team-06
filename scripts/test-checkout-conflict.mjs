// DEV-216·DEV-218 (FEAT-08 E1, AC-08-8·AC-08-9, R-17): 주문서가 본 기간·단가·중량과 지금 값이 다르면
// 409 STAGE_CHANGED(이전·지금 값). 판매 중지·품절이 가격 변경보다 먼저. 앱 안내·버튼은
// apps/consumer/src/lib/checkoutConflict.ts의 순수 함수가 reason·details·availability로 정한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import * as cc from "../apps/consumer/src/lib/checkoutConflict.ts";
import { md, won } from "../packages/ui/src/format.ts";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require(
  "../.expo/mock-build/packages/api/src/mock/db.js",
);
configureMockStorage({ read: () => null, write: () => {} });

const f = { md, won };
let seq = 0;
const api = (method, path, token, body, key = `cc-test-${++seq}`) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
  });
async function consumer() {
  reset();
  const r = await api("POST", "/api/auth/test-login", null, { userId: "u-minji", app: "consumer" });
  return r.body.accessToken;
}
const input = (extra = {}) => ({
  productId: "p-house",
  optionId: "opt-5",
  quantity: 1,
  recipientName: "Test",
  recipientPhone: "010-1111-2222",
  postalCode: "12345",
  address: "Test address",
  consents: {
    deliveryWindow: true,
    delayRefund: true,
    shortage: true,
    cancelPolicy: true,
    thirdParty: true,
  },
  consentVersion: "test",
  ...extra,
});
/** 주문서가 본 값: 지금 상품에서 seenValues로 */
async function seen(c) {
  const p = (await api("GET", "/api/products/p-house", c)).body;
  const s = cc.seenValues(p, "opt-5");
  return {
    p,
    s,
    expected: {
      expectedStageId: s.stageId,
      expectedUnitPrice: s.unitPrice,
      expectedUnitWeightGrams: s.unitWeightGrams,
    },
  };
}
const currentStage = (p) => db().products["p-house"].stages.find((s) => s.stageId === p.currentStageId);

test("AC-08-8: Mock order with a stale price returns STAGE_CHANGED with previous/current and creates nothing", async () => {
  const c = await consumer();
  const { p, s, expected } = await seen(c);
  currentStage(p).options["opt-5"].price = s.unitPrice + 1000;
  const before = Object.keys(db().orders).length;

  const r = await api("POST", "/api/orders", c, input(expected));

  assert.equal(r.status, 409);
  const d = r.body.details;
  assert.equal(d.reason, "STAGE_CHANGED");
  assert.equal(d.optionId, "opt-5");
  assert.deepEqual(d.previous, s);
  assert.equal(d.current.stageId, s.stageId);
  assert.equal(d.current.unitPrice, s.unitPrice + 1000);
  assert.equal(d.current.unitWeightGrams, 5000);
  assert.equal(d.nextStageStartsAt, null);
  assert.equal(Object.keys(db().orders).length, before);

  // 지금 값으로 다시 보내면(새 키) 생성된다
  const again = await api("POST", "/api/orders", c, input({
    expectedStageId: d.current.stageId,
    expectedUnitPrice: d.current.unitPrice,
    expectedUnitWeightGrams: d.current.unitWeightGrams,
  }));
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.unitPrice, s.unitPrice + 1000);
  // 기대값 없이 보내면 예전처럼 지금 값으로
  const legacy = await api("POST", "/api/orders", c, input());
  assert.equal(legacy.status, 200);
});

test("AC-08-9: Mock checks paused and sold out before the price comparison", async () => {
  const c = await consumer();
  const { p, s, expected } = await seen(c);
  const stage = currentStage(p);
  stage.options["opt-5"].price = s.unitPrice + 1000;
  stage.options["opt-5"].reservedCount = stage.options["opt-5"].quantity;
  const soldOut = await api("POST", "/api/orders", c, input(expected));
  assert.equal(soldOut.body.details.reason, "SOLD_OUT");
  assert.equal(soldOut.body.details.optionId, "opt-5");

  db().products["p-house"].salesPaused = true;
  const paused = await api("POST", "/api/orders", c, input(expected));
  assert.equal(paused.body.details.reason, "SALES_PAUSED");
  assert.equal(paused.body.details.previous, undefined);
});

// ---- 앱 순수 함수 ----
const product = {
  options: [
    { optionId: "opt-5", label: "5kg", weightKg: 5 },
    { optionId: "opt-10", label: "10kg", weightKg: 10 },
  ],
  stages: [
    {
      stageId: "st-1",
      seq: 1,
      name: "1",
      startsAt: "2026-10-01",
      endsAt: "2026-10-14",
      options: {
        "opt-5": { price: 29000, quantity: 10, reservedCount: 0 },
        "opt-10": { price: 55000, quantity: 10, reservedCount: 0 },
      },
    },
    {
      stageId: "st-2",
      seq: 2,
      name: "2",
      startsAt: "2026-10-15",
      endsAt: "2026-10-31",
      options: {
        "opt-5": { price: 30000, quantity: 10, reservedCount: 0 },
        "opt-10": { price: 60000, quantity: 10, reservedCount: 0 },
      },
    },
  ],
  currentStageId: "st-1",
  remainingGrams: 100000,
};
const ctx = (over = {}) => ({ product, optionId: "opt-5", quantity: 1, ...over });
const prev = { stageId: "st-1", unitPrice: 29000, unitWeightGrams: 5000 };
const changed = (current, extra = {}) => ({
  reason: "STAGE_CHANGED",
  details: { reason: "STAGE_CHANGED", previous: prev, current, nextStageStartsAt: null, ...extra },
  firstTotal: 29000,
});

test("AC-08-8: price change notice shows 29,000원 → 30,000원 and the reconfirm button", () => {
  const v = cc.conflictView(
    changed({ ...prev, unitPrice: 30000, startsAt: "2026-10-01", endsAt: "2026-10-14" }),
    ctx(),
    f,
  );
  assert.equal(v.title, "가격이 바뀌었어요");
  assert.match(v.body, /^5kg 한 상자 29,000원 → 30,000원\. 입력한 내용은 그대로 두었어요\./);
  assert.deepEqual(v.primary, { label: "바뀐 금액으로 예약하기", action: "submit", enabled: true });
  assert.equal(v.firstTotal, 29000);
  assert.equal(v.inline, null);
});

test("AC-08-8: stage boundary and weight change get their own titles", () => {
  const stage = cc.conflictView(
    changed({ stageId: "st-2", unitPrice: 30000, unitWeightGrams: 5000, startsAt: "2026-10-15", endsAt: "2026-10-31" }),
    ctx(),
    f,
  );
  assert.equal(stage.title, "예약 기간이 바뀌었어요");
  assert.match(stage.body, /^10월 1일~10월 14일 29,000원 → 10월 15일~10월 31일 30,000원\./);
  const weight = cc.conflictView(
    changed({ ...prev, unitPrice: 30000, unitWeightGrams: 4500, startsAt: "2026-10-01", endsAt: "2026-10-14" }),
    ctx(),
    f,
  );
  assert.equal(weight.title, "상자 무게가 바뀌었어요");
  assert.match(weight.body, /^5kg → 4\.5kg, 29,000원 → 30,000원\./);
});

test("AC-08-9: no current stage, paused, sold out and total limit never show the reconfirm button", () => {
  const all = [
    changed(null, { nextStageStartsAt: "2026-10-21" }),
    changed(null),
    { reason: "SALES_PAUSED", details: { reason: "SALES_PAUSED" } },
    { reason: "SOLD_OUT", details: { reason: "SOLD_OUT", optionId: "opt-5" } },
    { reason: "TOTAL_LIMIT_REACHED", details: { reason: "TOTAL_LIMIT_REACHED" } },
    { reason: "QUANTITY_LIMIT", details: { reason: "QUANTITY_LIMIT", maxQuantity: 5 } },
    { reason: "NO_FARM_ACCOUNT", details: { reason: "NO_FARM_ACCOUNT" } },
  ].map((c) => cc.conflictView(c, ctx(), f));
  for (const v of all) assert.notEqual(v.primary.label, "바뀐 금액으로 예약하기", v.title);

  const [next, over, paused, soldOut, total, qty, account] = all;
  assert.equal(next.title, "예약 기간이 끝났어요");
  assert.equal(next.body, "다음 예약은 10월 21일에 열려요. 그때 다시 예약해 주세요.");
  assert.deepEqual(next.primary, { label: "상품으로 돌아가기", action: "backToProduct", enabled: true });
  assert.equal(next.hideAmount, true);
  assert.equal(over.body, "이번 예약은 모두 끝났어요.");

  assert.equal(paused.title, "농가가 잠시 예약을 쉬고 있어요");
  assert.deepEqual(paused.primary, { label: "예약하기", action: "submit", enabled: false });
  assert.deepEqual(paused.inline, { label: "다시 확인하기", action: "recheck" });
  assert.equal(paused.summary, "지금은 예약할 수 없어요");
  assert.doesNotMatch(paused.body, /지금 가격/);

  assert.equal(soldOut.title, "5kg은 이번 기간 물량이 다 팔렸어요");
  assert.match(soldOut.body, /^10kg은 아직 예약할 수 있어요/);
  assert.deepEqual(soldOut.inline, { label: "옵션 바꾸기", action: "changeOption" });
  assert.equal(soldOut.primary.enabled, false);

  assert.equal(total.title, "예약 물량이 다 찼어요");
  assert.equal(total.primary.action, "backToProduct");
  assert.equal(qty.title, "한 번에 최대 5개까지 예약할 수 있어요");
  assert.equal(account.inline.action, "recheck");
});

test("AC-08-9: all options sold out goes back to the product; typo '기간가' is gone", () => {
  const p = structuredClone(product);
  for (const o of Object.values(p.stages[0].options)) o.reservedCount = o.quantity;
  const v = cc.conflictView({ reason: "SOLD_OUT", details: {} }, ctx({ product: p }), f);
  assert.equal(v.title, "이번 기간 물량이 다 팔렸어요");
  assert.equal(v.body, "다음 예약 기간이 열리면 다시 예약해 주세요.");
  assert.equal(v.primary.action, "backToProduct");
});

test("TOTAL_LIMIT_REACHED offers a quantity change when fewer boxes still fit", () => {
  const v = cc.conflictView(
    { reason: "TOTAL_LIMIT_REACHED", details: {} },
    ctx({ quantity: 3, product: { ...product, remainingGrams: 6000 } }),
    f,
  );
  assert.equal(v.title, "남은 예약 물량이 부족해요");
  assert.deepEqual(v.inline, { label: "수량 바꾸기", action: "changeQuantity" });
});

test("changed=1 return from an expired deposit says the reservation was canceled, not that the price changed", () => {
  const v = cc.conflictView({ reason: "EXPIRED", details: {} }, ctx(), f);
  assert.equal(v.title, "입금 기한이 지나 예약이 취소됐어요");
  assert.equal(v.body, "같은 내용으로 다시 예약할 수 있어요.");
  assert.equal(v.primary.label, "다시 예약하기");
  assert.doesNotMatch(v.title + v.body, /가격|바뀐/);
});

test("availability decides the paused/sold-out branches (not soldOut)", () => {
  assert.equal(cc.availabilityConflict({ availability: "AVAILABLE" }), null);
  assert.equal(cc.availabilityConflict({ availability: "PAUSED" }).reason, "SALES_PAUSED");
  assert.equal(cc.availabilityConflict({ availability: "TOTAL_SOLD_OUT" }).reason, "TOTAL_LIMIT_REACHED");
  assert.equal(cc.availabilityConflict({ availability: "PERIOD_SOLD_OUT" }).reason, "SOLD_OUT");
  const ended = cc.availabilityConflict({ availability: "NOT_OPEN", nextStageStartsAt: "2026-10-21" });
  assert.equal(cc.conflictView(ended, ctx(), f).body, "다음 예약은 10월 21일에 열려요. 그때 다시 예약해 주세요.");
});

test("recheck after a pause: same values clear the notice, a changed price switches to the price notice", () => {
  assert.equal(cc.recheckedConflict(prev, product, "opt-5"), null);
  const p = structuredClone(product);
  p.stages[0].options["opt-5"].price = 30000;
  const c = cc.recheckedConflict(prev, p, "opt-5", 29000);
  const v = cc.conflictView(c, ctx({ product: p }), f);
  assert.equal(v.title, "가격이 바뀌었어요");
  assert.equal(v.primary.label, "바뀐 금액으로 예약하기");
  assert.equal(cc.clearsOnSelection({ reason: "SOLD_OUT", details: {} }), true);
  assert.equal(cc.clearsOnSelection({ reason: "STAGE_CHANGED", details: {} }), false);
});
