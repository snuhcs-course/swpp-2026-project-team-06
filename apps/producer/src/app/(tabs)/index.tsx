// SCR-22 현황 (FEAT-14, R-15, 결정 24·30, D-03·D-21·D-22) — design: p-scr-22. 출하 처리 버튼은 없다(할 일 ‘출하할 주문’이 대신)
import { farms, orders, type Dashboard } from "@farmclub/api";
import {
  Button,
  Icon,
  Photo,
  Screen,
  Scroll,
  Skeleton,
  T,
  maskName,
  md,
  mdw,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { LoadError, ORDER_STATUS, PhotoShade, TODAY } from "../../lib/views";

function Todo({
  n,
  label,
  onPress,
  first,
  last,
}: {
  n: number;
  label: string;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label} ${n}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        minHeight: tokens.height.listRowProducer,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderBottomWidth: last ? 1 : 0,
        borderColor: tokens.color.border,
      }}
    >
      <T
        weight="bold"
        style={{
          fontSize: tokens.fontSize.display,
          lineHeight: tokens.fontSize.display,
          letterSpacing: -1,
          width: 64,
        }}
      >
        {n}
      </T>
      <T variant="body" weight="semibold" style={{ flex: 1 }}>
        {label}
      </T>
      <Icon name="chevron" size={24} color={tokens.color.textMuted} />
    </Pressable>
  );
}

type DashStage = Dashboard["stages"][number];

