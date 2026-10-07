// SCR-13 주문 내역 (FEAT-10) — design: scr-13
import { allPages, orders, type Order } from "@farmclub/api";
import {
  Button,
  EmptyState,
  LargeTitle,
  Photo,
  Screen,
  Scroll,
  Section,
  Skeleton,
  T,
  md,
  period,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { STATUS_LABEL } from "../../../lib/orderText";
import { LoadError } from "../../../lib/views";

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
  const { data, error, loading, reload } = useAsync(
    () =>
      allPages((cursor) => orders.list({ limit: 50, cursor })).then(
        (items) => ({ items }),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const items = data?.items ?? [];
  const todo = items.filter(
    (o) =>
      o.actions.includes("confirm") ||
      o.actions.includes("respondDeliveryWindow"),
  );
  const rest = items.filter((o) => !todo.includes(o));

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
      <Scroll bottom={tokens.height.tabBarClearance}>
        <LargeTitle
          title="내 주문"
          subtitle="예약부터 받는 날까지, 한눈에 확인해요"
        />
        {error && !data ? <LoadError error={error} onRetry={reload} /> : null}
        {loading && !data ? (
          <Skeleton width="90%" height={88} style={{ margin: 20 }} />
        ) : null}
        {data && items.length === 0 ? (
          <EmptyState
            icon="box"
            title="아직 예약한 상품이 없어요"
            action={
              <Button
                label="홈으로"
                variant="text"
                onPress={() => router.replace("/")}
                style={{ alignSelf: "center" }}
              />
            }
          />
        ) : null}
        {todo.length ? (
          <Section
            title={`미확정 주문 ${todo.length}`}
            style={{ paddingTop: 32 }}
          >
            {<View>{todo.map(row)}</View>}
          </Section>
        ) : null}
        {rest.length ? (
          <Section title="모든 주문">{<View>{rest.map(row)}</View>}</Section>
        ) : null}
      </Scroll>
    </Screen>
  );
}
