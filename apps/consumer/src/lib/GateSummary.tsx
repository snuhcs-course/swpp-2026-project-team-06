// 예약 관문 시트의 ‘고른 것’ 카드(DEV-268 UX ⑤, DEV-356, FEAT-01 AC-01-21).
// 관문이 이미 넘기는 next(/products/:id)·data(optionId·quantity)로 상품을 읽어 주문서 상품 줄과 같은 모양으로 그린다.
// 상품을 못 읽으면 카드만 빼고 시트는 그대로 둔다.
import { catalog } from "@farmclub/api";
import { Photo, T, period, tokens, useAsync, won } from "@farmclub/ui";
import { View } from "react-native";

import { productIdFromNext, reserveSummary } from "./reserveSummary";

export function GateSummary({
  next,
  optionId,
  quantity,
}: {
  next: string;
  optionId?: string;
  quantity?: string;
}) {
  const productId = productIdFromNext(next);
  const product = useAsync(
    () => (productId ? catalog.product(productId) : Promise.resolve(null)),
    [productId],
  );
  const p = product.data;
  const s = p ? reserveSummary(p, optionId, quantity, period) : null;
  if (!p || !s) return null;
  return (
    <View
      testID="gate-summary"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: tokens.color.border,
        backgroundColor: tokens.color.background,
      }}
    >
      <Photo uri={p.photo} width={48} height={48} radius={8} alt={p.name} kind="product" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="body" weight="semibold" numberOfLines={1}>
          {s.title}
        </T>
        <T variant="sub" muted numberOfLines={2}>
          {s.sub}
        </T>
      </View>
      {s.amount != null ? (
        <T variant="body" weight="bold" style={{ flexShrink: 0 }}>
          {won(s.amount)}
        </T>
      ) : null}
    </View>
  );
}
