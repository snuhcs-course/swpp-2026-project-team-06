// SCR-29 주문 줄·시트의 ‘누구 · 무엇’(DEV-226, AC-17-10). 순수 함수라 scripts/test-producer-order-rows.mjs가 바로 읽는다.
import type { ProducerOrder } from "@farmclub/api";

export type WhoFields = Pick<
  ProducerOrder,
  "recipientName" | "productName" | "optionLabel" | "quantity"
>;

/** 한 줄에서 줄일 수 있는 건 상품명뿐이다. 이름과 옵션 × 수량은 출하에 필요해 끝까지 보인다 */
export function orderWhoParts(o: WhoFields) {
  return {
    head: `${o.recipientName} · `,
    name: o.productName?.trim() ?? "",
    tail: `${o.optionLabel} × ${o.quantity}`,
  };
}

/** "김민지 · 하우스 감귤 5kg × 1" — 시트·화면 읽기 라벨용 전체 글자 */
export function orderWho(o: WhoFields) {
  const { head, name, tail } = orderWhoParts(o);
  return `${head}${name ? `${name} ` : ""}${tail}`;
}
