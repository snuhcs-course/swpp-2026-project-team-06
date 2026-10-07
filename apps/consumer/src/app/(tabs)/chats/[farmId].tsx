import {
  farms,
  messaging,
  newIdempotencyKey,
  privateImage,
  uploadAttachment,
  isMock,
  type ChatPage,
} from "@farmclub/api";
import {
  ChatThread,
  ConversationHeader,
  Screen,
  T,
  useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useHideTabBar } from "../../../lib/session";
export default function Chat() {
  useHideTabBar();
  const { farmId, start, orderId } = useLocalSearchParams<{
      farmId: string;
      start?: string;
      orderId?: string;
    }>(),
    router = useRouter(),
    farm = useAsync(() => farms.get(farmId), [farmId]);
  const [active, setActive] = useState(false),
    [ready, setReady] = useState(start !== "1"),
    [error, setError] = useState(""),
    [page, setPage] = useState<ChatPage | null>(null),
    startKey = useRef(newIdempotencyKey());
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  useEffect(() => {
    if (start !== "1") return;
    let alive = true;
    messaging
      .startChat(farmId, startKey.current)
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [farmId, start]);
  const load = useCallback(
    async (cursor?: string) => {
      const p = await messaging.messages(farmId, { cursor });
      if (!cursor) setPage(p);
      return p;
    },
    [farmId],
  );
  return (
    <Screen>
      <ConversationHeader
        name={farm.data?.name ?? "농가"}
        photo={farm.data?.photo}
        subtitle="1:1 채팅"
        onProfile={() => router.push(`/farms/${farmId}`)}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace("/chats?view=private")
        }
      />
      <View style={{ padding: 12 }}>
        <T variant="caption" muted>
          {page?.thread.aiMode === "HUMAN"
            ? "농가가 직접 답변하는 대화예요."
            : "등록된 정보는 AI가 안내하고, 확인이 필요한 질문은 농가에 전달해요."}
          {isMock ? " · Mock AI 안내" : ""}
        </T>
        {error ? <T>{error}</T> : null}
      </View>
      {ready ? (
        <ChatThread
          key={farmId}
          active={active}
          load={load}
          read={(id) => messaging.read(farmId, id)}
          makeKey={newIdempotencyKey}
          loadPhoto={privateImage}
          upload={(f) =>
            uploadAttachment(f, { threadId: page?.thread.threadId })
          }
          send={(text, ids, key) =>
            messaging.send(
              farmId,
              text,
              ids,
              orderId ?? page?.inquiries[0]?.orderId,
              key,
            )
          }
        />
      ) : (
        <T muted>대화를 여는 중…</T>
      )}
    </Screen>
  );
}
