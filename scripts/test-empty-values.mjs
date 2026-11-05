// DEV-227 (FEAT-07 AC-07-2·AC-07-3, M-11, ia.md 4장 레이블, screens.md 3장 빈 값): 빈 값 문구 규칙.
// packages/ui/src/format.ts의 도우미가 값 종류 × 상태마다 한 가지 글자를 내고, 자리표시자('-Brix'·'0명'·'마감 '·'배송비 ')를 만들지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AVAILABILITY_LABEL,
  brixText,
  closesText,
  DELIVERY_PENDING_NOTE,
  deliveryText,
  joinMeta,
  reservedText,
  shippingText,
  time,
  unavailableLabel,
} from "../packages/ui/src/format.ts";
import { productStatus } from "../apps/producer/src/lib/productGroups.ts";

const noDanglingLabel = (s) => assert.ok(!/(마감|배송비)\s*$/.test(s), `라벨만 남음: "${s}"`);

test("AC-07-2: brix shows expected value, or '당도 등록 전' with no placeholder number", () => {
  assert.deepEqual(brixText(12), {
    title: "당도 예상 12Brix",
    note: "실측 당도가 등록되면 이곳에서 확인할 수 있어요",
  });
  for (const empty of [null, undefined, Number.NaN]) {
    const t = brixText(empty);
    assert.equal(t.title, "당도 등록 전");
    assert.equal(t.note, "궁금하면 1:1 채팅으로 농가에 물어보세요");
    assert.ok(!t.title.includes("Brix"));
  }
  assert.equal(brixText(0).title, "당도 예상 0Brix"); // 0은 값이다(입력 검증은 FEAT-04)
});

test("DEV-227 SCR-01: card meta drops empty pieces and never says 0명", () => {
  const meta = (n, d) => joinMeta(reservedText(n), closesText(d));
  assert.equal(meta(38, 5), "38명 예약 · 마감 D-5");
  assert.equal(meta(0, 9), "마감 D-9");
  assert.equal(meta(12, null), "12명 예약");
  assert.equal(meta(0, null), "");
  assert.equal(meta(3, 0), "3명 예약 · 마감 D-day");
  for (const [n, d] of [[0, 9], [12, null], [0, null], [null, undefined]]) {
    const s = meta(n, d);
    assert.ok(!s.includes("0명"));
    noDanglingLabel(s);
  }
});

test("AC-07-3: one availability → name table for consumer cards, detail and producer list", () => {
  assert.deepEqual(
    Object.fromEntries(
      ["NOT_OPEN", "PERIOD_SOLD_OUT", "TOTAL_SOLD_OUT", "PAUSED", "ENDED"].map((a) => [a, unavailableLabel(a)]),
    ),
    {
      NOT_OPEN: "예약 시작 전",
      PERIOD_SOLD_OUT: "이번 기간 품절",
      TOTAL_SOLD_OUT: "전체 물량 품절",
      PAUSED: "판매 일시 중지",
      ENDED: "예약 종료",
    },
  );
  // 상품은 예약 가능한데 이 옵션만 이번 기간에 다 팔린 경우
  assert.equal(unavailableLabel("AVAILABLE"), "이번 기간 품절");
  assert.equal(unavailableLabel(undefined), "이번 기간 품절");
  // 생산자 목록 보조 상태가 같은 표의 이름을 쓴다
  for (const a of ["NOT_OPEN", "PERIOD_SOLD_OUT", "TOTAL_SOLD_OUT"]) {
    assert.equal(
      productStatus({ status: "PUBLISHED", availability: a, salesPaused: false }),
      AVAILABILITY_LABEL[a],
    );
  }
  const all = Object.values(AVAILABILITY_LABEL).join(" ");
  assert.ok(!all.includes("현재 예약 불가") && !all.includes("현재 기간 품절"));
});

test("DEV-227 SCR-04: delivery shows confirmed window, else an estimate derived from the last reservation end", () => {
  const win = { start: "2026-11-10", end: "2026-11-20" };
  assert.equal(deliveryText(win), "11월 10일~20일 도착 예정");
  assert.equal(deliveryText(win, "2026-10-12", true), "11월 10일~20일 도착");
  // FEAT-05: 마지막 예약 종료일 < 배송 시작일 → 그 뒤라는 것만 말하고 '예상'을 붙인다(M-11)
  assert.equal(deliveryText(null, "2026-10-05T14:59:59Z"), "10월 초순 이후 도착 예상");
  assert.equal(deliveryText(null, "2026-11-15"), "11월 중순 이후 도착 예상");
  assert.equal(deliveryText(null, "2026-11-30T23:00:00+09:00"), "11월 하순 이후 도착 예상");
  // 한국 시간 기준(UTC 10/10 15:00 = 10/11 00:00 KST → 중순)
  assert.equal(deliveryText(null, "2026-10-10T15:00:00Z"), "10월 중순 이후 도착 예상");
  assert.equal(deliveryText(null, null), "받는 시기 확정 전");
  assert.equal(deliveryText({ start: "2026-11-10", end: null }, null), "받는 시기 확정 전");
  assert.equal(DELIVERY_PENDING_NOTE, "받는 시기는 예약 전에 확정돼요.");
});

test("DEV-227 SCR-04: shipping fee line always ends in a value", () => {
  assert.equal(shippingText("FREE", 0), "무료배송");
  assert.equal(shippingText("SEPARATE", 4000), "배송비 4,000원");
  assert.equal(shippingText("SEPARATE", null), "배송비 확정 전");
  assert.equal(shippingText("SEPARATE", 0), "배송비 확정 전");
  for (const fee of [null, undefined, 0]) noDanglingLabel(shippingText("SEPARATE", fee));
});

test("DEV-227: in-day times have no leading zero (news room uses time())", () => {
  assert.equal(time("2026-10-07T00:40:00Z"), "오전 9:40");
  assert.equal(time("2026-10-07T03:05:00Z"), "오후 12:05");
  assert.equal(time("2026-10-06T15:05:00Z"), "오전 12:05");
  assert.ok(!/ 0\d:/.test(time("2026-10-07T00:40:00Z")));
});
