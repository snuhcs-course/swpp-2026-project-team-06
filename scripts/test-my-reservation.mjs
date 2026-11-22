// DEV-379 (SCR-04 '알아 둘 세 줄', FEAT-07 AC-07-10): 이 상품을 이미 예약한 사람에게는 '지금 예약하면 n번째예요' 대신
// '이미 예약했어요 · 내 예약 보기 ›'. 판단은 내 주문 목록(GET /api/orders?productId=)의 상태만 본다
// (apps/consumer/src/lib/myReservation.ts). 주문이 하나면 그 주문 상세, 둘 이상이면 내 주문 목록.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  MyReservationError,
  isReservedOrder,
  myReservationHref,
  myReservationLine,
} from "../apps/consumer/src/lib/myReservation.ts";
import { orderGroup } from "../apps/consumer/src/lib/orderGroups.ts";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });

let seq = 0;
const api = (method, path, token, body) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": `dev379-${++seq}` },
  });
const login = async (userId) =>
  (await api("POST", "/api/auth/test-login", null, { userId, app: "consumer" })).body.accessToken;
/** 앱과 같이 이 상품 주문을 페이지 끝까지 읽는다 */
async function productOrders(token, productId, limit = 50) {
  const items = [];
  let cursor = "";
  do {
    const q = `productId=${productId}&limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await api("GET", `/api/orders?${q}`, token);
    assert.equal(res.status, 200);
    items.push(...res.body.items);
    cursor = res.body.nextCursor ?? "";
  } while (cursor);
  return items;
}

const o = (status, orderId = `o-${status}`, productId = "p-house") => ({ orderId, productId, status });

test("DEV-379 AC-07-10: statuses that count as already reserved", () => {
  for (const s of ["AWAITING_DEPOSIT", "RESERVED", "PREPARING", "SHIPPED", "DELIVERED", "COMPLETED"])
  {
    assert.equal(isReservedOrder({ status: s }), true, s);
    // 목록 탭 고르기는 orderGroups와 같아야 한다(구매 확정만 '확정')
    assert.equal(orderGroup({ status: s }), s === "COMPLETED" ? "confirmed" : "pending", s);
  }
  // 취소(입금 전 종료·기한 만료 포함)·환불·옛 일부 환불·입금 안내 전은 'n번째' 그대로
  for (const s of ["CANCELED", "REFUNDED", "PARTIALLY_REFUNDED", "PENDING_PAYMENT"])
    assert.equal(isReservedOrder({ status: s }), false, s);
});

test("DEV-379 AC-07-10: no order or only canceled/refunded orders keep the 'n번째' line", () => {
  assert.equal(myReservationHref([], "p-house"), null);
  assert.equal(myReservationHref([o("CANCELED"), o("REFUNDED")], "p-house"), null);
  // 다른 상품 주문은 세지 않는다(옛 서버가 productId를 무시해도 앱이 다시 거른다)
  assert.equal(myReservationHref([o("RESERVED", "o-x", "p-noji")], "p-house"), null);
});

test("DEV-379 AC-07-10: one order opens its detail, two or more open my orders", () => {
  assert.equal(myReservationHref([o("AWAITING_DEPOSIT", "o-1")], "p-house"), "/orders/o-1");
  assert.equal(myReservationHref([o("RESERVED", "o-1"), o("CANCELED", "o-2")], "p-house"), "/orders/o-1");
  // 같은 탭(미확정)이면 그 탭, 둘 다 구매 확정이면 '확정' 탭, 탭이 갈리면 기본 탭
  assert.equal(myReservationHref([o("RESERVED", "o-1"), o("AWAITING_DEPOSIT", "o-2")], "p-house"), "/orders?filter=pending");
  assert.equal(myReservationHref([o("COMPLETED", "o-1"), o("COMPLETED", "o-2")], "p-house"), "/orders?filter=confirmed");
  assert.equal(myReservationHref([o("RESERVED", "o-1"), o("COMPLETED", "o-2")], "p-house"), "/orders");
});

test("DEV-379 Mock: 김민지 has reserved p-house (detail) and only a refund on p-redhyang", async () => {
  reset();
  const minji = await login("u-minji");
  const house = await productOrders(minji, "p-house");
  assert.deepEqual(house.map((x) => [x.orderId, x.status]), [["o-42", "RESERVED"]]);
  assert.equal(myReservationHref(house, "p-house"), "/orders/o-42");

  const red = await productOrders(minji, "p-redhyang");
  assert.deepEqual(red.map((x) => x.status), ["REFUNDED"]);
  assert.equal(myReservationHref(red, "p-redhyang"), null);

  // 다른 소비자의 같은 상품 주문은 섞이지 않는다
  const seojun = await login("u-seojun");
  const theirs = await productOrders(seojun, "p-house");
  assert.ok(theirs.length > 0 && theirs.every((x) => x.productId === "p-house"));
  assert.ok(!theirs.some((x) => x.orderId === "o-42"));
});

test("DEV-379 Mock: a second p-house order (awaiting deposit) sends 김민지 to my orders, across pages", async () => {
  reset();
  const minji = await login("u-minji");
  const created = await api("POST", "/api/orders", minji, {
    productId: "p-house",
    optionId: "opt-5",
    quantity: 1,
    recipientName: "Test",
    recipientPhone: "010-1111-2222",
    postalCode: "12345",
    address: "Test address",
    consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
    consentVersion: "test",
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const deposit = await api("POST", `/api/orders/${created.body.orderId}/deposit`, minji, {});
  assert.equal(deposit.status, 200, JSON.stringify(deposit.body));

  const house = await productOrders(minji, "p-house", 1);
  assert.deepEqual(new Set(house.map((x) => x.orderId)), new Set(["o-42", created.body.orderId]));
  assert.equal(myReservationHref(house, "p-house"), "/orders?filter=pending");

  // 그 새 주문을 취소하면 다시 하나 → 그 주문 상세
  const cancel = await api("POST", `/api/orders/${created.body.orderId}/cancel`, minji, {});
  assert.equal(cancel.status, 200);
  assert.equal(myReservationHref(await productOrders(minji, "p-house"), "p-house"), "/orders/o-42");
});

test("DEV-379: what the first line shows before, during and after reading my orders", () => {
  const key = "u-minji:p-house";
  const base = {
    soldOut: false,
    sessionReady: true,
    hasToken: true,
    userId: "u-minji",
    key,
    answer: null,
    error: null,
  };
  const line = (x) => myReservationLine({ ...base, ...x });
  const checking = { state: "checking" };
  const reserved = { state: "reserved", href: "/orders/o-42" };

  // 로그인 안 함(세션 확인 끝, 토큰 없음): 'n번째'
  assert.equal(line({ hasToken: false, userId: null }), null);
  // 세션 확인 전: 저장된 토큰이 있으면 높이만, 없으면 'n번째'
  assert.deepEqual(line({ sessionReady: false, userId: null }), checking);
  assert.equal(line({ sessionReady: false, hasToken: false, userId: null }), null);
  // 세션 확인 뒤 응답 전: 높이만
  assert.deepEqual(line({}), checking);
  // 답: 이미 예약 → 링크, 예약 없음 → 'n번째'
  assert.deepEqual(line({ answer: { key, href: "/orders/o-42" } }), reserved);
  assert.equal(line({ answer: { key, href: null } }), null);
  // 지금 키의 실패: 'n번째'
  assert.equal(line({ error: new MyReservationError(key) }), null);
  // 다른 키(계정·상품이 바뀐 직후)의 옛 답·옛 실패, 멈춘 읽기: 높이만('n번째'가 끼지 않음)
  assert.deepEqual(line({ answer: { key: "u-seojun:p-house", href: "/orders/o-38" } }), checking);
  assert.deepEqual(line({ error: new MyReservationError("u-minji:p-noji") }), checking);
  assert.deepEqual(line({ error: new MyReservationError(null) }), checking);
  // 다시 읽는 중·다시 읽기 실패: 앞 답 그대로
  assert.deepEqual(line({ answer: { key, href: "/orders/o-42" }, error: new MyReservationError(key) }), reserved);
  // 품절: 보조 줄 없음(무엇이 와도)
  assert.equal(line({ soldOut: true, answer: { key, href: "/orders/o-42" } }), null);
  assert.equal(line({ soldOut: true, sessionReady: false }), null);
});
