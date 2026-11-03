// 주문서(SCR-10) 예약 전 동의 항목 (R-03 4개 + 개인정보 제3자 제공, DEV-120). 항목을 늘리면 이 목록만 고친다(DEV-138).
// 타입·Mock 검사·주문서 화면이 이 목록에서 계산하고, scripts/test-order-consents.mjs가 서버 Consents 필드와 같은지 본다.
// Node가 이 파일을 그대로 읽으므로(type stripping) import·enum 없이 지울 수 있는 타입만 쓴다.
export const ORDER_CONSENT_KEYS = [
  "deliveryWindow",
  "delayRefund",
  "shortage",
  "cancelPolicy",
  /** 개인정보 제3자 제공(판매자 농가) 동의(DEV-120, 개인정보보호법 제17조) */
  "thirdParty",
] as const;

export type OrderConsentKey = (typeof ORDER_CONSENT_KEYS)[number];
export type OrderConsents = Record<OrderConsentKey, boolean>;

/** 모든 항목이 같은 값인 동의 묶음(초기값 false, ‘모두 동의해요’) */
export function orderConsents(value: boolean): OrderConsents {
  return Object.fromEntries(ORDER_CONSENT_KEYS.map((k) => [k, value])) as OrderConsents;
}

/** 동의한 항목 수 */
export function agreedCount(c: Partial<OrderConsents> | undefined): number {
  return ORDER_CONSENT_KEYS.filter((k) => c?.[k] === true).length;
}

/** 모든 항목에 동의했는지 */
export function allOrderConsents(c: Partial<OrderConsents> | undefined): boolean {
  return agreedCount(c) === ORDER_CONSENT_KEYS.length;
}
