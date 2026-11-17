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
 * 홈 카드 ‘29,000원~’(DEV-348): 지금 기간 가격이 있는 옵션 중 가장 싼 값과 옵션이 둘 이상인지.
 * 상세 응답에서 계산할 뿐 새 API 필드가 아니다. 지금 기간이 없으면 null.
 */
export function lowestPrice(
  product: ProductDetail,
): { price: number; several: boolean } | null {
  const cur = product.stages.find((s) => s.stageId === product.currentStageId);
  if (!cur) return null;
  const prices = product.options
    .map((o) => cur.options[o.optionId]?.price)
    .filter((v): v is number => typeof v === "number");
  if (!prices.length) return null;
  return { price: Math.min(...prices), several: prices.length > 1 };
}

/** Enrich a visible list with bounded requests; do not retain stale account data. */
export async function productPrices(
  products: ProductCard[],
  cancelled = () => false,
) {
  const result: (ProductCard & {
    referencePrice?: number | null;
    /** 옵션 중 가장 싼 지금 가격과 옵션이 둘 이상인지(홈 카드 ‘~’, DEV-348) */
    lowest?: { price: number; several: boolean } | null;
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
            lowest: lowestPrice(detail),
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
