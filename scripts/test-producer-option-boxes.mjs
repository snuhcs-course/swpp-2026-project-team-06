// DEV-300 (FEAT-14 AC-14-3, SCR-22·23·물량·판매 설정): 중량 옵션별 '5kg  32,000원   예약+출하 N박스 / 판매 M박스'.
// apps/producer/src/lib/optionBoxes.ts 순수 함수만 본다. 옵션끼리 더하지 않고 기간은 모두 더한다. 가격은 지금 판매 기간의 박스당 가격.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  optionBoxesFromCard,
  optionBoxesFromDashboard,
  optionBoxesFromProduct,
  optionBoxesLabel,
  optionBoxesRatio,
  optionBoxesText,
  optionPriceText,
} from "../apps/producer/src/lib/optionBoxes.ts";

const options = [
  { optionId: "o3", label: "3kg", weightKg: 3 },
  { optionId: "o5", label: "5kg", weightKg: 5 },
  { optionId: "o15", label: "15kg", weightKg: 15 },
  { optionId: "o20", label: "20kg", weightKg: 20 },
];
const v = (quantity, reservedCount, price = 10000) => ({ price, quantity, reservedCount });
// 기간 i의 stageId는 s<i>. 지금 판매 기간(서버가 고른 MyProduct.currentStageId)은 둘째 기간
const CURRENT = "s1";
const at = (i, options) => ({ stageId: `s${i}`, options });

test("AC-14-3 DEV-300: each weight option sums sold boxes and box quantity across every period, in option order", () => {
  const stages = [
    at(0, { o20: v(10, 2, 70000), o5: v(40, 24, 28000), o3: v(30, 12, 18000), o15: v(10, 0, 55000) }),
    at(1, { o3: v(20, 3, 20000), o5: v(32, 0, 32000), o15: v(8, 5, 60000), o20: v(6, 6, 76000) }),
  ];
  // 가격은 지금 판매 기간(둘째) 것
  assert.deepEqual(optionBoxesFromProduct(options, stages, CURRENT), [
    { optionId: "o3", label: "3kg", price: 20000, sold: 15, quantity: 50 },
    { optionId: "o5", label: "5kg", price: 32000, sold: 24, quantity: 72 },
    { optionId: "o15", label: "15kg", price: 60000, sold: 5, quantity: 18 },
    { optionId: "o20", label: "20kg", price: 76000, sold: 8, quantity: 16 },
  ]);
  assert.equal(optionBoxesFromProduct(options, stages, "s0")[0].price, 18000);
  // 지금 판매 기간이 없으면(null, 또는 목록에 없는 기간) 가격 없음(박스 합은 그대로)
  assert.equal(optionBoxesFromProduct(options, stages, "gone")[0].price, null);
  const outside = optionBoxesFromProduct(options, stages, null);
  assert.deepEqual(outside.map((r) => [r.price, r.sold]), [[null, 15], [null, 24], [null, 5], [null, 8]]);
});

test("AC-14-3 DEV-300: an option missing from a period counts 0 there, and an option with no values anywhere still shows 0 boxes", () => {
  const stages = [
    at(0, { o5: v(40, 10) }),
    at(1, { o5: v(0, 0), o3: v(12, 4, 21000) }),
    at(2, {}),
  ];
  const rows = optionBoxesFromProduct(options, stages, CURRENT);
  assert.deepEqual(
    rows.map((r) => [r.label, r.price, r.sold, r.quantity]),
    [
      ["3kg", 21000, 4, 12],
      // 지금 기간 물량이 0이어도 값이 있으면 그 가격
      ["5kg", 10000, 10, 40],
      // 지금 기간에 값이 없는 옵션은 가격 없음
      ["15kg", null, 0, 0],
      ["20kg", null, 0, 0],
    ],
  );
  // 판매 박스가 0이면 막대는 0(나눗셈 없음)
  assert.equal(optionBoxesRatio(rows[2]), 0);
  // 기간이 하나도 없으면 옵션마다 0박스
  assert.deepEqual(
    optionBoxesFromProduct(options, [], CURRENT).map((r) => [r.sold + r.quantity, r.price]),
    [[0, null], [0, null], [0, null], [0, null]],
  );
});

test("AC-14-3 DEV-300: stray values for an option the product no longer has are ignored and bad numbers count as 0", () => {
  const rows = optionBoxesFromProduct(
    options.slice(0, 1),
    [at(0, { o3: v(10, Number.NaN), gone: v(99, 99) }), at(1, { o3: v(-5, 2, Number.NaN) })],
    CURRENT,
  );
  assert.deepEqual(rows, [{ optionId: "o3", label: "3kg", price: null, sold: 2, quantity: 10 }]);
});

