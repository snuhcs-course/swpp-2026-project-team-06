// 예약 관문 시트의 ‘고른 것’ 카드(DEV-268 UX ⑤, DEV-356, FEAT-01 AC-01-21).
// 관문이 이미 넘기는 next(/products/:id)·data(optionId·quantity)로 상품을 읽어 주문서 상품 줄과 같은 모양으로 그린다.
// 상품을 못 읽으면 카드만 빼고 시트는 그대로 둔다.
import { catalog } from "@farmclub/api";
import { Photo, T, period, tokens, useAsync, won } from "@farmclub/ui";
import { View } from "react-native";

import { productIdFromNext, reserveSummary } from "./reserveSummary";

const card = {
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  padding: 12,
  borderRadius: tokens.radius.md,
  borderWidth: 1,
  borderColor: tokens.color.border,
  backgroundColor: tokens.color.background,
} as const;

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
  // 읽는 동안에는 같은 테두리의 빈 자리(한 줄 카드 높이 74)로 시트 높이가 덜 튀게 한다. 못 읽었거나 그릴 게 없으면 자리째 뺀다
  if (!p && productId && product.loading)
    return <View testID="gate-summary-loading" style={[card, { height: 74 }]} />;
  if (!p || !s) return null;
  return (
    <View testID="gate-summary" style={card}>
      <Photo uri={p.photo} width={48} height={48} radius={8} alt={p.name} kind="product" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="body" weight="semibold" numberOfLines={1}>
          {s.title}
        </T>
        <T variant="sub" muted numberOfLines={2}>
          {s.sub}
        </T>
      </View>
      {/* 배송비를 뺀 금액이라 총액으로 읽히지 않게 위에 ‘상품 금액’(주문서와 같은 이름) */}
      {s.amount != null ? (
        <View style={{ flexShrink: 0, alignItems: "flex-end" }}>
          <T variant="caption" muted>
            상품 금액
          </T>
          <T variant="body" weight="bold">
            {won(s.amount)}
          </T>
        </View>
      ) : null}
    </View>
  );
}
