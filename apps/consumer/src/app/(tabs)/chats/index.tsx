import { allPages, messaging } from "@farmclub/api";
import {
  Button,
  ConversationRow,
  EmptyState,
  BrandHeader,
  ChatChoices,
  Screen,
  Scroll,
  Skeleton,
  SupportAvatar,
  T,
  tokens,
  useLiveList,
} from "@farmclub/ui";
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useSession } from "../../../lib/session";

export default function Chats() {
  const router = useRouter(),
    { view } = useLocalSearchParams<{ view?: string }>();
  const { user, ready } = useSession();
  const [active, setActive] = useState(false);
  const tab = view === "private" ? "private" : "news";
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const loadRooms = useCallback(
    (cancelled: () => boolean) =>
      allPages((cursor) => messaging.rooms({ limit: 50, cursor }), cancelled),
    [],
  );
  const loadChats = useCallback(
    (cancelled: () => boolean) =>
      allPages((cursor) => messaging.chats({ limit: 50, cursor }), cancelled),
    [],
  );
  const rooms = useLiveList(
    loadRooms,
    user?.userId ?? "",
    active && !!user && tab === "news",
  );
  const chats = useLiveList(
    loadChats,
    user?.userId ?? "",
    active && !!user && tab === "private",
  );
  if (ready && !user)
    return (
      <Redirect
        href={{ pathname: "/login", params: { next: `/chats?view=${tab}` } }}
      />
    );
  return (
    <Screen>
      <BrandHeader title="채팅" />
      <ChatChoices
        value={tab}
        onChange={(value) => router.setParams({ view: value })}
      />
      {(["news", "private"] as const).map((kind) => {
        const list = kind === "news" ? rooms : chats;
        // 1:1에는 farmclub 문의 대화방(DEV-150)이 늘 있어서, 농가 대화가 없을 때 빈 안내를 함께 보인다
        const empty =
          kind === "news"
            ? list.data?.length === 0
            : !!chats.data && !chats.data.some((c) => !c.isSupport);
        return (
          <View
            key={kind}
            style={{ flex: 1, display: kind === tab ? "flex" : "none" }}
          >
            <Scroll bottom={tokens.height.tabBarClearance}>
              {list.error ? (
                <View style={{ paddingHorizontal: 20 }}>
                  <T color={tokens.color.error}>{list.error}</T>
                  <Button
                    label="다시 시도"
                    variant="text"
                    onPress={list.retry}
                  />
                </View>
              ) : null}
              {list.loading ? (
                <View style={{ padding: 20, gap: 24 }}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} height={64} width="100%" />
                  ))}
                </View>
              ) : null}
              {kind === "news"
                ? rooms.data?.map((room) => (
                    <ConversationRow
                      key={room.farmId}
                      name={room.farmName}
                      photo={room.farmPhoto}
                      preview={room.lastMessage ?? "아직 소식이 없어요"}
                      at={room.lastAt}
                      onPress={() =>
                        router.push(`/news/${room.farmId}?from=chats`)
                      }
                    />
                  ))
                : chats.data?.map((chat) => (
                    <ConversationRow
                      key={chat.farmId}
                      testID={chat.isSupport ? "chat-row-farmclub" : undefined}
                      avatar={chat.isSupport ? <SupportAvatar /> : undefined}
                      status={
                        chat.isSupport
                          ? "farmclub 운영팀 · 궁금한 점을 물어보세요"
                          : undefined
                      }
                      name={chat.farmName}
                      photo={chat.farmPhoto}
                      preview={`${chat.lastSenderType === "CONSUMER" ? "나: " : ""}${chat.lastMessage}`}
                      at={chat.lastAt}
                      unread={chat.unreadCount}
                      onPress={() =>
                        router.push(
                          chat.isSupport
                            ? "/chats/support"
                            : `/chats/${chat.farmId}`,
                        )
                      }
                    />
                  ))}
              {/* 1:1은 farmclub 행 아래에 빈 안내를 둔다(SCR-15) */}
              {empty ? (
                <EmptyState
                  icon="chat"
                  title={
                    kind === "news"
                      ? "농가의 첫 소식을 기다려요"
                      : "아직 농가와 나눈 1:1 대화가 없어요"
                  }
                  body={
                    kind === "news"
                      ? "여러 농가를 팔로우하고 일상을 함께해요."
                      : "농가 페이지에서 궁금한 점을 물어보세요."
                  }
                  action={
                    <Button
                      label="농가 둘러보기"
                      variant="text"
                      onPress={() => router.push("/farms")}
                    />
                  }
                />
              ) : null}
            </Scroll>
          </View>
        );
      })}
    </Screen>
  );
}