test("AC-14-3 DEV-300: the dashboard rows merge periods by option in first-seen order", () => {
  const stages = [
    {
      current: true,
      options: [
        { optionId: "o5", label: "5kg", price: 29000, reserved: 38, quantity: 80 },
        { optionId: "o10", label: "10kg", price: 55000, reserved: 6, quantity: 20 },
      ],
    },
    {
      current: false,
      // 이 기간에는 5kg 값이 없다(서버는 값이 없는 옵션을 빼고 준다)
      options: [{ optionId: "o10", label: "10kg", price: 62000, reserved: 1, quantity: 25 }],
    },
    {
      current: false,
      options: [
        { optionId: "o5", label: "5kg", price: 36000, reserved: 0, quantity: 40 },
        { optionId: "o10", label: "10kg", price: 68000, reserved: 0, quantity: 15 },
      ],
    },
  ];
  // 가격은 current 기간 것(뒤 기간 가격으로 덮지 않는다)
  assert.deepEqual(optionBoxesFromDashboard(stages), [
    { optionId: "o5", label: "5kg", price: 29000, sold: 38, quantity: 120 },
    { optionId: "o10", label: "10kg", price: 55000, sold: 7, quantity: 60 },
  ]);
  // current 기간에 없는 옵션은 가격 없음
  const later = stages.map((s, i) => ({ ...s, current: i === 1 }));
  assert.deepEqual(
    optionBoxesFromDashboard(later).map((r) => [r.label, r.price]),
    [["5kg", null], ["10kg", 62000]],
  );
  // 기간이 없으면 빈 목록(화면은 kg 줄로 돌아간다)
  assert.deepEqual(optionBoxesFromDashboard([]), []);
  assert.deepEqual(optionBoxesFromDashboard([{ current: true, options: [] }]), []);
});

test("AC-14-3 DEV-300: text keeps each option separate in boxes and never adds options together", () => {
  const rows = [
    { optionId: "o5", label: "5kg", price: 32000, sold: 24, quantity: 72 },
    { optionId: "o10", label: "10kg", price: null, sold: 1800, quantity: 2400 },
  ];
  assert.equal(optionPriceText(rows[0]), "32,000원");
  assert.equal(optionPriceText(rows[1]), "");
  assert.equal(optionPriceText({ price: 0 }), "0원");
  assert.equal(optionBoxesText(rows[0]), "24박스 / 72박스");
  assert.equal(optionBoxesText(rows[1]), "1,800박스 / 2,400박스");
  assert.equal(optionBoxesLabel(rows[0]), "5kg 32,000원, 예약·출하 24박스, 판매 72박스");
  // 가격이 없으면 가격을 빼고 읽는다
  assert.equal(optionBoxesLabel(rows[1]), "10kg 예약·출하 1,800박스, 판매 2,400박스");
  assert.equal(optionBoxesRatio(rows[0]), 1 / 3);
  // 판매 박스보다 많이 팔려도 막대는 가득(1)
  assert.equal(optionBoxesRatio({ ...rows[0], sold: 90 }), 1);
});

test("AC-14-3 DEV-300: the product list card uses the server card options as they are, in option order", () => {
  const card = [
    { optionId: "o3", label: "3kg", weightKg: 3, reserved: 12, quantity: 50, price: 20000 },
    { optionId: "o5", label: "5kg", weightKg: 5, reserved: 24, quantity: 72, price: 32000 },
    // 지금 판매 기간이 없거나 그 기간에 옵션 값이 없으면 서버가 null을 준다
    { optionId: "o15", label: "15kg", weightKg: 15, reserved: 0, quantity: 0, price: null },
    { optionId: "o20", label: "20kg", weightKg: 20, reserved: 6, quantity: 6, price: 76000 },
  ];
  assert.deepEqual(optionBoxesFromCard(card), [
    { optionId: "o3", label: "3kg", price: 20000, sold: 12, quantity: 50 },
    { optionId: "o5", label: "5kg", price: 32000, sold: 24, quantity: 72 },
    { optionId: "o15", label: "15kg", price: null, sold: 0, quantity: 0 },
    { optionId: "o20", label: "20kg", price: 76000, sold: 6, quantity: 6 },
  ]);
  // 품절 옵션도 가격과 가득 찬 막대
  assert.equal(optionBoxesRatio(optionBoxesFromCard(card)[3]), 1);
  // 잘못된 숫자는 0박스·가격 없음
  assert.deepEqual(
    optionBoxesFromCard([{ optionId: "x", label: "x", reserved: -1, quantity: Number.NaN, price: Number.NaN }]),
    [{ optionId: "x", label: "x", price: null, sold: 0, quantity: 0 }],
  );
  assert.deepEqual(optionBoxesFromCard([]), []);
});

