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

// 상품명 끝의 옵션 목록("5kg / 10kg")이 옵션 줄과 겹치면 뗀다(DEV-294, Figma 배송 현황 1:74)
const UNIT = "(?:kg|g|개|과|입|박스|box)";
const TRAILING_OPTIONS = new RegExp(
  `\\s+[\\d.]+\\s*${UNIT}(?:\\s*/\\s*[\\d.]+\\s*${UNIT})*\\s*$`,
  "i",
);

/** 상품명 끝 옵션 목록에 이 주문 옵션이 있으면 그 목록을 뗀 이름. 아니면 그대로 */
export function shortProductName(name: string, optionLabel: string) {
  const trimmed = name.trim();
  const m = trimmed.match(TRAILING_OPTIONS);
  if (!m || !optionLabel) return trimmed;
  const listed = m[0].split("/").map((s) => s.replace(/\s+/g, "").toLowerCase());
  const base = trimmed.slice(0, m.index).trim();
  return base && listed.includes(optionLabel.replace(/\s+/g, "").toLowerCase())
    ? base
    : trimmed;
}

/** 배송 현황 줄의 상품 줄: "하우스 감귤 5kg × 2"(상품명 속 옵션 목록은 빼고) */
export function orderItem(o: Omit<WhoFields, "recipientName">) {
  const name = shortProductName(o.productName ?? "", o.optionLabel);
  return `${name ? `${name} ` : ""}${o.optionLabel} × ${o.quantity}`;
}
