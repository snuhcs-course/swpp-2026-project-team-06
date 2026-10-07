import { messaging, newIdempotencyKey } from "@farmclub/api";
import { ConversationHeader, NewsRoom, Screen } from "@farmclub/ui";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useSession } from "../../lib/session";
export default function Room() {
  const router = useRouter(),
    [active, setActive] = useState(false);
  const { user, toast } = useSession();
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const [profile, setProfile] = useState<{
    farmName: string;
    farmPhoto: string | null;
  }>({ farmName: "우리 농가", farmPhoto: null });
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(
    async (cursor?: string) => {
      const page = await messaging.roomMessages(farmId, { limit: 50, cursor });
      setProfile(page.room);
      return page;
    },
    [farmId],
  );
  return (
    <Screen>
      <ConversationHeader
        name={profile.farmName}
        photo={profile.farmPhoto}
        subtitle="우리 농가 소식방"
        onBack={() => router.dismissTo("/chats?view=news")}
      />
      {user && farmId ? (
        <NewsRoom
          key={farmId + user.userId}
          userId={user.userId}
          producer
          onAttach={() => router.push("/broadcast/new")}
          active={active}
          load={load}
          makeKey={newIdempotencyKey}
          onPrivateReply={async (consumerId, replyId) => {
            try {
              await messaging.producerStart(consumerId, replyId);
              router.push({
                pathname: "/chats/[consumerId]",
                params: { consumerId },
              });
            } catch (e) {
              toast(e instanceof Error ? e.message : "대화를 열지 못했어요");
            }
          }}
          send={(text, key) => messaging.sendRoom(farmId, text, key)}
          react={(id, liked) =>
            liked ? messaging.unreact(id) : messaging.react(id)
          }
        />
      ) : null}
    </Screen>
  );
}
