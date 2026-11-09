import { allPages, messaging } from "@farmclub/api";
import {
  BrandHeader,
  Button,
  ChatTabs,
  ConversationRow,
  EmptyState,
  Screen,
  Scroll,
  Skeleton,
  T,
  tokens,
  safe,
  useLiveList,
  SupportAvatar,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { HelpButton } from "../../../lib/Tour";
import { useSession } from "../../../lib/session";
import { GlobalAiButton } from "../../../lib/GlobalAiButton";
import OwnNewsRoom from "../../../lib/OwnNewsRoom";

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
  // ‘1:1 채팅 N’ 건수를 소식방 탭에서도 보이려고 1:1 목록은 늘 읽는다. 소식방 탭에서는 10초마다만(DEV-295)
  const chats = useLiveList(
    load,
    user?.userId ?? "",
    active && !!user,
    tab === "private" ? 2000 : 10000,
  );
  const unread = chats.data?.reduce((n, c) => n + c.unreadCount, 0) ?? 0;
  // farmclub 문의 대화방(DEV-111)을 뺀 첫 소비자 대화
  const firstConsumer = chats.data?.find((c) => !c.isSupport)?.threadId;
  return (
    <Screen style={{ paddingBottom: safe("bottom", tokens.height.tabBar) }}>
      <BrandHeader logo="icon" title="채팅" right={<View style={{ flexDirection: "row", alignItems: "center" }}>{tab === "private" && user ? <GlobalAiButton /> : null}<HelpButton /></View>} />
      {/* 밑줄 탭 + 건수(DEV-295, Figma 7:90) */}
      <ChatTabs
        value={tab}
        onChange={(value) => router.setParams({ view: value })}
        tabs={[
          { key: "news", label: "내 소식방", testID: "chat-choice-news" },
          { key: "private", label: "1:1 채팅", count: unread, testID: "chat-choice-private" },
        ]}
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
              // 사진만 보낸 메시지는 본문이 비어 있다 → 사진 표시(DEV-295). ‘나:’는 마지막 보낸 사람이 API에 없어 후속(DEV-297)
              media={chat.lastMessage === "" ? "사진" : undefined}
              preview={chat.lastMessage || (chat.lastMessage === "" ? "" : "대화를 시작해 보세요")}
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
              title="아직 소비자와 나눈 1:1 대화가 없어요"
              body="소비자의 질문과 주문 문의가 이곳에 모여요."
            />
          ) : null}
        </Scroll>
      </View>
    </Screen>
  );
}
