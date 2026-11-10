import { allPages, messaging } from "@farmclub/api";
import {
  aiCheckBanner,
  AiCheckChip,
  AI_CHECK_COLOR,
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
  Icon,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { HelpButton } from "../../../lib/Tour";
import { useSession } from "../../../lib/session";
import { GlobalAiButton } from "../../../lib/GlobalAiButton";
import OwnNewsRoom from "../../../lib/OwnNewsRoom";

export default function Chats() {
  const router = useRouter();
  const { view, checks } = useLocalSearchParams<{ view?: string; checks?: string }>();
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
  // AI 답변 확인 요청(DEV-296, Figma 10:158): 맨 위 띠 '확인해 달라는 AI 답변 N개 · 먼저 보기'. 누르면 그 대화만
  const checkCount = chats.data?.reduce((n, c) => n + (c.aiCheckRequests ?? 0), 0) ?? 0;
  const banner = aiCheckBanner(checkCount);
  const onlyChecks = checks === "1" && checkCount > 0;
  const rows = onlyChecks ? chats.data?.filter((c) => (c.aiCheckRequests ?? 0) > 0) : chats.data;
  // 거른 채 마지막 확인 요청을 처리하면(건수가 있다가 0이 되면) 주소의 checks를 지워, 새 요청이 와도
  // 저절로 다시 걸러지지 않게 한다. 홈에서 막 들어와 예전 목록이 0인 순간에는 지우지 않는다
  const lastCount = useRef(checkCount);
  useEffect(() => {
    if (!chats.data) return;
    if (checks === "1" && lastCount.current > 0 && checkCount === 0) router.setParams({ checks: "" });
    lastCount.current = checkCount;
  }, [checks, checkCount, chats.data, router]);
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
          {banner ? (
            <Pressable
              testID="ai-check-banner"
              accessibilityRole="button"
              accessibilityLabel={`${banner}, ${onlyChecks ? "모든 대화 보기" : "먼저 보기"}`}
              onPress={() => router.setParams({ checks: onlyChecks ? "" : "1" })}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 48,
                paddingHorizontal: tokens.space.gutter,
                backgroundColor: AI_CHECK_COLOR.flag.background,
              }}
            >
              <Icon name="flag" size={16} strokeWidth={2} color={AI_CHECK_COLOR.flag.text} />
              <T variant="sub" weight="semibold" color={AI_CHECK_COLOR.flag.text} style={{ flex: 1 }}>
                {banner}
              </T>
              <T variant="sub" weight="semibold" color={AI_CHECK_COLOR.flag.text}>
                {onlyChecks ? "모두 보기" : "먼저 보기"}
              </T>
            </Pressable>
          ) : null}
          {chats.error ? (
            <View style={{ padding: 20 }}>
              <T color={tokens.color.error}>{chats.error}</T>
              <Button label="다시 시도" variant="text" onPress={chats.retry} />
            </View>
          ) : null}
          {chats.loading ? (
            <Skeleton height={88} width="90%" style={{ margin: 20 }} />
          ) : null}
          {rows?.map((chat) => (
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
              tag={chat.aiCheckRequests ? <AiCheckChip label={{ text: "AI 답변 확인", tone: "flag" }} /> : undefined}
              tagLabel={chat.aiCheckRequests ? `AI 답변 확인 ${chat.aiCheckRequests}개` : undefined}
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
