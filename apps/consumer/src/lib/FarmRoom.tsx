import {
  farms,
  messaging,
  newIdempotencyKey,
  productPrices,
} from "@farmclub/api";
import {
  Button,
  ConversationHeader,
  NewsRoom,
  ProductShelf,
  Screen,
  T,
  useAsync,
  tokens,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, useHideTabBar } from "./session";
import { LoadError } from "./views";

/** Canonical farm URLs and the existing news URL share one room, not a redirect loop. */
export default function FarmRoom() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const router = useRouter();
  const { user, ready, requireLogin, resume, clearResume } = useSession();
  const [active, setActive] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const identity = `${farmId}:${user?.userId ?? "public"}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const alive = useRef(true);
  useEffect(() => {
    setBusy(false);
    setError("");
  }, [identity]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useHideTabBar();
  const farm = useAsync(() => farms.get(farmId), [farmId, user?.userId]);
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
  return (
    <Screen>
      <ConversationHeader
        height={96}
        name={farm.data?.name ?? "소식방"}
        photo={farm.data?.photo}
        subtitle="소식방"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
        onProfile={() => router.push(`/farms/${farmId}/info`)}
        right={
          <Button
            label={farm.data?.isFollowing ? "팔로잉" : "팔로우"}
            variant={farm.data?.isFollowing ? "secondary" : "primary"}
            loading={busy}
            disabled={!farm.data}
            style={{ width: 88, paddingHorizontal: 8 }}
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
      <ProductShelf
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
          send={(body, key) => messaging.sendRoom(farmId, body, key)}
          react={(id, liked) =>
            liked ? messaging.unreact(id) : messaging.react(id)
          }
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
    </Screen>
  );
}
