import type { MyProductCard } from "@farmclub/api";
export const productGroups = [
  { value: "selling", label: "판매 중" },
  { value: "review", label: "심사 중" },
  { value: "draft", label: "작성 중" },
  { value: "paused", label: "판매 중지" },
  { value: "ended", label: "판매 종료" },
] as const;
export type ProductGroup = (typeof productGroups)[number]["value"];
export function productGroup(
  product: Pick<MyProductCard, "status" | "salesPaused" | "availability">,
): ProductGroup {
  if (product.status === "CLOSED") return "ended";
  if (product.status === "PENDING_APPROVAL") return "review";
  if (product.status === "DRAFT" || product.status === "REJECTED")
    return "draft";
  if (product.salesPaused || product.availability === "PAUSED") return "paused";
  return product.availability === "ENDED" ? "ended" : "selling";
}
export function productStatus(product: MyProductCard): string {
  if (product.status === "REJECTED") return "수정 필요";
  const group = productGroup(product);
  if (group === "selling") {
    if (product.availability === "NOT_OPEN")
      return "예약 대기 · 판매 기간 확인";
    if (product.availability === "TOTAL_SOLD_OUT") return "전체 물량 품절";
    if (product.availability === "PERIOD_SOLD_OUT") return "현재 기간 품절";
  }
  return productGroups.find((item) => item.value === group)!.label;
}

/** 서울 날짜 "2026-11-04" */
const seoulDay = (t: number) =>
  new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 작성 중 카드의 마지막 저장(DEV-226, HE-X5). 오늘·어제는 시각까지, 그 전은 날짜만 */
export function draftSaved(
  updatedAt: string | null | undefined,
  f: { md: (iso: string) => string; time: (iso: string) => string },
  now = Date.now(),
): string | null {
  if (!updatedAt) return null;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null;
  const recent =
    seoulDay(t) === seoulDay(now) || seoulDay(t) === seoulDay(now - 86400000);
  return recent
    ? `${f.md(updatedAt)} ${f.time(updatedAt)} 저장`
    : `${f.md(updatedAt)} 저장`;
}
