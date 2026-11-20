// 물량·판매 설정 맨 위 품절 안내(apps/producer/src/lib/soldOutGuide.ts) — 판매 중 상품의 품절 종류마다 다음 행동 문구
// (AC-04-9, screens.md 판매 설정 품절 안내, DEV-345)
import assert from "node:assert/strict";
import { test } from "node:test";
import { soldOutGuide } from "../apps/producer/src/lib/soldOutGuide.ts";

const opt5 = { optionId: "opt-5", label: "5kg" };
const opt10 = { optionId: "opt-10", label: "10kg" };
/** 지금 기간 st-1에 옵션마다 [판매 박스, 예약+출하 박스] */
function product(over = {}, boxes = { "opt-5": [80, 38], "opt-10": [20, 6] }) {
  return {
    status: "PUBLISHED",
    availability: "TOTAL_SOLD_OUT",
    approvedSupplyGrams: 2_400_000,
    salesLimitGrams: 250_000,
    pendingCapacityRequest: null,
    currentStageId: "st-1",
    options: [opt5, opt10],
    stages: [
      {
        stageId: "st-1",
        options: Object.fromEntries(
          Object.entries(boxes).map(([k, [quantity, reservedCount]]) => [
            k,
            { price: 30000, quantity, reservedCount },
          ]),
        ),
      },
    ],
    ...over,
  };
}

test("AC-04-9 DEV-345: fully sold out with approved > limit points to raising the limit, boxes left", () => {
  assert.deepEqual(soldOutGuide(product()), {
    title: "전체 물량 품절",
    body: "판매 한도 250kg를 모두 채웠어요. 승인 2,400kg까지 늘릴 수 있어요.",
    hint: "한도를 늘린 뒤 박스가 모자라면 상품 수정의 판매 조건에서 박스 수도 늘려 주세요.",
    toStages: false,
  });
});

test("AC-04-9 DEV-345: fully sold out with approved > limit and no boxes left also links to periods", () => {
  const guide = soldOutGuide(product({}, { "opt-5": [38, 38], "opt-10": [6, 6] }));
  assert.equal(guide.hint, "이번 기간에 남은 박스도 없어요. 상품 수정의 판매 조건에서 박스 수도 늘려 주세요.");
  assert.equal(guide.toStages, true);
});

test("AC-04-9 DEV-345: approved = limit asks for a supply request, or says one is under review", () => {
  assert.deepEqual(soldOutGuide(product({ approvedSupplyGrams: 250_000 })), {
    title: "전체 물량 품절",
    body: "승인 물량을 모두 썼어요. 아래 ‘물량 추가 신청’ 후 운영자가 승인하면 늘릴 수 있어요.",
    hint: null,
    toStages: false,
  });
  const pending = soldOutGuide(
    product({ approvedSupplyGrams: 250_000, pendingCapacityRequest: { requestId: "cr-1", status: "PENDING" } }),
  );
  assert.equal(pending.body, "승인 물량을 모두 썼어요. 물량 추가 신청을 심사 중이에요. 승인되면 늘릴 수 있어요.");
  assert.equal(pending.toStages, false);
});

test("AC-04-9 DEV-345: sold out for this period points to periods and prices", () => {
  assert.deepEqual(soldOutGuide(product({ availability: "PERIOD_SOLD_OUT", salesLimitGrams: 2_400_000 })), {
    title: "이번 기간 품절",
    body: "이번 기간에 남은 박스가 없어요. 상품 수정의 판매 조건에서 박스 수를 늘려 '상품에 반영'하면 다시 예약받아요.",
    hint: null,
    toStages: true,
  });
});

test("AC-04-9 DEV-345: fully sold out with no boxes set this period (options replaced) uses the period guide", () => {
  const guide = soldOutGuide(product({ options: [{ optionId: "opt-3", label: "3kg" }] }));
  assert.equal(guide.title, "이번 기간 품절");
  assert.equal(guide.toStages, true);
});

test("AC-04-9 DEV-345: unapproved, paused or sellable products get no guide", () => {
  for (const status of ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CLOSED"])
    assert.equal(soldOutGuide(product({ status, approvedSupplyGrams: 0, salesLimitGrams: 0 })), null, status);
  for (const availability of ["AVAILABLE", "PAUSED", "NOT_OPEN", "ENDED"])
    assert.equal(soldOutGuide(product({ availability })), null, availability);
});
