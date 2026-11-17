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

/**
 * 홈 카드 ‘29,000원~’(DEV-348): 지금 기간 가격이 있는 옵션이 둘 이상이고 카드 가격(첫 옵션 = currentPrice)이 그중 가장 쌀 때만 ‘~’(부터).
 * 첫 옵션이 가장 싸지 않으면 ‘부터’가 거짓이라 붙이지 않는다. 취소선(referencePrice)도 첫 옵션 기준이라 둘이 맞는다. 새 API 필드 없음.
 */
export function priceFrom(product: ProductDetail): boolean {
  const cur = product.stages.find((s) => s.stageId === product.currentStageId);
  const first = product.options[0];
  if (!cur || !first) return false;
  const prices = product.options
    .map((o) => cur.options[o.optionId]?.price)
    .filter((v): v is number => typeof v === "number");
  const firstPrice = cur.options[first.optionId]?.price;
  return prices.length > 1 && firstPrice != null && firstPrice <= Math.min(...prices);
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
