// SCR-12 주문 완료 (FEAT-09, 06) — design: scr-12, s-12-detailfail
import { farms, orders } from "@farmclub/api";
import {
  Button,
  FollowButton,
  Icon,
  Screen,
  Scroll,
  T,
  period,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

import { useHideTabBar } from "../../../../lib/session";
import { useToast } from "../../../../lib/toast";
import { Avatar, copyText } from "../../../../lib/views";

export default function Done() {
  useHideTabBar();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const {
    data: o,
    error,
    reload,
  } = useAsync(() => orders.get(orderId), [orderId]);
  const farm = useAsync(
    () => (o ? farms.get(o.farmId) : Promise.resolve(null)),
    [o?.farmId],
  );
  const [busy, setBusy] = useState(false);
  const toast = useToast(40);
  // 팔로우 권유 카드는 처음부터 팔로우 중이면 숨긴다(D-01). 여기서 팔로우하면 카드는 남기고 ‘팔로잉’으로 바꾼다
  const [showFollow, setShowFollow] = useState<boolean | null>(null);
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    if (farm.data && showFollow === null) {
      setShowFollow(!farm.data.isFollowing);
      setFollowing(farm.data.isFollowing);
    }
  }, [farm.data, showFollow]);

  async function toggleFollow() {
    const f = farm.data;
    if (!f) return;
    const on = !following;
    setBusy(true);
    try {
      const r = on
        ? await farms.follow(f.farmId)
        : await farms.unfollow(f.farmId);
      setFollowing(r.following);
      if (!on) toast.show("팔로우를 끊었어요");
    } catch (e) {
      toast.fail(e, () => void toggleFollow());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Scroll bottom={60}>
        <View style={{ paddingHorizontal: 20, paddingTop: 64, gap: 8 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              backgroundColor: tokens.color.text,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check" size={28} color="#FFFFFF" />
          </View>
          <T
            variant="title"
            style={{ marginTop: 16 }}
            accessibilityRole="header"
          >
            예약 완료
          </T>
          <T variant="body">
            {o
              ? `${period(o.deliveryWindow.start, o.deliveryWindow.end)} 사이에 받아요.`
              : "예약은 완료됐어요."}
          </T>
        </View>

        {o ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
            <KV k="주문 번호">
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <T variant="body">{o.orderNo}</T>
                <Button
                  label="복사"
                  variant="text"
                  onPress={async () =>
                    (await copyText(o.orderNo)) &&
                    toast.show("주문 번호를 복사했어요")
                  }
                />
              </View>
            </KV>
            <KV
              k="상품"
              v={`${o.productName} ${o.optionLabel} × ${o.quantity}`}
            />
            <KV k="합계" v={won(o.totalAmount)} bold />
            <KV k="배송지" v={`${o.recipientName} · ${o.address}`} last />
          </View>
        ) : error ? (
          // 결제는 끝났고 상세 조회만 실패 → 완료 화면 유지, 다시 시도
          <View
            style={{
              margin: 20,
              marginTop: 32,
              padding: 24,
              borderRadius: 16,
              backgroundColor: tokens.color.surface,
              alignItems: "center",
              gap: 8,
            }}
          >
            <T variant="body" weight="semibold" center>
              주문 내용을 불러오지 못했어요
            </T>
            <T variant="sub" muted center>
              잠시 뒤 다시 시도해 주세요. 주문 내역에서도 볼 수 있어요.
            </T>
            <Button
              label="다시 시도"
              variant="outline"
              onPress={reload}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : null}

        {farm.data && showFollow ? (
          <View
            style={{
              margin: 20,
              marginTop: 40,
              padding: 20,
              borderRadius: 16,
              backgroundColor: tokens.color.surface,
              gap: 16,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <Avatar
                uri={farm.data.photo}
                name={farm.data.name}
                size={tokens.thumb.summary}
              />
              <View style={{ flex: 1 }}>
                <T variant="body" weight="semibold">
                  {farm.data.name}을 팔로우할까요?
                </T>
                <T variant="sub" muted>
                  귤이 자라는 소식을 받아 볼 수 있어요
                </T>
              </View>
            </View>
            <FollowButton
              following={following}
              loading={busy}
              onPress={() => void toggleFollow()}
              // 세로 카드 안: 높이 52 유지, 팔로잉 면색이 카드 면색과 겹치지 않게 흰 바탕
              style={[
                { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
                following && { backgroundColor: tokens.color.background },
              ]}
            />
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 20,
            paddingTop: 16,
          }}
        >
          <Button
            label="주문 내역"
            variant="text"
            onPress={() => router.replace("/orders")}
            style={{ flex: 1, alignSelf: "center", alignItems: "center" }}
          />
          <Button
            label="홈으로"
            variant="text"
            onPress={() => router.replace("/")}
            style={{ flex: 1, alignSelf: "center", alignItems: "center" }}
          />
        </View>
      </Scroll>
      {toast.node}
    </Screen>
  );
}

function KV({
  k,
  v,
  children,
  bold,
  last,
}: {
  k: string;
  v?: string;
  children?: ReactNode;
  bold?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        minHeight: 48,
        borderTopWidth: 1,
        borderTopColor: tokens.color.border,
        borderBottomWidth: last ? 1 : 0,
        borderBottomColor: tokens.color.border,
      }}
    >
      <T variant="body" muted>
        {k}
      </T>
      {children ?? (
        <T
          variant="body"
          weight={bold ? "bold" : "regular"}
          style={{ flexShrink: 1, textAlign: "right" }}
        >
          {v}
        </T>
      )}
    </View>
  );
}
