import {
  allPages,
  catalog,
  serverNow,
  type MyProduct,
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
  useAsync,
  useLiveList,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { optionBoxesFromProduct, optionBoxesLine } from "../../../lib/optionBoxes";
import { HelpButton } from "../../../lib/Tour";
import { useSession } from "../../../lib/session";
import {
  productGroup,
  productGroups,
  productStatus,
  draftSaved,
} from "../../../lib/productGroups";
/**
 * DEV-300: 카드 물량 줄 = 옵션마다 '5kg 24박스 · 10kg 18박스'(예약+출하, 모든 기간 합).
 * 목록 카드에는 옵션별 값이 없어 상품 상세를 한 번 읽는다. 목록은 8초마다 다시 읽지만
 * 상세는 그 상품의 예약·출하 g·version이 바뀔 때만 다시 읽는다. 읽기 전·실패면 예전 kg 줄.
 */
function SalesLine({ product }: { product: MyProductCard }) {
  const detail = useAsync(
    () => catalog.myProduct(product.productId),
    [
      product.productId,
      product.reservedGrams,
      product.shippedGrams,
      product.version,
    ],
  );
  // 다시 읽는 동안 이전 줄을 유지해 kg 줄로 깜박이지 않게 한다
  const [last, setLast] = useState<MyProduct | null>(null);
  useEffect(() => {
    if (detail.data) setLast(detail.data);
  }, [detail.data]);
  // 다시 읽다 실패하면 옛 박스 줄 대신 kg 줄(아래 kg 줄과 같은 시점 값)
  const p = detail.error ? null : (detail.data ?? last);
  const line =
    p && p.options.length
      ? optionBoxesLine(optionBoxesFromProduct(p.options, p.stages))
      : "";
  return line ? (
    <T variant="sub" numberOfLines={1}>
      {line}
    </T>
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
                gap: 4,
              }}
            >
              <SalesLine product={product} />
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
