// DEV-342 (FEAT-09 AC-09-11~13, R-28 · FEAT-12 AC-12-17): 짧은 입금자명과 입금 대기 주문 ‘채팅하기’.
// packages/api/src/depositCode.ts(서버 server/app/orders/deposit_code.py와 같은 규칙), Mock 입금 안내·생산자 대화 시작,
// apps/producer/src/lib/orderWho.ts의 미리 넣는 글을 본다(화면은 scripts/e2e/deposit-code.spec.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { depositCodeName, pickDepositCode } from "../packages/api/src/depositCode.ts";
import { depositCheckMessage, depositorName } from "../apps/producer/src/lib/orderWho.ts";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/packages/api/src/mock/index.js");
const { db, reset, configureMockStorage } = require("../.expo/mock-build/packages/api/src/mock/db.js");
configureMockStorage({ read: () => null, write: () => {} });

let seq = 0;
const api = (method, path, token, body, key = `dc-test-${++seq}`) =>
  mockTransport({
    method,
    path,
    body,
    headers: { Authorization: token ? `Bearer ${token}` : "", "Idempotency-Key": key },
  });
/** 입금자명 이름은 닉네임 앞 3글자(PM 11/17). 테스트 계정 닉네임을 정해 둔다 */
function nicknames() {
  db().users["u-minji"].nickname = "김민지";
  db().users["u-seojun"].nickname = "이서준";
}
const login = async (userId, app) =>
  (await api("POST", "/api/auth/test-login", null, { userId, app })).body.accessToken;
