import { catalog } from "./endpoints";
import type { ProductCard, ProductDetail } from "./types";

export function referencePrice(
  product: ProductDetail,
  optionId = product.options[0]?.optionId,
): number | null {
  const option = product.options.find((o) => o.optionId === optionId);
  if (
    product.soldOut ||
    !option ||
    product.remainingGrams < Math.round(option.weightKg * 1000)
  )
    return null;
  const current = product.stages.find(
    (s) => s.stageId === product.currentStageId,
  )?.options[optionId];
  const last = product.stages.reduce<
    ProductDetail["stages"][number] | undefined
  >((latest, s) => (!latest || s.seq > latest.seq ? s : latest), undefined)
    ?.options[optionId];
  return current &&
    last &&
    current.quantity > current.reservedCount &&
    last.price > current.price
    ? last.price
    : null;
}

/** referencePrice와 같은 ‘지금 살 수 있음’ 조건: 상품이 예약 가능하고, 남은 g이 한 상자 이상이고, 이번 기간 물량이 남음 */
function buyable(product: ProductDetail, optionId: string): boolean {
  const option = product.options.find((o) => o.optionId === optionId);
  const current = product.stages.find((s) => s.stageId === product.currentStageId)
    ?.options[optionId];
  return (
    !product.soldOut &&
    !!option &&
    !!current &&
    product.remainingGrams >= Math.round(option.weightKg * 1000) &&
    current.quantity > current.reservedCount
  );
}

/**
 * 홈 카드 ‘29,000원~’(DEV-348): 지금 살 수 있는 옵션이 둘 이상이고 카드 가격(첫 옵션 = currentPrice)이 그중 가장 쌀 때만 ‘~’(부터).
 * 첫 옵션을 살 수 없으면(이번 기간 품절·남은 g 부족) 취소선 referencePrice와 같이 붙이지 않는다(리뷰 반영). 새 API 필드 없음.
 */
export function priceFrom(product: ProductDetail): boolean {
  const cur = product.stages.find((s) => s.stageId === product.currentStageId);
  const first = product.options[0];
  if (!cur || !first || !buyable(product, first.optionId)) return false;
  const prices = product.options
    .filter((o) => buyable(product, o.optionId))
    .map((o) => cur.options[o.optionId]?.price)
    .filter((v): v is number => typeof v === "number");
  const firstPrice = cur.options[first.optionId]?.price;
  return prices.length > 1 && firstPrice != null && firstPrice <= Math.min(...prices);
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

/**
 * 홈 카드 ‘이 가격 D-n’(리뷰 반영, DEV-348): 서버 dDay는 지금 기간 끝까지다. 다음 기간도 첫 옵션 가격이 같으면
 * 가격은 그 뒤까지 그대로라, 같은 가격이 이어지는 마지막 기간의 끝까지로 늘린다(상세 계단 ‘지금 · ○월 ○일까지’와 같은 날).
 * 홈이 이미 읽는 상세 응답으로만 계산하고, 못 읽으면 카드는 서버 dDay를 그대로 쓴다. 지금 기간이 없으면 null
 */
export function priceDDay(product: ProductDetail): number | null {
  const first = product.options[0];
  if (product.dDay == null || !first) return null;
  const sorted = [...product.stages].sort((a, b) => a.seq - b.seq);
  const at = sorted.findIndex((s) => s.stageId === product.currentStageId);
  if (at < 0) return null;
  const price = sorted[at].options[first.optionId]?.price;
  let last = at;
  while (
    price != null &&
    last + 1 < sorted.length &&
    sorted[last + 1].options[first.optionId]?.price === price
  )
    last++;
  return product.dDay + dayNumber(sorted[last].endsAt) - dayNumber(sorted[at].endsAt);
}

/** Enrich a visible list with bounded requests; do not retain stale account data. */
export async function productPrices(
  products: ProductCard[],
  cancelled = () => false,
) {
  const result: (ProductCard & {
    referencePrice?: number | null;
    /** 옵션이 둘 이상이고 카드 가격이 가장 싸면 ‘~’(DEV-348) */
    priceFrom?: boolean;
    /** 같은 가격이 이어지는 마지막 기간 끝까지 남은 날(‘이 가격 D-n’, DEV-348). 없으면 서버 dDay */
    priceDDay?: number | null;
  })[] = [];
  for (let i = 0; i < products.length && !cancelled(); i += 4) {
    const batch = await Promise.all(
      products.slice(i, i + 4).map(async (product) => {
        if (product.soldOut) return product;
        try {
          const detail = await catalog.product(product.productId);
          return {
            ...product,
            currentPrice: detail.currentPrice,
            soldOut: detail.soldOut,
            referencePrice: referencePrice(detail),
            priceFrom: priceFrom(detail),
            priceDDay: priceDDay(detail),
          };
        } catch {
          // Comparison is optional; the original card remains usable on failure.
          return product;
        }
      }),
    );
    result.push(...batch);
  }
  return result;
}
