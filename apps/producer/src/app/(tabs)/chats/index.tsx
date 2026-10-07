import { allPages, messaging } from "@farmclub/api";
import {
  Button,
  ConversationRow,
  EmptyState,
  LargeTitle,
  Screen,
  Scroll,
  Segmented,
  Skeleton,
  T,
  tokens,
  useLiveList,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useSession } from "../../../lib/session";
export default function Chats() {
  const router = useRouter(),
    { view, needsReply } = useLocalSearchParams<{
      view?: string;
      needsReply?: string;
    }>();
  const { user } = useSession();
  const tab = view === "news" ? "news" : "private",
    only = needsReply === "1";
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const loadChats = useCallback(
    (cancelled: () => boolean) =>
      allPages(
        (cursor) =>
          messaging.producerChats({ needsReply: only, limit: 50, cursor }),
        cancelled,
      ),
    [only],
  );
  const loadRooms = useCallback(
    (cancelled: () => boolean) =>
      allPages((cursor) => messaging.rooms({ limit: 50, cursor }), cancelled),
    [],
  );
  const chats = useLiveList(
    loadChats,
    `${user?.userId}:${only}`,
    active && !!user && tab === "private",
  );
  const rooms = useLiveList(
    loadRooms,
    user?.userId ?? "",
    active && !!user && tab === "news",
  );
  return (
    <Screen>
      <LargeTitle
        title="채팅"
        subtitle="단골과 이야기하고 농가의 일상을 전해요"
      />
      <View style={{ padding: 20 }}>
        <Segmented
          value={tab}
          onChange={(value) => router.setParams({ view: value })}
          options={[
            { value: "news", label: "소식방" },
            { value: "private", label: "1:1 채팅" },
          ]}
        />
      </View>
      {(["news", "private"] as const).map((kind) => {
        const list = kind === "news" ? rooms : chats;
        return (
          <View
            key={kind}
            style={{ flex: 1, display: kind === tab ? "flex" : "none" }}
          >
            <Scroll bottom={tokens.height.tabBarClearance}>
              {kind === "private" ? (
                <View
                  style={{
                    paddingHorizontal: 20,
                    paddingBottom: 8,
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  {[false, true].map((value) => (
                    <Button
                      key={String(value)}
                      label={value ? "답변 필요" : "전체 대화"}
                      variant={only === value ? "secondary" : "text"}
                      onPress={() =>
                        router.setParams({ needsReply: value ? "1" : "0" })
                      }
                    />
                  ))}
                </View>
              ) : (
                <T
                  variant="sub"
                  muted
                  style={{ paddingHorizontal: 20, paddingBottom: 8 }}
                >
                  소식은 모든 팔로워에게, 답장은 농가에게만 보여요.
                </T>
              )}
              {list.error ? (
                <View style={{ padding: 20 }}>
                  <T color={tokens.color.error}>{list.error}</T>
                  <Button
                    label="다시 시도"
                    variant="text"
                    onPress={list.retry}
                  />
                </View>
              ) : null}
              {list.loading ? (
                <Skeleton height={88} width="90%" style={{ margin: 20 }} />
              ) : null}
              {kind === "news"
                ? rooms.data?.map((room) => (
                    <ConversationRow
                      key={room.farmId}
                      name={room.farmName}
                      photo={room.farmPhoto}
                      status="우리 농가 소식방"
                      preview={room.lastMessage ?? "첫 소식을 전해보세요"}
                      at={room.lastAt}
                      onPress={() => router.push(`/news/${room.farmId}`)}
                    />
                  ))
                : chats.data?.map((chat) => (
                    <ConversationRow
                      key={chat.threadId}
                      name={chat.consumerName}
                      preview={chat.lastMessage || "대화를 시작해 보세요"}
                      at={chat.lastAt}
                      unread={chat.unreadCount}
                      status={
                        chat.needsReply
                          ? "답변 필요"
                          : chat.aiMode === "HUMAN"
                            ? "직접 응대"
                            : "AI 안내"
                      }
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
              {list.data?.length === 0 ? (
                <EmptyState
                  icon="chat"
                  title={
                    kind === "news"
                      ? "소식방을 불러오지 못했어요"
                      : only
                        ? "답변할 대화가 없어요"
                        : "아직 1:1 대화가 없어요"
                  }
                  body="소비자의 질문과 주문 문의가 이곳에 모여요."
                />
              ) : null}
            </Scroll>
          </View>
        );
      })}
    </Screen>
  );
}