test("AC-14-3 DEV-300: the card, the product screen and the dashboard give the same rows for the same data", () => {
  const product = [
    { optionId: "o5", label: "5kg", weightKg: 5 },
    { optionId: "o10", label: "10kg", weightKg: 10 },
  ];
  const stages = [
    at(0, { o5: v(80, 38, 29000), o10: v(20, 6, 55000) }),
    at(1, { o5: v(60, 0, 33000), o10: v(25, 0, 62000) }),
    at(2, { o5: v(40, 0, 36000) }),
  ];
  const fromProduct = optionBoxesFromProduct(product, stages, CURRENT);
  // 서버 card_options와 같은 정의로 만든 카드 옵션
  const card = product.map((o) => ({
    ...o,
    reserved: stages.reduce((n, s) => n + (s.options[o.optionId]?.reservedCount ?? 0), 0),
    quantity: stages.reduce((n, s) => n + (s.options[o.optionId]?.quantity ?? 0), 0),
    price: stages[1].options[o.optionId]?.price ?? null,
  }));
  const dashboard = stages.map((s, i) => ({
    current: i === 1,
    options: product
      .filter((o) => s.options[o.optionId])
      .map((o) => ({
        optionId: o.optionId,
        label: o.label,
        price: s.options[o.optionId].price,
        reserved: s.options[o.optionId].reservedCount,
        quantity: s.options[o.optionId].quantity,
      })),
  }));
  assert.deepEqual(optionBoxesFromCard(card), fromProduct);
  assert.deepEqual(optionBoxesFromDashboard(dashboard), fromProduct);
  assert.deepEqual(fromProduct.map(optionBoxesLabel), [
    "5kg 33,000원, 예약·출하 38박스, 판매 180박스",
    "10kg 62,000원, 예약·출하 6박스, 판매 45박스",
  ]);
});

// Mock 계약: 목록 카드 options는 같은 상품 화면(MyProduct)에서 만든 줄과 같다(서버 card_options와 같은 정의)
const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const mockDb = require("../.expo/mock-build/packages/api/src/mock/db.js");
mockDb.configureMockStorage({ read: () => null, write: () => {} });
const call = async (method, path, token, body) => {
  const r = await mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": `option-boxes-${Math.random()}` },
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  return structuredClone(r.body);
};

test("AC-14-3 DEV-300: Mock product list cards carry per-option boxes and the current period price, same as the product screen", async () => {
  mockDb.reset();
  const { accessToken } = await call("POST", "/api/auth/test-login", null, { userId: "u-kang", app: "producer" });
  const { items } = await call("GET", "/api/products/mine", accessToken);
  assert.ok(items.length > 1);
  for (const card of items) {
    const product = await call("GET", `/api/products/mine/${card.productId}`, accessToken);
    assert.deepEqual(
      card.options.map((o) => [o.optionId, o.label, o.weightKg]),
      product.options.map((o) => [o.optionId, o.label, o.weightKg]),
      card.productId,
    );
    assert.deepEqual(
      optionBoxesFromCard(card.options),
      optionBoxesFromProduct(product.options, product.stages, product.currentStageId),
      card.productId,
    );
  }
  // 지금 판매 기간은 카드 currentStageLabel과 같은 기간(Mock 기준일 TODAY)
  for (const card of items) {
    const product = await call("GET", `/api/products/mine/${card.productId}`, accessToken);
    const cur = product.stages.find((s) => s.stageId === product.currentStageId);
    assert.equal(cur ? `${cur.startsAt} ~ ${cur.endsAt}` : null, card.currentStageLabel, card.productId);
  }
  // 시드 하우스 감귤(5kg·10kg, 기간 3개, 지금 1기간): 박스는 모든 기간 합, 가격은 지금 기간
  const house = items.find((c) => c.productId === "p-house");
  assert.deepEqual(
    house.options.map((o) => [o.label, o.price]),
    [["5kg", 29000], ["10kg", 55000]],
  );
  assert.ok(house.options.every((o) => o.quantity > 0));
});
