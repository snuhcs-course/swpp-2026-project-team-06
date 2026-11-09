import {
  farms,
  messaging,
  newIdempotencyKey,
  productPrices,
} from "@farmclub/api";
import {
  Button,
  ConversationHeader,
  EmptyState,
  HeaderBar,
  Icon,
  NewsRoom,
  RoomShelf,
  Screen,
  T,
  focusRing,
  useAsync,
  tokens,
} from "@farmclub/ui";
import { Pressable } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, useHideTabBar } from "./session";
import { useToast } from "./toast";
import { LoadError, copyText, isStatus } from "./views";
import { goBackOr } from "./nav";

/** Canonical farm URLs and the existing news URL share one room, not a redirect loop. */
export default function FarmRoom() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const router = useRouter();
  const { user, ready, requireLogin, resume, clearResume } = useSession();
  const [active, setActive] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 팔로우를 끊었지만 내 답장이 남은 방(NewsRoom이 알려 줌): 헤더 ‘팔로우’를 테두리로 낮춘다(DEV-230)
  const [lapsed, setLapsed] = useState(false);
  const toast = useToast(88);
  const identity = `${farmId}:${user?.userId ?? "public"}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const alive = useRef(true);
  useEffect(() => {
    setBusy(false);
    setError("");
    setLapsed(false);
  }, [identity]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const farm = useAsync(() => farms.get(farmId), [farmId, user?.userId]);
  // 없는 농가·승인 취소된 농가 링크(404) → 안내와 농가 목록(ia.md 5장, DEV-224 d1)
  // 다시 불러오는 동안 error가 비어도 안내 화면을 유지한다(같은 farmId에서 404를 본 뒤)
  const [goneId, setGoneId] = useState<string | null>(null);
  useEffect(() => {
    if (farm.error && isStatus(farm.error, 404)) setGoneId(farmId);
    else if (farm.data) setGoneId(null);
  }, [farm.error, farm.data, farmId]);
  const notFound = goneId === farmId;
  useHideTabBar(!notFound);
  const products = useAsync(
    () => productPrices(farm.data?.products ?? []),
    [farm.data?.products],
  );
  const here = `/farms/${farmId}`;
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      void farm.reload();
      return () => setActive(false);
    }, [farm.reload, farmId, user?.userId]),
  );
  const load = useCallback(
    (cursor?: string) => messaging.roomMessages(farmId, { limit: 50, cursor }),
    [farmId, user?.userId],
  );
  const markRead = useCallback(
    (broadcastId: string) => messaging.readRoom(farmId, broadcastId),
    [farmId],
  );
  async function follow(target: boolean) {
    if (busy) return;
    const requestIdentity = identity;
    const valid = () =>
      alive.current && currentIdentity.current === requestIdentity;
    setBusy(true);
    setError("");
    try {
      const result = target
        ? await farms.follow(farmId)
        : await farms.unfollow(farmId);
      if (!valid()) return;
      farm.setData((p) =>
        p
          ? {
              ...p,
              isFollowing: result.following,
              followerCount: result.followerCount,
            }
          : p,
      );
      setRevision((n) => n + 1);
      // 확인 없이 끊고 되돌리기를 준다(FEAT-06 4, screens.md 토스트, DEV-230)
      if (!target)
        toast.act("팔로우를 끊었어요", "되돌리기", () => void follow(true));
    } catch (e) {
      if (valid())
        setError(e instanceof Error ? e.message : "팔로우를 변경하지 못했어요");
    } finally {
      if (valid()) setBusy(false);
    }
  }
  useEffect(() => {
    if (
      user &&
      resume?.next === here &&
      resume.action === "follow" &&
      farm.data &&
      !farm.loading
    ) {
      clearResume();
      if (!farm.data.isFollowing) void follow(true);
    }
  }, [user?.userId, resume, farm.data, farm.loading]);
  const join = () => requireLogin("follow", here, () => void follow(true));
  if (notFound) return <FarmNotFound />;
  return (
    <Screen>
      <ConversationHeader
        name={farm.data?.name ?? "소식방"}
        photo={farm.data?.photo}
        // 부제 '소식방' → '팔로워 N명'(DEV-295, Figma 7:78). 불러오기 전에는 비운다(M-11)
        subtitle={farm.data ? `팔로워 ${farm.data.followerCount}명` : undefined}
        onBack={() =>
          goBackOr(router, "/")
        }
        onProfile={() => router.push(`/farms/${farmId}/info`)}
        right={
          <FollowChip
            following={!!farm.data?.isFollowing}
            quiet={lapsed && !farm.data?.isFollowing}
            loading={busy || !farm.data}
            onPress={() =>
              requireLogin(
                "follow",
                here,
                () => void follow(!farm.data?.isFollowing),
              )
            }
          />
        }
      />
      {farm.error ? (
        <LoadError error={farm.error} onRetry={farm.reload} />
      ) : null}
      {error ? (
        <T color={tokens.color.error} style={{ padding: 12 }}>
          {error}
        </T>
      ) : null}
      {/* 판매 품목은 한 줄로 접힌 채 시작한다(DEV-295, Figma 7:78 · PM 승인) */}
      <RoomShelf
        key={farmId}
        products={products.data ?? farm.data?.products ?? []}
        onProduct={(id) => router.push(`/products/${id}`)}
      />
      {ready && farm.data ? (
        <NewsRoom
          key={`${farmId}:${user?.userId ?? "public"}:${revision}`}
          userId={user?.userId ?? ""}
          active={active}
          load={load}
          makeKey={newIdempotencyKey}
          edit={(id, text, version, key) => messaging.editRoomMessage(farmId, id, text, version, key)}
          send={(body, key) => messaging.sendRoom(farmId, body, key)}
          react={(id, liked) =>
            liked ? messaging.unreact(id) : messaging.react(id)
          }
          // 팔로워가 맨 아래에서 본 가장 최근 소식까지 읽음을 남긴다(DEV-297, 화면 변화 없음)
          markRead={markRead}
          onRefollow={join}
          onLapsedChange={setLapsed}
          copy={copyText}
          onLogin={() =>
            router.push({ pathname: "/login", params: { next: here } })
          }
          joinAction={
            <Button
              label={user ? "팔로우하고 답장하기" : "로그인하고 참여하기"}
              loading={busy}
              onPress={join}
            />
          }
        />
      ) : null}
      {toast.node}
    </Screen>
  );
}

/**
 * 머리의 작은 팔로우 칩(DEV-295, Figma 7:78: 높이 32 + 터치 48). 접근성 이름·끊기 동작은 FollowButton(D-01)과 같다.
 * 팔로잉은 면색 + 체크, 팔로우 전은 강조색, 팔로우를 끊은 예전 팔로워는 검정 테두리(DEV-230).
 */
function FollowChip({
  following,
  quiet,
  loading,
  onPress,
}: {
  following: boolean;
  quiet: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      aria-pressed={following}
      aria-busy={loading}
      accessibilityLabel={following ? "팔로잉, 누르면 팔로우를 끊어요" : "팔로우"}
      disabled={loading}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed, ...state }) => [
        {
          height: 32,
          paddingHorizontal: 12,
          marginRight: 8,
          borderRadius: tokens.radius.full,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
          opacity: pressed ? 0.7 : 1,
        },
        following
          ? { backgroundColor: tokens.color.surface }
          : quiet
            ? { borderWidth: 1, borderColor: tokens.color.text }
            : { backgroundColor: tokens.color.accent },
        (state as { focused?: boolean }).focused && focusRing,
      ]}
    >
      {following ? <Icon name="check" size={16} color={tokens.color.text} /> : null}
      <T
        variant="caption"
        weight="semibold"
        color={following || quiet ? tokens.color.text : tokens.color.onAccent}
      >
        {following ? "팔로잉" : "팔로우"}
      </T>
    </Pressable>
  );
}

/** 없는 농가 링크(SCR-03 404, 보드 `s-03-notfound`): 헤더는 뒤로만, 팔로우·‘소식방’ 자리값 없음. */
function FarmNotFound() {
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar onBack={() => goBackOr(router, "/")} />
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
