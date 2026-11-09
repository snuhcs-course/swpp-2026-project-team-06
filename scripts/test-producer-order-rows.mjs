// DEV-226 (FEAT-17 AC-17-10, SCR-29 · SCR-23 HE-X5): 생산자 주문 줄의 ‘이름 · 상품명 옵션 × 수량’과 초안 저장 시각
// apps/producer/src/lib/orderWho.ts, productGroups.ts draftSaved. 순수 함수만 본다(화면은 order-row-identity.spec.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { orderItem, orderItemParts, orderWho, orderWhoParts, shortProductName } from "../apps/producer/src/lib/orderWho.ts";
import { draftSaved } from "../apps/producer/src/lib/productGroups.ts";
import { md, time } from "../packages/ui/src/format.ts";

const house = { recipientName: "김민지", productName: "하우스 감귤", optionLabel: "5kg", quantity: 1 };
const field = { ...house, productName: "노지 감귤" };

test("AC-17-10: order rows name the product between the buyer and option × quantity", () => {
  assert.equal(orderWho(house), "김민지 · 하우스 감귤 5kg × 1");
  assert.notEqual(orderWho(house), orderWho(field));
});

test("AC-17-10: only the product name may be shortened; name and option × quantity stay whole", () => {
  const long = { ...house, productName: "서귀포 타이벡 노지 감귤 고당도 선별", quantity: 3 };
  const p = orderWhoParts(long);
  assert.equal(p.head, "김민지 · ");
  assert.equal(p.name, "서귀포 타이벡 노지 감귤 고당도 선별");
  assert.equal(p.tail, "5kg × 3");
  // 화면 읽기·시트는 줄이지 않은 전체 글자
  assert.equal(orderWho(long), `${p.head}${p.name} ${p.tail}`);
});

test("AC-17-10: a missing product name falls back to the old line without a double space", () => {
  assert.equal(orderWho({ ...house, productName: "" }), "김민지 · 5kg × 1");
});

test("AC-17-10 DEV-294: the item line drops an option list from the product name only when it repeats the option", () => {
  const listed = { productName: "하우스 감귤 5kg / 10kg", optionLabel: "5kg", quantity: 2 };
  assert.equal(orderItem(listed), "하우스 감귤 5kg × 2");
  assert.equal(orderItem({ ...listed, optionLabel: "10kg", quantity: 1 }), "하우스 감귤 10kg × 1");
  // 상품끼리는 계속 갈린다
  assert.notEqual(orderItem(listed), orderItem({ ...listed, productName: "노지 감귤 5kg / 10kg" }));
  // 옵션이 이름 속 목록에 없으면 이름을 그대로 둔다
  assert.equal(shortProductName("하우스 감귤 3kg", "5kg"), "하우스 감귤 3kg");
  // 이름이 옵션뿐이면 지우지 않는다
  assert.equal(shortProductName("5kg", "5kg"), "5kg");
  assert.equal(orderItem({ productName: "", optionLabel: "5kg", quantity: 1 }), "5kg × 1");
  assert.equal(orderItem({ productName: "한라봉", optionLabel: "3kg", quantity: 1 }), "한라봉 3kg × 1");
  // 줄에서는 상품명 조각만 줄인다. ‘옵션 × 수량’은 따로 끝까지 보인다
  const long = orderItemParts({ productName: "서귀포 타이벡 노지 감귤 고당도 선별 5kg / 10kg", optionLabel: "10kg", quantity: 3 });
  assert.deepEqual(long, { name: "서귀포 타이벡 노지 감귤 고당도 선별", tail: "10kg × 3" });
});

const NOW = Date.parse("2026-11-04T06:00:00Z"); // 11월 4일 15:00 KST
const f = { md, time };

test("DEV-226 SCR-23: drafts saved today or yesterday show the time", () => {
  assert.equal(draftSaved("2026-11-04T05:20:00Z", f, NOW), "11월 4일 오후 2:20 저장");
  assert.equal(draftSaved("2026-11-03T00:05:00Z", f, NOW), "11월 3일 오전 9:05 저장");
});

test("DEV-226 SCR-23: older drafts show only the date, using Seoul days", () => {
  assert.equal(draftSaved("2026-10-30T05:00:00Z", f, NOW), "10월 30일 저장");
  // 11월 2일 14:59 UTC = 11월 2일 23:59 KST → 그저께
  assert.equal(draftSaved("2026-11-02T14:59:00Z", f, NOW), "11월 2일 저장");
  // 11월 2일 15:00 UTC = 11월 3일 00:00 KST → 어제
  assert.equal(draftSaved("2026-11-02T15:00:00Z", f, NOW), "11월 3일 오전 12:00 저장");
  assert.equal(draftSaved(null, f, NOW), null);
});
