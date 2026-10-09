// SCR-13 주문 내역 (FEAT-10) — design: scr-13
import { allPages, orders, type Order } from "@farmclub/api";
import {
  Button,
  EmptyState,
  LargeTitle,
  Photo,
  Screen,
  Scroll,
  Skeleton,
  T,
  md,
  period,
  tokens,
  useLiveList,
  won,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { STATUS_LABEL } from "../../../lib/orderText";
import { useSession } from "../../../lib/session";
import {
  orderGroups,
  orderGroup,
  selectedOrderGroup,
  compareOrders,
} from "../../../lib/orderGroups";

function headline(o: Order) {
  if (o.actions.includes("respondDeliveryWindow"))
    return "받는 시기 변경 · 답해 주세요";
  if (o.actions.includes("confirm")) return "배송 완료 · 구매 확정해 주세요";
  return STATUS_LABEL[o.status];
}
function subline(o: Order) {
  if (o.proposedDeliveryWindow)
    return `새 기간 ${period(o.proposedDeliveryWindow.start, o.proposedDeliveryWindow.end)} · ${won(o.totalAmount)}`;
  if (o.status === "DELIVERED" || o.status === "COMPLETED")
    return `${md(o.deliveredAt)} 받음 · ${won(o.totalAmount)}`;
  if (o.status === "REFUNDED")
    return `${md(o.refundedAt)} 환불 · ${won(o.totalAmount)}`;
  return `${period(o.deliveryWindow.start, o.deliveryWindow.end)} 도착 · ${won(o.totalAmount)}`;
}

export default function OrderList() {
  const router = useRouter();
  const { user } = useSession();
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const selected = selectedOrderGroup(filter);
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(
    (cancelled: () => boolean) =>
      allPages((cursor) => orders.list({ limit: 50, cursor }), cancelled).then(
        (items) =>
          items.filter((o) => orderGroup(o) !== null).sort(compareOrders),
      ),
    [],
  );
  const list = useLiveList(load, user?.userId ?? "", active && !!user, 8000);
  const items = list.data?.filter((o) => orderGroup(o) === selected);
  const groupCounts = list.data
    ? Object.fromEntries(
        orderGroups.map((group) => [
          group.value,
          list.data.filter((o) => orderGroup(o) === group.value).length,
        ]),
      )
    : null;
  const selectedGroupLabel =
    orderGroups.find((group) => group.value === selected)?.label ?? "";

  const row = (o: Order, i: number) => (
    <Pressable
      key={o.orderId}
      accessibilityRole="link"
      onPress={() => router.push(`/orders/${o.orderId}`)}
      style={{
        flexDirection: "row",
        gap: 16,
        paddingVertical: 16,
        borderTopWidth: i === 0 ? 0 : 1,
        borderTopColor: tokens.color.border,
      }}
    >
      <Photo
        uri={o.photo}
        width={tokens.thumb.summary}
        height={tokens.thumb.summary}
        alt={o.productName}
        kind="product"
      />
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="body" weight="bold" muted={o.status === "REFUNDED"}>
          {headline(o)}
        </T>
        <T variant="body">
          {o.productName} {o.optionLabel} × {o.quantity}
        </T>
        <T variant="sub" muted>
          {subline(o)}
        </T>
      </View>
    </Pressable>
  );

  return (
    <Screen>
      <LargeTitle
        title="내 주문"
        subtitle="예약부터 받는 날까지, 한눈에 확인해요"
      />
      <View style={{ paddingVertical: 20 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {orderGroups.map((group) => (
            <Pressable
              key={group.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: selected === group.value }}
              aria-selected={selected === group.value}
              onPress={() => router.setParams({ filter: group.value })}
              style={{
                minHeight: 48,
                paddingHorizontal: 16,
                borderRadius: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor:
                  selected === group.value
                    ? tokens.color.text
                    : tokens.color.surface,
              }}
            >
              <T
                variant="sub"
                weight="semibold"
                color={selected === group.value ? "white" : tokens.color.text}
              >
                {group.label}
              </T>
              <T
                variant="caption"
                color={
                  selected === group.value ? "white" : tokens.color.textMuted
                }
              >
                {groupCounts?.[group.value] ?? "—"}
              </T>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Scroll bottom={tokens.height.tabBarClearance}>
        {list.error ? (
          <View style={{ padding: 20 }}>
            <T color={tokens.color.error}>{list.error}</T>
            <Button label="다시 시도" variant="text" onPress={list.retry} />
          </View>
        ) : null}
        {list.loading ? (
          <Skeleton width="90%" height={88} style={{ margin: 20 }} />
        ) : null}
        {items?.length === 0 ? (
          <EmptyState
            icon="box"
            title={
              list.data?.length
                ? `${selectedGroupLabel} 주문이 없어요`
                : "아직 예약한 상품이 없어요"
            }
            action={
              !list.data?.length ? (
                <Button
                  label="홈으로"
                  variant="text"
                  onPress={() => router.replace("/")}
                  style={{ alignSelf: "center" }}
                />
              ) : undefined
            }
          />
        ) : null}
        <View style={{ paddingHorizontal: 20 }}>{items?.map(row)}</View>
      </Scroll>
    </Screen>
  );
}
