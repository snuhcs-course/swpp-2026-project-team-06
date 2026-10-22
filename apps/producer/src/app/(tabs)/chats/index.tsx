import { allPages, messaging } from "@farmclub/api";
import {
  BrandHeader,
  Button,
  ChatChoices,
  ConversationRow,
  EmptyState,
  Screen,
  Scroll,
  Skeleton,
  T,
  tokens,
  safe,
  useLiveList,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { HelpButton } from "../../../lib/Tour";
import { useSession } from "../../../lib/session";
import OwnNewsRoom from "../../../lib/OwnNewsRoom";
import { SupportAvatar } from "../../../lib/views";

export default function Chats() {
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const { user } = useSession();
  const tab = view === "private" ? "private" : "news";
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(
    (cancelled: () => boolean) =>
      allPages(
        (cursor) => messaging.producerChats({ limit: 50, cursor }),
        cancelled,
      ),
    [],
  );
  const chats = useLiveList(
    load,
    user?.userId ?? "",
    active && !!user && tab === "private",
  );
  // farmclub 문의 대화방(DEV-111)을 뺀 첫 소비자 대화
  const firstConsumer = chats.data?.find((c) => !c.isSupport)?.threadId;
  return (
    <Screen style={{ paddingBottom: safe("bottom", tokens.height.tabBar) }}>
      <BrandHeader title="채팅" right={<HelpButton />} />
      <ChatChoices
        value={tab}
        onChange={(value) => router.setParams({ view: value })}
      />
      <View
        style={{
          flex: 1,
          minHeight: 0,
          display: tab === "news" ? "flex" : "none",
        }}
      >
        <OwnNewsRoom active={active && tab === "news"} />
      </View>
      <View style={{ flex: 1, display: tab === "private" ? "flex" : "none" }}>
        <Scroll bottom={20}>
          {chats.error ? (
            <View style={{ padding: 20 }}>
              <T color={tokens.color.error}>{chats.error}</T>
              <Button label="다시 시도" variant="text" onPress={chats.retry} />
            </View>
          ) : null}
          {chats.loading ? (
            <Skeleton height={88} width="90%" style={{ margin: 20 }} />
          ) : null}
          {chats.data?.map((chat) => (
            <ConversationRow
              key={chat.threadId}
              testID={
                chat.isSupport
                  ? "chat-row-farmclub"
                  : chat.threadId === firstConsumer
                    ? "chat-row-first"
                    : undefined
              }
              avatar={chat.isSupport ? <SupportAvatar /> : undefined}
              status={
                chat.isSupport
                  ? "farmclub 운영팀 · 궁금한 점을 물어보세요"
                  : undefined
              }
              name={chat.consumerName}
              preview={chat.lastMessage || "대화를 시작해 보세요"}
              at={chat.lastAt}
              unread={chat.unreadCount}
              onPress={() =>
                router.push({
                  pathname: "/chats/[consumerId]",
                  params: {
                    consumerId: chat.consumerId,
                    name: chat.consumerName,
                  },
                })
              }
            />
          ))}
          {chats.data && !firstConsumer ? (
            <EmptyState
              icon="chat"
              title="아직 손님과 나눈 1:1 대화가 없어요"
              body="소비자의 질문과 주문 문의가 이곳에 모여요."
            />
          ) : null}
        </Scroll>
      </View>
    </Screen>
  );
}
