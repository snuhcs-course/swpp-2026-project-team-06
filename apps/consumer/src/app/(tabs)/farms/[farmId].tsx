import { DetailStory, Icon } from "@farmclub/ui";
// SCR-03 농가 페이지 (FEAT-02, 06, 12, 15, 19) — design: scr-03, s-03-news, s-03-notfound
import { farms, type FarmDetail } from "@farmclub/api";
import {
  Button,
  EmptyState,
  FollowButton,
  HeaderBar,
  IconButton,
  Photo,
  ProductRow,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  dday,
  md,
  period,
  safe,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useEffect, useState, useCallback } from "react";
import { View, Pressable } from "react-native";

import { useSession } from "../../../lib/session";
import { useToast } from "../../../lib/toast";
import { LoadError, PhotoShade, copyText, isStatus } from "../../../lib/views";

export default function FarmPage() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const router = useRouter();
  const { user, requireLogin, resume, clearResume } = useSession();
  const farm = useAsync(() => farms.get(farmId), [farmId, user?.userId]);
  useFocusEffect(
    useCallback(() => {
      void farm.reload();
    }, [farm.reload, farmId, user?.userId]),
  );
  const toast = useToast(tokens.height.tabBarClearance + 16);
  const [chatConfirm, setChatConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const f = farm.data;
  const here = `/farms/${farmId}`;

  // 팔로우 ↔ 팔로잉. 팔로잉을 다시 누르면 확인 없이 끊고 토스트(D-01)
  async function toggleFollow(target?: boolean) {
    if (!f) return;
    const on = target ?? !f.isFollowing;
    setBusy(true);
    try {
      const r = on ? await farms.follow(farmId) : await farms.unfollow(farmId);
      farm.setData((p) =>
        p
          ? { ...p, isFollowing: r.following, followerCount: r.followerCount }
          : p,
      );
      if (!on) toast.show("팔로우를 끊었어요");
    } catch (e) {
      toast.fail(e, () => void toggleFollow(on));
    } finally {
      setBusy(false);
    }
  }

  function chatNow(following: boolean) {
    if (following) router.push(`/chats/${farmId}`);
    else setChatConfirm(true);
  }

  // 로그인 뒤 돌아오면 누른 행동을 이어서 한다(결정 25, D-17). 로그인한 사용자 기준 값을 다시 읽은 뒤에 실행
  useEffect(() => {
    if (!user || !resume || resume.next !== here || !f || farm.loading) return;
    if (resume.action === "follow") {
      clearResume();
      if (!f.isFollowing) void toggleFollow(true);
    } else if (resume.action === "chat") {
      clearResume();
      chatNow(f.isFollowing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, resume, f, farm.loading]);

  function startChat() {
    requireLogin("chat", here, () => chatNow(!!f?.isFollowing));
  }

  if (farm.error && isStatus(farm.error, 404)) return <NotFound />;

  return (
    <Screen fullBleed={!!f}>
      {!f ? (
        farm.error ? (
          <>
            <HeaderBar onBack={() => router.back()} />
            <LoadError error={farm.error} onRetry={farm.reload} />
          </>
        ) : (
          <View>
            <Skeleton width="100%" height={220} radius={0} />
            <View style={{ padding: 20, gap: 12 }}>
              <Skeleton width="70%" height={22} />
              <Skeleton width="100%" height={52} radius={16} />
            </View>
          </View>
        )
      ) : (
        <Scroll bottom={tokens.height.tabBarClearance}>
          <View style={{ height: 220 }}>
            <Photo
              uri={f.photo}
              width="100%"
              height={220}
              radius={0}
              alt={`${f.name} 농부`}
              kind="farm"
            />
            <PhotoShade />
            <View
              style={{ position: "absolute", top: safe("top", 8), left: 8 }}
            >
              <IconButton
                icon="back"
                label="뒤로"
                onPhoto
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace("/")
                }
              />
            </View>
            <View
              style={{ position: "absolute", top: safe("top", 8), right: 8 }}
            >
              <IconButton
                icon="share"
                label="농가 링크 공유"
                onPhoto
                onPress={async () =>
                  (await copyText(f.shareUrl))
                    ? toast.show("링크를 복사했어요")
                    : toast.show(f.shareUrl)
                }
              />
            </View>
            <View
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                bottom: 24,
                gap: 8,
              }}
            >
              <T variant="title" color="#FFFFFF" accessibilityRole="header">
                {f.name}
              </T>
              <T variant="sub" color="rgba(255,255,255,0.88)">
                {f.region}
              </T>
            </View>
          </View>

          <View style={{ padding: 20, gap: 18 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <T variant="sub" muted style={{ flex: 1 }}>
                이 농가의 다음 이야기도 받아보세요
              </T>
              <FollowButton
                following={f.isFollowing}
                loading={busy}
                onPress={() =>
                  f.isFollowing
                    ? void toggleFollow(false)
                    : requireLogin(
                        "follow",
                        here,
                        () => void toggleFollow(true),
                      )
                }
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                borderRadius: 20,
                backgroundColor: tokens.color.surface,
                paddingVertical: 16,
              }}
            >
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <T variant="heading">{f.followerCount.toLocaleString()}</T>
                <T variant="caption" muted>
                  팔로워
                </T>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/news/${farmId}?from=farm`)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderLeftWidth: 1,
                  borderRightWidth: 1,
                  borderColor: tokens.color.border,
                }}
              >
                <Icon name="news" size={22} />
                <T variant="sub" weight="semibold">
                  소식방 입장
                </T>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={startChat}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Icon name="chat" size={22} />
                <T variant="sub" weight="semibold">
                  1:1 채팅
                </T>
              </Pressable>
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
            <T variant="heading" accessibilityRole="header">
              농가의 상품
            </T>
            <ProductsTab
              f={f}
              onOpen={(id) => router.push(`/products/${id}`)}
            />
          </View>
          <DetailStory
            content={f.detailContent}
            fallback={f.intro}
            title={f.name + " 이야기"}
          />
        </Scroll>
      )}
      {toast.node}
      <Sheet visible={chatConfirm} onClose={() => setChatConfirm(false)}>
        <T variant="heading">팔로우하고 대화를 시작해요</T>
        <T variant="body">
          채팅은 팔로우한 농가와만 할 수 있어요. {f?.name}을 팔로우하고 대화를
          시작할까요?
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="아니요"
            variant="secondary"
            onPress={() => setChatConfirm(false)}
            style={{ flex: 1 }}
          />
          <Button
            label="시작하기"
            onPress={() => {
              setChatConfirm(false);
              // 대화를 열면서 자동 팔로우(M-04, 결정 18)
              router.push(`/chats/${farmId}?start=1`);
            }}
            style={{ flex: 2 }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function ProductsTab({
  f,
  onOpen,
}: {
  f: FarmDetail;
  onOpen: (id: string) => void;
}) {
  if (f.products.length === 0)
    return <EmptyState icon="box" title="지금 판매 중인 상품이 없어요" />;
  return (
    <View style={{ marginTop: 4 }}>
      {f.products.map((p, i) => (
        <ProductRow
          key={p.productId}
          first={i === 0}
          photo={p.photo}
          name={p.name.split(" / ")[0]}
          sub={`${period(p.deliveryWindow.start, p.deliveryWindow.end)} 도착`}
          price={p.soldOut ? undefined : won(p.currentPrice)}
          chip={
            p.soldOut
              ? {
                  PAUSED: "판매 일시 중지",
                  ENDED: "예약 종료",
                  NOT_OPEN: "예약 시작 전",
                  TOTAL_SOLD_OUT: "전체 품절",
                  PERIOD_SOLD_OUT: "이번 기간 품절",
                  AVAILABLE: "예약 가능",
                }[p.availability]
              : dday(p.dDay)
          }
          chipNote={
            p.soldOut && p.nextStageStartsAt
              ? `다음 예약 ${md(p.nextStageStartsAt)}`
              : undefined
          }
          reserved={`${p.reservedCount}명 예약`}
          dim={p.soldOut}
          onPress={() => onOpen(p.productId)}
        />
      ))}
    </View>
  );
}

function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      />
      <EmptyState
        icon="home"
        title="찾을 수 없는 농가예요"
        body="링크가 바뀌었거나 지금은 활동하지 않는 농가예요."
        action={
          <Button
            label="농가 둘러보기"
            variant="outline"
            onPress={() => router.replace("/farms")}
            style={{ marginTop: 12, alignSelf: "center" }}
          />
        }
      />
    </Screen>
  );
}
