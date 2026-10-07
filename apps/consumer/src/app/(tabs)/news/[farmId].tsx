import { messaging, newIdempotencyKey } from "@farmclub/api";
import { Button, ConversationHeader, NewsRoom, Screen } from "@farmclub/ui";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useSession, useHideTabBar } from "../../../lib/session";
export default function Room() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const router = useRouter();
  const { user, ready } = useSession();
  const [active, setActive] = useState(false);
  useHideTabBar();
  const [title, setTitle] = useState("소식방");
  const [photo, setPhoto] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
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
    [farmId],
  );
  if (ready && !user)
    return (
      <Redirect
        href={{ pathname: "/login", params: { next: `/news/${farmId}` } }}
      />
    );
  return (
    <Screen>
      <ConversationHeader
        name={title}
        photo={photo}
        subtitle="소식방"
        onProfile={() => router.push(`/farms/${farmId}`)}
        onBack={() => router.navigate("/chats?view=news")}
        right={
          <Button
            label="1:1"
            accessibilityLabel="1:1 채팅하기"
            variant="text"
            onPress={() => router.push(`/chats/${farmId}?start=1`)}
          />
        }
      />
      {user ? (
        <NewsRoom
          key={farmId + user.userId}
          userId={user.userId}
          active={active}
          load={load}
          makeKey={newIdempotencyKey}
          send={(text, key) => messaging.sendRoom(farmId, text, key)}
          react={(id, liked) =>
            liked ? messaging.unreact(id) : messaging.react(id)
          }
        />
      ) : null}
    </Screen>
  );
}
