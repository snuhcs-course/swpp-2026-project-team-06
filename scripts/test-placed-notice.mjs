// DEV-356 (FEAT-08 AC-08-10, DEV-268 UX ⑥): 주문서 ‘이미 만든 예약’ 상자·‘지금 예약가로 잡아 뒀어요’·버튼 위 한 줄
// apps/consumer/src/lib/placedNotice.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { placedView } from "../apps/consumer/src/lib/placedNotice.ts";

const placed = { orderId: "o-1", optionId: "opt-5", quantity: 2 };
const waiting = { orderId: "o-1", status: "AWAITING_DEPOSIT" };

test("AC-08-10: before reserving there is no box or caption and the hint line shows", () => {
  assert.deepEqual(placedView(null, null, "opt-5", 2), { box: false, held: false, hint: true });
});

test("AC-08-10: back from deposit with the same option and quantity shows the box and the caption, not the hint", () => {
  assert.deepEqual(placedView(placed, waiting, "opt-5", 2), { box: true, held: true, hint: false });
});

test("AC-08-10: changing the quantity or option after reserving drops the caption but keeps the box", () => {
  assert.deepEqual(placedView(placed, waiting, "opt-5", 3), { box: true, held: false, hint: false });
  assert.deepEqual(placedView(placed, waiting, "opt-10", 2), { box: true, held: false, hint: false });
});

test("AC-08-10: while the order is still loading the just-made reservation is shown", () => {
  assert.deepEqual(placedView(placed, null, "opt-5", 2), { box: true, held: true, hint: false });
  // 다른 주문의 낡은 응답은 읽은 것으로 보지 않는다
  assert.equal(placedView(placed, { orderId: "o-0", status: "CANCELED" }, "opt-5", 2).box, true);
});

test("AC-08-10 AC-09-7: a canceled or expired order hides the box and the caption", () => {
  for (const status of ["CANCELED", "REFUNDED", "RESERVED"]) {
    const v = placedView(placed, { orderId: "o-1", status }, "opt-5", 2);
    assert.equal(v.box, false, status);
    assert.equal(v.held, false, status);
    assert.equal(v.hint, false, status);
  }
});
