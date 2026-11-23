// DEV-353: stock availability and product-exit policy.
import assert from "node:assert/strict";
import { test } from "node:test";
import { availableQuantity, conflictView } from "../apps/consumer/src/lib/checkoutConflict.ts";

const product = (grams = 100000, quantity = 10, reservedCount = 0) => ({
  options: [{ optionId: "five", label: "5kg", weightKg: 5 }],
  stages: [{ stageId: "current", startsAt: "2026-10-01", endsAt: "2026-10-31",
    options: { five: { price: 29000, quantity, reservedCount } } }],
  currentStageId: "current", remainingGrams: grams,
});
const format = { md: (value) => String(value), won: (value) => `${value.toLocaleString("ko-KR")}원` };

test("AC08-8/9: maximum boxes obey both remaining grams and this period's option remainder", () => {
  for (const [grams, stock, reserved, expected] of [
    [14999, 10, 0, 2], [15000, 10, 0, 3], [100000, 9, 7, 2],
    [10000, 9, 7, 2], [4999, 9, 0, 0], [0, 9, 0, 0],
    [-5000, 9, 0, 0], [100000, 3, 4, 0],
  ]) assert.equal(availableQuantity(product(grams, stock, reserved), "five"), expected,
    JSON.stringify({ grams, stock, reserved }));
});

test("AC08-8/9: absent current period or selected option cannot offer quantity", () => {
  for (const p of [{ ...product(), currentStageId: null },
    { ...product(), currentStageId: "missing" }, { ...product(), stages: [] },
    { ...product(), options: [] },
    { ...product(), stages: [{ stageId: "current", options: {} }] }])
    assert.equal(availableQuantity(p, "five"), 0);
  assert.equal(availableQuantity(product(), "missing"), 0);
});

test("AC08-8/9: fractional kg options use complete boxes, including exact gram boundaries", () => {
  const p = product(4001, 20);
  p.options[0].weightKg = 1.001;
  assert.equal(availableQuantity(p, "five"), 3);
  p.remainingGrams = 4004;
  assert.equal(availableQuantity(p, "five"), 4);
});

for (const [reason, p] of [["TOTAL_LIMIT_REACHED", product(10000)], ["SOLD_OUT", product(100000, 9, 7)]]) {
  test(`AC08-8/9: ${reason} with two boxes left exits to the product rather than inline recovery`, () => {
    const view = conflictView({ reason, details: { reason, optionId: "five" } },
      { product: p, optionId: "five", quantity: 3 }, format);
    assert.ok(view.title);
    assert.equal(view.body, "상품 화면에서 남은 수량과 다른 옵션을 확인해 주세요.");
    assert.equal(view.inline, null);
    assert.equal(view.primary.action, "backToProduct");
    assert.equal(view.primary.enabled, true);
  });
}

test("AC08-9: zero total or option stock exits to the product", () => {
  for (const [reason, p] of [["TOTAL_LIMIT_REACHED", product(0)], ["SOLD_OUT", product(100000, 5, 5)]]) {
    const view = conflictView({ reason, details: { reason } },
      { product: p, optionId: "five", quantity: 3 }, format);
    assert.equal(view.inline, null);
    assert.equal(view.primary.action, "backToProduct");
    assert.equal(view.primary.enabled, true);
    assert.ok(view.title);
    assert.equal(view.body, "상품 화면에서 남은 수량과 다른 옵션을 확인해 주세요.");
  }
});

test("AC08-9: a sold-out selected option does not offer inline recovery through another in-stock option", () => {
  const p = product(100000, 2, 2);
  p.options.push({ optionId: "ten", label: "10kg", weightKg: 10 });
  p.stages[0].options.ten = { price: 55000, quantity: 10, reservedCount: 0 };
  const view = conflictView({ reason: "SOLD_OUT", details: { reason: "SOLD_OUT", optionId: "five" } },
    { product: p, optionId: "five", quantity: 3 }, format);
  assert.equal(view.inline, null);
  assert.equal(view.primary.action, "backToProduct");
  assert.equal(view.primary.enabled, true);
});