const input = (extra = {}) => ({
  productId: "p-house",
  optionId: "opt-5",
  quantity: 1,
  recipientName: "김민지",
  recipientPhone: "010-1111-2222",
  postalCode: "12345",
  address: "Test address",
  consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
  consentVersion: "test",
  ...extra,
});
async function awaiting(token, extra) {
  const created = await api("POST", "/api/orders", token, input(extra));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const r = await api("POST", `/api/orders/${created.body.orderId}/deposit`, token, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

test("AC-09-12 (Mock): the code uses the nickname's first 3 letters, never the real or recipient name", async () => {
  reset();
  db().users["u-minji"].name = "김실명";
  db().users["u-minji"].nickname = "귤사랑해요";
  const minji = await login("u-minji", "consumer");
  const code = (await awaiting(minji, { recipientName: "받는분" })).depositCode;
  assert.match(code, /^귤사랑\d{2}$/);
  assert.ok(!code.includes("실명") && !code.includes("받는분"));
  // 닉네임이 없으면 가림 이름(이름 앞 글자)
  db().users["u-minji"].nickname = null;
  assert.match((await awaiting(minji)).depositCode, /^김\d{2}$/);
});

test("AC-09-13 (Mock): an unpaid canceled order's code stays reserved for 3 days after its deadline", async () => {
  reset();
  nicknames();
  const minji = await login("u-minji", "consumer");
  const first = await awaiting(minji);
  await api("POST", `/api/orders/${first.orderId}/cancel`, minji, {});
  const taken = new Set([first.depositCode]);
  for (let i = 0; i < 5; i += 1) {
    const next = await awaiting(minji);
    assert.ok(!taken.has(next.depositCode), "a fresh cancel's code is not reused");
    taken.add(next.depositCode);
  }
});

test("AC-12-18 (Mock): a buyer who does not follow the farm sees and answers a chat the producer opened from their order", async () => {
  reset();
  const seojun = await login("u-seojun", "consumer");
  const order = await awaiting(seojun, { recipientName: "이서준" });
  const kang = await login("u-kang", "producer");
  const started = await api("POST", "/api/messaging/producer/chats", kang, { orderId: order.orderId });
  assert.equal(started.status, 200);
  const sent = await api("POST", "/api/messaging/producer/chats/u-seojun/messages", kang, { text: "입금 시각을 알려주세요" });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const list = (await api("GET", "/api/messaging/chats", seojun)).body.items;
  assert.ok(list.some((c) => c.farmId === "f-kang"));
  const page = await api("GET", "/api/messaging/chats/f-kang/messages", seojun);
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.ok(page.body.items.some((m) => m.body.includes("입금 시각")));
  // 생산자 쪽 문맥은 연결 주문이 아니다: 보통 메시지로 답한다
  assert.deepEqual(page.body.orders, []);
  const reply = await api("POST", "/api/messaging/chats/f-kang/messages", seojun, { text: "3시에 보냈어요" });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  // 메시지에 붙이는 주문은 결제한 주문만(입금 대기 주문은 연결 주문이 되지 않게 거절)
  const withOrder = await api("POST", "/api/messaging/chats/f-kang/messages", seojun, { text: "주문도 같이", orderId: order.orderId });
  assert.equal(withOrder.status, 404);
  assert.deepEqual((await api("GET", "/api/messaging/chats/f-kang/messages", seojun)).body.orders, []);
});

test("AC-09-12: name cleanup, 3-letter name and fallbacks match the server rule", () => {
  assert.equal(depositCodeName("귤 사랑"), "귤사랑");
  assert.equal(depositCodeName("귤사랑해요"), "귤사랑");
  assert.equal(depositCodeName("귤🍊러버"), "귤러버");
  assert.equal(depositCodeName("Christopher"), "Chr");
  assert.equal(depositCodeName("user123"), "use");
  assert.equal(depositCodeName("김○○"), "김");
  assert.equal(depositCodeName("☆"), "주문");
  assert.equal(depositCodeName(null), "주문");
  const first = (free) => free[0];
  assert.equal(pickDepositCode("귤사랑", new Set(), first), "귤사랑00");
  const two = new Set(Array.from({ length: 100 }, (_, n) => `김민지${String(n).padStart(2, "0")}`));
  assert.equal(pickDepositCode("김민지", two, first), "김민지000");
  const every = new Set([...two, ...Array.from({ length: 1000 }, (_, n) => `김민지${String(n).padStart(3, "0")}`)]);
  assert.equal(pickDepositCode("김민지", every, first), null);
  // 대소문자를 가리지 않는다(은행이 대문자로 바꾸기도 함)
  assert.equal(pickDepositCode("Kim", new Set(["KIM00"]), first), "Kim01");
});

test("AC-09-11/13 (Mock): deposit gives the nickname's first 3 letters + 2 digits, unique among the farm's awaiting orders", async () => {
  reset();
  nicknames();
  const minji = await login("u-minji", "consumer");
  const a = await awaiting(minji);
  const b = await awaiting(minji);
  assert.match(a.depositCode, /^김민지\d{2}$/);
  assert.match(b.depositCode, /^김민지\d{2}$/);
  assert.notEqual(a.depositCode, b.depositCode);
  assert.match(a.orderNo, /^FC-\d{4}-\d{4}$/);
  // 입금 안내 전에는 없다
  const fresh = await api("POST", "/api/orders", minji, input());
  assert.equal(fresh.body.depositCode, null);
  // 생산자 줄에도 같은 값
  const kang = await login("u-kang", "producer");
  const rows = (await api("GET", "/api/orders/producer?status=AWAITING_DEPOSIT", kang)).body.items;
  assert.equal(rows.find((r) => r.orderId === a.orderId).depositCode, a.depositCode);
  assert.equal(depositorName(rows.find((r) => r.orderId === a.orderId)), a.depositCode);
  // 옛 주문(입금자명 없음)은 주문 번호
  assert.equal(depositorName({ depositCode: null, orderNo: "FC-1007-0042" }), "FC-1007-0042");
});

test("AC-12-17 (Mock): a producer may open a chat from an own-farm order only", async () => {
  reset();
  const minji = await login("u-minji", "consumer");
  const order = await awaiting(minji);
  const kang = await login("u-kang", "producer");
  const started = await api("POST", "/api/messaging/producer/chats", kang, { orderId: order.orderId });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.consumerId, "u-minji");
  const mismatch = await api("POST", "/api/messaging/producer/chats", kang, {
    orderId: order.orderId,
    consumerId: "u-seojun",
  });
  assert.equal(mismatch.status, 404);
  // 다른 승인 농가(u-misook의 f-wimi를 승인 상태로 둔다)
  db().farms["f-wimi"].status = "APPROVED";
  const misook = await login("u-misook", "producer");
  const other = await api("POST", "/api/messaging/producer/chats", misook, { orderId: order.orderId });
  assert.equal(other.status, 404);
  assert.equal(db().threadMeta["f-wimi:u-minji"], undefined);
  const unpaid = await api("POST", "/api/orders", minji, input());
  const hidden = await api("POST", "/api/messaging/producer/chats", kang, { orderId: unpaid.body.orderId });
  assert.equal(hidden.status, 404);
  const empty = await api("POST", "/api/messaging/producer/chats", kang, {});
  assert.equal(empty.status, 400);
});

test("DEV-342: the prefilled chat text names the product, option and total like the PM example", () => {
  assert.equal(
    depositCheckMessage({ productName: "하우스 감귤", optionLabel: "5kg", totalAmount: 28000 }),
    "주문하신 하우스 감귤 5kg(28,000원) 입금 확인이 안되네요. 혹시 입금하셨다면 입금자명과 입금 시각을 알려주세요.",
  );
  // Mock은 상품명 끝에 옵션 목록이 붙어 온다. 겹치는 목록은 뗀다
  assert.equal(
    depositCheckMessage({ productName: "하우스 감귤 5kg / 10kg", optionLabel: "10kg", totalAmount: 1234567 }),
    "주문하신 하우스 감귤 10kg(1,234,567원) 입금 확인이 안되네요. 혹시 입금하셨다면 입금자명과 입금 시각을 알려주세요.",
  );
});

test("AC-12-17/18 (Mock): only awaiting orders open a chat, and a follower's chat is not switched to order mode", async () => {
  reset();
  const minji = await login("u-minji", "consumer"); // 강씨네 귤밭 팔로워
  const kang = await login("u-kang", "producer");
  const order = await awaiting(minji);
  const before = (await api("GET", "/api/messaging/chats/f-kang/messages", minji)).body.orders;
  const started = await api("POST", "/api/messaging/producer/chats", kang, { orderId: order.orderId });
  assert.equal(started.status, 200);
  assert.equal((db().threadOrderContexts ?? []).find((c) => c.orderId === order.orderId)?.source, "PRODUCER");
  const after = (await api("GET", "/api/messaging/chats/f-kang/messages", minji)).body.orders;
  assert.deepEqual(after, before);
  // 입금 확인된(지난) 주문으로는 열지 않는다
  await api("POST", `/api/orders/${order.orderId}/confirm-deposit`, kang, {});
  const reserved = await api("POST", "/api/messaging/producer/chats", kang, { orderId: order.orderId });
  assert.equal(reserved.status, 404);
});
