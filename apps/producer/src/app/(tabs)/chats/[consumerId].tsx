import {
  messaging,
  newIdempotencyKey,
  privateImage,
  uploadAttachment,
  SUPPORT_ID,
  type ChatPage,
} from "@farmclub/api";
import {
  Button,
  ChatThread,
  ConversationHeader,
  Screen,
  T,
  tokens,
  SupportAvatar,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { GlobalAiButton } from "../../../lib/GlobalAiButton";
import { View } from "react-native";
import { ORDER_STATUS } from "../../../lib/views";
import { useHideTabBar } from "../../../lib/session";
export default function Chat() {
  useHideTabBar();
  const { consumerId, name } = useLocalSearchParams<{
      consumerId: string;
      name?: string;
    }>(),
    router = useRouter();
  // farmclub 문의 대화방(DEV-111): AI 응대 바 대신 문의 안내를 보인다
  const support = consumerId === SUPPORT_ID;
  const [page, setPage] = useState<ChatPage | null>(null),
    [active, setActive] = useState(false),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(
    async (cursor?: string) => {
      const p = await messaging.producerMessages(consumerId, { cursor });
      if (!cursor) setPage(p);
      return p;
    },
    [consumerId],
  );
  // 머리 이름은 대화 응답의 가림 이름(서버 값 그대로). 첫 응답 전에는 목록에서 넘긴 param(DEV-232)
  const consumerName = page?.consumerName ?? name;
  return (
    <Screen>
      <ConversationHeader
        name={support ? "farmclub" : (consumerName ?? "소비자")}
        subtitle={support ? "운영팀 문의" : "1:1 채팅"}
        avatar={support ? <SupportAvatar size={40} /> : undefined}
        onBack={() => router.navigate("/chats?view=private")}
      />
      {support ? (
        <View
          testID="support-intro"
          style={{
            padding: 12,
            gap: 4,
            borderBottomWidth: 1,
            borderBottomColor: tokens.color.border,
          }}
        >
          <T weight="semibold">farmclub 운영팀에 물어보세요</T>
          <T variant="caption" muted>
            앱 사용법, 정산, 상품 등록처럼 궁금한 점을 아래에 적어 보내면
            운영팀이 확인하고 답해 드려요. 이 대화방은 AI가 답하지 않아요.
          </T>
        </View>
      ) : (
        <View style={{ padding: 12, gap: 8 }}>
          <GlobalAiButton until={page?.thread.humanReplyUntil} serverNow={page?.thread.serverNow} />
          {error ? <T color={tokens.color.error}>{error}</T> : null}
        </View>
      )}
      <ChatThread
        key={consumerId}
        producer
        replies={!support}
        active={active}
        load={load}
        makeKey={newIdempotencyKey}
        read={(id) => messaging.producerRead(consumerId, id)}
        loadPhoto={privateImage}
        upload={(f) => uploadAttachment(f, { threadId: page?.thread.threadId })}
        send={async (text, ids, key, replyToMessageId) => {
          const r = await messaging.producerSend(
            consumerId,
            text,
            ids,
            [],
            key,
            replyToMessageId,
          );
          await load();
          return r;
        }}
      >
        {page?.orders.length ? (
          <View
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: "white",
              gap: 8,
            }}
          >
            <T weight="bold">연결 주문</T>
            {page.orders.map((o) => (
              <T key={o.orderId} variant="sub">
                {o.productName} · {o.optionLabel} × {o.quantity} ·{" "}
                {ORDER_STATUS[o.status]}
              </T>
            ))}
          </View>
        ) : null}
        {page?.inquiries.map((i) => (
          <View
            key={i.inquiryId}
            style={{
              padding: 16,
              borderRadius: 18,
              backgroundColor: "white",
              gap: 8,
            }}
          >
            <T weight="semibold">
              주문 문의 · {i.status === "OPEN" ? "답변 필요" : "처리 완료"}
            </T>
            <T variant="sub">{i.text}</T>
            <T variant="caption" muted>
              처리 표시는 환불·보상 승인이 아니에요.
            </T>
            <Button
              label={i.status === "OPEN" ? "문의 처리 완료" : "문의 다시 열기"}
              variant="outline"
              onPress={async () => {
                try {
                  await messaging.inquiryStatus(
                    i.inquiryId,
                    i.status === "OPEN" ? "RESOLVED" : "OPEN",
                    i.version,
                  );
                  await load();
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          </View>
        ))}
      </ChatThread>
    </Screen>
  );
}
