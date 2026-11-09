// DEV-291 (FEAT-07 AC-07-3, SCR-04·11·12): 스캔에서 나온 문구·수량 버그의 순수 함수.
// - eulReul: 받침에 따라 을/를('입금자명을 복사했어요', '○○농장을 팔로우할까요?')
// - optionLeft·defaultOptionId: 첫 옵션만 품절이면 '0박스 남음'·품절 옵션이 기본 선택되던 문제
import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultOptionId, eulReul, optionLeft } from "../packages/ui/src/format.ts";

test("eulReul: 받침이 있으면 '을', 없으면 '를', 한글이 아니면 '을'", () => {
  assert.equal(eulReul("입금자명"), "입금자명을");
  assert.equal(eulReul("계좌번호"), "계좌번호를");
  assert.equal(eulReul("강씨네 귤밭"), "강씨네 귤밭을");
  assert.equal(eulReul("한라봉 농가"), "한라봉 농가를");
  assert.equal(eulReul("Farm"), "Farm을");
});

const product = (stageOptions, remainingGrams = 100_000) => ({
  remainingGrams,
  currentStageId: "s1",
  options: [
    { optionId: "o5", weightKg: 5 },
    { optionId: "o10", weightKg: 10 },
  ],
  stages: [{ stageId: "s1", options: stageOptions }],
});

test("AC-07-3: optionLeft is the smaller of stage stock and total grams, never negative", () => {
  const p = product({ o5: { quantity: 10, reservedCount: 3 }, o10: { quantity: 4, reservedCount: 0 } }, 25_000);
  assert.equal(optionLeft(p, "o5"), 5); // 25kg / 5kg = 5 < 7
  assert.equal(optionLeft(p, "o10"), 2); // 25kg / 10kg = 2 < 4
  const over = product({ o5: { quantity: 2, reservedCount: 3 }, o10: { quantity: 1, reservedCount: 0 } });
  assert.equal(optionLeft(over, "o5"), 0);
  assert.equal(optionLeft({ ...p, currentStageId: null }, "o5"), 0);
  assert.equal(optionLeft(p, "missing"), 0);
});

test("AC-07-3: default option skips a sold-out first option", () => {
  const firstSoldOut = product({ o5: { quantity: 5, reservedCount: 5 }, o10: { quantity: 3, reservedCount: 1 } });
  assert.equal(defaultOptionId(firstSoldOut), "o10");
  assert.equal(optionLeft(firstSoldOut, defaultOptionId(firstSoldOut)), 2);
  const bothAvailable = product({ o5: { quantity: 5, reservedCount: 0 }, o10: { quantity: 3, reservedCount: 0 } });
  assert.equal(defaultOptionId(bothAvailable), "o5");
  const allSoldOut = product({ o5: { quantity: 1, reservedCount: 1 }, o10: { quantity: 1, reservedCount: 1 } });
  assert.equal(defaultOptionId(allSoldOut), "o5");
  assert.equal(defaultOptionId({ ...allSoldOut, options: [] }), "");
});
