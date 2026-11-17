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

/** 배송 현황 줄의 상품 줄 조각. 줄에서는 상품명만 줄이고 ‘옵션 × 수량’은 끝까지 보인다(AC-17-10) */
export function orderItemParts(o: Omit<WhoFields, "recipientName">) {
  return {
    name: shortProductName(o.productName ?? "", o.optionLabel),
    tail: `${o.optionLabel} × ${o.quantity}`,
  };
}

/** 배송 현황 줄의 상품 줄: "하우스 감귤 5kg × 2"(상품명 속 옵션 목록은 빼고) */
export function orderItem(o: Omit<WhoFields, "recipientName">) {
  const { name, tail } = orderItemParts(o);
  return `${name ? `${name} ` : ""}${tail}`;
}

/** 입금 대기 줄의 입금자명(DEV-342). 짧은 입금 코드, 없는 옛 주문은 주문 번호 */
export function depositorName(o: Pick<ProducerOrder, "depositCode" | "orderNo">) {
  return o.depositCode ?? o.orderNo;
}

/**
 * 입금 대기 줄 ‘채팅하기’로 열 때 입력칸에 미리 넣는 글(DEV-342, PM 11/17). 보내지는 않는다.
 * "주문하신 하우스 감귤 5kg(28,000원) 입금 확인이 안되네요. …" — 상품명 + 옵션 + 합계(배송비 포함)원.
 * 은행에 찍힌 입금자명은 넣지 않는다(농가가 아는 값이 아니고, 소비자에게 되묻는 글이다).
 */
export function depositCheckMessage(
  o: Pick<ProducerOrder, "productName" | "optionLabel" | "totalAmount">,
) {
  const name = shortProductName(o.productName ?? "", o.optionLabel);
  const item = [name, o.optionLabel].filter(Boolean).join(" ");
  const amount = `${o.totalAmount.toLocaleString("ko-KR")}원`;
  return `주문하신 ${item}(${amount}) 입금 확인이 안되네요. 혹시 입금하셨다면 입금자명과 입금 시각을 알려주세요.`;
}
