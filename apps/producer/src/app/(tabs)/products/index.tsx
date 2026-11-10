import {
  allPages,
  catalog,
  serverNow,
  type MyProductCard,
} from "@farmclub/api";
import {
  Button,
  EmptyState,
  Fab,
  LargeTitle,
  Photo,
  Screen,
  Scroll,
  Skeleton,
  T,
  md,
  time,
  tokens,
  useLiveList,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { OptionBoxRow } from "../../../lib/OptionBoxRow";
import { optionBoxesFromCard } from "../../../lib/optionBoxes";
import { HelpButton } from "../../../lib/Tour";
import { useSession } from "../../../lib/session";
import {
  productGroup,
  productGroups,
  productStatus,
  draftSaved,
} from "../../../lib/productGroups";
/**
 * DEV-300: 카드 물량 = 옵션마다 '5kg  32,000원   24박스 / 72박스'(가격은 지금 판매 기간, 박스는 모든 기간 합).
 * 목록 카드(`GET /api/products/mine`)의 `options`를 바로 쓴다(카드마다 상세를 읽지 않는다). 옵션이 없으면 예전 kg 줄.
 */
function SalesLine({ product }: { product: MyProductCard }) {
  // 앱이 서버보다 먼저 배포되면 옛 카드에는 options가 없다 → kg 줄
  const rows = optionBoxesFromCard(product.options ?? []);
  return rows.length ? (
    <View style={{ gap: tokens.space.xs }}>
      {rows.map((row) => (
        <OptionBoxRow key={row.optionId} row={row} />
      ))}
    </View>
  ) : (
    <T variant="sub">
      예약 중 {product.reservedGrams / 1000}kg · 출하{" "}
      {product.shippedGrams / 1000}kg
    </T>
  );
}

export default function Products() {
  const router = useRouter(),
    { filter } = useLocalSearchParams<{ filter?: string }>(),
    { user } = useSession();
  const selected =
    productGroups.find((group) => group.value === filter) ?? productGroups[0];
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(
    (cancelled: () => boolean) =>
      allPages((cursor) => catalog.mine({ limit: 50, cursor }), cancelled).then(
        (items) => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),
    [],
  );
  const list = useLiveList(load, user?.userId ?? "", active && !!user, 8000);
  const items = list.data?.filter(
    (item) => productGroup(item) === selected.value,
  );
  return (
    <Screen>
      <LargeTitle
        title="상품"
        right={<HelpButton />}
      />
      <View style={{ paddingVertical: tokens.space.md }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {productGroups.map((group) => (
            <Pressable
              key={group.value}
              accessibilityRole="tab"
              aria-selected={group.value === selected.value}
              onPress={() => router.setParams({ filter: group.value })}
              style={{
                minHeight: 48,
                paddingHorizontal: 16,
                borderRadius: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor:
                  group.value === selected.value
                    ? tokens.color.text
                    : tokens.color.surface,
              }}
            >
              <T
                variant="sub"
                weight="semibold"
                color={
                  group.value === selected.value ? "white" : tokens.color.text
                }
              >
                {group.label}
              </T>
              <T
                variant="caption"
                color={
                  group.value === selected.value
                    ? "white"
                    : tokens.color.textMuted
                }
              >
                {list.data
                  ? list.data.filter(
                      (item) => productGroup(item) === group.value,
                    ).length
                  : "—"}
              </T>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Scroll bottom={176}>
        {list.error ? (
          <View style={{ padding: 20 }}>
            <T color={tokens.color.error}>{list.error}</T>
            <Button label="다시 시도" variant="text" onPress={list.retry} />
          </View>
        ) : null}
        {list.loading ? (
          <Skeleton height={160} width="90%" style={{ margin: 20 }} />
        ) : null}
        {items?.length === 0 ? (
          <EmptyState
            icon="box"
            title={
              list.data?.length
                ? `${selected.label} 상품이 없어요`
                : "첫 상품을 등록해 보세요"
            }
            body={
              list.data?.length
                ? "다른 상태를 선택해 상품을 확인해요."
                : "쓰던 판매 문구로 간편하게 시작해요."
            }
          />
        ) : null}
        {items?.map((product) => (
          <View
            key={product.productId}
            style={{
              marginHorizontal: 20,
              marginBottom: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: tokens.radius.md,
              gap: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${product.name || "이름 없는 초안"} 편집`}
              onPress={() => router.push(`/products/${product.productId}/edit`)}
              style={{ flexDirection: "row", gap: 16, minHeight: 64 }}
            >
              <Photo
                uri={product.photo}
                width={64}
                height={64}
                kind="product"
                alt={product.name}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <T
                  variant="caption"
                  weight="semibold"
                  color={
                    product.status === "REJECTED"
                      ? tokens.color.error
                      : tokens.color.textMuted
                  }
                >
                  {productStatus(product)}
                </T>
                <T weight="semibold" numberOfLines={2}>
                  {product.name || "이름 없는 초안"}
                </T>
                {/* 이름 없는 초안끼리 가르는 마지막 저장 시각(DEV-226, HE-X5) */}
                {product.status === "DRAFT" && draftSaved(product.updatedAt, { md, time }, serverNow()) ? (
                  <T variant="caption" muted numberOfLines={1}>
                    {draftSaved(product.updatedAt, { md, time }, serverNow())}
                  </T>
                ) : null}
                {product.pendingCapacityRequest?.kind === "INCREASE" ? (
                  <T variant="caption" muted>
                    물량 추가 심사 중
                  </T>
                ) : null}
              </View>
            </Pressable>
            {product.rejectReason && product.status === "REJECTED" ? (
              <T variant="sub" color={tokens.color.error}>
                {product.rejectReason}
              </T>
            ) : null}
            <View
              style={{
                backgroundColor: tokens.color.surface,
                borderRadius: 12,
                padding: 12,
                gap: tokens.space.sm,
              }}
            >
              <SalesLine product={product} />
              {/* 11/10 인터뷰: kg 총량은 보조(meta 12 회색) */}
              <T variant="caption" muted>
                승인 {product.approvedSupplyGrams / 1000}kg · 추가 예약 가능{" "}
                {product.remainingGrams / 1000}kg
              </T>
            </View>
            <Button label="판매페이지 수정" variant="outline" onPress={() => router.push(`/products/${product.productId}/detail`)} />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button
                label="판매 설정"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() =>
                  router.push(`/products/${product.productId}/sales`)
                }
              />
              <Button
                label="기간·가격"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() =>
                  router.push(`/products/${product.productId}/stages`)
                }
              />
            </View>
          </View>
        ))}
      </Scroll>
      <Fab
        label="새 상품"
        testID="new-product"
        onPress={() => router.push("/products/new")}
      />
    </Screen>
  );
}
