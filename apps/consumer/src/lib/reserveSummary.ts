// 예약 관문 시트(UX ⑤)와 주문서 상품 줄이 같은 모양으로 쓰는 ‘고른 것’ 요약(DEV-356, FEAT-01 AC-01-21).
// 날짜 도우미는 화면에서 넘겨받아 이 파일은 순수 함수로 둔다(scripts/test-reserve-summary.mjs).
import type { ProductDetail } from "@farmclub/api";

type SummaryProduct = Pick<
  ProductDetail,
  "name" | "farmName" | "options" | "stages" | "currentStageId" | "deliveryWindow"
>;

/** 상품 이름에서 옵션 표기를 뺀 짧은 이름(‘하우스 감귤 5kg / 10kg’ → ‘하우스 감귤’). 주문서 상품 줄과 같다 */
export const shortName = (name: string) =>
  name.split(" / ")[0].replace(/\s\d+kg$/, "");

/** ‘하우스 감귤 5kg × 2’ */
export const productLine = (name: string, optionLabel: string, quantity: number) =>
  `${shortName(name)} ${optionLabel} × ${quantity}`;

/** 관문의 next(‘/products/p-house’)에서 상품 ID. 상품 화면이 아니면 null */
export function productIdFromNext(next: string | null | undefined): string | null {
  const m = /^\/products\/([^/?#]+)/.exec(next ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

export type ReserveSummary = {
  title: string;
  sub: string;
  /** 지금 기간 가격 × 수량(주문서의 ‘상품 금액’, 배송비 제외). 지금 예약 기간이 없거나 가격이 없으면 null(금액을 지어내지 않음, M-24) */
  amount: number | null;
};

/** 고른 옵션·수량 요약. 옵션을 못 찾거나 수량이 1보다 작으면 null(카드를 그리지 않음) */
export function reserveSummary(
  p: SummaryProduct,
  optionId: string | undefined,
  quantity: string | number | undefined,
  period: (start: string, end: string) => string,
): ReserveSummary | null {
  const opt = p.options.find((o) => o.optionId === optionId);
  const qty = Number(quantity);
  if (!opt || !Number.isInteger(qty) || qty < 1) return null;
  const stage = p.stages.find((s) => s.stageId === p.currentStageId);
  const unit = stage?.options[opt.optionId]?.price;
  // 지금 예약 기간이 없으면 주문서 상품 줄처럼 받는 시기를 말하지 않는다(그 줄은 ‘지금은 예약 기간이 아니에요’)
  const when = stage && p.deliveryWindow?.start && p.deliveryWindow?.end
    ? ` · ${period(p.deliveryWindow.start, p.deliveryWindow.end)} 도착`
    : "";
  return {
    title: productLine(p.name, opt.label, qty),
    sub: `${p.farmName}${when}`,
    amount: unit ? unit * qty : null,
  };
}
