import { farms, messaging, newIdempotencyKey } from "@farmclub/api";
import { Button, ConversationHeader, NewsRoom, Screen, T } from "@farmclub/ui";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useSession, useHideTabBar } from "../../../lib/session";
export default function Room() {
  const { farmId, from } = useLocalSearchParams<{
    farmId: string;
    from?: string;
  }>();
  const router = useRouter();
  const { user, ready } = useSession();
  const [active, setActive] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useHideTabBar();
  const [title, setTitle] = useState("소식방");
  const [photo, setPhoto] = useState<string | null>(null);
  const here =
    "/news/" + farmId + "?from=" + (from === "chats" ? "chats" : "farm");
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      setRevision((n) => n + 1);
      return () => setActive(false);
    }, []),
  );
  const login = () =>
    router.push({ pathname: "/login", params: { next: here } });
  const load = useCallback(
    async (cursor?: string) => {
      const p = await messaging.roomMessages(farmId, {
        limit: 50,
        ...(cursor ? { cursor } : {}),
      });
      setTitle(p.room.farmName);
      setPhoto(p.room.farmPhoto);
      return p;
    },
    [farmId, user?.userId],
  );
  async function join() {
    if (!user) {
      login();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await farms.follow(farmId);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "팔로우하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <ConversationHeader
        name={title}
        photo={photo}
        subtitle="소식방"
        onProfile={() =>
          router.push({ pathname: "/farms/[farmId]", params: { farmId } })
        }
        onBack={() =>
          from === "chats"
            ? router.navigate("/chats?view=news")
            : router.navigate({
                pathname: "/farms/[farmId]",
                params: { farmId },
              })
        }
        right={
          <Button
            label="1:1 채팅"
            variant="text"
            onPress={() =>
              user
                ? router.push({
                    pathname: "/chats/[farmId]",
                    params: { farmId, start: "1" },
                  })
                : router.push({
                    pathname: "/login",
                    params: { next: "/chats/" + farmId + "?start=1" },
                  })
            }
          />
        }
      />
      {error ? <T color="#B91C1C">{error}</T> : null}
      {ready ? (
        <NewsRoom
          key={farmId + ":" + (user?.userId ?? "public") + ":" + revision}
          userId={user?.userId ?? ""}
          active={active}
          load={load}
          makeKey={newIdempotencyKey}
          send={(text, key) => messaging.sendRoom(farmId, text, key)}
          react={(id, liked) =>
            liked ? messaging.unreact(id) : messaging.react(id)
          }
          onLogin={login}
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
