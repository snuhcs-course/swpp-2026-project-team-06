// DEV-348 (FEAT-07 AC-07-9, DEV-311 통합안 11/17 최종 + 11/17 PM 결정 ‘가 + 다’): 가격 계단을 단계 수별로 어떻게 그리는지.
// 높이는 가격이 아니라 칸 순서, 지금 칸이 맨 왼쪽, 칸마다 날짜와 그 기간 가격(첫 옵션), 같은 가격이 이어지면 한 칸,
// 4칸 이상이면 ‘지금’을 칸 위로. 차액·이득 문구는 만들지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { md, won } from "../packages/ui/src/format.ts";
import { priceHoldsUntil, priceStair } from "../packages/ui/src/stairSteps.ts";

const fmt = { md, won };
const options = [
  { optionId: "opt-5", label: "5kg" },
  { optionId: "opt-10", label: "10kg" },
];
const stage = (seq, startsAt, endsAt, p5, p10 = p5 * 2) => ({
  stageId: `st-${seq}`,
  seq,
  startsAt,
  endsAt,
  options: { "opt-5": { price: p5 }, "opt-10": { price: p10 } },
});
// 시드 p-house와 같은 세 기간
const three = [
  stage(1, "2026-10-01", "2026-10-12", 29000),
  stage(2, "2026-10-13", "2026-11-05", 33000),
  stage(3, "2026-11-06", "2026-11-09", 36000),
];
const input = (stages, currentStageId = stages[0].stageId, extra = {}) => ({
  stages,
  currentStageId,
  soldOut: false,
  options,
  ...extra,
});
const view = (s) => s.steps.map((x) => [x.height, x.date, x.price]);

test("AC-07-9: three stages → heights 20·32·44, every bar shows its date and its period price", () => {
  const s = priceStair(input(three), fmt);
  assert.deepEqual(view(s), [
    [20, "10월 12일까지", "29,000원"],
    [32, "10월 13일부터", "33,000원"],
    [44, "11월 6일부터", "36,000원"],
  ]);
  assert.deepEqual(
    s.steps.map((x) => x.now),
    [true, false, false],
  );
  assert.equal(s.nowAbove, false);
  assert.equal(s.nowLabel, "지금 · 10월 12일까지");
  // 옵션 이름은 칸마다 붙이지 않고 제목 줄 ‘· 5kg 기준’에 한 번
  assert.equal(s.basis, "5kg");
  // 차액·이득 문구는 없다
  assert.ok(!/싸|이득|차이|-\d|4,000/.test(JSON.stringify(s)));
});

test("AC-07-9: heights follow bar order, not price (a tiny rise still reads as a stair)", () => {
  const flatish = [
    stage(1, "2026-10-01", "2026-10-12", 29000),
    stage(2, "2026-10-13", "2026-11-05", 29100),
    stage(3, "2026-11-06", "2026-11-09", 29200),
  ];
  assert.deepEqual(
    priceStair(input(flatish), fmt).steps.map((x) => x.height),
    [20, 32, 44],
  );
});

test("AC-07-9: two stages → 20·44 and the one-line 'now' label", () => {
  const s = priceStair(input(three.slice(0, 2)), fmt);
  assert.deepEqual(view(s), [
    [20, "10월 12일까지", "29,000원"],
    [44, "10월 13일부터", "33,000원"],
  ]);
  assert.equal(s.nowAbove, false);
  assert.equal(s.nowLabel, "지금 · 10월 12일까지");
});

test("AC-07-9: four or more bars with distinct prices → 'now' moves above the now bar, every bar keeps its price", () => {
  const four = [
    stage(1, "2026-10-08", "2026-11-30", 35000),
    stage(2, "2026-12-01", "2026-12-14", 37000),
    stage(3, "2026-12-15", "2026-12-30", 39000),
    stage(4, "2026-12-31", "2027-01-10", 41000),
  ];
  const s = priceStair(input(four), fmt);
  assert.deepEqual(view(s), [
    [20, "11월 30일까지", "35,000원"],
    [28, "12월 1일부터", "37,000원"],
    [36, "12월 15일부터", "39,000원"],
    [44, "12월 31일부터", "41,000원"],
  ]);
  assert.equal(s.nowAbove, true);
  assert.equal(s.nowLabel, "11월 30일까지");
  const five = [...four, stage(5, "2027-01-11", "2027-01-20", 43000)];
  const f = priceStair(input(five), fmt);
  assert.equal(f.nowAbove, true);
  assert.equal(f.steps.length, 5);
  assert.equal(f.steps.at(-1).height, 44);
});

