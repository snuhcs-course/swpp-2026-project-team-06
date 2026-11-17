// DEV-348 (FEAT-07 AC-07-9, DEV-311 통합안 11/17 최종): 가격 계단을 단계 수별로 어떻게 그리는지.
// 높이는 가격이 아니라 기간 순서, 지금 칸이 맨 왼쪽, 가격은 마지막 칸 하나, 4칸 이상이면 ‘지금’을 칸 위로.
import assert from "node:assert/strict";
import { test } from "node:test";
import { md, won } from "../packages/ui/src/format.ts";
import { priceStair } from "../packages/ui/src/stairSteps.ts";

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

test("AC-07-9: three stages → heights 20·32·44 by period order, 'now' label with date, last price only", () => {
  const s = priceStair(input(three), fmt);
  assert.deepEqual(
    s.steps.map((x) => x.height),
    [20, 32, 44],
  );
  assert.deepEqual(
    s.steps.map((x) => x.now),
    [true, false, false],
  );
  assert.deepEqual(
    s.steps.map((x) => x.date),
    ["10월 12일까지", "10월 13일부터", "11월 6일부터"],
  );
  assert.equal(s.nowAbove, false);
  assert.equal(s.nowLabel, "지금 · 10월 12일까지");
  assert.equal(s.lastPrice, "5kg 36,000원");
  // 다음 기간 가격(33,000원)은 어디에도 없다(스펙: 다음 기간 이득 문구 없음)
  assert.ok(!JSON.stringify(s).includes("33,000"));
});

test("AC-07-9: heights follow period order, not price (a tiny last-step rise still reads as a stair)", () => {
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
  assert.deepEqual(
    s.steps.map((x) => x.height),
    [20, 44],
  );
  assert.equal(s.nowAbove, false);
  assert.equal(s.nowLabel, "지금 · 10월 12일까지");
  assert.equal(s.lastPrice, "5kg 33,000원");
});

test("AC-07-9: four or more stages → 'now' moves above the now bar, only the date stays below", () => {
  const four = [
    stage(1, "2026-10-08", "2026-11-30", 35000),
    stage(2, "2026-12-01", "2026-12-14", 37000),
    stage(3, "2026-12-15", "2026-12-30", 39000),
    stage(4, "2026-12-31", "2027-01-10", 41000),
  ];
  const s = priceStair(input(four), fmt);
  assert.deepEqual(
    s.steps.map((x) => x.height),
    [20, 28, 36, 44],
  );
  assert.equal(s.nowAbove, true);
  assert.equal(s.nowLabel, "11월 30일까지");
  assert.equal(s.lastPrice, "5kg 41,000원");
  const five = [...four, stage(5, "2027-01-11", "2027-01-20", 43000)];
  const f = priceStair(input(five), fmt);
  assert.equal(f.nowAbove, true);
  assert.equal(f.steps.length, 5);
  assert.equal(f.steps.at(-1).height, 44);
});

test("AC-07-9: past stages are not drawn; the current stage is always the first (left) bar", () => {
  const s = priceStair(input(three, "st-2"), fmt);
  assert.equal(s.steps.length, 2);
  assert.equal(s.nowLabel, "지금 · 11월 5일까지");
  assert.deepEqual(
    s.steps.map((x) => x.height),
    [20, 44],
  );
  // 응답 순서가 섞여도 seq로 정렬한다
  const shuffled = [three[2], three[0], three[1]];
  assert.deepEqual(priceStair(input(shuffled, "st-1"), fmt), priceStair(input(three), fmt));
});

test("AC-07-9: no stair when nothing ahead to compare (one stage, or now is the last stage)", () => {
  assert.equal(priceStair(input(three.slice(0, 1)), fmt), null);
  assert.equal(priceStair(input(three, "st-3"), fmt), null);
});

test("AC-07-9: no stair when it would be untrue or not reservable", () => {
  // 마지막 기간이 지금보다 비싸지 않으면 ‘일찍 예약할수록 싸요’가 사실이 아니다
  const flat = [stage(1, "2026-10-01", "2026-10-12", 29000), stage(2, "2026-10-13", "2026-11-05", 29000)];
  assert.equal(priceStair(input(flat), fmt), null);
  const down = [stage(1, "2026-10-01", "2026-10-12", 29000), stage(2, "2026-10-13", "2026-11-05", 27000)];
  assert.equal(priceStair(input(down), fmt), null);
  // 예약할 수 없음(품절·중지·종료) · 지금 기간 없음(기간 사이) · 모르는 기간
  assert.equal(priceStair(input(three, "st-1", { soldOut: true }), fmt), null);
  assert.equal(priceStair(input(three, null), fmt), null);
  assert.equal(priceStair(input(three, "missing"), fmt), null);
  // 옵션이 없거나 첫 옵션 가격이 비면
  assert.equal(priceStair(input(three, "st-1", { options: [] }), fmt), null);
  const noLast = three.map((s, i) => (i === 2 ? { ...s, options: {} } : s));
  assert.equal(priceStair(input(noLast), fmt), null);
});

test("AC-07-9: price uses the first option (same basis as the card price); start date falls back to the day after the previous end", () => {
  const withoutStarts = three.map(({ startsAt, ...s }) => s);
  const s = priceStair(input(withoutStarts), fmt);
  assert.deepEqual(
    s.steps.map((x) => x.date),
    ["10월 12일까지", "10월 13일부터", "11월 6일부터"],
  );
  const tenFirst = priceStair(input(three, "st-1", { options: [...options].reverse() }), fmt);
  assert.equal(tenFirst.lastPrice, "10kg 72,000원");
});
