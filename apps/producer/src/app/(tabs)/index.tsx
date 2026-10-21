// SCR-22 / FEAT-14: order and shipping management only.
import { allPages, farms, orders } from "@farmclub/api";
import {
  BrandHeader,
  Button,
  ListRow,
  Screen,
  Scroll,
  Skeleton,
  T,
  tokens,
  useAsync,
  useLiveList,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useSession } from "../../lib/session";
import { LoadError } from "../../lib/views";

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const [active, setActive] = useState(false);
  const dash = useAsync(() => orders.dashboard(), [user?.userId]);
  const farm = useAsync(() => farms.mine(), [user?.userId]);
  const load = useCallback(
    (cancelled: () => boolean) =>
      allPages(
        (cursor) => orders.producerOrders({ limit: 50, cursor }),
        cancelled,
      ),
    [],
  );
  const list = useLiveList(load, user?.userId ?? "", active && !!user);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      void dash.reload();
      void farm.reload();
      return () => setActive(false);
    }, [dash.reload, farm.reload]),
  );
  const data = list.data;
  const metrics = [
    {
      label: "전체 주문",
      count: data?.length,
      hint: "입금 대기 포함",
      tab: "all",
    },
    {
      label: "예약 완료",
      count: data?.filter((o) => o.status === "RESERVED").length,
      hint: "입금이 확인된 주문",
      tab: "RESERVED",
    },
    {
      label: "출하 준비",
      count: data?.filter((o) => o.status === "PREPARING").length,
      hint: "택배사·송장 입력",
      tab: "PREPARING",
    },
    {
      label: "출하",
      count: data?.filter((o) => o.status === "SHIPPED").length,
      hint: "발송한 주문",
      tab: "SHIPPED",
    },
  ];
  const product = dash.data?.product;
  return (
    <Screen>
      <BrandHeader title="농가 현황" logo="icon" />
      <Scroll bottom={tokens.height.tabBarClearance}>
        <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
          <T variant="sub" muted>
            {farm.data?.name ?? "우리 농가"} ·{" "}
            {new Date().toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
            })}
          </T>
          <T variant="heading">주문·배송 현황</T>
          {/* 할 일(DEV-68): 기존 환경설정과 같은 ListRow */}
          {dash.data &&
          (dash.data.todo.hasAccount === false ||
            dash.data.todo.awaitingDeposit ||
            dash.data.todo.refundsToSettle) ? (
            <View>
              {dash.data.todo.hasAccount === false ? (
                <ListRow
                  label="입금 계좌를 등록해 주세요"
                  sub="소비자가 예약할 때 이 계좌로 직접 입금해요"
                  onPress={() => router.push("/farm/account")}
                />
              ) : null}
              {dash.data.todo.awaitingDeposit ? (
                <ListRow
                  label={`입금 확인할 주문 ${dash.data.todo.awaitingDeposit}건`}
                  sub="통장과 대조한 뒤 입금 확인을 눌러 주세요"
                  onPress={() => router.push("/ship?status=AWAITING_DEPOSIT")}
                />
              ) : null}
              {dash.data.todo.refundsToSettle ? (
                <ListRow
                  label={`환불 보낼 주문 ${dash.data.todo.refundsToSettle}건`}
                  sub="입금했던 계좌로 보낸 뒤 환불했다고 기록해요"
                  onPress={() => router.push("/ship?status=REFUNDED")}
                  last
                />
              ) : null}
            </View>
          ) : null}
          {list.error ? (
            <>
              <T color={tokens.color.error}>{list.error}</T>
              <Button label="다시 시도" onPress={list.retry} />
            </>
          ) : null}
          {list.loading && !data ? (
            <Skeleton width="100%" height={284} />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
              {metrics.map((m) => (
                <Pressable
                  key={m.label}
                  accessibilityRole="link"
                  accessibilityLabel={`${m.label} ${m.count ?? 0}건`}
                  onPress={() => router.push(`/ship?status=${m.tab}`)}
                  style={{
                    width: "47%",
                    flexGrow: 1,
                    minWidth: 0,
                    minHeight: 132,
                    padding: 16,
                    gap: 8,
                    borderRadius: 16,
                    backgroundColor: tokens.color.surface,
                  }}
                >
                  <T variant="sub" weight="semibold">
                    {m.label}
                  </T>
                  <T variant="display" numberOfLines={1}>
                    {(m.count ?? 0).toLocaleString("ko-KR")}
                  </T>
                  <T variant="caption" muted>
                    {m.hint}
                  </T>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              label="주문 현황"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push("/ship?status=all")}
            />
            <Button
              label="배송 현황"
              style={{ flex: 1 }}
              onPress={() => router.push("/ship?status=PREPARING")}
            />
          </View>
          {dash.error ? (
            <LoadError error={dash.error} onRetry={dash.reload} />
          ) : null}
          {product ? (
            <>
              <View
                style={{
                  padding: 16,
                  gap: 16,
                  borderRadius: 16,
                  backgroundColor: tokens.color.surface,
                }}
              >
                <T weight="semibold">예약·출하 물량</T>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T variant="heading" numberOfLines={1}>
                      {(product.reservedGrams / 1000).toLocaleString()}kg
                    </T>
                    <T variant="sub" muted>
                      예약 중
                    </T>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T variant="heading" numberOfLines={1}>
                      {(product.shippedGrams / 1000).toLocaleString()}kg
                    </T>
                    <T variant="sub" muted>
                      출하 완료
                    </T>
                  </View>
                </View>
              </View>
              <T variant="sub" muted>
                {product.productName}
              </T>
            </>
          ) : !dash.loading ? (
            <T muted>판매 중인 상품이 없어요</T>
          ) : null}
        </View>
      </Scroll>
    </Screen>
  );
}