test("AC-07-9: consecutive periods at the same price merge into one bar dated from the merged start", () => {
  // 가운데 두 기간이 같은 가격 → 4기간이 3칸
  const middle = [
    stage(1, "2026-10-01", "2026-10-16", 19000),
    stage(2, "2026-10-17", "2026-10-31", 22000),
    stage(3, "2026-11-01", "2026-11-15", 22000),
    stage(4, "2026-11-16", "2026-11-30", 25000),
  ];
  const s = priceStair(input(middle), fmt);
  assert.deepEqual(view(s), [
    [20, "10월 16일까지", "19,000원"],
    [32, "10월 17일부터", "22,000원"],
    [44, "11월 16일부터", "25,000원"],
  ]);
  assert.equal(s.nowAbove, false); // 합친 뒤 3칸이라 ‘지금’은 칸 아래 한 줄
  // 지금 기간과 다음 기간이 같은 가격이면 지금 칸이 합친 구간의 끝날까지
  const sameNow = [
    stage(1, "2026-10-01", "2026-10-12", 29000),
    stage(2, "2026-10-13", "2026-11-05", 29000),
    stage(3, "2026-11-06", "2026-11-09", 36000),
  ];
  const n = priceStair(input(sameNow), fmt);
  assert.deepEqual(view(n), [
    [20, "11월 5일까지", "29,000원"],
    [44, "11월 6일부터", "36,000원"],
  ]);
  assert.equal(n.nowLabel, "지금 · 11월 5일까지");
  // 합친 뒤 칸이 하나면(모두 같은 가격) 그리지 않는다
  const flat = three.map((s) => ({ ...s, options: { "opt-5": { price: 29000 }, "opt-10": { price: 58000 } } }));
  assert.equal(priceStair(input(flat), fmt), null);
});

test("AC-07-9: any price drop ahead hides the stair (it would make 'the earlier, the cheaper' untrue)", () => {
  const dipThenUp = [
    stage(1, "2026-10-01", "2026-10-12", 29000),
    stage(2, "2026-10-13", "2026-11-05", 27000),
    stage(3, "2026-11-06", "2026-11-09", 36000),
  ];
  assert.equal(priceStair(input(dipThenUp), fmt), null);
  const upThenDown = [
    stage(1, "2026-10-01", "2026-10-12", 29000),
    stage(2, "2026-10-13", "2026-11-05", 36000),
    stage(3, "2026-11-06", "2026-11-09", 33000),
  ];
  assert.equal(priceStair(input(upThenDown), fmt), null);
  const down = [stage(1, "2026-10-01", "2026-10-12", 29000), stage(2, "2026-10-13", "2026-11-05", 27000)];
  assert.equal(priceStair(input(down), fmt), null);
  // 지난 기간이 더 비쌌던 것은 상관없다(그리지 않는 기간)
  const pastHigher = [stage(0, "2026-09-20", "2026-09-30", 40000), ...three];
  assert.equal(priceStair(input(pastHigher, "st-1"), fmt).steps.length, 3);
});

test("AC-07-9: past stages are not drawn; the current stage is always the first (left) bar", () => {
  const s = priceStair(input(three, "st-2"), fmt);
  assert.deepEqual(view(s), [
    [20, "11월 5일까지", "33,000원"],
    [44, "11월 6일부터", "36,000원"],
  ]);
  assert.equal(s.nowLabel, "지금 · 11월 5일까지");
  // 응답 순서가 섞여도 seq로 정렬한다
  const shuffled = [three[2], three[0], three[1]];
  assert.deepEqual(priceStair(input(shuffled, "st-1"), fmt), priceStair(input(three), fmt));
});

