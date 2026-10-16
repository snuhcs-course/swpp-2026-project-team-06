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

/** Enrich a visible list with bounded requests; do not retain stale account data. */
export async function productPrices(
  products: ProductCard[],
  cancelled = () => false,
) {
  const result: (ProductCard & { referencePrice?: number | null })[] = [];
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