/** 단계 하나: 옵션별 예약 박스 / 물량 막대(D-03). 막대마다 화면 읽기 라벨(D-22) */
function StageRow({ s }: { s: DashStage }) {
  const muted = !s.current;
  return (
    <View
      style={{
        gap: 12,
        padding: 18,
        borderRadius: 20,
        backgroundColor: s.current ? "#F3F0E8" : tokens.color.surface,
      }}
    >
      <T variant="sub" weight={s.current ? "bold" : "semibold"} muted={muted}>
        {s.stageName}
        {s.current ? " · 지금" : ""}
      </T>
      {s.options.map((o) => {
        const pct = o.quantity
          ? Math.min(100, Math.round((o.reserved / o.quantity) * 100))
          : 0;
        const label = [
          s.current ? `${s.stageName}, 현재 예약 기간` : s.stageName,
          `${o.label} ${won(o.price)}`,
          `${o.quantity}박스 중 ${o.reserved}박스 예약`,
          s.current ? `${md(s.endsAt)}까지` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <View
            key={o.optionId}
            style={{ gap: 4 }}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={label}
            accessibilityValue={{ min: 0, max: o.quantity, now: o.reserved }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <T variant="sub" muted={muted}>
                {o.label}
              </T>
              <T variant="sub" muted={muted}>
                <T
                  variant="sub"
                  weight={s.current ? "bold" : "regular"}
                  muted={muted}
                >
                  {o.reserved}
                </T>{" "}
                / {o.quantity}박스
              </T>
            </View>
            <View
              style={{
                height: 6,
                borderRadius: 999,
                backgroundColor: tokens.color.border,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  backgroundColor: tokens.color.text,
                }}
              />
            </View>
          </View>
        );
      })}
      {s.current ? (
        <T variant="sub" muted>
          {md(s.endsAt)}까지 ·{" "}
          {s.options
            .map(
              (o) => `${o.label} ${Math.max(0, o.quantity - o.reserved)}박스`,
            )
            .join(", ")}{" "}
          남음
        </T>
      ) : null}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const dash = useAsync(() => orders.dashboard(), []);
  const farm = useAsync(() => farms.mine(), []);
  useFocusEffect(
    useCallback(() => {
      void dash.reload();
      void farm.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const d = dash.data;
  const total = d
    ? d.todo.openQuestions + d.todo.toShip + d.todo.pendingProducts
    : 0;
  const product = d?.product ?? null;
  const hasPhoto = !!farm.data?.photo;
  const onTop = hasPhoto ? "#FFFFFF" : tokens.color.text;

  return (
    <Screen>
      <Scroll bottom={tokens.height.tabBarClearance}>
        <View
          style={{
            height: 200,
            position: "relative",
            backgroundColor: tokens.color.surface,
          }}
        >
          {hasPhoto ? (
            <Photo
              uri={farm.data?.photo}
              width="100%"
              height={200}
              radius={0}
              kind="farm"
              alt={`${farm.data?.name ?? ""} 사진`}
            />
          ) : null}
          {hasPhoto ? <PhotoShade height={200} from={0.05} /> : null}
          <View
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              bottom: 16,
              gap: 4,
            }}
          >
            <T variant="heading" color={onTop} accessibilityRole="header">
              {farm.data?.name ?? ""}
            </T>
            <T
              variant="sub"
              color={onTop}
              style={{ opacity: hasPhoto ? 0.88 : 1 }}
            >
              {mdw(TODAY)}
              {d ? ` · 오늘 할 일 ${total}` : ""}
            </T>
          </View>
        </View>

        {dash.error && !d ? (
          <LoadError error={dash.error} onRetry={dash.reload} />
        ) : null}
        {!d && !dash.error ? (
          <Skeleton width="90%" height={180} style={{ margin: 20 }} />
        ) : null}

        {d ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Todo
                n={d.todo.openQuestions}
                label="답변이 필요한 대화"
                onPress={() => router.push("/chats?view=private&needsReply=1")}
                first
              />
              <Todo
                n={d.todo.toShip}
                label="출하할 주문"
                onPress={() => router.push("/ship")}
              />
              <Todo
                n={d.todo.pendingProducts}
                label="승인 대기 상품"
                onPress={() => router.push("/products?filter=review")}
                last
              />
            </View>

            <View style={{ paddingHorizontal: 20, paddingTop: 40, gap: 16 }}>
              <View>
                <T variant="heading" accessibilityRole="header">
                  예약 수량
                </T>
                {product ? (
                  <T variant="sub" muted>
                    {product.productName} · {product.reservedCount}명 예약,{" "}
                    {product.orderCount}건
                  </T>
                ) : null}
              </View>
              {product ? (
                <>
                  <View style={{ paddingVertical: 16, gap: 6 }}>
                    <T weight="semibold">
                      예약 중 {product.reservedGrams / 1000}kg · 출하 완료{" "}
                      {product.shippedGrams / 1000}kg
                    </T>
                    <T variant="sub" muted>
                      승인 {product.approvedSupplyGrams / 1000}kg · 판매 한도{" "}
                      {product.salesLimitGrams / 1000}kg
                    </T>
                    <T variant="sub" muted>
                      추가 예약 가능 {product.remainingGrams / 1000}kg
                    </T>
                  </View>
                  {d.stages.map((s) => (
                    <StageRow key={s.stageName} s={s} />
                  ))}
                </>
              ) : (
                <View style={{ gap: 4 }}>
                  <T variant="sub" muted>
                    판매 중인 상품이 없어요
                  </T>
                  <Button
                    label="새 상품 만들기"
                    variant="text"
                    onPress={() => router.push("/products/new")}
                    style={{ alignSelf: "flex-start" }}
                  />
                </View>
              )}
            </View>

            <View style={{ paddingHorizontal: 20, paddingTop: 40 }}>
              <T
                variant="heading"
                accessibilityRole="header"
                style={{ marginBottom: 8 }}
              >
                최근 예약
              </T>
              {d.recentOrders.length === 0 ? (
                <T variant="sub" muted style={{ paddingVertical: 8 }}>
                  아직 예약이 없어요
                </T>
              ) : (
                d.recentOrders.map((o, i) => (
                  <View
                    key={o.orderId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      minHeight: tokens.height.listRowProducer,
                      paddingVertical: 8,
                      borderTopWidth: 1,
                      borderBottomWidth:
                        i === d.recentOrders.length - 1 ? 1 : 0,
                      borderColor: tokens.color.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <T variant="sub" weight="semibold">
                        {maskName(o.buyerName)} · {o.optionLabel} × {o.quantity}
                      </T>
                      <T variant="sub" muted>
                        {md(o.createdAt)} · {o.region}
                      </T>
                    </View>
                    <T variant="sub" weight="semibold">
                      {ORDER_STATUS[o.status]}
                    </T>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}
      </Scroll>
    </Screen>
  );
}
