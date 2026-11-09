// DEV-300 (FEAT-14 AC-14-3, SCR-22·23·물량·판매 설정): 중량 옵션별 '예약+출하 N박스 / 판매 M박스'.
// apps/producer/src/lib/optionBoxes.ts 순수 함수만 본다. 옵션끼리 더하지 않고 기간은 모두 더한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  optionBoxesFromDashboard,
  optionBoxesFromProduct,
  optionBoxesLabel,
  optionBoxesLine,
  optionBoxesRatio,
  optionBoxesText,
} from "../apps/producer/src/lib/optionBoxes.ts";

const options = [
  { optionId: "o3", label: "3kg", weightKg: 3 },
  { optionId: "o5", label: "5kg", weightKg: 5 },
  { optionId: "o15", label: "15kg", weightKg: 15 },
  { optionId: "o20", label: "20kg", weightKg: 20 },
];
const v = (quantity, reservedCount) => ({ price: 10000, quantity, reservedCount });

test("AC-14-3 DEV-300: each weight option sums sold boxes and box quantity across every period, in option order", () => {
  const stages = [
    { options: { o20: v(10, 2), o5: v(40, 24), o3: v(30, 12), o15: v(10, 0) } },
    { options: { o3: v(20, 3), o5: v(32, 0), o15: v(8, 5), o20: v(6, 6) } },
  ];
  assert.deepEqual(optionBoxesFromProduct(options, stages), [
    { optionId: "o3", label: "3kg", sold: 15, quantity: 50 },
    { optionId: "o5", label: "5kg", sold: 24, quantity: 72 },
    { optionId: "o15", label: "15kg", sold: 5, quantity: 18 },
    { optionId: "o20", label: "20kg", sold: 8, quantity: 16 },
  ]);
});

test("AC-14-3 DEV-300: an option missing from a period counts 0 there, and an option with no values anywhere still shows 0 boxes", () => {
  const stages = [
    { options: { o5: v(40, 10) } },
    { options: { o5: v(0, 0), o3: v(12, 4) } },
    { options: {} },
  ];
  const rows = optionBoxesFromProduct(options, stages);
  assert.deepEqual(
    rows.map((r) => [r.label, r.sold, r.quantity]),
    [
      ["3kg", 4, 12],
      ["5kg", 10, 40],
      ["15kg", 0, 0],
      ["20kg", 0, 0],
    ],
  );
  // 판매 박스가 0이면 막대는 0(나눗셈 없음)
  assert.equal(optionBoxesRatio(rows[2]), 0);
  // 기간이 하나도 없으면 옵션마다 0박스
  assert.deepEqual(
    optionBoxesFromProduct(options, []).map((r) => r.sold + r.quantity),
    [0, 0, 0, 0],
  );
});

test("AC-14-3 DEV-300: stray values for an option the product no longer has are ignored and bad numbers count as 0", () => {
  const rows = optionBoxesFromProduct(options.slice(0, 1), [
    { options: { o3: v(10, Number.NaN), gone: v(99, 99) } },
    { options: { o3: v(-5, 2) } },
  ]);
  assert.deepEqual(rows, [{ optionId: "o3", label: "3kg", sold: 2, quantity: 10 }]);
});

test("AC-14-3 DEV-300: the dashboard rows merge periods by option in first-seen order", () => {
  const stages = [
    {
      options: [
        { optionId: "o5", label: "5kg", price: 29000, reserved: 38, quantity: 80 },
        { optionId: "o10", label: "10kg", price: 55000, reserved: 6, quantity: 20 },
      ],
    },
    {
      // 이 기간에는 5kg 값이 없다(서버는 값이 없는 옵션을 빼고 준다)
      options: [{ optionId: "o10", label: "10kg", price: 62000, reserved: 1, quantity: 25 }],
    },
    {
      options: [
        { optionId: "o5", label: "5kg", price: 36000, reserved: 0, quantity: 40 },
        { optionId: "o10", label: "10kg", price: 68000, reserved: 0, quantity: 15 },
      ],
    },
  ];
  assert.deepEqual(optionBoxesFromDashboard(stages), [
    { optionId: "o5", label: "5kg", sold: 38, quantity: 120 },
    { optionId: "o10", label: "10kg", sold: 7, quantity: 60 },
  ]);
  // 기간이 없으면 빈 목록(화면은 kg 줄로 돌아간다)
  assert.deepEqual(optionBoxesFromDashboard([]), []);
  assert.deepEqual(optionBoxesFromDashboard([{ options: [] }]), []);
});

test("AC-14-3 DEV-300: text keeps each option separate in boxes and never adds options together", () => {
  const rows = [
    { optionId: "o5", label: "5kg", sold: 24, quantity: 72 },
    { optionId: "o10", label: "10kg", sold: 1800, quantity: 2400 },
  ];
  assert.equal(optionBoxesText(rows[0]), "24박스 / 72박스");
  assert.equal(optionBoxesText(rows[1]), "1,800박스 / 2,400박스");
  assert.equal(optionBoxesLine(rows), "5kg 24박스 · 10kg 1,800박스");
  assert.equal(optionBoxesLine([]), "");
  assert.equal(optionBoxesLabel(rows[0]), "5kg 예약·출하 24박스, 판매 72박스");
  assert.equal(optionBoxesRatio(rows[0]), 1 / 3);
  // 판매 박스보다 많이 팔려도 막대는 가득(1)
  assert.equal(optionBoxesRatio({ ...rows[0], sold: 90 }), 1);
});