test("AC-07-9: no stair when nothing ahead to compare or not reservable", () => {
  assert.equal(priceStair(input(three.slice(0, 1)), fmt), null);
  assert.equal(priceStair(input(three, "st-3"), fmt), null);
  assert.equal(priceStair(input(three, "st-1", { soldOut: true }), fmt), null);
  assert.equal(priceStair(input(three, null), fmt), null);
  assert.equal(priceStair(input(three, "missing"), fmt), null);
  assert.equal(priceStair(input(three, "st-1", { options: [] }), fmt), null);
  // 남은 기간 중 하나라도 첫 옵션 가격이 비면 그리지 않는다(빈 칸·가짜 가격 없음, M-24)
  const hole = three.map((s, i) => (i === 1 ? { ...s, options: {} } : s));
  assert.equal(priceStair(input(hole), fmt), null);
});

test("AC-07-9: price uses the first option (the card price basis); start date falls back to the day after the previous end", () => {
  const withoutStarts = three.map(({ startsAt, ...s }) => s);
  assert.deepEqual(
    priceStair(input(withoutStarts), fmt).steps.map((x) => x.date),
    ["10월 12일까지", "10월 13일부터", "11월 6일부터"],
  );
  const tenFirst = priceStair(input(three, "st-1", { options: [...options].reverse() }), fmt);
  assert.equal(tenFirst.basis, "10kg");
  assert.deepEqual(
    tenFirst.steps.map((x) => x.price),
    ["58,000원", "66,000원", "72,000원"],
  );
});

test("AC-07-9: the basis option is the one passed in (first buyable option); its prices draw the stair and title (DEV-348 review)", () => {
  // 첫 옵션(5kg)이 이번 기간 품절이면 부르는 쪽(PriceStair)이 살 수 있는 첫 옵션(10kg)을 넘긴다. 마지막 칸 가격 = 그 옵션 줄의 취소선 가격
  const s = priceStair(input(three), fmt, "opt-10");
  assert.equal(s.basis, "10kg");
  assert.deepEqual(
    s.steps.map((x) => x.price),
    ["58,000원", "66,000원", "72,000원"],
  );
  // 모르는 옵션이면 첫 옵션
  assert.equal(priceStair(input(three), fmt, "missing").basis, "5kg");
});

test("AC-07-9: unknown dates leave no empty label lines; 'now' stays (DEV-348 review)", () => {
  const noDates = three.map(({ startsAt, endsAt, ...s }) => s);
  const s = priceStair(input(noDates), fmt);
  assert.deepEqual(
    s.steps.map((x) => x.date),
    ["", "", ""],
  );
  assert.equal(s.nowLabel, "지금");
  const four = [0, 1, 2, 3].map((i) => ({ stageId: `st-${i}`, seq: i, options: { "opt-5": { price: 30000 + i * 1000 } } }));
  const f = priceStair(input(four), fmt);
  assert.equal(f.nowAbove, true);
  assert.equal(f.nowLabel, ""); // ‘지금’은 칸 위에 이미 있으니 칸 아래 날짜 줄은 그리지 않는다(PriceStair가 빈 글자를 건너뜀)
});

test("AC-07-9: 'this price until' uses the end of the same-price span, matching the stair's now label (DEV-348 review)", () => {
  assert.equal(priceHoldsUntil(input(three)), "2026-10-12");
  const sameNow = [
    stage(1, "2026-10-01", "2026-10-12", 29000),
    stage(2, "2026-10-13", "2026-11-05", 29000),
    stage(3, "2026-11-06", "2026-11-09", 36000),
  ];
  assert.equal(priceHoldsUntil(input(sameNow)), "2026-11-05");
  assert.equal(priceStair(input(sameNow), fmt).nowLabel, `지금 · ${md(priceHoldsUntil(input(sameNow)))}까지`);
  // 같은 가격이 끝까지 이어지면 마지막 기간 끝
  const flat = sameNow.map((s) => ({ ...s, options: { "opt-5": { price: 29000 }, "opt-10": { price: 58000 } } }));
  assert.equal(priceHoldsUntil(input(flat)), "2026-11-09");
  // 기준 옵션별로 따로: 10kg은 58,000 → 58,000 → 72,000
  assert.equal(priceHoldsUntil(input(sameNow), "opt-10"), "2026-11-05");
  assert.equal(priceHoldsUntil(input(three, null)), null);
  assert.equal(priceHoldsUntil(input(three, "missing")), null);
});
